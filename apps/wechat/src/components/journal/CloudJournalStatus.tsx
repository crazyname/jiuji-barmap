import React, { useEffect, useState } from 'react'
import { Button, Text, View } from '@tarojs/components'
import type { CloudJournalCoordinator, CloudSnapshot, CloudKind } from '../../../../../packages/sync/private-cloud'
import './cloud-status.css'

export function useCloudVersion(cloud: CloudJournalCoordinator, active: boolean): number {
  const [version,setVersion]=useState(0)
  useEffect(()=>active?cloud.subscribe(()=>setVersion(n=>n+1)):undefined,[cloud,active])
  return version
}
/** Real cached, queued, syncing, error and conflict states. No "cloud saved"
 * label is ever derived from a local-only write. */
export function CloudJournalStatus({cloud}: {cloud:CloudJournalCoordinator}) {
  const version=useCloudVersion(cloud,true)
  let state:CloudSnapshot
  try {state=cloud.getSnapshot()}
  catch(error){
    if(error instanceof Error && 'code' in error && error.code==='STORAGE')
      return <View className='cloud-container'>
        <Text className='cloud-error'>设备存储异常，尚未确认保存。私人记录未被自动清除。</Text>
        <Button className='cloud-retry' onClick={()=>{try{cloud.recoverStorage()}catch{}}}>
          检查存储并恢复
        </Button>
      </View>
    return <Text className='cloud-status'>未认证，无法查看私人同步状态</Text>
  }
  const failed=state.operations.filter(o=>o.status==='failed')
  const conflicts=state.operations.filter(o=>o.status==='conflict')
  const pending=state.operations.filter(o=>o.status==='pending'||o.status==='syncing')
  const text=state.syncing?'正在同步':
    conflicts.length?'存在冲突':failed.length?'同步失败':
      pending.length?'已保存到当前设备，待同步':
        state.refreshed?'已同步':'仅当前设备缓存，尚未完成云端读取'
  return <View className='cloud-container'>
    <Text className='cloud-status'>{text}</Text>
    {state.error?<Text className='cloud-error'>{state.error}</Text>:null}
    {pending.length||failed.length?<Text className='cloud-detail'>
      待处理 {pending.length+failed.length} 项，断网后不会丢弃本机队列
    </Text>:null}
    {!state.syncing?<Button className='cloud-retry' onClick={()=>void cloud.sync()}>
      重新同步</Button>:null}
    {conflicts.map(op=><View key={op.opId} className='cloud-conflict'>
      <Text>服务器版本冲突：本机修改已保留，未覆盖其他设备的内容。</Text>
      <Button onClick={()=>cloud.conflictDecision(op.opId,'keep-local')}>保留本地草稿</Button>
      <Button onClick={()=>cloud.conflictDecision(op.opId,'reload')}>放弃本机修改，采用服务器版本</Button>
    </View>)}
  </View>
}
export function cloudRecordLabel(cloud:CloudJournalCoordinator,kind:CloudKind,id:string):string {
  const labels={pending:'当前设备待同步',syncing:'正在同步',synced:'已同步',
    failed:'同步失败',conflict:'存在冲突'}
  try {return labels[cloud.status(kind,id)]}
  catch(error){
    if(error instanceof Error && 'code' in error && error.code==='STORAGE')
      return '设备存储异常，尚未确认保存'
    return '未认证，无法访问私人记录'
  }
}
