// PR-09: executable snapshot, ACK-loss, quota, corruption and session-lifecycle tests.
import test from 'node:test'
import assert from 'node:assert/strict'
import { CloudJournalCoordinator, CloudSyncError } from '../packages/sync/private-cloud.ts'
import { createRecoverableCloudStorage } from '../packages/sync/recoverable-cloud-storage.ts'
import { AuthService } from '../apps/wechat/src/services/auth-service.ts'

let nonce=0
const input=()=>({drinkLabel:'私人尼格罗尼',consumedAt:'2026-10-18T05:00:00Z',
  contextKind:'home',note:'仅个人可见'})
const visit=()=>({occurredAt:'2026-10-18T05:10:00Z',placeLabel:'午夜酒吧'})
const mut=()=> 'hardening-mutation-'+(++nonce)
const deep=v=>structuredClone(v)
function setup(disk=new Map()){
  let owner='server-verified-A', readFail=false, writeBlock=null
  const raw={
    read(key){if(readFail)throw Error('Injected storage read failure');return disk.get(key)},
    write(key,val){
      if(writeBlock?.(key,val))throw Error('Injected quota / storage failure')
      disk.set(key,deep(val))
    }
  }
  const storage=createRecoverableCloudStorage(raw)
  const backend={drinks:new Map(),visits:new Map(),mutations:new Map(),
    createCalls:0,updateCalls:0,linkCalls:0,deleteCalls:0}
  const timestamp='2026-10-18T05:00:00Z'
  function stamp(x,id,m){return {...x,id,ownerUserId:owner,visibility:'private',
    createdAt:timestamp,updatedAt:timestamp,revision:1,
    clientMutationId:m}}
  const remote={
    async createDrink(data,m){
      backend.createCalls++
      if(backend.mutations.has(m))return deep(backend.mutations.get(m))
      const row=stamp({cocktailId:null,recipeVariantId:null,visitSessionId:null,
        personalRating:null,photoRefs:[],contextDetails:{},note:null,...data},
      'server-drink-'+(++nonce),m)
      backend.mutations.set(m,row);backend.drinks.set(row.id,row);return deep(row)
    },
    async createVisit(data,m){
      if(backend.mutations.has(m))return deep(backend.mutations.get(m))
      const row=stamp({barId:null,placeLabel:null,note:null,...data},
        'server-visit-'+(++nonce),m)
      backend.mutations.set(m,row);backend.visits.set(row.id,row);return deep(row)
    },
    async getDrink(id){return deep(backend.drinks.get(id)||null)},
    async getVisit(id){return deep(backend.visits.get(id)||null)},
    async listDrinks(){return {records:deep([...backend.drinks.values()]),nextCursor:null}},
    async listVisits(){return {records:deep([...backend.visits.values()]),nextCursor:null}},
    async updateDrink(id,change,rev){
      backend.updateCalls++
      const row=backend.drinks.get(id)
      if(!row || row.revision!==rev)throw new CloudSyncError('CONFLICT','服务器版本变化')
      Object.assign(row,deep(change),{revision:row.revision+1})
      return deep(row)
    },
    async updateVisit(id,change,rev){
      const row=backend.visits.get(id)
      if(!row || row.revision!==rev)throw new CloudSyncError('CONFLICT','探店冲突')
      Object.assign(row,deep(change),{revision:row.revision+1})
      return deep(row)
    },
    async linkDrink(id,visitId,rev){
      backend.linkCalls++
      const row=backend.drinks.get(id)
      if(!row || row.revision!==rev)throw new CloudSyncError('CONFLICT','关联冲突')
      row.visitSessionId=visitId;row.revision++
      return deep(row)
    },
    async deleteDrink(id,rev){
      backend.deleteCalls++
      const row=backend.drinks.get(id)
      if(!row || row.revision!==rev)throw new CloudSyncError('CONFLICT','删除冲突')
      backend.drinks.delete(id)
    },
    async deleteVisit(id,rev){
      const row=backend.visits.get(id)
      if(!row || row.revision!==rev)throw new CloudSyncError('CONFLICT','删除冲突')
      backend.visits.delete(id)
      for(const d of backend.drinks.values())if(d.visitSessionId===id){
        d.visitSessionId=null;d.revision++
      }
    }
  }
  const coordinator=()=>new CloudJournalCoordinator({
    identity:{verifiedUserId:()=>owner},storage,remote,
    newId:()=>String(++nonce),now:()=>timestamp
  })
  return {coordinator,backend,disk,storage,raw,remote,
    setOwner:x=>{owner=x},setBlock:f=>{writeBlock=f},
    setReadFail:x=>{readFail=x}}
}
const mainKey='jiuji-private-cloud-v1:server-verified-A'
const backupKey=mainKey+':recovery'
test('two-slot verified write survives restart, leaves old favorites and drafts unchanged',()=>{
  const f=setup()
  f.disk.set('jiuji-personal-v1:history',['old visit'])
  f.disk.set('jiuji.react.favorites',[1,2])
  f.disk.set('jiuji.react.recipes',[{id:'recipe'}])
  f.disk.set('jiuji-personal-v1:drafts',['old draft'])
  const first=f.coordinator(),d=first.createDrink(input(),mut())
  const primary=f.disk.get(mainKey),backup=f.disk.get(backupKey)
  assert.deepEqual(primary,backup)
  assert.equal(primary.format,'jiuji-cloud-mirror-recovery-v1')
  const reboot=f.coordinator()
  assert.equal(reboot.getSnapshot().operations.length,1)
  assert.equal(reboot.localRepository().listDrinks()[0].id,d.id)
  assert.deepEqual(f.disk.get('jiuji-personal-v1:history'),['old visit'])
  assert.deepEqual(f.disk.get('jiuji.react.favorites'),[1,2])
  assert.deepEqual(f.disk.get('jiuji.react.recipes'),[{id:'recipe'}])
  assert.deepEqual(f.disk.get('jiuji-personal-v1:drafts'),['old draft'])
})
test('quota rejects first durable save, never reports local or cloud saved',async()=>{
  const f=setup(),cloud=f.coordinator()
  f.setBlock(()=>true)
  assert.throws(()=>cloud.createDrink(input(),mut()),e=>e.code==='STORAGE')
  assert.throws(()=>cloud.getSnapshot(),e=>e.code==='STORAGE')
  assert.equal(f.backend.drinks.size,0)
  assert.equal(f.disk.has(mainKey),false)
  f.setBlock(null)
  const restored=cloud.recoverStorage()
  assert.equal(restored.drinks.length,0)
  const d=cloud.createDrink(input(),mut())
  assert.equal(cloud.status('drink',d.id),'pending')
  await cloud.sync()
  assert.equal(f.backend.drinks.size,1)
})
test('main-slot failure after recovery-slot save can be recovered without losing a pending note',()=>{
  const f=setup(),cloud=f.coordinator()
  const original=cloud.createDrink(input(),mut())
  f.setBlock(key=>key===mainKey)
  assert.throws(()=>cloud.updateDrink(original.id,{note:'重要离线更正'},1),
    e=>e.code==='STORAGE')
  f.setBlock(null)
  const latest=f.coordinator().getSnapshot()
  assert.equal(latest.drinks[0].note,'重要离线更正')
  const recovered=cloud.recoverStorage()
  assert.equal(recovered.drinks[0].note,'重要离线更正')
  assert.deepEqual(f.disk.get(mainKey),f.disk.get(backupKey))
})
test('one corrupted slot has recoverable copy; bad original quarantined, never erased silently',()=>{
  const f=setup(),cloud=f.coordinator()
  cloud.createDrink(input(),mut())
  const previous=deep(f.disk.get(mainKey))
  f.disk.get(mainKey).data.drinks[0].note='tampered bytes'
  cloud.invalidate()
  assert.equal(cloud.getSnapshot().drinks[0].note,'仅个人可见')
  const restored=cloud.recoverStorage()
  assert.equal(restored.drinks.length,1)
  assert.deepEqual(f.disk.get(mainKey),f.disk.get(backupKey))
  assert.notDeepEqual(f.disk.get(mainKey+':quarantine'),previous)
  assert.equal(f.disk.get(mainKey+':quarantine').data.drinks[0].note,'tampered bytes')
})
test('both corrupted snapshots and unsupported schema are blocked with original bytes intact',()=>{
  const f=setup(),cloud=f.coordinator()
  cloud.createDrink(input(),mut())
  f.disk.get(mainKey).data.operations[0].opId='corrupted-main'
  f.disk.get(backupKey).data.operations[0].opId='corrupted-secondary'
  const before=deep([...f.disk.entries()])
  cloud.invalidate()
  assert.throws(()=>cloud.getSnapshot(),e=>e.code==='STORAGE')
  assert.throws(()=>cloud.recoverStorage(),e=>e.code==='STORAGE')
  assert.deepEqual([...f.disk.entries()],before)
  assert.equal(f.backend.drinks.size,0)
})
test('PR-08 raw schema snapshots are read without destructive migration',()=>{
  const f=setup(),first=f.coordinator()
  first.createVisit(visit(),mut())
  const raw=f.disk.get(mainKey).data
  f.disk.set(mainKey,deep(raw));f.disk.delete(backupKey)
  const current=f.coordinator()
  assert.equal(current.getSnapshot().visits.length,1)
  assert.deepEqual(f.disk.get(mainKey),raw)
  current.createDrink(input(),mut())
  assert.equal(f.disk.get(mainKey).format,'jiuji-cloud-mirror-recovery-v1')
})
test('server committed CREATE but local ACK and both slots failed: retry same ID once',async()=>{
  const f=setup(),cloud=f.coordinator()
  const d=cloud.createDrink(input(),mut())
  f.setBlock((_key,value)=>value?.data?.operations?.length===0 &&
    value?.data?.drinks?.length===1)
  await cloud.sync()
  assert.equal(f.backend.drinks.size,1)
  assert.throws(()=>cloud.getSnapshot(),e=>e.code==='STORAGE')
  f.setBlock(null)
  assert.equal(cloud.recoverStorage().operations.length,1)
  await cloud.sync()
  assert.equal(f.backend.drinks.size,1)
  assert.equal(f.backend.createCalls,2)
  assert.equal(cloud.getSnapshot().operations.length,0)
  assert.equal(cloud.status('drink',d.id),'synced')
})
test('server committed conditional UPDATE but local ACK failed: recover by GET, no second PATCH',async()=>{
  const f=setup(),cloud=f.coordinator()
  cloud.createDrink(input(),mut());await cloud.sync()
  const row=cloud.localRepository().listDrinks()[0]
  cloud.updateDrink(row.id,{note:'仅设备本机更正'},1)
  f.setBlock((_key,value)=>value?.data?.operations?.length===0 &&
    value?.data?.drinks?.[0]?.revision===2)
  await cloud.sync()
  assert.equal(f.backend.updateCalls,1)
  assert.throws(()=>cloud.getSnapshot(),e=>e.code==='STORAGE')
  f.setBlock(null);cloud.recoverStorage()
  await cloud.sync()
  assert.equal(f.backend.updateCalls,1)
  assert.equal(f.backend.drinks.get(row.id).note,'仅设备本机更正')
  assert.equal(cloud.localRepository().getDrink(row.id).revision,2)
})
test('server committed DELETE but local ACK failed: recover via GET 404, do not delete again',async()=>{
  const f=setup(),cloud=f.coordinator()
  cloud.createDrink(input(),mut());await cloud.sync()
  const row=cloud.localRepository().listDrinks()[0]
  cloud.deleteDrink(row.id,row.revision)
  f.setBlock((_key,value)=>value?.data?.operations?.length===0)
  await cloud.sync()
  assert.equal(f.backend.deleteCalls,1)
  assert.throws(()=>cloud.getSnapshot(),e=>e.code==='STORAGE')
  f.setBlock(null);cloud.recoverStorage()
  await cloud.sync()
  assert.equal(f.backend.deleteCalls,1)
  assert.equal(cloud.localRepository().listDrinks().length,0)
})
test('server committed LINK with lost ACK reconciles revision and temporary visit ID',async()=>{
  const f=setup(),cloud=f.coordinator()
  cloud.createDrink(input(),mut());cloud.createVisit(visit(),mut())
  await cloud.sync()
  const drink=cloud.localRepository().listDrinks()[0],
    v=cloud.localRepository().listVisits()[0]
  cloud.linkDrink(drink.id,v.id,drink.revision)
  f.setBlock((_key,value)=>value?.data?.operations?.length===0 &&
    value?.data?.drinks?.[0]?.revision===2)
  await cloud.sync()
  assert.equal(f.backend.linkCalls,1)
  f.setBlock(null);cloud.recoverStorage()
  await cloud.sync()
  assert.equal(f.backend.linkCalls,1)
  assert.equal(cloud.localRepository().getDrink(drink.id).visitSessionId,v.id)
})
test('409 preserves offline edits and does not automatically overwrite server changes',async()=>{
  const f=setup(),cloud=f.coordinator()
  cloud.createDrink(input(),mut());await cloud.sync()
  const row=cloud.localRepository().listDrinks()[0]
  f.backend.drinks.get(row.id).note='另一设备已编辑'
  f.backend.drinks.get(row.id).revision=2
  cloud.updateDrink(row.id,{note:'本机草稿仍保留'},1)
  await cloud.sync()
  const pending=cloud.getSnapshot().operations
  assert.equal(pending[0].status,'conflict')
  assert.equal(cloud.localRepository().getDrink(row.id).note,'本机草稿仍保留')
  assert.equal(f.backend.drinks.get(row.id).note,'另一设备已编辑')
})
test('A queue never mounted under B identity; logout unloads memory without deleting A disk slots',()=>{
  const f=setup(),cloud=f.coordinator()
  cloud.createDrink(input(),mut())
  f.setOwner(null)
  cloud.invalidate()
  assert.throws(()=>cloud.getSnapshot(),e=>e.code==='AUTH_REQUIRED')
  f.setOwner('verified-B')
  assert.deepEqual(cloud.localRepository().listDrinks(),[])
  assert.equal(f.disk.has(mainKey),true)
  f.setOwner('server-verified-A')
  assert.equal(cloud.localRepository().listDrinks().length,1)
})
function authFixture(fails=false){
  const now=Date.parse('2026-10-18T05:00:00Z')
  let complete,signOutCount=0
  const pair=()=>({accessToken:'access-token-not-persisted-123',refreshToken:'refresh-private-123456789',
    sessionId:'server-session-1',accessExpiresAt:new Date(now+900000).toISOString()})
  const me={account:{id:'server-verified-A',displayName:'已验证用户',
    bindings:{wechat:true,phone:false,providers:['wechat']}},
    session:{id:'server-session-1',expiresAt:new Date(now+3600000).toISOString(),revoked:false}}
  const transport={
    exchange:async()=>pair(),me:async()=>deep(me),refresh:async()=>pair(),
    logout:async()=>{
      signOutCount++
      if(fails)throw Error('confidential refresh token error: '+pair().refreshToken)
      if(complete)await complete
    }
  }
  const auth=new AuthService({enabled:true,wechatLogin:async()=> 'login-code',transport,now:()=>now})
  return {auth,transport,stats:()=>signOutCount,wait:p=>{complete=p}}
}
test('local logout is immediate; network failure yields accurate unconfirmed revocation without token leak',async()=>{
  const f=authFixture(true)
  await f.auth.signIn()
  await f.auth.signOut()
  assert.equal(f.auth.getState().status,'guest')
  assert.match(f.auth.getState().message,/服务器撤销未确认/)
  assert.doesNotMatch(f.auth.getState().message,/refresh-private/)
  assert.equal(f.auth.credentialForPrivateApi(),null)
  assert.equal(f.stats(),1)
})
test('server-confirmed logout is distinct, no offline refresh token persistence',async()=>{
  const f=authFixture()
  await f.auth.signIn()
  await f.auth.signOut()
  assert.match(f.auth.getState().message,/服务器也已确认/)
  assert.equal(f.auth.credentialForPrivateApi(),null)
})
