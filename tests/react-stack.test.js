const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');const json=p=>JSON.parse(read(p));
const bars=json('apps/wechat/src/data/bars.json'),mobile=json('apps/mobile/src/data/bars.json');
const {initialBars}=require('../miniprogram/data/bars');
test('both React clients share the same 31 bar records without fake coordinates',()=>{
 assert.deepEqual(bars,mobile);
 assert.deepEqual(bars.map(b=>b.id),initialBars.map(b=>b.id));
 assert.ok(bars.every(b=>b.location===null));
});
test('Taro and Expo use React with TypeScript and real map components',()=>{
 const taro=json('apps/wechat/package.json'),expo=json('apps/mobile/package.json');
 assert.ok(taro.dependencies['@tarojs/taro']);
 assert.ok(expo.dependencies['react-native']);
 assert.ok(read('apps/wechat/src/pages/map/index.tsx').includes('<Map '));
 assert.ok(read('apps/mobile/App.tsx').includes('<MapView '));
});
test('Taro tabs are map, mix, community and mine, without uni-app x',()=>{
 const tabs=read('apps/wechat/src/app.config.ts');
 const order=['地图','调酒','社区','我的'].map(t=>tabs.indexOf("text: '"+t+"'"));
 assert.ok(order.every(i=>i>=0));
 assert.deepEqual(order,[...order].sort((a,b)=>a-b));
 assert.ok(!fs.existsSync(path.join(root,'apps/universal')));
});
test('platform matrix leaves Harmony native compilation unverified',()=>{
 const matrix=json('docs/platforms.json');
 assert.ok(matrix.features.every(f=>f.harmony!=='verified'));
 assert.ok(fs.existsSync(path.join(root,'apps/harmony/README.md')));
});
