// SPDX-License-Identifier: MPL-2.0
// Keep app-local copies of the platform-neutral sync engine in sync.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'packages/sync/client.js'),'utf8');
const outputs=['apps/wechat/src/services/sync-core.js','apps/mobile/src/services/sync-core.js'];
if(process.argv.includes('--check')){
 for(const target of outputs){
  const file=path.join(root,target);
  if(!fs.existsSync(file)||fs.readFileSync(file,'utf8')!==source)
   throw Error('Out-of-date sync adapter: '+target+'. Run npm run sync:generate');
 }
 console.log('Shared sync code is identical in both React clients');
}else{
 for(const target of outputs){
  const file=path.join(root,target);
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,source);
 }
 console.log('Generated '+outputs.length+' platform sync modules');
}
