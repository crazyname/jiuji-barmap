const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..'),j=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
test('Node workspace checks are reproducible',()=>{
 const pkg=j('package.json'),lock=j('package-lock.json');
 assert.equal(pkg.license,'MPL-2.0');assert.equal(pkg.private,true);assert.equal(lock.name,pkg.name);
 for(const cmd of ['test','check','data:sync','data:check','contracts:check','compat:check','syntax:check','migration:status'])assert.ok(pkg.scripts[cmd],cmd);
 assert.ok(pkg.scripts['data:sync'].includes('sync-react-bars'));
});
test('platform matrix contains four platforms and no artificial device verification',()=>{
 const x=j('docs/platforms.json');
 assert.deepEqual(x.platforms,['wechat','ios','android','harmony']);
 assert.ok(x.features.length>=10);
 assert.ok(x.features.every(f=>x.platforms.every(p=>f[p]!==undefined&&f[p]!=='verified')));
});
test('native WeChat is retained while migration gates are incomplete',()=>{
 const x=j('docs/migration-gates.json');
 assert.ok(x.checks.some(g=>g.id==='wechat-map-device'&&!g.complete));
 assert.ok(fs.existsSync(path.join(root,'miniprogram/app.json')));
 assert.ok(fs.existsSync(path.join(root,'project.config.json')));
});
test('repository uses a single MPL-2.0 license',()=>{
 assert.ok(fs.existsSync(path.join(root,'LICENSE')));
 for(const p of ['NOTICE.md','LICENSE-MIT-LEGACY','TRADEMARKS.md','docs/content-rights.md'])assert.equal(fs.existsSync(path.join(root,p)),false);
});
