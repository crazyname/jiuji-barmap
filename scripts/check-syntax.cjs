const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
const folders=['miniprogram','cloudfunctions','scripts','tests','packages'];
const files=[];
function scan(dir) {
  if (!fs.existsSync(dir)) return;
  for (const item of fs.readdirSync(dir,{withFileTypes:true})) {
    if (['node_modules','.git','unpackage','dist'].includes(item.name)) continue;
    const target=path.join(dir,item.name);
    if (item.isDirectory()) scan(target);
    else if (/\.(c?js)$/.test(item.name)) files.push(target);
  }
}
folders.forEach(d=>scan(path.join(root,d)));
for(const file of files){
 const result=cp.spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
 if(result.status!==0){ process.stderr.write(`Syntax error ${path.relative(root,file)}\n${result.stderr}`);process.exit(1); }
}
console.log(`Syntax checked ${files.length} JavaScript files.`);
