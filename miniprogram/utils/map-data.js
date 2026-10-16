const PALETTE = { official: '#25916F', listed: '#5178C4', unknown: '#95959A', closed: '#C24F56' };
const STATUS_LABEL = { official: '官网仍有经营资料', listed: '平台仍有经营记录', unknown: '经营状态待核实', closed: '停业提示／资料冲突' };
const CENTER = { latitude: 23.1289, longitude: 113.3200 }; // 广州天河-越秀区域地图中心，不是酒吧坐标
function isValidPoint(p) {
  return !!p && Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude)) &&
    p.latitude >= 22.4 && p.latitude <= 23.9 && p.longitude >= 112.5 && p.longitude <= 114.4;
}
function filterBars(bars, selected) {
  const needle = (selected.query || '').trim().toLowerCase();
  return bars.filter(b => {
    if (selected.line !== 'all' && !(b.lines || []).includes(selected.line)) return false;
    if (selected.status !== 'all' && selected.status !== b.status) return false;
    if (selected.price !== 'all' && (!(b.rating && typeof b.rating.price === 'number') || b.rating.price > Number(selected.price))) return false;
    if (selected.rating !== 'all' && (!(b.rating && typeof b.rating.score === 'number') || b.rating.score < Number(selected.rating))) return false;
    const hay = `${b.name} ${b.station} ${(b.lines || []).join(' ')} ${b.id}`.toLowerCase();
    return !needle || hay.includes(needle);
  });
}
function buildMarkers(bars, selectedId) {
  return bars.filter(b => isValidPoint(b.location)).map(b => ({
    id: b.id,
    latitude: Number(b.location.latitude), longitude: Number(b.location.longitude),
    iconPath: b.id === selectedId ? '/assets/selected.png' : `/assets/${b.status in PALETTE ? b.status : 'unknown'}.png`,
    width: b.id === selectedId ? 39 : 31, height: b.id === selectedId ? 45 : 36,
    callout: { content: b.name, color: '#24232a', fontSize: 12, borderRadius: 6,
      bgColor: '#ffffff', padding: 5, display: b.id === selectedId ? 'ALWAYS' : 'BYCLICK' }
  }));
}
function createPolylines(lineId, stations) {
  // 防止跨越缺失站点连成误导性的长线：只连接相邻且都已核实的站点。
  if (lineId === 'all') return [];
  const { lines } = require('../data/lines');
  const line = lines.find(l => l.id === lineId);
  if (!line) return [];
  const out = []; let segment = [];
  const flush = () => { if (segment.length >= 2) out.push({ points: segment, color: line.color + 'DC', width: 6, dottedLine: false }); segment = []; };
  line.stations.forEach(name => {
    const p = stations[name];
    if (isValidPoint(p)) segment.push({ latitude: +p.latitude, longitude: +p.longitude });
    else flush();
  });
  flush(); return out;
}
module.exports = { PALETTE, STATUS_LABEL, CENTER, isValidPoint, filterBars, buildMarkers, createPolylines };
