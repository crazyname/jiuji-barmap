export type BarStatus = 'official' | 'listed' | 'unknown' | 'closed'
export interface Coordinate { latitude: number; longitude: number }
export interface Bar {
  id: number
  name: string
  station: string
  searchKey?: string
  status: BarStatus
  location: Coordinate | null
  rating?: { price: number | null; score: number | null } | null
}
export type ContentKind = 'recipe' | 'post' | 'promotion'
export type AppTab = 'map' | 'mix' | 'community' | 'mine'
export const TAB_ORDER: ReadonlyArray<AppTab> = ['map', 'mix', 'community', 'mine']
export const EDITORIAL_ACCENT = '#82442F'
export function validLocation(point: Coordinate | null | undefined): point is Coordinate {
  return !!point && Number.isFinite(point.latitude) && Number.isFinite(point.longitude) &&
    point.latitude >= -90 && point.latitude <= 90 && point.longitude >= -180 && point.longitude <= 180
}
export function searchBars<T extends Pick<Bar, 'name' | 'station' | 'status'>>(bars: T[], query: string, status?: BarStatus): T[] {
  const needle = query.trim().toLocaleLowerCase()
  return bars.filter(bar => (!status || bar.status === status) &&
    (!needle || (bar.name + ' ' + bar.station).toLocaleLowerCase().includes(needle)))
}
