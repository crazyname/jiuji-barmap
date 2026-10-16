const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const json=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const x=json('docs/platforms.json'),expected=['wechat','ios','android','harmony'];
if(JSON.stringify(x.platforms)!==JSON.stringify(expected))throw Error('Invalid platform order');
const statuses=new Set(x.states),ids=new Set();
for(const f of x.features){
 if(ids.has(f.id))throw Error('Duplicate feature '+f.id);
 ids.add(f.id);
 if(!f.source||!fs.existsSync(path.join(root,f.source)))throw Error('Missing source '+f.source);
 for(const p of expected)if(!statuses.has(f[p]))throw Error('Invalid status '+p+'/'+f.id);
}
const taro=json('apps/wechat/package.json'),expo=json('apps/mobile/package.json'),expoConfig=json('apps/mobile/app.json');
if(!taro.dependencies['@tarojs/taro']||!taro.dependencies.react)throw Error('Missing Taro React dependencies');
if(!expo.dependencies.expo||!expo.dependencies['react-native'])throw Error('Missing Expo React Native dependencies');
if(!expoConfig.expo)throw Error('Expo configuration missing');
const conf=fs.readFileSync(path.join(root,'apps/wechat/src/app.config.ts'),'utf8');
const names=['地图','调酒','社区','我的'];
let index=-1;for(const n of names){const next=conf.indexOf("text: '"+n+"'",index+1);if(next<=index)throw Error('Tab order wrong: '+n);index=next}
if(!fs.readFileSync(path.join(root,'apps/wechat/src/pages/map/index.tsx'),'utf8').includes('<Map '))
 throw Error('Taro native Map not found');
if(!fs.readFileSync(path.join(root,'apps/mobile/App.tsx'),'utf8').includes('<MapView '))
 throw Error('React Native MapView not found');
if(fs.existsSync(path.join(root,'apps/universal')))throw Error('Old uni-app x folder still present');
console.log('Checked '+expected.length+' targets, '+x.features.length+' features and 2 React map shells');
