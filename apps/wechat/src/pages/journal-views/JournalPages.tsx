// PR-05 Taro page wiring; business/identity enforcement remains in PR-03's repository.
import React, { useState } from 'react'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { PersonalJournalList, PersonalJournalDetail } from '../../components/journal/PersonalJournalViews'
import { privateCloud, privateMirrorRepository } from '../../services/private-cloud'
import { CloudJournalStatus, useCloudVersion, cloudRecordLabel } from '../../components/journal/CloudJournalStatus'
import { authService } from '../../services/wechat-auth'
import { useAuthState } from '../../utils/use-auth-state'
import { PrivateLockedView } from '../../components/auth/PrivateLockedView'
import { getVenues } from '../../utils/venues'
import { communityRepository } from '../../services/community'
import type { DrinkEntry, VisitSession } from '../../../../../packages/core/src/models'

// Deliberately locked until a future server-verified account session exists.
const repository = privateMirrorRepository
function openDrink(id: string): void {
  void Taro.navigateTo({ url: '/pages/journal-drink-detail/index?id=' + encodeURIComponent(id) })
}
function openVisit(id: string): void {
  void Taro.navigateTo({ url: '/pages/journal-visit-detail/index?id=' + encodeURIComponent(id) })
}
function back(): void { void Taro.navigateBack() }
function openShareDraft(kind:'drink'|'visit',record:DrinkEntry|VisitSession):void {
  // An explicit tap is required. Conversion copies NONE of the private
  // note/rating/photo/date/location/source ID fields into community JSON.
  if(!authService.verifiedIdentity())return
  try {
    const draft=kind==='drink'
      ?communityRepository.fromDrink(record as DrinkEntry)
      :communityRepository.fromVisit(record as VisitSession)
    void Taro.navigateTo({url:'/pages/community-editor/index?id='+encodeURIComponent(draft.id)})
  }catch {
    void Taro.showToast({title:'设备草稿保存失败，私人记录未更改',icon:'none'})
  }
}
function knownBars() { return getVenues().map(bar => ({ id: bar.id, name: bar.name })) }

export function JournalListPage({ mode }: { mode: 'timeline' | 'footprints' | 'cocktails' }) {
  const [refreshVersion, setRefreshVersion] = useState(0)
  const auth = useAuthState(authService)
  const version=useCloudVersion(privateCloud, auth.status==='authenticated')
  useDidShow(() => {void authService.checkSession().then(()=>{
    if(authService.verifiedIdentity())void privateCloud.sync()
    setRefreshVersion(n=>n+1)
  })})
  if (auth.status !== 'authenticated' || !authService.verifiedIdentity())
    return <PrivateLockedView state={auth} onBack={back} />
  return <React.Fragment key={auth.account!.id+'-'+auth.epoch}>
    <CloudJournalStatus cloud={privateCloud}/>
    <PersonalJournalList mode={mode} repository={repository}
      refreshVersion={refreshVersion+version} bars={knownBars()}
      syncLabel={(kind,id)=>cloudRecordLabel(privateCloud,kind,id)}
      onOpenDrink={openDrink} onOpenVisit={openVisit} onBack={back} />
  </React.Fragment>
}
export function JournalDetailPage({ mode }: { mode: 'drink' | 'visit' }) {
  const router = useRouter()
  const recordId = typeof router.params.id === 'string' ? router.params.id : ''
  const [refreshVersion, setRefreshVersion] = useState(0)
  const auth = useAuthState(authService)
  const version=useCloudVersion(privateCloud, auth.status==='authenticated')
  useDidShow(() => {void authService.checkSession().then(()=>{
    if(authService.verifiedIdentity())void privateCloud.sync()
    setRefreshVersion(n=>n+1)
  })})
  if (auth.status !== 'authenticated' || !authService.verifiedIdentity())
    return <PrivateLockedView state={auth} onBack={back} />
  return <React.Fragment key={auth.account!.id+'-'+auth.epoch}>
    <CloudJournalStatus cloud={privateCloud}/>
    <PersonalJournalDetail mode={mode} recordId={recordId}
      repository={repository} refreshVersion={refreshVersion+version} bars={knownBars()}
      syncLabel={(kind,id)=>cloudRecordLabel(privateCloud,kind,id)}
      onChanged={()=>void privateCloud.sync()}
      onShareDrink={drink=>openShareDraft('drink',drink)}
      onShareVisit={visit=>openShareDraft('visit',visit)}
      onOpenDrink={openDrink} onOpenVisit={openVisit} onBack={back}
    confirm={async (title, content) => {
      const response = await Taro.showModal({ title, content, confirmText: '确认', cancelText: '取消' })
      return response.confirm
    }} />
  </React.Fragment>
}
