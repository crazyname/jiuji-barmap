// PR-05 Taro page wiring; business/identity enforcement remains in PR-03's repository.
import React, { useState } from 'react'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { PersonalJournalList, PersonalJournalDetail } from '../../components/journal/PersonalJournalViews'
import { createLockedWeChatJournalRepository } from '../../services/private-journal'
import { getVenues } from '../../utils/venues'

// Deliberately locked until a future server-verified account session exists.
const repository = createLockedWeChatJournalRepository()
function openDrink(id: string): void {
  void Taro.navigateTo({ url: '/pages/journal-drink-detail/index?id=' + encodeURIComponent(id) })
}
function openVisit(id: string): void {
  void Taro.navigateTo({ url: '/pages/journal-visit-detail/index?id=' + encodeURIComponent(id) })
}
function back(): void { void Taro.navigateBack() }
function knownBars() { return getVenues().map(bar => ({ id: bar.id, name: bar.name })) }

export function JournalListPage({ mode }: { mode: 'timeline' | 'footprints' | 'cocktails' }) {
  const [refreshVersion, setRefreshVersion] = useState(0)
  useDidShow(() => setRefreshVersion(n => n + 1))
  return <PersonalJournalList mode={mode} repository={repository}
    refreshVersion={refreshVersion} bars={knownBars()}
    onOpenDrink={openDrink} onOpenVisit={openVisit} onBack={back} />
}
export function JournalDetailPage({ mode }: { mode: 'drink' | 'visit' }) {
  const router = useRouter()
  const recordId = typeof router.params.id === 'string' ? router.params.id : ''
  const [refreshVersion, setRefreshVersion] = useState(0)
  useDidShow(() => setRefreshVersion(n => n + 1))
  return <PersonalJournalDetail mode={mode} recordId={recordId}
    repository={repository} refreshVersion={refreshVersion} bars={knownBars()}
    onOpenDrink={openDrink} onOpenVisit={openVisit} onBack={back}
    confirm={async (title, content) => {
      const response = await Taro.showModal({ title, content, confirmText: '确认', cancelText: '取消' })
      return response.confirm
    }} />
}
