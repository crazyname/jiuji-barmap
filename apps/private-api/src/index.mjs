// SPDX-License-Identifier: MPL-2.0
// Standalone Cloudflare Worker. Never proxies the existing public Sites /v1/sync.
import { ApiError, respond, fail, requireDb } from './common.mjs'
import { handleAuth, requireAccount, requireAuthSecrets } from './auth.mjs'
import { handlePrivate } from './private.mjs'

export function createHandler({ wechatFetch = fetch, now = () => Date.now() } = {}) {
  return async function handle(request, env) {
    try {
      const url = new URL(request.url)
      const path = url.pathname.replace(/\/+$/, '') || '/'
      if (path === '/v1/health' && request.method === 'GET')
        return respond({ ok: true, service: 'jiuji-private-api' })
      if (!path.startsWith('/v1/')) fail(404, 'NOT_FOUND', '接口不存在')
      const db = requireDb(env)
      const context = { db, env, now, wechatFetch }
      // Losing production secrets must never silently leave old sessions live.
      if (path.startsWith('/v1/auth/') || path === '/v1/me' || path.startsWith('/v1/private/'))
        requireAuthSecrets(env)
      if (path.startsWith('/v1/auth/') || path === '/v1/me')
        return await handleAuth(request, path, context)
      if (path.startsWith('/v1/private/')) {
        const accountId = await requireAccount(request, context)
        return await handlePrivate(request, path, accountId, context)
      }
      // Explicitly NEVER place private content in existing public sync.
      fail(404, 'NOT_FOUND', '接口不存在')
    } catch (error) {
      if (error instanceof ApiError) return respond({ error: {
        code: error.code, message: error.message } }, error.status)
      // Never log headers, tokens, WeChat codes or private body, even on SQL errors.
      return respond({ error: { code: 'INTERNAL_ERROR', message: '服务暂不可用' } }, 500)
    }
  }
}
export default { fetch: createHandler() }
