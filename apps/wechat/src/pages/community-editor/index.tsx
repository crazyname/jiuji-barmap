import React, { useState } from 'react'
import { Button, Text, View } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import type { CommunityDraft } from '../../../../../packages/core/src/community'
import { CommunityEditor } from '../../components/community/CommunityViews'
import { authService } from '../../services/wechat-auth'
import { useAuthState } from '../../utils/use-auth-state'
import { communityRepository, COMMUNITY_REVIEW_API_ENABLED } from '../../services/community'
import { getVenues } from '../../utils/venues'
import '../shared.css'
export default function Page(){
  const router=useRouter(),auth=useAuthState(authService)
  const [draft,setDraft]=useState<CommunityDraft|null>(null)
  const [list,setList]=useState<CommunityDraft[]>([])
  const [error,setError]=useState('')
  const [listing,setListing]=useState(router.params.list==='1')
  const id=typeof router.params.id==='string'?router.params.id:''
  function load(){
    if(!authService.verifiedIdentity()){setDraft(null);setList([]);return}
    try{
      setList(communityRepository.listDrafts())
      if(id) {
        const row=communityRepository.getDraft(id)
        if(!row)setError('这份草稿不存在或不属于当前已验证账号')
        setDraft(row)
      }
    }catch{setDraft(null);setError('设备草稿读取失败，原始内容已保留')}
  }
  useDidShow(()=>{void authService.checkSession().then(load)})
  // Do not display a retained React draft after A -> B account replacement.
  const currentUser=authService.verifiedIdentity()?.userId||null
  if(draft && currentUser && draft.authorUserId!==currentUser)
    return <View className='community-page'>
      <Text className='community-feedback'>账户已切换；上一账号草稿已卸载，请返回重新进入。</Text>
      <Button onClick={()=>void Taro.navigateBack()}>返回</Button>
    </View>
  if(auth.status!=='authenticated'||!authService.verifiedIdentity())
    return <View className='community-page'><Text className='community-heading'>图文创作</Text>
      <Text className='community-feedback'>未认证，无法创建或查看账号草稿。正式微信登录尚未开放，游客只可浏览经审核的公开内容。</Text>
      <Button onClick={()=>void Taro.navigateBack()}>返回</Button>
    </View>
  function create(){
    try{
      const next=communityRepository.newDraft()
      setDraft(next);setListing(false);setError('')
    }catch{setError('本机草稿保存失败，请检查设备存储')}
  }
  async function discard(){
    if(!draft)return
    const answer=await Taro.showModal({title:'丢弃本机草稿？',
      content:'仅删除当前已验证账户在本机的这份社区草稿；不会修改私人日记、旧帖子或云端内容。'})
    if(!answer.confirm)return
    try{communityRepository.discardDraft(draft.id);setDraft(null)
      setList(communityRepository.listDrafts());setListing(true)}
    catch{setError('草稿未删除，原始数据已保留')}
  }
  return <View>
    {draft?<CommunityEditor key={draft.id} draft={draft} repo={communityRepository}
      venues={getVenues().filter(v=>v.status!=='closed').map(v=>({id:v.id,name:v.name}))}
      allowSubmit={COMMUNITY_REVIEW_API_ENABLED}
      onSaved={next=>{setDraft(next);setList(communityRepository.listDrafts())}}
      onClose={()=>{setDraft(null);setListing(true);setList(communityRepository.listDrafts())}}
      onDiscard={()=>void discard()}/>:
    <View className='community-page'>
      <Text className='community-heading'>{listing?'我的社区草稿':'创建图文草稿'}</Text>
      <Text className='community-sub'>这些草稿只保存在当前验证账号的设备空间，不会自动进入公开社区。</Text>
      {error?<Text className='community-message'>{error}</Text>:null}
      <Button className='community-cta' onClick={create}>创建新草稿</Button>
      {list.map(item=><View className='row' key={item.id} onClick={()=>{setDraft(item);setError('')}}>
        <Text>{item.title||'未命名草稿'}</Text>
        <Text className='muted'>{item.status==='pending_review'?'待审核':'本机草稿'}　›</Text>
      </View>)}
      {!list.length?<Text className='community-feedback'>当前账号没有新社区草稿。旧设备的本机帖子未被自动归属或公开。</Text>:null}
      <Button className='community-secondary' onClick={()=>void Taro.navigateBack()}>返回</Button>
    </View>}
  </View>
}
