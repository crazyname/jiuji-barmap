const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const load = file => fs.readFileSync(path.join(root, file), 'utf8')

test('Taro registers bar details as a non-tab page', () => {
 const app = load('apps/wechat/src/app.config.ts')
 assert.match(app, /'pages\/venue\/index'/)
 assert.match(app, /requiredPrivateInfos:\s*\['chooseLocation'\]/)
 for(const tab of ['地图','调酒','社区','我的']) assert.ok(app.includes("text: '" + tab + "'"))
})

test('React map can filter venue status and uses verified positions only', () => {
 const src=load('apps/wechat/src/pages/map/index.tsx')
 assert.match(src, /STATUS_OPTIONS\[statusIndex\]/)
 assert.match(src, /validPoint\(bar\.location\)/)
 assert.match(src, /<Map\s/)
 assert.match(src, /onMarkerTap/)
 assert.match(src, /Taro\.navigateTo/)
 assert.match(src, /Taro\.chooseLocation\(\{\}\)/)
})

test('React venue page offers native navigation, location correction and favorites', () => {
 const src=load('apps/wechat/src/pages/venue/index.tsx')
 for(const token of ['Taro.openLocation','Taro.chooseLocation({})','updateVenueLocation',
   'toggleFavorite','addVenueVisit','getVenues','STATUS_LABEL']) assert.ok(src.includes(token),token)
 const legacy=load('miniprogram/utils/content.js')
 assert.ok(legacy.includes("jiuji-personal-v1:"))
})

test('Taro local storage reads old venue and personal record keys without clearing them', () => {
 const source=load('apps/wechat/src/utils/venues.ts')
 for(const key of ['jiuji-react-bars-v1','gz-atlas-bars-v2','jiuji-personal-v1:favorites',
   'jiuji-personal-v1:history','validPoint','setStorageSync'])
   assert.ok(source.includes(key),key)
 assert.ok(!source.includes('removeStorageSync'))
})
