import React, { useState } from 'react'
import { Button, Input, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import '../shared.css'
const KEY='jiuji.react.profile'
export default function MinePage() {
 const [name,setName]=useState('酒迹用户');const [bio,setBio]=useState('')
 useDidShow(()=>{const p=Taro.getStorageSync(KEY)||{};setName(p.name||'酒迹用户');setBio(p.bio||'')})
 return <View className='page'><Text className='kicker'>JIUJI / PROFILE</Text><Text className='title'>我的</Text>
 <Text className='muted'>个人信息</Text>
 <Input className='field' value={name} onInput={e=>setName(e.detail.value)}/>
 <Input className='field' value={bio} placeholder='个人简介' onInput={e=>setBio(e.detail.value)}/>
 <Button onClick={()=>{Taro.setStorageSync(KEY,{name,bio});Taro.showToast({title:'已保存',icon:'success'})}}>保存个人资料</Button>
 <View className='row'><Text>收藏 · 点赞 · 浏览记录 · 外观设置</Text></View></View>
}
