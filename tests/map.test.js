const test = require('node:test');
const assert = require('node:assert/strict');
const { initialBars } = require('../miniprogram/data/bars');
const { filterBars, isValidPoint, buildMarkers, createPolylines } = require('../miniprogram/utils/map-data');
const seed = { line: 'all', status: 'all', price: 'all', rating: 'all', query: '' };

test('保留31家旧酒吧且不使用虚构地理坐标', () => {
  assert.equal(initialBars.length, 31);
  assert.deepEqual([...new Set(initialBars.map(b => b.id))].length, 31);
  assert(initialBars.every(b => b.location === null));
  assert.equal(buildMarkers(initialBars, null).length, 0);
});
test('站点/评分/预算和线路过滤按预期工作', () => {
  assert(filterBars(initialBars, { ...seed, line: '1' }).length > 0);
  assert.equal(filterBars(initialBars, { ...seed, query: 'Hope & Sesame' }).length, 1);
  assert.equal(filterBars(initialBars, { ...seed, price: '150' }).length, 2);
  assert.equal(filterBars(initialBars, { ...seed, rating: '4.5' }).length, 3);
});
test('不允许广州以外的 marker', () => {
  assert(!isValidPoint({ latitude: 35.6, longitude: 139.7 }));
  assert(isValidPoint({ latitude: 23.129, longitude: 113.32 }));
});
test('缺少站点坐标时不错误地连接远端两点', () => {
  const missing = { '公园前': { latitude: 23.131, longitude: 113.264 }, '广州东站': { latitude: 23.15, longitude: 113.324 } };
  assert.equal(createPolylines('1', missing).length, 0);
  assert.equal(createPolylines('all', missing).length, 0);
});
test('地图标记只生成已定位酒吧', () => {
  const b = { ...initialBars[0], location: { latitude: 23.13, longitude: 113.32 } };
  const markers = buildMarkers([b, initialBars[1]], b.id);
  assert.equal(markers.length, 1);
  assert.equal(markers[0].id, b.id);
  assert(markers[0].iconPath.endsWith('selected.png'));
});
