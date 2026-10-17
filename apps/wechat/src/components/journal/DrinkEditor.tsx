import React, { useRef, useState } from 'react'
import { Button, Input, Picker, Text, Textarea, View } from '@tarojs/components'
import type { DrinkEntry } from '../../../../../packages/core/src/models'
import type { PrivateJournalRepository } from '../../../../../packages/core/src/journal-contracts'
import { buildDrinkInput, createDrinkDraft, createSubmitGate, formErrorMessage,
  newClientMutationId, saveDrink } from '../../services/journal-editor'
import type { CocktailOption, DrinkDraft, VenueOption } from '../../services/journal-editor'
import './index.css'

export interface DrinkEditorProps {
  repository: PrivateJournalRepository
  authenticated: boolean
  venues: readonly VenueOption[]
  catalog?: readonly CocktailOption[]
  initialVisitSessionId?: string | null
  initialDate?: Date
  mutationIdFactory?: () => string
  onCancel: (dirty: boolean) => void
  onDirtyChange?: (dirty: boolean) => void
  onSaved: (entry: DrinkEntry) => void
}

export default function DrinkEditor({ repository, authenticated, venues, catalog = [],
  initialVisitSessionId = null, initialDate, mutationIdFactory = newClientMutationId,
  onCancel, onDirtyChange, onSaved }: DrinkEditorProps) {
  const [draft, setDraft] = useState<DrinkDraft>(() => createDrinkDraft(initialDate, initialVisitSessionId))
  const [dirty, setDirty] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const mutation = useRef<string | null>(null)
  const gate = useRef(createSubmitGate<DrinkEntry>())
  const markDirty = () => { setDirty(true); onDirtyChange?.(true) }
  function edit(patch: Partial<DrinkDraft>): void {
    if (submitting || saved) return
    if (mutation.current !== null) mutation.current = mutationIdFactory()
    gate.current.invalidate()
    setDraft(previous => ({ ...previous, ...patch }))
    setError('')
    markDirty()
  }
  async function submit(): Promise<void> {
    if (gate.current.isBusy() || gate.current.isComplete()) return
    // Validate before opening the write gate: failed validation never touches storage.
    try { buildDrinkInput(draft, catalog) } catch (failure) {
      setError(formErrorMessage(failure))
      return
    }
    if (mutation.current === null) mutation.current = mutationIdFactory()
    const currentId = mutation.current
    setSubmitting(true)
    setError('')
    try {
      const entry = await gate.current.submit(() => saveDrink(repository, draft, currentId, catalog))
      if (entry) {
        setSaved(true)
        setDirty(false)
        onDirtyChange?.(false)
        onSaved(entry)
      }
    } catch (failure) {
      setError(formErrorMessage(failure))
    } finally {
      setSubmitting(false)
    }
  }
  const selectedBar = venues.findIndex(item => item.id === draft.barId) + 1
  const selectedCocktail = catalog.findIndex(item => item.id === draft.cocktailId) + 1
  const types = [
    { id: 'bar', label: '酒吧饮用' }, { id: 'home', label: '在家自调' },
    { id: 'other', label: '其他' }
  ] as const
  return <View className='journal-page'>
    <Text className='journal-heading'>记一杯酒</Text>
    <Text className='journal-muted'>保存到我的私人日记，不会公开发布或提交酒吧评价。</Text>
    {!authenticated ? <View className='journal-auth' role='alert'>
      <Text className='journal-auth-title'>需要登录才能保存</Text>
      <Text>正式账号尚未接入，暂时无法写入私人日记。可以继续填写并保留在当前页面，或返回。</Text>
    </View> : null}
    <View className='journal-card'>
      <Text className='journal-label'>酒名 <Text className='journal-required'>*</Text></Text>
      <Input className='journal-input' placeholder='例如：尼格罗尼，或自定义酒名'
        value={draft.drinkLabel} maxlength={120} cursorSpacing={24}
        onInput={event => edit({ drinkLabel: event.detail.value, cocktailId: null })} />
      {catalog.length ? <View>
        <Text className='journal-label'>可选知识库酒款</Text>
        <Picker mode='selector' range={['自由填写酒名', ...catalog.map(item => item.label)]}
          value={selectedCocktail} onChange={event => {
            const index = Number(event.detail.value) - 1
            const selected = catalog[index]
            edit({ cocktailId: selected?.id || null,
              ...(selected ? { drinkLabel: selected.label } : {}) })
          }}>
          <View className='journal-picker'>{selectedCocktail ? catalog[selectedCocktail - 1].label : '不关联知识库酒款'}　⌄</View>
        </Picker>
      </View> : <Text className='journal-hint'>正式酒款知识库尚未接入，可直接填写任意酒名。</Text>}
      <View className='journal-datetime'>
        <View className='journal-date-field'><Text className='journal-label'>饮用日期</Text>
          <Picker mode='date' value={draft.date} onChange={event => edit({ date: event.detail.value })}>
            <View className='journal-picker'>{draft.date}　⌄</View>
          </Picker></View>
        <View className='journal-date-field'><Text className='journal-label'>时间</Text>
          <Picker mode='time' value={draft.time} onChange={event => edit({ time: event.detail.value })}>
            <View className='journal-picker'>{draft.time}　⌄</View>
          </Picker></View>
      </View>
      <Text className='journal-label'>饮用场景</Text>
      <View className='journal-segment'>
        {types.map(type => <View key={type.id}
          className={'journal-option ' + (draft.contextKind === type.id ? 'journal-option-on' : '')}
          onClick={() => edit({ contextKind: type.id })}>
          <Text>{type.label}</Text>
        </View>)}
      </View>
      {draft.contextKind === 'bar' ? <>
        <Text className='journal-label'>酒吧（可选）</Text>
        <Picker mode='selector' value={selectedBar}
          range={['不关联酒吧', ...venues.map(item => item.name)]}
          onChange={event => edit({ barId: venues[Number(event.detail.value) - 1]?.id || null })}>
          <View className='journal-picker'>{selectedBar ? venues[selectedBar - 1].name : '选择已有酒吧（可跳过）'}　⌄</View>
        </Picker>
        <Text className='journal-label'>酒单原名（可选）</Text>
        <Input className='journal-input' value={draft.menuItem} maxlength={120}
          placeholder='如：店内特调名称' cursorSpacing={24}
          onInput={event => edit({ menuItem: event.detail.value })} />
      </> : null}
      {draft.contextKind === 'home' ? <>
        <Text className='journal-label'>制作备注（可选）</Text>
        <Textarea className='journal-textarea' value={draft.preparationNote}
          placeholder='配料、手法或制作心得' maxlength={500} cursorSpacing={24}
          onInput={event => edit({ preparationNote: event.detail.value })} />
      </> : null}
      {draft.contextKind === 'other' ? <>
        <Text className='journal-label'>地点或场景（可选）</Text>
        <Input className='journal-input' value={draft.placeNote} maxlength={120}
          placeholder='例如：朋友聚会' cursorSpacing={24}
          onInput={event => edit({ placeNote: event.detail.value })} />
      </> : null}
      <Text className='journal-label'>个人感受（可选）</Text>
      <Textarea className='journal-textarea' value={draft.note} maxlength={1000}
        placeholder='这杯酒喝起来怎么样？' cursorSpacing={24}
        onInput={event => edit({ note: event.detail.value })} />
      <Text className='journal-label'>个人评分（可选）</Text>
      <Input className='journal-input' type='digit' value={draft.personalRating}
        placeholder='0–5 分，可留空，最多一位小数' cursorSpacing={24} maxlength={3}
        onInput={event => edit({ personalRating: event.detail.value })} />
    </View>
    {error ? <Text className='journal-error' role='alert'>{error}</Text> : null}
    {saved ? <Text className='journal-saved'>私人记录保存成功</Text> : null}
    <Button className='journal-main' disabled={submitting || saved}
      onClick={() => void submit()}>{submitting ? '保存中…' : '保存到私人日记'}</Button>
    <Button className='journal-secondary' disabled={submitting}
      onClick={() => onCancel(dirty)}>取消并返回</Button>
    <Text className='journal-hint'>照片上传与跨设备同步尚未接入；输入不会自动变成公开帖子。</Text>
  </View>
}
