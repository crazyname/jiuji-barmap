// SPDX-License-Identifier: MPL-2.0
// Import ChatGPT Sites JSON export as a versioned, read-only development snapshot.
const fs = require('node:fs');
const path = require('node:path');
const { check } = require('./lib/schema-lite.cjs');
const root = path.resolve(__dirname, '..');
const latestPath = path.join(root, 'fixtures/sites/latest.json');
const targets = [
  path.join(root, 'apps/wechat/src/data/sites-test.json'),
  path.join(root, 'apps/mobile/src/data/sites-test.json')
];
const args = process.argv.slice(2);
const verifyOnly = args.includes('--check');
const dryRun = args.includes('--dry-run');
const input = args.find(x => !x.startsWith('--'));
function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function exportInput(p) {
  const full = path.resolve(p);
  if (!fs.statSync(full).isDirectory()) return readJson(full);
  const joined = path.join(full, 'jiuji-tools.json');
  if (fs.existsSync(joined)) return readJson(joined);
  const sections = ['bars','recipes','posts','testUsers','favorites'];
  const result = {schemaVersion:1,dataset:'jiuji-sites-dev'};
  for(const section of sections) {
    const f=path.join(full,'jiuji-'+section+'.json');
    if(!fs.existsSync(f)) throw Error('Missing export '+f);
    result[section]=readJson(f)[section];
  }
  return result;
}
function validate(raw) {
  if(!raw || typeof raw!=='object'||raw.schemaVersion!==1) throw Error('Invalid Sites export schemaVersion');
  const kinds=['bars','recipes','posts','testUsers','favorites'];
  for(const kind of kinds) if(!Array.isArray(raw[kind])) throw Error('Missing '+kind+' array');
  const schemas = Object.fromEntries(['bar','recipe','post'].map(kind=>[
    kind,readJson(path.join(root,'packages/contracts/schemas/'+kind+'.schema.json'))
  ]));
  const byKind=[['bars','bar'],['recipes','recipe'],['posts','post']];
  for(const [key,kind] of byKind) {
    const seen=new Set();
    for(const row of raw[key]) {
      const errors=check(row,schemas[kind],key);
      if(errors.length) throw Error(errors.join('\n'));
      const id=String(row.id);
      if(seen.has(id)) throw Error('Duplicate '+key+' ID: '+id);
      seen.add(id);
    }
  }
  const seenUser=new Set();
  for(const user of raw.testUsers){
    if(!user || typeof user.id!=='string' || !/^demo-|^dev-/.test(user.id) ||
       typeof user.displayName!=='string') throw Error('Only demo/dev users can be exported into a public repository');
    if(seenUser.has(user.id)) throw Error('Duplicate test user ID');
    seenUser.add(user.id);
  }
  const validTargets={
    bar:new Set(raw.bars.map(x=>String(x.id))),
    recipe:new Set(raw.recipes.map(x=>String(x.id))),
    post:new Set(raw.posts.map(x=>String(x.id)))
  };
  for(const f of raw.favorites) {
    if(!f || !seenUser.has(f.userId) || !validTargets[f.kind]?.has(String(f.targetId)))
      throw Error('Favorite references an unknown demo user or content item');
  }
  for(const b of raw.bars) {
    if(b.location!==null) {
      const {latitude,longitude}=b.location||{};
      if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)
        throw Error('Invalid bar coordinates: '+b.id);
    }
  }
  return {schemaVersion:1,dataset:'jiuji-sites-dev',bars:raw.bars,recipes:raw.recipes,
    posts:raw.posts,testUsers:raw.testUsers,favorites:raw.favorites};
}
function expected(data) {
  return [
    JSON.stringify(data,null,2)+'\n',
    JSON.stringify({schemaVersion:1,recipes:data.recipes,posts:data.posts},null,2)+'\n'
  ];
}
function compare(target,content) {
  if(!fs.existsSync(target) || fs.readFileSync(target,'utf8')!==content)
    throw Error('Stale '+path.relative(root,target)+'; run npm run sites:import -- <Sites JSON>');
}
if(verifyOnly) {
  const normalized=validate(readJson(latestPath));
  const [snapshot,publicContent]=expected(normalized);
  compare(latestPath,snapshot);
  for(const p of targets) compare(p,publicContent);
  console.log('Sites export checked: '+normalized.bars.length+' bars, '+normalized.recipes.length+' recipes, '+normalized.posts.length+' posts');
} else {
  if(!input) throw Error('Usage: npm run sites:import -- /path/to/jiuji-tools.json [--dry-run]');
  const normalized=validate(exportInput(input));
  const [snapshot,publicContent]=expected(normalized);
  if(!dryRun){
    fs.mkdirSync(path.dirname(latestPath),{recursive:true});
    fs.writeFileSync(latestPath,snapshot);
    for(const p of targets){fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,publicContent)}
  }
  console.log((dryRun?'Validated':'Imported')+' Sites export: '+normalized.bars.length+' bars, '+
    normalized.recipes.length+' recipes, '+normalized.posts.length+' posts, '+
    normalized.testUsers.length+' demo users, '+normalized.favorites.length+' favorites.');
}
