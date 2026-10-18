// PR-11: actual React community feed, card, full detail, draft editor interactions.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { CommunityRepository, CommunityError } from '../packages/core/src/community.ts'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const requireApp=createRequire(path.join(root,'apps/wechat/package.json'))
const React=requireApp('react'),{create,act}=requireApp('react-test-renderer')
const ts=requireApp('typescript')
const host=new Proxy({}, {get:(_target,key)=>String(key)})
function load(file){
  const code=fs.readFileSync(path.join(root,file),'utf8')
  const js=ts.transpileModule(code,{fileName:file,compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,
    esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText
  const mod={exports:{}}
  new Function('require','module','exports',js)(name=>{
    if(name==='react')return React
    if(name==='react/jsx-runtime')return requireApp('react/jsx-runtime')
    if(name==='@tarojs/components')return host
    if(name.includes('packages/core/src/community'))return {CommunityRepository,CommunityError}
    if(name.endsWith('.css'))return {}
    throw Error('Unexpected community import '+name)
  },mod,mod.exports)
  return mod.exports
}
const {CommunityFeed,CommunityPostCard,CommunityPostDetail,CommunityEditor,
  splitCommunityColumns}=load('apps/wechat/src/components/community/CommunityViews.tsx')
const now='2026-10-18T08:00:00.000Z'
const post=(n,extra={})=>({
  id:'post-'+n,title:n===1?'超长标题'.repeat(30):'公开笔记 '+n,
  body:'详细正文'.repeat(90),type:'general',barId:null,topics:['鸡尾酒'],images:[],
  isSponsored:false,sponsorName:null,authorUserId:'trusted-user',
  authorDisplayName:'经认证的作者',visibility:'public',
  moderationStatus:'approved',createdAt:now,updatedAt:now,revision:1,...extra
})
const text=tree=>JSON.stringify(tree.toJSON())
let serial=0
function fixture(){
  const disk=new Map(),user={id:'verified-user'}
  const repo=new CommunityRepository({
    identity:{verifiedUserId:()=>user.id},
    storage:{read:key=>disk.get(key),write:(key,x)=>disk.set(key,structuredClone(x))},
    newId:()=>String(++serial),now:()=>now
  })
  return {repo,disk,user}
}
async function render(element){let tree;await act(async()=>{tree=create(element)});return tree}
const clickByText=async(tree,label)=>{
  const button=tree.root.findAllByType('Button').find(x=>
    x.children.some(y=>typeof y==='string'&&y.includes(label)))
  assert.ok(button,'Missing button '+label)
  await act(async()=>{await button.props.onClick()})
}
test('actual dual-column React layout renders asymmetric no-image and licensed-image cards, not invented metrics',async()=>{
  const items=[post(1),post(2,{images:[{url:'https://cdn.example.test/licensed.jpg',
    source:'版权方授权',licensed:true,aspectRatio:0.55}]}),post(3),post(4)]
  const split=splitCommunityColumns(items)
  assert.equal(split[0].length+split[1].length,4)
  assert.equal(new Set([...split[0],...split[1]].map(x=>x.id)).size,4)
  const opened=[]
  const tree=await render(React.createElement(CommunityFeed,{
    posts:items,loading:false,error:null,available:true,onRetry:()=>{},
    onOpen:id=>opened.push(id),onCompose:()=>{},onDrafts:()=>{}
  }))
  assert.equal(tree.root.findAllByProps({className:'community-column'}).length,2)
  assert.equal(tree.root.findAllByProps({className:'community-card'}).length,4)
  assert.match(text(tree),/图文笔记/)
  assert.match(text(tree),/超长标题/)
  assert.doesNotMatch(text(tree),/点赞数|9999人点赞/)
  const cards=tree.root.findAllByProps({className:'community-card'})
  await act(async()=>{cards[0].props.onClick()})
  assert.equal(opened.length,1)
  assert.ok(items.some(x=>x.id===opened[0]))
  const picture=tree.root.findAllByType('Image')
  assert.equal(picture.length,1)
  assert.equal(picture[0].props.mode,'widthFix')
  await act(async()=>tree.unmount())
})
test('commercial advertising label is visible in card and full detail; show actual media source',async()=>{
  const ad=post(8,{isSponsored:true,type:'promotion',sponsorName:'明确声明的合作方',
    images:[{url:'https://images.example.test/source.jpg',source:'发布方合法授权',licensed:true}]})
  const card=await render(React.createElement(CommunityPostCard,{post:ad,onOpen:()=>{}}))
  assert.match(text(card),/广告/)
  assert.match(text(card),/明确声明的合作方/)
  const detail=await render(React.createElement(CommunityPostDetail,{post:ad,loading:false,
    error:null,onBack:()=>{},onRetry:()=>{},onReport:()=>{}}))
  assert.match(text(detail),/发布方合法授权/)
  assert.match(text(detail),/详细正文/)
  assert.match(text(detail),/举报这篇内容/)
  await act(async()=>{card.unmount();detail.unmount()})
})
test('feed empty/failed/loading statuses show accurate retry and no mock authors',async()=>{
  let retried=0
  const props={posts:[],available:false,onRetry:()=>{retried++},onOpen:()=>{},
    onCompose:()=>{},onDrafts:()=>{}}
  const empty=await render(React.createElement(CommunityFeed,{...props,loading:false,error:null}))
  assert.match(text(empty),/公开社区审核接口尚未接入/)
  assert.doesNotMatch(text(empty),/已认证作者/)
  const error=await render(React.createElement(CommunityFeed,{...props,available:true,
    loading:false,error:'超时'}))
  await clickByText(error,'重试')
  assert.equal(retried,1)
  const loading=await render(React.createElement(CommunityFeed,{...props,loading:true,error:null}))
  assert.match(text(loading),/正在读取已审核/)
  await act(async()=>{empty.unmount();error.unmount();loading.unmount()})
})
test('actual controlled React editor saves to scoped repository then reopens with retained content',async()=>{
  const f=fixture(),draft=f.repo.newDraft(),saved=[]
  const make=d=>React.createElement(CommunityEditor,{draft:d,repo:f.repo,venues:[],
    onSaved:x=>saved.push(x),onClose:()=>{},onDiscard:()=>{},allowSubmit:false})
  const tree=await render(make(draft))
  const inputs=tree.root.findAllByType('Input')
  await act(async()=>{inputs[0].props.onInput({detail:{value:'从私人记录改写的公开标题'}})})
  await act(async()=>{tree.root.findByType('Textarea').props.onInput({detail:{value:'只公开我自愿写的新正文'}})})
  await clickByText(tree,'预览拟公开内容')
  assert.match(text(tree),/从私人记录改写的公开标题/)
  assert.match(text(tree),/只公开我自愿写的新正文/)
  assert.match(text(tree),/不包含私人备注/)
  await clickByText(tree,'保存本机草稿')
  assert.equal(saved.length,1)
  assert.equal(saved[0].status,'local_draft')
  assert.equal(saved[0].title,'从私人记录改写的公开标题')
  assert.equal(f.repo.getDraft(draft.id).body,'只公开我自愿写的新正文')
  assert.match(text(tree),/尚未公开/)
  await act(async()=>tree.unmount())
  const again=await render(make(saved[0]))
  assert.equal(again.root.findAllByType('Input')[0].props.value,'从私人记录改写的公开标题')
  await act(async()=>again.unmount())
})
test('commercial promotion requires source before draft save; no phantom publishing',async()=>{
  const f=fixture(),draft=f.repo.newDraft(),tree=await render(
    React.createElement(CommunityEditor,{draft,repo:f.repo,venues:[],
      onSaved:()=>{},onClose:()=>{},onDiscard:()=>{},allowSubmit:false}))
  await act(async()=>{tree.root.findAllByType('Picker')[0].props.onChange({detail:{value:'3'}})})
  await clickByText(tree,'保存本机草稿')
  assert.match(text(tree),/商业推广/)
  assert.match(text(tree),/字段或商业推广信息无效/)
  assert.equal(f.repo.getDraft(draft.id).revision,1)
  const inputs=tree.root.findAllByType('Input')
  const sponsor=inputs.find(x=>x.props.placeholder?.includes('赞助方'))
  assert.ok(sponsor)
  await act(async()=>sponsor.props.onInput({detail:{value:'已声明合作方'}}))
  await clickByText(tree,'保存本机草稿')
  assert.equal(f.repo.getDraft(draft.id).sponsorName,'已声明合作方')
  assert.equal(f.repo.getDraft(draft.id).status,'local_draft')
  const submit=tree.root.findAllByType('Button').find(x=>
    x.children.some(c=>typeof c==='string'&&c.includes('提交审核')))
  assert.equal(submit.props.disabled,true)
  await act(async()=>tree.unmount())
})
test('preview/cancel/discard callbacks are separate; no private source row mutation',async()=>{
  const f=fixture(),d=f.repo.newDraft(),events=[]
  const tree=await render(React.createElement(CommunityEditor,{draft:d,repo:f.repo,
    venues:[],onSaved:()=>{},onClose:()=>events.push('close'),
    onDiscard:()=>events.push('discard')}))
  await clickByText(tree,'取消编辑')
  await clickByText(tree,'丢弃本机草稿')
  assert.deepEqual(events,['close','discard'])
  assert.ok(f.repo.getDraft(d.id))
  await act(async()=>tree.unmount())
})


test('React editor immediately hides a previous author draft after account switch',async()=>{
  const f=fixture(),d=f.repo.newDraft()
  f.repo.saveDraft(d.id,{title:'A 私密草稿标题',body:'A 草稿正文',
    type:'general',barId:null,topics:[],images:[],isSponsored:false,sponsorName:null},1)
  const current=f.repo.getDraft(d.id)
  const props={draft:current,repo:f.repo,venues:[],onSaved:()=>{},
    onClose:()=>{},onDiscard:()=>{},allowSubmit:false}
  const tree=await render(React.createElement(CommunityEditor,props))
  assert.match(text(tree),/A 私密草稿标题|A 草稿正文/)
  f.user.id='verified-user-B'
  await act(async()=>tree.update(React.createElement(CommunityEditor,props)))
  assert.match(text(tree),/账号已切换/)
  assert.doesNotMatch(text(tree),/A 私密草稿标题|A 草稿正文/)
  await act(async()=>tree.unmount())
})
test('actual community Tab page navigates from approved card to distinct detail route',async()=>{
  const approved=post(42,{title:'经过审核的帖子'})
  const navigations=[]
  const file='apps/wechat/src/pages/community/index.tsx'
  const code=fs.readFileSync(path.join(root,file),'utf8')
  const js=ts.transpileModule(code,{fileName:file,compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,
    esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText
  const mod={exports:{}}
  const source={publicAvailable:()=>true,listPublic:async()=>({posts:[approved],nextCursor:null})}
  new Function('require','module','exports',js)(name=>{
    if(name==='react')return React
    if(name==='react/jsx-runtime')return requireApp('react/jsx-runtime')
    if(name==='@tarojs/taro')return {__esModule:true,default:{
      navigateTo:async x=>{navigations.push(x.url)}
    },useDidShow:fn=>React.useEffect(fn,[])}
    if(name==='../../utils/custom-tabbar')return {useSyncCustomTabBar:()=>{}}
    if(name==='../../components/community/CommunityViews')return {CommunityFeed}
    if(name==='../../services/community')return {communityRepository:source}
    throw Error('Unexpected Taro community route import '+name)
  },mod,mod.exports)
  const tree=await render(React.createElement(mod.exports.default))
  await act(async()=>{await new Promise(resolve=>setImmediate(resolve))})
  const card=tree.root.findAllByProps({className:'community-card'})[0]
  assert.ok(card,'the approved card was rendered by the actual page')
  await act(async()=>card.props.onClick())
  assert.deepEqual(navigations,['/pages/community-detail/index?id=post-42'])
  await act(async()=>tree.unmount())
})
