import React, { useState } from 'react'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import type { CommunityPost } from '../../../../../packages/core/src/community'
import { CommunityPostDetail } from '../../components/community/CommunityViews'
import { communityRepository } from '../../services/community'
export default function Page(){
  const router=useRouter()
  const id=typeof router.params.id==='string'?router.params.id:''
  const [post,setPost]=useState<CommunityPost|null>(null)
  const [error,setError]=useState<string|null>(null)
  const [loading,setLoading]=useState(true)
  async function reload(){
    setLoading(true);setError(null)
    try{setPost(await communityRepository.getPublic(id))}
    catch{setPost(null);setError('公开帖子暂不可访问')}
    finally{setLoading(false)}
  }
  useDidShow(()=>{void reload()})
  return <CommunityPostDetail post={post} loading={loading} error={error}
    onRetry={()=>void reload()} onBack={()=>void Taro.navigateBack()}
    onReport={()=>void Taro.showModal({title:'举报内容',
      content:'举报和审核服务尚未上线，本次没有提交举报。请勿在此输入个人敏感信息。',
      showCancel:false})}/>
}
