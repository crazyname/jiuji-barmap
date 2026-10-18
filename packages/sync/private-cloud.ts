// SPDX-License-Identifier: MPL-2.0
// PR-08 private-only asynchronous sync coordinator. The PR-03 synchronous
// repository is NOT a network API. All writes here are local until acknowledged.
import type { DrinkEntry, DrinkEntryChanges, NewDrinkEntry, NewVisitSession,
  VisitSession, VisitSessionChanges } from '../core/src/models'
import type { CocktailArchiveGroup, PrivateJournalRepository } from '../core/src/journal-contracts'

export type CloudKind = 'drink' | 'visit'
export type CloudAction = 'create' | 'update' | 'delete' | 'link'
export type CloudPhase = 'pending' | 'syncing' | 'synced' | 'failed' | 'conflict'
export type CloudCursor = { before: string; beforeId: string }
export type CloudPage<T> = { records: T[]; nextCursor: CloudCursor | null }
export class CloudSyncError extends Error {
  readonly code: 'AUTH_REQUIRED'|'NETWORK'|'CONFLICT'|'STORAGE'|'INVALID'|'NOT_FOUND'
  readonly status?: number
  constructor(code: CloudSyncError['code'], message: string, status?: number) {
    super(message);this.name='CloudSyncError';this.code=code;this.status=status
  }
}
export interface CloudRemote {
  listDrinks(cursor?: CloudCursor): Promise<CloudPage<DrinkEntry>>
  listVisits(cursor?: CloudCursor): Promise<CloudPage<VisitSession>>
  getDrink(id: string): Promise<DrinkEntry | null>
  getVisit(id: string): Promise<VisitSession | null>
  createDrink(input: NewDrinkEntry, mutationId: string): Promise<DrinkEntry>
  createVisit(input: NewVisitSession, mutationId: string): Promise<VisitSession>
  updateDrink(id: string, changes: DrinkEntryChanges, expectedRevision: number): Promise<DrinkEntry>
  updateVisit(id: string, changes: VisitSessionChanges, expectedRevision: number): Promise<VisitSession>
  linkDrink(id: string, visitId: string | null, expectedRevision: number): Promise<DrinkEntry>
  deleteDrink(id: string, expectedRevision: number): Promise<void>
  deleteVisit(id: string, expectedRevision: number): Promise<void>
}
export interface CloudStorage {
  read(key: string): unknown
  write(key: string, value: unknown): void
  /** Optional explicit, lossless repair of a damaged redundant slot. */
  repair?(key:string):void
}
export interface CloudIdentity { verifiedUserId(): string | null }
export type CloudOperation = {
  opId: string; kind: CloudKind; action: CloudAction; localId: string
  payload: Record<string, unknown>; expectedRevision?: number
  status: Exclude<CloudPhase,'synced'>; error?: string
  // True once a request may have reached the server; non-create retries must
  // check remote state before replaying conditional mutations.
  uncertain?: boolean
  remote?: DrinkEntry | VisitSession | null
}
export type CloudSnapshot = {
  schema: 1; ownerUserId: string; drinks: DrinkEntry[]; visits: VisitSession[]
  operations: CloudOperation[]; idMap: Record<string,string>
  refreshed: boolean; error: string | null; syncing: boolean
}
const PREFIX='jiuji-private-cloud-v1:'
const copy=<T>(x:T):T=>JSON.parse(JSON.stringify(x)) as T
const key=(id:string)=>PREFIX+encodeURIComponent(id)
function blank(ownerUserId:string):CloudSnapshot {
  return {schema:1,ownerUserId,drinks:[],visits:[],operations:[],idMap:{},
    refreshed:false,error:null,syncing:false}
}
function valid(snapshot: unknown, owner: string): snapshot is CloudSnapshot {
  if(!snapshot || typeof snapshot!=='object')return false
  const v=snapshot as Partial<CloudSnapshot>
  return v.schema===1 && v.ownerUserId===owner && Array.isArray(v.drinks) &&
    Array.isArray(v.visits) && Array.isArray(v.operations) &&
    [...v.drinks,...v.visits].every(row=>!!row && row.ownerUserId===owner &&
      row.visibility==='private' && typeof row.id==='string' && row.id.length>0 &&
      Number.isSafeInteger(row.revision) && row.revision>=1) &&
    v.operations.every(op=>!!op && ['drink','visit'].includes(op.kind) &&
      ['create','update','delete','link'].includes(op.action) &&
      ['pending','syncing','failed','conflict'].includes(op.status) &&
      typeof op.opId==='string' && typeof op.localId==='string') &&
    !!v.idMap && typeof v.idMap==='object' &&
    Object.entries(v.idMap).every(([k,val])=>typeof k==='string'&&typeof val==='string')
}
const isLocal=(id:string)=>id.startsWith('pending:')
const assertRev=(n:number)=>{if(!Number.isSafeInteger(n)||n<1)
  throw new CloudSyncError('INVALID','记录版本号无效')}
export class CloudJournalCoordinator {
  private state: CloudSnapshot | null=null
  private listeners=new Set<()=>void>()
  private running: Promise<void> | null=null
  private serial=0
  private storageBlocked=false
  private deps:{identity:CloudIdentity; storage:CloudStorage; remote:CloudRemote;
    newId:()=>string; now:()=>string}
  constructor(deps:{identity:CloudIdentity; storage:CloudStorage; remote:CloudRemote;
    newId:()=>string; now:()=>string}) {this.deps=deps}
  subscribe(listener:()=>void):()=>void {
    this.listeners.add(listener);return ()=>{this.listeners.delete(listener)}
  }
  private emit(){for(const listener of [...this.listeners])listener()}
  invalidate():void {
    this.serial++;this.state=null;this.storageBlocked=false
    // Old in-flight HTTP requests cannot block another verified account's sync.
    // Their old serial fails ensure() after any response and cannot write B's data.
    this.running=null
    this.emit()
  }
  private owner():string {
    const owner=this.deps.identity.verifiedUserId()
    if(!owner) {if(this.state)this.invalidate();throw new CloudSyncError('AUTH_REQUIRED','未认证，无法访问私人记录')}
    return owner
  }
  private active():CloudSnapshot {
    const owner=this.owner()
    if(this.state && this.state.ownerUserId!==owner)this.storageBlocked=false
    if(this.storageBlocked)
      throw new CloudSyncError('STORAGE','本机存储未确认，请恢复后再操作')
    if(this.state?.ownerUserId!==owner) {
      this.serial++
      this.running=null
      let saved:unknown
      try {saved=this.deps.storage.read(key(owner))}
      catch {throw new CloudSyncError('STORAGE','设备存储读取失败')}
      if(saved!==undefined && saved!==null && !valid(saved,owner))
        throw new CloudSyncError('STORAGE','私人队列归属或结构校验失败')
      this.state=saved ? copy(saved as CloudSnapshot) : blank(owner)
      this.state.syncing=false
      for(const op of this.state.operations)
        if(op.status==='syncing') {op.status='pending';op.uncertain=true}
      this.emit()
    }
    return this.state!
  }
  getSnapshot():CloudSnapshot {return copy(this.active())}
  /** Deliberate user-initiated re-read after quota/partial storage failure.
   * Never delete any storage key, operation or server ID mapping. */
  recoverStorage():CloudSnapshot {
    this.serial++
    this.state=null;this.running=null;this.storageBlocked=false
    try {
      const owner=this.owner()
      this.deps.storage.repair?.(key(owner))
      return this.getSnapshot()
    }
    catch(error) {
      this.storageBlocked=true
      throw error instanceof CloudSyncError?error:
        new CloudSyncError('STORAGE','私人记录存储尚无法恢复')
    }
  }
  private commit(next:CloudSnapshot) {
    if(this.owner()!==next.ownerUserId)throw new CloudSyncError('AUTH_REQUIRED','账户已切换')
    const persisted={...next,syncing:false}
    try {this.deps.storage.write(key(next.ownerUserId),copy(persisted))}
    catch {
      this.storageBlocked=true
      this.emit() // React must immediately show STORAGE rather than stale "synced".
      throw new CloudSyncError('STORAGE','设备存储失败，尚未确认保存，请检查空间并恢复')
    }
    this.state=next;this.emit()
  }
  private update(action:(draft:CloudSnapshot)=>void) {
    const draft=this.getSnapshot();action(draft);this.commit(draft)
  }
  private id(){return this.deps.newId()}
  private op(kind:CloudKind,action:CloudAction,localId:string,
    payload:Record<string,unknown>,expectedRevision?:number):CloudOperation {
    return {opId:this.id(),kind,action,localId,payload:copy(payload),expectedRevision,
      status:'pending',uncertain:false}
  }
  private time(){return this.deps.now()}
  private getRow(kind:CloudKind,id:string):DrinkEntry|VisitSession {
    const state=this.active()
    const real=state.idMap[id]||id
    const item=(kind==='drink'?state.drinks:state.visits).find(x=>x.id===real)
    if(!item)throw new CloudSyncError('NOT_FOUND','私人记录不存在')
    return item
  }
  createDrink(input:NewDrinkEntry,mutationId:string):DrinkEntry {
    const owner=this.owner(), state=this.active()
    const old=state.operations.find(o=>o.kind==='drink'&&o.action==='create'&&
      o.payload.clientMutationId===mutationId)
    if(old)return copy(this.getRow('drink',old.localId)) as DrinkEntry
    if(!input.drinkLabel?.trim() || !input.consumedAt || !['bar','home','other'].includes(input.contextKind))
      throw new CloudSyncError('INVALID','饮用记录缺少必要信息')
    const id='pending:'+this.id(), now=this.time()
    const row:DrinkEntry={id,ownerUserId:owner,drinkLabel:input.drinkLabel,
      cocktailId:input.cocktailId??null,recipeVariantId:input.recipeVariantId??null,
      visitSessionId:input.visitSessionId??null,consumedAt:input.consumedAt,
      contextKind:input.contextKind,photoRefs:copy(input.photoRefs??[]),note:input.note??null,
      personalRating:input.personalRating??null,contextDetails:copy(input.contextDetails??{}),
      visibility:'private',createdAt:now,updatedAt:now,revision:1,clientMutationId:mutationId}
    this.update(d=>{d.drinks.push(row);d.operations.push(this.op('drink','create',id,
      {...copy(input),clientMutationId:mutationId}))})
    return copy(row)
  }
  createVisit(input:NewVisitSession,mutationId:string):VisitSession {
    const owner=this.owner(),state=this.active()
    const old=state.operations.find(o=>o.kind==='visit'&&o.action==='create'&&
      o.payload.clientMutationId===mutationId)
    if(old)return copy(this.getRow('visit',old.localId)) as VisitSession
    if(!input.occurredAt)throw new CloudSyncError('INVALID','缺少探店时间')
    const id='pending:'+this.id(), now=this.time()
    const row:VisitSession={id,ownerUserId:owner,barId:input.barId??null,
      placeLabel:input.placeLabel??null,occurredAt:input.occurredAt,note:input.note??null,
      visibility:'private',createdAt:now,updatedAt:now,revision:1,clientMutationId:mutationId}
    this.update(d=>{d.visits.push(row);d.operations.push(this.op('visit','create',id,
      {...copy(input),clientMutationId:mutationId}))})
    return copy(row)
  }
  private change(kind:CloudKind,id:string,patch:Record<string,unknown>,
    expectedRevision:number,action:'update'|'link'):DrinkEntry|VisitSession {
    assertRev(expectedRevision)
    const row=this.getRow(kind,id)
    id=row.id
    if(row.revision!==expectedRevision)throw new CloudSyncError('CONFLICT','本机记录版本已变化')
    const active=this.active()
    if(active.operations.some(o=>o.localId===id && o.status==='conflict'))
      throw new CloudSyncError('CONFLICT','存在未解决的服务器冲突')
    const created=active.operations.find(o=>o.localId===id&&o.action==='create')
    const next={...row,...copy(patch),revision:row.revision+1,updatedAt:this.time()}
    this.update(d=>{
      const rows=kind==='drink'?d.drinks:d.visits
      const index=rows.findIndex(x=>x.id===id)
      if(kind==='drink')d.drinks[index]=next as DrinkEntry
      else d.visits[index]=next as VisitSession
      if(created && created.status!=='syncing') {
        const original=d.operations.find(o=>o.opId===created.opId)!
        // Edits BEFORE an upload begins fold into the original stable mutation.
        if(action==='link') original.payload.visitSessionId=patch.visitSessionId
        else Object.assign(original.payload,copy(patch))
        original.status='pending'
      } else {
        // If the create request is ALREADY in flight, never rewrite its payload:
        // a delayed server ACK would otherwise erase this newer local edit.
        // The subsequent update applies to the new server revision 1.
        const expected=created ? 1+d.operations.filter(o=>o.localId===id&&
          o.action!=='create').length : expectedRevision
        d.operations.push(this.op(kind,action,id,copy(patch),expected))
      }
    })
    return copy(next)
  }
  updateDrink(id:string,changes:DrinkEntryChanges,expectedRevision:number):DrinkEntry {
    return this.change('drink',id,changes,expectedRevision,'update') as DrinkEntry
  }
  updateVisit(id:string,changes:VisitSessionChanges,expectedRevision:number):VisitSession {
    return this.change('visit',id,changes,expectedRevision,'update') as VisitSession
  }
  linkDrink(id:string,visitSessionId:string|null,expectedRevision:number):DrinkEntry {
    if(visitSessionId && !this.active().visits.some(v=>v.id===this.resolveId(visitSessionId!)))
      throw new CloudSyncError('NOT_FOUND','关联的探店不存在')
    return this.change('drink',id,{visitSessionId:visitSessionId?this.resolveId(visitSessionId):null},
      expectedRevision,'link') as DrinkEntry
  }
  private remove(kind:CloudKind,id:string,expectedRevision:number) {
    assertRev(expectedRevision)
    const row=this.getRow(kind,id)
    id=row.id
    if(row.revision!==expectedRevision)throw new CloudSyncError('CONFLICT','本机版本冲突')
    if(this.active().operations.some(o=>o.localId===id&&o.status==='conflict'))
      throw new CloudSyncError('CONFLICT','请先解决服务器冲突')
    this.update(d=>{
      const queue=d.operations
      const unsent=queue.find(o=>o.kind===kind&&o.localId===id&&o.action==='create')
      if(unsent && unsent.status!=='syncing') {
        d.operations=queue.filter(o=>o.localId!==id)
      }else {
        // A create in flight may already have committed on the server.
        // Keep a dependent deletion instead of cancelling its idempotent ACK.
        const expected=unsent ? 1+queue.filter(o=>o.localId===id&&
          o.action!=='create').length : expectedRevision
        d.operations.push(this.op(kind,'delete',id,{},expected))
      }
      if(kind==='drink')d.drinks=d.drinks.filter(x=>x.id!==id)
      else {
        d.visits=d.visits.filter(x=>x.id!==id)
        for(const drink of d.drinks) if(drink.visitSessionId===id) {
          drink.visitSessionId=null
          drink.revision++
          drink.updatedAt=this.time()
          // If the drink is already persisted remotely, the server deleteVisit
          // atomically detaches it. A pending local create must be sent unlinked.
          const pending=d.operations.find(o=>o.localId===drink.id&&o.action==='create')
          if(pending)pending.payload.visitSessionId=null
        }
      }
    })
  }
  deleteDrink(id:string,expectedRevision:number):void{this.remove('drink',id,expectedRevision)}
  deleteVisit(id:string,expectedRevision:number):void{this.remove('visit',id,expectedRevision)}
  localRepository():PrivateJournalRepository {
    const cloud=this
    const sort=<T extends {id:string}>(rows:T[],field:'consumedAt'|'occurredAt'):T[] =>
      rows.sort((a,b)=>String((b as any)[field]).localeCompare(String((a as any)[field]))||
        a.id.localeCompare(b.id))
    return {
      createDrink:(x,m)=>cloud.createDrink(x,m),createVisit:(x,m)=>cloud.createVisit(x,m),
      getDrink:id=>copy(cloud.active().drinks.find(x=>x.id===cloud.resolveId(id))||null),
      getVisit:id=>copy(cloud.active().visits.find(x=>x.id===cloud.resolveId(id))||null),
      listDrinks:()=>sort(copy(cloud.active().drinks),'consumedAt'),
      listVisits:()=>sort(copy(cloud.active().visits),'occurredAt'),
      updateDrink:(id,x,r)=>cloud.updateDrink(id,x,r),updateVisit:(id,x,r)=>cloud.updateVisit(id,x,r),
      linkDrink:(id,v,r)=>cloud.linkDrink(id,v,r),
      deleteDrink:(id,r)=>cloud.deleteDrink(id,r),deleteVisit:(id,r)=>cloud.deleteVisit(id,r),
      listDrinksForVisit:id=>{
        cloud.getRow('visit',id)
        const resolved=cloud.resolveId(id)
        return sort(copy(cloud.active().drinks.filter(x=>x.visitSessionId===resolved)),'consumedAt')
      },
      groupDrinksByCocktail:():CocktailArchiveGroup[]=>{
        const groups=new Map<string,CocktailArchiveGroup>()
        for(const entry of sort(copy(cloud.active().drinks),'consumedAt')) {
          const label=entry.drinkLabel
          const groupKey=entry.cocktailId!==null?'cocktail:'+entry.cocktailId:
            'custom:'+entry.drinkLabel.normalize('NFKC').trim().toLocaleLowerCase()
          if(!groups.has(groupKey))groups.set(groupKey,{
            key:groupKey,label,cocktailId:entry.cocktailId,entries:[]})
          groups.get(groupKey)!.entries.push(copy(entry))
        }
        return [...groups.values()].map(g=>({...g,entries:sort(g.entries,'consumedAt')}))
      }
    }
  }
  resolveId(id:string):string {return this.mapped(id,this.active())||id}
  status(kind:CloudKind,id:string):CloudPhase {
    const snapshot=this.active()
    const resolved=this.resolveId(id)
    const ops=snapshot.operations.filter(o=>(o.localId===id||o.localId===resolved)&&o.kind===kind)
    if(!ops.length)return 'synced'
    const last=ops[ops.length-1]
    return last.status
  }
  private ensure(owner:string,serial:number):void {
    if(this.owner()!==owner || this.serial!==serial)
      throw new CloudSyncError('AUTH_REQUIRED','账户已切换，停止同步')
  }
  private mapped(id:string|null, state:CloudSnapshot):string|null {
    if(id===null)return null
    return state.idMap[id]||id
  }
  private equalExpected(remote: DrinkEntry|VisitSession, fields:Record<string,unknown>):boolean {
    return Object.entries(fields).every(([key,value])=>
      JSON.stringify((remote as unknown as Record<string,unknown>)[key]??null)===
      JSON.stringify(value??null))
  }
  private async reconcile(op:CloudOperation,remoteId:string):Promise<{
    acknowledged:boolean; row?:DrinkEntry|VisitSession }> {
    if(!op.uncertain || op.action==='create')return {acknowledged:false}
    // One-time GET before retry protects against a server-committed conditional
    // mutation whose ACK could not be durably persisted on the device.
    const current=op.kind==='drink'
      ?await this.deps.remote.getDrink(remoteId):await this.deps.remote.getVisit(remoteId)
    if(op.action==='delete' && !current)return {acknowledged:true}
    if(!current || !Number.isSafeInteger(op.expectedRevision))
      throw new CloudSyncError('CONFLICT','无法确认服务器执行结果，保留本地草稿')
    if(current.revision===op.expectedRevision)return {acknowledged:false}
    const fields=op.action==='link'
      ?{visitSessionId:this.mapped(op.payload.visitSessionId as string|null,this.getSnapshot())}
      :op.payload
    if(op.action!=='delete' && current.revision===op.expectedRevision!+1 &&
        this.equalExpected(current,fields))return {acknowledged:true,row:current}
    throw new CloudSyncError('CONFLICT','服务器记录已变化，不能安全重试')
  }
  private async flush(owner:string,serial:number):Promise<void> {
    // A drink can be created before a visit and linked to that newly created
    // offline visit later. Upload pending visit creations first so every queued
    // drink/link can resolve its temporary visit ID; preserve the relative order
    // of all other mutations (including edits/deletions of each entity).
    const initial=this.getSnapshot().operations
      .map((op,index)=>({op,index}))
      .sort((a,b)=>Number(b.op.kind==='visit'&&b.op.action==='create')-
        Number(a.op.kind==='visit'&&a.op.action==='create')||a.index-b.index)
      .map(item=>item.op.opId)
    for(const opId of initial) {
      this.ensure(owner,serial)
      const state=this.getSnapshot(), op=state.operations.find(x=>x.opId===opId)
      if(!op)continue
      if(op.status==='conflict')break
      this.update(s=>{const target=s.operations.find(x=>x.opId===opId)!;
        target.status='syncing';target.uncertain=true;target.error=undefined})
      try {
        const snapshot=this.getSnapshot()
        const remoteId=this.mapped(op.localId,snapshot)!
        let server:DrinkEntry|VisitSession|undefined
        // Using op from the pre-upload snapshot preserves the previous uncertain
        // flag; the "syncing" marker was durably saved immediately above.
        const recovery=await this.reconcile(op,remoteId)
        this.ensure(owner,serial)
        if(recovery.acknowledged)server=recovery.row
        else if(op.action==='create') {
          const payload=copy(op.payload),mutationId=String(payload.clientMutationId)
          delete payload.clientMutationId
          if(op.kind==='drink') {
            const visit=this.mapped((payload.visitSessionId as string|null)||null,snapshot)
            if(visit && isLocal(visit))throw new CloudSyncError('INVALID','等待探店先同步')
            payload.visitSessionId=visit
            server=await this.deps.remote.createDrink(payload as NewDrinkEntry,mutationId)
          } else server=await this.deps.remote.createVisit(payload as NewVisitSession,mutationId)
        }else if(op.action==='delete') {
          if(op.kind==='drink')await this.deps.remote.deleteDrink(remoteId,op.expectedRevision!)
          else await this.deps.remote.deleteVisit(remoteId,op.expectedRevision!)
        }else if(op.action==='link') {
          const visit=this.mapped(op.payload.visitSessionId as string|null,snapshot)
          if(visit && isLocal(visit))throw new CloudSyncError('INVALID','等待探店先同步')
          server=await this.deps.remote.linkDrink(remoteId,visit,op.expectedRevision!)
        }else if(op.kind==='drink') server=await this.deps.remote.updateDrink(
          remoteId,op.payload as DrinkEntryChanges,op.expectedRevision!)
        else server=await this.deps.remote.updateVisit(remoteId,
          op.payload as VisitSessionChanges,op.expectedRevision!)
        this.ensure(owner,serial)
        if(server && (server.ownerUserId!==owner || server.visibility!=='private'))
          throw new CloudSyncError('AUTH_REQUIRED','服务器返回记录归属与当前身份不符')
        this.update(next=>{
          next.operations=next.operations.filter(x=>x.opId!==opId)
          if(server) {
            const kind=op.kind,local=op.localId, rows=kind==='drink'?next.drinks:next.visits
            const index=rows.findIndex(x=>x.id===local)
            if(isLocal(local)) {
              next.idMap[local]=server.id
              // Dependent queued drinks still refer to temporary visit IDs until upload.
              if(kind==='visit')for(const drink of next.drinks)
                if(drink.visitSessionId===local)drink.visitSessionId=server.id
            }
            const later=next.operations.some(x=>x.localId===local)
            if(index>=0 && !later) {
              if(kind==='drink')next.drinks[index]=server as DrinkEntry
              else next.visits[index]=server as VisitSession
            } else if(index>=0 && isLocal(local))rows[index].id=server.id
            for(const subsequent of next.operations)
              if(subsequent.localId===local)subsequent.localId=server.id
          }
        })
      }catch(error) {
        if(this.storageBlocked)throw error
        this.ensure(owner,serial)
        const syncError=error instanceof CloudSyncError?error:
          new CloudSyncError('NETWORK','网络请求未完成，保留待同步记录')
        const remoteId=this.mapped(op.localId,this.getSnapshot())!
        let current:DrinkEntry|VisitSession|null=null
        if(syncError.code==='CONFLICT') {
          try {current=op.kind==='drink'?
            await this.deps.remote.getDrink(remoteId):
            await this.deps.remote.getVisit(remoteId)}catch{}
        }
        this.ensure(owner,serial)
        if(current && (current.ownerUserId!==owner || current.visibility!=='private'))
          current=null
        this.update(next=>{
          const target=next.operations.find(x=>x.opId===opId)
          if(target) {
            target.status=syncError.code==='CONFLICT'?'conflict':'failed'
            target.error=syncError.message
            if(syncError.code==='CONFLICT')target.remote=current
          }
          next.error=syncError.message
        })
        break
      }
    }
  }
  async sync():Promise<void> {
    if(this.running)return this.running
    const owner=this.owner()
    this.active() // load account namespace BEFORE locking the generation
    const serial=this.serial
    const task=(async()=>{
      this.update(x=>{x.syncing=true;x.error=null})
      try {
        await this.flush(owner,serial)
        this.ensure(owner,serial)
        if(this.getSnapshot().operations.some(x=>x.status==='conflict'||x.status==='failed'))return
        // Pull ALL stable cursor pages, then merge without clobbering unsent local data.
        async function all<T extends {id:string}>(fetch:(cursor?:CloudCursor)=>Promise<CloudPage<T>>) {
          let cursor:CloudCursor|undefined,rows:T[]=[]
          const seen=new Set<string>()
          do {
            const page=await fetch(cursor)
            for(const item of page.records) {
              if(seen.has(item.id))throw new CloudSyncError('NETWORK','服务器分页重复')
              seen.add(item.id);rows.push(item)
            }
            if(!page.nextCursor)break
            const next=page.nextCursor
            if(cursor && next.before===cursor.before && next.beforeId===cursor.beforeId)
              throw new CloudSyncError('NETWORK','服务器分页游标未推进')
            cursor=next
          }while(true)
          return rows
        }
        const visits=await all(cursor=>this.deps.remote.listVisits(cursor))
        this.ensure(owner,serial)
        const drinks=await all(cursor=>this.deps.remote.listDrinks(cursor))
        this.ensure(owner,serial)
        if([...visits,...drinks].some(row=>row.ownerUserId!==owner ||
          row.visibility!=='private'))
          throw new CloudSyncError('AUTH_REQUIRED','服务器数据所属账户不一致')
        this.update(state=>{
          const pending=new Set(state.operations.map(x=>x.localId))
          const locallyPendingVisits=state.visits.filter(x=>pending.has(x.id))
          const locallyPendingDrinks=state.drinks.filter(x=>pending.has(x.id))
          state.visits=[...visits.filter(x=>!pending.has(x.id)),...locallyPendingVisits]
          state.drinks=[...drinks.filter(x=>!pending.has(x.id)),...locallyPendingDrinks]
          state.refreshed=true
        })
      }catch(e) {
        // Never overwrite an unconfirmed write-ahead recovery slot with stale
        // memory or continue network operations while persistence is blocked.
        if(this.storageBlocked)return
        if(this.deps.identity.verifiedUserId()!==owner || this.serial!==serial)return
        const safe=e instanceof CloudSyncError?e.message:'同步未完成，待重试'
        try {this.update(x=>{x.error=safe})}catch{}
      }finally {
        if(!this.storageBlocked && this.deps.identity.verifiedUserId()===owner &&
          this.serial===serial)
          try {this.update(x=>{x.syncing=false})}catch{}
      }
    })()
    this.running=task
    try {await task}finally{if(this.running===task)this.running=null}
  }
  conflictDecision(opId:string,decision:'reload'|'keep-local'):void {
    const state=this.active(),op=state.operations.find(x=>x.opId===opId)
    if(!op||op.status!=='conflict')throw new CloudSyncError('NOT_FOUND','冲突不存在')
    if(decision==='keep-local')return // persisted draft never auto-overwrites
    this.update(s=>{
      const row=s.operations.find(x=>x.opId===opId)!
      s.operations=s.operations.filter(o=>o.localId!==row.localId)
      const list=row.kind==='drink'?s.drinks:s.visits
      const index=list.findIndex(x=>x.id===row.localId)
      if(index>=0){
        if(row.remote) {
          if(row.kind==='drink')s.drinks[index]=row.remote as DrinkEntry
          else s.visits[index]=row.remote as VisitSession
        }else if(row.kind==='drink')s.drinks.splice(index,1)
        else s.visits.splice(index,1)
      }else if(row.remote){
        // Recover a server record when the offline draft was a deletion.
        if(row.kind==='drink')s.drinks.push(row.remote as DrinkEntry)
        else s.visits.push(row.remote as VisitSession)
      }
      s.error=null
    })
  }
}
