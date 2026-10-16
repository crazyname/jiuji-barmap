const test=require('node:test');const assert=require('node:assert/strict');
const path=require('node:path');const fs=require('node:fs');
const root=path.resolve(__dirname,'..');
const json=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
test('workspace exposes reproducible checks without external runtime dependencies',()=>{
  const pkg=json('package.json');
  assert.equal(pkg.license,'MPL-2.0');
  assert.equal(pkg.private,true);
  for(const name of ['test','check','data:sync','data:check','contracts:check','compat:check','syntax:check','migration:status']) assert.ok(pkg.scripts[name],name);
  const lock=json('package-lock.json');
  assert.equal(lock.name,pkg.name);
});
test('platform matrix is complete but never claims device verification without evidence',()=>{
  const matrix=json('docs/platforms.json');
  assert.deepEqual(matrix.platforms,['wechat','ios','android','harmony']);
  assert.equal(matrix.features.length>=10,true);
  for(const f of matrix.features) for(const p of matrix.platforms) assert.notEqual(f[p],undefined,`${p} ${f.id}`);
  assert.equal(matrix.features.filter(f=>matrix.platforms.some(p=>f[p]==='verified')).length,0);
});
test('legacy WeChat app remains available until device parity is verified',()=>{
  const gate=json('docs/migration-gates.json');
  assert.ok(gate.checks.some(x=>x.id==='wechat-map-device'&&!x.complete));
  assert.ok(fs.existsSync(path.join(root,'miniprogram/app.json')));
  assert.ok(fs.existsSync(path.join(root,'project.config.json')));
});
test('MPL license at repository root, no duplicated obsolete license files',()=>{
  assert.ok(fs.existsSync(path.join(root,'LICENSE')));
  for(const name of ['NOTICE.md','LICENSE-MIT-LEGACY','TRADEMARKS.md','docs/content-rights.md']) assert.equal(fs.existsSync(path.join(root,name)),false);
});
