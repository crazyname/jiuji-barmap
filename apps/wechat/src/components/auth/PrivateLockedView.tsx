import React from 'react'
import { Button, Text, View } from '@tarojs/components'
import type { AuthState } from '../../services/auth-contracts'

/** Does not mount the journal reader while there is no confirmed current session. */
export function PrivateLockedView({ state, onBack }: { state: AuthState; onBack: () => void }) {
  return <View style={{ minHeight: '100vh', background: '#F7F5F5', padding: '36rpx 28rpx' }}>
    <Text style={{ display: 'block', fontSize: '36rpx', color: '#242329' }}>私人记录</Text>
    <Text style={{ display: 'block', marginTop: '22rpx', color: '#6F6D74' }}>
      {state.status === 'authenticating' ? '正在验证身份，暂时隐藏私人记录。' :
        state.status === 'expired' ? '登录状态已失效，请返回「我的」重新登录。' :
          state.status === 'error' ? '身份认证暂不可用，请返回「我的」重试。' :
            '需要登录才能查看私人记录。请先前往「我的」完成微信身份验证。'}
    </Text>
    <Button style={{ marginTop: '32rpx', color: '#82442F', background: '#FFFFFF' }}
      onClick={onBack}>返回</Button>
  </View>
}
