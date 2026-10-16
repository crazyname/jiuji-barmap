// SPDX-License-Identifier: MPL-2.0
const test = require('node:test')
const assert = require('node:assert/strict')
const { createSyncClient } = require('../packages/sync/client')

function device(server) {
  let content = null
  const storage = {
    read: () => content ? structuredClone(content) : null,
    write: value => { content = structuredClone(value) }
  }
  return createSyncClient({ storage, transport: server.transport, makeId: (() => {
    let count = 0
    return () => 'device-' + server.allocateId() + '-' + (++count)
  })() })
}
function server() {
  let revision = 0
  let nextId = 0
  const rows = { bars: [], recipes: [], posts: [], favorites: [] }
  const versions = { bars: {}, recipes: {}, posts: {}, favorites: {} }
  const seen = new Set()
  let available = true
  const transport = {
    async get(path) {
      if (!available) throw Error('offline')
      assert.equal(path, '/v1/sync')
      return { revision, collections: structuredClone(rows), versions: structuredClone(versions) }
    },
    async post(path, data, token) {
      if (!available) throw Error('offline')
      assert.equal(path, '/v1/sync/mutations')
      if (token !== 'test-user-1') throw Error('401 unauthorized')
      assert.ok(data.mutations.length <= 20)
      const applied = [], conflicts = []
      for (const m of data.mutations) {
        if (seen.has(m.mutationId)) { applied.push(m.mutationId); continue }
        const latest = versions[m.collection][m.id] || 0
        if (latest !== m.baseVersion) {
          conflicts.push({ mutationId: m.mutationId,
            current: rows[m.collection].find(row => String(row.id) === m.id) || null,
            currentVersion: latest })
          continue
        }
        const list = rows[m.collection].filter(item => String(item.id) !== m.id)
        if (m.action === 'upsert') list.push(m.record)
        rows[m.collection] = list
        versions[m.collection][m.id] = latest + 1
        seen.add(m.mutationId)
        revision += 1
        applied.push(m.mutationId)
      }
      return { applied, conflicts }
    }
  }
  return {
    transport,
    allocateId: () => ++nextId,
    setOnline: value => { available = value },
    getRevision: () => revision,
    getRows: kind => structuredClone(rows[kind])
  }
}

test('A uploads a recipe, B pulls it from the same server', async () => {
  const api = server()
  const a = device(api), b = device(api)
  a.queueUpsert('recipes', { id: 'recipe-1', title: '金汤力', ingredients: '金酒和汤力水', steps: '加冰搅匀' })
  assert.equal(a.status().queued, 1)
  assert.equal(b.list('recipes').length, 0)
  const uploaded = await a.sync('test-user-1')
  assert.equal(uploaded.sent, 1)
  assert.equal(a.status().queued, 0)
  await b.pull()
  assert.equal(b.list('recipes')[0].title, '金汤力')
  assert.equal(b.status().revision, 1)
})

test('offline and unauthenticated changes remain queued until authorized', async () => {
  const api = server()
  const a = device(api)
  a.queueUpsert('posts', { id: 'post-1', title: '测试探店', body: '咖啡香味', type: 'visit',
    isSponsored: false, visibility: 'public' })
  assert.equal((await a.push()).authRequired, true)
  assert.equal(a.status().queued, 1)
  api.setOnline(false)
  await assert.rejects(a.sync('test-user-1'), /offline/)
  assert.equal(a.status().queued, 1)
  api.setOnline(true)
  await a.sync('test-user-1')
  assert.equal(a.status().queued, 0)
  assert.equal(api.getRows('posts').length, 1)
})

test('conflicting edits never silently overwrite the authoritative version', async () => {
  const api = server()
  const a = device(api), b = device(api)
  a.queueUpsert('recipes', { id: 'recipe-1', title: '初稿' })
  await a.sync('test-user-1')
  await b.pull()
  a.queueUpsert('recipes', { id: 'recipe-1', title: 'A 的修改' })
  b.queueUpsert('recipes', { id: 'recipe-1', title: 'B 的修改' })
  await a.sync('test-user-1')
  const result=await b.sync('test-user-1')
  assert.equal(result.conflicts, 1)
  assert.equal(b.status().queued, 0)
  assert.equal(b.list('recipes')[0].title, 'A 的修改')
  assert.equal(api.getRows('recipes')[0].title, 'A 的修改')
})

test('pending local changes survive a pull and latest changes keep first baseVersion', async () => {
  const api = server()
  const a = device(api)
  a.queueUpsert('recipes', { id: 'draft', title: '离线初稿' })
  const original = a.status().queued
  a.queueUpsert('recipes', { id: 'draft', title: '离线修订' })
  assert.equal(a.status().queued, original)
  await a.pull()
  assert.equal(a.list('recipes')[0].title, '离线修订')
  const result=await a.sync('test-user-1')
  assert.equal(result.sent, 1)
  assert.equal(api.getRows('recipes')[0].title, '离线修订')
})

test('delete synchronizes to other clients and snapshot rejects missing collections', async () => {
  const api=server(), a=device(api), b=device(api)
  a.queueUpsert('recipes', { id:'r-2', title:'新酒谱' })
  await a.sync('test-user-1')
  a.queueDelete('recipes', 'r-2')
  await a.sync('test-user-1')
  await b.pull()
  assert.equal(b.list('recipes').length, 0)
  const bad=device({transport:{get:async()=>({revision:0,collections:{bars:[]}}),post:async()=>({})},allocateId:()=>1})
  await assert.rejects(bad.pull(), /Missing sync collection/)
})
