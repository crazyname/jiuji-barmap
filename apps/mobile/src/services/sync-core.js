// SPDX-License-Identifier: MPL-2.0
// Pure JavaScript sync engine; works with WeChat Taro and React Native adapters.
'use strict'

const COLLECTIONS = Object.freeze(['bars', 'recipes', 'posts', 'favorites'])
function emptyState() {
  return { revision: 0, collections: { bars: [], recipes: [], posts: [], favorites: [] },
    versions: {}, pending: [], conflicts: [] }
}
function ensureCollection(name) {
  if (!COLLECTIONS.includes(name)) throw Error('Unsupported collection: ' + name)
}
function identity(record) {
  if (!record || (typeof record.id !== 'number' && typeof record.id !== 'string') ||
    String(record.id).trim() === '') throw Error('Each synced record needs an id')
  return String(record.id)
}
function validateSnapshot(raw) {
  if (!raw || !Number.isSafeInteger(raw.revision) || raw.revision < 0 ||
    !raw.collections || typeof raw.collections !== 'object') throw Error('Invalid sync snapshot')
  for (const name of COLLECTIONS) {
    if (!Array.isArray(raw.collections[name])) throw Error('Missing sync collection: ' + name)
    for (const item of raw.collections[name]) identity(item)
  }
  return raw
}
function createSyncClient({ storage, transport, makeId } = {}) {
  if (!storage || typeof storage.read !== 'function' || typeof storage.write !== 'function') throw Error('Storage adapter required')
  if (!transport || typeof transport.get !== 'function' || typeof transport.post !== 'function') throw Error('Transport adapter required')
  const idFactory = makeId || (() => Date.now().toString(36) + '-' + Math.random().toString(36).slice(2))
  function load() {
    const raw = storage.read()
    if (!raw || typeof raw !== 'object') return emptyState()
    const fallback = emptyState()
    return { ...fallback, ...raw, collections: { ...fallback.collections, ...raw.collections },
      versions: raw.versions || {}, pending: Array.isArray(raw.pending) ? raw.pending : [],
      conflicts: Array.isArray(raw.conflicts) ? raw.conflicts : [] }
  }
  function save(data) { storage.write(data) }
  function list(name) {
    ensureCollection(name)
    const state = load(), byId = new Map(state.collections[name].map(r => [String(r.id), r]))
    for (const mutation of state.pending) {
      if (mutation.collection !== name) continue
      if (mutation.action === 'delete') byId.delete(mutation.id)
      else byId.set(mutation.id, mutation.record)
    }
    return [...byId.values()]
  }
  function queueUpsert(name, record) {
    ensureCollection(name)
    const id = identity(record)
    const state = load()
    // Keep only the latest unsent edit to an item. Preserve its original baseVersion.
    const old = state.pending.find(m => m.collection === name && m.id === id)
    const baseVersion = old ? old.baseVersion : (state.versions[name] && state.versions[name][id]) || 0
    const mutation = { mutationId: idFactory(), collection: name, action: 'upsert',
      id, baseVersion, record }
    state.pending = state.pending.filter(m => !(m.collection === name && m.id === id))
    state.pending.push(mutation)
    save(state)
    return mutation
  }
  function queueDelete(name, idInput) {
    ensureCollection(name)
    const id = String(idInput)
    const state = load()
    const old = state.pending.find(m => m.collection === name && m.id === id)
    const baseVersion = old ? old.baseVersion : (state.versions[name] && state.versions[name][id]) || 0
    state.pending = state.pending.filter(m => !(m.collection === name && m.id === id))
    state.pending.push({ mutationId: idFactory(), collection: name, action: 'delete',
      id, baseVersion })
    save(state)
  }
  async function push(token) {
    const state = load()
    if (!state.pending.length) return { sent: 0, authRequired: false, conflicts: state.conflicts.length }
    if (!token) return { sent: 0, authRequired: true, conflicts: state.conflicts.length }
    const batch = state.pending.slice(0, 20)
    const result = await transport.post('/v1/sync/mutations', { mutations: batch }, token)
    if (!result || !Array.isArray(result.applied) || !Array.isArray(result.conflicts)) throw Error('Invalid sync mutation receipt')
    const applied = new Set(result.applied.map(String))
    const conflicts = new Map(result.conflicts.map(c => [String(c.mutationId), c]))
    const fresh = load()
    fresh.pending = fresh.pending.filter(m => !applied.has(m.mutationId))
    fresh.conflicts = fresh.conflicts.filter(c => !applied.has(String(c.mutationId)))
    for (const mutation of batch) {
      const conflict = conflicts.get(mutation.mutationId)
      if (conflict) {
        fresh.pending = fresh.pending.filter(m => m.mutationId !== mutation.mutationId)
        fresh.conflicts.push({ ...mutation, current: conflict.current || null,
          currentVersion: conflict.currentVersion ?? null })
      }
    }
    save(fresh)
    return { sent: applied.size, authRequired: false, conflicts: fresh.conflicts.length }
  }
  async function pull(token) {
    const incoming = validateSnapshot(await transport.get('/v1/sync', token))
    const state = load()
    // Snapshot replaces server-owned data only; pending device edits remain overlaid.
    if (incoming.revision < state.revision) throw Error('Server revision moved backwards')
    state.revision = incoming.revision
    state.collections = incoming.collections
    state.versions = incoming.versions || {}
    save(state)
    return { revision: state.revision, counts: Object.fromEntries(COLLECTIONS.map(k => [k, list(k).length])) }
  }
  async function sync(token) {
    // Never silently delete pending edits when offline, unauthenticated or in conflict.
    const upload = await push(token)
    const download = await pull(token)
    return { ...upload, ...download, queued: load().pending.length }
  }
  function status() {
    const s = load()
    return { revision: s.revision, queued: s.pending.length, conflicts: s.conflicts.length }
  }
  return { list, queueUpsert, queueDelete, push, pull, sync, status }
}
module.exports = { COLLECTIONS, createSyncClient, validateSnapshot }
