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
  const [nextCursor,setNextCursor]=useState<string|null>(null)
  const [error,setError]=useState<string|null>(null)
  // This read-only surface never calls legacy Sites v1 mutation or local posts.
  async function reload(){
    setLoading(true);setError(null)
    try{
      const data=await communityRepository.listPublic()
      setPosts(data.posts)
      setNextCursor(data.nextCursor) // Only a real trusted source can supply a cursor.
    }catch{setError('审核内容源暂不可访问');setPosts([]);setNextCursor(null)}
    finally{setLoading(false)}
  }
  async function more(){
    if(!nextCursor||loading)return
    setLoading(true)
    try{
      const page=await communityRepository.listPublic(nextCursor)
      setPosts(old=>[...old,...page.posts.filter(x=>!old.some(p=>p.id===x.id))])
      setNextCursor(page.nextCursor)
    }catch{setError('后续页面读取失败；已加载的帖子保留')}
    finally{setLoading(false)}
  }
  useDidShow(()=>{void reload()})
  const goEditor=()=>void Taro.navigateTo({url:'/pages/community-editor/index'})
  return <CommunityFeed posts={posts} loading={loading} error={error}
    available={communityRepository.publicAvailable()}
    nextCursor={nextCursor} onLoadMore={()=>void more()}
    onRetry={()=>{void reload()}}
    onOpen={id=>void Taro.navigateTo({url:'/pages/community-detail/index?id='+encodeURIComponent(id)})}
    onCompose={goEditor}
    onDrafts={()=>void Taro.navigateTo({url:'/pages/community-editor/index?list=1'})}/>
}
