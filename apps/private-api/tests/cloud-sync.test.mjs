import test from 'node:test'
import assert from 'node:assert/strict'
import { fixture } from './backend.test.mjs'
import { AuthService } from '../../wechat/src/services/auth-service.ts'
import { CloudJournalCoordinator, CloudSyncError } from '../../../packages/sync/private-cloud.ts'

let serial=0
const mutation=()=> 'pr08-mutation-'+(++serial)
const drink=(name='尼格罗尼',visitSessionId=null)=>({
  drinkLabel:name,consumedAt:'2026-10-17T20:30:00Z',contextKind:'bar',
  visitSessionId,personalRating:4,note:'私人记录'})
const visit=()=>({occurredAt:'2026-10-17T20:30:00Z',placeLabel:'独立探店'})

function device(host,code,disk=new Map()) {
  let online=true, timeoutOne=false, block=null, calls=0, i=0
  const transport={
    async exchange(value){const x=await host.call('POST','/v1/auth/wechat/exchange',{code:value})
      if(x.status!==200)throw Error('exchange');return x.body},
    async me(t){const x=await host.call('GET','/v1/me',undefined,t)
      if(x.status!==200)throw Error('me');return x.body},
    async refresh(r){const x=await host.call('POST','/v1/auth/refresh',{refreshToken:r})
      if(x.status!==200)throw Error('refresh');return x.body},
    async logout(a,r){await host.call('POST','/v1/auth/logout',{refreshToken:r},a)}
  }
  const auth=new AuthService({enabled:true,wechatLogin:async()=>code,transport,now:()=>{
    // Fake time matches the backend fixture's simulated server clock, fixed unless explicitly moved.
    return clock.value
  }})
  const clock={value:Date.parse('2026-10-18T00:00:00.000Z')}
  const send=async(method,route,payload)=>{
    const cred=auth.credentialForPrivateApi()
    if(!cred)throw new CloudSyncError('AUTH_REQUIRED','身份失效')
    if(!online)throw new CloudSyncError('NETWORK','离线')
    calls++
    const res=await host.call(method,route,payload,cred.accessToken)
    if(block){const next=block;block=null;await next}
    if(timeoutOne){timeoutOne=false;throw new CloudSyncError('NETWORK','服务器成功但回包丢失')}
    const latest=auth.credentialForPrivateApi()
    if(!latest || latest.userId!==cred.userId)
      throw new CloudSyncError('AUTH_REQUIRED','账户变更')
    if(res.status===409)throw new CloudSyncError('CONFLICT','服务器冲突')
    if(res.status===401 || res.status===403){
      auth.invalidatePrivateApi();throw new CloudSyncError('AUTH_REQUIRED','会话失效')}
    if(res.status>=400)throw new CloudSyncError('NETWORK','HTTP失败')
    return res.body
  }
  const list=async(kind,cursor)=>{
    const q=new URLSearchParams({limit:'40'})
    if(cursor){q.set('before',cursor.before);q.set('beforeId',cursor.beforeId)}
    const x=await send('GET','/v1/private/'+kind+'?'+q)
    return {records:kind==='drinks'?x.entries:x.visits,nextCursor:x.nextCursor}
  }
  const remote={
    listDrinks:c=>list('drinks',c),listVisits:c=>list('visits',c),
    getDrink:async id=>(await send('GET','/v1/private/drinks/'+id)).entry,
    getVisit:async id=>(await send('GET','/v1/private/visits/'+id)).visit,
    createDrink:async(x,m)=>(await send('POST','/v1/private/drinks',{...x,clientMutationId:m})).entry,
    createVisit:async(x,m)=>(await send('POST','/v1/private/visits',{...x,clientMutationId:m})).visit,
    updateDrink:async(id,changes,r)=>(await send('PATCH','/v1/private/drinks/'+id,
      {changes,expectedRevision:r})).entry,
    updateVisit:async(id,changes,r)=>(await send('PATCH','/v1/private/visits/'+id,
      {changes,expectedRevision:r})).visit,
    linkDrink:async(id,visitSessionId,r)=>(await send('PUT','/v1/private/drinks/'+id+'/visit',
      {visitSessionId,expectedRevision:r})).entry,
    deleteDrink:async(id,r)=>{await send('DELETE','/v1/private/drinks/'+id,{expectedRevision:r})},
    deleteVisit:async(id,r)=>{await send('DELETE','/v1/private/visits/'+id,{expectedRevision:r})}
  }
  const coordinator=new CloudJournalCoordinator({
    identity:{verifiedUserId:()=>auth.verifiedIdentity()?.userId||null},
    storage:{read:k=>disk.get(k),write:(k,v)=>disk.set(k,structuredClone(v))},
    remote,newId:()=> 'test-id-'+(++serial)+'-'+(++i),
    now:()=>new Date(clock.value).toISOString()
  })
  auth.subscribe(s=>{if(s.status!=='authenticated')coordinator.invalidate()})
  return {auth,coordinator,disk,login:()=>auth.signIn(),logout:()=>auth.signOut(),
    setOnline:x=>{online=x},timeout:()=>{timeoutOne=true},block:p=>{block=p},
    calls:()=>calls,clock,remote}
}

test('A device offline saves, server syncs once and second device restores same account',async()=>{
  const h=fixture(),a=device(h,'userA-sync1'),b=device(h,'userA-sync2')
  await a.login();await b.login()
  a.setOnline(false)
  const entry=a.coordinator.createDrink(drink(),mutation())
  assert.equal(a.coordinator.status('drink',entry.id),'pending')
  await a.coordinator.sync()
  assert.equal(a.coordinator.status('drink',entry.id),'failed')
  assert.equal(h.db.query('SELECT count(*) AS n FROM drink_entries')[0].n,0)
  a.setOnline(true);await a.coordinator.sync()
  assert.equal(h.db.query('SELECT count(*) AS n FROM drink_entries')[0].n,1)
  await a.coordinator.sync();await b.coordinator.sync()
  assert.equal(b.coordinator.localRepository().listDrinks().length,1)
  assert.equal(a.coordinator.getSnapshot().operations.length,0)
})
test('three independent drinks with offline visit ID are uploaded in dependency order and restored',async()=>{
  const h=fixture(),a=device(h,'userA-trip1'),b=device(h,'userA-trip2')
  await a.login();await b.login()
  const v=a.coordinator.createVisit(visit(),mutation())
  for(let i=0;i<3;i++)a.coordinator.createDrink(drink('第'+i+'杯',v.id),mutation())
  await a.coordinator.sync()
  assert.equal(h.db.query('SELECT count(*) AS n FROM drink_entries')[0].n,3)
  assert.equal(a.coordinator.getSnapshot().operations.length,0)
  const realVisit=a.coordinator.resolveId(v.id)
  assert.notEqual(realVisit,v.id)
  await b.coordinator.sync()
  assert.equal(b.coordinator.localRepository().listDrinksForVisit(realVisit).length,3)
  assert.equal(new Set(b.coordinator.localRepository().listDrinks().map(x=>x.id)).size,3)
})
test('drink recorded first can link a later offline visit and sync across devices',async()=>{
  const h=fixture(),a=device(h,'userA-order1'),b=device(h,'userA-order2')
  await a.login();await b.login()
  // The drink CREATE is deliberately earlier in the queue than the visit CREATE.
  const d=a.coordinator.createDrink(drink('先记的一杯'),mutation())
  const v=a.coordinator.createVisit(visit(),mutation())
  a.coordinator.linkDrink(d.id,v.id,d.revision)
  assert.equal(a.coordinator.getSnapshot().operations[0].kind,'drink')
  assert.equal(a.coordinator.getSnapshot().operations[1].kind,'visit')
  await a.coordinator.sync()
  assert.equal(a.coordinator.getSnapshot().operations.length,0)
  assert.equal(h.db.query('SELECT count(*) AS n FROM drink_entries')[0].n,1)
  await b.coordinator.sync()
  const visits=b.coordinator.localRepository().listVisits()
  const drinks=b.coordinator.localRepository().listDrinks()
  assert.equal(visits.length,1)
  assert.equal(drinks.length,1)
  assert.equal(drinks[0].visitSessionId,visits[0].id)
  assert.equal(drinks[0].drinkLabel,'先记的一杯')
})

test('timeout after server commit retries same clientMutationId without duplicate',async()=>{
  const h=fixture(),a=device(h,'userA-timeout')
  await a.login()
  const d=a.coordinator.createDrink(drink(),mutation())
  a.timeout();await a.coordinator.sync()
  assert.equal(a.coordinator.status('drink',d.id),'failed')
  assert.equal(h.db.query('SELECT count(*) AS n FROM drink_entries')[0].n,1)
  await a.coordinator.sync()
  assert.equal(h.db.query('SELECT count(*) AS n FROM drink_entries')[0].n,1)
  assert.equal(a.coordinator.getSnapshot().operations.length,0)
})
test('restart restores queue only after fresh verified login, never anonymous',async()=>{
  const h=fixture(),disk=new Map(),a=device(h,'userA-reboot1',disk)
  await a.login();a.coordinator.createVisit(visit(),mutation());a.coordinator.createDrink(drink(),mutation())
  const cold=device(h,'userA-reboot2',disk)
  assert.throws(()=>cold.coordinator.getSnapshot(),x=>x.code==='AUTH_REQUIRED')
  await cold.login()
  assert.equal(cold.coordinator.getSnapshot().operations.length,2)
  await cold.coordinator.sync()
  assert.equal(h.db.query('SELECT count(*) AS n FROM drink_entries')[0].n,1)
})
test('B session on same disk never reads or uploads A offline queue',async()=>{
  const h=fixture(),disk=new Map(),a=device(h,'userA-isolated',disk)
  await a.login();a.coordinator.createDrink(drink('私密 A'),mutation());await a.logout()
  const b=device(h,'userB-isolated',disk)
  await b.login();assert.equal(b.coordinator.getSnapshot().drinks.length,0)
  await b.coordinator.sync()
  assert.equal(h.db.query('SELECT count(*) AS n FROM drink_entries')[0].n,0)
  const again=device(h,'userA-return',disk);await again.login()
  assert.equal(again.coordinator.getSnapshot().operations.length,1)
  await again.coordinator.sync()
  assert.equal(h.db.query('SELECT count(*) AS n FROM drink_entries')[0].n,1)
})
test('logout during in-flight sync prevents writing results into new account',async()=>{
  const h=fixture(),a=device(h,'userA-inflight')
  await a.login();a.coordinator.createDrink(drink(),mutation())
  let finish;const latch=new Promise(r=>{finish=r})
  a.block(latch)
  const pending=a.coordinator.sync()
  await Promise.resolve()
  await a.logout()
  finish();await pending
  assert.throws(()=>a.coordinator.getSnapshot(),x=>x.code==='AUTH_REQUIRED')
})
test('revoked server session fails AuthService checkSession, prevents private API requests',async()=>{
  const h=fixture(),a=device(h,'userA-revoked')
  await a.login();a.coordinator.createDrink(drink(),mutation())
  const cred=a.auth.credentialForPrivateApi()
  const me=await h.call('GET','/v1/me',undefined,cred.accessToken)
  h.db.raw.prepare('UPDATE auth_sessions SET revoked_at=? WHERE id=?')
    .run('2026-10-18T00:01:00Z',me.body.session.id)
  await a.auth.checkSession()
  assert.equal(a.auth.getState().status,'expired')
  const calls=a.calls()
  await assert.rejects(a.coordinator.sync(),x=>x.code==='AUTH_REQUIRED')
  assert.equal(a.calls(),calls)
})
test('stale revision conflict retains local note and server version without overwriting',async()=>{
  const h=fixture(),a=device(h,'userA-conflict1'),b=device(h,'userA-conflict2')
  await a.login();await b.login()
  a.coordinator.createDrink(drink(),mutation());await a.coordinator.sync()
  await b.coordinator.sync()
  const x=a.coordinator.localRepository().listDrinks()[0]
  const y=b.coordinator.localRepository().listDrinks()[0]
  a.coordinator.updateDrink(x.id,{note:'A新内容'},x.revision);await a.coordinator.sync()
  b.coordinator.updateDrink(y.id,{note:'B未提交'},y.revision);await b.coordinator.sync()
  const op=b.coordinator.getSnapshot().operations[0]
  assert.equal(op.status,'conflict')
  assert.equal(b.coordinator.localRepository().listDrinks()[0].note,'B未提交')
  assert.equal(op.remote.note,'A新内容')
  assert.equal(h.db.query('SELECT note FROM drink_entries')[0].note,'A新内容')
  b.coordinator.conflictDecision(op.opId,'keep-local')
  assert.equal(b.coordinator.getSnapshot().operations.length,1)
  b.coordinator.conflictDecision(op.opId,'reload')
  assert.equal(b.coordinator.localRepository().listDrinks()[0].note,'A新内容')
})
test('deleting visit retains all three drinks and detaches on second device',async()=>{
  const h=fixture(),a=device(h,'userA-delete1'),b=device(h,'userA-delete2')
  await a.login();await b.login()
  const v=a.coordinator.createVisit(visit(),mutation())
  for(let i=0;i<3;i++)a.coordinator.createDrink(drink('单杯'+i,v.id),mutation())
  await a.coordinator.sync();await b.coordinator.sync()
  const remote=a.coordinator.localRepository().listVisits()[0]
  a.coordinator.deleteVisit(remote.id,remote.revision)
  await a.coordinator.sync();await b.coordinator.sync()
  assert.equal(b.coordinator.localRepository().listVisits().length,0)
  assert.equal(b.coordinator.localRepository().listDrinks().length,3)
  assert.ok(b.coordinator.localRepository().listDrinks().every(x=>x.visitSessionId===null))
})
test('105 equal-time drinks resume through three composite pages without loss',async()=>{
  const h=fixture(),a=device(h,'userA-pages1'),b=device(h,'userA-pages2')
  await a.login();await b.login()
  for(let i=0;i<105;i++)a.coordinator.createDrink(drink('批量'+i),mutation())
  await a.coordinator.sync()
  assert.equal(h.db.query('SELECT count(*) AS n FROM drink_entries')[0].n,105)
  await b.coordinator.sync()
  const rows=b.coordinator.localRepository().listDrinks()
  assert.equal(rows.length,105)
  assert.equal(new Set(rows.map(x=>x.id)).size,105)
})
test('offline link/edit/delete uses private expectedRevision, never posts to public sync',async()=>{
  const h=fixture(),a=device(h,'userA-editall')
  await a.login()
  const v=a.coordinator.createVisit(visit(),mutation())
  const d=a.coordinator.createDrink(drink(),mutation())
  a.coordinator.linkDrink(d.id,v.id,1)
  a.coordinator.updateDrink(d.id,{note:'更新内容'},2)
  await a.coordinator.sync()
  const remote=a.coordinator.localRepository().listDrinks()[0]
  assert.equal(remote.note,'更新内容')
  assert.ok(remote.visitSessionId)
  a.coordinator.deleteDrink(remote.id,remote.revision)
  await a.coordinator.sync()
  assert.equal(h.db.query('SELECT count(*) AS n FROM drink_entries')[0].n,0)
  assert.equal((await h.call('GET','/v1/sync')).status,404)
})


test('PR09 real SQLite/HTTP: server commits CREATE, durable local ACK fails, restart idempotently recovers',async()=>{
  const host=fixture()
  class UnreliableDisk extends Map {
    fail=false
    set(key,value){
      if(this.fail && value?.operations?.length===0 && value?.drinks?.length)
        throw Error('simulated local disk failure after remote HTTP success')
      return super.set(key,value)
    }
  }
  const disk=new UnreliableDisk(),a=device(host,'userA-disk-ack-lost',disk)
  await a.login()
  const original=a.coordinator.createDrink(drink('真实 SQL 离线幂等'),mutation())
  disk.fail=true
  await a.coordinator.sync()
  assert.equal(host.db.query('SELECT count(*) AS n FROM drink_entries')[0].n,1)
  assert.throws(()=>a.coordinator.getSnapshot(),e=>e.code==='STORAGE')
  disk.fail=false
  assert.equal(a.coordinator.recoverStorage().operations.length,1)
  await a.coordinator.sync()
  assert.equal(host.db.query('SELECT count(*) AS n FROM drink_entries')[0].n,1)
  assert.equal(a.coordinator.getSnapshot().operations.length,0)
  assert.notEqual(a.coordinator.resolveId(original.id),original.id)
})
test('PR09 real SQLite/HTTP: lost PATCH ACK uses GET reconciliation instead of second update',async()=>{
  const host=fixture()
  class UnreliableDisk extends Map {
    fail=false
    set(key,value){
      if(this.fail && value?.operations?.length===0 &&
          value?.drinks?.[0]?.revision===2)
        throw Error('simulated local disk failure after remote PATCH')
      return super.set(key,value)
    }
  }
  const disk=new UnreliableDisk(),a=device(host,'userA-patch-ack-lost',disk)
  await a.login()
  a.coordinator.createDrink(drink('跨设备保留事实'),mutation())
  await a.coordinator.sync()
  const item=a.coordinator.localRepository().listDrinks()[0]
  a.coordinator.updateDrink(item.id,{note:'服务端已成功修改'},item.revision)
  disk.fail=true
  await a.coordinator.sync()
  const fromSql=host.db.query('SELECT note,revision FROM drink_entries')[0]
  assert.equal(fromSql.note,'服务端已成功修改')
  assert.equal(fromSql.revision,2)
  disk.fail=false
  a.coordinator.recoverStorage()
  await a.coordinator.sync()
  const after=host.db.query('SELECT note,revision FROM drink_entries')[0]
  assert.equal(after.revision,2,'must not perform a second PATCH')
  assert.equal(a.coordinator.getSnapshot().operations.length,0)
})
