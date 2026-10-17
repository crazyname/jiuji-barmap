import type { Venue } from '../../utils/venues'
export type MapMode = 'map' | 'list'
export type Sheet = 'peek' | 'selected' | 'expanded'
export interface MapView { mode: MapMode; sheet: Sheet; selectedId: number | null }
export type MapViewAction =
  | { type: 'select'; id: number }
  | { type: 'clear' | 'show-list' | 'show-map' | 'expand' | 'collapse' | 'filter' }
export const TRUSTED_LOCATION_SOURCES: ReadonlySet<string>
export function hasTrustedLocation(venue: Venue | undefined | null): boolean
export function filterVenues(venues: Venue[], query: string, status: string): Venue[]
export const INITIAL_VIEW: Readonly<MapView>
export function transitionView(view: MapView, action: MapViewAction): MapView
export function locationErrorMessage(error: unknown): string
