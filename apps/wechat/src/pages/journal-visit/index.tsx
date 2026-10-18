import React, { useEffect, useState } from 'react'
import { Button, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import VisitEditor from '../../components/journal/VisitEditor'
import { privateCloud, privateMirrorRepository } from '../../services/private-cloud'
import { CloudJournalStatus } from '../../components/journal/CloudJournalStatus'
import { authService } from '../../services/wechat-auth'
import { useAuthState } from '../../utils/use-auth-state'
import { getVenues } from '../../utils/venues'

// No fake verified principal: successful creation is reachable only in repository-injected tests.
const repository = privateMirrorRepository
export default function JournalVisitPage() {
  const auth = useAuthState(authService)
  useDidShow(() => { void authService.checkSession().then(()=>{
    if(authService.verifiedIdentity())void privateCloud.sync()
  }) })
  const [dirty, setDirty] = useState(false)
  const [createdVisitId, setCreatedVisitId] = useState<string | null>(null)
  useEffect(() => { if(auth.status!=='authenticated')setCreatedVisitId(null) },[auth.status])
  useEffect(() => {
    try {
      if (dirty) Taro.enableAlertBeforeUnload({ message: '本次探店尚未保存，确定离开吗？' })
      else Taro.disableAlertBeforeUnload()
    } catch (_) {}
    return () => { try { Taro.disableAlertBeforeUnload() } catch (_) {} }
  }, [dirty])
  async function leave(hasEdits: boolean): Promise<void> {
    if (hasEdits) {
      const answer = await Taro.showModal({
        title: '尚未保存', content: '离开后本页输入内容可能丢失，确定返回吗？'
      })
      if (!answer.confirm) return
    }
    try { Taro.disableAlertBeforeUnload() } catch (_) {}
    await Taro.navigateBack()
  }
  return <View>
    {auth.status==='authenticated'?<CloudJournalStatus cloud={privateCloud}/>:null}
    <VisitEditor key={(auth.account?.id || 'guest') + auth.epoch} repository={repository}
      authenticated={auth.status === 'authenticated' && !!authService.verifiedIdentity()}
      saveStatusLabel='已保存到当前设备，待同步' venues={getVenues().map(bar => ({
      id: bar.id, name: bar.name
    }))} onDirtyChange={setDirty} onCancel={value => void leave(value)}
      onSaved={visit => { setDirty(false); setCreatedVisitId(visit.id); void privateCloud.sync() }} />
    {createdVisitId ? <View className='journal-followup'>
      <Text>本次探店已保存到当前设备，待同步；可继续关联多杯饮用记录。</Text>
      <Button onClick={() => void Taro.navigateTo({
        url: '/pages/journal-drink/index?visitId=' + encodeURIComponent(createdVisitId)
      })}>继续记一杯酒</Button>
      <Button onClick={() => void leave(false)}>完成并返回</Button>
    </View> : null}
  </View>
}
