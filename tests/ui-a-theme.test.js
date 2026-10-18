const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const read = p => fs.readFileSync(path.join(root, p), 'utf8')
const tabPaths = ['map', 'mix', 'community', 'mine']

test('Taro and old native window and four-tab palettes agree with A', () => {
  const taro = read('apps/wechat/src/app.config.ts')
  const native = JSON.parse(read('miniprogram/app.json'))
  assert.match(taro, /backgroundColor:\s*'#F7F5F5'/)
  assert.match(taro, /navigationBarBackgroundColor:\s*'#FFFFFF'/)
  assert.match(taro, /selectedColor:\s*'#82442F'/)
  assert.match(taro, /color:\s*'#6F6D74'/)
  assert.equal(native.window.backgroundColor, '#F7F5F5')
  assert.equal(native.window.navigationBarBackgroundColor, '#FFFFFF')
  assert.equal(native.tabBar.backgroundColor, '#FFFFFF')
  assert.equal(native.tabBar.selectedColor, '#82442F')
  assert.equal(native.tabBar.color, '#6F6D74')
  assert.equal(native.tabBar.list.length, 4)
  for (const name of ['地图','调酒','社区','我的']) assert.ok(native.tabBar.list.some(t => t.text === name))
})

test('old A rose palette is absent from both clients and shared tokens', () => {
  const files = [
    'packages/design/tokens.json', 'miniprogram/utils/theme.js',
    'miniprogram/styles/theme.wxss', 'miniprogram/styles/content.wxss',
    'miniprogram/pages/index/index.wxss', 'apps/wechat/src/app.css',
    'apps/wechat/src/pages/shared.css', 'apps/wechat/src/pages/map/index.css',
    'apps/wechat/src/pages/mine/index.css', 'apps/wechat/src/pages/venue/index.css'
  ]
  for (const file of files) {
    assert.doesNotMatch(read(file), /#903f59/i, file)
  }
})

test('the four Taro tabs use the same quiet canvas, white surfaces and text hierarchy', () => {
  const styles = [
    'apps/wechat/src/pages/shared.css',
    'apps/wechat/src/pages/map/index.css',
    'apps/wechat/src/pages/mine/index.css'
  ]
  for (const css of styles) {
    const source = read(css)
    for (const color of ['#F7F5F5', '#FFFFFF', '#242329', '#6F6D74', '#E6E6E8'])
      assert.ok(source.includes(color), css + ' missing ' + color)
    assert.doesNotMatch(source, /linear-gradient|radial-gradient/i)
  }
  for (const name of tabPaths) {
    const jsx = read('apps/wechat/src/pages/' + name + '/index.tsx')
    assert.doesNotMatch(jsx, /JIUJI \/ (?:BAR MAP|RECIPES|COMMUNITY|ACCOUNT)/)
  }
})

test('visual-only update retains real map, filtering, recipes, posts and local profile', () => {
  const map = read('apps/wechat/src/pages/map/index.tsx')
  for (const token of ['<Map ', 'validPoint(bar.location)', 'STATUS_OPTIONS[statusIndex]',
    'onMarkerTap', 'updateVenueLocation(', 'Taro.openLocation(', 'transitionView(current'])
    assert.ok(map.includes(token), token)
  const mix = read('apps/wechat/src/pages/mix/index.tsx')
  const social = read('apps/wechat/src/pages/community/index.tsx')
  const mine = read('apps/wechat/src/pages/mine/index.tsx')
  assert.ok(mix.includes('Taro.setStorageSync(KEY,next)'))
  assert.ok(mix.includes('publishedRows'))
  assert.ok(!mix.includes('queueRemoteUpsert('), 'private recipe drafts must not enter public Sites queue')
  assert.ok(social.includes('Taro.setStorageSync(KEY,next)'))
  assert.ok(social.includes('queueRemoteUpsert('))
  assert.ok(mine.includes('Taro.setStorageSync(PROFILE_KEY'))
  assert.ok(mine.includes('favoriteIds()'))
  assert.ok(mine.includes('readVisits()'))
  assert.ok(mine.includes('clearVisits()'))
  assert.ok(read('miniprogram/utils/theme.js').includes("jiuji-appearance-v1"))
})
