const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const model = require('../apps/wechat/src/pages/map/map-state.js')
const root = path.resolve(__dirname, '..')
const read = p => fs.readFileSync(path.join(root, p), 'utf8')
const verified = { id: 1, name: '真实酒吧 A', station: '东山口', searchKey: '酒吧A',
  status: 'official', addressHint: '东山口', locationSource: 'user-map-selection',
  location: { latitude: 23.12, longitude: 113.27 }, rating: null }
const noPosition = { id: 2, name: '真实酒吧 B', station: '石牌桥',
  status: 'listed', location: null, rating: null }
const untrusted = { ...verified, id: 3, name: '其他酒吧', locationSource: 'tencent-poi-name-match' }
const rows = [verified, noPosition, untrusted]

test('name, district and status filters share one dataset and do not imply open now', () => {
  assert.deepEqual(model.filterVenues(rows, ' 东山口 ', 'all').map(x => x.id), [1, 3])
  assert.deepEqual(model.filterVenues(rows, '石牌桥', 'listed').map(x => x.id), [2])
  assert.deepEqual(model.filterVenues(rows, '真实酒吧', 'official').map(x => x.id), [1])
  assert.deepEqual(model.filterVenues(rows, '不可能存在的名字', 'all'), [])
  assert.deepEqual(model.filterVenues(rows, '', 'all'), rows)
  assert.equal(noPosition.status, 'listed')
})

test('only finite Guangzhou coordinates with proven provenance create markers', () => {
  assert.equal(model.hasTrustedLocation(verified), true)
  assert.equal(model.hasTrustedLocation(noPosition), false)
  assert.equal(model.hasTrustedLocation(untrusted), false)
  assert.equal(model.hasTrustedLocation({ ...verified, locationSource: undefined }), false)
  assert.equal(model.hasTrustedLocation({ ...verified, location: { latitude: NaN, longitude: 113.27 } }), false)
  assert.equal(model.hasTrustedLocation({ ...verified, location: { latitude: 0, longitude: 0 } }), false)
  assert.equal(model.hasTrustedLocation({ ...verified, locationSource: 'official-confirmed' }), true)
  assert.equal(model.hasTrustedLocation({ ...verified, locationSource: 'verified-poi' }), true)
})

test('S0 preview, S1 selection, S2 expansion, clear and collapse are deterministic', () => {
  const s0 = { ...model.INITIAL_VIEW }
  assert.deepEqual(s0, { mode: 'map', sheet: 'peek', selectedId: null })
  const s1 = model.transitionView(s0, { type: 'select', id: 1 })
  assert.deepEqual(s1, { mode: 'map', sheet: 'selected', selectedId: 1 })
  const s2 = model.transitionView(s1, { type: 'expand' })
  assert.equal(s2.sheet, 'expanded')
  assert.equal(model.transitionView(s2, { type: 'collapse' }).sheet, 'selected')
  assert.deepEqual(model.transitionView(s2, { type: 'clear' }), s0)
  assert.equal(model.transitionView(s0, { type: 'expand' }).sheet, 'expanded')
  assert.equal(model.transitionView({ ...s0, sheet: 'expanded' }, { type: 'collapse' }).sheet, 'peek')
})

test('map and list share view state; filtering invalidates stale selection safely', () => {
  const selected = model.transitionView(model.INITIAL_VIEW, { type: 'select', id: 2 })
  const listing = model.transitionView(selected, { type: 'show-list' })
  assert.equal(listing.mode, 'list')
  assert.equal(listing.selectedId, 2)
  const back = model.transitionView(listing, { type: 'show-map' })
  assert.deepEqual(back, selected)
  const filtered = model.transitionView(listing, { type: 'filter' })
  assert.equal(filtered.mode, 'list')
  assert.equal(filtered.selectedId, null)
  assert.equal(filtered.sheet, 'peek')
  assert.deepEqual(model.transitionView(filtered, { type: 'show-map' }), model.INITIAL_VIEW)
})

test('location permission rejection gives manual-browsing fallback', () => {
  assert.match(model.locationErrorMessage({ errMsg: 'getLocation:fail auth deny' }), /未获得定位权限/)
  assert.match(model.locationErrorMessage(new Error('timeout')), /无法获取当前位置/)
  assert.match(model.locationErrorMessage({ errMsg: 'permission denied' }), /手动浏览/)
})

test('real Taro map, two shared filters and navigation actions are connected', () => {
  const map = read('apps/wechat/src/pages/map/index.tsx')
  for (const key of ['<Map ', 'onMarkerTap', 'filterVenues(venues, query, STATUS_OPTIONS[statusIndex].value)',
    'validPoint(bar.location) && hasTrustedLocation(bar)', 'displayed.slice(0, 2)',
    "type: 'select'", "type: 'clear'", "'show-list'", "'show-map'",
    "'expand'", "'collapse'", 'Taro.navigateTo', 'Taro.openLocation',
    'Taro.chooseLocation({})', 'Taro.getLocation', 'updateVenueLocation',
    'toggleFavorite(', 'onInput=', 'onClick=', 'refreshSites()', 'reloadSites()'])
    assert.ok(map.includes(key), key)
  assert.ok(!map.includes('addVenueVisit('), 'opening a map marker must not create a visit')
  assert.ok(!map.includes('Taro.setStorageSync('), 'map-only controls must not overwrite personal data')
})

test('manual coordinate selection is not mislabeled as independently verified', () => {
  const map = read('apps/wechat/src/pages/map/index.tsx')
  const detail = read('apps/wechat/src/pages/venue/index.tsx')
  assert.ok(map.includes('用户手动标记 · 未经平台核实'))
  assert.ok(map.includes('可显示点位'))
  assert.ok(detail.includes('用户手动标记 · 未经平台核实'))
  assert.ok(detail.includes('地图位置来源已核实'))
  assert.ok(!map.includes("'位置已核实'"))
  assert.ok(!detail.includes("'地图位置已核实'"))
})

test('venue keeps favorites, viewed history, correction and native routing', () => {
  const venue = read('apps/wechat/src/pages/venue/index.tsx')
  for(const key of ['addVenueVisit(', 'toggleFavorite(', 'favoriteIds()', 'getVenues()',
    'Taro.chooseLocation({})', 'Taro.openLocation', 'hasTrustedLocation(venue)',
    'updateVenueLocation(', 'STATUS_LABEL[venue.status]', 'priceText(venue)', 'ratingText(venue)'])
    assert.ok(venue.includes(key), key)
  assert.ok(!venue.includes('visit_session'))
  const source = read('apps/wechat/src/utils/venues.ts')
  for (const key of ['jiuji-react-bars-v1', 'gz-atlas-bars-v2',
    'jiuji-personal-v1:favorites', 'jiuji-personal-v1:history', 'user-map-selection'])
    assert.ok(source.includes(key), key)
  assert.ok(!source.includes('removeStorageSync('))
})

test('PR-01 palette, four tabs and native map rendering remain intact', () => {
  const app = read('apps/wechat/src/app.config.ts')
  for (const value of ['#F7F5F5', '#FFFFFF', '#82442F', '#6F6D74']) assert.ok(app.includes(value))
  for (const name of ['地图', '调酒', '社区', '我的']) assert.ok(app.includes("text: '" + name + "'"))
  const css = read('apps/wechat/src/pages/map/index.css')
  for (const value of ['#F7F5F5', '#FFFFFF', '#82442F', '#242329', '#6F6D74', '#E6E6E8'])
    assert.ok(css.includes(value), value)
  assert.doesNotMatch(css, /linear-gradient|radial-gradient|#903F59/i)
  assert.match(css, /native Map/)
  assert.ok(read('apps/wechat/src/pages/map/index.tsx').includes('iconPath: \'/assets/pin.png\''))
})
