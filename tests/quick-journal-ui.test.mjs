// SPDX-License-Identifier: MPL-2.0
// Real React controlled-form interactions and PR-03 TypeScript repository execution.
// TSX is transpiled by the same TypeScript compiler used for the strict project check;
// Taro host components are replaced only at the renderer boundary.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { createJournalRepository, JournalError } from '../packages/core/src/journal.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const appRequire = createRequire(path.join(root, 'apps/wechat/package.json'))
const React = appRequire('react')
const { create, act } = appRequire('react-test-renderer')
const ts = appRequire('typescript')
const host = new Proxy({}, { get: (_, key) => String(key) })
const nav = []
let actionIndex = 0
let cancelAction = false
const taro = {
  showActionSheet: async (_options) => {
    if (cancelAction) throw new Error('cancel')
    return { tapIndex: actionIndex }
  },
  navigateTo: async (options) => { nav.push({ type: 'page', url: options.url }) },
  switchTab: async (options) => { nav.push({ type: 'tab', url: options.url }) }
}
const mockTaro = { __esModule: true, default: taro }
const load = (file, extra = {}) => {
  const source = fs.readFileSync(path.join(root, file), 'utf8')
  const compiled = ts.transpileModule(source, { fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
  const mod = { exports: {} }
  const depend = (name) => {
    if (name === 'react') return React
    if (name === 'react/jsx-runtime') return appRequire('react/jsx-runtime')
    if (name === '@tarojs/components') return host
    if (name === '@tarojs/taro') return mockTaro
    if (name.endsWith('.css')) return {}
    if (name.includes('packages/core/src/journal')) return { JournalError, createJournalRepository }
    if (name === '../../services/journal-editor') return formLogic
    if (extra[name]) return extra[name]
    throw new Error('Unexpected runtime dependency: ' + name)
  }
  // Only application source is executed here, not a copy of its logic.
  new Function('require', 'module', 'exports', compiled)(depend, mod, mod.exports)
  return mod.exports
}
const formLogic = load('apps/wechat/src/services/journal-editor.ts')
const DrinkEditor = load('apps/wechat/src/components/journal/DrinkEditor.tsx').default
const VisitEditor = load('apps/wechat/src/components/journal/VisitEditor.tsx').default
const CustomTabBar = load('apps/wechat/src/custom-tab-bar/index.tsx').default

let sequence = 0
const id = () => 'ui-create-' + (++sequence).toString().padStart(5, '0')
const today = new Date(2026, 9, 17, 21, 20)
function fixture(user = 'verified-user') {
  const storage = new Map()
  let created = 0
  const repo = createJournalRepository({
    identity: () => user ? { kind: 'verified', userId: user } : null,
    newId: () => 'record-' + (++created).toString().padStart(5, '0'),
    now: () => '2026-10-17T13:00:00Z',
    storage: {
      read(key) { return storage.get(key) },
      write(key, value) { storage.set(key, structuredClone(value)) }
    }
  })
  return { repo, storage, created: () => created }
}
function input(tree, phrase) {
  const field = tree.root.findAllByType('Input').find(x => x.props.placeholder?.includes(phrase))
  assert.ok(field, 'Input missing: ' + phrase)
  return field
}
function textarea(tree, phrase) {
  const field = tree.root.findAllByType('Textarea').find(x => x.props.placeholder?.includes(phrase))
  assert.ok(field, 'Textarea missing: ' + phrase)
  return field
}
function saveButton(tree) {
  const button = tree.root.findAllByType('Button').find(x => x.props.className === 'journal-main')
  assert.ok(button, 'save button missing')
  return button
}
async function renderDrink(options = {}) {
  const f = options.fixture || fixture()
  const captured = []
  const cancelled = []
  let tree
  await act(async () => {
    tree = create(React.createElement(DrinkEditor, {
      repository: f.repo, authenticated: options.authenticated ?? true,
      venues: [{ id: 12, name: '确有收录的酒吧' }],
      catalog: options.catalog || [], initialDate: today,
      mutationIdFactory: id,
      onCancel: dirty => cancelled.push(dirty),
      onSaved: row => captured.push(row)
    }))
  })
  return { tree, captured, cancelled, f }
}
async function renderVisit(options = {}) {
  const f = options.fixture || fixture()
  const captured = []
  let tree
  await act(async () => {
    tree = create(React.createElement(VisitEditor, {
      repository: f.repo, authenticated: options.authenticated ?? true,
      venues: [{ id: 12, name: '确有收录的酒吧' }],
      initialDate: today, mutationIdFactory: id,
      onCancel: () => {}, onSaved: visit => captured.push(visit)
    }))
  })
  return { tree, captured, f }
}
function textOf(tree) { return JSON.stringify(tree.toJSON()) }

test('four real tabs use plus as ACTION, not a fifth native tab route', async () => {
  const config = fs.readFileSync(path.join(root, 'apps/wechat/src/app.config.ts'), 'utf8')
  assert.match(config, /custom:\s*true/)
  const list = [...config.matchAll(/pagePath:\s*'pages\/(map|mix|community|mine)\/index'/g)].map(x => x[1])
  assert.deepEqual(list, ['map', 'mix', 'community', 'mine'])
  for(const [index, name] of ['map','mix','community','mine'].entries()) {
    const src = fs.readFileSync(path.join(root, 'apps/wechat/src/pages', name, 'index.tsx'), 'utf8')
    assert.ok(src.includes('useSyncCustomTabBar(' + index + ')'))
  }
  let tree
  await act(async () => { tree = create(React.createElement(CustomTabBar)) })
  assert.equal(tree.root.findAllByProps({ ariaLabel: '打开记录与发布操作' }).length, 1)
  for (let tab = 0; tab < 4; tab++) {
    nav.length = 0
    await act(async () => { tree.getInstance().setSelected(tab) })
    actionIndex = 0
    await act(async () => { tree.root.findByProps({ ariaLabel: '打开记录与发布操作' }).props.onClick() })
    assert.deepEqual(nav, [{ type: 'page', url: '/pages/journal-drink/index' }])
    assert.equal(tree.getInstance().state.selected, tab)
  }
  await act(async () => { tree.unmount() })
})

test('native action sheet maps visit/community and cancel without route or state reset', async () => {
  let tree
  await act(async () => { tree = create(React.createElement(CustomTabBar)) })
  await act(async () => { tree.getInstance().setSelected(2) })
  nav.length = 0
  actionIndex = 1
  await act(async () => { tree.root.findByProps({ ariaLabel: '打开记录与发布操作' }).props.onClick() })
  assert.deepEqual(nav, [{ type: 'page', url: '/pages/journal-visit/index' }])
  actionIndex = 2
  await act(async () => { tree.root.findByProps({ ariaLabel: '打开记录与发布操作' }).props.onClick() })
  assert.deepEqual(nav.at(-1), { type: 'tab', url: '/pages/community/index' })
  const count = nav.length
  cancelAction = true
  await act(async () => { tree.root.findByProps({ ariaLabel: '打开记录与发布操作' }).props.onClick() })
  assert.equal(nav.length, count)
  assert.equal(tree.getInstance().state.selected, 2)
  cancelAction = false
  await act(async () => { tree.unmount() })
})

test('free drink name is valid without photos, rating, venue or knowledge ID', async () => {
  const { tree, captured, f } = await renderDrink()
  await act(async () => {
    input(tree, '尼格罗尼').props.onInput({ detail: { value: '我自己调的酒' } })
  })
  await act(async () => { saveButton(tree).props.onClick() })
  assert.equal(captured.length, 1)
  const stored = f.repo.listDrinks()[0]
  assert.equal(stored.drinkLabel, '我自己调的酒')
  assert.equal(stored.visibility, 'private')
  assert.equal(stored.cocktailId, null)
  assert.equal(stored.visitSessionId, null)
  assert.equal(stored.personalRating, null)
  assert.deepEqual(stored.photoRefs, [])
  await act(async () => { tree.unmount() })
})

test('scene switching conditionally renders only scene-specific fields', async () => {
  const { tree } = await renderDrink()
  assert.equal(tree.root.findAllByType('Picker').filter(x => x.props.mode === 'selector').length, 1)
  assert.ok(input(tree, '店内特调'))
  const options = tree.root.findAllByType('View').filter(x => x.props.className?.includes('journal-option'))
  assert.equal(options.length, 3)
  await act(async () => { options[1].props.onClick() })
  assert.equal(tree.root.findAllByType('Input').some(x => x.props.placeholder?.includes('店内特调')), false)
  assert.ok(textarea(tree, '配料、手法'))
  const other = tree.root.findAllByType('View').filter(x => x.props.className?.includes('journal-option'))[2]
  await act(async () => { other.props.onClick() })
  assert.equal(tree.root.findAllByType('Textarea').some(x => x.props.placeholder?.includes('配料、手法')), false)
  assert.ok(input(tree, '朋友聚会'))
  await act(async () => { tree.unmount() })
})

test('bar selection, menu label and private rating persist through real journal repository', async () => {
  const { tree, f, captured } = await renderDrink()
  await act(async () => {
    input(tree, '尼格罗尼').props.onInput({ detail: { value: '大都会' } })
    const picker = tree.root.findAllByType('Picker').find(x => x.props.mode === 'selector')
    picker.props.onChange({ detail: { value: '1' } })
    input(tree, '店内特调').props.onInput({ detail: { value: '酒单名称' } })
    input(tree, '0–5').props.onInput({ detail: { value: '4.5' } })
    textarea(tree, '喝起来怎么样').props.onInput({ detail: { value: '酸甜' } })
  })
  await act(async () => { saveButton(tree).props.onClick() })
  assert.equal(captured.length, 1)
  const saved = f.repo.listDrinks()[0]
  assert.equal(saved.contextDetails.bar.barId, 12)
  assert.equal(saved.contextDetails.bar.menuItem, '酒单名称')
  assert.equal(saved.personalRating, 4.5)
  assert.equal(saved.note, '酸甜')
  assert.equal(f.repo.listVisits().length, 0, 'bar selection never autogenerates visit')
  await act(async () => { tree.unmount() })
})

test('knowledge reference uses only offered catalog, not a fabricated cocktail record', async () => {
  const catalog = [{ id: 'catalog-martini', label: '马天尼' }]
  const { tree, f } = await renderDrink({ catalog })
  await act(async () => {
    const picker = tree.root.findAllByType('Picker').find(x => x.props.mode === 'selector')
    picker.props.onChange({ detail: { value: '1' } })
  })
  await act(async () => { saveButton(tree).props.onClick() })
  assert.equal(f.repo.listDrinks()[0].cocktailId, 'catalog-martini')
  await act(async () => { tree.unmount() })
})

test('validation feedback is visible, no repository write on blank name or bad score', async () => {
  const { tree, f } = await renderDrink()
  await act(async () => { saveButton(tree).props.onClick() })
  assert.match(textOf(tree), /请填写酒名/)
  assert.equal(f.repo.listDrinks().length, 0)
  await act(async () => {
    input(tree, '尼格罗尼').props.onInput({ detail: { value: '原创酒' } })
    input(tree, '0–5').props.onInput({ detail: { value: '8' } })
  })
  await act(async () => { saveButton(tree).props.onClick() })
  assert.match(textOf(tree), /个人评分需在/)
  assert.equal(f.repo.listDrinks().length, 0)
  await act(async () => { tree.unmount() })
})

test('unauthenticated real repository refuses writes and UI keeps typed text', async () => {
  const { tree, captured, f } = await renderDrink({ fixture: fixture(null), authenticated: false })
  assert.match(textOf(tree), /需要登录才能保存/)
  await act(async () => { input(tree, '尼格罗尼').props.onInput({ detail: { value: '不会丢的输入' } }) })
  await act(async () => { saveButton(tree).props.onClick() })
  assert.match(textOf(tree), /需要登录才能保存私人日记/)
  assert.equal(input(tree, '尼格罗尼').props.value, '不会丢的输入')
  assert.equal(captured.length, 0)
  assert.equal(f.storage.size, 0)
  assert.doesNotMatch(textOf(tree), /私人记录保存成功/)
  await act(async () => { tree.unmount() })
})

test('double taps trigger one real create call and show success once', async () => {
  const f = fixture()
  let count = 0
  const delegating = { ...f.repo, createDrink(...args) { count++; return f.repo.createDrink(...args) } }
  const { tree, captured } = await renderDrink({ fixture: { ...f, repo: delegating } })
  await act(async () => { input(tree, '尼格罗尼').props.onInput({ detail: { value: '重复点击测试' } }) })
  await act(async () => {
    saveButton(tree).props.onClick()
    saveButton(tree).props.onClick()
  })
  assert.equal(count, 1)
  assert.equal(captured.length, 1)
  assert.equal(f.repo.listDrinks().length, 1)
  await act(async () => { tree.unmount() })
})

test('empty visit is valid with no venue or drink, duplicate submit is rejected', async () => {
  const { tree, captured, f } = await renderVisit()
  await act(async () => {
    saveButton(tree).props.onClick()
    saveButton(tree).props.onClick()
  })
  assert.equal(captured.length, 1)
  assert.equal(f.repo.listVisits().length, 1)
  assert.equal(f.repo.listVisits()[0].barId, null)
  assert.equal(f.repo.listVisits()[0].placeLabel, null)
  assert.equal(f.repo.listDrinks().length, 0)
  await act(async () => { tree.unmount() })
})

test('visit editing and cancelling report unsaved changes, not a fake successful save', async () => {
  const { tree, captured } = await renderVisit({ fixture: fixture(null), authenticated: false })
  assert.match(textOf(tree), /需要登录才能保存/)
  await act(async () => { input(tree, '朋友家').props.onInput({ detail: { value: '家里聚会' } }) })
  await act(async () => { saveButton(tree).props.onClick() })
  assert.match(textOf(tree), /需要登录才能保存私人日记/)
  assert.equal(captured.length, 0)
  assert.equal(input(tree, '朋友家').props.value, '家里聚会')
  await act(async () => { tree.unmount() })
})

test('dedicated private journal entry points never invoke sites post, review or favorites writes', () => {
  const files = [
    'apps/wechat/src/services/journal-editor.ts',
    'apps/wechat/src/components/journal/DrinkEditor.tsx',
    'apps/wechat/src/components/journal/VisitEditor.tsx',
    'apps/wechat/src/pages/journal-drink/index.tsx',
    'apps/wechat/src/pages/journal-visit/index.tsx'
  ]
  for (const file of files) {
    const source = fs.readFileSync(path.join(root,file),'utf8')
    for (const forbidden of ['queueRemoteUpsert(', "publishedRows(", "addVenueVisit(", 'toggleFavorite(', 'setStorageSync(', "createPost("])
      assert.equal(source.includes(forbidden),false,file + ' contains '+forbidden)
  }
})
