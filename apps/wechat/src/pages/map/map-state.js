// Pure state and data rules. Shared by Taro and Node regression tests.
// There are no inferred POIs, distances or business hours here.
const TRUSTED_LOCATION_SOURCES = new Set([
  'user-map-selection', 'verified-poi', 'official-confirmed'
])

function hasTrustedLocation(venue) {
  if (!venue || !TRUSTED_LOCATION_SOURCES.has(venue.locationSource)) return false
  const p = venue.location
  return !!p && typeof p.latitude === 'number' && typeof p.longitude === 'number' &&
    Number.isFinite(p.latitude) && Number.isFinite(p.longitude) &&
    p.latitude >= 22.5 && p.latitude <= 23.9 &&
    p.longitude >= 112.5 && p.longitude <= 114.2
}

function filterVenues(venues, query, status) {
  const text = String(query || '').trim().toLocaleLowerCase()
  return venues.filter(bar =>
    (status === 'all' || status === bar.status) &&
    (!text || [bar.name, bar.station, bar.searchKey, bar.addressHint, bar.resolvedAddress]
      .filter(Boolean).join(' ').toLocaleLowerCase().includes(text)))
}

const INITIAL_VIEW = Object.freeze({ mode: 'map', sheet: 'peek', selectedId: null })
function transitionView(view, action) {
  switch (action.type) {
    case 'select': return { mode: 'map', sheet: 'selected', selectedId: action.id }
    case 'clear': return { ...view, mode: 'map', sheet: 'peek', selectedId: null }
    case 'show-list': return { ...view, mode: 'list' }
    case 'show-map': return { ...view, mode: 'map',
      sheet: view.selectedId === null ? 'peek' : 'selected' }
    case 'expand': return { ...view, sheet: 'expanded' }
    case 'collapse': return { ...view, sheet: view.selectedId === null ? 'peek' : 'selected' }
    case 'filter': return { ...view, selectedId: null, sheet: 'peek' }
    default: return view
  }
}

function locationErrorMessage(error) {
  const message = String(error && (error.errMsg || error.message || error))
  if (/auth|deny|denied|permission|authorize|拒绝|授权|隐私/i.test(message))
    return '未获得定位权限，可继续手动浏览广州地图'
  return '无法获取当前位置，可继续搜索或浏览酒吧'
}

module.exports = { TRUSTED_LOCATION_SOURCES, hasTrustedLocation, filterVenues,
  INITIAL_VIEW, transitionView, locationErrorMessage }
