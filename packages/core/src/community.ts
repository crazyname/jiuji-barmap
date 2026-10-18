// SPDX-License-Identifier: MPL-2.0
// PR-11: community content is separate from DrinkEntry, VisitSession and BarReview.
// No PR-07 private resource, legacy Sites post or local draft is a public post.
import type { DrinkEntry, VisitSession } from './models'

export type CommunityContentType = 'visit_note'|'cocktail_note'|'general'|'promotion'
export type CommunityVisibility = 'private'|'public'
export type CommunityModeration = 'local_draft'|'pending_submission'|'pending_review'|
  'approved'|'rejected'|'hidden'|'withdrawn'
export type CommunityImage = { url:string; source:string; licensed:boolean; aspectRatio?:number }
export type CommunityFields = {
  title:string; body:string; type:CommunityContentType; barId:number|null
  topics:string[]; images:CommunityImage[]; isSponsored:boolean; sponsorName:string|null
}
export interface CommunityDraft extends CommunityFields {
  id:string; authorUserId:string; visibility:'private'
  status:'local_draft'|'pending_submission'|'pending_review'|'rejected'
  createdAt:string; updatedAt:string; revision:number
}
export interface CommunityPost extends CommunityFields {
  id:string; authorUserId:string; authorDisplayName:string
  visibility:CommunityVisibility
  moderationStatus:CommunityModeration
  createdAt:string; updatedAt:string; revision:number
}
export type CommunitySubmission = CommunityFields & {clientMutationId:string}
export interface PublicPage {
  posts:CommunityPost[]
  nextCursor:string|null
}
export interface CommunityPublicSource {
  /** The trusted community moderation service MUST enforce approved+public server-side. */
  list(cursor?:string):Promise<PublicPage>
  get(id:string):Promise<CommunityPost|null>
}
export interface CommunityPublisher {
  /** Future PR-12 endpoint: actor determined server-side, NOT from JSON author ID. */
  submit(input:CommunitySubmission):Promise<CommunityPost>
}
export interface CommunityIdentity { verifiedUserId():string|null }
export interface CommunityStorage { read(key:string):unknown; write(key:string,value:unknown):void }
export class CommunityError extends Error {
  constructor(readonly code:'AUTH_REQUIRED'|'INVALID'|'STORAGE'|'NOT_FOUND'|
    'CONFLICT'|'PUBLISH_UNAVAILABLE'|'SERVER_REJECTED',message:string) {
    super(message);this.name='CommunityError'
  }
}
export const COMMUNITY_DRAFT_PREFIX='jiuji.community.drafts.v1:'
const serial=<T>(x:T):T=>JSON.parse(JSON.stringify(x)) as T
const validString=(x:unknown,max:number)=>typeof x==='string'&&x.trim().length>0&&
  x.trim().length<=max
const imageAllowed=(image:unknown):image is CommunityImage=>{
  if(!image||typeof image!=='object')return false
  const x=image as Partial<CommunityImage>
  return x.licensed===true&&typeof x.url==='string'&&
    /^https:\/\/[^/?#]+\/[^?#]+$/.test(x.url)&&typeof x.source==='string'&&
    x.source.trim().length>0&&x.source.length<=250&&
    (x.aspectRatio===undefined||(typeof x.aspectRatio==='number'&&
      Number.isFinite(x.aspectRatio)&&x.aspectRatio>=0.35&&x.aspectRatio<=3))
}
export function validateCommunityFields(fields:CommunityFields):CommunityFields {
  if(!validString(fields.title,80) || !validString(fields.body,5000) ||
    !['visit_note','cocktail_note','general','promotion'].includes(fields.type) ||
    !(fields.barId===null||(Number.isSafeInteger(fields.barId)&&fields.barId>0)) ||
    !Array.isArray(fields.topics)||fields.topics.length>5||
    !fields.topics.every(tag=>validString(tag,24)) ||
    !Array.isArray(fields.images)||fields.images.length>9||
    !fields.images.every(imageAllowed) ||
    typeof fields.isSponsored!=='boolean' ||
    (fields.isSponsored && !validString(fields.sponsorName,100)) ||
    (!fields.isSponsored&&fields.sponsorName!==null) ||
    (fields.type==='promotion'&&!fields.isSponsored))
    throw new CommunityError('INVALID','标题、正文、话题、素材授权或商业推广声明无效')
  return serial({...fields,title:fields.title.trim(),body:fields.body.trim(),
    topics:fields.topics.map(tag=>tag.trim()),sponsorName:fields.sponsorName?.trim()||null})
}
function safePost(value:unknown):value is CommunityPost {
  if(!value||typeof value!=='object')return false
  const p=value as Partial<CommunityPost>
  if(p.visibility!=='public'||p.moderationStatus!=='approved'||
    !validString(p.id,160)||!validString(p.authorUserId,160)||
    !validString(p.authorDisplayName,80)||!Number.isSafeInteger(p.revision)||
    !p.revision||p.revision<1||!Number.isFinite(Date.parse(p.createdAt||''))||
    !Number.isFinite(Date.parse(p.updatedAt||'')))return false
  try {validateCommunityFields(p as CommunityFields);return true}catch{return false}
}
/** Defense in depth; server must already authorize every public row. */
export function publicApprovedPosts(input:unknown):CommunityPost[] {
  if(!Array.isArray(input))return []
  // Project exact public whitelist; never echo unexpected fields from a
  // compromised read adapter (private note, rating, coordinates, source ID).
  return input.filter(safePost).map((raw:CommunityPost)=>({
    id:raw.id,authorUserId:raw.authorUserId,authorDisplayName:raw.authorDisplayName,
    title:raw.title,body:raw.body,type:raw.type,barId:raw.barId,
    topics:serial(raw.topics),images:raw.images.map(image=>({
      url:image.url,source:image.source,licensed:true,
      ...(image.aspectRatio===undefined?{}:{aspectRatio:image.aspectRatio})
    })),
    isSponsored:raw.isSponsored,sponsorName:raw.sponsorName,
    visibility:'public' as const,moderationStatus:'approved' as const,
    createdAt:raw.createdAt,updatedAt:raw.updatedAt,revision:raw.revision
  }))
}
type DraftSnapshot={schema:1;owner:string;drafts:CommunityDraft[]}
export class CommunityRepository {
  private readonly deps:{
    identity:CommunityIdentity;storage:CommunityStorage;newId:()=>string;now:()=>string
    source?:CommunityPublicSource;publisher?:CommunityPublisher
  }
  private publicCache:CommunityPost[]=[]
  constructor(deps:{identity:CommunityIdentity;storage:CommunityStorage;newId:()=>string;
    now:()=>string;source?:CommunityPublicSource;publisher?:CommunityPublisher}){this.deps=deps}
  private owner():string {
    const id=this.deps.identity.verifiedUserId()
    if(!id)throw new CommunityError('AUTH_REQUIRED','需要完成服务端身份验证后才能保存社区草稿')
    return id
  }
  private load():DraftSnapshot {
    const owner=this.owner()
    let raw:unknown
    try{raw=this.deps.storage.read(COMMUNITY_DRAFT_PREFIX+encodeURIComponent(owner))}
    catch{throw new CommunityError('STORAGE','草稿读取失败；原数据未清除')}
    if(raw===null||raw===undefined||raw==='')return {schema:1,owner,drafts:[]}
    if(!raw||typeof raw!=='object')throw new CommunityError('STORAGE','草稿快照损坏；保留原数据')
    const snap=raw as Partial<DraftSnapshot>
    if(snap.schema!==1||snap.owner!==owner||!Array.isArray(snap.drafts)||
      !snap.drafts.every(d=>d&&d.authorUserId===owner&&d.visibility==='private'&&
        ['local_draft','pending_submission','pending_review','rejected'].includes(d.status)&&
        Number.isSafeInteger(d.revision)&&d.revision>0))
      throw new CommunityError('STORAGE','草稿快照不兼容；保留原数据')
    return serial(snap as DraftSnapshot)
  }
  private write(next:DraftSnapshot):void {
    if(next.owner!==this.owner())throw new CommunityError('AUTH_REQUIRED','账号已切换')
    try{this.deps.storage.write(COMMUNITY_DRAFT_PREFIX+encodeURIComponent(next.owner),serial(next))}
    catch{throw new CommunityError('STORAGE','设备存储失败，尚未确认保存；草稿输入请保留')}
  }
  listDrafts():CommunityDraft[]{return this.load().drafts}
  getDraft(id:string):CommunityDraft|null {
    return this.load().drafts.find(x=>x.id===id)||null
  }
  newDraft(partial?:Partial<CommunityFields>):CommunityDraft {
    const owner=this.owner(),now=this.deps.now()
    const draft:CommunityDraft={id:'community-draft:'+this.deps.newId(),authorUserId:owner,
      title:typeof partial?.title==='string'?partial.title.slice(0,80):'',
      body:typeof partial?.body==='string'?partial.body.slice(0,5000):'',
      type:partial?.type||'general',barId:null,topics:[],images:[],
      isSponsored:false,sponsorName:null,visibility:'private',status:'local_draft',
      revision:1,createdAt:now,updatedAt:now}
    const snap=this.load();snap.drafts.unshift(draft);this.write(snap);return serial(draft)
  }
  /** Explicit user action only; strict public-preview whitelist.
   * No note, rating, photos, location, timestamp, source ID, or private backlink. */
  fromDrink(_entry:DrinkEntry):CommunityDraft {
    this.owner()
    return this.newDraft({title:'聊聊这杯酒',type:'cocktail_note'})
  }
  fromVisit(_visit:VisitSession):CommunityDraft {
    this.owner()
    return this.newDraft({title:'一次探店分享',type:'visit_note'})
  }
  saveDraft(id:string,changes:CommunityFields,expectedRevision:number):CommunityDraft {
    const snap=this.load(),i=snap.drafts.findIndex(d=>d.id===id)
    if(i<0)throw new CommunityError('NOT_FOUND','草稿不存在')
    const old=snap.drafts[i]
    if(old.revision!==expectedRevision||old.status==='pending_review')
      throw new CommunityError('CONFLICT','草稿已变化或已送审；不能静默覆盖')
    // Saving an unfinished draft permits empty title/body; submission does not.
    const values={...changes,title:changes.title.slice(0,80),body:changes.body.slice(0,5000)}
    if(changes.title.length>80||changes.body.length>5000||
      !['visit_note','cocktail_note','general','promotion'].includes(changes.type)||
      (changes.type==='promotion' && !changes.isSponsored) ||
      (changes.isSponsored&&!validString(changes.sponsorName,100))||
      (!changes.isSponsored && changes.sponsorName!==null)||
      !(changes.barId===null||(Number.isSafeInteger(changes.barId)&&changes.barId>0))||
      !Array.isArray(changes.topics)||changes.topics.length>5||
      !changes.topics.every(t=>validString(t,24))||
      !Array.isArray(changes.images)||changes.images.some(x=>!imageAllowed(x)))
      throw new CommunityError('INVALID','草稿字段或商业推广信息无效')
    snap.drafts[i]={...old,...serial(values),updatedAt:this.deps.now(),
      revision:old.revision+1,status:'local_draft'}
    this.write(snap);return serial(snap.drafts[i])
  }
  discardDraft(id:string):void {
    const snap=this.load(),item=snap.drafts.find(x=>x.id===id)
    if(!item)throw new CommunityError('NOT_FOUND','草稿不存在')
    if(item.status==='pending_review')throw new CommunityError('CONFLICT','已提交审核的稿件不能直接删除')
    snap.drafts=snap.drafts.filter(x=>x.id!==id);this.write(snap)
  }
  async submitForReview(id:string,expectedRevision:number):Promise<CommunityPost>{
    const owner=this.owner()
    const draft=this.getDraft(id)
    if(!draft)throw new CommunityError('NOT_FOUND','草稿不存在')
    if(draft.revision!==expectedRevision)throw new CommunityError('CONFLICT','草稿版本不一致')
    if(!this.deps.publisher)throw new CommunityError('PUBLISH_UNAVAILABLE','正式审核服务未部署，草稿仅保存在当前设备')
    const input=validateCommunityFields(draft)
    const result=await this.deps.publisher.submit({
      ...input,clientMutationId:'community:'+id
    })
    if(this.owner()!==owner)throw new CommunityError('AUTH_REQUIRED','会话已切换')
    if(result.authorUserId!==owner||result.moderationStatus!=='pending_review'||
      result.visibility!=='private')
      throw new CommunityError('SERVER_REJECTED','服务器未确认待审核状态')
    const snap=this.load(),position=snap.drafts.findIndex(d=>d.id===id)
    if(position<0||snap.drafts[position].revision!==expectedRevision)
      throw new CommunityError('CONFLICT','草稿在提交期间已修改，请复核')
    snap.drafts[position].status='pending_review'
    this.write(snap);return serial(result)
  }
  publicAvailable():boolean {return !!this.deps.source}
  async listPublic(cursor?:string):Promise<PublicPage>{
    if(!this.deps.source)return {posts:[],nextCursor:null}
    const page=await this.deps.source.list(cursor)
    if(!page||!Array.isArray(page.posts)||
      !(page.nextCursor===null||(typeof page.nextCursor==='string'&&page.nextCursor.length<=256)))
      throw new CommunityError('SERVER_REJECTED','社区数据接口无效')
    const approved=publicApprovedPosts(page.posts)
    if(!cursor)this.publicCache=approved
    else this.publicCache=[...this.publicCache,...approved.filter(x=>!this.publicCache.some(p=>p.id===x.id))]
    return {posts:approved,nextCursor:page.nextCursor}
  }
  async getPublic(id:string):Promise<CommunityPost|null>{
    if(!this.deps.source)return null
    const found=await this.deps.source.get(id)
    return publicApprovedPosts(found?[found]:[])[0]||null
  }
  /** No community public mutations on Sites /v1/sync, even in tests. */
}
