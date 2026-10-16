/** Keep the two client seed datasets identical until a shared data package is adopted. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const { initialBars } = require(path.join(root, 'miniprogram/data/bars.js'));
const output = path.join(root, 'apps/universal/data/bars.json');
if (initialBars.some(b => b.location && (!Number.isFinite(b.location.latitude) || !Number.isFinite(b.location.longitude)))) {
  throw new Error('Invalid seed coordinate');
}
const seed = initialBars.map(b => ({
  id: b.id, name: b.name, searchKey: b.searchKey, station: b.station,
  exit: b.exit, lines: b.lines, status: b.status, statusCheckedAt: b.statusCheckedAt,
  rating: b.rating, addressHint: b.addressHint, location: b.location || null
}));
const generated=JSON.stringify(seed,null,2)+'\n';
if(process.argv.includes('--check')) {
  if(!fs.existsSync(output) || fs.readFileSync(output,'utf8')!==generated) {
    console.error('bars.json out of sync. Run: npm run data:sync'); process.exit(1);
  }
  console.log(`Bar seed synchronized: ${seed.length} entries.`);
} else {
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,generated);
  console.log(`Synced ${seed.length} bars.`);
}
