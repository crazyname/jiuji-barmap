// SPDX-License-Identifier: MPL-2.0
// Shared strict request, error and cryptographic boundaries. No secret logging.
export class ApiError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}
export const fail = (status, code, message) => { throw new ApiError(status, code, message) }
export function respond(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff' } })
}
export async function body(request) {
  if (!/^application\/json(?:\s*;.*)?$/i.test(request.headers.get('content-type') || ''))
    fail(415, 'UNSUPPORTED_MEDIA_TYPE', '需要 JSON 请求')
  const length = Number(request.headers.get('content-length') || '0')
  if (length > 32_000) fail(413, 'PAYLOAD_TOO_LARGE', '请求内容过长')
  const raw = await request.text()
  if (raw.length > 32_000) fail(413, 'PAYLOAD_TOO_LARGE', '请求内容过长')
  let parsed
  try { parsed = JSON.parse(raw) } catch { fail(400, 'INVALID_INPUT', 'JSON 格式无效') }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    fail(400, 'INVALID_INPUT', '请求必须是对象')
  return parsed
}
export function fields(source, keys) {
  for (const key of Object.keys(source))
    if (!keys.includes(key) || key === '__proto__' || key === 'constructor')
      fail(400, 'INVALID_INPUT', '包含不支持的字段')
}
export function string(value, name, limit = 160) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > limit)
    fail(400, 'INVALID_INPUT', name + ' 无效')
  return value.trim()
}
export function nullable(value, name, limit = 1000) {
  return value == null ? null : string(value, name, limit)
}
export function optionalId(value, name) {
  return value == null ? null : string(value, name, 128)
}
export function positiveId(value, name) {
  if (value === null || value === undefined) return null
  if (!Number.isSafeInteger(value) || value < 1) fail(400, 'INVALID_INPUT', name + ' 无效')
  return value
}
export function iso(value, name) {
  if (typeof value !== 'string' ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(value) ||
      !Number.isFinite(Date.parse(value))) fail(400, 'INVALID_INPUT', name + ' 时间格式无效')
  const match = /^(\d{4})-(\d\d)-(\d\d)/.exec(value)
  const [, yy, mm, dd] = match
  const check = new Date(Date.UTC(+yy, +mm - 1, +dd))
  if (check.getUTCFullYear() !== +yy || check.getUTCMonth() !== +mm - 1 ||
      check.getUTCDate() !== +dd) fail(400, 'INVALID_INPUT', name + ' 日期无效')
  return new Date(value).toISOString()
}
export function revision(value) {
  if (!Number.isSafeInteger(value) || value < 1) fail(400, 'INVALID_INPUT', 'expectedRevision 无效')
  return value
}
export function sha256(text) {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    .then(buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join(''))
}
export async function hmac(secret, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const value = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text))
  return [...new Uint8Array(value)].map(b => b.toString(16).padStart(2, '0')).join('')
}
export function token() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return [...bytes].map(x => x.toString(16).padStart(2, '0')).join('')
}
export const newId = () => crypto.randomUUID()
export function requireDb(env) {
  if (!env || !env.DB || typeof env.DB.prepare !== 'function' || typeof env.DB.batch !== 'function')
    fail(503, 'BACKEND_UNAVAILABLE', '数据库尚未配置')
  return env.DB
}
export const changes = result => Number(result?.meta?.changes || 0)
export async function requiredOwner(db, id, owner, table) {
  const row = await db.prepare('SELECT revision FROM ' + table +
    ' WHERE id = ? AND owner_user_id = ?').bind(id, owner).first()
  if (!row) fail(404, 'NOT_FOUND', '私人记录不存在')
  return row
}
