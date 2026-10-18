// Real React SyncStatus interactions on the real PR-08 queue coordinator.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { CloudJournalCoordinator, CloudSyncError } from '../packages/sync/private-cloud.ts'
import { createRecoverableCloudStorage } from '../packages/sync/recoverable-cloud-storage.ts'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const requireApp=createRequire(path.join(root,'apps/wechat/package.json'))
const React=requireApp('react'),{create,act}=requireApp('react-test-renderer')
const ts=requireApp('typescript')
const host=new Proxy({}, {get:(_target,key)=>String(key)})
function load(file) {
  const source=fs.readFileSync(path.join(root,file),'utf8')
  const compiled=ts.transpileModule(source,{fileName:file,compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,
    jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText
  const module={exports:{}}
  new Function('require','module','exports',compiled)((name)=>{
    if(name==='react')return React
    if(name==='react/jsx-runtime')return requireApp('react/jsx-runtime')
    if(name==='@tarojs/components')return host
    if(name.endsWith('.css'))return {}
    throw Error('Unexpected module '+name)
  },module,module.exports)
  return module.exports
}
const {CloudJournalStatus,cloudRecordLabel}=load('apps/wechat/src/components/journal/CloudJournalStatus.tsx')
function example() {
  const disk=new Map(),user={id:'server-verified-user'},remote={
    listDrinks:async()=>({records:[],nextCursor:null}),
    listVisits:async()=>({records:[],nextCursor:null}),
    getDrink:async()=>null,getVisit:async()=>null,
    createDrink:async()=>{throw new CloudSyncError('NETWORK','网络未恢复')},
    createVisit:async()=>{throw new CloudSyncError('NETWORK','网络未恢复')},
    updateDrink:async()=>{throw new CloudSyncError('CONFLICT','服务器已变更')},
    updateVisit:async()=>{throw new CloudSyncError('CONFLICT','服务器已变更')},
    linkDrink:async()=>{throw new CloudSyncError('CONFLICT','服务器已变更')},
    deleteDrink:async()=>{},deleteVisit:async()=>{}
  }
  let seq=0
  const cloud=new CloudJournalCoordinator({
    identity:{verifiedUserId:()=>user.id},
    storage:{read:key=>disk.get(key),write:(key,val)=>disk.set(key,structuredClone(val))},
    remote,newId:()=>String(++seq),now:()=>new Date().toISOString()
  })
  return {cloud,user,remote,disk}
}
const drink={drinkLabel:'白色尼格罗尼',consumedAt:'2026-10-18T06:00:00Z',
  contextKind:'home',note:'私人备注'}
const words=tree=>JSON.stringify(tree.toJSON())
async function mount(cloud){
  let tree;await act(async()=>{tree=create(React.createElement(CloudJournalStatus,{cloud}))})
  return tree
}
test('rendered React status changes from not downloaded to locally queued, then failed',async()=>{
  const f=example(),tree=await mount(f.cloud)
  assert.match(words(tree),/仅当前设备缓存/)
  const row=f.cloud.createDrink(drink,'cloud-test-mutation-1')
  await act(async()=>{await Promise.resolve()})
  assert.match(words(tree),/已保存到当前设备，待同步/)
  assert.equal(cloudRecordLabel(f.cloud,'drink',row.id),'当前设备待同步')
  await act(async()=>{await f.cloud.sync()})
  assert.match(words(tree),/同步失败/)
  assert.match(words(tree),/网络未恢复/)
  assert.equal(f.disk.size,1)
  await act(async()=>{tree.unmount()})
})
test('sync retry button invokes coordinator; server acknowledgment changes React to synced',async()=>{
  const f=example(),tree=await mount(f.cloud)
  const local=f.cloud.createDrink(drink,'cloud-test-mutation-2')
  await act(async()=>{await f.cloud.sync()})
  assert.match(words(tree),/同步失败/)
  f.remote.createDrink=async(input,mutationId)=>({
    id:'server-record-1',ownerUserId:f.user.id,visibility:'private',revision:1,
    createdAt:'2026-10-18T06:00:00Z',updatedAt:'2026-10-18T06:00:00Z',
    cocktailId:null,recipeVariantId:null,visitSessionId:null,personalRating:null,
    photoRefs:[],contextDetails:{},note:input.note||null,clientMutationId:mutationId,
    drinkLabel:input.drinkLabel,consumedAt:input.consumedAt,contextKind:input.contextKind
  })
  f.remote.listDrinks=async()=>({records:f.cloud.getSnapshot().drinks.filter(x=>x.id==='server-record-1'),nextCursor:null})
  const button=tree.root.findAllByType('Button').find(x=>x.children.some(c=>typeof c==='string'&&c.includes('重新同步')))
  assert.ok(button)
  await act(async()=>{button.props.onClick();await new Promise(resolve=>setImmediate(resolve))})
  assert.equal(f.cloud.getSnapshot().operations.length,0)
  assert.match(words(tree),/已同步/)
  assert.notEqual(f.cloud.resolveId(local.id),local.id)
  await act(async()=>tree.unmount())
})
test('React conflict controls preserve local draft until explicit server reload',async()=>{
  const f=example()
  let persisted=null
  f.remote.listDrinks=async()=>({records:persisted?[persisted]:[],nextCursor:null})
  const first=f.cloud.createDrink(drink,'cloud-test-mutation-3')
  f.remote.createDrink=async(input,id)=>(persisted={
    id:'remote-2',ownerUserId:f.user.id,drinkLabel:input.drinkLabel,
    consumedAt:input.consumedAt,contextKind:input.contextKind,
    note:input.note,cocktailId:null,recipeVariantId:null,visitSessionId:null,
    photoRefs:[],contextDetails:{},personalRating:null,revision:1,
    clientMutationId:id,visibility:'private',createdAt:'2026-10-18T06:00:00Z',
    updatedAt:'2026-10-18T06:00:00Z'
  })
  await f.cloud.sync()
  const current=f.cloud.localRepository().getDrink(f.cloud.resolveId(first.id))
  f.cloud.updateDrink(current.id,{note:'本机草稿'},1)
  f.remote.getDrink=async()=>({...current,note:'服务器原稿',revision:2})
  const tree=await mount(f.cloud)
  await act(async()=>{await f.cloud.sync()})
  assert.match(words(tree),/存在冲突/)
  assert.equal(f.cloud.localRepository().listDrinks()[0].note,'本机草稿')
  const buttons=tree.root.findAllByType('Button')
  const keep=buttons.find(x=>x.children.some(c=>typeof c==='string'&&c.includes('保留本地草稿')))
  const reload=buttons.find(x=>x.children.some(c=>typeof c==='string'&&c.includes('放弃本机修改')))
  assert.ok(keep);assert.ok(reload)
  await act(async()=>{keep.props.onClick()})
  assert.equal(f.cloud.getSnapshot().operations.length,1)
  await act(async()=>{reload.props.onClick()})
  assert.equal(f.cloud.getSnapshot().operations.length,0)
  assert.equal(f.cloud.localRepository().listDrinks()[0].note,'服务器原稿')
  await act(async()=>tree.unmount())
})
test('UI does not expose other account content after identity invalidation',async()=>{
  const f=example(),tree=await mount(f.cloud)
  f.cloud.createDrink(drink,'cloud-test-mutation-4')
  f.user.id=null
  f.cloud.invalidate()
  await act(async()=>{await Promise.resolve()})
  assert.match(words(tree),/未认证/)
  assert.doesNotMatch(words(tree),/白色尼格罗尼/)
  await act(async()=>tree.unmount())
})


test('editing while CREATE upload is in flight keeps a dependent revision-checked update',async()=>{
  const f=example()
  const local=f.cloud.createDrink(drink,'cloud-test-mutation-race-1')
  let signal,release
  const started=new Promise(resolve=>{signal=resolve})
  const hold=new Promise(resolve=>{release=resolve})
  let server=null
  f.remote.createDrink=async(input,mutationId)=>{
    signal();await hold
    server={...local,id:'server-race-1',revision:1,note:input.note||null,
      clientMutationId:mutationId}
    return {...server}
  }
  f.remote.updateDrink=async(id,changes,expectedRevision)=>{
    assert.equal(id,'server-race-1')
    assert.equal(expectedRevision,1)
    server={...server,...changes,revision:2}
    return {...server}
  }
  f.remote.listDrinks=async()=>({records:server?[server]:[],nextCursor:null})
  const uploading=f.cloud.sync()
  await started
  f.cloud.updateDrink(local.id,{note:'上传过程中新增修改'},1)
  assert.equal(f.cloud.getSnapshot().operations.length,2)
  release();await uploading
  assert.equal(f.cloud.getSnapshot().operations.length,1)
  assert.equal(f.cloud.localRepository().listDrinks()[0].note,'上传过程中新增修改')
  await f.cloud.sync()
  assert.equal(server.note,'上传过程中新增修改')
  assert.equal(f.cloud.getSnapshot().operations.length,0)
})
test('deleting a still-uploading CREATE queues server cleanup instead of orphaning the record',async()=>{
  const f=example(),local=f.cloud.createDrink(drink,'cloud-test-mutation-race-2')
  let signal,release
  const started=new Promise(resolve=>{signal=resolve})
  const hold=new Promise(resolve=>{release=resolve})
  let server=null
  f.remote.createDrink=async(input,mutationId)=>{
    signal();await hold
    server={...local,id:'server-race-2',revision:1,
      clientMutationId:mutationId}
    return {...server}
  }
  f.remote.deleteDrink=async(id,rev)=>{
    assert.equal(id,'server-race-2')
    assert.equal(rev,1)
    server=null
  }
  f.remote.listDrinks=async()=>({records:server?[server]:[],nextCursor:null})
  const uploading=f.cloud.sync()
  await started
  f.cloud.deleteDrink(local.id,1)
  assert.equal(f.cloud.localRepository().listDrinks().length,0)
  release();await uploading
  assert.equal(f.cloud.getSnapshot().operations.length,1)
  await f.cloud.sync()
  assert.equal(server,null)
  assert.equal(f.cloud.localRepository().listDrinks().length,0)
  assert.equal(f.cloud.getSnapshot().operations.length,0)
})
test('a forged or corrupted cross-user offline cache is rejected before display or upload',async()=>{
  const f=example()
  const key='jiuji-private-cloud-v1:'+encodeURIComponent(f.user.id)
  f.disk.set(key,{schema:1,ownerUserId:f.user.id,
    drinks:[{...drink,id:'forged',revision:1,ownerUserId:'other-user',visibility:'private'}],
    visits:[],operations:[],idMap:{},refreshed:false,error:null,syncing:false})
  assert.throws(()=>f.cloud.getSnapshot(),e=>e.code==='STORAGE')
})


function loadProductionPrivateAdapter() {
  const p='apps/wechat/src/services/private-cloud.ts'
  const source=fs.readFileSync(path.join(root,p),'utf8')
  const compiled=ts.transpileModule(source,{fileName:p,compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,
    esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText
  const module={exports:{}}, identity={userId:'verified-account-A',accessToken:'a'.repeat(64)}
  let revoked=false
  const auth={
    credentialForPrivateApi:()=>revoked?null:identity,
    verifiedIdentity:()=>revoked?null:{kind:'verified',userId:identity.userId},
    subscribe:()=>()=>{},
    invalidatePrivateApi:()=>{revoked=true}
  }
  new Function('require','module','exports',compiled)(name=>{
    if(name==='@tarojs/taro')return {__esModule:true,default:{
      request:async()=>{throw Error('No production network in tests')},
      getStorageSync:()=>undefined,setStorageSync:()=>{}
    }}
    if(name==='../config/auth')return {AUTH_API_ENABLED:false,AUTH_API_BASE_URL:''}
    if(name==='./wechat-auth')return {authService:auth}
    if(name==='../../../../packages/sync/private-cloud')
      return {CloudJournalCoordinator,CloudSyncError}
    if(name==='../../../../packages/sync/recoverable-cloud-storage')
      return {createRecoverableCloudStorage}
    throw Error('Unexpected production adapter dependency: '+name)
  },module,module.exports)
  return {api:module.exports,auth,identity,isRevoked:()=>revoked}
}
test('production Taro private API adapter sends verified Bearer and composite cursor only',async()=>{
  const f=loadProductionPrivateAdapter(),requests=[]
  const remote=f.api.createPrivateApiRemote(f.auth,'https://private.example.test',true,
    async options=>{
      requests.push(options)
      if(options.method==='GET')return {statusCode:200,data:{
        entries:[],nextCursor:null
      }}
      return {statusCode:200,data:{entry:{id:'server-1'}}}
    })
  const page=await remote.listDrinks({
    before:'2026-10-18T12:30:00.000Z',beforeId:'abc-1'
  })
  assert.deepEqual(page.records,[])
  assert.equal(page.nextCursor,null)
  assert.equal(requests.length,1)
  assert.match(requests[0].url,/beforeId=abc-1/)
  assert.match(requests[0].url,/before=2026-10-18T12%3A30%3A00.000Z/)
  assert.equal(requests[0].header.Authorization,'Bearer '+'a'.repeat(64))
  assert.doesNotMatch(requests[0].url,/\/v1\/sync(?:\/|\?|$)/)
})
test('production private adapter remains disabled and 401 revokes AuthService access immediately',async()=>{
  const f=loadProductionPrivateAdapter()
  let count=0
  const backend=async()=>{count++;return {statusCode:200,data:{entries:[],nextCursor:null}}}
  const disabled=f.api.createPrivateApiRemote(f.auth,'',false,backend)
  await assert.rejects(disabled.listDrinks(),e=>e.code==='AUTH_REQUIRED')
  assert.equal(count,0)
  const active=f.api.createPrivateApiRemote(f.auth,'https://private.example.test',true,
    async()=>{count++;return {statusCode:401,data:{error:{code:'AUTH_UNAUTHORIZED'}}}})
  await assert.rejects(active.listDrinks(),e=>e.code==='AUTH_REQUIRED')
  assert.equal(f.isRevoked(),true)
  await assert.rejects(active.listDrinks(),e=>e.code==='AUTH_REQUIRED')
  assert.equal(count,1)
})


test('React immediately renders device storage failure instead of claiming cloud synced',async()=>{
  const f=example(),tree=await mount(f.cloud)
  const original=f.disk.set.bind(f.disk)
  f.disk.set=()=>{throw Error('private body must never appear: 老酒日记内容')}
  await act(async()=>{
    assert.throws(()=>f.cloud.createDrink(drink,'private-storage-reject-1'),
      e=>e.code==='STORAGE'&&!e.message.includes('老酒日记内容'))
  })
  assert.match(words(tree),/设备存储异常，尚未确认保存/)
  assert.doesNotMatch(words(tree),/已同步/)
  assert.doesNotMatch(words(tree),/老酒日记内容/)
  f.disk.set=original
  const recover=tree.root.findAllByType('Button')
    .find(x=>x.children.some(y=>typeof y==='string'&&y.includes('检查存储并恢复')))
  assert.ok(recover)
  await act(async()=>{recover.props.onClick()})
  assert.match(words(tree),/仅当前设备缓存/)
  await act(async()=>tree.unmount())
})
test('old in-flight 401 must NOT revoke a newly verified session of same or another account',async()=>{
  const f=loadProductionPrivateAdapter()
  let deliver
  const remote=f.api.createPrivateApiRemote(f.auth,'https://private.example.test',true,
    async()=>new Promise(resolve=>{deliver=resolve}))
  const old=remote.listDrinks()
  // Same account, fresh session: identity matches but bearer MUST also match.
  f.identity.accessToken='b'.repeat(64)
  deliver({statusCode:401,data:{error:{code:'AUTH_REVOKED'}}})
  await assert.rejects(old,e=>e.code==='AUTH_REQUIRED')
  assert.equal(f.isRevoked(),false)
  const newer=remote.listDrinks()
  f.identity.userId='verified-account-B'
  f.identity.accessToken='c'.repeat(64)
  deliver({statusCode:401,data:{error:{code:'AUTH_REVOKED'}}})
  await assert.rejects(newer,e=>e.code==='AUTH_REQUIRED')
  assert.equal(f.isRevoked(),false)
})
