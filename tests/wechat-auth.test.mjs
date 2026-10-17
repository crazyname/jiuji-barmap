// PR-06: execute the actual TypeScript AuthService and React AuthPanel against
// an explicit fake SERVER. No test session can be enabled in production.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { AuthService } from '../apps/wechat/src/services/auth-service.ts'
import { createJournalRepository } from '../packages/core/src/journal.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const requireApp = createRequire(path.join(root, 'apps/wechat/package.json'))
const React = requireApp('react')
const { create, act } = requireApp('react-test-renderer')
const ts = requireApp('typescript')
const host = new Proxy({}, { get: (_value, key) => String(key) })
function loadComponent(file, mocks = {}) {
  const script = fs.readFileSync(path.join(root, file), 'utf8')
  const compiled = ts.transpileModule(script, { fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
  const out = { exports: {} }
  function moduleRequire(name) {
    if (name === 'react') return React
    if (name === 'react/jsx-runtime') return requireApp('react/jsx-runtime')
    if (name === '@tarojs/components') return host
    if (name.endsWith('.css')) return {}
    if (name in mocks) return mocks[name]
    throw Error('Unexpected import: ' + name)
  }
  new Function('require', 'module', 'exports', compiled)(moduleRequire, out, out.exports)
  return out.exports
}
const hook = loadComponent('apps/wechat/src/utils/use-auth-state.ts')
const { AuthPanel } = loadComponent('apps/wechat/src/components/auth/AuthPanel.tsx', {
  '../../utils/use-auth-state': hook
})
const { PrivateLockedView } = loadComponent('apps/wechat/src/components/auth/PrivateLockedView.tsx')
const now0 = Date.parse('2026-10-18T00:00:00Z')
function fixture(options = {}) {
  let now = now0
  let code = 'temporary-wechat-code'
  let user = 'account-A'
  let rejected = false
  let revoked = false
  let wrongAccount = false
  let wrongSession = false
  let loginCalls = 0
  let exchangeCalls = 0
  let refreshCalls = 0
  let meCalls = 0
  let logoutCalls = 0
  let ttl = options.ttl ?? 15 * 60_000
  let serial = 0
  const tokens = () => ({ accessToken: 'server-access-token-' + ++serial,
    refreshToken: 'server-refresh-token-' + serial,
    accessExpiresAt: new Date(now + ttl).toISOString(), sessionId: 'session-secure-1' })
  const transport = {
    async exchange(received) {
      exchangeCalls++
      assert.equal(received, code)
      if (rejected) throw Error('Invalid code')
      return tokens()
    },
    async refresh(refreshToken) {
      refreshCalls++
      assert.ok(refreshToken.startsWith('server-refresh-token-'))
      if (rejected || revoked) throw Error('Revoked or expired')
      return tokens()
    },
    async me(accessToken) {
      meCalls++
      assert.ok(accessToken.startsWith('server-access-token-'))
      if (rejected) throw Error('401')
      return { account: { id: wrongAccount ? 'account-injected' : user, displayName: '服务器姓名',
        bindings: { wechat: true, phone: false, providers: ['wechat'] } },
        session: { id: wrongSession ? 'other-session' : 'session-secure-1',
          expiresAt: new Date(now + 2 * 60 * 60_000).toISOString(), revoked } }
    },
    async logout() { logoutCalls++ }
  }
  const service = new AuthService({
    enabled: options.enabled ?? true,
    wechatLogin: async () => {
      loginCalls++
      if (options.loginFailure) throw Error('WeChat API failed')
      return code
    },
    transport, now: () => now
  })
  return {
    service, transport,
    stats: () => ({loginCalls, exchangeCalls, refreshCalls, meCalls, logoutCalls}),
    clock: delta => { now += delta },
    setReject: v => { rejected = v },
    setRevoked: v => { revoked = v },
    setWrongAccount: v => { wrongAccount = v },
    setWrongSession: v => { wrongSession = v },
    setUser: v => { user = v },
    setCode: v => { code = v },
    setTtl: v => { ttl = v }
  }
}
function repository(auth) {
  const db = new Map()
  let n = 0
  const repo = createJournalRepository({
    identity: () => auth.verifiedIdentity(),
    storage: { read: key => db.get(key),
      write: (key, data) => db.set(key, structuredClone(data)) },
    newId: () => 'drink-' + ++n,
    now: () => new Date(now0).toISOString()
  })
  return { repo, db }
}
const drink = { drinkLabel: '私人酒', consumedAt: '2026-10-18T00:00:00Z', contextKind: 'home' }
function treeText(tree) { return JSON.stringify(tree.toJSON()) }
async function renderedPanel(service) {
  let tree
  await act(async () => { tree = create(React.createElement(AuthPanel, { service })) })
  return tree
}
function findButton(tree, phrase) {
  return tree.root.findAllByType('Button').find(b =>
    b.children.some(child => typeof child === 'string' && child.includes(phrase)))
}

test('WeChat temporary code exchanges only after server /me confirms matching session', async () => {
  const f = fixture()
  const states = []
  f.service.subscribe(state => states.push(state.status))
  await f.service.signIn()
  assert.deepEqual(f.stats(), { loginCalls: 1, exchangeCalls: 1,
    refreshCalls: 0, meCalls: 1, logoutCalls: 0 })
  assert.equal(f.service.getState().status, 'authenticated')
  assert.equal(f.service.verifiedIdentity().userId, 'account-A')
  assert.ok(states.includes('authenticating'))
  assert.equal(f.service.getState().account.bindings.wechat, true)
})

test('Taro.login-style rejection or missing code cannot reach exchange and leaves guest protected', async () => {
  const f = fixture({loginFailure:true})
  await f.service.signIn()
  assert.equal(f.service.getState().status,'error')
  assert.equal(f.stats().exchangeCalls,0)
  assert.equal(f.service.verifiedIdentity(),null)
  const empty = fixture()
  empty.setCode('')
  await empty.service.signIn()
  assert.equal(empty.stats().exchangeCalls,0)
  assert.equal(empty.service.getState().status,'error')
})

test('server 401/rejected exchange and forged /me session never create verified identity', async () => {
  const f=fixture()
  f.setReject(true)
  await f.service.signIn()
  assert.equal(f.service.getState().status,'error')
  assert.equal(f.service.verifiedIdentity(),null)
  f.setReject(false)
  f.setWrongSession(true)
  await f.service.signIn()
  assert.equal(f.service.getState().status,'error')
  assert.equal(f.service.verifiedIdentity(),null)
})

test('backend disabled by default returns error without even calling WeChat login', async () => {
  const f=fixture({enabled:false})
  await f.service.signIn()
  assert.equal(f.stats().loginCalls,0)
  assert.equal(f.stats().exchangeCalls,0)
  assert.equal(f.service.getState().status,'error')
  assert.equal(f.service.verifiedIdentity(),null)
})

test('near-expiry triggers token rotation and server /me recheck', async () => {
  const f=fixture({ttl:120_000})
  await f.service.signIn()
  f.clock(90_000)
  await f.service.checkSession()
  assert.equal(f.stats().refreshCalls,1)
  assert.equal(f.stats().meCalls,2)
  assert.equal(f.service.getState().status,'authenticated')
  assert.equal(f.service.verifiedIdentity().userId,'account-A')
})

test('expired access token rejects synchronous private reads before session network response', async () => {
  const f=fixture({ttl:70_000})
  await f.service.signIn()
  const {repo}=repository(f.service)
  repo.createDrink(drink,'auth-create-01')
  f.clock(71_000)
  assert.throws(()=>repo.listDrinks(),e=>e.code==='AUTH_REQUIRED')
  assert.equal(f.service.getState().status,'expired')
  assert.equal(f.service.verifiedIdentity(),null)
})

test('revocation or refresh failures erase identity without returning stale private records', async () => {
  const f=fixture({ttl:120_000})
  await f.service.signIn()
  const {repo}=repository(f.service)
  repo.createDrink(drink,'auth-create-02')
  f.clock(90_000)
  f.setRevoked(true)
  await f.service.checkSession()
  assert.equal(f.service.getState().status,'expired')
  assert.throws(()=>repo.listDrinks(),e=>e.code==='AUTH_REQUIRED')
  const second=fixture({ttl:120_000})
  await second.service.signIn()
  second.clock(90_000)
  second.setReject(true)
  await second.service.checkSession()
  assert.equal(second.service.getState().status,'expired')
})

test('logging out clears current private state before a pending server logout finishes', async () => {
  const f=fixture()
  await f.service.signIn()
  const {repo}=repository(f.service)
  repo.createDrink(drink,'auth-create-03')
  let finish
  const waiting=new Promise(resolve=>{finish=resolve})
  f.transport.logout=async()=>waiting
  const pending=f.service.signOut()
  assert.equal(f.service.getState().status,'guest')
  assert.equal(f.service.getState().account,null)
  assert.throws(()=>repo.listDrinks(),e=>e.code==='AUTH_REQUIRED')
  finish()
  await pending
})

test('different verified accounts cannot see each other and prior records remain isolated', async () => {
  const f=fixture()
  await f.service.signIn()
  const {repo,db}=repository(f.service)
  repo.createDrink(drink,'auth-create-04')
  await f.service.signOut()
  f.setUser('account-B')
  await f.service.signIn()
  assert.equal(f.service.verifiedIdentity().userId,'account-B')
  assert.deepEqual(repo.listDrinks(),[])
  repo.createDrink(drink,'auth-create-05')
  assert.equal(db.size,2)
  await f.service.signOut()
  f.setUser('account-A')
  await f.service.signIn()
  assert.equal(repo.listDrinks().length,1)
})

test('user-provided identity in a drink payload cannot impersonate a different account', async () => {
  const f=fixture()
  await f.service.signIn()
  const {repo}=repository(f.service)
  assert.throws(()=>repo.createDrink({...drink,ownerUserId:'account-evil'},'auth-create-06'),
    e=>e.code==='INVALID_INPUT')
  assert.equal(repo.listDrinks().length,0)
  const state=f.service.getState()
  state.account.id='account-evil'
  assert.equal(f.service.verifiedIdentity().userId,'account-A')
})

test('server me revalidation changes to another user are rejected rather than switched silently', async () => {
  const f=fixture()
  await f.service.signIn()
  f.setWrongAccount(true)
  await f.service.checkSession()
  assert.equal(f.service.getState().status,'expired')
  assert.equal(f.service.verifiedIdentity(),null)
})

test('authenticated React panel changes to guest and clears server account name on logout', async () => {
  const f=fixture()
  const tree=await renderedPanel(f.service)
  assert.match(treeText(tree),/访客模式/)
  await act(async()=>{findButton(tree,'微信登录').props.onClick();await Promise.resolve()})
  assert.match(treeText(tree),/已登录/)
  assert.match(treeText(tree),/服务器姓名/)
  await act(async()=>{findButton(tree,'安全退出').props.onClick();await Promise.resolve()})
  assert.match(treeText(tree),/访客模式/)
  assert.doesNotMatch(treeText(tree),/服务器姓名/)
  await act(async()=>tree.unmount())
})

test('React panel displays backend disabled, revoked and busy without faking success', async () => {
  const disabled=fixture({enabled:false})
  const tree=await renderedPanel(disabled.service)
  await act(async()=>{findButton(tree,'微信登录').props.onClick();await Promise.resolve()})
  assert.match(treeText(tree),/登录服务暂未开放/)
  assert.doesNotMatch(treeText(tree),/已登录/)
  await act(async()=>tree.unmount())
  const f=fixture()
  const authenticated=await renderedPanel(f.service)
  await act(async()=>{await f.service.signIn()})
  f.setRevoked(true)
  await act(async()=>{await f.service.checkSession()})
  assert.match(treeText(authenticated),/登录状态已失效/)
  assert.doesNotMatch(treeText(authenticated),/服务器姓名/)
  await act(async()=>authenticated.unmount())
})

test('two taps while login is pending result in one code exchange', async () => {
  let finish
  const pending=new Promise(resolve=>{finish=resolve})
  const f=fixture()
  const transport=f.transport
  const old=transport.exchange
  transport.exchange=async code=>{await pending;return old(code)}
  const first=f.service.signIn()
  const second=f.service.signIn()
  assert.equal(f.service.getState().status,'authenticating')
  finish()
  await Promise.all([first,second])
  assert.equal(f.stats().loginCalls,1)
  assert.equal(f.stats().exchangeCalls,1)
})

test('private locked React component never renders old journal list when auth is gone', async () => {
  const f=fixture()
  const views=[]
  const tree=create(React.createElement(PrivateLockedView,{
    state:f.service.getState(),onBack:()=>views.push('back')
  }))
  assert.match(treeText(tree),/需要登录才能查看私人记录/)
  assert.doesNotMatch(treeText(tree),/私人酒/)
  await act(async()=>{tree.root.findByType('Button').props.onClick()})
  assert.deepEqual(views,['back'])
  await act(async()=>tree.unmount())
})

test('memory-only state and legacy data keys are not modified by authorization', async () => {
  const f=fixture()
  const {db,repo}=repository(f.service)
  assert.throws(()=>repo.listVisits(),e=>e.code==='AUTH_REQUIRED')
  assert.equal(db.size,0)
  await f.service.signIn()
  await f.service.signOut()
  assert.equal(db.size,0)
})
