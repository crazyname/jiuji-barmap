// SPDX-License-Identifier: MPL-2.0
// No browser storage, device tokens, owner credentials, JWT decoding or impersonation.
import type { VerifiedJournalIdentity } from '../../../../packages/core/src/journal-contracts'
import type { AuthAccount, AuthDependencies, AuthState, MeResponse, TokenPair } from './auth-contracts'

type Listener = (state: AuthState) => void
export class AuthError extends Error {
  constructor(readonly code: 'UNAVAILABLE' | 'LOGIN_FAILED' | 'REJECTED' | 'EXPIRED' | 'BUSY',
    message: string) { super(message); this.name = 'AuthError' }
}
function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}
function validTokens(value: unknown, now: number): value is TokenPair {
  if (!value || typeof value !== 'object') return false
  const token = value as Partial<TokenPair>
  return nonempty(token.accessToken) && token.accessToken.length >= 16 &&
    nonempty(token.refreshToken) && token.refreshToken.length >= 16 &&
    nonempty(token.sessionId) && nonempty(token.accessExpiresAt) &&
    Number.isFinite(Date.parse(token.accessExpiresAt)) &&
    Date.parse(token.accessExpiresAt) > now + 1000
}
function validMe(value: unknown, pair: TokenPair, now: number): value is MeResponse {
  if (!value || typeof value !== 'object') return false
  const me = value as Partial<MeResponse>
  const account = me.account
  const session = me.session
  if (!account || !session || !nonempty(account.id) || !nonempty(session.id) ||
    session.id !== pair.sessionId || session.revoked !== false ||
    !nonempty(session.expiresAt) || !Number.isFinite(Date.parse(session.expiresAt)) ||
    Date.parse(session.expiresAt) <= now + 1000 ||
    !account.bindings || typeof account.bindings.wechat !== 'boolean' ||
    typeof account.bindings.phone !== 'boolean' ||
    !Array.isArray(account.bindings.providers) ||
    !account.bindings.providers.every(nonempty)) return false
  return account.displayName === null || typeof account.displayName === 'string'
}
export class AuthService {
  private state: AuthState = { status: 'guest', account: null, expiresAt: null, message: null, epoch: 0 }
  private tokens: TokenPair | null = null
  private listeners = new Set<Listener>()
  private serial = 0
  private busy = false
  constructor(private readonly deps: AuthDependencies) {}
  private emit(next: Omit<AuthState, 'epoch'>) {
    this.state = { ...next, epoch: this.state.epoch + 1 }
    for (const listener of [...this.listeners]) listener(this.getState())
  }
  getState(): AuthState {
    return { ...this.state,
      account: this.state.account ? {
        ...this.state.account, bindings: { ...this.state.account.bindings,
          providers: [...this.state.account.bindings.providers] }
      } : null }
  }
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  private erase(status: 'guest' | 'expired' | 'error', message: string | null) {
    this.tokens = null
    this.emit({ status, account: null, expiresAt: null, message })
  }
  private accept(pair: TokenPair, me: MeResponse, sequence: number) {
    if (sequence !== this.serial) return
    const now = this.deps.now()
    if (!validTokens(pair, now) || !validMe(me, pair, now))
      throw new AuthError('REJECTED', '服务器身份校验未通过')
    // Keep tokens in memory only; even verified identity is rechecked against expiry.
    this.tokens = { ...pair }
    this.emit({ status: 'authenticated',
      account: { id: me.account.id, displayName: me.account.displayName,
        bindings: { ...me.account.bindings, providers: [...me.account.bindings.providers] } },
      expiresAt: new Date(Math.min(Date.parse(pair.accessExpiresAt),
        Date.parse(me.session.expiresAt))).toISOString(), message: null })
  }
  verifiedIdentity(): VerifiedJournalIdentity | null {
    if (this.state.status !== 'authenticated' || !this.tokens ||
      !this.state.expiresAt || !this.state.account) return null
    if (Date.parse(this.state.expiresAt) <= this.deps.now()) {
      this.serial++
      this.erase('expired', '登录状态已过期，请重新登录')
      return null
    }
    return { kind: 'verified', userId: this.state.account.id }
  }
  async signIn(): Promise<void> {
    if (this.busy) return
    if (!this.deps.enabled) {
      this.erase('error', '微信登录服务暂未开放，请稍后重试')
      return
    }
    const sequence = ++this.serial
    this.busy = true
    this.tokens = null
    this.emit({ status: 'authenticating', account: null, expiresAt: null, message: null })
    try {
      const code = await this.deps.wechatLogin()
      if (!nonempty(code)) throw new AuthError('LOGIN_FAILED', '未获得微信登录凭证')
      const pair = await this.deps.transport.exchange(code)
      if (!validTokens(pair, this.deps.now()))
        throw new AuthError('REJECTED', '服务器未返回有效的短期会话')
      const me = await this.deps.transport.me(pair.accessToken)
      this.accept(pair, me, sequence)
    } catch (_) {
      if (sequence === this.serial) this.erase('error', '微信登录失败或服务尚未配置，请重试')
    } finally { this.busy = false }
  }
  async checkSession(): Promise<void> {
    if (!this.tokens || !this.verifiedIdentity()) return
    if (this.busy) return
    const current = this.tokens
    const sequence = ++this.serial
    this.busy = true
    try {
      if (Date.parse(this.state.expiresAt!) - this.deps.now() <= 60_000) {
        const newTokens = await this.deps.transport.refresh(current.refreshToken)
        if (sequence !== this.serial) return
        if (!validTokens(newTokens, this.deps.now()) || newTokens.sessionId !== current.sessionId)
          throw new AuthError('REJECTED', '刷新会话返回异常')
        const me = await this.deps.transport.me(newTokens.accessToken)
        if (sequence !== this.serial) return
        if (!validMe(me, newTokens, this.deps.now()) ||
          me.account.id !== this.state.account?.id) throw new AuthError('REJECTED', '会话所属账户发生变化')
        this.accept(newTokens, me, sequence)
      } else {
        const me = await this.deps.transport.me(current.accessToken)
        if (sequence !== this.serial) return
        if (!validMe(me, current, this.deps.now()) ||
          me.account.id !== this.state.account?.id)
          throw new AuthError('REJECTED', '会话所属账户发生变化')
        this.accept(current, me, sequence)
      }
    } catch (_) {
      if (sequence === this.serial) this.erase('expired', '登录状态已失效，请重新登录')
    } finally { this.busy = false }
  }
  async signOut(): Promise<void> {
    const old = this.tokens
    this.serial++
    // Invalidate before awaiting network; stale responses cannot restore the session.
    this.erase('guest', null)
    if (old) {
      try { await this.deps.transport.logout(old.accessToken, old.refreshToken) }
      catch (_) { /* Server revocation must be confirmed in a future online session. */ }
    }
  }
  // No restore from local storage: a cold start requires a new server-verified exchange.
}
