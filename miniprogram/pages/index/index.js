const store = require('../../utils/storage');
const { lines } = require('../../data/lines');
const { CENTER, STATUS_LABEL, isValidPoint, filterBars, buildMarkers, createPolylines } = require('../../utils/map-data');
const { invoke } = require('../../utils/cloud');

const statusValues = ['all', 'official', 'listed', 'unknown', 'closed'];
const priceValues = ['all', '150', '250', '350'];
const ratingValues = ['all', '4', '4.5'];
const tabs = [{ id: 'all', color: '#888', label: '全部' }].concat(lines.map(l => ({ ...l, label: l.id === 'APM' ? 'APM' : `${l.id}号线` })));
function asView(b) {
  return { ...b, idLabel: String(b.id).padStart(2, '0'), statusLabel: STATUS_LABEL[b.status] || STATUS_LABEL.unknown,
    ratingText: b.rating && typeof b.rating.score === 'number' ? `★ ${b.rating.score.toFixed(1)} / 5` : '评分待核实',
    priceText: b.rating && typeof b.rating.price === 'number' ? `人均 ¥${b.rating.price}` : '人均待核实',
    locationText: isValidPoint(b.location) ? '已匹配地图坐标' : '地点待定位' };
}
Page({
  data: {
    query: '', selectedLine: 'all', statusIndex: 0, priceIndex: 0, ratingIndex: 0,
    statusLabels: ['全部状态', '官网有资料', '平台有记录', '待核实', '停业提示'],
    priceLabels: ['人均不限', '≤¥150', '≤¥250', '≤¥350'],
    ratingLabels: ['评分不限', '≥4.0', '≥4.5'],
    lineTabs: tabs.map(t => ({ ...t, active: t.id === 'all' })),
    mapLatitude: CENTER.latitude, mapLongitude: CENTER.longitude, mapScale: 12,
    markers: [], polylines: [], displayBars: [], mappedCount: 0,
    selectedCard: null, resolving: false, hint: ''
  },
  onLoad() {
    this.bars = store.getBars();
    this.stations = store.getStations();
    this.selectedId = null;
    this._lastResolved = false;
    this.refresh();
    if (getApp().globalData.cloudReady) this.loadCoordinates(false);
    else this.setData({ hint: '未配置云开发：真实底图可用；可点进详情用微信地图选点。配置腾讯地点服务后可自动匹配坐标及搜索新增酒吧。' });
  },
  onShow() {
    if (!this.bars) return;
    const previousCount = this.bars.length;
    this.bars = store.getBars();
    if (this.bars.length > previousCount) {
      this.selectedId = this.bars[this.bars.length - 1].id;
      this.setData({ selectedLine: 'all', query: '', statusIndex: 0, priceIndex: 0, ratingIndex: 0 });
      const newest = this.bars[this.bars.length - 1];
      if (isValidPoint(newest.location)) this.setData({ mapLatitude: +newest.location.latitude, mapLongitude: +newest.location.longitude, mapScale: 15 });
    }
    this.refresh();
  },
  onShareAppMessage() { return { title: '酒迹 · 酒吧地图', path: '/pages/index/index' }; },
  refresh() {
    const selected = { line: this.data.selectedLine, status: statusValues[this.data.statusIndex], price: priceValues[this.data.priceIndex], rating: ratingValues[this.data.ratingIndex], query: this.data.query };
    const matched = filterBars(this.bars, selected);
    const selectedBar = matched.find(b => b.id === this.selectedId);
    this.setData({
      lineTabs: tabs.map(t => ({ ...t, active: t.id === selected.line })),
      displayBars: matched.map(asView),
      markers: buildMarkers(matched, this.selectedId),
      polylines: createPolylines(selected.line, this.stations),
      mappedCount: matched.filter(b => isValidPoint(b.location)).length,
      selectedCard: selectedBar ? asView(selectedBar) : null
    });
  },
  onSearchInput(e) { this.setData({ query: e.detail.value }); this.refresh(); },
  onStatusChange(e) { this.setData({ statusIndex: Number(e.detail.value) }); this.refresh(); },
  onPriceChange(e) { this.setData({ priceIndex: Number(e.detail.value) }); this.refresh(); },
  onRatingChange(e) { this.setData({ ratingIndex: Number(e.detail.value) }); this.refresh(); },
  onLineTap(e) {
    const id = e.currentTarget.dataset.id;
    this.selectedId = null;
    this.setData({ selectedLine: id }); this.refresh();
    this.resolveLineStations(id);
    const bar = filterBars(this.bars, { line: id, status: 'all', price: 'all', rating: 'all', query: '' }).find(b => isValidPoint(b.location));
    if (bar) this.setData({ mapLatitude: bar.location.latitude, mapLongitude: bar.location.longitude, mapScale: 13 });
  },
  onMarkerTap(e) {
    const id = Number(e.detail.markerId);
    this.selectBar(id);
  },
  onBarTap(e) {
    const id = Number(e.currentTarget.dataset.id);
    this.selectBar(id);
    const b = this.bars.find(x => x.id === id);
    if (!isValidPoint(b && b.location)) {
      wx.navigateTo({ url: `/pages/detail/detail?id=${id}` });
    }
  },
  selectBar(id) {
    const b = this.bars.find(x => x.id === id);
    if (!b) return;
    this.selectedId = id;
    if (isValidPoint(b.location)) this.setData({ mapLatitude: +b.location.latitude, mapLongitude: +b.location.longitude, mapScale: 15 });
    this.refresh();
  },
  openSelectedDetail() { if (this.selectedId) wx.navigateTo({ url: `/pages/detail/detail?id=${this.selectedId}` }); },
  openAdd() { wx.navigateTo({ url: '/pages/add/add' }); },
  async retryPositions() { await this.loadCoordinates(true); },
  async loadCoordinates(force) {
    if (this.data.resolving) return;
    if (!getApp().globalData.cloudReady) {
      wx.showModal({ title: '需要配置位置服务', content: '打开 README 按步骤创建微信云开发环境，填写 cloudEnvId，在云函数中设置 QQMAP_KEY。', showCancel: false }); return;
    }
    this.setData({ resolving: true, hint: '正在通过腾讯地图匹配 POI（不会把未验证地点强行显示在地图上）…' });
    let successCount = 0, failures = 0;
    try {
      const now = Date.now();
      const pending = this.bars.filter(b => !isValidPoint(b.location) &&
        (force || !b.locationCheckFailedAt || now - b.locationCheckFailedAt > 48 * 3600 * 1000));
      for (let i = 0; i < pending.length; i += 6) {
        const batch = pending.slice(i, i + 6);
        const { results } = await invoke('resolveBars', { items: batch.map(b => ({ id: String(b.id), searchKey: b.searchKey || b.name })) });
        (results || []).forEach(res => {
          const b = this.bars.find(x => x.id === Number(res.id)); if (!b) return;
          if (res.candidate && isValidPoint(res.candidate)) {
            b.location = { latitude: res.candidate.latitude, longitude: res.candidate.longitude };
            b.locationSource = 'tencent-poi-name-match';
            b.resolvedAddress = res.candidate.address;
            b.poiId = res.candidate.poiId;
            b.locationCheckedAt = new Date().toISOString(); successCount++;
          } else { b.locationCheckFailedAt = Date.now(); failures++; }
        });
        store.saveBars(this.bars); this.refresh();
      }
      this.setData({ hint: `本次匹配 ${successCount} 家，${failures} 家尚无可信坐标。其他门店可在详情页通过地图选点核实。` });
      if (this.data.selectedLine !== 'all') await this.resolveLineStations(this.data.selectedLine);
    } catch (err) { this.setData({ hint: '位置匹配未完成：' + (err.message || '未知错误') }); }
    finally { this.setData({ resolving: false }); }
  },
  async resolveLineStations(id) {
    if (id === 'all' || !getApp().globalData.cloudReady) return;
    const line = lines.find(l => l.id === id); if (!line) return;
    const now = Date.now();
    const missing = line.stations.filter(s => !isValidPoint(this.stations[s]) &&
      (!this.stations[`failed:${s}`] || now - this.stations[`failed:${s}`] > 7 * 86400000));
    for (let i = 0; i < missing.length; i += 6) {
      try {
        const { results } = await invoke('resolveStations', { items: missing.slice(i, i + 6).map(s => ({ id: s, searchKey: s })) });
        (results || []).forEach(r => {
          if (r.candidate && isValidPoint(r.candidate)) this.stations[r.id] = { latitude: r.candidate.latitude, longitude: r.candidate.longitude };
          else this.stations[`failed:${r.id}`] = Date.now();
        });
        store.saveStations(this.stations); this.refresh();
      } catch (err) { this.setData({ hint: '线路站点匹配中断：' + err.message }); return; }
    }
  }
});
