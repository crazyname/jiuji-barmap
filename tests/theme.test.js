const test = require('node:test');
const assert = require('node:assert/strict');
const theme = require('../miniprogram/utils/theme');
test('C 城市编辑是默认风格，未来4款主题具备稳定键', () => {
  assert.equal(theme.DEFAULT_THEME, 'editorial');
  assert.deepEqual(Object.keys(theme.THEMES), ['editorial','minimal','noir','pop']);
  assert.equal(theme.normalizeTheme('not-existing'), 'editorial');
});
test('主题可保存在微信本地存储，非法主题回退C', () => {
  let persisted = '';
  global.wx = {
    getStorageSync(k) { assert.equal(k, theme.STORAGE_KEY); return persisted; },
    setStorageSync(k, v) { assert.equal(k, theme.STORAGE_KEY); persisted = v; }
  };
  assert.equal(theme.getTheme(), 'editorial');
  assert.equal(theme.setTheme('noir'), true);
  assert.equal(theme.getTheme(), 'noir');
  assert.equal(theme.setTheme('unknown'), true);
  assert.equal(theme.getTheme(), 'editorial');
  delete global.wx;
});
