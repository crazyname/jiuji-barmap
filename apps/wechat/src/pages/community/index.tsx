import React, { useState } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { useSyncCustomTabBar } from '../../utils/custom-tabbar'
import type { CommunityPost } from '../../../../../packages/core/src/community'
import { CommunityFeed } from '../../components/community/CommunityViews'
import { communityRepository } from '../../services/community'

export default function CommunityPage(){
  useSyncCustomTabBar(2)
  const [posts,setPosts]=useState<CommunityPost[]>([])
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState<string|null>(null)
  // This read-only surface never calls legacy Sites v1 mutation or local posts.
  async function reload(){
    setLoading(true);setError(null)
    try{
      const data=await communityRepository.listPublic()
      setPosts(data.posts) // Do not claim infinite pagination without a live source.
    }catch{setError('审核内容源暂不可访问');setPosts([])}
    finally{setLoading(false)}
  }
  useDidShow(()=>{void reload()})
  const goEditor=()=>void Taro.navigateTo({url:'/pages/community-editor/index'})
  return <CommunityFeed posts={posts} loading={loading} error={error}
    available={communityRepository.publicAvailable()}
    onRetry={()=>{void reload()}}
    onOpen={id=>void Taro.navigateTo({url:'/pages/community-detail/index?id='+encodeURIComponent(id)})}
    onCompose={goEditor}
    onDrafts={()=>void Taro.navigateTo({url:'/pages/community-editor/index?list=1'})}/>
}
