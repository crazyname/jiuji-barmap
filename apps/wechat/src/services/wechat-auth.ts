// SPDX-License-Identifier: MPL-2.0
import Taro from '@tarojs/taro'
import { AUTH_API_BASE_URL, AUTH_API_ENABLED } from '../config/auth'
import { AuthService, AuthError } from './auth-service'
import type { AuthTransport, TokenPair, MeResponse } from './auth-contracts'

/** Production transport: HTTPS, JSON and short timeouts, no debug token logs. */
export function createWeChatAuthTransport(origin: string): AuthTransport {
  async function request<T>(path: string, method: 'GET' | 'POST', data?: unknown,
    token?: string): Promise<T> {
    if (!/^https:\/\/[^/?#]+(?:\/[^?#]*)?$/.test(origin))
      throw new AuthError('UNAVAILABLE', '认证服务尚未完成安全配置')
    const response = await Taro.request({
      url: origin.replace(/\/+$/, '') + path, method,
      header: { 'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      data, timeout: 10000
    })
    if (response.statusCode === 401 || response.statusCode === 403)
      throw new AuthError('REJECTED', '当前会话无效')
    if (response.statusCode < 200 || response.statusCode >= 300)
      throw new AuthError('UNAVAILABLE', '认证服务请求失败')
    const payload: unknown = response.data
    if (!payload || typeof payload !== 'object' || Array.isArray(payload))
      throw new AuthError('REJECTED', '认证服务返回格式无效')
    return payload as T
  }
  return {
    exchange: code => request<TokenPair>('/v1/auth/wechat/exchange', 'POST', { code }),
    refresh: refreshToken => request<TokenPair>('/v1/auth/refresh', 'POST', { refreshToken }),
    me: accessToken => request<MeResponse>('/v1/me', 'GET', undefined, accessToken),
    logout: (accessToken, refreshToken) =>
      request<unknown>('/v1/auth/logout', 'POST', { refreshToken }, accessToken).then(() => {})
  }
}
export const authService = new AuthService({
  enabled: AUTH_API_ENABLED && AUTH_API_BASE_URL.startsWith('https://'),
  wechatLogin: async () => {
    const login = await Taro.login()
    if (typeof login.code !== 'string' || !login.code.trim())
      throw new AuthError('LOGIN_FAILED', '微信登录未返回临时凭证')
    return login.code
  },
  transport: createWeChatAuthTransport(AUTH_API_BASE_URL),
  now: () => Date.now()
})
