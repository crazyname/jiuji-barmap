import React from 'react'
import { Button, Text, View } from '@tarojs/components'
import type { AuthService } from '../../services/auth-service'
import { useAuthState } from '../../utils/use-auth-state'
import './index.css'

export function AuthPanel({ service }: { service: AuthService }) {
  const state = useAuthState(service)
  if (state.status === 'authenticated' && state.account) return <View className='auth-panel'>
    <Text className='auth-title'>已登录</Text>
    <Text className='auth-detail'>{state.account.displayName || '酒迹用户'}</Text>
    <Text className='auth-detail'>私人记录仅供当前已验证的账户访问</Text>
    <Button className='auth-secondary' onClick={() => void service.signOut()}>安全退出</Button>
  </View>
  return <View className='auth-panel'>
    <Text className='auth-title'>{state.status === 'authenticating' ? '正在验证微信身份…' :
      state.status === 'expired' ? '登录状态已失效' : '访客模式'}</Text>
    <Text className='auth-detail'>{state.message ||
      '公开酒吧与内容仍可浏览；私人饮酒记录需登录后查看。'}</Text>
    <Button className='auth-primary' disabled={state.status === 'authenticating'}
      onClick={() => void service.signIn()}>{state.status === 'authenticating' ? '登录中…' :
        state.status === 'error' || state.status === 'expired' ? '重新尝试微信登录' : '微信登录'}</Button>
    <Text className='auth-detail'>账号认证服务尚未正式开放时，登录不会获得任何私人数据访问权限。</Text>
  </View>
}
