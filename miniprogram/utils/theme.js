/**
 * Jiuji's appearance registry. City minimal is the product default.
 * Future settings UI can call setTheme(id); all pages read getTheme() onShow.
 * Theme IDs and colors are UI metadata, not a replacement for the native map.
 */
const STORAGE_KEY = 'jiuji-appearance-v1';
const DEFAULT_THEME = 'minimal';
const THEMES = Object.freeze({
  editorial: Object.freeze({ id: 'editorial', label: '城市编辑', accent: '#82442F', background: '#F4EDDF', surface: '#F9F4EB', foreground: '#35291F', navigationText: '#000000' }),
  minimal: Object.freeze({ id: 'minimal', label: '城市极简', accent: '#82442F', background: '#F7F5F5', surface: '#FFFFFF', foreground: '#242329', navigationText: '#000000' }),
  noir: Object.freeze({ id: 'noir', label: '夜航 Noir', accent: '#E9BA79', background: '#131418', surface: '#222126', foreground: '#F8F2E9', navigationText: '#ffffff' }),
  pop: Object.freeze({ id: 'pop', label: '新潮探索', accent: '#3048E8', background: '#F2F2FF', surface: '#FFFFFF', foreground: '#15204C', navigationText: '#000000' })
});
function normalizeTheme(id) { return Object.prototype.hasOwnProperty.call(THEMES, id) ? id : DEFAULT_THEME; }
function getTheme() {
  try { return normalizeTheme(wx.getStorageSync(STORAGE_KEY)); }
  catch (_) { return DEFAULT_THEME; }
}
function setTheme(id) {
  const theme = normalizeTheme(id);
  try { wx.setStorageSync(STORAGE_KEY, theme); } catch (_) { return false; }
  return true;
}
// Apply on every page onShow. Missing/invalid legacy preference uses A; an explicitly stored editorial or other theme is preserved.
function applyTheme(page) {
  const theme = getTheme();
  page.setData({ themeKey: theme });
  const t = THEMES[theme];
  if (typeof wx !== 'undefined' && wx.setTabBarStyle) {
    wx.setTabBarStyle({ color: theme === 'noir' ? '#C2B8AE' : (theme === 'editorial' ? '#887969' : '#6F6D74'), selectedColor: t.accent, backgroundColor: t.surface, borderStyle: 'black', fail() {} });
  }
  if (typeof wx !== 'undefined' && wx.setNavigationBarColor) {
    wx.setNavigationBarColor({ frontColor: t.navigationText, backgroundColor: t.surface, animation: { duration: 0, timingFunc: 'linear' }, fail() {} });
  }
  return theme;
}
module.exports = { STORAGE_KEY, DEFAULT_THEME, THEMES, normalizeTheme, getTheme, setTheme, applyTheme };
