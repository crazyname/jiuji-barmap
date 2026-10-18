// Real React SyncStatus interactions on the real PR-08 queue coordinator.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { CloudJournalCoordinator, CloudSyncError } from '../packages/sync/private-cloud.ts'
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
  f.remote.listDrinks=async()=>({records:[],nextCursor:null})
  const first=f.cloud.createDrink(drink,'cloud-test-mutation-3')
  f.remote.createDrink=async(input,id)=>({
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
