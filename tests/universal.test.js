const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const { initialBars } = require('../miniprogram/data/bars.js');
const seed = JSON.parse(fs.readFileSync(path.join(root, 'apps/universal/data/bars.json'), 'utf8'));
const pages = JSON.parse(fs.readFileSync(path.join(root, 'apps/universal/pages.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'apps/universal/manifest.json'), 'utf8'));
test('source seed and uni-app x data remain aligned', () => {
 assert.deepEqual(seed.map(x => x.id), initialBars.map(x => x.id));
 assert.deepEqual(seed.map(x => x.name), initialBars.map(x => x.name));
 assert.ok(seed.every(x => x.location == null), 'Do not invent coordinates from an old illustrated map');
});
test('four tabs are in the agreed order', () => {
 assert.deepEqual(pages.tabBar.list.map(x => x.text), ['地图','调酒','社区','我的']);
 for(const t of pages.tabBar.list) assert.ok(fs.existsSync(path.join(root, 'apps/universal', t.iconPath)));
});
test('uni-app x project has supported targets and no credentials', () => {
 assert.ok(manifest['uni-app-x']);
 assert.ok(manifest['app-harmony']);
 assert.ok(manifest['app-android']);
 assert.ok(manifest['app-ios']);
 assert.ok(manifest['mp-weixin']);
 assert.equal(manifest.appid, '__UNI__REPLACE_ME');
});
test('C editorial page colors and native map shell remain intact', () => {
 const source=fs.readFileSync(path.join(root, 'apps/universal/pages/map/index.uvue'),'utf8');
 assert.match(source, /<map\s/);
 assert.match(source, /enable-scroll/);
 assert.match(source, /#82442f/);
 assert.match(source, /chooseLocation/);
});
