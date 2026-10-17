import React, { useEffect, useState } from 'react'
import { Button, Input, Picker, Text, Textarea, View } from '@tarojs/components'
import type { PrivateJournalRepository } from '../../../../../packages/core/src/journal-contracts'
import type { DrinkEntry, VisitSession } from '../../../../../packages/core/src/models'
import { readTimeline, readFootprints, readArchive, filterTimeline, dateKey, dateLabel,
  personalRatingLabel, noteSummary, CONTEXT_LABEL, placeLabel, linkedVisit, viewFailure,
  readPrivateView } from '../../services/personal-journal-views'
import type { PrivateViewResult, TimelineData, FootprintsData, ArchiveData } from '../../services/personal-journal-views'
import './index.css'
import './personal-views.css'

type Mode = 'timeline' | 'footprints' | 'cocktails'
type Navigate = { onOpenDrink: (id: string) => void; onOpenVisit: (id: string) => void }
export interface PersonalJournalListProps extends Navigate {
  repository: PrivateJournalRepository
  mode: Mode
  bars: readonly { id: number; name: string }[]
  refreshVersion?: number
  onBack: () => void
}

const HEADINGS: Record<Mode, string> = {
  timeline: '饮酒日记', footprints: '酒吧足迹', cocktails: '我的酒款'
}
function StatusMessage({ status, message, onRetry }: {
  status: 'auth-required' | 'error'; message: string; onRetry: () => void
}) {
  return <View className='pv-status'>
    <Text className='pv-status-title'>{status === 'auth-required' ? '尚未登录' : '载入失败'}</Text>
    <Text className='pv-muted'>{message}</Text>
    {status === 'error' ? <Button className='pv-outline' onClick={onRetry}>重新加载</Button> : null}
  </View>
}
function DrinkRow({ entry, visits, bars, onOpen }: {
  entry: DrinkEntry; visits: readonly VisitSession[];
  bars: readonly { id: number; name: string }[]; onOpen: () => void
}) {
  const visit = linkedVisit(entry, visits)
  return <View className='pv-row' onClick={onOpen}>
    <Text className='pv-main'>{entry.drinkLabel}</Text>
    <Text className='pv-muted'>{dateLabel(entry.consumedAt)} · {CONTEXT_LABEL[entry.contextKind]}</Text>
    <Text className='pv-muted'>{personalRatingLabel(entry.personalRating)}</Text>
    {entry.note ? <Text className='pv-summary'>{noteSummary(entry.note)}</Text> : null}
    {visit ? <Text className='pv-link-hint'>关联探店：{placeLabel(visit, bars)}</Text> : null}
    <Text className='pv-link-hint'>查看完整记录 ›</Text>
  </View>
}
export function PersonalJournalList({ repository, mode, bars, refreshVersion = 0,
  onOpenDrink, onOpenVisit, onBack }: PersonalJournalListProps) {
  const [loaded, setLoaded] = useState<PrivateViewResult<TimelineData | FootprintsData | ArchiveData> | null>(null)
  const [retry, setRetry] = useState(0)
  const [filterDate, setFilterDate] = useState('')
  const [context, setContext] = useState<'all' | 'bar' | 'home' | 'other'>('all')
  const [archiveKey, setArchiveKey] = useState<string | null>(null)
  useEffect(() => {
    setLoaded(null)
    setLoaded(mode === 'timeline' ? readTimeline(repository) :
      mode === 'footprints' ? readFootprints(repository) : readArchive(repository))
  }, [repository, mode, refreshVersion, retry])
  return <View className='pv-screen'>
    <Text className='pv-heading'>{HEADINGS[mode]}</Text>
    <Text className='pv-muted'>私人记录 · 仅本人可查看，浏览不会变成探店或公开评价</Text>
    {loaded === null ? <Text className='pv-empty'>正在加载私人记录…</Text> :
      loaded.status !== 'ready' ? <StatusMessage status={loaded.status}
        message={loaded.message} onRetry={() => setRetry(x => x + 1)} /> :
      mode === 'timeline' ? (() => {
        const data = loaded.data as TimelineData
        const shown = filterTimeline(data.drinks, { date: filterDate, context })
        return <View>
          <View className='pv-filters'>
            <Picker mode='date' value={filterDate || dateKey(new Date().toISOString())}
              onChange={event => setFilterDate(event.detail.value)}>
              <View className='pv-chip'>{filterDate || '全部日期'} ⌄</View>
            </Picker>
            {filterDate ? <Text className='pv-clear' onClick={() => setFilterDate('')}>清除日期</Text> : null}
            <Picker mode='selector' range={['全部场景', '酒吧饮用', '在家自调', '其他']}
              value={['all', 'bar', 'home', 'other'].indexOf(context)}
              onChange={event => setContext((['all', 'bar', 'home', 'other'] as const)[Number(event.detail.value)])}>
              <View className='pv-chip'>{({ all: '全部场景', ...CONTEXT_LABEL })[context]} ⌄</View>
            </Picker>
          </View>
          {shown.length ? shown.map(row => <DrinkRow key={row.id} entry={row}
            visits={data.visits} bars={bars} onOpen={() => onOpenDrink(row.id)} />) :
            <Text className='pv-empty'>{data.drinks.length ? '没有符合筛选条件的饮用记录。' :
              '还没有私人饮用记录；可从底部＋开始记一杯酒。'}</Text>}
        </View>
      })() : mode === 'footprints' ? (() => {
        const data = loaded.data as FootprintsData
        return data.visits.length ? <View>{data.visits.map(visit => <View
          className='pv-row' key={visit.id} onClick={() => onOpenVisit(visit.id)}>
          <Text className='pv-main'>{placeLabel(visit, bars)}</Text>
          <Text className='pv-muted'>{dateLabel(visit.occurredAt)}</Text>
          {visit.note ? <Text className='pv-summary'>{noteSummary(visit.note)}</Text> : null}
          <Text className='pv-link-hint'>{data.drinks.filter(d => d.visitSessionId === visit.id).length} 杯饮用记录 · 查看经历 ›</Text>
        </View>)}</View> :
          <Text className='pv-empty'>还没有私人探店经历。浏览过的酒吧不会自动计入足迹。</Text>
      })() : (() => {
        const data = loaded.data as ArchiveData
        const picked = data.groups.find(group => group.key === archiveKey)
        return picked ? <View>
          <Text className='pv-back' onClick={() => setArchiveKey(null)}>‹ 返回我的酒款</Text>
          <Text className='pv-main'>{picked.label} · {picked.entries.length} 次饮用</Text>
          {picked.entries.map(entry => <DrinkRow key={entry.id} entry={entry}
            visits={[]} bars={bars} onOpen={() => onOpenDrink(entry.id)} />)}
        </View> : data.groups.length ? <View>{data.groups.map(group => <View className='pv-row'
          key={group.key} onClick={() => setArchiveKey(group.key)}>
          <Text className='pv-main'>{group.label}</Text>
          <Text className='pv-muted'>{group.entries.length} 次饮用 · 最近 {dateLabel(group.entries[0].consumedAt)}</Text>
          <Text className='pv-link-hint'>查看历次饮用 ›</Text>
        </View>)}</View> : <Text className='pv-empty'>还没有个人酒款档案；自由输入的酒名也会自动归集到这里。</Text>
      })()}
    <Button className='pv-outline pv-bottom' onClick={onBack}>返回我的</Button>
  </View>
}

export interface PrivateDetailProps extends Navigate {
  repository: PrivateJournalRepository
  recordId: string
  bars: readonly { id: number; name: string }[]
  mode: 'drink' | 'visit'
  refreshVersion?: number
  onBack: () => void
  confirm: (title: string, content: string) => Promise<boolean>
}
export function PersonalJournalDetail({ repository, recordId, mode, bars,
  refreshVersion = 0, onBack, onOpenDrink, onOpenVisit, confirm }: PrivateDetailProps) {
  type State = { drink: DrinkEntry | null; visit: VisitSession | null;
    visits: VisitSession[]; drinks: DrinkEntry[] }
  const [loaded, setLoaded] = useState<PrivateViewResult<State> | null>(null)
  const [retry, setRetry] = useState(0)
  const [editing, setEditing] = useState(false)
  const [note, setNote] = useState('')
  const [score, setScore] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const load = () => setLoaded(readPrivateView(() => {
    const drink = mode === 'drink' ? repository.getDrink(recordId) : null
    const visit = mode === 'visit' ? repository.getVisit(recordId) : null
    const visits = repository.listVisits()
    const drinks = mode === 'visit' && visit ? repository.listDrinksForVisit(recordId) : []
    return { drink, visit, visits, drinks }
  }))
  useEffect(() => { load() }, [repository, recordId, mode, retry, refreshVersion])
  const data = loaded?.status === 'ready' ? loaded.data : null
  const drink = data?.drink
  const visit = data?.visit
  function beginEdit() {
    if (!drink) return
    setNote(drink.note || '')
    setScore(drink.personalRating === null ? '' : String(drink.personalRating))
    setError('')
    setEditing(true)
  }
  async function perform(title: string, description: string, action: () => void,
    close = false): Promise<void> {
    if (pending) return
    setPending(true)
    try {
      const accepted = await confirm(title, description)
      if (!accepted) return
      try {
        action()
        setError('')
        setEditing(false)
        if (close) onBack()
        else load()
      } catch (cause) {
        setError(viewFailure(cause).message)
        setEditing(false)
        // Refresh latest revisions so stale edits are never silently retried.
        load()
      }
    } catch (cause) { setError(viewFailure(cause).message) }
    finally { setPending(false) }
  }
  async function saveEdit(): Promise<void> {
    if (!drink) return
    const nextScore = score.trim() === '' ? null : Number(score)
    if (nextScore !== null && (!/^(?:[0-4](?:\.[0-9])?|5(?:\.0)?)$/.test(score.trim()) ||
      !Number.isFinite(nextScore))) {
      setError('个人评分应为 0–5，最多保留一位小数')
      return
    }
    await perform('确认修改私人记录', '仅修改当前饮用记录，不会公开发布。', () =>
      repository.updateDrink(drink.id, { note: note.trim() || null,
        personalRating: nextScore }, drink.revision))
  }
  async function changeVisit(value: number): Promise<void> {
    if (!drink || !data) return
    if (!Number.isSafeInteger(value) || value < 0 || value > data.visits.length) return
    const target = value === 0 ? null : data.visits[value - 1].id
    if (target === drink.visitSessionId) return
    await perform(target === null ? '解除探店关联' : '更正探店关联',
      '只会修改这杯酒与探店的关系，不会删除或合并原饮用记录。',
      () => { repository.linkDrink(drink.id, target, drink.revision) })
  }
  return <View className='pv-screen'>
    <Text className='pv-heading'>{mode === 'drink' ? '饮用详情' : '探店详情'}</Text>
    {loaded === null ? <Text className='pv-empty'>正在加载私人记录…</Text> :
      loaded.status !== 'ready' ? <StatusMessage status={loaded.status}
        message={loaded.message} onRetry={() => setRetry(x => x + 1)} /> :
      mode === 'drink' && drink && data ? <View className='pv-card'>
        <Text className='pv-main'>{drink.drinkLabel}</Text>
        <Text className='pv-muted'>{dateLabel(drink.consumedAt)} · {CONTEXT_LABEL[drink.contextKind]}</Text>
        <Text className='pv-muted'>{personalRatingLabel(drink.personalRating)}</Text>
        {drink.cocktailId ? <Text className='pv-muted'>关联酒款 ID：{drink.cocktailId}</Text> : null}
        {drink.recipeVariantId ? <Text className='pv-muted'>配方版本：{drink.recipeVariantId}</Text> : null}
        {drink.contextDetails.bar?.barId ? <Text className='pv-muted'>饮用酒吧：
          {bars.find(bar => bar.id === drink.contextDetails.bar?.barId)?.name || '已关联酒吧（资料待核实）'}</Text> : null}
        {drink.contextDetails.bar?.menuItem ? <Text className='pv-muted'>酒单：{drink.contextDetails.bar.menuItem}</Text> : null}
        {drink.contextDetails.bar?.priceAmount !== undefined ? <Text className='pv-muted'>记录价格：
          {drink.contextDetails.bar.priceAmount}</Text> : null}
        {drink.contextDetails.home?.ingredientsNote ? <Text className='pv-muted'>配料：
          {drink.contextDetails.home.ingredientsNote}</Text> : null}
        {drink.photoRefs.length ? <Text className='pv-muted'>照片引用 {drink.photoRefs.length} 项 · 附件查看尚未接入</Text> : null}
        {drink.contextDetails.home?.preparationNote ? <Text className='pv-muted'>制作：{drink.contextDetails.home.preparationNote}</Text> : null}
        {drink.contextDetails.other?.placeNote ? <Text className='pv-muted'>场景：{drink.contextDetails.other.placeNote}</Text> : null}
        <Text className='pv-section'>个人感受</Text>
        <Text className='pv-summary'>{drink.note || '尚未填写'}</Text>
        <Text className='pv-section'>关联探店</Text>
        {linkedVisit(drink, data.visits) ? <Text className='pv-link-hint'
          onClick={() => onOpenVisit(drink.visitSessionId!)}>
          {placeLabel(linkedVisit(drink, data.visits)!, bars)}　查看探店 ›
        </Text> : <Text className='pv-muted'>尚未关联探店</Text>}
        <Picker mode='selector' range={['不关联探店', ...data.visits.map(v => placeLabel(v, bars) +
          ' · ' + dateLabel(v.occurredAt))]} value={Math.max(0, data.visits.findIndex(v => v.id === drink.visitSessionId) + 1)}
          onChange={event => void changeVisit(Number(event.detail.value))}>
          <View className='pv-chip'>更正 / 解除关联 ⌄</View>
        </Picker>
        {editing ? <View className='pv-editor'>
          <Text className='pv-section'>修改个人感受</Text>
          <Textarea className='pv-area' value={note} maxlength={1000}
            onInput={event => setNote(event.detail.value)} />
          <Text className='pv-section'>个人评分（可选）</Text>
          <Input className='pv-input' value={score} type='digit'
            placeholder='0–5 或留空' onInput={event => setScore(event.detail.value)} />
          <Button className='pv-main-button' disabled={pending} onClick={() => void saveEdit()}>确认保存修改</Button>
          <Button className='pv-outline' onClick={() => { setEditing(false); setError('') }}>取消编辑</Button>
        </View> : <Button className='pv-outline' onClick={beginEdit}>编辑私人感受与评分</Button>}
        <Button className='pv-danger' disabled={pending} onClick={() => void perform(
          '删除这杯酒？', '删除后无法恢复，不会删除关联的探店经历。',
          () => { repository.deleteDrink(drink.id, drink.revision) }, true)}>删除这条饮用记录</Button>
      </View> :
        mode === 'visit' && visit && data ? <View className='pv-card'>
          <Text className='pv-main'>{placeLabel(visit, bars)}</Text>
          <Text className='pv-muted'>{dateLabel(visit.occurredAt)}</Text>
          <Text className='pv-summary'>{visit.note || '未填写备注'}</Text>
          <Text className='pv-section'>这次探店的饮用 · {data.drinks.length} 杯</Text>
          {data.drinks.length ? data.drinks.map(entry => <DrinkRow key={entry.id} entry={entry}
            visits={[visit]} bars={bars} onOpen={() => onOpenDrink(entry.id)} />) :
            <Text className='pv-muted'>这次探店还没有关联饮用记录。</Text>}
          <Button className='pv-danger' disabled={pending} onClick={() => void perform(
            '删除这次探店？', '关联饮用记录将保留，但会解除与本次探店的关系。',
            () => { repository.deleteVisit(visit.id, visit.revision) }, true)}>删除这次探店</Button>
        </View> : <Text className='pv-empty'>这条私人记录不存在或已被删除。</Text>}
    {error ? <Text className='pv-error'>{error}</Text> : null}
    <Button className='pv-outline pv-bottom' onClick={onBack}>返回</Button>
  </View>
}
