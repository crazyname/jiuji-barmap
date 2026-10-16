import React, { useState } from 'react'
import { Button, Input, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import '../shared.css'
import { refreshSites, syncEnabled, syncState } from '../../services/sync'
const KEY='jiuji.react.profile'
export default function MinePage() {
 const [name,setName]=useState('酒迹用户');const [bio,setBio]=useState('')
 const [syncMessage,setSyncMessage]=useState('')
 useDidShow(()=>{
 const p=Taro.getStorageSync(KEY)||{}
 setName(p.name||'酒迹用户');setBio(p.bio||'')
 setSyncMessage('待上传 ' + syncState().queued + ' 条')
 void refreshSites().then(x=>setSyncMessage(x.message))
})
 return <View className='page'><Text className='kicker'>JIUJI / PROFILE</Text><Text className='title'>我的</Text>
 <Text className='muted'>个人信息</Text>
 <Input className='field' value={name} onInput={e=>setName(e.detail.value)}/>
 <Input className='field' value={bio} placeholder='个人简介' onInput={e=>setBio(e.detail.value)}/>
 <Button onClick={()=>{Taro.setStorageSync(KEY,{name,bio});Taro.showToast({title:'已保存',icon:'success'})}}>保存个人资料</Button>
 <View className='row'><Text>收藏 · 点赞 · 浏览记录 · 外观设置</Text></View>
 <View className='row'><Text>跨端同步</Text><Text className='muted'>{syncEnabled?'已配置接口':'等待网站接口'}</Text></View>
 <View className='row'><Text>{syncMessage || '待配置'}</Text></View>
 <Button onClick={()=>void refreshSites().then(x=>setSyncMessage(x.message))}>刷新测试数据</Button></View>
}
