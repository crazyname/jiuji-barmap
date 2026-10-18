import test from 'node:test'
import assert from 'node:assert/strict'
import { CommunityRepository, CommunityError, COMMUNITY_DRAFT_PREFIX,
  publicApprovedPosts, validateCommunityFields } from '../packages/core/src/community.ts'

let n=0
const now='2026-10-18T08:00:00.000Z'
const validFields=()=>({title:'一篇真实的图文稿',body:'由作者自己编辑的内容',type:'general',
  barId:null,topics:['调酒'],images:[],isSponsored:false,sponsorName:null})
const fakePost=(fields={})=>({
  ...validFields(),id:'approved-post-1',authorUserId:'verified-author-id',
  authorDisplayName:'已验证投稿者',visibility:'public',moderationStatus:'approved',
  createdAt:now,updatedAt:now,revision:1,...fields
})
function setup({withPublisher=false,withSource=false}={}){
  const disk=new Map([['jiuji.react.posts',[{id:'old-post',title:'旧设备草稿',body:'请勿自动发布'}]],
    ['jiuji.sync.snapshot.v1',{revision:10,collections:{posts:[{id:'sites-post'}]}}],
    ['jiuji-personal-v1:favorites',[1,2]],['jiuji-personal-v1:history',[{key:'old'}]]])
  let user='verified-A',called=0,publicWrites=0
  const source=withSource?{
    async list(cursor){return {posts:[fakePost(),fakePost({id:'hidden',moderationStatus:'pending_review'}),
      fakePost({id:'private-post',visibility:'private'})],nextCursor:null}},
    async get(id){return id==='approved-post-1'?fakePost():fakePost({moderationStatus:'rejected'})}
  }:undefined
  const publisher=withPublisher?{
    async submit(input){called++;assert.ok(!('authorUserId' in input))
      return fakePost({id:'review-'+called,visibility:'private',
        moderationStatus:'pending_review',authorUserId:user,...input})}
  }:undefined
  const repo=new CommunityRepository({
    identity:{verifiedUserId:()=>user},storage:{
      read:key=>disk.get(key),write:(key,value)=>{disk.set(key,structuredClone(value));
        if(key==='jiuji.sync.snapshot.v1')publicWrites++}
    },newId:()=>String(++n),now:()=>now,source,publisher
  })
  return {repo,disk,as:x=>{user=x},calls:()=>called,publicWrites:()=>publicWrites}
}
test('community drafts have new scoped IDs and never mutate legacy posts, Sites, favorites, recipes or history',()=>{
  const f=setup(),before=structuredClone([...f.disk.entries()])
  const draft=f.repo.newDraft()
  assert.match(draft.id,/^community-draft:/)
  assert.equal(draft.authorUserId,'verified-A')
  assert.equal(draft.visibility,'private')
  assert.equal(draft.status,'local_draft')
  assert.equal(f.disk.has(COMMUNITY_DRAFT_PREFIX+'verified-A'),true)
  for(const [key,value] of before)assert.deepEqual(f.disk.get(key),value)
  assert.equal(f.publicWrites(),0)
})
test('guest cannot open or create, change, submit or discard authenticated draft',async()=>{
  const f=setup(),d=f.repo.newDraft()
  f.as(null)
  for(const op of [()=>f.repo.listDrafts(),()=>f.repo.getDraft(d.id),()=>f.repo.newDraft(),
    ()=>f.repo.discardDraft(d.id)])assert.throws(op,e=>e.code==='AUTH_REQUIRED')
  await assert.rejects(f.repo.submitForReview(d.id,1),e=>e.code==='AUTH_REQUIRED')
})
test('two verified accounts have fully independent drafts and no anonymous implicit assignment',()=>{
  const f=setup(),a=f.repo.newDraft()
  f.as('verified-B');assert.deepEqual(f.repo.listDrafts(),[])
  assert.equal(f.repo.getDraft(a.id),null)
  const b=f.repo.newDraft()
  assert.notEqual(a.id,b.id)
  f.as('verified-A');assert.equal(f.repo.getDraft(a.id)?.id,a.id)
  assert.equal(f.repo.getDraft(b.id),null)
})
test('sharing a private drink is explicit and whitelists NO private name, note, rating, location or photo',()=>{
  const f=setup(),entry={id:'secret-entry-ID',ownerUserId:'verified-A',
    drinkLabel:'私下品酒的珍贵酒名',cocktailId:'kb-secret',recipeVariantId:'r-secret',
    visitSessionId:'secret-visit',consumedAt:'2026-10-17T19:35:42Z',
    contextKind:'bar',photoRefs:['wxfile://private-personal-photo'],
    personalRating:1.5,note:'只给自己看的心情 456',
    contextDetails:{bar:{barId:21,priceAmount:153,menuItem:'不公开的酒单'}},
    visibility:'private',revision:12,clientMutationId:'secret-mutation',
    createdAt:now,updatedAt:now}
  const original=structuredClone(entry),draft=f.repo.fromDrink(entry)
  assert.deepEqual(entry,original)
  assert.equal(draft.title,'聊聊这杯酒')
  assert.equal(draft.body,'')
  assert.equal(draft.barId,null)
  assert.deepEqual(draft.images,[])
  const leaked=JSON.stringify(draft)
  for(const secret of ['私下品酒','只给自己看','secret-entry','secret-visit','wxfile','153','1.5','2026-10-17'])
    assert.ok(!leaked.includes(secret),'Leaked '+secret)
})
test('sharing a private visit does not disclose exact location, date, note or source link',()=>{
  const f=setup(),v={id:'secret-visit-id',ownerUserId:'verified-A',barId:57,
    placeLabel:'隐藏位置：街道 18 号',occurredAt:'2026-10-16T08:08:08Z',note:'私人日记',
    visibility:'private',revision:3,clientMutationId:'cm-private',createdAt:now,updatedAt:now}
  const original=structuredClone(v),draft=f.repo.fromVisit(v)
  assert.deepEqual(v,original)
  assert.equal(draft.title,'一次探店分享')
  for(const secret of ['57','隐藏位置','街道','私人日记','secret-visit','2026-10-16'])
    assert.ok(!JSON.stringify(draft).includes(secret))
})
test('editing community draft never changes private objects and cancel keeps source intact',()=>{
  const f=setup(),privateEntry={id:'private-id',drinkLabel:'自己的酒',
    note:'私人备注',personalRating:5,photoRefs:['secret'],contextDetails:{home:{preparationNote:'私人配料'}}}
  const old=structuredClone(privateEntry),d=f.repo.fromDrink(privateEntry)
  const updated=f.repo.saveDraft(d.id,{...validFields(),title:'公开由我决定'},1)
  assert.equal(updated.revision,2)
  assert.equal(updated.title,'公开由我决定')
  f.repo.discardDraft(d.id)
  assert.equal(f.repo.getDraft(d.id),null)
  assert.deepEqual(privateEntry,old)
})
test('local draft persist failure does not pretend saved and retains existing snapshot',()=>{
  const f=setup(),d=f.repo.newDraft()
  const before=structuredClone(f.disk.get(COMMUNITY_DRAFT_PREFIX+'verified-A'))
  const original=f.disk.set.bind(f.disk)
  f.disk.set=()=>{throw Error('dangerous internal secret: drink body')}
  assert.throws(()=>f.repo.saveDraft(d.id,validFields(),1),e=>
    e.code==='STORAGE'&&!e.message.includes('secret'))
  f.disk.set=original
  assert.deepEqual(f.disk.get(COMMUNITY_DRAFT_PREFIX+'verified-A'),before)
})
test('stale expectedRevision cannot silently overwrite local saved draft',()=>{
  const f=setup(),d=f.repo.newDraft()
  f.repo.saveDraft(d.id,validFields(),1)
  assert.throws(()=>f.repo.saveDraft(d.id,{...validFields(),title:'stale'},1),
    e=>e.code==='CONFLICT')
})
test('normal local editor submission fails closed when moderation API is missing',async()=>{
  const f=setup(),d=f.repo.newDraft()
  const saved=f.repo.saveDraft(d.id,validFields(),1)
  await assert.rejects(f.repo.submitForReview(d.id,saved.revision),
    e=>e.code==='PUBLISH_UNAVAILABLE')
  assert.equal(f.repo.getDraft(d.id).status,'local_draft')
  assert.equal(f.publicWrites(),0)
})
test('injected verified review service can only ACK pending review, not auto publish',async()=>{
  const f=setup({withPublisher:true}),d=f.repo.newDraft()
  const saved=f.repo.saveDraft(d.id,validFields(),1)
  const response=await f.repo.submitForReview(saved.id,saved.revision)
  assert.equal(response.moderationStatus,'pending_review')
  assert.equal(response.visibility,'private')
  assert.equal(f.repo.getDraft(saved.id).status,'pending_review')
  assert.equal(f.calls(),1)
  assert.throws(()=>f.repo.discardDraft(saved.id),e=>e.code==='CONFLICT')
})
test('unapproved, private, deleted and unverified author records are filtered from public read',async()=>{
  const f=setup({withSource:true})
  const page=await f.repo.listPublic()
  assert.deepEqual(page.posts.map(p=>p.id),['approved-post-1'])
  assert.equal((await f.repo.getPublic('hidden'))?.id,undefined)
  assert.equal((await f.repo.getPublic('approved-post-1')).id,'approved-post-1')
  assert.deepEqual(publicApprovedPosts([fakePost({authorDisplayName:''}),
    fakePost({moderationStatus:'hidden'}),fakePost({visibility:'private'})]),[])
})
test('public read projection strips every unexpected private field, never exposes personal rating',()=>{
  const raw={...fakePost(),personalRating:4,note:'secret',privateEntryId:'secret-id',
    coordinates:{latitude:1,longitude:2},likes:999}
  const posts=publicApprovedPosts([raw])
  assert.equal(posts.length,1)
  for(const property of ['note','personalRating','privateEntryId','coordinates','likes'])
    assert.equal(Object.hasOwn(posts[0],property),false)
})
test('commercial content must declare sponsor, never invent media URLs or verified author',()=>{
  assert.throws(()=>validateCommunityFields({...validFields(),
    type:'promotion',isSponsored:true,sponsorName:null}),e=>e.code==='INVALID')
  assert.throws(()=>validateCommunityFields({...validFields(),
    isSponsored:false,sponsorName:'injected brand'}),e=>e.code==='INVALID')
  assert.throws(()=>validateCommunityFields({...validFields(),
    images:[{url:'wxfile://tmp/private.png',source:'camera',licensed:true}]}),e=>e.code==='INVALID')
  assert.equal(validateCommunityFields({...validFields(),
    isSponsored:true,sponsorName:'合法标注的合作方'}).sponsorName,'合法标注的合作方')
})
test('legacy Sites dev posts are not automatically treated as approved public posts',async()=>{
  const f=setup()
  const page=await f.repo.listPublic()
  assert.deepEqual(page.posts,[])
  assert.equal(page.nextCursor,null)
  assert.equal(f.repo.publicAvailable(),false)
  assert.deepEqual(f.disk.get('jiuji.react.posts')[0].id,'old-post')
})


test('community draft author, local ID and visibility cannot be overwritten by a forged runtime payload',()=>{
  const f=setup(),d=f.repo.newDraft()
  const spoof={...validFields(),authorUserId:'attacker',id:'public-forgery',
    visibility:'public',status:'approved',revision:999,privateEntryId:'secret-private-record'}
  const saved=f.repo.saveDraft(d.id,spoof,1)
  assert.equal(saved.authorUserId,'verified-A')
  assert.equal(saved.id,d.id)
  assert.equal(saved.visibility,'private')
  assert.equal(saved.status,'local_draft')
  assert.equal(saved.revision,2)
  assert.equal(Object.hasOwn(saved,'privateEntryId'),false)
})
