import React, { useEffect, useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import DrinkEditor from '../../components/journal/DrinkEditor'
import { privateCloud, privateMirrorRepository } from '../../services/private-cloud'
import { CloudJournalStatus } from '../../components/journal/CloudJournalStatus'
import { authService } from '../../services/wechat-auth'
import { useAuthState } from '../../utils/use-auth-state'
import { getVenues } from '../../utils/venues'
import { knowledgeOptions } from '../../services/cocktail-knowledge'

// The production binding stays fail-closed. No client-supplied identity is accepted.
const repository = privateMirrorRepository
export default function JournalDrinkPage() {
  const auth = useAuthState(authService)
  useDidShow(() => { void authService.checkSession().then(()=>{
    if(authService.verifiedIdentity())void privateCloud.sync()
  }) })
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
    {auth.status==='authenticated'?<CloudJournalStatus cloud={privateCloud}/>:null}
    <DrinkEditor key={(auth.account?.id || 'guest') + auth.epoch} repository={repository}
      authenticated={auth.status === 'authenticated' && !!authService.verifiedIdentity()}
      saveStatusLabel='已保存到当前设备，待同步' venues={getVenues().map(bar => ({
      id: bar.id, name: bar.name
    }))} catalog={knowledgeOptions} initialVisitSessionId={incoming} onDirtyChange={setDirty}
      onCancel={value => void leave(value)}
      onSaved={() => {
        void privateCloud.sync()
        setDirty(false)
        try { Taro.disableAlertBeforeUnload() } catch (_) {}
        void Taro.showToast({ title: '已存本机，待同步', icon: 'success' }).then(() => Taro.navigateBack())
      }} />
    <Text style={{ display: 'none' }}>云端状态取决于真实服务端确认</Text>
  </View>
}
