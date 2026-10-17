const test = require('node:test')
const assert = require('node:assert/strict')
const theme = require('../miniprogram/utils/theme')
const tokens = require('../packages/design/tokens.json')

test('城市极简 A is the default and reuses the original brand brown', () => {
  assert.equal(tokens.default, 'minimal')
  assert.equal(theme.DEFAULT_THEME, tokens.default)
  assert.deepEqual(Object.keys(theme.THEMES), ['editorial', 'minimal', 'noir', 'pop'])
  assert.equal(theme.normalizeTheme('not-existing'), 'minimal')
  const colors = tokens.themes.minimal
  assert.deepEqual(colors, {
    background: '#F7F5F5', surface: '#FFFFFF', accent: '#82442F',
    foreground: '#242329', secondary: '#6F6D74', border: '#E6E6E8'
  })
  for (const key of ['background', 'surface', 'accent', 'foreground'])
    assert.equal(theme.THEMES.minimal[key], colors[key], key)
})

test('missing and invalid legacy preference use A; explicit editorial and other choices survive', () => {
  let persisted = ''
  const storageKeys = []
  global.wx = {
    getStorageSync(key) { storageKeys.push(key); return persisted },
    setStorageSync(key, value) { assert.equal(key, theme.STORAGE_KEY); persisted = value }
  }
  try {
    assert.equal(theme.getTheme(), 'minimal')
    assert.equal(theme.setTheme('noir'), true)
    assert.equal(theme.getTheme(), 'noir')
    assert.equal(theme.setTheme('editorial'), true)
    assert.equal(theme.getTheme(), 'editorial')
    assert.equal(theme.setTheme('unknown'), true)
    assert.equal(theme.getTheme(), 'minimal')
    assert.ok(storageKeys.every(key => key === 'jiuji-appearance-v1'))
  } finally { delete global.wx }
})

test('native tab/navigation colors follow A and preserve explicit theme states', () => {
  const calls = []
  let persisted = ''
  global.wx = {
    getStorageSync() { return persisted },
    setTabBarStyle(args) { calls.push(['tab', args]) },
    setNavigationBarColor(args) { calls.push(['nav', args]) }
  }
  const page = { setData(value) { calls.push(['data', value]) } }
  try {
    assert.equal(theme.applyTheme(page), 'minimal')
    assert.deepEqual(calls[0], ['data', { themeKey: 'minimal' }])
    assert.equal(calls[1][1].color, '#6F6D74')
    assert.equal(calls[1][1].selectedColor, '#82442F')
    assert.equal(calls[1][1].backgroundColor, '#FFFFFF')
    assert.equal(calls[2][1].backgroundColor, '#FFFFFF')
    calls.length = 0
    persisted = 'editorial'
    assert.equal(theme.applyTheme(page), 'editorial')
    assert.equal(calls[1][1].backgroundColor, '#F9F4EB')
    persisted = 'noir'
    assert.equal(theme.applyTheme(page), 'noir')
  } finally { delete global.wx }
})
