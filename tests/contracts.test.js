const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { check } = require('../scripts/lib/schema-lite.cjs');
const root = path.resolve(__dirname, '..');
const schema = name => JSON.parse(fs.readFileSync(path.join(root,'packages/contracts/schemas',`${name}.schema.json`),'utf8'));

test('bar contract accepts unknown coordinates but rejects fabricated/out-of-range points', () => {
  const base = {id: 1, name: '测试酒吧', station: '广州', lines: [], status: 'unknown', rating: null, location: null};
  assert.deepEqual(check(base, schema('bar')), []);
  assert.ok(check({...base, location: {latitude: 132, longitude: 113.2}}, schema('bar')).length);
  assert.ok(check({...base, status: 'open-now'}, schema('bar')).length);
  assert.ok(check({...base, lines: ['1','1']}, schema('bar')).length);
});

test('recipe and sponsored post contracts enforce required fields', () => {
  const recipe={id:'local-1',title:'金汤力',ingredients:'金酒45ml',steps:'加冰并搅拌',visibility:'local'};
  assert.deepEqual(check(recipe,schema('recipe')),[]);
  assert.ok(check({...recipe,steps:''},schema('recipe')).length);
  const post={id:'local-2',title:'探店记录',body:'记录味道',type:'visit',visibility:'local',isSponsored:false};
  assert.deepEqual(check(post,schema('post')),[]);
  assert.deepEqual(check({...post,type:'promo',isSponsored:true,sponsorName:'合作酒吧'},schema('post')),[]);
  assert.ok(check({...post,type:'promo',isSponsored:false,sponsorName:null},schema('post')).length);
});

test('API draft is machine-readable with distinct operations and error schema', () => {
  const api=JSON.parse(fs.readFileSync(path.join(root,'packages/contracts/api.v1.json'),'utf8'));
  assert.equal(api.status,'design-only');
  assert.ok(api.endpoints.some(x=>x.method==='GET'&&x.path==='/bars'));
  assert.ok(api.endpoints.some(x=>x.method==='POST'&&x.path==='/posts'&&x.auth));
  const e={code:'NOT_FOUND',message:'No record'};
  assert.deepEqual(check(e,schema('api-error')),[]);
  assert.ok(check({...e,debugSecret:'no'},schema('api-error')).length);
});
