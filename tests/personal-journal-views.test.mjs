// PR-05: execute actual TypeScript repository + React components, not JSX-string assertions.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { createJournalRepository, JournalError } from '../packages/core/src/journal.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const requireApp = createRequire(path.join(root, 'apps/wechat/package.json'))
const React = requireApp('react')
const { create, act } = requireApp('react-test-renderer')
const ts = requireApp('typescript')
const hosts = new Proxy({}, { get: (_target, key) => String(key) })
let selectors
function load(file) {
  const source = fs.readFileSync(path.join(root, file), 'utf8')
  const compiled = ts.transpileModule(source, { fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
  const mod = { exports: {} }
  const dependency = (name) => {
    if (name === 'react') return React
    if (name === 'react/jsx-runtime') return requireApp('react/jsx-runtime')
    if (name === '@tarojs/components') return hosts
    if (name.endsWith('.css')) return {}
    if (name === '../../services/personal-journal-views') return selectors
    if (name.includes('packages/core/src/journal')) return { JournalError }
    throw new Error('Unexpected import ' + name)
  }
  new Function('require', 'module', 'exports', compiled)(dependency, mod, mod.exports)
  return mod.exports
}
selectors = load('apps/wechat/src/services/personal-journal-views.ts')
const { PersonalJournalList, PersonalJournalDetail } =
  load('apps/wechat/src/components/journal/PersonalJournalViews.tsx')
const date = '2026-10-17T18:00:00+08:00'
const earlier = '2026-10-15T18:00:00+08:00'
function fixture() {
  const snapshots = new Map()
  let currentUser = 'alice'
  let n = 0
  const writes = []
  const repository = createJournalRepository({
    identity: () => currentUser ? { kind: 'verified', userId: currentUser } : null,
    storage: {
      read(key) { return snapshots.get(key) },
      write(key, data) { writes.push(key); snapshots.set(key, structuredClone(data)) }
    },
    newId: () => 'id-' + String(++n).padStart(5, '0'),
    now: () => '2026-10-18T00:00:00Z'
  })
  return { repository, snapshots, writes, login: id => { currentUser = id } }
}
const bars = [{ id: 12, name: '真实收录店' }]
let mutation = 0
function addDrink(repo, name = '同款酒', consumedAt = date, visitSessionId = null, contextKind = 'bar') {
  return repo.createDrink({ drinkLabel: name, consumedAt, visitSessionId, contextKind,
    note: '这杯很清爽', personalRating: 4 }, 'view-mutation-' + (++mutation))
}
function addVisit(repo, when = date) {
  return repo.createVisit({ barId: 12, occurredAt: when, note: '探店备注' },
    'view-mutation-' + (++mutation))
}
function getText(tree) { return JSON.stringify(tree.toJSON()) }
function actions(tree, type) { return tree.root.findAllByType(type) }
function instanceText(instance) {
  return typeof instance === 'string' ? instance :
    (instance.children || []).map(instanceText).join('')
}
function button(tree, label) {
  const item = actions(tree, 'Button').find(x => instanceText(x).includes(label))
  assert.ok(item, 'Missing button ' + label)
  return item
}
async function renderList(mode, repository, extra = {}) {
  const openedDrinks = [], openedVisits = [], back = []
  let tree
  await act(async () => {
    tree = create(React.createElement(PersonalJournalList, {
      repository, mode, bars, onOpenDrink: id => openedDrinks.push(id),
      onOpenVisit: id => openedVisits.push(id), onBack: () => back.push(true), ...extra
    }))
  })
  return { tree, openedDrinks, openedVisits, back }
}
async function renderDetail(mode, recordId, repository, confirm = async () => true) {
  const openedDrinks = [], openedVisits = [], back = []
  let tree
  await act(async () => {
    tree = create(React.createElement(PersonalJournalDetail, {
      repository, mode, recordId, bars, confirm,
      onOpenDrink: id => openedDrinks.push(id),
      onOpenVisit: id => openedVisits.push(id), onBack: () => back.push(true)
    }))
  })
  return { tree, openedDrinks, openedVisits, back }
}

test('timeline orders distinct drink events newest first and opens original IDs', async () => {
  const f = fixture()
  const a = addDrink(f.repository, '第一杯', earlier)
  const b = addDrink(f.repository, '第二杯', date)
  const c = addDrink(f.repository, '第三杯', date)
  const result = await renderList('timeline', f.repository)
  const rows = actions(result.tree, 'View').filter(x => x.props.className === 'pv-row')
  assert.deepEqual(rows.map(x => JSON.stringify(x.toJSON()).match(/第[一二三]杯/)[0]), ['第二杯', '第三杯', '第一杯'])
  assert.equal(rows.length, 3)
  await act(async () => { rows[2].props.onClick() })
  assert.deepEqual(result.openedDrinks, [a.id])
  assert.notEqual(b.id, c.id)
  await act(async () => { result.tree.unmount() })
})

test('timeline filters date and context and shows empty-match feedback without merging', async () => {
  const f = fixture()
  addDrink(f.repository, '酒吧酒', earlier, null, 'bar')
  addDrink(f.repository, '自调酒', date, null, 'home')
  const { tree } = await renderList('timeline', f.repository)
  const pickers = actions(tree, 'Picker')
  await act(async () => { pickers.find(p=>p.props.mode==='selector').props.onChange({ detail: {value:'2'} }) })
  assert.match(getText(tree), /自调酒/)
  assert.doesNotMatch(getText(tree), /酒吧酒/)
  await act(async () => { actions(tree, 'Picker').find(p=>p.props.mode==='date').props.onChange({ detail: {value:'2020-01-01'} }) })
  assert.match(getText(tree), /没有符合筛选条件/)
  await act(async () => { tree.root.findAllByType('Text').find(x => x.props.className==='pv-clear').props.onClick() })
  assert.match(getText(tree), /自调酒/)
  await act(async () => { tree.unmount() })
})

test('archive preserves three independent same-ID-cocktail events under one collection', async () => {
  const f = fixture()
  const original = [0,1,2].map(i => f.repository.createDrink({
    drinkLabel:'马天尼', consumedAt: date, contextKind:'home', cocktailId:'kb-martini'
  }, 'view-mutation-' + (++mutation)))
  const { tree, openedDrinks } = await renderList('cocktails', f.repository)
  assert.equal(actions(tree,'View').filter(x=>x.props.className==='pv-row').length,1)
  await act(async () => { actions(tree,'View').find(x=>x.props.className==='pv-row').props.onClick() })
  const rows = actions(tree,'View').filter(x=>x.props.className==='pv-row')
  assert.equal(rows.length,3)
  await act(async () => { rows[1].props.onClick() })
  assert.equal(openedDrinks[0], original[1].id)
  assert.equal(f.repository.listDrinks().length,3)
  await act(async () => { tree.unmount() })
})

test('unmatched private custom cocktail name groups without creating public catalog entries', async () => {
  const f = fixture()
  addDrink(f.repository, ' 自创酒 ')
  addDrink(f.repository, '自创酒', earlier)
  const data = selectors.readArchive(f.repository)
  assert.equal(data.status,'ready')
  assert.equal(data.data.groups.length,1)
  assert.equal(data.data.groups[0].cocktailId,null)
  assert.equal(data.data.groups[0].entries.length,2)
  const { tree } = await renderList('cocktails',f.repository)
  assert.match(getText(tree),/自创酒/)
  await act(async () => { tree.unmount() })
})

test('two same-day visits remain distinct; one visit displays three linked drinks', async () => {
  const f=fixture()
  const a=addVisit(f.repository)
  const b=addVisit(f.repository)
  for(let i=0;i<3;i++)addDrink(f.repository,'特调 '+(i+1),date,a.id)
  const list=await renderList('footprints',f.repository)
  const rows=actions(list.tree,'View').filter(x=>x.props.className==='pv-row')
  assert.equal(rows.length,2)
  assert.match(getText(list.tree),/3 杯饮用记录/)
  assert.match(getText(list.tree),/0 杯饮用记录/)
  await act(async () => { rows[1].props.onClick() })
  assert.ok([a.id,b.id].includes(list.openedVisits[0]))
  const detail=await renderDetail('visit',a.id,f.repository)
  assert.equal(actions(detail.tree,'View').filter(x=>x.props.className==='pv-row').length,3)
  const child=actions(detail.tree,'View').find(x=>x.props.className==='pv-row')
  await act(async () => { child.props.onClick() })
  assert.equal(detail.openedDrinks.length,1)
  await act(async()=>{ list.tree.unmount();detail.tree.unmount() })
})

test('delete visit confirmation preserves every drink and clears all session references', async () => {
  const f=fixture(), v=addVisit(f.repository)
  for(let i=0;i<3;i++)addDrink(f.repository,'杯 '+i,date,v.id)
  const confirmations=[]
  const detail=await renderDetail('visit',v.id,f.repository,async (title,body)=>{
    confirmations.push(title+' '+body);return true
  })
  await act(async()=>{button(detail.tree,'删除这次探店').props.onClick()})
  assert.equal(confirmations.length,1)
  assert.match(confirmations[0],/解除/)
  assert.equal(f.repository.getVisit(v.id),null)
  assert.equal(f.repository.listDrinks().length,3)
  assert.ok(f.repository.listDrinks().every(d=>d.visitSessionId===null))
  assert.equal(detail.back.length,1)
  await act(async()=>{detail.tree.unmount()})
})

test('cancelled destructive confirmation leaves original facts unchanged', async () => {
  const f=fixture(),v=addVisit(f.repository),d=addDrink(f.repository,'取消删除',date,v.id)
  const detail=await renderDetail('drink',d.id,f.repository,async()=>false)
  await act(async()=>{button(detail.tree,'删除这条饮用记录').props.onClick()})
  assert.ok(f.repository.getDrink(d.id))
  assert.equal(detail.back.length,0)
  const visit=await renderDetail('visit',v.id,f.repository,async()=>false)
  await act(async()=>{button(visit.tree,'删除这次探店').props.onClick()})
  assert.ok(f.repository.getVisit(v.id))
  await act(async()=>{detail.tree.unmount();visit.tree.unmount()})
})

test('drink detail edits only personal note and score with expectedRevision', async () => {
  const f=fixture(),d=addDrink(f.repository)
  const prompts=[]
  const detail=await renderDetail('drink',d.id,f.repository,async title=>{prompts.push(title);return true})
  await act(async()=>{button(detail.tree,'编辑私人感受与评分').props.onClick()})
  await act(async()=>{
    actions(detail.tree,'Textarea').find(x=>x.props.className==='pv-area')
      .props.onInput({detail:{value:'新的私人感受'}})
    actions(detail.tree,'Input').find(x=>x.props.className==='pv-input')
      .props.onInput({detail:{value:'3.5'}})
  })
  await act(async()=>{button(detail.tree,'确认保存修改').props.onClick()})
  const changed=f.repository.getDrink(d.id)
  assert.equal(changed.note,'新的私人感受')
  assert.equal(changed.personalRating,3.5)
  assert.equal(changed.revision,d.revision+1)
  assert.equal(changed.visibility,'private')
  assert.deepEqual(prompts,['确认修改私人记录'])
  await act(async()=>{detail.tree.unmount()})
})

test('stale expectedRevision is rejected, reloaded and never silently overwrites', async () => {
  const f=fixture(),d=addDrink(f.repository)
  const detail=await renderDetail('drink',d.id,f.repository,async()=>{
    const current=f.repository.getDrink(d.id)
    f.repository.updateDrink(d.id,{note:'另一端更新'},current.revision)
    return true
  })
  await act(async()=>{button(detail.tree,'编辑私人感受与评分').props.onClick()})
  await act(async()=>{button(detail.tree,'确认保存修改').props.onClick()})
  assert.equal(f.repository.getDrink(d.id).note,'另一端更新')
  assert.match(getText(detail.tree),/记录已更新/)
  await act(async()=>{detail.tree.unmount()})
})

test('detach and correct association via picker keep drink ID, use confirmation and revisions', async () => {
  const f=fixture(),a=addVisit(f.repository),b=addVisit(f.repository)
  const original=addDrink(f.repository,'关联酒',date,a.id)
  const detail=await renderDetail('drink',original.id,f.repository)
  const choose = async value => {
    await act(async()=>{actions(detail.tree,'Picker')[0].props.onChange({detail:{value:String(value)}})})
  }
  await choose(0)
  assert.equal(f.repository.getDrink(original.id).visitSessionId,null)
  await choose(2)
  assert.equal(f.repository.getDrink(original.id).visitSessionId,b.id)
  assert.equal(f.repository.getDrink(original.id).id,original.id)
  assert.equal(f.repository.listDrinks().length,1)
  await act(async()=>{detail.tree.unmount()})
})

test('unauthenticated views never reveal private rows, including on error retry', async () => {
  const f=fixture(),drink=addDrink(f.repository,'不应显示的私密酒'),visit=addVisit(f.repository)
  f.login(null)
  for(const mode of ['timeline','footprints','cocktails']) {
    const list=await renderList(mode,f.repository)
    assert.match(getText(list.tree),/尚未登录/)
    assert.doesNotMatch(getText(list.tree),/不应显示的私密酒/)
    assert.equal(actions(list.tree,'View').filter(x=>x.props.className==='pv-row').length,0)
    await act(async()=>{list.tree.unmount()})
  }
  for(const [mode,recordId] of [['drink',drink.id],['visit',visit.id]]) {
    const detail=await renderDetail(mode,recordId,f.repository)
    assert.match(getText(detail.tree),/尚未登录/)
    assert.equal(actions(detail.tree,'Button').some(x=>instanceText(x).includes('删除')),false)
    await act(async()=>{detail.tree.unmount()})
  }
})

test('different verified users cannot read or use each other’s record IDs', async () => {
  const f=fixture(),a=addDrink(f.repository,'Alice 隐私内容'),v=addVisit(f.repository)
  f.login('bob')
  const list=await renderList('timeline',f.repository)
  assert.match(getText(list.tree),/还没有私人饮用记录/)
  assert.doesNotMatch(getText(list.tree),/Alice 隐私内容/)
  const detail=await renderDetail('drink',a.id,f.repository)
  assert.match(getText(detail.tree),/不存在或已被删除/)
  assert.throws(()=>f.repository.linkDrink(a.id,v.id,1),e=>e?.code==='NOT_FOUND')
  await act(async()=>{list.tree.unmount();detail.tree.unmount()})
})

test('storage error displays retry; missing details/empty lists do not invent records', async () => {
  const f=fixture()
  const broken={...f.repository,listDrinks(){throw Error('disk failure')}}
  const list=await renderList('timeline',broken)
  assert.match(getText(list.tree),/载入失败/)
  assert.ok(button(list.tree,'重新加载'))
  const detail=await renderDetail('drink','missing',f.repository)
  assert.match(getText(detail.tree),/不存在或已被删除/)
  await act(async()=>{list.tree.unmount();detail.tree.unmount()})
  const empty=await renderList('footprints',f.repository)
  assert.match(getText(empty.tree),/浏览过的酒吧不会自动计入足迹/)
  await act(async()=>{empty.tree.unmount()})
})

test('return navigation is invoked without changing repository state', async () => {
  const f=fixture(),before=f.writes.length
  const list=await renderList('timeline',f.repository)
  await act(async()=>{button(list.tree,'返回我的').props.onClick()})
  assert.equal(list.back.length,1)
  assert.equal(f.writes.length,before)
  await act(async()=>{list.tree.unmount()})
})

test('legacy personal keys, four tabs and community writes are not touched by private views',()=>{
  const mine=fs.readFileSync(path.join(root,'apps/wechat/src/pages/mine/index.tsx'),'utf8')
  for(const label of ['饮酒日记','酒吧足迹','我的酒款','收藏','浏览记录','我的配方','我的分享','设置与隐私'])
    assert.ok(mine.includes(label),label)
  const app=fs.readFileSync(path.join(root,'apps/wechat/src/app.config.ts'),'utf8')
  assert.equal([...app.matchAll(/pagePath:\s*'pages\/(map|mix|community|mine)\/index'/g)].length,4)
  for(const key of ['jiuji-personal-v1:history','jiuji.react.recipes','jiuji.react.posts',
    'jiuji.react.profile'])assert.ok(mine.includes(key),key)
  for(const file of ['apps/wechat/src/services/personal-journal-views.ts',
    'apps/wechat/src/components/journal/PersonalJournalViews.tsx']) {
    const code=fs.readFileSync(path.join(root,file),'utf8')
    for(const operation of ['queueRemoteUpsert(', 'setStorageSync(', 'addVenueVisit(', 'createPost('])
      assert.ok(!code.includes(operation),file+' contains '+operation)
  }
})
