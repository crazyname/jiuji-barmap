// SPDX-License-Identifier: MPL-2.0
// Actual server verification; all test doubles are injected in Node tests only.
import { body, changes, fail, fields, hmac, iso, newId, respond, sha256,
  string, token } from './common.mjs'
const ACCESS_MS = 15 * 60_000
const SESSION_MS = 30 * 24 * 60 * 60_000
const at = value => new Date(value).toISOString()
export function requireAuthSecrets(env) {
  if (typeof env.WECHAT_APP_ID !== 'string' || !/^[a-zA-Z0-9_-]{6,64}$/.test(env.WECHAT_APP_ID) ||
      typeof env.WECHAT_APP_SECRET !== 'string' || env.WECHAT_APP_SECRET.length < 16 ||
      typeof env.SUBJECT_PEPPER !== 'string' || env.SUBJECT_PEPPER.length < 32)
    fail(503, 'AUTH_BACKEND_UNAVAILABLE', '微信认证服务未配置')
}
async function rate(db, bucket, subject, max) {
  const id = await sha256(subject)
  const result = await db.prepare(
    'INSERT INTO auth_rate_limits(bucket,subject_hash,hits) VALUES(?,?,1) ' +
    'ON CONFLICT(bucket,subject_hash) DO UPDATE SET hits=hits+1 WHERE hits < ?'
  ).bind(bucket, id, max).run()
  if (changes(result) === 0) fail(429, 'AUTH_RATE_LIMITED', '请求过于频繁')
}
// The Cloudflare edge supplies this header. Never use X-Forwarded-For,
// user-controlled query strings or refresh tokens as the rate subject.
function sourceAddress(request) {
  return request.headers.get('cf-connecting-ip') || 'unknown'
}
function bearer(request) {
  const auth = request.headers.get('authorization') || ''
  const match = /^Bearer ([0-9a-f]{64})$/.exec(auth)
  if (!match) fail(401, 'AUTH_UNAUTHORIZED', '需要有效的登录会话')
  return match[1]
}
async function sessionForAccess(request, { db, now }) {
  const hash = await sha256(bearer(request))
  const session = await db.prepare('SELECT id,user_id,access_expires_at,expires_at,revoked_at ' +
    'FROM auth_sessions WHERE access_hash=?').bind(hash).first()
  if (!session || session.revoked_at || Date.parse(session.access_expires_at) <= now() ||
      Date.parse(session.expires_at) <= now())
    fail(401, 'AUTH_UNAUTHORIZED', '会话已失效')
  return session
}
export async function requireAccount(request, context) {
  const session = await sessionForAccess(request, context)
  return session.user_id
}
async function responseMe(request, context) {
  const { db } = context
  const session = await sessionForAccess(request, context)
  const account = await db.prepare('SELECT id,display_name FROM users WHERE id=?')
    .bind(session.user_id).first()
  if (!account) fail(401, 'AUTH_UNAUTHORIZED', '账户不存在')
  const bindings = (await db.prepare('SELECT provider FROM account_bindings WHERE user_id=?')
    .bind(account.id).all()).results
  const providers = [...new Set(bindings.map(item => item.provider))]
  return respond({ account: {
    id: account.id, displayName: account.display_name,
    bindings: { wechat: providers.includes('wechat'), phone: providers.includes('phone'),
      providers } },
    session: { id: session.id, expiresAt: session.expires_at, revoked: false } })
}
async function newSession(db, accountId, now) {
  const accessToken = token(), refreshToken = token(), sessionId = newId()
  const accessExpiresAt = at(now + ACCESS_MS), sessionExpiresAt = at(now + SESSION_MS)
  await db.prepare('INSERT INTO auth_sessions ' +
    '(id,user_id,access_hash,access_expires_at,refresh_hash,refresh_expires_at,' +
    'expires_at,revoked_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(
      sessionId, accountId, await sha256(accessToken), accessExpiresAt,
      await sha256(refreshToken), sessionExpiresAt, sessionExpiresAt,
      null, at(now), at(now)).run()
  return { accessToken, refreshToken, accessExpiresAt, sessionId }
}
async function exchange(request, { db, env, now, wechatFetch }) {
  requireAuthSecrets(env)
  const input = await body(request)
  fields(input, ['code'])
  const code = string(input.code, 'code', 2048)
  const ip = sourceAddress(request)
  await rate(db, 'exchange:' + Math.floor(now() / 60_000), ip, 10)
  const codeHash = await hmac(env.SUBJECT_PEPPER, 'code:' + code)
  try {
    await db.prepare('INSERT INTO wechat_code_replays(code_hash,used_at) VALUES(?,?)')
      .bind(codeHash, at(now())).run()
  } catch {
    fail(401, 'AUTH_CODE_INVALID', '微信临时凭证无效或已使用')
  }
  let response, content
  try {
    const url = new URL('https://api.weixin.qq.com/sns/jscode2session')
    url.searchParams.set('appid', env.WECHAT_APP_ID)
    url.searchParams.set('secret', env.WECHAT_APP_SECRET)
    url.searchParams.set('js_code', code)
    url.searchParams.set('grant_type', 'authorization_code')
    // This URL must never be logged: it contains the AppSecret and one-time code.
    response = await wechatFetch(url.toString(), { method: 'GET', redirect: 'error' })
    if (!response.ok) fail(503, 'AUTH_BACKEND_UNAVAILABLE', '微信认证不可用')
    content = await response.json()
  } catch (err) {
    if (err?.code === 'AUTH_BACKEND_UNAVAILABLE') throw err
    fail(503, 'AUTH_BACKEND_UNAVAILABLE', '微信认证不可用')
  }
  if (!content || typeof content !== 'object' || content.errcode ||
      typeof content.openid !== 'string' || !content.openid.trim() ||
      typeof content.session_key !== 'string' || !content.session_key)
    fail(401, 'AUTH_CODE_INVALID', '微信临时凭证无效')
  // session_key never persists in the database or leaves the server.
  const subject = await hmac(env.SUBJECT_PEPPER, 'wechat:' + env.WECHAT_APP_ID + ':' + content.openid)
  let mapping = await db.prepare(
    "SELECT user_id FROM account_bindings WHERE provider='wechat' AND external_subject_hash=?"
  ).bind(subject).first()
  if (!mapping) {
    const accountId = newId(), bindingId = newId(), instant = at(now())
    try {
      // A concurrent first login can only create one binding; batch rolls both inserts back.
      await db.batch([
        db.prepare('INSERT INTO users(id,display_name,created_at) VALUES(?,?,?)')
          .bind(accountId, null, instant),
        db.prepare('INSERT INTO account_bindings(id,user_id,provider,external_subject_hash,created_at) ' +
          'VALUES(?,?,?,?,?)').bind(bindingId, accountId, 'wechat', subject, instant)
      ])
      mapping = { user_id: accountId }
    } catch {
      mapping = await db.prepare("SELECT user_id FROM account_bindings " +
        "WHERE provider='wechat' AND external_subject_hash=?").bind(subject).first()
      if (!mapping) fail(503, 'AUTH_BACKEND_UNAVAILABLE', '账户建立失败')
    }
  }
  return respond(await newSession(db, mapping.user_id, now()), 200)
}
async function refresh(request, { db, env, now }) {
  requireAuthSecrets(env)
  // Limit the edge-verified SOURCE before interpreting any attacker-provided
  // token, so a million different invalid strings cannot create a million D1 rows.
  await rate(db, 'refresh:' + Math.floor(now() / 60_000), sourceAddress(request), 15)
  const input = await body(request)
  fields(input, ['refreshToken'])
  const old = string(input.refreshToken, 'refreshToken', 256)
  if (!/^[0-9a-f]{64}$/.test(old)) fail(401, 'AUTH_UNAUTHORIZED', '刷新凭证无效')
  const hash = await sha256(old)
  const current = await db.prepare('SELECT id,user_id,refresh_expires_at,expires_at,revoked_at ' +
    'FROM auth_sessions WHERE refresh_hash=?').bind(hash).first()
  if (!current) {
    const used = await db.prepare('SELECT session_id FROM used_refresh_tokens WHERE token_hash=?')
      .bind(hash).first()
    if (used) {
      await db.prepare('UPDATE auth_sessions SET revoked_at=?, updated_at=? ' +
        'WHERE id=? AND revoked_at IS NULL').bind(at(now()), at(now()), used.session_id).run()
    }
    fail(401, 'AUTH_REVOKED', '刷新凭证已撤销或已使用')
  }
  if (current.revoked_at) fail(401, 'AUTH_REVOKED', '会话已撤销')
  if (Date.parse(current.refresh_expires_at) <= now() ||
      Date.parse(current.expires_at) <= now())
    fail(401, 'AUTH_EXPIRED', '会话已过期')
  const accessToken = token(), refreshToken = token()
  const accessExpiresAt = at(Math.min(now() + ACCESS_MS, Date.parse(current.expires_at)))
  const nextHash = await sha256(refreshToken)
  const results = await db.batch([
    db.prepare('UPDATE auth_sessions SET access_hash=?,access_expires_at=?,refresh_hash=?,' +
      'updated_at=? WHERE id=? AND refresh_hash=? AND revoked_at IS NULL AND ' +
      'refresh_expires_at > ? AND expires_at > ?').bind(
        await sha256(accessToken), accessExpiresAt, nextHash, at(now()),
        current.id, hash, at(now()), at(now())),
    db.prepare('INSERT OR IGNORE INTO used_refresh_tokens(token_hash,session_id,used_at) VALUES(?,?,?)')
      .bind(hash, current.id, at(now()))
  ])
  if (changes(results[0]) !== 1) {
    await db.prepare('UPDATE auth_sessions SET revoked_at=?,updated_at=? ' +
      'WHERE id=? AND revoked_at IS NULL').bind(at(now()), at(now()), current.id).run()
    fail(401, 'AUTH_REVOKED', '刷新凭证重复使用')
  }
  return respond({ accessToken, refreshToken, accessExpiresAt, sessionId: current.id })
}
async function logout(request, { db, now }) {
  // Allow a 15-minute access token to have expired, while requiring the CURRENT
  // access and refresh hashes to match ONE still-live, unrevoked session.
  // This is a single conditional SQL write; no refresh-only or cross-session logout.
  const accessHash = await sha256(bearer(request))
  const input = await body(request)
  fields(input, ['refreshToken'])
  const candidate = string(input.refreshToken, 'refreshToken', 256)
  if (!/^[0-9a-f]{64}$/.test(candidate))
    fail(401, 'AUTH_UNAUTHORIZED', '会话验证失败')
  const refreshHash = await sha256(candidate)
  const instant = at(now())
  const result = await db.prepare('UPDATE auth_sessions SET revoked_at=?,updated_at=? ' +
    'WHERE access_hash=? AND refresh_hash=? AND revoked_at IS NULL ' +
    'AND refresh_expires_at > ? AND expires_at > ?').bind(
      instant, instant, accessHash, refreshHash, instant, instant).run()
  if (changes(result) !== 1) fail(401, 'AUTH_UNAUTHORIZED', '会话验证失败')
  return respond({ ok: true })
}
export async function handleAuth(request, path, ctx) {
  if (path === '/v1/auth/wechat/exchange' && request.method === 'POST')
    return exchange(request, ctx)
  if (path === '/v1/auth/refresh' && request.method === 'POST')
    return refresh(request, ctx)
  if (path === '/v1/auth/logout' && request.method === 'POST')
    return logout(request, ctx)
  if (path === '/v1/me' && request.method === 'GET')
    return responseMe(request, ctx)
  fail(404, 'NOT_FOUND', '接口不存在')
}
