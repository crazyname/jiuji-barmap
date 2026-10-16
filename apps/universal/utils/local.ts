/** Per-installation prototypes only. These keys are NOT a cross-device account. */
export type LocationPoint = { latitude: number, longitude: number, address: string }
export type Journal = { id: number, title: string, body: string, category: string, author: string, createdAt: string }
const KEY_MAP = 'jiuji.universal.locations.v1'
const KEY_RECIPES = 'jiuji.universal.recipes.v1'
const KEY_POSTS = 'jiuji.universal.posts.v1'

export function getLocalLocations(): Record<string, LocationPoint> {
  try {
    const value = uni.getStorageSync(KEY_MAP) as Record<string, LocationPoint> | null
    return value == null ? {} : value
  } catch (_) { return {} }
}
export function setLocalLocation(id: number, point: LocationPoint): void {
  const locations = getLocalLocations()
  locations[String(id)] = point
  uni.setStorageSync(KEY_MAP, locations)
}
export function getJournals(kind: string): Journal[] {
  const key = kind == 'recipe' ? KEY_RECIPES : KEY_POSTS
  try {
    const value = uni.getStorageSync(key) as Journal[] | null
    return value == null ? [] : value
  } catch (_) { return [] }
}
export function addJournal(kind: string, entry: Journal): void {
  const key = kind == 'recipe' ? KEY_RECIPES : KEY_POSTS
  const items = getJournals(kind)
  items.unshift(entry)
  uni.setStorageSync(key, items)
}
export function getProfile(): string {
  try { return (uni.getStorageSync('jiuji.universal.nickname.v1') as string) || '酒迹用户' }
  catch (_) { return '酒迹用户' }
}
export function setProfile(name: string): void {
  uni.setStorageSync('jiuji.universal.nickname.v1', name)
}
