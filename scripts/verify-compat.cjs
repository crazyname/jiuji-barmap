const fs = require('node:fs');
const path = require('node:path');
const root=path.resolve(__dirname,'..');
const x=JSON.parse(fs.readFileSync(path.join(root,'docs/platforms.json'),'utf8'));
const expected=['wechat','ios','android','harmony'];
if(JSON.stringify(x.platforms)!==JSON.stringify(expected)) throw Error('Platform order must be WeChat, iOS, Android, Harmony');
const valid=new Set(x.states), names=new Set();
for(const f of x.features){
 if(names.has(f.id)) throw Error(`Duplicate feature id ${f.id}`); names.add(f.id);
 if(!f.source || !fs.existsSync(path.join(root,f.source))) throw Error(`Missing source for ${f.id}: ${f.source}`);
 for(const p of expected) if(!valid.has(f[p])) throw Error(`Invalid status for ${p}/${f.id}`);
}
const uni=JSON.parse(fs.readFileSync(path.join(root,'apps/universal/manifest.json'),'utf8'));
for(const key of ['mp-weixin','app-ios','app-android','app-harmony']) if(!Object.hasOwn(uni,key)) throw Error(`Missing target ${key}`);
const pages=JSON.parse(fs.readFileSync(path.join(root,'apps/universal/pages.json'),'utf8'));
if(JSON.stringify(pages.tabBar.list.map(x=>x.text))!==JSON.stringify(['地图','调酒','社区','我的'])) throw Error('Tab order mismatch');
const wxml=fs.readFileSync(path.join(root,'miniprogram/pages/index/index.wxml'),'utf8');
const uvue=fs.readFileSync(path.join(root,'apps/universal/pages/map/index.uvue'),'utf8');
if(!wxml.includes('<map') || !uvue.includes('<map')) throw Error('Missing native map controls');
console.log(`Checked ${expected.length} targets and ${x.features.length} platform capabilities (static only).`);
