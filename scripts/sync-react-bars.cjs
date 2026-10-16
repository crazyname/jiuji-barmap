/** Generate immutable React client seed snapshots from the existing WeChat dataset. */
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const {initialBars}=require(path.join(root,'miniprogram/data/bars.js'));
const outputs=[
 path.join(root,'apps/wechat/src/data/bars.json'),
 path.join(root,'apps/mobile/src/data/bars.json')
];
if(initialBars.some(b=>b.location && (!Number.isFinite(b.location.latitude)||!Number.isFinite(b.location.longitude))))
 throw Error('Invalid coordinate');
const seed=initialBars.map(b=>({
 id:b.id,name:b.name,searchKey:b.searchKey,station:b.station,exit:b.exit,lines:b.lines,
 status:b.status,statusCheckedAt:b.statusCheckedAt,rating:b.rating,addressHint:b.addressHint,location:b.location||null
}));
const expected=JSON.stringify(seed,null,2)+'\n';
if(process.argv.includes('--check')){
 for(const dest of outputs){
  if(!fs.existsSync(dest)||fs.readFileSync(dest,'utf8')!==expected)throw Error(dest+' is stale: run npm run data:sync');
 }
 console.log('React seed snapshots checked: '+seed.length+' bars × '+outputs.length+' clients');
}else{
 for(const dest of outputs){fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,expected)}
 console.log('Synced '+seed.length+' bars to '+outputs.length+' clients');
}
