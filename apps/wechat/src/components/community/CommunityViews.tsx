import React, { useEffect, useMemo, useState } from 'react'
import { Button, Image, Input, Picker, Text, Textarea, View } from '@tarojs/components'
import type { CommunityDraft, CommunityFields, CommunityPost } from '../../../../../packages/core/src/community'
import { CommunityError, CommunityRepository } from '../../../../../packages/core/src/community'
import './community.css'

export const TYPE_LABEL:Record<CommunityFields['type'],string>={
  general:'生活笔记',visit_note:'探店分享',cocktail_note:'调酒与品酒',promotion:'商业推广'
}
/** Deterministic two-column masonry distribution, independent card heights. */
export function splitCommunityColumns(posts:readonly CommunityPost[]):[CommunityPost[],CommunityPost[]]{
  const columns:[CommunityPost[],CommunityPost[]]=[[],[]]
  const height=[0,0]
  for(const post of posts){
    const cover=post.images[0]
    const estimate=(cover?Math.max(110,Math.min(350,210/(cover.aspectRatio||1))):62)+
      Math.min(80,post.title.length*3)+55
    const target=height[0]<=height[1]?0:1
    columns[target].push(post);height[target]+=estimate+16
  }
  return columns
}
export function CommunityPostCard({post,onOpen}:{
  post:CommunityPost;onOpen:(id:string)=>void
}){
  const cover=post.images[0]
  return <View className='community-card' onClick={()=>onOpen(post.id)}
    ariaLabel={'查看帖子：'+post.title}>
    {cover?<Image className='community-cover' mode='widthFix'
      src={cover.url} />:<View className='community-no-image'><Text>图文笔记</Text></View>}
    <View className='community-card-body'>
      {post.isSponsored?<Text className='community-sponsored'>广告 · {post.sponsorName}</Text>:null}
      <Text className='community-card-title'>{post.title}</Text>
      <Text className='community-card-author'>{post.authorDisplayName}</Text>
    </View>
  </View>
}
export function CommunityFeed({posts,loading,error,available,onRetry,onOpen,onCompose,onDrafts,onLoadMore,nextCursor}:{
  posts:CommunityPost[];loading:boolean;error:string|null;available:boolean
  onRetry:()=>void;onOpen:(id:string)=>void;onCompose:()=>void;onDrafts:()=>void
  nextCursor?:string|null;onLoadMore?:()=>void
}){
  const cols=useMemo(()=>splitCommunityColumns(posts),[posts])
  return <View className='community-page'>
    <View className='community-top'>
      <Text className='community-heading'>社区</Text>
      <Text className='community-sub'>审核通过的公开笔记 · 私人记录不会自动分享</Text>
      <View className='community-actions'>
        <Button className='community-cta' onClick={onCompose}>写图文草稿</Button>
        <Button className='community-secondary' onClick={onDrafts}>我的草稿</Button>
      </View>
    </View>
    {loading?<Text className='community-feedback'>正在读取已审核的内容…</Text>:
      error?<View className='community-feedback'><Text>内容加载失败：{error}</Text>
        <Button onClick={onRetry}>重试</Button></View>:
      posts.length===0?<View className='community-feedback'>
        <Text>{available?'暂无审核通过的公开笔记。':'公开社区审核接口尚未接入，暂不展示演示用户内容。'}</Text>
        {available?<Button onClick={onRetry}>重新加载</Button>:null}
      </View>:
      <View className='community-columns'>
        {cols.map((column,i)=><View className='community-column' key={i}>
          {column.map(post=><CommunityPostCard key={post.id} post={post} onOpen={onOpen}/>)}
        </View>)}
      </View>}
    {!loading&&!error&&nextCursor&&onLoadMore?
      <Button className='community-secondary' onClick={onLoadMore}>加载下一页审核内容</Button>:null}
    <Text className='community-disclaimer'>没有经过审核的帖子不会进入公开内容流；点赞、评论与图片上传尚未开放。</Text>
  </View>
}
export function CommunityPostDetail({post,loading,error,onBack,onRetry,onReport}:{
  post:CommunityPost|null;loading:boolean;error:string|null;onBack:()=>void
  onRetry:()=>void;onReport:()=>void
}){
  return <View className='community-page community-detail'>
    <Text className='community-back' onClick={onBack}>‹ 返回社区</Text>
    {loading?<Text className='community-feedback'>正在加载已审核帖子…</Text>:
      error?<View className='community-feedback'><Text>{error}</Text><Button onClick={onRetry}>重试</Button></View>:
      !post?<Text className='community-feedback'>帖子不存在、未通过审核或已撤回。</Text>:
      <View>
        {post.isSponsored?<Text className='community-sponsored'>广告 / 商业推广 · {post.sponsorName}</Text>:null}
        <Text className='community-detail-title'>{post.title}</Text>
        <Text className='community-card-author'>作者：{post.authorDisplayName}</Text>
        <Text className='community-meta'>{TYPE_LABEL[post.type]} · {post.createdAt.slice(0,10)}</Text>
        {post.images.map((image,i)=><View key={i} className='community-picture'>
          <Image src={image.url} mode='widthFix' className='community-full-image'/>
          <Text className='community-source'>图片来源：{image.source} · 已声明使用授权</Text>
        </View>)}
        <Text className='community-full-body'>{post.body}</Text>
        {post.topics.length?<Text className='community-topics'>{post.topics.map(t=>'#'+t).join('　')}</Text>:null}
        {post.barId?<Text className='community-meta'>关联酒吧编号：{post.barId}（以已核实的酒吧资料为准）</Text>:null}
        <Button className='community-secondary' onClick={onReport}>举报这篇内容</Button>
      </View>}
  </View>
}
const TYPED:CommunityFields['type'][]=['general','visit_note','cocktail_note','promotion']
export function CommunityEditor({draft,repo,venues,onSaved,onClose,onDiscard,allowSubmit=false}:{
  draft:CommunityDraft;repo:CommunityRepository;venues:readonly {id:number;name:string}[]
  onSaved:(next:CommunityDraft)=>void;onClose:()=>void;onDiscard:()=>void;allowSubmit?:boolean
}){
  const [current,setCurrent]=useState(draft)
  const [title,setTitle]=useState(draft.title)
  const [body,setBody]=useState(draft.body)
  const [type,setType]=useState<CommunityFields['type']>(draft.type)
  const [topics,setTopics]=useState(draft.topics.join('，'))
  const [barId,setBarId]=useState<number|null>(draft.barId)
  const [promoted,setPromoted]=useState(draft.isSponsored)
  const [sponsor,setSponsor]=useState(draft.sponsorName||'')
  const [preview,setPreview]=useState(false)
  const [saving,setSaving]=useState(false)
  const [message,setMessage]=useState('')
  useEffect(()=>{
    setCurrent(draft);setTitle(draft.title);setBody(draft.body);setType(draft.type)
    setTopics(draft.topics.join('，'));setBarId(draft.barId)
    setPromoted(draft.isSponsored);setSponsor(draft.sponsorName||'')
    setPreview(false);setMessage('')
  },[draft.id])
  const fields=():CommunityFields=>({
    title,body,type,barId,
    topics:topics.split(/[,，]/).map(x=>x.trim()).filter(Boolean),
    // No verified persistent image upload in PR-11; never accept wxfile:// paths.
    images:[],isSponsored:promoted||type==='promotion',
    sponsorName:(promoted||type==='promotion')?(sponsor.trim()||null):null
  })
  function save():CommunityDraft|null{
    try {
      const next=repo.saveDraft(current.id,fields(),current.revision)
      setCurrent(next);setMessage('草稿已保存到当前设备，尚未公开')
      onSaved(next);return next
    }catch(error){
      setMessage(error instanceof CommunityError?error.message:'设备保存失败，未确认保存')
      return null
    }
  }
  async function submit(){
    if(saving)return
    setSaving(true)
    try{
      const saved=save()
      if(!saved)return
      await repo.submitForReview(saved.id,saved.revision)
      setMessage('服务器已确认进入待审核；尚未公开')
    }catch(error){setMessage(error instanceof CommunityError?error.message:'提交失败，未确认送审')}
    finally{setSaving(false)}
  }
  const show=fields()
  if(repo.authorId()!==draft.authorUserId)
    return <View className='community-page'>
      <Text className='community-feedback'>账号已切换，上一账号的图文草稿不再显示或编辑。</Text>
    </View>
  return <View className='community-page community-editor'>
    <Text className='community-heading'>图文草稿</Text>
    <Text className='community-sub'>只保存在当前已验证账号的设备草稿区，不会自动投稿</Text>
    {preview?<View className='community-preview'>
      <Text className='community-section'>发布前预览 · 仅以下字段拟公开</Text>
      <Text className='community-detail-title'>{show.title||'（标题尚未填写）'}</Text>
      {show.isSponsored?<Text className='community-sponsored'>广告 · {show.sponsorName||'尚未填写推广方'}</Text>:null}
      <Text className='community-full-body'>{show.body||'（正文尚未填写）'}</Text>
      {show.barId?<Text className='community-meta'>关联酒吧 ID：{show.barId}</Text>:null}
      {show.topics.length?<Text className='community-topics'>{show.topics.join('、')}</Text>:null}
      <Text className='community-source'>不包含私人备注、评分、精确位置、原始照片、私人记录 ID 或隐藏关联。</Text>
      <Text className='community-source'>未来提交须经服务端身份验证和审核通过，才能公开展示。</Text>
      <Button onClick={()=>setPreview(false)}>返回编辑</Button>
    </View>:<View>
      <Text className='community-section'>标题（最多 80 字）</Text>
      <Input className='community-field' maxlength={80} value={title} onInput={e=>setTitle(e.detail.value)}
        placeholder='为分享拟一个标题'/>
      <Text className='community-section'>正文（最多 5000 字）</Text>
      <Textarea className='community-textarea' maxlength={5000} value={body} onInput={e=>setBody(e.detail.value)}
        placeholder='由你主动填写准备公开的内容'/>
      <Text className='community-section'>内容类型</Text>
      <Picker mode='selector' range={TYPED.map(t=>TYPE_LABEL[t])}
        value={TYPED.indexOf(type)} onChange={e=>setType(TYPED[Number(e.detail.value)])}>
        <View className='community-field'>{TYPE_LABEL[type]}　⌄</View>
      </Picker>
      <Text className='community-section'>关联现有酒吧（可选）</Text>
      <Picker mode='selector' range={['不关联酒吧',...venues.map(v=>v.name)]}
        value={Math.max(0,venues.findIndex(v=>v.id===barId)+1)}
        onChange={e=>{const i=Number(e.detail.value);setBarId(i===0?null:venues[i-1].id)}}>
        <View className='community-field'>{venues.find(v=>v.id===barId)?.name||'不关联酒吧'}　⌄</View>
      </Picker>
      <Text className='community-section'>话题（最多 5 个，逗号分隔）</Text>
      <Input className='community-field' value={topics} onInput={e=>setTopics(e.detail.value)}
        placeholder='例如：调酒，探店'/>
      <Text className='community-section'>是否包含商业推广</Text>
      <View className='community-choice' onClick={()=>setPromoted(!promoted)}>
        <Text>{promoted||type==='promotion'?'已声明商业推广（点击切换）':'非商业推广（点击声明）'}</Text>
      </View>
      {promoted||type==='promotion'?<Input className='community-field' value={sponsor}
        placeholder='赞助方或合作方名称（必填）' maxlength={100}
        onInput={e=>setSponsor(e.detail.value)}/>:null}
      <Text className='community-source'>图片上传服务尚未完成，本轮不会使用临时图片路径进行公开发布。</Text>
    </View>}
    {message?<Text className='community-message'>{message}</Text>:null}
    <View className='community-actions'>
      <Button className='community-cta' onClick={()=>{save()}}>保存本机草稿</Button>
      <Button className='community-secondary' onClick={()=>setPreview(!preview)}>
        {preview?'返回编辑':'预览拟公开内容'}
      </Button>
    </View>
    <Text className='community-source'>正式提交将面向公众，需服务端实名认证、内容审核及图片授权。审核通过前不可见。</Text>
    <Button className='community-submit' disabled={!allowSubmit||saving}
      onClick={()=>{void submit()}}>提交审核（{allowSubmit?'待服务端确认':'尚未开放'}）</Button>
    <Button className='community-secondary' onClick={onClose}>取消编辑（保留草稿）</Button>
    <Button className='community-danger' onClick={onDiscard}>丢弃本机草稿</Button>
  </View>
}
