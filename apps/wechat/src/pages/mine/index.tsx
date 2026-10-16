import React, { useState } from 'react'
import { Button, Input, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import '../shared.css'
import { clearAuthenticatedSession, hasAuthenticatedSession, refreshSites, saveAuthenticatedSession, syncEnabled, syncState } from '../../services/sync'
import { ENABLE_DEVICE_TOKEN_TESTING } from '../../config/sync'
const KEY='jiuji.react.profile'
export default function MinePage() {
 const [name,setName]=useState('酒迹用户');const [bio,setBio]=useState('')
 const [syncMessage,setSyncMessage]=useState('')
 const [testToken,setTestToken]=useState('')
 const [linked,setLinked]=useState(false)
 const [syncErrors,setSyncErrors]=useState(0)
 useDidShow(()=>{
 const p=Taro.getStorageSync(KEY)||{}
 setName(p.name||'酒迹用户');setBio(p.bio||'')
 setSyncMessage('待上传 ' + syncState().queued + ' 条')
 setLinked(hasAuthenticatedSession())
 setSyncErrors(syncState().conflicts)
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
 <Button onClick={()=>void refreshSites().then(x=>{setSyncMessage(x.message);setSyncErrors(syncState().conflicts)})}>刷新测试数据</Button>
 {syncErrors ? <View className='row'><Text>待处理冲突 {syncErrors} 条</Text></View> : null}
 {ENABLE_DEVICE_TOKEN_TESTING ? <>
  <View className='row'><Text>设备联调</Text><Text className='muted'>{linked?'当前已连接':'尚未连接'}</Text></View>
  <Input className='field' password value={testToken} placeholder='输入控制台签发的临时设备令牌'
    onInput={e=>setTestToken(e.detail.value)} />
  <Button onClick={()=>{
    try{
      saveAuthenticatedSession(testToken)
      setTestToken('')
      setLinked(true)
      void refreshSites().then(x=>setSyncMessage(x.message))
    }catch(_){ void Taro.showToast({title:'令牌格式错误或需先断开会话',icon:'none'}) }
  }}>启用测试设备同步</Button>
  <Button onClick={()=>{
    if(syncState().queued>0){
      void Taro.showToast({title:'还有待发送数据，请先完成同步',icon:'none'})
      return
    }
    clearAuthenticatedSession();setLinked(false);setTestToken('')
    void refreshSites().then(x=>setSyncMessage(x.message))
  }}>断开测试设备会话</Button>
 </> : null}</View>
}
