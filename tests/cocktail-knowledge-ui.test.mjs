import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createRequire} from 'node:module'
import {validateCocktailCatalog,searchCocktails,variantsForCocktail,legacyRecipePreview} from '../packages/core/src/cocktails.ts'
import {createJournalRepository} from '../packages/core/src/journal.ts'
import {JournalError} from '../packages/core/src/journal.ts'
import {CloudSyncError} from '../packages/sync/private-cloud.ts'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const requireApp=createRequire(path.join(root,'apps/wechat/package.json'))
const React=requireApp('react'), {create,act}=requireApp('react-test-renderer')
const ts=requireApp('typescript'), host=new Proxy({}, {get:(_,key)=>String(key)})
const data=validateCocktailCatalog(JSON.parse(fs.readFileSync(
 path.join(root,'apps/wechat/src/data/cocktail-knowledge.json'),'utf8')))
const disk=new Map(),KEY='jiuji.react.recipes'
let writes=0
const taro={getStorageSync:k=>disk.get(k)||'',setStorageSync:(k,v)=>{writes++;disk.set(k,structuredClone(v))},
 getNetworkType:async()=>({networkType:'none'}),navigateTo:async()=>{}}
let CatalogView
function load(file){
 const compiled=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{
  fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,
    jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText
 const mod={exports:{}}
 new Function('require','module','exports',compiled)(name=>{
  if(name==='react')return React
  if(name==='react/jsx-runtime')return requireApp('react/jsx-runtime')
  if(name==='@tarojs/components')return host
  if(name==='@tarojs/taro')return {__esModule:true,default:taro,
    useDidShow:fn=>React.useEffect(fn,[])}
  if(name.endsWith('.css'))return {}
  if(name.includes('packages/core/src/cocktails'))return {searchCocktails,variantsForCocktail,
    validateCocktailCatalog,legacyRecipePreview}
  if(name==='../../services/journal-editor')return journal
  if(name.includes('packages/core/src/journal'))return {JournalError}
  if(name.includes('packages/sync/private-cloud'))return {CloudSyncError}
  if(name==='../../services/cocktail-knowledge')return {knowledgeCatalog:data}
  if(name==='../../components/cocktails/CocktailKnowledgeView')return {CocktailKnowledgeView:CatalogView}
  if(name==='../../services/sync')return {publishedRows:()=>[],
    queueRemoteUpsert:()=>{throw Error('private draft must not be published')}}
  if(name==='../../utils/custom-tabbar')return {useSyncCustomTabBar:()=>{}}
  throw Error('unexpected dependency '+name)
 },mod,mod.exports)
 return mod.exports
}
const journal=load('apps/wechat/src/services/journal-editor.ts')
CatalogView=load('apps/wechat/src/components/cocktails/CocktailKnowledgeView.tsx').CocktailKnowledgeView
const DrinkEditor=load('apps/wechat/src/components/journal/DrinkEditor.tsx').default
const MixPage=load('apps/wechat/src/pages/mix/index.tsx').default
async function mount(element){let t;await act(async()=>{t=create(element)});return t}
const text=t=>JSON.stringify(t.toJSON())
test('public read-only React catalog works without login and supports Chinese/alias search',async()=>{
 const opened=[]
 const t=await mount(React.createElement(CatalogView,{data,mode:'catalog',offline:true,
  onOpenCocktail:id=>opened.push(id)}))
 assert.match(text(t),/玛格丽特/)
 assert.match(text(t),/尼格罗尼/)
 assert.match(text(t),/来源已逐项核对/)
 assert.match(text(t),/离线/)
 const input=t.root.findByType('Input')
 await act(async()=>input.props.onInput({detail:{value:'内格罗尼'}}))
 assert.match(text(t),/尼格罗尼/)
 assert.doesNotMatch(text(t),/玛格丽特/)
 await act(async()=>input.props.onInput({detail:{value:'不存在'}}))
 assert.match(text(t),/没有匹配的酒款/)
 await act(async()=>t.unmount())
})
test('React recipe variant details display original-source trace, amounts and steps',async()=>{
 const t=await mount(React.createElement(CatalogView,{data,mode:'variant',id:'margarita-iba-2026'}))
 for(const phrase of ['50 ml','20 ml','15 ml','iba-world.com','摇匀后滤入','来源已逐项核对'])
  assert.match(text(t),new RegExp(phrase))
 await act(async()=>t.unmount())
})
test('unknown recipe version never falls back to another recipe',async()=>{
 const t=await mount(React.createElement(CatalogView,{data,mode:'variant',id:'not-found'}))
 assert.match(text(t),/找不到这个配方版本/)
 assert.doesNotMatch(text(t),/50 ml/)
 await act(async()=>t.unmount())
})
function repo(){
 const m=new Map();let n=0
 return createJournalRepository({identity:()=>({kind:'verified',userId:'kb-ui-user'}),
  storage:{read:k=>m.get(k),write:(k,v)=>m.set(k,structuredClone(v))},
  newId:()=> 'kb-entry-'+(++n),now:()=>new Date().toISOString()})
}
const options=[{id:'margarita',label:'玛格丽特',
  variants:[{id:'margarita-iba-2026',label:'IBA 配方'}]}]
function picker(t,first){return t.root.findAllByType('Picker')
 .find(x=>Array.isArray(x.props.range)&&x.props.range[0]===first)}
test('real DrinkEditor selects a recipe version and persists both IDs in private repository',async()=>{
 const saved=[]
 const t=await mount(React.createElement(DrinkEditor,{
  repository:repo(),authenticated:true,venues:[],catalog:options,
  onCancel:()=>{},onSaved:x=>saved.push(x)}))
 assert.ok(picker(t,'自由填写酒名'))
 await act(async()=>picker(t,'自由填写酒名').props.onChange({detail:{value:'1'}}))
 assert.ok(picker(t,'仅关联酒款'))
 await act(async()=>picker(t,'仅关联酒款').props.onChange({detail:{value:'1'}}))
 const btn=t.root.findAllByType('Button').find(x=>x.children.includes('保存到私人日记'))
 await act(async()=>{btn.props.onClick();await Promise.resolve()})
 assert.equal(saved.length,1)
 assert.equal(saved[0].cocktailId,'margarita')
 assert.equal(saved[0].recipeVariantId,'margarita-iba-2026')
 assert.equal(saved[0].visibility,'private')
 await act(async()=>t.unmount())
})
test('typing a free drink name clears explicit cocktail and version association',async()=>{
 const saved=[]
 const t=await mount(React.createElement(DrinkEditor,{
  repository:repo(),authenticated:true,venues:[],catalog:options,
  onCancel:()=>{},onSaved:x=>saved.push(x)}))
 await act(async()=>picker(t,'自由填写酒名').props.onChange({detail:{value:'1'}}))
 await act(async()=>picker(t,'仅关联酒款').props.onChange({detail:{value:'1'}}))
 const name=t.root.findAllByType('Input').find(x=>String(x.props.placeholder).includes('例如：尼格罗尼'))
 await act(async()=>name.props.onInput({detail:{value:'个人创造实验'}}))
 const btn=t.root.findAllByType('Button').find(x=>x.children.includes('保存到私人日记'))
 await act(async()=>{btn.props.onClick();await Promise.resolve()})
 assert.equal(saved.length,1)
 assert.equal(saved[0].drinkLabel,'个人创造实验')
 assert.equal(saved[0].cocktailId,null)
 assert.equal(saved[0].recipeVariantId,null)
 await act(async()=>t.unmount())
})
test('MixPage keeps old draft bytes and never calls Sites public recipe mutation',async()=>{
 const old=[{id:'old-draft',title:'私人历史草稿',
  ingredients:'少量酒精与果汁适量',steps:'原始步骤',extra:'保留字段'}]
 disk.set(KEY,structuredClone(old));writes=0
 const t=await mount(React.createElement(MixPage))
 assert.deepEqual(disk.get(KEY),old)
 assert.match(text(t),/私人历史草稿/)
 assert.match(text(t),/未核实/)
 const name=t.root.findAllByType('Input').find(x=>x.props.placeholder==='私人草稿：酒款名称')
 const areas=t.root.findAllByType('Textarea')
 await act(async()=>name.props.onInput({detail:{value:'本机新草稿'}}))
 await act(async()=>areas[0].props.onInput({detail:{value:'适量苏打'}}))
 await act(async()=>areas[1].props.onInput({detail:{value:'轻轻搅拌'}}))
 const button=t.root.findAllByType('Button').find(x=>x.children.includes('仅存本机草稿'))
 await act(async()=>button.props.onClick())
 assert.equal(writes,1)
 assert.equal(disk.get(KEY).length,2)
 assert.deepEqual(disk.get(KEY)[1],old[0])
 assert.equal(disk.get(KEY)[0].visibility,'private')
 await act(async()=>t.unmount())
})
