const fs = require('node:fs');
const path = require('node:path');
const { check } = require('./lib/schema-lite.cjs');
const root = path.resolve(__dirname, '..');
const contract = path.join(root, 'packages/contracts');
const names = ['bar', 'recipe', 'post', 'api-error'];
const schemaByName = Object.fromEntries(names.map(name => {
  const obj = JSON.parse(fs.readFileSync(path.join(contract,'schemas',`${name}.schema.json`), 'utf8'));
  if (obj.$schema !== 'https://json-schema.org/draft/2020-12/schema' || obj.type !== 'object') throw Error(`Invalid schema header: ${name}`);
  return [name, obj];
}));
const api = JSON.parse(fs.readFileSync(path.join(contract, 'api.v1.json'),'utf8'));
const allowed = new Set(names.map(n=>`${n}.schema.json`));
const routeKeys = new Set();
for (const ep of api.endpoints) {
  if (!['GET','POST','PUT','PATCH','DELETE'].includes(ep.method) || !ep.path.startsWith('/')) throw Error('Invalid API method/path');
  const key = `${ep.method} ${ep.path}`;
  if (routeKeys.has(key)) throw Error(`Duplicate API route ${key}`);
  routeKeys.add(key);
  for (const prop of ['requestSchema', 'responseSchema']) if (ep[prop] && !allowed.has(ep[prop])) throw Error(`Missing schema: ${ep[prop]}`);
  if (typeof ep.auth !== 'boolean') throw Error(`Missing auth flag: ${key}`);
}
const { initialBars } = require('../miniprogram/data/bars.js');
const uniBars = JSON.parse(fs.readFileSync(path.join(root,'apps/universal/data/bars.json'),'utf8'));
const ids = new Set();
for (const b of initialBars) {
  const issues = check(b, schemaByName.bar, `bar#${b.id}`);
  if (issues.length) throw Error(issues.join('\n'));
  if (ids.has(b.id)) throw Error(`Duplicate bar id ${b.id}`);
  ids.add(b.id);
}
for (const b of uniBars) {
  const issues = check(b, schemaByName.bar, `uni-bar#${b.id}`);
  if (issues.length) throw Error(issues.join('\n'));
}
if (JSON.stringify(uniBars.map(b=>b.id))!==JSON.stringify(initialBars.map(b=>b.id))) throw Error('Bar seeds out of sync');
// Self-test cross-field sponsorship rule, which must remain visible across platforms.
const promo={id:'test',title:'示例推广',body:'测试',type:'promo',visibility:'local',isSponsored:true,sponsorName:'合作方'};
if (check(promo,schemaByName.post).length) throw Error('Valid sponsored post rejected');
if (!check({...promo,isSponsored:false},schemaByName.post).length) throw Error('Unlabelled sponsored post accepted');
console.log(`Validated ${initialBars.length} bars, ${names.length} schemas and ${routeKeys.size} draft API routes.`);
