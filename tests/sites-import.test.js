// SPDX-License-Identifier: MPL-2.0
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const data=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const importer=path.join(root,'scripts/import-sites-export.cjs');
test('Sites snapshot and both React demos remain aligned',()=>{
 const latest=data('fixtures/sites/latest.json');
 const wechat=data('apps/wechat/src/data/sites-test.json');
 const mobile=data('apps/mobile/src/data/sites-test.json');
 assert.deepEqual(wechat,mobile);
 assert.deepEqual(wechat.recipes,latest.recipes);
 assert.deepEqual(wechat.posts,latest.posts);
 assert.equal(latest.bars.length,31);
 assert.ok(latest.bars.every(b=>b.location===null));
});
test('Sites demo exporter accepts valid consolidated fixtures without modifying the workspace',()=>{
 const result=spawnSync(process.execPath,[importer,path.join(root,'fixtures/sites/seed.json'),'--dry-run'],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 assert.match(result.stdout,/Validated Sites export/);
});
test('Sites exporter rejects sponsored posts with no sponsor disclosure',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jiuji-sites-'));
 try{
  const fixture=data('fixtures/sites/seed.json');
  const promo=fixture.posts.find(p=>p.type==='promo');
  promo.isSponsored=false;
  fs.writeFileSync(path.join(dir,'bad.json'),JSON.stringify(fixture));
  const result=spawnSync(process.execPath,[importer,path.join(dir,'bad.json'),'--dry-run'],{encoding:'utf8'});
  assert.notEqual(result.status,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('React demos render Sites recipes and sponsored posts without auto-uploading them',()=>{
 const mix=fs.readFileSync(path.join(root,'apps/wechat/src/pages/mix/index.tsx'),'utf8');
 const community=fs.readFileSync(path.join(root,'apps/wechat/src/pages/community/index.tsx'),'utf8');
 assert.match(mix,/demoRecipes/);
 assert.match(mix,/未核实/);
 assert.doesNotMatch(mix,/queueRemoteUpsert\(/);
 assert.match(community,/demoPosts/);
 assert.match(community,/sponsorName/);
 const content=data('apps/wechat/src/data/sites-test.json');
 assert.ok(content.posts.filter(x=>x.type==='promo').every(x=>x.isSponsored&&x.sponsorName));
});
