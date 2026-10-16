/** Local-first demo repository. Not a public social feed, not cross-device sync. */
const PREFIX = 'jiuji-personal-v1:';
const KINDS = ['recipes', 'posts', 'favorites', 'likes', 'history', 'profile'];
const read = (kind, fallback) => {
  if (!KINDS.includes(kind)) throw new Error('Unknown local storage kind');
  try { const data = wx.getStorageSync(PREFIX + kind); return data == null || data === '' ? fallback : data; }
  catch (_) { return fallback; }
};
const write = (kind, value) => {
  if (!KINDS.includes(kind)) throw new Error('Unknown local storage kind');
  try { wx.setStorageSync(PREFIX + kind, value); return true; } catch (_) { return false; }
};
const list = kind => { const value = read(kind, []); return Array.isArray(value) ? value : []; };
const add = (kind, value) => {
  if (!['recipes','posts'].includes(kind)) return null;
  const valueList = list(kind), id = `${Date.now()}-${Math.random().toString(36).slice(2,9)}`;
  const item = { ...value, id, createdAt: new Date().toISOString(), scope: 'local' };
  return write(kind,[item,...valueList]) ? item : null;
};
function toggle(kind,id){
  if (!['favorites','likes'].includes(kind)) return false;
  const ids = list(kind).map(String), key=String(id);
  const next=ids.includes(key) ? ids.filter(x=>x!==key) : [key,...ids];
  return write(kind,next) ? next.includes(key) : ids.includes(key);
}
function visited(kind,id){
  if (!['bar','recipe','post'].includes(kind)) return false;
  const key=`${kind}:${id}`;
  const previous=list('history').filter(x=>x.key!==key);
  return write('history',[{key,kind,id:String(id),viewedAt:new Date().toISOString()},...previous].slice(0,80));
}
function postTypeLabel(type){return ({visit:'探店',tasting:'品酒',promo:'广告推广'})[type]||'分享';}
function xhsText(post){
 const base=`${(post.title||'').trim()}\n\n${(post.body||'').trim()}`.trim();
 const tag=(post.tags||'').split(/[，,\s#]+/).map(s=>s.trim()).filter(Boolean).slice(0,5);
 const all=[...new Set(['酒迹','JiujiBarMap',...tag])];
 const disclosure=post.type==='promo'?'【广告/商业推广】\n':'';
 return (disclosure+base+'\n\n'+all.map(t=>'#'+t).join(' ')).trim();
}
module.exports={PREFIX,read,write,list,add,toggle,visited,postTypeLabel,xhsText};
