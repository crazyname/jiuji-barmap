const { DEFAULT_THEME, applyTheme } = require('../../utils/theme');
const { getBars, saveBars } = require('../../utils/storage');
const { isValidPoint, STATUS_LABEL } = require('../../utils/map-data');
Page({
  data: { themeKey: DEFAULT_THEME, bar: null, located: false, ratingText: '—', priceText: '—', ratingSource: '暂无可核实的同店评分', statusLabel: '', lineText: '', locationText: '' },
  onLoad(options) { this.barId = Number(options.id); this.refresh(); },
  onShow() { applyTheme(this); if (this.barId) this.refresh(); },
  refresh() {
    const b = getBars().find(x => x.id === this.barId);
    if (!b) { wx.showToast({ title: '门店不存在', icon: 'none' }); return; }
    const r = b.rating || {};
    this.setData({ bar: b, located: isValidPoint(b.location),
      ratingText: typeof r.score === 'number' ? `★ ${r.score.toFixed(1)} / 5` : '待核实',
      priceText: typeof r.price === 'number' ? `¥${r.price}` : '待核实',
      ratingSource: typeof r.score === 'number' ? `${r.platform || '平台'} · ${r.reviews || 0} 条评论` : '暂无同店可核实的评分',
      statusLabel: STATUS_LABEL[b.status] || STATUS_LABEL.unknown,
      lineText: (b.lines || []).map(l => l === 'APM' ? l : l + '号线').join(' / ') || '线路待核实',
      locationText: isValidPoint(b.location) ? (b.locationSource === 'user-map-selection' ? '微信地图人工选点' : '腾讯 POI 名称匹配') : '待准确定位'
    });
  },
  navigate() {
    const b = this.data.bar;
    if (!b || !isValidPoint(b.location)) { wx.showToast({ title: '请先确认位置', icon: 'none' }); return; }
    wx.openLocation({ latitude: Number(b.location.latitude), longitude: Number(b.location.longitude), name: b.name, address: b.resolvedAddress || b.addressHint || '', scale: 18 });
  },
  choosePoint() {
    wx.chooseLocation({ success: p => {
      if (!isValidPoint(p)) { wx.showModal({ title: '选点超出广州范围', content: '请在广州区域内选择店铺位置。', showCancel: false }); return; }
      const bars = getBars(), idx = bars.findIndex(x => x.id === this.barId);
      if (idx < 0) return;
      bars[idx] = { ...bars[idx], location: { latitude: p.latitude, longitude: p.longitude },
        locationSource: 'user-map-selection', resolvedAddress: p.address || '', locationCheckedAt: new Date().toISOString() };
      saveBars(bars); this.refresh(); wx.showToast({ title: '本机已保存点位', icon: 'success' });
    }, fail: err => { if (!/cancel/i.test(err.errMsg || '')) wx.showToast({ title: '地图选点未完成', icon: 'none' }); } });
  }
});
