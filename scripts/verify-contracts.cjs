const fs=require('node:fs'),path=require('node:path');
const {check}=require('./lib/schema-lite.cjs');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'packages/contracts');
const names=['bar','recipe','post','api-error'];
const schemas=Object.fromEntries(names.map(name=>{
 const x=JSON.parse(fs.readFileSync(path.join(dir,'schemas',name+'.schema.json'),'utf8'));
 if(x.$schema!=='https://json-schema.org/draft/2020-12/schema'||x.type!=='object')throw Error('Invalid schema '+name);
 return [name,x];
}));
const api=JSON.parse(fs.readFileSync(path.join(dir,'api.v1.json'),'utf8'));
const routes=new Set(),allowed=new Set(names.map(n=>n+'.schema.json'));
for(const e of api.endpoints){
 if(!['GET','POST','PUT','PATCH','DELETE'].includes(e.method)||!e.path.startsWith('/'))throw Error('Invalid route');
 const key=e.method+' '+e.path;if(routes.has(key))throw Error('Duplicate '+key);routes.add(key);
 for(const k of ['requestSchema','responseSchema'])if(e[k]&&!allowed.has(e[k]))throw Error('Missing schema '+e[k]);
 if(typeof e.auth!=='boolean')throw Error('Auth required for '+key);
}
const {initialBars}=require('../miniprogram/data/bars');
const seeds=['apps/wechat/src/data/bars.json','apps/mobile/src/data/bars.json'].map(p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8')));
const ids=new Set();
for(const b of initialBars){const issues=check(b,schemas.bar,'bar#'+b.id);if(issues.length)throw Error(issues.join('\n'));if(ids.has(b.id))throw Error('Duplicate '+b.id);ids.add(b.id)}
for(const arr of seeds){
 for(const b of arr){const issues=check(b,schemas.bar,'react-bar#'+b.id);if(issues.length)throw Error(issues.join('\n'))}
 if(JSON.stringify(arr.map(b=>b.id))!==JSON.stringify(initialBars.map(b=>b.id)))throw Error('Seed ids differ');
}
const promo={id:'test',title:'示例推广',body:'测试',type:'promo',visibility:'local',isSponsored:true,sponsorName:'合作方'};
if(check(promo,schemas.post).length||!check({...promo,isSponsored:false},schemas.post).length)throw Error('Sponsorship rule invalid');
console.log('Validated '+initialBars.length+' bars, '+names.length+' schemas and '+routes.size+' routes');
