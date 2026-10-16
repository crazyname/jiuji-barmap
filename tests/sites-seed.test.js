// SPDX-License-Identifier: MPL-2.0
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
test('Sites fixture follows React client seed without invented coordinates',()=>{
 const fixture=read('fixtures/sites/seed.json');
 const bars=read('apps/wechat/src/data/bars.json');
 assert.deepEqual(fixture.bars,bars);
 assert.equal(fixture.bars.length,31);
 assert.ok(fixture.bars.every(b=>b.location===null));
 assert.equal(fixture.dataset,'jiuji-sites-dev');
});
test('Sites fixture contains only identifiable development records and labeled promotion',()=>{
 const fixture=read('fixtures/sites/seed.json');
 assert.ok(fixture.recipes.every(r=>r.id.startsWith('dev-')));
 assert.ok(fixture.posts.every(p=>p.id.startsWith('dev-')));
 assert.ok(fixture.testUsers.every(p=>p.id.startsWith('demo-')));
 assert.ok(fixture.posts.filter(p=>p.type==='promo').every(p=>p.isSponsored&&p.sponsorName));
});
