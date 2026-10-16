'use strict';
// 腾讯位置服务秘钥仅在云函数环境变量中配置：QQMAP_KEY，绝不发送给小程序客户端。
const https = require('https');
function httpGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.get({ hostname: 'apis.map.qq.com', path, timeout: 7000, headers: { 'Accept': 'application/json' } }, res => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', c => { raw += c; if (raw.length > 1000000) req.destroy(new Error('响应过大')); });
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch (_) { reject(new Error('位置服务返回数据无效')); } });
    });
    req.on('timeout', () => req.destroy(new Error('位置服务超时')));
    req.on('error', reject);
  });
}
function clean(v, max = 50) { return String(v || '').trim().slice(0, max); }
const normalize = v => clean(v, 90).toLowerCase().replace(/[\s·•\-.(),（）「」\[\]']/g, '');
function candidateMatches(keyword, title) {
  const k = normalize(keyword), t = normalize(title);
  if (k.length < 2 || !t) return false;
  // 不凭距离直接接受不相干的店名。
  return t === k || (k.length >= 3 && (t.includes(k) || k.includes(t) && t.length >= 3));
}
function inGuangzhou(p) {
  return p && +p.lat > 22.4 && +p.lat < 23.9 && +p.lng > 112.5 && +p.lng < 114.4;
}
async function searchTencent(keyword, key, count = 12) {
  const path = '/ws/place/v1/search?boundary=' + encodeURIComponent('region(广州,0)') + '&keyword=' + encodeURIComponent(keyword) + '&page_size=' + count + '&key=' + encodeURIComponent(key);
  const resp = await httpGet(path);
  if (resp.status !== 0) throw new Error('腾讯地点服务错误：' + clean(resp.message || resp.status, 100));
  return (resp.data || []).filter(x => inGuangzhou(x.location)).map(x => ({
    poiId: x.id || '', name: x.title || '', address: x.address || '',
    latitude: +x.location.lat, longitude: +x.location.lng,
    category: x.category || ''
  }));
}
function validateActionBatch(items, limit) { return Array.isArray(items) ? items.slice(0, limit) : []; }
exports.main = async event => {
  const key = process.env.QQMAP_KEY;
  if (!key) return { ok: false, error: '云函数未设置 QQMAP_KEY 环境变量' };
  const action = clean(event.action, 30);
  try {
    if (action === 'search') {
      const keyword = clean(event.keyword, 40);
      if (keyword.length < 2) return { ok: false, error: '至少输入两个字符' };
      return { ok: true, candidates: await searchTencent(keyword, key, 15) };
    }
    if (action === 'resolveBars' || action === 'resolveStations') {
      const items = validateActionBatch(event.items, 6);
      const results = [];
      for (const item of items) {
        const itemId = clean(item.id, 30);
        const searchKey = clean(item.searchKey, 40);
        if (!searchKey || !itemId) continue;
        const isStation = action === 'resolveStations';
        const keyword = isStation ? searchKey + '地铁站' : searchKey;
        try {
          const candidates = await searchTencent(keyword, key, 8);
          // 地铁站名同名且类别明确，或酒吧名匹配才采用。
          const matched = candidates.find(x => isStation
            ? candidateMatches(searchKey, x.name.replace(/地铁站|站（.*?）|站$/g, ''))
            : candidateMatches(searchKey, x.name));
          results.push({ id: itemId, candidate: matched || null, matched: !!matched });
        } catch (err) { results.push({ id: itemId, candidate: null, matched: false, error: String(err.message).slice(0, 100) }); }
      }
      return { ok: true, results };
    }
    return { ok: false, error: '不支持的操作' };
  } catch (err) { return { ok: false, error: String(err.message || err).slice(0, 180) }; }
};
