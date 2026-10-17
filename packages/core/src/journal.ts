// SPDX-License-Identifier: MPL-2.0
// PR-03 domain logic: no WeChat APIs, Site sync, public posts or ratings.
import type { DrinkContextDetails, DrinkContextKind, DrinkEntry, DrinkEntryChanges,
  NewDrinkEntry, NewVisitSession, VisitSession, VisitSessionChanges } from './models'
import type { JournalDependencies, JournalStorage, PrivateJournalRepository,
  VerifiedJournalIdentity, CocktailArchiveGroup } from './journal-contracts'

type Mutation = { kind: 'drink' | 'visit'; entityId: string; fingerprint: string }
interface Snapshot {
  schemaVersion: 1
  ownerUserId: string
  drinks: DrinkEntry[]
  visits: VisitSession[]
  mutations: Record<string, Mutation>
}

export const JOURNAL_SCHEMA_VERSION = 1
export const JOURNAL_STORAGE_PREFIX = 'jiuji.private-journal.v1:user:'

export type JournalErrorCode = 'AUTH_REQUIRED' | 'INVALID_INPUT' | 'NOT_FOUND' |
  'CONFLICT' | 'STORAGE_INVALID' | 'REPLAY_DELETED'
export class JournalError extends Error {
  readonly code: JournalErrorCode
  constructor(code: JournalErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'JournalError'
  }
}

function invalid(message: string): never { throw new JournalError('INVALID_INPUT', message) }
function copy<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function allowed(value: unknown, keys: readonly string[]): void {
  if (!object(value)) invalid('Expected an object')
  for (const key of Object.keys(value)) if (!keys.includes(key)) invalid('Unexpected field: ' + key)
}
function nonblank(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) invalid(field + ' must be a nonblank string')
  return value.trim()
}
function optionalText(value: unknown, field: string): string | null {
  return value === undefined || value === null ? null : nonblank(value, field)
}
function optionalRef(value: unknown, field: string): string | null {
  return optionalText(value, field)
}
function timestamp(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) ||
      !Number.isFinite(Date.parse(value))) invalid(field + ' must be an ISO datetime with timezone')
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) invalid(field + ' requires a timezone')
  return new Date(value).toISOString()
}
function mutationId(value: unknown): string {
  const id = nonblank(value, 'clientMutationId')
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(id) ||
      ['__proto__', 'constructor', 'prototype'].includes(id)) invalid('Invalid clientMutationId')
  return id
}
function context(value: unknown): DrinkContextKind {
  if (value !== 'bar' && value !== 'home' && value !== 'other') invalid('Unsupported contextKind')
  return value
}
function rating(value: unknown): number | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 5)
    invalid('personalRating must be 0..5')
  return value
}
function photos(value: unknown): string[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.length > 20) invalid('photoRefs must be an array of up to 20 references')
  return value.map(item => nonblank(item, 'photo reference'))
}
function details(value: unknown): DrinkContextDetails {
  if (value === undefined || value === null) return {}
  allowed(value, ['bar', 'home', 'other'])
  const src = value as Record<string, unknown>
  const out: DrinkContextDetails = {}
  if (src.bar !== undefined) {
    allowed(src.bar, ['menuItem', 'priceAmount'])
    const bar = src.bar as Record<string, unknown>
    const entry: NonNullable<DrinkContextDetails['bar']> = {}
    if (bar.menuItem !== undefined) entry.menuItem = nonblank(bar.menuItem, 'menuItem')
    if (bar.priceAmount !== undefined) {
      if (typeof bar.priceAmount !== 'number' || !Number.isFinite(bar.priceAmount) ||
          bar.priceAmount < 0) invalid('priceAmount must be nonnegative')
      entry.priceAmount = bar.priceAmount
    }
    out.bar = entry
  }
  if (src.home !== undefined) {
    allowed(src.home, ['preparationNote', 'ingredientsNote'])
    const home = src.home as Record<string, unknown>
    const entry: NonNullable<DrinkContextDetails['home']> = {}
    if (home.preparationNote !== undefined) entry.preparationNote = nonblank(home.preparationNote, 'preparationNote')
    if (home.ingredientsNote !== undefined) entry.ingredientsNote = nonblank(home.ingredientsNote, 'ingredientsNote')
    out.home = entry
  }
  if (src.other !== undefined) {
    allowed(src.other, ['placeNote'])
    const other = src.other as Record<string, unknown>
    const entry: NonNullable<DrinkContextDetails['other']> = {}
    if (other.placeNote !== undefined) entry.placeNote = nonblank(other.placeNote, 'placeNote')
    out.other = entry
  }
  return out
}
function drinkFields(input: NewDrinkEntry): Omit<DrinkEntry,
  'id' | 'ownerUserId' | 'visibility' | 'createdAt' | 'updatedAt' |
  'revision' | 'clientMutationId'> {
  allowed(input, ['drinkLabel', 'cocktailId', 'recipeVariantId', 'visitSessionId',
    'consumedAt', 'contextKind', 'photoRefs', 'note', 'personalRating', 'contextDetails'])
  return {
    drinkLabel: nonblank(input.drinkLabel, 'drinkLabel'),
    cocktailId: optionalRef(input.cocktailId, 'cocktailId'),
    recipeVariantId: optionalRef(input.recipeVariantId, 'recipeVariantId'),
    visitSessionId: optionalRef(input.visitSessionId, 'visitSessionId'),
    consumedAt: timestamp(input.consumedAt, 'consumedAt'),
    contextKind: context(input.contextKind),
    photoRefs: photos(input.photoRefs),
    note: optionalText(input.note, 'note'),
    personalRating: rating(input.personalRating),
    contextDetails: details(input.contextDetails)
  }
}
function visitFields(input: NewVisitSession): Pick<VisitSession, 'barId' | 'placeLabel' | 'occurredAt' | 'note'> {
  allowed(input, ['barId', 'placeLabel', 'occurredAt', 'note'])
  if (input.barId !== undefined && input.barId !== null &&
      (!Number.isSafeInteger(input.barId) || input.barId <= 0)) invalid('barId must be a positive integer')
  return {
    barId: input.barId === undefined ? null : input.barId,
    placeLabel: optionalText(input.placeLabel, 'placeLabel'),
    occurredAt: timestamp(input.occurredAt, 'occurredAt'),
    note: optionalText(input.note, 'note')
  }
}
function validateRevision(expected: number, actual: number): void {
  if (!Number.isSafeInteger(expected) || expected < 1) invalid('expectedRevision must be positive')
  if (expected !== actual) throw new JournalError('CONFLICT', 'Record has changed')
}
function sortBy<T extends { id: string }>(rows: T[], field: keyof T): T[] {
  return rows.sort((a, b) => String(b[field]).localeCompare(String(a[field])) || a.id.localeCompare(b.id))
}

export function journalStorageKey(userId: string): string {
  return JOURNAL_STORAGE_PREFIX + encodeURIComponent(nonblank(userId, 'userId'))
}

/** A pure, identity-scoped repository. Identity is checked on EVERY read and write. */
export function createJournalRepository(deps: JournalDependencies): PrivateJournalRepository {
  const { storage, identity, newId, now } = deps
  function principal(): VerifiedJournalIdentity {
    const user = identity()
    if (!user || user.kind !== 'verified' ||
        typeof user.userId !== 'string' || !user.userId.trim())
      throw new JournalError('AUTH_REQUIRED', 'Verified login required before private journal access')
    return user
  }
  function load(): { owner: string; key: string; state: Snapshot } {
    const owner = principal().userId.trim()
    const key = journalStorageKey(owner)
    const raw: unknown = storage.read(key)
    if (raw === undefined || raw === null || raw === '') {
      return { owner, key, state: { schemaVersion: 1, ownerUserId: owner,
        drinks: [], visits: [], mutations: {} } }
    }
    if (!object(raw) || raw.schemaVersion !== JOURNAL_SCHEMA_VERSION ||
        raw.ownerUserId !== owner || !Array.isArray(raw.drinks) ||
        !Array.isArray(raw.visits) || !object(raw.mutations)) {
      throw new JournalError('STORAGE_INVALID', 'Private journal snapshot is incompatible or belongs to another user')
    }
    const state = copy(raw) as unknown as Snapshot
    for (const row of [...state.drinks, ...state.visits]) {
      if (!object(row) || row.ownerUserId !== owner || row.visibility !== 'private' ||
          typeof row.id !== 'string' || !Number.isSafeInteger(row.revision) || row.revision < 1)
        throw new JournalError('STORAGE_INVALID', 'Private journal ownership or record metadata invalid')
    }
    return { owner, key, state }
  }
  function save(key: string, state: Snapshot): void { storage.write(key, copy(state)) }
  function freshId(state: Snapshot): string {
    const id = nonblank(newId(), 'generated id')
    if (state.drinks.some(x => x.id === id) || state.visits.some(x => x.id === id) ||
        Object.values(state.mutations).some(x => x.entityId === id))
      throw new JournalError('CONFLICT', 'Generated record id already exists')
    return id
  }
  function createExisting(state: Snapshot, key: string, kind: Mutation['kind'],
      fingerprint: string): string | null {
    if (!Object.prototype.hasOwnProperty.call(state.mutations, key)) return null
    const found = state.mutations[key]
    if (!found || found.kind !== kind || found.fingerprint !== fingerprint)
      throw new JournalError('CONFLICT', 'Idempotency key was reused with different data')
    return found.entityId
  }
  function requireDrink(state: Snapshot, id: string): DrinkEntry {
    const found = state.drinks.find(item => item.id === id)
    if (!found) throw new JournalError('NOT_FOUND', 'Drink entry not found')
    return found
  }
  function requireVisit(state: Snapshot, id: string): VisitSession {
    const found = state.visits.find(item => item.id === id)
    if (!found) throw new JournalError('NOT_FOUND', 'Visit session not found')
    return found
  }
  function checkVisit(state: Snapshot, id: string | null): void {
    if (id !== null) requireVisit(state, id)
  }
  function nextTime(): string { return timestamp(now(), 'clock') }

  return {
    createDrink(input, clientMutationId) {
      const { owner, key, state } = load()
      const normalized = drinkFields(input)
      const mutationKey = mutationId(clientMutationId)
      const fingerprint = JSON.stringify(normalized)
      const prior = createExisting(state, mutationKey, 'drink', fingerprint)
      if (prior !== null) {
        const existing = state.drinks.find(row => row.id === prior)
        if (!existing) throw new JournalError('REPLAY_DELETED', 'Previously created record was deleted')
        return copy(existing)
      }
      checkVisit(state, normalized.visitSessionId)
      const moment = nextTime()
      const row: DrinkEntry = {
        ...normalized, id: freshId(state), ownerUserId: owner, visibility: 'private',
        createdAt: moment, updatedAt: moment, revision: 1, clientMutationId: mutationKey
      }
      state.drinks.push(row)
      state.mutations[mutationKey] = { kind: 'drink', entityId: row.id, fingerprint }
      save(key, state)
      return copy(row)
    },
    getDrink(id) {
      const { state } = load()
      return copy(state.drinks.find(row => row.id === id) || null)
    },
    listDrinks() {
      const { state } = load()
      return copy(sortBy(state.drinks, 'consumedAt'))
    },
    updateDrink(id, patch, expectedRevision) {
      const { key, state } = load()
      const row = requireDrink(state, id)
      validateRevision(expectedRevision, row.revision)
      allowed(patch, ['drinkLabel', 'cocktailId', 'recipeVariantId', 'consumedAt',
        'contextKind', 'photoRefs', 'note', 'personalRating', 'contextDetails'])
      if (Object.keys(patch).length === 0) invalid('Update patch must not be empty')
      const normalized = drinkFields({
        drinkLabel: patch.drinkLabel ?? row.drinkLabel,
        cocktailId: patch.cocktailId === undefined ? row.cocktailId : patch.cocktailId,
        recipeVariantId: patch.recipeVariantId === undefined ? row.recipeVariantId : patch.recipeVariantId,
        visitSessionId: row.visitSessionId,
        consumedAt: patch.consumedAt ?? row.consumedAt,
        contextKind: patch.contextKind ?? row.contextKind,
        photoRefs: patch.photoRefs === undefined ? row.photoRefs : patch.photoRefs,
        note: patch.note === undefined ? row.note : patch.note,
        personalRating: patch.personalRating === undefined ? row.personalRating : patch.personalRating,
        contextDetails: patch.contextDetails === undefined ? row.contextDetails : patch.contextDetails
      })
      // visitSessionId can ONLY be changed by linkDrink()
      Object.assign(row, normalized, { updatedAt: nextTime(), revision: row.revision + 1 })
      save(key, state)
      return copy(row)
    },
    deleteDrink(id, expectedRevision) {
      const { key, state } = load()
      const row = requireDrink(state, id)
      validateRevision(expectedRevision, row.revision)
      state.drinks = state.drinks.filter(item => item.id !== id)
      save(key, state)
    },
    createVisit(input, clientMutationId) {
      const { owner, key, state } = load()
      const normalized = visitFields(input)
      const mutationKey = mutationId(clientMutationId)
      const fingerprint = JSON.stringify(normalized)
      const prior = createExisting(state, mutationKey, 'visit', fingerprint)
      if (prior !== null) {
        const existing = state.visits.find(row => row.id === prior)
        if (!existing) throw new JournalError('REPLAY_DELETED', 'Previously created record was deleted')
        return copy(existing)
      }
      const moment = nextTime()
      const row: VisitSession = {
        ...normalized, id: freshId(state), ownerUserId: owner, visibility: 'private',
        createdAt: moment, updatedAt: moment, revision: 1, clientMutationId: mutationKey
      }
      state.visits.push(row)
      state.mutations[mutationKey] = { kind: 'visit', entityId: row.id, fingerprint }
      save(key, state)
      return copy(row)
    },
    getVisit(id) {
      const { state } = load()
      return copy(state.visits.find(row => row.id === id) || null)
    },
    listVisits() {
      const { state } = load()
      return copy(sortBy(state.visits, 'occurredAt'))
    },
    updateVisit(id, patch, expectedRevision) {
      const { key, state } = load()
      const row = requireVisit(state, id)
      validateRevision(expectedRevision, row.revision)
      allowed(patch, ['barId', 'placeLabel', 'occurredAt', 'note'])
      if (!Object.keys(patch).length) invalid('Update patch must not be empty')
      const normalized = visitFields({
        barId: patch.barId === undefined ? row.barId : patch.barId,
        placeLabel: patch.placeLabel === undefined ? row.placeLabel : patch.placeLabel,
        occurredAt: patch.occurredAt ?? row.occurredAt,
        note: patch.note === undefined ? row.note : patch.note
      })
      Object.assign(row, normalized, { updatedAt: nextTime(), revision: row.revision + 1 })
      save(key, state)
      return copy(row)
    },
    deleteVisit(id, expectedRevision) {
      const { key, state } = load()
      const row = requireVisit(state, id)
      validateRevision(expectedRevision, row.revision)
      const moment = nextTime()
      // Removing a session never removes or merges any drink; unlink in one snapshot.
      for (const drink of state.drinks) if (drink.visitSessionId === id) {
        drink.visitSessionId = null
        drink.revision++
        drink.updatedAt = moment
      }
      state.visits = state.visits.filter(item => item.id !== id)
      save(key, state)
    },
    linkDrink(id, visitId, expectedRevision) {
      const { key, state } = load()
      const drink = requireDrink(state, id)
      validateRevision(expectedRevision, drink.revision)
      if (visitId !== null) nonblank(visitId, 'visitId')
      checkVisit(state, visitId)
      if (drink.visitSessionId === visitId) return copy(drink)
      drink.visitSessionId = visitId
      drink.revision++
      drink.updatedAt = nextTime()
      save(key, state)
      return copy(drink)
    },
    listDrinksForVisit(visitId) {
      const { state } = load()
      requireVisit(state, visitId)
      return copy(sortBy(state.drinks.filter(row => row.visitSessionId === visitId), 'consumedAt'))
    },
    groupDrinksByCocktail(): CocktailArchiveGroup[] {
      const { state } = load()
      const groups = new Map<string, CocktailArchiveGroup>()
      for (const entry of sortBy(state.drinks, 'consumedAt')) {
        const key = entry.cocktailId !== null
          ? 'cocktail:' + entry.cocktailId
          : 'custom:' + entry.drinkLabel.normalize('NFKC').trim().toLocaleLowerCase()
        let group = groups.get(key)
        if (!group) {
          group = { key, label: entry.drinkLabel, cocktailId: entry.cocktailId, entries: [] }
          groups.set(key, group)
        }
        group.entries.push(copy(entry))
      }
      return [...groups.values()]
    }
  }
}
