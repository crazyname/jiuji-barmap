// SPDX-License-Identifier: MPL-2.0
import Taro from '@tarojs/taro'
import { SYNC_API_BASE_URL, SYNC_ENABLED } from '../config/sync'
import { createSyncClient } from './sync-core'

export type SyncKind = 'bars' | 'recipes' | 'posts' | 'favorites'
type RecordRow = { id: number | string; [key: string]: unknown }
const STORE_KEY = 'jiuji.sync.snapshot.v1'
const SESSION_KEY = 'jiuji.sync.session.v1'

const store = {
  read: (): unknown => {
    try { return Taro.getStorageSync(STORE_KEY) || null } catch (_) { return null }
  },
  write: (snapshot: unknown): void => { Taro.setStorageSync(STORE_KEY, snapshot) }
}
async function request(path: string, method: 'GET' | 'POST', token?: string, body?: unknown): Promise<any> {
  const origin = SYNC_API_BASE_URL.replace(/\/+$/, '')
  if (!/^https:\/\//.test(origin)) throw Error('请配置 HTTPS 同步服务地址')
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (token) headers.Authorization = 'Bearer ' + token
  const response = await Taro.request({ url: origin + path, method,
    header: headers, data: body, timeout: 10000 })
  if (response.statusCode < 200 || response.statusCode >= 300)
    throw Error('同步服务 HTTP ' + response.statusCode)
  const data = response.data
  if (!data || typeof data !== 'object') throw Error('同步服务未返回 JSON')
  return data
}
const engine = createSyncClient({
  storage: store,
  transport: {
    get: (path: string, token?: string) => request(path, 'GET', token),
    post: (path: string, body: unknown, token?: string) => request(path, 'POST', token, body)
  }
})
function sessionToken(): string {
  try { return String(Taro.getStorageSync(SESSION_KEY) || '') }
  catch (_) { return '' }
}
export const syncEnabled = SYNC_ENABLED && SYNC_API_BASE_URL.startsWith('https://')
export function publishedRows<T extends RecordRow>(collection: SyncKind): T[] {
  return engine.list(collection) as T[]
}
export function queueRemoteUpsert(collection: SyncKind, record: RecordRow): void {
  engine.queueUpsert(collection, record)
}
export function syncState(): { queued: number; conflicts: number; revision: number } {
  return engine.status()
}
export async function refreshSites(): Promise<{ enabled: boolean; ok: boolean; message: string }> {
  if (!syncEnabled) return { enabled: false, ok: false, message: '等待 Sites API 上线' }
  try {
    const result = await engine.sync(sessionToken())
    return { enabled: true, ok: true, message: '已更新 · 版本 ' + result.revision +
      (result.queued ? ' · 待上传 ' + result.queued + ' 条' : '') }
  } catch (error) {
    return { enabled: true, ok: false, message: '同步暂不可用，本机修改已保留' }
  }
}
// An authenticated sign-in flow must provide a real server-issued session before upload.
// Never bundle owner credentials or any test admin token in a client.
export function saveAuthenticatedSession(token: string): void {
  if (!token || token.length < 16) throw Error('Invalid authenticated session')
  Taro.setStorageSync(SESSION_KEY, token)
}
export function clearAuthenticatedSession(): void {
  Taro.removeStorageSync(SESSION_KEY)
}
