import React, { useState } from 'react'
import { Button, Input, Picker, Text, Textarea, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import '../shared.css'
import sitesData from '../../data/sites-test.json'
import { publishedRows, queueRemoteUpsert, refreshSites } from '../../services/sync'
type Post = {id:string;title:string;body:string;type:'visit'|'tasting'|'promo';sponsor?:string;sponsorName?:string}
const demoPosts = sitesData.posts as Post[]
const KEY='jiuji.react.posts'; const labels=['探店','品酒','商业推广']
export default function CommunityPage() {
 const [rows,setRows]=useState<Post[]>([]);const [remote,setRemote]=useState<Post[]>([]);const [title,setTitle]=useState('');const [body,setBody]=useState('')
 const [type,setType]=useState(0);const [sponsor,setSponsor]=useState('')
 useDidShow(()=>{
 setRows(Taro.getStorageSync(KEY)||[])
 setRemote(publishedRows<Post>('posts'))
 void refreshSites().then(()=>setRemote(publishedRows<Post>('posts')))
})
 const save=()=>{if(!title.trim()||!body.trim()||(type===2&&!sponsor.trim()))return Taro.showToast({title:'请补全内容及推广方',icon:'none'})
 const post:Post={id:String(Date.now()),title,body,type:(['visit','tasting','promo'] as const)[type],sponsor}
 const next=[post,...rows];Taro.setStorageSync(KEY,next);setRows(next)
 queueRemoteUpsert('posts',{id:post.id,title:post.title,body:post.body,type:post.type,
   visibility:'private',isSponsored:post.type==='promo',
   sponsorName:post.type==='promo'?(post.sponsor||''):null,barId:null})
 void refreshSites().then(()=>setRemote(publishedRows<Post>('posts')))
 setTitle('');setBody('')}
 const copy=(p:Post)=>Taro.setClipboardData({data:(p.type==='promo'?'【广告/商业推广】'+(p.sponsor||p.sponsorName||'')+'\n':'')+
 p.title+'\n'+p.body+'\n#酒迹 #JiujiBarMap'})
 return <View className='page'><Text className='title'>社区</Text>
 <Picker mode='selector' range={labels} value={type} onChange={e=>setType(Number(e.detail.value))}><View className='field'>{labels[type]}　⌄</View></Picker>
 <Input className='field' placeholder='标题' value={title} onInput={e=>setTitle(e.detail.value)}/>
 <Textarea className='field area' placeholder='写下体验' value={body} onInput={e=>setBody(e.detail.value)}/>
 {type===2?<Input className='field' placeholder='广告主/合作商户' value={sponsor} onInput={e=>setSponsor(e.detail.value)}/>:null}
 <Button onClick={save}>保存笔记</Button>
 {[...rows, ...(remote.length ? remote : demoPosts).filter(d => !rows.some(p => p.id === d.id))].map(p=><View className='row' key={p.id} onClick={()=>copy(p)}><Text>{p.type==='promo'?'【推广】':''}{p.title}{p.id.startsWith('dev-') ? ' · 测试数据' : ''}</Text><Text className='muted'>复制小红书文案 ↗</Text></View>)}</View>
}
