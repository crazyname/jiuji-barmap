// SPDX-License-Identifier: MPL-2.0
// PR-06: account identity is assigned and attested by our server, never by WeChat UI.
export interface AccountBindings {
  wechat: boolean
  phone: boolean
  providers: string[]
}
export interface AuthAccount {
  id: string
  displayName: string | null
  bindings: AccountBindings
}
export interface TokenPair {
  accessToken: string
  refreshToken: string
  accessExpiresAt: string
  sessionId: string
}
export interface MeResponse {
  account: AuthAccount
  session: { id: string; expiresAt: string; revoked: boolean }
}
export interface AuthTransport {
  exchange(code: string): Promise<TokenPair>
  refresh(refreshToken: string): Promise<TokenPair>
  me(accessToken: string): Promise<MeResponse>
  logout(accessToken: string, refreshToken: string): Promise<void>
}
export interface AuthDependencies {
  wechatLogin: () => Promise<string>
  transport: AuthTransport
  // Only the release-configured, verified backend can turn on real authentication.
  enabled: boolean
  now: () => number
}
export type AuthStatus = 'guest' | 'authenticating' | 'authenticated' | 'expired' | 'error'
export interface AuthState {
  status: AuthStatus
  account: AuthAccount | null
  expiresAt: string | null
  message: string | null
  epoch: number
}
