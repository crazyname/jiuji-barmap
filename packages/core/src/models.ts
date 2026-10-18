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


// JR-001..008: private drink facts and private visit sessions are separate entities.
// Knowledge-base IDs are optional references, never automatically created records.
export type DrinkContextKind = 'bar' | 'home' | 'other'
export type PrivateVisibility = 'private'
export interface DrinkContextDetails {
  bar?: { barId?: number; menuItem?: string; priceAmount?: number }
  home?: { preparationNote?: string; ingredientsNote?: string }
  other?: { placeNote?: string }
}
export interface DrinkEntry {
  id: string
  ownerUserId: string
  drinkLabel: string
  cocktailId: string | null
  recipeVariantId: string | null
  visitSessionId: string | null
  consumedAt: string
  contextKind: DrinkContextKind
  photoRefs: string[]
  note: string | null
  personalRating: number | null
  contextDetails: DrinkContextDetails
  visibility: PrivateVisibility
  createdAt: string
  updatedAt: string
  revision: number
  clientMutationId: string
}
export interface VisitSession {
  id: string
  ownerUserId: string
  barId: number | null
  placeLabel: string | null
  occurredAt: string
  note: string | null
  visibility: PrivateVisibility
  createdAt: string
  updatedAt: string
  revision: number
  clientMutationId: string
}
export type NewDrinkEntry = Pick<DrinkEntry, 'drinkLabel' | 'consumedAt' | 'contextKind'> &
  Partial<Pick<DrinkEntry, 'cocktailId' | 'recipeVariantId' | 'visitSessionId' |
    'photoRefs' | 'note' | 'personalRating' | 'contextDetails'>>
export type NewVisitSession = Pick<VisitSession, 'occurredAt'> &
  Partial<Pick<VisitSession, 'barId' | 'placeLabel' | 'note'>>
export type DrinkEntryChanges = Partial<Pick<DrinkEntry, 'drinkLabel' | 'cocktailId' |
  'recipeVariantId' | 'consumedAt' | 'contextKind' | 'photoRefs' | 'note' |
  'personalRating' | 'contextDetails'>>
export type VisitSessionChanges = Partial<Pick<VisitSession, 'barId' | 'placeLabel' |
  'occurredAt' | 'note'>>


// PR-10: Public knowledge entities and recipe versions are distinct from
// private DrinkEntry references and legacy Sites v1 flat Recipe.
export type KnowledgeVerification = 'verified' | 'unverified'
export type RecipeVersionStatus = 'published' | 'draft'
export type RecipeSourceType = 'primary' | 'secondary' | 'legacy' | 'user'
export interface RecipeSource {
  name: string
  url: string | null
  type: RecipeSourceType
  verifiedAt: string | null // ISO date, never inferred from createdAt
}
export interface Cocktail {
  id: string
  nameZh: string
  nameOriginal: string
  aliases: string[]
  description?: string
  baseCategory?: string
  tags: string[]
  source: RecipeSource
  verification: KnowledgeVerification
  recipeVariantIds: string[]
}
export type IngredientUnit = 'ml' | 'oz' | 'dash' | 'piece' | 'tsp' | 'unspecified'
export interface RecipeIngredient {
  name: string
  quantity: number | null
  unit: IngredientUnit
  optional: boolean
  /** Original source wording if quantity cannot be reliably parsed. */
  originalText?: string
}
export interface RecipeVariant {
  id: string
  cocktailId: string
  title: string
  author: string
  source: RecipeSource
  ingredients: RecipeIngredient[]
  steps: string[]
  glass?: string
  technique?: string
  garnish?: string
  yieldMl?: number
  status: RecipeVersionStatus
  verification: KnowledgeVerification
  createdAt: string
  updatedAt: string
}
export interface CocktailCatalog {
  schemaVersion: 1
  cocktails: Cocktail[]
  variants: RecipeVariant[]
}
