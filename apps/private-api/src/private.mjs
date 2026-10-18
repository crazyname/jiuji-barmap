// SPDX-License-Identifier: MPL-2.0
// Strict per-owner CRUD. Database constraints, conditional writes, D1 atomic batches.
import { body, changes, fail, fields, iso, newId, nullable, optionalId,
  positiveId, requiredOwner, respond, revision, sha256, string } from './common.mjs'

const drinkColumns = {
  drinkLabel: 'drink_label', cocktailId: 'cocktail_id', recipeVariantId: 'recipe_variant_id',
  consumedAt: 'consumed_at', contextKind: 'context_kind', photoRefs: 'photo_refs_json',
  note: 'note', personalRating: 'personal_rating', contextDetails: 'context_details_json'
}
const visitColumns = { barId: 'bar_id', placeLabel: 'place_label',
  occurredAt: 'occurred_at', note: 'note' }
const drinkFields = Object.keys(drinkColumns)
const visitFields = Object.keys(visitColumns)
function ids(value) {
  const id = string(value, 'clientMutationId', 128)
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(id)) fail(400, 'INVALID_INPUT', 'clientMutationId 无效')
  return id
}
function details(value) {
  if (value == null) return {}
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail(400, 'INVALID_INPUT', 'contextDetails 无效')
  fields(value, ['bar','home','other'])
  const out = {}
  for (const [key, allow] of Object.entries({
    bar: ['barId','menuItem','priceAmount'], home: ['preparationNote','ingredientsNote'],
    other: ['placeNote']
  })) {
    if (value[key] === undefined) continue
    const item = value[key]
    if (!item || typeof item !== 'object' || Array.isArray(item))
      fail(400, 'INVALID_INPUT', 'contextDetails 无效')
    fields(item, allow)
    out[key] = {}
    for (const [field, data] of Object.entries(item)) {
      out[key][field] = field === 'barId' ? positiveId(data, field) :
        field === 'priceAmount' ? price(data) : string(data, field, 500)
    }
  }
  return out
}
function price(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 ||
      value > 1_000_000) fail(400,'INVALID_INPUT','价格无效')
  return value
}
function rating(value) {
  if (value == null) return null
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 5)
    fail(400,'INVALID_INPUT','个人评分无效')
  return value
}
function photoRefs(value) {
  if (value == null) return []
  if (!Array.isArray(value) || value.length > 20) fail(400,'INVALID_INPUT','照片引用无效')
  return value.map(ref => string(ref,'照片引用',512))
}
function context(value) {
  if (!['bar','home','other'].includes(value))
    fail(400,'INVALID_INPUT','饮用场景无效')
  return value
}
function drinkPatch(input, creating) {
  fields(input, creating ? [...drinkFields,'visitSessionId','clientMutationId'] : drinkFields)
  if (creating && (!Object.hasOwn(input,'drinkLabel') ||
    !Object.hasOwn(input,'consumedAt') || !Object.hasOwn(input,'contextKind')))
    fail(400,'INVALID_INPUT','缺少饮用必要字段')
  const out = {}
  for (const [name,value] of Object.entries(input)) {
    if (name === 'clientMutationId') continue
    if (name === 'visitSessionId') { out.visitSessionId = optionalId(value,name); continue }
    out[name] = name === 'drinkLabel' ? string(value, name, 120) :
      name === 'consumedAt' ? iso(value,name) :
      name === 'contextKind' ? context(value) :
      name === 'photoRefs' ? photoRefs(value) :
      name === 'personalRating' ? rating(value) :
      name === 'contextDetails' ? details(value) : nullable(value,name,1000)
  }
  return out
}
function visitPatch(input, creating) {
  fields(input, creating ? [...visitFields,'clientMutationId'] : visitFields)
  if (creating && !Object.hasOwn(input,'occurredAt'))
    fail(400,'INVALID_INPUT','缺少到访日期')
  const out = {}
  for (const [name,value] of Object.entries(input)) {
    if (name === 'clientMutationId') continue
    out[name] = name === 'occurredAt' ? iso(value,name) :
      name === 'barId' ? positiveId(value,name) :
      nullable(value,name, name === 'placeLabel' ? 120 : 1000)
  }
  return out
}
const sqlValue = (key, value) => key === 'photoRefs' || key === 'contextDetails' ?
  JSON.stringify(value) : value
const fromDrink = r => r && ({
  id:r.id, ownerUserId:r.owner_user_id, drinkLabel:r.drink_label,
  cocktailId:r.cocktail_id, recipeVariantId:r.recipe_variant_id,
  visitSessionId:r.visit_session_id, consumedAt:r.consumed_at, contextKind:r.context_kind,
  photoRefs:JSON.parse(r.photo_refs_json), note:r.note, personalRating:r.personal_rating,
  contextDetails:JSON.parse(r.context_details_json), visibility:'private',
  createdAt:r.created_at, updatedAt:r.updated_at, revision:r.revision,
  clientMutationId:r.client_mutation_id
})
const fromVisit = r => r && ({
  id:r.id, ownerUserId:r.owner_user_id, barId:r.bar_id, placeLabel:r.place_label,
  occurredAt:r.occurred_at, note:r.note, visibility:'private', createdAt:r.created_at,
  updatedAt:r.updated_at, revision:r.revision, clientMutationId:r.client_mutation_id
})
async function visitBelongs(db, id, owner) {
  if (id) await requiredOwner(db, id, owner, 'visit_sessions')
}
async function row(db, table, id, owner) {
  return db.prepare('SELECT * FROM ' + table + ' WHERE id=? AND owner_user_id=?')
    .bind(id,owner).first()
}
async function idem(db, owner, mutation, kind, fingerprint, table, format) {
  const previous = await db.prepare('SELECT entity_id,entity_kind,request_hash FROM mutation_idempotency ' +
    'WHERE owner_user_id=? AND mutation_id=?').bind(owner,mutation).first()
  if (!previous) return null
  if (previous.entity_kind !== kind || previous.request_hash !== fingerprint)
    fail(409,'CONFLICT','clientMutationId 已用于不同内容')
  const existing = await row(db,table,previous.entity_id,owner)
  if (!existing) fail(409,'REPLAY_DELETED','原记录已删除，不能重新创建')
  return format(existing)
}
async function createDrink(request, owner, { db, now }) {
  const input=await body(request)
  const mutation=ids(input.clientMutationId)
  const values=drinkPatch(input,true)
  const normalized={ drinkLabel:values.drinkLabel, cocktailId:values.cocktailId??null,
    recipeVariantId:values.recipeVariantId??null, visitSessionId:values.visitSessionId??null,
    consumedAt:values.consumedAt, contextKind:values.contextKind, photoRefs:values.photoRefs??[],
    note:values.note??null, personalRating:values.personalRating??null,
    contextDetails:values.contextDetails??{} }
  const hash=await sha256('drink:'+JSON.stringify(normalized))
  const previous=await idem(db,owner,mutation,'drink',hash,'drink_entries',fromDrink)
  if (previous) return respond({ entry:previous },200)
  await visitBelongs(db,normalized.visitSessionId,owner)
  const id=newId(), instant=new Date(now()).toISOString()
  try {
    await db.batch([
      db.prepare('INSERT INTO drink_entries (' +
        'id,owner_user_id,drink_label,cocktail_id,recipe_variant_id,visit_session_id,consumed_at,'+
        'context_kind,photo_refs_json,note,personal_rating,context_details_json,visibility,'+
        'created_at,updated_at,revision,client_mutation_id) ' +
        'VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(
          id,owner,normalized.drinkLabel,normalized.cocktailId,normalized.recipeVariantId,
          normalized.visitSessionId,normalized.consumedAt,normalized.contextKind,
          JSON.stringify(normalized.photoRefs),normalized.note,normalized.personalRating,
          JSON.stringify(normalized.contextDetails),'private',instant,instant,1,mutation),
      db.prepare('INSERT INTO mutation_idempotency ' +
        '(owner_user_id,mutation_id,entity_kind,entity_id,request_hash,created_at) VALUES(?,?,?,?,?,?)')
        .bind(owner,mutation,'drink',id,hash,instant)
    ])
  } catch {
    const retry=await idem(db,owner,mutation,'drink',hash,'drink_entries',fromDrink)
    if (retry) return respond({entry:retry})
    fail(409,'CONFLICT','饮用记录创建失败，请重新检查关联或重试')
  }
  return respond({entry:fromDrink(await row(db,'drink_entries',id,owner))},201)
}
async function createVisit(request, owner, { db, now }) {
  const input=await body(request)
  const mutation=ids(input.clientMutationId)
  const values=visitPatch(input,true)
  const normalized={barId:values.barId??null,placeLabel:values.placeLabel??null,
    occurredAt:values.occurredAt,note:values.note??null}
  const hash=await sha256('visit:'+JSON.stringify(normalized))
  const previous=await idem(db,owner,mutation,'visit',hash,'visit_sessions',fromVisit)
  if (previous) return respond({visit:previous})
  const id=newId(), instant=new Date(now()).toISOString()
  try {
    await db.batch([
      db.prepare('INSERT INTO visit_sessions ' +
        '(id,owner_user_id,bar_id,place_label,occurred_at,note,visibility,' +
        'created_at,updated_at,revision,client_mutation_id) ' +
        "VALUES(?,?,?,?,?,?,'private',?,?,1,?)").bind(
          id,owner,normalized.barId,normalized.placeLabel,normalized.occurredAt,
          normalized.note,instant,instant,mutation),
      db.prepare('INSERT INTO mutation_idempotency ' +
        '(owner_user_id,mutation_id,entity_kind,entity_id,request_hash,created_at) VALUES(?,?,?,?,?,?)')
        .bind(owner,mutation,'visit',id,hash,instant)
    ])
  } catch {
    const retry=await idem(db,owner,mutation,'visit',hash,'visit_sessions',fromVisit)
    if (retry) return respond({visit:retry})
    fail(409,'CONFLICT','探店经历创建失败，请重试')
  }
  return respond({visit:fromVisit(await row(db,'visit_sessions',id,owner))},201)
}
async function edit(request, owner, id, kind, ctx) {
  const isDrink=kind==='drink', table=isDrink?'drink_entries':'visit_sessions'
  const current=await requiredOwner(ctx.db,id,owner,table)
  const input=await body(request)
  fields(input,['expectedRevision','changes'])
  const expect=revision(input.expectedRevision)
  if (!input.changes || typeof input.changes !== 'object' ||
      Array.isArray(input.changes)) fail(400,'INVALID_INPUT','changes 必须是对象')
  const values=isDrink?drinkPatch(input.changes,false):visitPatch(input.changes,false)
  const entries=Object.entries(values)
  if (!entries.length) fail(400,'INVALID_INPUT','缺少变更字段')
  if (current.revision!==expect) fail(409,'CONFLICT','记录版本发生变化')
  const columns=isDrink?drinkColumns:visitColumns
  const expr=entries.map(([key])=>columns[key]+'=?').join(',')
  const params=entries.map(([key,val])=>sqlValue(key,val))
  const result=await ctx.db.prepare('UPDATE '+table+' SET '+expr+
    ',revision=revision+1,updated_at=? WHERE id=? AND owner_user_id=? AND revision=?')
    .bind(...params,new Date(ctx.now()).toISOString(),id,owner,expect).run()
  if (changes(result)!==1) fail(409,'CONFLICT','记录版本发生变化')
  return respond({[isDrink?'entry':'visit']:(isDrink?fromDrink:fromVisit)(
    await row(ctx.db,table,id,owner))})
}
async function link(request, owner, id, {db,now}) {
  const old=await requiredOwner(db,id,owner,'drink_entries')
  const input=await body(request)
  fields(input,['expectedRevision','visitSessionId'])
  const expect=revision(input.expectedRevision)
  if (!Object.hasOwn(input,'visitSessionId')) fail(400,'INVALID_INPUT','缺少 visitSessionId')
  const visitId=optionalId(input.visitSessionId,'visitSessionId')
  await visitBelongs(db,visitId,owner)
  if (old.revision!==expect) fail(409,'CONFLICT','记录版本发生变化')
  let result
  try {
    result=await db.prepare('UPDATE drink_entries SET visit_session_id=?, '+
      'revision=revision+1,updated_at=? WHERE id=? AND owner_user_id=? AND revision=?')
      .bind(visitId,new Date(now()).toISOString(),id,owner,expect).run()
  } catch { fail(404,'NOT_FOUND','探店经历不存在') }
  if (changes(result)!==1) fail(409,'CONFLICT','记录版本发生变化')
  return respond({entry:fromDrink(await row(db,'drink_entries',id,owner))})
}
async function remove(request, owner, id, kind, {db,now}) {
  const table=kind==='drink'?'drink_entries':'visit_sessions'
  const old=await requiredOwner(db,id,owner,table)
  const input=await body(request)
  fields(input,['expectedRevision'])
  const expect=revision(input.expectedRevision)
  if (expect!==old.revision) fail(409,'CONFLICT','记录版本发生变化')
  if (kind==='drink') {
    const result=await db.prepare('DELETE FROM drink_entries WHERE id=? AND owner_user_id=? AND revision=?')
      .bind(id,owner,expect).run()
    if (changes(result)!==1) fail(409,'CONFLICT','记录版本发生变化')
  } else {
    // Both operations execute in one D1 transaction. If revision is stale the
    // guarded detach cannot mutate drinks; a FK prevents dangling visit IDs.
    const instant=new Date(now()).toISOString()
    const results=await db.batch([
      db.prepare('UPDATE drink_entries SET visit_session_id=NULL,revision=revision+1,'+
        'updated_at=? WHERE owner_user_id=? AND visit_session_id=? AND EXISTS(' +
        'SELECT 1 FROM visit_sessions WHERE id=? AND owner_user_id=? AND revision=?)')
        .bind(instant,owner,id,id,owner,expect),
      db.prepare('DELETE FROM visit_sessions WHERE id=? AND owner_user_id=? AND revision=?')
        .bind(id,owner,expect)
    ])
    if (changes(results[1])!==1) fail(409,'CONFLICT','记录版本发生变化')
  }
  return respond({ok:true})
}
function paging(url) {
  const allowed=['limit','before','context','visitSessionId']
  for (const key of url.searchParams.keys())
    if (!allowed.includes(key)) fail(400,'INVALID_INPUT','查询参数无效')
  const text=url.searchParams.get('limit')??'50'
  if (!/^\d{1,3}$/.test(text)||+text<1||+text>100)
    fail(400,'INVALID_INPUT','limit 必须在 1 至 100 之间')
  return {limit:+text,before:url.searchParams.get('before'),
    context:url.searchParams.get('context'),visit:url.searchParams.get('visitSessionId')}
}
async function listing(request, owner, kind, {db}) {
  const isDrink=kind==='drink', table=isDrink?'drink_entries':'visit_sessions'
  const query=paging(new URL(request.url))
  if (!isDrink && (query.context || query.visit))
    fail(400,'INVALID_INPUT','此查询不支持该筛选')
  if (query.context && !['bar','home','other'].includes(query.context))
    fail(400,'INVALID_INPUT','饮用场景无效')
  const params=[owner]
  let sql='SELECT * FROM '+table+' WHERE owner_user_id=?'
  const time=isDrink?'consumed_at':'occurred_at'
  if (query.before) {sql+=' AND '+time+' < ?';params.push(iso(query.before,'before'))}
  if (isDrink && query.context) {sql+=' AND context_kind=?';params.push(query.context)}
  if (isDrink && query.visit) {sql+=' AND visit_session_id=?';params.push(string(query.visit,'visitSessionId'))}
  sql+=' ORDER BY '+time+' DESC, id ASC LIMIT ?';params.push(query.limit)
  const rows=(await db.prepare(sql).bind(...params).all()).results
  return respond({[isDrink?'entries':'visits']:rows.map(isDrink?fromDrink:fromVisit)})
}
export async function handlePrivate(request, path, owner, ctx) {
  const parts=path.split('/').filter(Boolean)
  const kind=parts[2]==='drinks'?'drink':parts[2]==='visits'?'visit':null
  if (!kind || parts.length<3 || parts.length>5)
    fail(404,'NOT_FOUND','接口不存在')
  const table=kind==='drink'?'drink_entries':'visit_sessions'
  if (parts.length===3) {
    if (request.method==='GET') return listing(request,owner,kind,ctx)
    if (request.method==='POST') return kind==='drink'?
      createDrink(request,owner,ctx):createVisit(request,owner,ctx)
  }
  if (parts.length===4) {
    const id=string(decodeURIComponent(parts[3]),'recordId',128)
    if (request.method==='GET') {
      const found=await row(ctx.db,table,id,owner)
      if (!found) fail(404,'NOT_FOUND','私人记录不存在')
      return respond({[kind==='drink'?'entry':'visit']:(kind==='drink'?fromDrink:fromVisit)(found)})
    }
    if (request.method==='PATCH') return edit(request,owner,id,kind,ctx)
    if (request.method==='DELETE') return remove(request,owner,id,kind,ctx)
  }
  if (parts.length===5 && kind==='drink' && parts[4]==='visit' &&
      request.method==='PUT') return link(request,owner,string(parts[3],'recordId',128),ctx)
  if (parts.length===5 && kind==='visit' && parts[4]==='drinks' &&
      request.method==='GET') {
    const id=string(parts[3],'recordId',128)
    await requiredOwner(ctx.db,id,owner,'visit_sessions')
    const rows=(await ctx.db.prepare('SELECT * FROM drink_entries WHERE owner_user_id=? '+
      'AND visit_session_id=? ORDER BY consumed_at DESC,id ASC').bind(owner,id).all()).results
    return respond({entries:rows.map(fromDrink)})
  }
  fail(404,'NOT_FOUND','接口不存在')
}
