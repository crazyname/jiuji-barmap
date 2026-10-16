// SPDX-License-Identifier: MPL-2.0
import AsyncStorage from '@react-native-async-storage/async-storage'
import { SYNC_API_BASE_URL, SYNC_ENABLED } from '../config/sync'
import { createSyncClient } from './sync-core'

export type SyncKind = 'bars' | 'recipes' | 'posts' | 'favorites'
type AnyRow = { id: string | number; [key: string]: unknown }
const STORAGE_KEY='jiuji.sync.snapshot.v1'
let snapshot: any = null
let initialized: Promise<void> | null = null
let persist: Promise<unknown> = Promise.resolve()

async function ready(): Promise<void> {
 if (!initialized) initialized=AsyncStorage.getItem(STORAGE_KEY).then(raw => {
  snapshot=raw ? JSON.parse(raw) : null
 }).catch(()=>{snapshot=null})
 await initialized
}
const storage={
 read:()=>snapshot,
 write:(data:any)=>{
  snapshot=data
  const content=JSON.stringify(data)
  persist=persist.then(()=>AsyncStorage.setItem(STORAGE_KEY,content))
 }
}
async function request(path:string,method:'GET'|'POST',token?:string,body?:unknown):Promise<any>{
 const origin=SYNC_API_BASE_URL.replace(/\/+$/,'')
 if(!origin.startsWith('https://'))throw Error('HTTPS sync API not configured')
 const response=await fetch(origin+path,{
  method,
  headers:{'content-type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
 })
 if(!response.ok)throw Error('HTTP '+response.status)
 const result=await response.json()
 if(!result||typeof result!=='object')throw Error('Invalid JSON from sync API')
 return result
}
const engine=createSyncClient({storage,transport:{
 get:(path:string,token?:string)=>request(path,'GET',token),
 post:(path:string,body:unknown,token?:string)=>request(path,'POST',token,body)
}})
export const mobileSyncEnabled=SYNC_ENABLED&&SYNC_API_BASE_URL.startsWith('https://')
export async function getMobileRows<T extends AnyRow>(kind:SyncKind):Promise<T[]>{
 await ready()
 return engine.list(kind) as T[]
}
export async function queueMobileUpsert(kind:SyncKind,row:AnyRow):Promise<void>{
 await ready()
 engine.queueUpsert(kind,row)
 await persist
}
// Pass a short-lived token issued by an actual mobile sign-in flow.
// Do not persist the Sites owner session, a shared admin token or test credentials.
export async function refreshMobileSites(token?:string):Promise<{ok:boolean;queued:number;message:string}>{
 await ready()
 if(!mobileSyncEnabled)return {ok:false,queued:engine.status().queued,message:'等待 Sites API 上线'}
 try{
  const result=await engine.sync(token)
  await persist
  return {ok:true,queued:result.queued,message:'已同步版本 '+result.revision}
 }catch(_){
  await persist
  return {ok:false,queued:engine.status().queued,message:'离线，修改已保存在本机'}
 }
}
