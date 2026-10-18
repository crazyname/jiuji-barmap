// SPDX-License-Identifier: MPL-2.0
// Actual HTTP Worker handler + SQLite database execution. No fake repository.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { createHandler } from '../src/index.mjs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const dir=path.dirname(fileURLToPath(import.meta.url))
const sql=fs.readFileSync(path.join(dir,'../migrations/0001_private_foundation.sql'),'utf8')
class SqliteD1 {
  constructor() {
    this.raw=new DatabaseSync(':memory:')
    this.raw.exec('PRAGMA foreign_keys=ON')
    this.raw.exec(sql)
    this.raw.exec(sql) // reapplying schema must be non-destructive
  }
  prepare(query) {
    const db=this.raw
    const state={sql:query,params:[]}
    const wrap=()=>({
      bind(...values) {state.params=values;return this},
      async first() {return db.prepare(state.sql).get(...state.params)??null},
      async all() {return {results:db.prepare(state.sql).all(...state.params)}},
      async run() {const r=db.prepare(state.sql).run(...state.params)
        return {meta:{changes:Number(r.changes)}}}
    })
    return wrap()
  }
  async batch(statements) {
    this.raw.exec('BEGIN IMMEDIATE')
    try {
      const results=[]
      for(const stmt of statements)results.push(await stmt.run())
      this.raw.exec('COMMIT')
      return results
    } catch(e){this.raw.exec('ROLLBACK');throw e}
  }
  query(sql, ...args) {return this.raw.prepare(sql).all(...args)}
  close(){this.raw.close()}
}
const secrets={WECHAT_APP_ID:'wx_fake_test_app',WECHAT_APP_SECRET:'a-test-secret-only-for-unit-tests-12345',
  SUBJECT_PEPPER:'a-non-production-test-only-key-12345678909876543210'}
function fixture({noSecrets=false,failWechat=false}={}) {
  const db=new SqliteD1()
  let time=Date.parse('2026-10-18T00:00:00.000Z')
  let calls=0
  const wx=async url=>{
    calls++
    const params=new URL(url).searchParams
    assert.equal(params.get('appid'),secrets.WECHAT_APP_ID)
    assert.equal(params.get('secret'),secrets.WECHAT_APP_SECRET)
    if(failWechat || params.get('js_code')==='invalid')
      return Response.json({errcode:40029,errmsg:'invalid code'})
    const code=params.get('js_code')
    return Response.json({openid:code.startsWith('userB')?'B-openid':'A-openid',
      session_key:'never-sent-to-client'})
  }
  const send=createHandler({wechatFetch:wx,now:()=>time})
  const env={DB:db,...(!noSecrets?secrets:{})}
  async function call(method,route,data,token,extraHeaders={}) {
    const headers={...extraHeaders}
    if(data!==undefined)headers['Content-Type']='application/json'
    if(token)headers.Authorization='Bearer '+token
    const res=await send(new Request('https://api.example.test'+route,{
      method,headers,body:data===undefined?undefined:JSON.stringify(data)
    }),env)
    return {status:res.status,body:await res.json(),headers:res.headers}
  }
  async function login(code='userA-first'){
    const result=await call('POST','/v1/auth/wechat/exchange',{code})
    assert.equal(result.status,200,JSON.stringify(result.body))
    return result.body
  }
  return {db,call,login,clock:n=>{time+=n},wechatCalls:()=>calls,env}
}
let mutation=0
const idem=()=> 'backend-mutation-'+(++mutation)
const drink=(overrides={})=>({
  clientMutationId:idem(),drinkLabel:'马天尼',consumedAt:'2026-10-17T20:30:00+08:00',
  contextKind:'bar',note:'独立私人感受',personalRating:4.5,...overrides
})
const visit=(overrides={})=>({
  clientMutationId:idem(),occurredAt:'2026-10-17T19:00:00+08:00',
  placeLabel:'小型酒吧',note:'一次经历',...overrides
})
function check(result,status,code) {
  assert.equal(result.status,status,JSON.stringify(result.body))
  if(code)assert.equal(result.body.error.code,code)
}

test('schema repeatable, private-only tables and indexes leave unrelated public data untouched',()=>{
  const db=new SqliteD1()
  db.raw.exec('CREATE TABLE IF NOT EXISTS posts(id TEXT PRIMARY KEY,body TEXT);'+
    "INSERT INTO posts VALUES ('public-1','keep me')")
  db.raw.exec(sql)
  assert.equal(db.query('SELECT count(*) AS n FROM posts')[0].n,1)
  for(const name of ['users','account_bindings','auth_sessions','used_refresh_tokens',
    'visit_sessions','drink_entries','mutation_idempotency']){
    assert.ok(db.query("SELECT name FROM sqlite_master WHERE type='table' AND name=?",name).length)
  }
  db.close()
})
test('valid WeChat code2Session obtains opaque internal account, verified /me and matching session',async()=>{
  const f=fixture()
  const t=await f.login()
  assert.match(t.accessToken,/^[a-f0-9]{64}$/)
  assert.match(t.refreshToken,/^[a-f0-9]{64}$/)
  const me=await f.call('GET','/v1/me',undefined,t.accessToken)
  check(me,200)
  assert.equal(me.body.session.id,t.sessionId)
  assert.equal(me.body.session.revoked,false)
  assert.equal(me.body.account.bindings.wechat,true)
  assert.equal(me.body.account.bindings.phone,false)
  assert.notEqual(me.body.account.id,'A-openid')
  assert.match(me.body.account.id,/^[0-9a-f-]{36}$/)
  assert.equal(JSON.stringify(me.body).includes('openid'),false)
  assert.equal(f.db.query('SELECT count(*) AS n FROM users')[0].n,1)
})
test('invalid and replayed WeChat code rejected before second code2Session call',async()=>{
  const f=fixture()
  const x=await f.call('POST','/v1/auth/wechat/exchange',{code:'invalid'})
  check(x,401,'AUTH_CODE_INVALID')
  const t=await f.login('userA-good')
  check(await f.call('POST','/v1/auth/wechat/exchange',{code:'userA-good'}),
    401,'AUTH_CODE_INVALID')
  assert.equal(f.wechatCalls(),2)
  assert.ok(t.accessToken)
})
test('missing server AppID, AppSecret or pepper refuses auth; no demo principal',async()=>{
  const f=fixture({noSecrets:true})
  check(await f.call('POST','/v1/auth/wechat/exchange',{code:'abc'}),503,'AUTH_BACKEND_UNAVAILABLE')
  check(await f.call('POST','/v1/auth/refresh',{refreshToken:'x'.repeat(64)}),
    503,'AUTH_BACKEND_UNAVAILABLE')
  assert.equal(f.wechatCalls(),0)
  assert.equal(f.db.query('SELECT count(*) AS n FROM users')[0].n,0)
})
test('rate limiter blocks repeated guessing using persistent SQL bucket',async()=>{
  const f=fixture({failWechat:true})
  for(let i=0;i<10;i++)
    check(await f.call('POST','/v1/auth/wechat/exchange',{code:'invalid'+i}),401,'AUTH_CODE_INVALID')
  check(await f.call('POST','/v1/auth/wechat/exchange',{code:'invalid11'}),
    429,'AUTH_RATE_LIMITED')
  assert.equal(f.wechatCalls(),10)
})
test('Access token expiration and explicit session revocation reject /me and all private routes',async()=>{
  const f=fixture()
  const t=await f.login()
  check(await f.call('GET','/v1/private/drinks',undefined,t.accessToken),200)
  f.clock(15*60_000+1)
  check(await f.call('GET','/v1/me',undefined,t.accessToken),401,'AUTH_UNAUTHORIZED')
  check(await f.call('GET','/v1/private/drinks',undefined,t.accessToken),401,'AUTH_UNAUTHORIZED')
  const second=await f.login('userA-new')
  f.db.raw.prepare('UPDATE auth_sessions SET revoked_at=? WHERE id=?')
    .run('2026-10-18T00:15:02Z',second.sessionId)
  check(await f.call('GET','/v1/private/visits',undefined,second.accessToken),
    401,'AUTH_UNAUTHORIZED')
})
test('Refresh rotation invalidates previous refresh, replay revokes the entire server session',async()=>{
  const f=fixture()
  const first=await f.login()
  const next=await f.call('POST','/v1/auth/refresh',{refreshToken:first.refreshToken})
  check(next,200)
  assert.equal(next.body.sessionId,first.sessionId)
  assert.notEqual(next.body.accessToken,first.accessToken)
  check(await f.call('GET','/v1/me',undefined,first.accessToken),401,'AUTH_UNAUTHORIZED')
  check(await f.call('GET','/v1/me',undefined,next.body.accessToken),200)
  check(await f.call('POST','/v1/auth/refresh',{refreshToken:first.refreshToken}),
    401,'AUTH_REVOKED')
  check(await f.call('GET','/v1/me',undefined,next.body.accessToken),
    401,'AUTH_UNAUTHORIZED')
})
test('Logout revokes matching refresh only, cannot use wrong refresh token',async()=>{
  const f=fixture(),a=await f.login()
  check(await f.call('POST','/v1/auth/logout',{refreshToken:'f'.repeat(64)},a.accessToken),
    401,'AUTH_UNAUTHORIZED')
  check(await f.call('GET','/v1/me',undefined,a.accessToken),200)
  check(await f.call('POST','/v1/auth/logout',{refreshToken:a.refreshToken},a.accessToken),200)
  check(await f.call('GET','/v1/me',undefined,a.accessToken),401,'AUTH_UNAUTHORIZED')
})
test('anonymous cannot read, write or update private records, public sync cannot leak them',async()=>{
  const f=fixture()
  check(await f.call('GET','/v1/private/drinks'),401,'AUTH_UNAUTHORIZED')
  check(await f.call('POST','/v1/private/visits',visit()),401,'AUTH_UNAUTHORIZED')
  check(await f.call('GET','/v1/sync'),404,'NOT_FOUND')
  const t=await f.login()
  check(await f.call('POST','/v1/private/drinks',drink(),t.accessToken),201)
  check(await f.call('GET','/v1/sync'),404,'NOT_FOUND')
})
test('A and B accounts are isolated on all private reads, writes and list queries',async()=>{
  const f=fixture(),a=await f.login(),b=await f.login('userB-new')
  const d=await f.call('POST','/v1/private/drinks',drink(),a.accessToken)
  check(d,201)
  check(await f.call('GET','/v1/private/drinks/'+d.body.entry.id,undefined,b.accessToken),
    404,'NOT_FOUND')
  check(await f.call('PATCH','/v1/private/drinks/'+d.body.entry.id,
    {expectedRevision:1,changes:{note:'攻破'}},b.accessToken),404,'NOT_FOUND')
  check(await f.call('DELETE','/v1/private/drinks/'+d.body.entry.id,
    {expectedRevision:1},b.accessToken),404,'NOT_FOUND')
  const other=await f.call('GET','/v1/private/drinks',undefined,b.accessToken)
  assert.equal(other.body.entries.length,0)
  assert.equal(f.db.query('SELECT count(*) AS n FROM drink_entries')[0].n,1)
})
test('cross-user visit link blocked; no cross-user foreign keys or owner override',async()=>{
  const f=fixture(),a=await f.login(),b=await f.login('userB-new')
  const v=(await f.call('POST','/v1/private/visits',visit(),b.accessToken)).body.visit
  const d=(await f.call('POST','/v1/private/drinks',drink(),a.accessToken)).body.entry
  check(await f.call('PUT','/v1/private/drinks/'+d.id+'/visit',
    {expectedRevision:1,visitSessionId:v.id},a.accessToken),404,'NOT_FOUND')
  check(await f.call('POST','/v1/private/drinks',drink({visitSessionId:v.id}),a.accessToken),
    404,'NOT_FOUND')
  check(await f.call('POST','/v1/private/drinks',drink({ownerUserId:'attacker'}),a.accessToken),
    400,'INVALID_INPUT')
  assert.equal(f.db.query('SELECT count(*) AS n FROM drink_entries')[0].n,1)
})
test('identical clientMutationId retries return original drink/visit, do not merge same-time facts',async()=>{
  const f=fixture(),t=await f.login()
  const input=drink()
  const first=await f.call('POST','/v1/private/drinks',input,t.accessToken)
  check(first,201)
  const again=await f.call('POST','/v1/private/drinks',input,t.accessToken)
  check(again,200)
  assert.equal(first.body.entry.id,again.body.entry.id)
  check(await f.call('POST','/v1/private/drinks',{...input,drinkLabel:'changed'},t.accessToken),
    409,'CONFLICT')
  const v=visit()
  const v1=await f.call('POST','/v1/private/visits',v,t.accessToken)
  const v2=await f.call('POST','/v1/private/visits',v,t.accessToken)
  assert.equal(v1.body.visit.id,v2.body.visit.id)
  check(v1,201);check(v2,200)
  const other=await f.call('POST','/v1/private/drinks',drink(),t.accessToken)
  check(other,201)
  assert.notEqual(first.body.entry.id,other.body.entry.id)
  assert.equal(f.db.query('SELECT count(*) AS n FROM drink_entries')[0].n,2)
})
test('expectedRevision uses conditional SQL, never overwrites a stale edit or deletion',async()=>{
  const f=fixture(),t=await f.login()
  const created=(await f.call('POST','/v1/private/drinks',drink(),t.accessToken)).body.entry
  const path='/v1/private/drinks/'+created.id
  const revised=await f.call('PATCH',path,
    {expectedRevision:1,changes:{note:'新的私人备注'}},t.accessToken)
  check(revised,200)
  assert.equal(revised.body.entry.revision,2)
  check(await f.call('PATCH',path,
    {expectedRevision:1,changes:{note:'过期覆盖'}},t.accessToken),409,'CONFLICT')
  check(await f.call('DELETE',path,{expectedRevision:1},t.accessToken),409,'CONFLICT')
  assert.equal((await f.call('GET',path,undefined,t.accessToken)).body.entry.note,'新的私人备注')
  check(await f.call('DELETE',path,{expectedRevision:2},t.accessToken),200)
  check(await f.call('POST','/v1/private/drinks',
    {clientMutationId:created.clientMutationId,...drink({clientMutationId:created.clientMutationId})},
    t.accessToken),409,'REPLAY_DELETED')
})
test('deleting visit atomically detaches three drinks without destroying individual facts',async()=>{
  const f=fixture(),t=await f.login()
  const visitRow=(await f.call('POST','/v1/private/visits',visit(),t.accessToken)).body.visit
  const ids=[]
  for(let i=0;i<3;i++){
    const result=await f.call('POST','/v1/private/drinks',drink({
      drinkLabel:'第'+i+'杯',visitSessionId:visitRow.id}),t.accessToken)
    check(result,201)
    ids.push(result.body.entry.id)
  }
  const related=await f.call('GET','/v1/private/visits/'+visitRow.id+'/drinks',undefined,t.accessToken)
  assert.equal(related.body.entries.length,3)
  check(await f.call('DELETE','/v1/private/visits/'+visitRow.id,
    {expectedRevision:1},t.accessToken),200)
  const all=await f.call('GET','/v1/private/drinks',undefined,t.accessToken)
  assert.equal(all.body.entries.length,3)
  assert.deepEqual(new Set(all.body.entries.map(d=>d.id)),new Set(ids))
  assert.ok(all.body.entries.every(d=>d.visitSessionId===null && d.revision===2))
  assert.equal(f.db.query('SELECT count(*) AS n FROM visit_sessions')[0].n,0)
})
test('visit correction and detachment preserve original drink ID and enforce current revision',async()=>{
  const f=fixture(),t=await f.login()
  const v=(await f.call('POST','/v1/private/visits',visit(),t.accessToken)).body.visit
  const d=(await f.call('POST','/v1/private/drinks',drink(),t.accessToken)).body.entry
  const path='/v1/private/drinks/'+d.id+'/visit'
  const linked=await f.call('PUT',path,{expectedRevision:1,visitSessionId:v.id},t.accessToken)
  assert.equal(linked.body.entry.visitSessionId,v.id)
  check(await f.call('PUT',path,{expectedRevision:1,visitSessionId:null},t.accessToken),
    409,'CONFLICT')
  const detached=await f.call('PUT',path,{expectedRevision:2,visitSessionId:null},t.accessToken)
  assert.equal(detached.body.entry.id,d.id)
  assert.equal(detached.body.entry.visitSessionId,null)
  assert.equal(f.db.query('SELECT count(*) AS n FROM drink_entries')[0].n,1)
})
test('private list returns sorted events, excludes public sync and applies query validation',async()=>{
  const f=fixture(),t=await f.login()
  const first=await f.call('POST','/v1/private/drinks',drink({
    drinkLabel:'早',consumedAt:'2026-10-01T00:00:00Z',contextKind:'home'}),t.accessToken)
  const last=await f.call('POST','/v1/private/drinks',drink({drinkLabel:'晚'}),t.accessToken)
  const list=await f.call('GET','/v1/private/drinks?context=bar',undefined,t.accessToken)
  assert.equal(list.body.entries.length,1)
  assert.equal(list.body.entries[0].id,last.body.entry.id)
  const both=await f.call('GET','/v1/private/drinks',undefined,t.accessToken)
  assert.deepEqual(both.body.entries.map(d=>d.id),[last.body.entry.id,first.body.entry.id])
  check(await f.call('GET','/v1/private/drinks?limit=9999',undefined,t.accessToken),
    400,'INVALID_INPUT')
})
test('strict schema rejects fake public visibility, invalid dates, ratings and extra fields',async()=>{
  const f=fixture(),t=await f.login()
  check(await f.call('POST','/v1/private/drinks',drink({visibility:'public'}),t.accessToken),
    400,'INVALID_INPUT')
  check(await f.call('POST','/v1/private/drinks',drink({consumedAt:'2026-02-30T10:00:00Z'}),
    t.accessToken),400,'INVALID_INPUT')
  check(await f.call('POST','/v1/private/drinks',drink({personalRating:9}),t.accessToken),
    400,'INVALID_INPUT')
  check(await f.call('POST','/v1/private/visits',visit({ownerUserId:'fake'}),t.accessToken),
    400,'INVALID_INPUT')
  assert.equal(f.db.query('SELECT count(*) AS n FROM drink_entries')[0].n,0)
})
test('code2Session transport outage returns generic error without leaking secrets or codes',async()=>{
  const f=fixture({failWechat:true})
  const result=await f.call('POST','/v1/auth/wechat/exchange',{code:'invalid'})
  assert.equal(JSON.stringify(result).includes(secrets.WECHAT_APP_SECRET),false)
  check(result,401,'AUTH_CODE_INVALID')
})
