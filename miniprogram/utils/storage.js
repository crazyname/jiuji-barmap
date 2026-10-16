const { initialBars } = require('../data/bars');
const cfg = require('../config');
const KEY = `gz-atlas-bars-v${cfg.cacheVersion}`;
const STATIONS_KEY = `gz-atlas-stations-v${cfg.cacheVersion}`;
function getBars() {
  let persisted = [];
  try { persisted = wx.getStorageSync(KEY) || []; } catch (_) { }
  const edits = new Map(Array.isArray(persisted) ? persisted.map(b => [Number(b.id), b]) : []);
  return initialBars.map(b => ({ ...b, ...(edits.get(b.id) || {}) })).concat(
    [...edits.values()].filter(b => !initialBars.some(s => s.id === Number(b.id)))
  );
}
function saveBars(bars) {
  try { wx.setStorageSync(KEY, bars); return true; } catch (_) { return false; }
}
function getStations() {
  try { return wx.getStorageSync(STATIONS_KEY) || {}; } catch (_) { return {}; }
}
function saveStations(data) {
  try { wx.setStorageSync(STATIONS_KEY, data); return true; } catch (_) { return false; }
}
module.exports = { getBars, saveBars, getStations, saveStations };
