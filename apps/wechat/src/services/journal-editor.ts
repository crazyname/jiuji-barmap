// SPDX-License-Identifier: MPL-2.0
// PR-04 UI adapters only. Every successful write flows through PR-03's private repository.
import type { DrinkContextKind, NewDrinkEntry, NewVisitSession } from '../../../../packages/core/src/models'
import type { PrivateJournalRepository } from '../../../../packages/core/src/journal-contracts'
import { JournalError } from '../../../../packages/core/src/journal'
import { CloudSyncError } from '../../../../packages/sync/private-cloud'

export type CocktailOption = { id: string; label: string;
  variants?: readonly { id: string; label: string }[] }
export type VenueOption = { id: number; name: string }
export interface DrinkDraft {
  drinkLabel: string
  date: string
  time: string
  contextKind: DrinkContextKind
  cocktailId: string | null
  recipeVariantId?: string | null
  note: string
  personalRating: string
  barId: number | null
  menuItem: string
  preparationNote: string
  placeNote: string
  visitSessionId: string | null
}
export interface VisitDraft {
  date: string
  time: string
  barId: number | null
  placeLabel: string
  note: string
}
export function localDateTime(now: Date): { date: string; time: string } {
  const p = (n: number) => String(n).padStart(2, '0')
  return { date: now.getFullYear() + '-' + p(now.getMonth() + 1) + '-' + p(now.getDate()),
    time: p(now.getHours()) + ':' + p(now.getMinutes()) }
}
export function createDrinkDraft(now: Date = new Date(), visitSessionId: string | null = null): DrinkDraft {
  return { ...localDateTime(now), drinkLabel: '', contextKind: 'bar', cocktailId: null, recipeVariantId: null,
    note: '', personalRating: '', barId: null, menuItem: '', preparationNote: '',
    placeNote: '', visitSessionId }
}
export function createVisitDraft(now: Date = new Date()): VisitDraft {
  return { ...localDateTime(now), barId: null, placeLabel: '', note: '' }
}
export class JournalFormError extends Error {
  constructor(public readonly field: string, message: string) {
    super(message)
    this.name = 'JournalFormError'
  }
}
function optionalString(value: string): string | undefined { return value.trim() || undefined }
function toIso(date: string, time: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new JournalFormError('date', '请选择有效日期')
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    throw new JournalFormError('time', '请选择有效时间')
  const [y, m, d] = date.split('-').map(Number)
  const [h, minute] = time.split(':').map(Number)
  const value = new Date(y, m - 1, d, h, minute, 0)
  if (value.getFullYear() !== y || value.getMonth() !== m - 1 ||
      value.getDate() !== d || value.getHours() !== h || value.getMinutes() !== minute)
    throw new JournalFormError('date', '日期或时间无效')
  return value.toISOString()
}
function ensureBarId(id: number | null): number | null {
  if (id !== null && (!Number.isSafeInteger(id) || id <= 0))
    throw new JournalFormError('barId', '酒吧选择无效')
  return id
}
export function buildDrinkInput(draft: DrinkDraft, catalog: readonly CocktailOption[] = []): NewDrinkEntry {
  const drinkLabel = draft.drinkLabel.trim()
  if (!drinkLabel) throw new JournalFormError('drinkLabel', '请填写酒名')
  if (drinkLabel.length > 120) throw new JournalFormError('drinkLabel', '酒名不能超过 120 字')
  const consumedAt = toIso(draft.date, draft.time)
  if (!['bar', 'home', 'other'].includes(draft.contextKind))
    throw new JournalFormError('contextKind', '请选择饮用场景')
  if (draft.cocktailId && !catalog.some(item => item.id === draft.cocktailId))
    throw new JournalFormError('cocktailId', '请选择有效的知识库酒款')
  if (draft.recipeVariantId &&
      (!draft.cocktailId || !catalog.find(c => c.id === draft.cocktailId)?.variants
        ?.some(v => v.id === draft.recipeVariantId)))
    throw new JournalFormError('recipeVariantId', '配方版本与酒款不匹配，不能自动关联')
  const parsedRating = draft.personalRating.trim() === '' ? null : Number(draft.personalRating)
  if (parsedRating !== null && (!Number.isFinite(parsedRating) || parsedRating < 0 ||
      parsedRating > 5 || !/^(?:[0-4](?:\.[0-9])?|5(?:\.0)?)$/.test(draft.personalRating.trim()))) {
    throw new JournalFormError('personalRating', '个人评分需在 0–5 之间，最多一位小数')
  }
  const contextDetails = draft.contextKind === 'bar'
    ? { bar: { ...(ensureBarId(draft.barId) !== null ? { barId: draft.barId as number } : {}),
      ...(optionalString(draft.menuItem) ? { menuItem: draft.menuItem.trim() } : {}) } }
    : draft.contextKind === 'home'
      ? { home: { ...(optionalString(draft.preparationNote) ? { preparationNote: draft.preparationNote.trim() } : {}) } }
      : { other: { ...(optionalString(draft.placeNote) ? { placeNote: draft.placeNote.trim() } : {}) } }
  return {
    drinkLabel, consumedAt, contextKind: draft.contextKind,
    ...(draft.cocktailId ? { cocktailId: draft.cocktailId } : {}),
    ...(draft.cocktailId && draft.recipeVariantId ? { recipeVariantId: draft.recipeVariantId } : {}),
    ...(draft.visitSessionId ? { visitSessionId: draft.visitSessionId } : {}),
    ...(optionalString(draft.note) ? { note: draft.note.trim() } : {}),
    ...(parsedRating !== null ? { personalRating: parsedRating } : {}),
    contextDetails
  }
}
export function buildVisitInput(draft: VisitDraft): NewVisitSession {
  const occurredAt = toIso(draft.date, draft.time)
  const barId = ensureBarId(draft.barId)
  return { occurredAt, ...(barId !== null ? { barId } : {}),
    ...(optionalString(draft.placeLabel) ? { placeLabel: draft.placeLabel.trim() } : {}),
    ...(optionalString(draft.note) ? { note: draft.note.trim() } : {}) }
}
export function formErrorMessage(error: unknown): string {
  if (error instanceof JournalFormError) return error.message
  if (error instanceof CloudSyncError) {
    if (error.code === 'STORAGE') return '设备存储失败，尚未确认保存；请检查可用空间并恢复，当前输入仍保留'
    if (error.code === 'AUTH_REQUIRED') return '会话未验证，不能读取或同步私人记录'
    if (error.code === 'CONFLICT') return '服务器记录发生冲突，本机修改已保留，请手动处理'
    if (error.code === 'NETWORK') return '仅本机保存，服务器尚未确认；网络恢复后可以重试'
    return '私人记录保存未完成，请检查后重试'
  }
  if (error instanceof JournalError) {
    if (error.code === 'AUTH_REQUIRED') return '需要登录才能保存私人日记。当前输入仍保留在本页。'
    if (error.code === 'CONFLICT') return '保存冲突，请核对记录后重试'
    if (error.code === 'INVALID_INPUT') return '输入内容不符合保存要求，请检查'
    return '保存未完成，当前输入仍保留在本页'
  }
  return '保存失败，请重试；当前输入仍保留在本页'
}

export function newClientMutationId(): string {
  return 'journal-ui-' + Date.now().toString(36) + '-' +
    Math.random().toString(36).slice(2, 12)
}
/** Locks immediately, before async work, and calls the real repository only once on success. */
export function createSubmitGate<T>() {
  let inFlight = false
  let completed = false
  return {
    isBusy: () => inFlight,
    isComplete: () => completed,
    async submit(work: () => T | Promise<T>): Promise<T | null> {
      if (inFlight || completed) return null
      inFlight = true
      try {
        const saved = await work()
        completed = true
        return saved
      } finally {
        inFlight = false
      }
    },
    invalidate(): void { if (!inFlight) completed = false }
  }
}
export function saveDrink(repo: PrivateJournalRepository, draft: DrinkDraft,
  mutationId: string, catalog: readonly CocktailOption[] = []) {
  return repo.createDrink(buildDrinkInput(draft, catalog), mutationId)
}
export function saveVisit(repo: PrivateJournalRepository, draft: VisitDraft, mutationId: string) {
  return repo.createVisit(buildVisitInput(draft), mutationId)
}
