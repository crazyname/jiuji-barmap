// SPDX-License-Identifier: MPL-2.0
// Private views read PR-03's repository only. No legacy history or Sites public data.
import type { PrivateJournalRepository, CocktailArchiveGroup } from '../../../../packages/core/src/journal-contracts'
import type { DrinkEntry, DrinkContextKind, VisitSession } from '../../../../packages/core/src/models'
import { JournalError } from '../../../../packages/core/src/journal'

export type PrivateViewStatus = 'ready' | 'auth-required' | 'error'
export type PrivateViewResult<T> = { status: 'ready'; data: T } |
  { status: 'auth-required' | 'error'; message: string }
export type DrinkFilter = { date: string; context: 'all' | DrinkContextKind }
export interface TimelineData { drinks: DrinkEntry[]; visits: VisitSession[] }
export interface FootprintsData { visits: VisitSession[]; drinks: DrinkEntry[] }
export interface ArchiveData { groups: CocktailArchiveGroup[] }
export const CONTEXT_LABEL: Record<DrinkContextKind, string> = {
  bar: '酒吧饮用', home: '在家自调', other: '其他'
}

export function viewFailure(error: unknown): { status: 'auth-required' | 'error'; message: string } {
  if (error instanceof JournalError && error.code === 'AUTH_REQUIRED') return {
    status: 'auth-required',
    message: '需要登录才能查看私人记录。正式微信账号尚未接入；不会展示其他账号的数据。'
  }
  if (error instanceof JournalError && error.code === 'CONFLICT') return {
    status: 'error', message: '记录已更新，请重新载入最新版本后再操作。'
  }
  return { status: 'error', message: '私人记录读取或操作失败，请重试。未修改任何公开内容。' }
}
export function readPrivateView<T>(load: () => T): PrivateViewResult<T> {
  try { return { status: 'ready', data: load() } }
  catch (error) { return viewFailure(error) }
}
export function dateKey(iso: string): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
}
export function dateLabel(iso: string): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return '时间未提供'
  return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false })
}
export function personalRatingLabel(value: number | null): string {
  return value === null ? '未评分' : '个人评分 ' + value + '/5'
}
export function noteSummary(note: string | null): string {
  return note ? (note.length > 76 ? note.slice(0, 76) + '…' : note) : ''
}
export function orderDrinks(rows: readonly DrinkEntry[]): DrinkEntry[] {
  return [...rows].sort((a, b) => b.consumedAt.localeCompare(a.consumedAt) || a.id.localeCompare(b.id))
}
export function filterTimeline(rows: readonly DrinkEntry[], filter: DrinkFilter): DrinkEntry[] {
  return orderDrinks(rows.filter(item =>
    (filter.context === 'all' || item.contextKind === filter.context) &&
    (!filter.date || dateKey(item.consumedAt) === filter.date)))
}
export function readTimeline(repo: PrivateJournalRepository): PrivateViewResult<TimelineData> {
  return readPrivateView(() => ({ drinks: orderDrinks(repo.listDrinks()), visits: repo.listVisits() }))
}
export function readArchive(repo: PrivateJournalRepository): PrivateViewResult<ArchiveData> {
  return readPrivateView(() => ({ groups: repo.groupDrinksByCocktail().map(group =>
    ({ ...group, entries: orderDrinks(group.entries) })) }))
}
export function readFootprints(repo: PrivateJournalRepository): PrivateViewResult<FootprintsData> {
  return readPrivateView(() => ({ visits: [...repo.listVisits()].sort((a, b) =>
    b.occurredAt.localeCompare(a.occurredAt) || a.id.localeCompare(b.id)),
    drinks: repo.listDrinks() }))
}
export function placeLabel(visit: VisitSession, knownBars: readonly { id: number; name: string }[]): string {
  return visit.placeLabel || (visit.barId !== null
    ? knownBars.find(item => item.id === visit.barId)?.name || '已关联酒吧（资料待核实）'
    : '未填写地点')
}
export function linkedVisit(drink: DrinkEntry, visits: readonly VisitSession[]): VisitSession | null {
  return drink.visitSessionId === null ? null :
    visits.find(item => item.id === drink.visitSessionId) || null
}
