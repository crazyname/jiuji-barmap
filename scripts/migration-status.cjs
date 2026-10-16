const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..');
const state=JSON.parse(fs.readFileSync(path.join(root,'docs/migration-gates.json'),'utf8'));
const ready=state.checks.every(x=>x.complete);
if(!ready && !fs.existsSync(path.join(root,'miniprogram/app.json'))) throw Error('Legacy WeChat removed before parity gates completed');
for(const x of state.checks) console.log(`${x.complete?'[x]':'[ ]'} ${x.description}`);
console.log(ready?'Ready to propose legacy removal':'Keep native WeChat client until all checks pass');
