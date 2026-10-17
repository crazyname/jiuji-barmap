import React, { useRef, useState } from 'react'
import { Button, Input, Picker, Text, Textarea, View } from '@tarojs/components'
import type { VisitSession } from '../../../../../packages/core/src/models'
import type { PrivateJournalRepository } from '../../../../../packages/core/src/journal-contracts'
import { buildVisitInput, createSubmitGate, createVisitDraft, formErrorMessage,
  newClientMutationId, saveVisit } from '../../services/journal-editor'
import type { VenueOption, VisitDraft } from '../../services/journal-editor'
import './index.css'

export interface VisitEditorProps {
  repository: PrivateJournalRepository
  authenticated: boolean
  venues: readonly VenueOption[]
  initialDate?: Date
  mutationIdFactory?: () => string
  onCancel: (dirty: boolean) => void
  onDirtyChange?: (dirty: boolean) => void
  onSaved: (visit: VisitSession) => void
}

export default function VisitEditor({ repository, authenticated, venues,
  initialDate, mutationIdFactory = newClientMutationId, onCancel,
  onDirtyChange, onSaved }: VisitEditorProps) {
  const [draft, setDraft] = useState<VisitDraft>(() => createVisitDraft(initialDate))
  const [dirty, setDirty] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const gate = useRef(createSubmitGate<VisitSession>())
  const mutation = useRef<string | null>(null)
  function edit(patch: Partial<VisitDraft>): void {
    if (submitting || saved) return
    if (mutation.current !== null) mutation.current = mutationIdFactory()
    gate.current.invalidate()
    setDraft(previous => ({ ...previous, ...patch }))
    setDirty(true)
    onDirtyChange?.(true)
    setError('')
  }
  async function submit(): Promise<void> {
    if (gate.current.isBusy() || gate.current.isComplete()) return
    try { buildVisitInput(draft) } catch (failure) {
      setError(formErrorMessage(failure))
      return
    }
    if (mutation.current === null) mutation.current = mutationIdFactory()
    const currentId = mutation.current
    setSubmitting(true)
    setError('')
    try {
      const savedVisit = await gate.current.submit(() => saveVisit(repository, draft, currentId))
      if (savedVisit) {
        setSaved(true)
        setDirty(false)
        onDirtyChange?.(false)
        onSaved(savedVisit)
      }
    } catch (failure) {
      setError(formErrorMessage(failure))
    } finally {
      setSubmitting(false)
    }
  }
  const selectedBar = venues.findIndex(item => item.id === draft.barId) + 1
  return <View className='journal-page'>
    <Text className='journal-heading'>记一次探店</Text>
    <Text className='journal-muted'>一次探店可以先留空酒款，日后主动关联多杯饮用记录。</Text>
    {!authenticated ? <View className='journal-auth' role='alert'>
      <Text className='journal-auth-title'>需要登录才能保存</Text>
      <Text>目前尚未接入正式认证。填写的内容仅保留在当前页面，不代表已经保存。</Text>
    </View> : null}
    <View className='journal-card'>
      <Text className='journal-label'>酒吧（可选）</Text>
      <Picker mode='selector' range={['不选择酒吧', ...venues.map(item => item.name)]}
        value={selectedBar} onChange={event => edit({ barId: venues[Number(event.detail.value) - 1]?.id || null })}>
        <View className='journal-picker'>{selectedBar ? venues[selectedBar - 1].name : '选择已有酒吧（可跳过）'}　⌄</View>
      </Picker>
      <Text className='journal-label'>自定义地点（可选）</Text>
      <Input className='journal-input' value={draft.placeLabel} maxlength={120}
        placeholder='例如：朋友家、尚未收录的店' cursorSpacing={24}
        onInput={event => edit({ placeLabel: event.detail.value })} />
      <View className='journal-datetime'>
        <View className='journal-date-field'><Text className='journal-label'>到访日期</Text>
          <Picker mode='date' value={draft.date} onChange={event => edit({ date: event.detail.value })}>
            <View className='journal-picker'>{draft.date}　⌄</View>
          </Picker></View>
        <View className='journal-date-field'><Text className='journal-label'>到访时间</Text>
          <Picker mode='time' value={draft.time} onChange={event => edit({ time: event.detail.value })}>
            <View className='journal-picker'>{draft.time}　⌄</View>
          </Picker></View>
      </View>
      <Text className='journal-label'>探店备注（可选）</Text>
      <Textarea className='journal-textarea' value={draft.note} maxlength={1000}
        placeholder='记录环境、同行朋友或其他感受' cursorSpacing={24}
        onInput={event => edit({ note: event.detail.value })} />
    </View>
    {error ? <Text className='journal-error'>{error}</Text> : null}
    {saved ? <Text className='journal-saved'>私人探店经历已保存</Text> : null}
    <Button className='journal-main' disabled={submitting || saved}
      onClick={() => void submit()}>{submitting ? '保存中…' : '保存这次私人探店'}</Button>
    <Button className='journal-secondary' disabled={submitting}
      onClick={() => onCancel(dirty)}>取消并返回</Button>
    <Text className='journal-hint'>不填写酒吧、不添加酒款也可以创建探店；不根据日期自动合并经历。</Text>
  </View>
}
