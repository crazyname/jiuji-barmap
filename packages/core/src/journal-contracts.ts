// SPDX-License-Identifier: MPL-2.0
import type { DrinkEntry, DrinkEntryChanges, NewDrinkEntry, NewVisitSession,
  VisitSession, VisitSessionChanges } from './models'

export interface VerifiedJournalIdentity {
  kind: 'verified'
  userId: string
  // Only a future, actual authentication adapter may assert verification here.
  // This shape is injectable for isolated unit tests; never trust a UI-supplied ID.
}
export interface JournalStorage {
  read(key: string): unknown
  write(key: string, snapshot: unknown): void
}
export interface JournalDependencies {
  storage: JournalStorage
  identity: () => VerifiedJournalIdentity | null
  newId: () => string
  now: () => string
}
export interface CocktailArchiveGroup {
  key: string
  label: string
  cocktailId: string | null
  entries: DrinkEntry[]
}
export interface PrivateJournalRepository {
  createDrink(input: NewDrinkEntry, clientMutationId: string): DrinkEntry
  getDrink(id: string): DrinkEntry | null
  listDrinks(): DrinkEntry[]
  updateDrink(id: string, patch: DrinkEntryChanges, expectedRevision: number): DrinkEntry
  deleteDrink(id: string, expectedRevision: number): void
  createVisit(input: NewVisitSession, clientMutationId: string): VisitSession
  getVisit(id: string): VisitSession | null
  listVisits(): VisitSession[]
  updateVisit(id: string, patch: VisitSessionChanges, expectedRevision: number): VisitSession
  deleteVisit(id: string, expectedRevision: number): void
  linkDrink(id: string, visitId: string | null, expectedRevision: number): DrinkEntry
  listDrinksForVisit(visitId: string): DrinkEntry[]
  groupDrinksByCocktail(): CocktailArchiveGroup[]
}
