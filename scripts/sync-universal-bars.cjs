/** Single source of truth: legacy WeChat's vetted 31-record seed. No fabricated GPS. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const { initialBars } = require(path.join(root, 'miniprogram/data/bars.js'));
const output = path.join(root, 'apps/universal/data/bars.json');
if (initialBars.some((b) => b.location && (!Number.isFinite(b.location.latitude) || !Number.isFinite(b.location.longitude)))) {
  throw new Error('Invalid seed coordinate');
}
const seed = initialBars.map(b => ({
  id: b.id, name: b.name, searchKey: b.searchKey, station: b.station,
  exit: b.exit, lines: b.lines, status: b.status, statusCheckedAt: b.statusCheckedAt,
  rating: b.rating, addressHint: b.addressHint, location: b.location || null
}));
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(seed, null, 2) + '\n');
process.stdout.write(`Synced ${seed.length} bar records into uni-app x seed.\n`);
