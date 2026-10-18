// SPDX-License-Identifier: MPL-2.0
// Recoverable, UNENCRYPTED two-slot persistence for offline private queue.
// FNV checksum detects accidental corruption only. It is NOT authentication,
// encryption or tamper resistance; no encryption key is stored on the device.
import { CloudSyncError } from './private-cloud.ts'
import type { CloudStorage } from './private-cloud'

export interface RawPrivateStorage {
  read(key: string): unknown
  write(key: string, value: unknown): void
}
type Envelope={format:'jiuji-cloud-mirror-recovery-v1';sequence:number;
  checksum:string;data:unknown}
const FORMAT='jiuji-cloud-mirror-recovery-v1'
const secondary=(key:string)=>key+':recovery'
function canonical(value:unknown):string {
  return JSON.stringify(value)
}
function checksum(value:unknown):string {
  const text=canonical(value)
  if(typeof text!=='string')throw new CloudSyncError('STORAGE','私人数据无法序列化')
  let hash=2166136261
  for(let i=0;i<text.length;i++) {
    hash^=text.charCodeAt(i)
    hash=Math.imul(hash,16777619)
  }
  return (hash>>>0).toString(16).padStart(8,'0')
}
function envelope(value:unknown):value is Envelope {
  if(!value || typeof value!=='object' || Array.isArray(value))return false
  const raw=value as Partial<Envelope>
  return raw.format===FORMAT && Number.isSafeInteger(raw.sequence) &&
    (raw.sequence as number)>0 && typeof raw.checksum==='string' &&
    raw.checksum===checksum(raw.data)
}
const empty=(v:unknown)=>v===null||v===undefined||v===''
function storageError():CloudSyncError {
  return new CloudSyncError('STORAGE','私人数据存储未确认成功，请检查设备空间，原始数据仍保留')
}
/** Write-ahead recovery slot THEN primary. Never delete a damaged slot.
 * A failed primary write can be recovered from the already-written secondary.
 * Legacy PR-08 snapshots are read as generation 0; never migrate by deleting.
 */
export function createRecoverableCloudStorage(raw:RawPrivateStorage):CloudStorage {
  function slots(key:string) {
    let a:unknown,b:unknown
    try {a=raw.read(key);b=raw.read(secondary(key))}
    catch {throw storageError()}
    const parse=(value:unknown)=>{
      if(empty(value))return {valid:false,empty:true,sequence:-1,data:null}
      if(envelope(value))return {valid:true,empty:false,sequence:value.sequence,data:value.data}
      // Legacy raw PR-08 snapshot (schema 1) is kept byte-for-byte on disk.
      if(value && typeof value==='object' &&
         (value as {schema?:unknown}).schema===1 &&
         (value as {format?:unknown}).format===undefined)
        return {valid:true,empty:false,sequence:0,data:value}
      return {valid:false,empty:false,sequence:-1,data:null}
    }
    return {primary:parse(a),recovery:parse(b)}
  }
  return {
    repair(key){
      const {primary,recovery}=slots(key)
      if(primary.empty && recovery.empty)return
      if(!primary.valid && !recovery.valid)throw storageError()
      // Do not destroy unknown raw bytes: quarantine them BEFORE replacement.
      // Repair is only called through CloudJournalCoordinator.recoverStorage(),
      // never implicitly from a failed normal write or cold start.
      const winner=recovery.valid&&recovery.sequence>primary.sequence?recovery:
        primary.valid?primary:recovery
      const good=winner.sequence>0?
        {format:FORMAT,sequence:winner.sequence,checksum:checksum(winner.data),data:winner.data}:
        winner.data
      try {
        for(const [slot,parsed] of [[key,primary],[secondary(key),recovery]] as const){
          if(!parsed.valid && !parsed.empty) {
            const quarantine=slot+':quarantine'
            const existing=raw.read(quarantine)
            if(!empty(existing))throw storageError()
            const damaged=raw.read(slot)
            raw.write(quarantine,damaged)
            if(JSON.stringify(raw.read(quarantine))!==JSON.stringify(damaged))
              throw storageError()
          }
          if(!parsed.valid || parsed.sequence<winner.sequence) {
            raw.write(slot,good)
            if(JSON.stringify(raw.read(slot))!==JSON.stringify(good))throw storageError()
          }
        }
      }catch{throw storageError()}
    },
    read(key){
      const {primary,recovery}=slots(key)
      if(!primary.valid&&!recovery.valid){
        if(primary.empty&&recovery.empty)return undefined
        throw storageError() // do not overwrite corrupt/unknown bytes
      }
      const winner=recovery.valid && recovery.sequence>primary.sequence?
        recovery:primary.valid?primary:recovery
      return winner.data
    },
    write(key,value){
      const {primary,recovery}=slots(key)
      if((!primary.valid&&!primary.empty)||(!recovery.valid&&!recovery.empty))
        throw storageError() // quarantine unknown/corrupt snapshot; no destructive overwrite
      const latest=Math.max(primary.sequence,recovery.sequence)
      if(latest>=Number.MAX_SAFE_INTEGER-1)throw storageError()
      let pack:Envelope
      try {pack={format:FORMAT,sequence:Math.max(0,latest)+1,checksum:checksum(value),data:value}}
      catch {throw storageError()}
      try {
        raw.write(secondary(key),pack)
        // Check the write is observable before moving the primary.
        const staged=raw.read(secondary(key))
        if(!envelope(staged)||staged.sequence!==pack.sequence)throw storageError()
        raw.write(key,pack)
        const confirmed=raw.read(key)
        if(!envelope(confirmed)||confirmed.sequence!==pack.sequence)throw storageError()
      }catch {throw storageError()}
    }
  }
}
