// SPDX-License-Identifier: MPL-2.0
import AsyncStorage from '@react-native-async-storage/async-storage'
import { SYNC_API_BASE_URL, SYNC_ENABLED } from '../config/sync'
import { createSyncClient } from './sync-core'

export type SyncKind = 'bars' | 'recipes' | 'posts' | 'favorites'
type AnyRow = { id: string | number; [key: string]: unknown }
const STORAGE_KEY='jiuji.sync.snapshot.v1'
const LOCAL_DRAFTS_KEY='jiuji.mobile.local-drafts.v1'
type DraftKind='recipes'|'posts'
async function readLocalDrafts():Promise<Record<DraftKind,AnyRow[]>>{
 try{
  const saved=JSON.parse((await AsyncStorage.getItem(LOCAL_DRAFTS_KEY))||'{}')
  return {recipes:Array.isArray(saved.recipes)?saved.recipes:[],
    posts:Array.isArray(saved.posts)?saved.posts:[]}
 }catch(_){return {recipes:[],posts:[]}}
}
async function writeLocalDrafts(value:Record<DraftKind,AnyRow[]>):Promise<void>{
 await AsyncStorage.setItem(LOCAL_DRAFTS_KEY,JSON.stringify(value))
}
let snapshot: any = null
let initialized: Promise<void> | null = null
let deviceToken = ''
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
 const rows=engine.list(kind) as T[]
 if(kind!=='recipes'&&kind!=='posts')return rows
 const saved=await readLocalDrafts()
 const local=saved[kind] as T[]
 const keys=new Set(local.map(item=>String(item.id)))
 return [...local,...rows.filter(item=>!keys.has(String(item.id)))]
}
export async function queueMobileUpsert(kind:SyncKind,row:AnyRow):Promise<void>{
 await ready()
 if (deviceToken){
  engine.queueUpsert(kind,row)
  await persist
 }else if(kind==='recipes'||kind==='posts'){
  const drafts=await readLocalDrafts()
  drafts[kind]=[row,...drafts[kind].filter(item=>String(item.id)!==String(row.id))]
  await writeLocalDrafts(drafts)
 }
}
// Pass a short-lived token issued by an actual mobile sign-in flow.
// Do not persist the Sites owner session, a shared admin token or test credentials.
export function saveMobileTestToken(token:string):void{
 const value=token.trim()
 if(value.length<16)throw Error('无效设备令牌')
 if(deviceToken && deviceToken!==value)throw Error('请先断开当前设备会话')
 deviceToken=value
}
export function clearMobileTestToken():void{ deviceToken='' }
export function hasMobileTestToken():boolean{ return !!deviceToken }
export async function refreshMobileSites(token?:string):Promise<{ok:boolean;queued:number;message:string}>{
 await ready()
 if(!mobileSyncEnabled)return {ok:false,queued:engine.status().queued,message:'等待 Sites API 上线'}
 try{
  if(token||deviceToken){
   // Move saved offline-only drafts to the persisted network queue after sign-in.
   const local=await readLocalDrafts()
   if(local.recipes.length||local.posts.length){
    for(const kind of ['recipes','posts'] as const)
     for(const row of local[kind])engine.queueUpsert(kind,row)
    await persist
    await writeLocalDrafts({recipes:[],posts:[]})
   }
  }
  const result=(token||deviceToken)?await engine.sync(token||deviceToken):await engine.pull()
  const state=engine.status()
  await persist
  return {ok:true,queued:state.queued,message:'已同步版本 '+result.revision+(!token&&!deviceToken?' · 未连接设备账号':'')}
 }catch(_){
  await persist
  return {ok:false,queued:engine.status().queued,message:'离线，修改已保存在本机'}
 }
}
