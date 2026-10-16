const { DEFAULT_THEME, applyTheme } = require('../../utils/theme');
const { getBars, saveBars } = require('../../utils/storage');
const { lines } = require('../../data/lines');
const { isValidPoint } = require('../../utils/map-data');
const { invoke } = require('../../utils/cloud');
const { initialBars } = require('../../data/bars');
const stations = ['待核实'].concat([...new Set(initialBars.map(b => b.station))].sort());
Page({
  data: { themeKey: DEFAULT_THEME, query: '', loading: false, hint: '', candidates: [], pending: null, newName: '',
    stationChoices: stations, stationIndex: 0, lineChoices: ['待核实'].concat(lines.map(l => l.id === 'APM' ? 'APM' : l.id + '号线')), lineIndex: 0 },
  onShow() { applyTheme(this); },
  onInput(e) { this.setData({ query: e.detail.value }); },
  async search() {
    const q = this.data.query.trim();
    if (q.length < 2) { wx.showToast({ title: '请输入至少两个字', icon: 'none' }); return; }
    this.setData({ loading: true, hint: '' });
    try { const result = await invoke('search', { keyword: q });
      this.setData({ candidates: result.candidates || [], hint: (result.candidates || []).length ? '请核对地址，地点服务收录不代表目前仍在营业。' : '没有搜索到结果，请尝试不同名称或使用地图选点。' });
    } catch (err) { this.setData({ hint: err.message || '搜索失败，请尝试地图选点。' }); }
    finally { this.setData({ loading: false }); }
  },
  addCandidate(e) {
    const cand = this.data.candidates[Number(e.currentTarget.dataset.index)];
    if (!cand || !isValidPoint(cand)) return;
    this.setData({ pending: cand, newName: cand.name, stationIndex: 0, lineIndex: 0 });
  },
  choosePoint() {
    wx.chooseLocation({ success: p => {
      if (!isValidPoint(p)) { wx.showModal({ title: '位置不在广州附近', content: '请重新选择广州地区的酒吧地点。', showCancel: false }); return; }
      this.setData({ pending: { name: p.name || '', address: p.address || '', latitude: p.latitude, longitude: p.longitude, poiId: '' }, newName: p.name || '', stationIndex: 0, lineIndex: 0 });
    }, fail: err => { if (!/cancel/i.test(err.errMsg || '')) wx.showToast({ title: '地图选点失败', icon: 'none' }); } });
  },
  changeName(e) { this.setData({ newName: e.detail.value }); },
  stationChange(e) { this.setData({ stationIndex: +e.detail.value }); },
  lineChange(e) { this.setData({ lineIndex: +e.detail.value }); },
  saveNewBar() {
    const cand = this.data.pending, name = this.data.newName.trim();
    if (!name || !cand || !isValidPoint(cand)) { wx.showToast({ title: '缺少名称或坐标', icon: 'none' }); return; }
    const bars = getBars();
    if (bars.some(b => (cand.poiId && b.poiId === cand.poiId) || b.name.trim().toLowerCase() === name.toLowerCase())) {
      wx.showModal({ title: '可能重复', content: '列表中已存在相同酒吧名称或地图 POI，请先核对。', showCancel: false }); return;
    }
    const line = this.data.lineIndex ? lines[this.data.lineIndex - 1].id : null;
    const bar = { id: Math.max(10000, ...bars.map(b => b.id)) + 1, name, searchKey: name, status: 'unknown', statusCheckedAt: '',
      rating: null, station: this.data.stationChoices[this.data.stationIndex], exit: '', originalDistanceM: null,
      lines: line ? [line] : [], location: { latitude: cand.latitude, longitude: cand.longitude },
      resolvedAddress: cand.address, poiId: cand.poiId, locationSource: cand.poiId ? 'tencent-poi-user-selected' : 'user-map-selection',
      locationCheckedAt: new Date().toISOString(), userAdded: true };
    bars.push(bar);
    if (!saveBars(bars)) { wx.showToast({ title: '本地保存失败', icon: 'none' }); return; }
    wx.showToast({ title: '已添加到地图', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 450);
  }
});
