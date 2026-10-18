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
export interface CloudStorage { read(key: string): unknown; write(key: string, value: unknown): void }
export interface CloudIdentity { verifiedUserId(): string | null }
export type CloudOperation = {
  opId: string; kind: CloudKind; action: CloudAction; localId: string
  payload: Record<string, unknown>; expectedRevision?: number
  status: Exclude<CloudPhase,'synced'>; error?: string
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
    !!v.idMap && typeof v.idMap==='object'
}
const isLocal=(id:string)=>id.startsWith('pending:')
const assertRev=(n:number)=>{if(!Number.isSafeInteger(n)||n<1)
  throw new CloudSyncError('INVALID','记录版本号无效')}
export class CloudJournalCoordinator {
  private state: CloudSnapshot | null=null
  private listeners=new Set<()=>void>()
  private running: Promise<void> | null=null
  private serial=0
  private deps:{identity:CloudIdentity; storage:CloudStorage; remote:CloudRemote;
    newId:()=>string; now:()=>string}
  constructor(deps:{identity:CloudIdentity; storage:CloudStorage; remote:CloudRemote;
    newId:()=>string; now:()=>string}) {this.deps=deps}
  subscribe(listener:()=>void):()=>void {
    this.listeners.add(listener);return ()=>{this.listeners.delete(listener)}
  }
  private emit(){for(const listener of [...this.listeners])listener()}
  invalidate():void {this.serial++;this.state=null;this.emit()}
  private owner():string {
    const owner=this.deps.identity.verifiedUserId()
    if(!owner) {if(this.state)this.invalidate();throw new CloudSyncError('AUTH_REQUIRED','未认证，无法访问私人记录')}
    return owner
  }
  private active():CloudSnapshot {
    const owner=this.owner()
    if(this.state?.ownerUserId!==owner) {
      this.serial++
      const saved=this.deps.storage.read(key(owner))
      if(saved!==undefined && saved!==null && !valid(saved,owner))
        throw new CloudSyncError('STORAGE','私人队列归属或结构校验失败')
      this.state=saved ? copy(saved as CloudSnapshot) : blank(owner)
      this.state.syncing=false
      for(const op of this.state.operations)
        if(op.status==='syncing')op.status='pending'
      this.emit()
    }
    return this.state!
  }
  getSnapshot():CloudSnapshot {return copy(this.active())}
  private commit(next:CloudSnapshot) {
    if(this.owner()!==next.ownerUserId)throw new CloudSyncError('AUTH_REQUIRED','账户已切换')
    const persisted={...next,syncing:false}
    try {this.deps.storage.write(key(next.ownerUserId),copy(persisted))}
    catch {throw new CloudSyncError('STORAGE','设备存储失败，未确认保存')}
    this.state=next;this.emit()
  }
  private update(action:(draft:CloudSnapshot)=>void) {
    const draft=this.getSnapshot();action(draft);this.commit(draft)
  }
  private id(){return this.deps.newId()}
  private op(kind:CloudKind,action:CloudAction,localId:string,
    payload:Record<string,unknown>,expectedRevision?:number):CloudOperation {
    return {opId:this.id(),kind,action,localId,payload:copy(payload),expectedRevision,
      status:'pending'}
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
      if(created) {
        const original=d.operations.find(o=>o.opId===created.opId)!
        // Edits before first upload fold into the original create; stable mutationId.
        if(action==='link') original.payload.visitSessionId=patch.visitSessionId
        else Object.assign(original.payload,copy(patch))
        original.status='pending'
      } else d.operations.push(this.op(kind,action,id,copy(patch),expectedRevision))
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
    this.update(d=>{
      const queue=d.operations
      const unsent=queue.find(o=>o.kind===kind&&o.localId===id&&o.action==='create')
      if(unsent) {
        d.operations=queue.filter(o=>o.localId!==id)
      }else d.operations.push(this.op(kind,'delete',id,{},expectedRevision))
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
        for(const entry of cloud.active().drinks) {
          const label=entry.drinkLabel.trim()
          const groupKey=entry.cocktailId?'catalog:'+entry.cocktailId:'free:'+label.toLocaleLowerCase()
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
  private async flush(owner:string,serial:number):Promise<void> {
    const initial=this.getSnapshot().operations.map(x=>x.opId)
    for(const opId of initial) {
      this.ensure(owner,serial)
      const state=this.getSnapshot(), op=state.operations.find(x=>x.opId===opId)
      if(!op)continue
      if(op.status==='conflict')break
      this.update(s=>{const target=s.operations.find(x=>x.opId===opId)!;target.status='syncing';target.error=undefined})
      try {
        const snapshot=this.getSnapshot()
        const remoteId=this.mapped(op.localId,snapshot)!
        let server:DrinkEntry|VisitSession|undefined
        if(op.action==='create') {
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
        this.update(state=>{
          const pending=new Set(state.operations.map(x=>x.localId))
          const locallyPendingVisits=state.visits.filter(x=>pending.has(x.id))
          const locallyPendingDrinks=state.drinks.filter(x=>pending.has(x.id))
          state.visits=[...visits.filter(x=>!pending.has(x.id)),...locallyPendingVisits]
          state.drinks=[...drinks.filter(x=>!pending.has(x.id)),...locallyPendingDrinks]
          state.refreshed=true
        })
      }catch(e) {
        // Invalid credentials or logout must not cause a cross-account cache write.
        if(this.deps.identity.verifiedUserId()!==owner)return
        this.update(x=>{x.error=e instanceof Error?e.message:'同步未完成'})
      }finally {
        if(this.deps.identity.verifiedUserId()===owner && this.serial===serial)
          this.update(x=>{x.syncing=false})
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
      }
      s.error=null
    })
  }
}
