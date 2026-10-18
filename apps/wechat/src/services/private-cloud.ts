// SPDX-License-Identifier: MPL-2.0
// The only private HTTP adapter. Never uses Sites device tokens or public /v1/sync.
import Taro from '@tarojs/taro'
import { AUTH_API_BASE_URL, AUTH_API_ENABLED } from '../config/auth'
import type { DrinkEntry, DrinkEntryChanges, NewDrinkEntry, NewVisitSession, VisitSession,
  VisitSessionChanges } from '../../../../packages/core/src/models'
import { CloudJournalCoordinator, CloudSyncError } from '../../../../packages/sync/private-cloud'
import { createRecoverableCloudStorage } from '../../../../packages/sync/recoverable-cloud-storage'
import type { CloudRemote, CloudPage, CloudCursor } from '../../../../packages/sync/private-cloud'
import type { AuthService } from './auth-service'
import { authService } from './wechat-auth'

export function createPrivateApiRemote(auth: AuthService, origin: string, enabled: boolean,
  fetcher: typeof Taro.request = Taro.request): CloudRemote {
  async function call<T>(method: 'GET'|'POST'|'PATCH'|'PUT'|'DELETE', path: string,
    payload?: unknown): Promise<T> {
    if(!enabled || !/^https:\/\/[^/?#]+(?:\/[^?#]*)?$/.test(origin))
      throw new CloudSyncError('AUTH_REQUIRED','私人云服务尚未部署或通过验收')
    const credential=auth.credentialForPrivateApi()
    if(!credential)throw new CloudSyncError('AUTH_REQUIRED','需要先验证账号')
    let response
    try{
      response=await fetcher({
        url:origin.replace(/\/+$/,'')+path,method,
        header:{'Content-Type':'application/json','Authorization':'Bearer '+credential.accessToken},
        ...(payload === undefined?{}:{data:payload}),timeout:10000
      })
    }catch{
      if(!auth.credentialForPrivateApi() ||
        auth.credentialForPrivateApi()!.userId!==credential.userId)
        throw new CloudSyncError('AUTH_REQUIRED','账号已变更，停止同步')
      throw new CloudSyncError('NETWORK','当前离线或服务器不可达，本机队列已保留')
    }
    if(response.statusCode===401 || response.statusCode===403){
      auth.invalidatePrivateApi()
      throw new CloudSyncError('AUTH_REQUIRED','会话已失效，请重新登录',response.statusCode)
    }
    const current=auth.credentialForPrivateApi()
    if(!current || current.userId!==credential.userId)
      throw new CloudSyncError('AUTH_REQUIRED','账号已变更，停止同步')
    const value:unknown=response.data
    if(response.statusCode===409)throw new CloudSyncError('CONFLICT','服务器记录已更新，需要人工处理',409)
    if(response.statusCode===404)throw new CloudSyncError('NOT_FOUND','服务器记录不存在',404)
    if(response.statusCode<200 || response.statusCode>=300 ||
       !value || typeof value!=='object')
      throw new CloudSyncError('NETWORK','服务器未确认私人记录操作',response.statusCode)
    return value as T
  }
  const query=(cursor?:CloudCursor)=>{
    const args=['limit=100']
    if(cursor){
      args.push('before='+encodeURIComponent(cursor.before))
      args.push('beforeId='+encodeURIComponent(cursor.beforeId))
    }
    return '?'+args.join('&')
  }
  return {
    async listDrinks(cursor){const x=await call<{entries:DrinkEntry[];nextCursor:CloudCursor|null}>(
      'GET','/v1/private/drinks'+query(cursor))
      if(!Array.isArray(x.entries))throw new CloudSyncError('NETWORK','饮用响应不完整')
      return {records:x.entries,nextCursor:x.nextCursor||null}
    },
    async listVisits(cursor){const x=await call<{visits:VisitSession[];nextCursor:CloudCursor|null}>(
      'GET','/v1/private/visits'+query(cursor))
      if(!Array.isArray(x.visits))throw new CloudSyncError('NETWORK','探店响应不完整')
      return {records:x.visits,nextCursor:x.nextCursor||null}
    },
    async getDrink(id){try{
      return (await call<{entry:DrinkEntry}>('GET','/v1/private/drinks/'+encodeURIComponent(id))).entry
    }catch(e){if(e instanceof CloudSyncError&&e.code==='NOT_FOUND')return null;throw e}},
    async getVisit(id){try{
      return (await call<{visit:VisitSession}>('GET','/v1/private/visits/'+encodeURIComponent(id))).visit
    }catch(e){if(e instanceof CloudSyncError&&e.code==='NOT_FOUND')return null;throw e}},
    async createDrink(input,clientMutationId){
      return (await call<{entry:DrinkEntry}>('POST','/v1/private/drinks',
        {...input,clientMutationId})).entry
    },
    async createVisit(input,clientMutationId){
      return (await call<{visit:VisitSession}>('POST','/v1/private/visits',
        {...input,clientMutationId})).visit
    },
    async updateDrink(id,changes,expectedRevision){
      return (await call<{entry:DrinkEntry}>('PATCH',
        '/v1/private/drinks/'+encodeURIComponent(id),{changes,expectedRevision})).entry
    },
    async updateVisit(id,changes,expectedRevision){
      return (await call<{visit:VisitSession}>('PATCH',
        '/v1/private/visits/'+encodeURIComponent(id),{changes,expectedRevision})).visit
    },
    async linkDrink(id,visitSessionId,expectedRevision){
      return (await call<{entry:DrinkEntry}>('PUT',
        '/v1/private/drinks/'+encodeURIComponent(id)+'/visit',
        {visitSessionId,expectedRevision})).entry
    },
    async deleteDrink(id,expectedRevision){
      await call<{ok:boolean}>('DELETE','/v1/private/drinks/'+encodeURIComponent(id),
        {expectedRevision})
    },
    async deleteVisit(id,expectedRevision){
      await call<{ok:boolean}>('DELETE','/v1/private/visits/'+encodeURIComponent(id),
        {expectedRevision})
    }
  }
}
export const privateCloud = new CloudJournalCoordinator({
  identity:{verifiedUserId:()=>authService.verifiedIdentity()?.userId||null},
  storage:createRecoverableCloudStorage({
    read:key=>{const value=Taro.getStorageSync(key) as unknown
      return value === '' || value === null ? undefined : value},
    write:(key,value)=>{Taro.setStorageSync(key,value)}
  }),
  remote:createPrivateApiRemote(authService,AUTH_API_BASE_URL,AUTH_API_ENABLED),
  newId:()=>Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,14),
  now:()=>new Date().toISOString()
})
authService.subscribe(state=>{
  if(state.status!=='authenticated')privateCloud.invalidate()
})
// WeChat foreground pages also retry on useDidShow. Connectivity recovery is
// a separate, non-public trigger; never run it without current verified auth.
if (typeof Taro.onNetworkStatusChange === 'function') {
  Taro.onNetworkStatusChange(event => {
    if (event.isConnected && authService.verifiedIdentity()) void privateCloud.sync()
  })
}
export const privateMirrorRepository = privateCloud.localRepository()
