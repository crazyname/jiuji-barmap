import React, { useEffect, useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import DrinkEditor from '../../components/journal/DrinkEditor'
import { createSessionJournalRepository } from '../../services/private-journal'
import { authService } from '../../services/wechat-auth'
import { useAuthState } from '../../utils/use-auth-state'
import { getVenues } from '../../utils/venues'

// The production binding stays fail-closed. No client-supplied identity is accepted.
const repository = createSessionJournalRepository(authService)
export default function JournalDrinkPage() {
  const auth = useAuthState(authService)
  useDidShow(() => { void authService.checkSession() })
  const router = useRouter()
  const [dirty, setDirty] = useState(false)
  const incoming = typeof router.params.visitId === 'string' ? router.params.visitId : null
  useEffect(() => {
    try {
      if (dirty) Taro.enableAlertBeforeUnload({ message: '当前输入尚未保存，确定离开吗？' })
      else Taro.disableAlertBeforeUnload()
    } catch (_) { /* Device support is checked before release. */ }
    return () => { try { Taro.disableAlertBeforeUnload() } catch (_) {} }
  }, [dirty])
  async function leave(hasEdits: boolean): Promise<void> {
    if (hasEdits) {
      const answer = await Taro.showModal({
        title: '尚未保存', content: '离开后本页填写内容可能丢失，确定返回吗？'
      })
      if (!answer.confirm) return
    }
    try { Taro.disableAlertBeforeUnload() } catch (_) {}
    await Taro.navigateBack()
  }
  return <View>
    <DrinkEditor key={(auth.account?.id || 'guest') + auth.epoch} repository={repository}
      authenticated={auth.status === 'authenticated' && !!authService.verifiedIdentity()} venues={getVenues().map(bar => ({
      id: bar.id, name: bar.name
    }))} catalog={[]} initialVisitSessionId={incoming} onDirtyChange={setDirty}
      onCancel={value => void leave(value)}
      onSaved={() => {
        setDirty(false)
        try { Taro.disableAlertBeforeUnload() } catch (_) {}
        void Taro.showToast({ title: '已保存到私人日记', icon: 'success' }).then(() => Taro.navigateBack())
      }} />
    <Text style={{ display: 'none' }}>正式微信账号尚未接入</Text>
  </View>
}
