// SPDX-License-Identifier: MPL-2.0
// These tests EXECUTE the actual TypeScript repository with Node 22 type stripping.
// No duplicated JavaScript business logic and no network/WeChat SDK required.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createJournalRepository, JournalError, journalStorageKey } from '../packages/core/src/journal.ts'

const drink = (time = '2026-10-17T14:00:00+08:00', name = '自创鸡尾酒') =>
  ({ drinkLabel: name, consumedAt: time, contextKind: 'home' })
const visit = (time = '2026-10-17T18:00:00+08:00') =>
  ({ occurredAt: time, barId: 12, placeLabel: null })
const mutation = (index) => 'mutation-' + String(index).padStart(4, '0')
const code = (value) => (error) => error instanceof JournalError && error.code === value
function fixture() {
  const persisted = new Map()
  const writes = []
  let principal = { kind: 'verified', userId: 'user-A' }
  let count = 0
  let tick = 0
  let failWrites = false
  const storage = {
    read(key) { return persisted.get(key) },
    write(key, snapshot) {
      if (failWrites) throw Error('Quota exceeded')
      const safe = JSON.parse(JSON.stringify(snapshot))
      persisted.set(key, safe)
      writes.push(key)
    }
  }
  const repo = createJournalRepository({
    storage,
    identity: () => principal,
    newId: () => 'item-' + String(++count).padStart(5, '0'),
    now: () => new Date(Date.UTC(2026, 9, 17, 10, tick++)).toISOString()
  })
  return {
    repo, storage, persisted, writes,
    user(id) { principal = id ? { kind: 'verified', userId: id } : null },
    setUntrusted() { principal = { kind: 'guest', userId: 'user-A' } },
    failWrites(value) { failWrites = value }
  }
}

test('guest or missing/invalid verified identity cannot read OR write personal data', () => {
  const f = fixture()
  f.user(null)
  assert.throws(() => f.repo.createDrink(drink(), mutation(1)), code('AUTH_REQUIRED'))
  assert.throws(() => f.repo.listDrinks(), code('AUTH_REQUIRED'))
  assert.throws(() => f.repo.getVisit('anything'), code('AUTH_REQUIRED'))
  f.setUntrusted()
  assert.throws(() => f.repo.createVisit(visit(), mutation(2)), code('AUTH_REQUIRED'))
  assert.equal(f.persisted.size, 0)
})

test('free name saves without knowledge-base IDs, and creates only a private record', () => {
  const f = fixture()
  const x = f.repo.createDrink(drink(), mutation(1))
  assert.match(x.id, /^item-/)
  assert.equal(x.ownerUserId, 'user-A')
  assert.equal(x.visibility, 'private')
  assert.equal(x.cocktailId, null)
  assert.equal(x.recipeVariantId, null)
  assert.equal(x.visitSessionId, null)
  assert.equal(x.consumedAt, '2026-10-17T06:00:00.000Z')
  assert.equal(x.revision, 1)
  assert.deepEqual(f.repo.listDrinks(), [x])
  assert.deepEqual(f.writes, [journalStorageKey('user-A')])
})

test('one private visit links three independent drinks without copying or merging', () => {
  const f = fixture()
  const s = f.repo.createVisit(visit(), mutation(1))
  const drinks = [
    f.repo.createDrink(drink(undefined, '尼格罗尼'), mutation(2)),
    f.repo.createDrink(drink(undefined, '玛格丽特'), mutation(3)),
    f.repo.createDrink(drink(undefined, '金汤力'), mutation(4))
  ]
  const ids = drinks.map(x => x.id)
  for (const x of drinks) f.repo.linkDrink(x.id, s.id, x.revision)
  const linked = f.repo.listDrinksForVisit(s.id)
  assert.equal(linked.length, 3)
  assert.deepEqual(new Set(linked.map(x => x.id)), new Set(ids))
  assert.equal(f.repo.listDrinks().length, 3)
  assert.ok(linked.every(x => x.visitSessionId === s.id && x.revision === 2))
})

test('three separate drinks of the same cocktail group but never overwrite histories', () => {
  const f = fixture()
  const a = ['2026-10-15T11:00:00Z', '2026-10-16T11:00:00Z', '2026-10-17T11:00:00Z']
    .map((t, i) => f.repo.createDrink({ ...drink(t, '马天尼'), cocktailId: 'cocktail-martini' }, mutation(i + 1)))
  assert.equal(new Set(a.map(x => x.id)).size, 3)
  assert.deepEqual(f.repo.listDrinks().map(x => x.id), a.map(x => x.id).reverse())
  const groups = f.repo.groupDrinksByCocktail()
  assert.equal(groups.length, 1)
  assert.equal(groups[0].key, 'cocktail:cocktail-martini')
  assert.equal(groups[0].entries.length, 3)
  assert.equal(f.repo.listDrinks().length, 3)
})

test('free names group by normalized label, not by a fabricated knowledge-base ID', () => {
  const f = fixture()
  f.repo.createDrink(drink(undefined, '  gin TONIC  '), mutation(1))
  f.repo.createDrink(drink(undefined, 'GIN tonic'), mutation(2))
  f.repo.createDrink(drink(undefined, '原创酒 B'), mutation(3))
  const groups = f.repo.groupDrinksByCocktail()
  assert.deepEqual(groups.map(x => x.entries.length), [2, 1])
  assert.ok(groups.every(x => x.cocktailId === null && x.key.startsWith('custom:')))
})

test('create drink before visit, then link, correct link and detach without losing drink', () => {
  const f = fixture()
  const d = f.repo.createDrink(drink(), mutation(1))
  const a = f.repo.createVisit(visit(), mutation(2))
  const b = f.repo.createVisit(visit(), mutation(3))
  const linked = f.repo.linkDrink(d.id, a.id, d.revision)
  assert.equal(linked.visitSessionId, a.id)
  const corrected = f.repo.linkDrink(d.id, b.id, linked.revision)
  assert.equal(corrected.visitSessionId, b.id)
  const detached = f.repo.linkDrink(d.id, null, corrected.revision)
  assert.equal(detached.visitSessionId, null)
  assert.equal(f.repo.getDrink(d.id)?.id, d.id)
  assert.equal(f.repo.listDrinks().length, 1)
  assert.equal(f.repo.listDrinksForVisit(a.id).length, 0)
  assert.equal(f.repo.listDrinksForVisit(b.id).length, 0)
})

test('two visits on the same date and bar remain distinct and separate', () => {
  const f = fixture()
  const a = f.repo.createVisit(visit('2026-10-17T10:00:00Z'), mutation(1))
  const b = f.repo.createVisit(visit('2026-10-17T11:00:00Z'), mutation(2))
  assert.notEqual(a.id, b.id)
  assert.equal(f.repo.listVisits().length, 2)
  assert.deepEqual(f.repo.listVisits().map(x => x.id), [b.id, a.id])
})

test('user isolation protects reads, updates and cross-user linkage', () => {
  const f = fixture()
  const aDrink = f.repo.createDrink(drink(), mutation(1))
  const aVisit = f.repo.createVisit(visit(), mutation(2))
  f.user('user-B')
  assert.equal(f.repo.getDrink(aDrink.id), null)
  assert.equal(f.repo.getVisit(aVisit.id), null)
  assert.deepEqual(f.repo.listDrinks(), [])
  assert.deepEqual(f.repo.listVisits(), [])
  assert.throws(() => f.repo.linkDrink(aDrink.id, aVisit.id, 1), code('NOT_FOUND'))
  const bDrink = f.repo.createDrink(drink(), mutation(3))
  assert.throws(() => f.repo.linkDrink(bDrink.id, aVisit.id, 1), code('NOT_FOUND'))
  f.user('user-A')
  assert.throws(() => f.repo.linkDrink(aDrink.id, bDrink.id, 1), code('NOT_FOUND'))
  assert.equal(f.repo.listDrinks().length, 1)
  assert.equal(f.persisted.size, 2)
})

test('create retries are idempotent; reuse with different payload is a conflict', () => {
  const f = fixture()
  const x = f.repo.createDrink(drink(), mutation(1))
  assert.deepEqual(f.repo.createDrink(drink(), mutation(1)), x)
  assert.equal(f.repo.listDrinks().length, 1)
  assert.equal(f.writes.length, 1)
  assert.throws(() => f.repo.createDrink(drink(undefined, '其他'), mutation(1)), code('CONFLICT'))
  assert.throws(() => f.repo.createVisit(visit(), mutation(1)), code('CONFLICT'))
  const s = f.repo.createVisit(visit(), mutation(2))
  assert.equal(f.repo.createVisit(visit(), mutation(2)).id, s.id)
  assert.equal(f.repo.listVisits().length, 1)
})

test('deleted idempotency tokens cannot resurrect records after a retry', () => {
  const f = fixture()
  const x = f.repo.createDrink(drink(), mutation(1))
  f.repo.deleteDrink(x.id, x.revision)
  assert.throws(() => f.repo.createDrink(drink(), mutation(1)), code('REPLAY_DELETED'))
  assert.equal(f.repo.listDrinks().length, 0)
})

test('optimistic version protects against stale/forged updates and immutable identity changes', () => {
  const f = fixture()
  const a = f.repo.createDrink(drink(), mutation(1))
  const changed = f.repo.updateDrink(a.id, { note: '好喝', personalRating: 4.5 }, a.revision)
  assert.equal(changed.note, '好喝')
  assert.equal(changed.personalRating, 4.5)
  assert.equal(changed.revision, 2)
  assert.throws(() => f.repo.updateDrink(a.id, { note: '旧修改' }, 1), code('CONFLICT'))
  assert.throws(() => f.repo.updateDrink(a.id, { ownerUserId: 'user-B' }, 2), code('INVALID_INPUT'))
  assert.throws(() => f.repo.updateDrink(a.id, { visibility: 'public' }, 2), code('INVALID_INPUT'))
  assert.throws(() => f.repo.updateDrink(a.id, { visitSessionId: 'fake' }, 2), code('INVALID_INPUT'))
  assert.throws(() => f.repo.deleteDrink(a.id, 1), code('CONFLICT'))
  assert.equal(f.repo.getDrink(a.id)?.ownerUserId, 'user-A')
})

test('patches retain optional details and reads cannot mutate stored records', () => {
  const f = fixture()
  const x = f.repo.createDrink({
    ...drink(), photoRefs: ['private-photo-ref'],
    contextDetails: { home: { preparationNote: '搅拌', ingredientsNote: '金酒 50ml' } }
  }, mutation(1))
  x.photoRefs.push('forged')
  x.contextDetails.home.preparationNote = 'forged'
  assert.deepEqual(f.repo.getDrink(x.id)?.photoRefs, ['private-photo-ref'])
  const updated = f.repo.updateDrink(x.id, { photoRefs: [], note: '后补' }, 1)
  assert.deepEqual(updated.photoRefs, [])
  assert.equal(updated.contextDetails.home.preparationNote, '搅拌')
  assert.equal(updated.note, '后补')
})

test('deleting a visit unlinks existing drink records atomically, without deleting them', () => {
  const f = fixture()
  const v = f.repo.createVisit(visit(), mutation(1))
  const x = f.repo.createDrink({ ...drink(), visitSessionId: v.id }, mutation(2))
  const y = f.repo.createDrink({ ...drink(), visitSessionId: v.id }, mutation(3))
  f.repo.deleteVisit(v.id, v.revision)
  assert.equal(f.repo.getVisit(v.id), null)
  assert.equal(f.repo.listDrinks().length, 2)
  assert.equal(f.repo.getDrink(x.id)?.visitSessionId, null)
  assert.equal(f.repo.getDrink(y.id)?.visitSessionId, null)
  assert.equal(f.repo.getDrink(x.id)?.revision, x.revision + 1)
})

test('malformed or foreign-owner snapshots fail closed, never silently reset', () => {
  const f = fixture()
  f.persisted.set(journalStorageKey('user-A'), {
    schemaVersion: 1, ownerUserId: 'user-B', drinks: [], visits: [], mutations: {}
  })
  assert.throws(() => f.repo.listDrinks(), code('STORAGE_INVALID'))
  assert.throws(() => f.repo.createDrink(drink(), mutation(1)), code('STORAGE_INVALID'))
})

test('invalid timestamps, IDs and private scores cannot enter storage', () => {
  const f = fixture()
  assert.throws(() => f.repo.createDrink(drink('2026-10-17'), mutation(1)), code('INVALID_INPUT'))
  assert.throws(() => f.repo.createDrink({ ...drink(), personalRating: 6 }, mutation(2)), code('INVALID_INPUT'))
  assert.throws(() => f.repo.createDrink(drink(), '__proto__'), code('INVALID_INPUT'))
  assert.throws(() => f.repo.createVisit({ ...visit(), barId: -1 }, mutation(4)), code('INVALID_INPUT'))
  assert.equal(f.writes.length, 0)
})

test('storage failure surfaces to caller without acknowledging a phantom record', () => {
  const f = fixture()
  f.failWrites(true)
  assert.throws(() => f.repo.createDrink(drink(), mutation(1)), /Quota exceeded/)
  assert.equal(f.repo.listDrinks().length, 0)
  f.failWrites(false)
  assert.equal(f.repo.createDrink(drink(), mutation(1)).revision, 1)
})

test('journal writes use only the dedicated key, not posts, public reviews, bars or legacy data', () => {
  const f = fixture()
  const d = f.repo.createDrink(drink(), mutation(1))
  const v = f.repo.createVisit(visit(), mutation(2))
  f.repo.linkDrink(d.id, v.id, d.revision)
  const [key] = [...f.persisted.keys()]
  assert.deepEqual([...f.persisted.keys()], [journalStorageKey('user-A')])
  assert.ok(f.writes.every(k => k === key))
  assert.equal(f.persisted.get(key).drinks[0].visibility, 'private')
  assert.equal(f.persisted.get(key).visits[0].visibility, 'private')
})
