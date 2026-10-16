import Taro from '@tarojs/taro'
import seed from '../data/bars.json'

export interface Point { latitude: number; longitude: number }
export interface Venue {
  id: number
  name: string
  searchKey?: string
  station: string
  exit?: string
  addressHint?: string
  resolvedAddress?: string
  status: 'official' | 'listed' | 'unknown' | 'closed'
  lines?: string[]
  originalDistanceM?: number | null
  statusCheckedAt?: string
  location: Point | null
  locationSource?: string | null
  rating?: { score: number | null; price: number | null; reviews?: number; platform?: string } | null
}
export const INITIAL_VENUES = seed as Venue[]
export const STATUS_LABEL: Record<Venue['status'], string> = {
  official: '官网有资料', listed: '平台有记录', unknown: '待核实', closed: '停业提示'
}
export const STATUS_OPTIONS = [
  { value: 'all', text: '全部状态' },
  { value: 'official', text: '官网有资料' },
  { value: 'listed', text: '平台有记录' },
  { value: 'unknown', text: '待核实' },
  { value: 'closed', text: '停业提示' }
] as const

const CURRENT_KEY = 'jiuji-react-bars-v1'
const PREVIOUS_KEY = 'gz-atlas-bars-v2'
const FAVORITES_KEY = 'jiuji-personal-v1:favorites'
const HISTORY_KEY = 'jiuji-personal-v1:history'

function readArray(key: string): unknown[] {
  try { const data: unknown = Taro.getStorageSync(key); return Array.isArray(data) ? data : [] }
  catch (_) { return [] }
}
function writeArray(key: string, values: unknown[]): boolean {
  try { Taro.setStorageSync(key, values); return true }
  catch (_) { return false }
}
export function validPoint(point: unknown): point is Point {
  if (!point || typeof point !== 'object') return false
  const obj = point as Partial<Point>
  return typeof obj.latitude === 'number' && typeof obj.longitude === 'number' &&
    Number.isFinite(obj.latitude) && Number.isFinite(obj.longitude) &&
    obj.latitude >= 22.5 && obj.latitude <= 23.9 &&
    obj.longitude >= 112.5 && obj.longitude <= 114.2
}
function parseEntries(value: unknown[]): Venue[] {
  return value.filter((entry): entry is Venue =>
    !!entry && typeof entry === 'object' && Number.isInteger((entry as Venue).id) &&
    typeof (entry as Venue).name === 'string')
}
export function getVenues(): Venue[] {
  const current = parseEntries(readArray(CURRENT_KEY))
  const previous = current.length ? current : parseEntries(readArray(PREVIOUS_KEY))
  const saved = new Map(previous.map(item => [item.id, item]))
  const merged = INITIAL_VENUES.map(initial => {
    const edit = saved.get(initial.id)
    const location = validPoint(edit?.location) ? edit!.location : validPoint(initial.location) ? initial.location : null
    return edit ? { ...initial, ...edit, location } : { ...initial, location }
  })
  const extras = previous.filter(item => !INITIAL_VENUES.some(original => original.id === item.id))
    .map(item => ({ ...item, location: validPoint(item.location) ? item.location : null }))
  if (!current.length && previous.length) writeArray(CURRENT_KEY, [...merged, ...extras])
  return [...merged, ...extras]
}
export function updateVenueLocation(id: number, location: Point, address: string): boolean {
  if (!validPoint(location)) return false
  const all = getVenues()
  const target = all.find(item => item.id === id)
  if (!target) return false
  target.location = location
  target.resolvedAddress = address
  target.locationSource = 'user-map-selection'
  return writeArray(CURRENT_KEY, all)
}
export function favoriteIds(): string[] {
  return readArray(FAVORITES_KEY).map(String)
}
export function toggleFavorite(id: number): boolean {
  const values = favoriteIds()
  const key = String(id)
  const next = values.includes(key) ? values.filter(item => item !== key) : [key, ...values]
  return writeArray(FAVORITES_KEY, next) ? next.includes(key) : values.includes(key)
}
export function addVenueVisit(id: number): void {
  const key = 'bar:' + id
  const previous = readArray(HISTORY_KEY).filter(item =>
    !!item && typeof item === 'object' && (item as { key?: string }).key !== key)
  writeArray(HISTORY_KEY, [{
    key, kind: 'bar', id: String(id), viewedAt: new Date().toISOString()
  }, ...previous].slice(0, 80))
}
export function ratingText(venue: Venue): string {
  return typeof venue.rating?.score === 'number' ? '★ ' + venue.rating.score.toFixed(1) : '评分待核实'
}
export function priceText(venue: Venue): string {
  return typeof venue.rating?.price === 'number' ? '人均 ¥' + venue.rating.price : '人均待核实'
}
