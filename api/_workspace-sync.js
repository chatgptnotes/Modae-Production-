import { createHash } from 'node:crypto'
import { isActiveUser, matchesAccount } from '../src/userManagement.js'
import { projectWorkspace, canReadWorkspaceRecord, workspaceProjectionVersion } from '../src/workspaceAccess.js'
import { canAccessPage, canPerform, effectiveAccess } from '../src/accessPolicy.js'

const entities = ['leads','opportunities','proposals','approvals','spares_lines','clarifications']
const fail = (message,status=422,code=String(status)) => { throw Object.assign(new Error(message),{status,code}) }
const keyOf = r => `${r.entity}:${r.id}`
export function validateSyncRequest(input) {
  if (!['versions','read_records'].includes(input?.operation) || typeof input.generation !== 'string' || !/^\d+$/.test(input.generation)) fail('Invalid synchronization request.')
  const records = input.records || [], views = input.views || [], editing = input.editing || []
  if (!Array.isArray(records) || records.length>100 || !Array.isArray(views) || views.length>2 || !Array.isArray(editing) || editing.length>10) fail('Synchronization request is too large.')
  if (input.operation==='read_records' && (views.length || editing.length)) fail('Targeted reads cannot include views or editing indicators.')
  for (const row of [...records,...editing]) if (!entities.includes(row?.entity) || typeof row.id !== 'string' || !row.id || row.id.length>200) fail('Invalid watched record.')
  if (new Set(records.map(keyOf)).size !== records.length) fail('Duplicate watched record.')
  for (const v of views) if (!entities.includes(v?.entity) || !Number.isSafeInteger(v.page) || v.page<0 || v.page>100 || v.pageSize!==50 || typeof (v.token || '') !== 'string') fail('Invalid view.')
  if (editing.length && (typeof input.tabId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(input.tabId))) fail('Invalid editing session.')
  return { records, views, editing }
}
export function createEditingPresence({now=Date.now,max=2000}={}) {
  const entries=new Map()
  const prune=()=>{for(const [k,e] of entries) if(e.until<=now()) entries.delete(k)}
  return {
    update(actor,generation,tabId,records) {
      prune()
      for(const [k,e] of entries) if(e.actor===actor && e.tabId===tabId) entries.delete(k)
      for(const row of records) {
        if(entries.size>=max) break
        entries.set(`${actor}:${tabId}:${keyOf(row)}`,{...row,actor,generation,tabId,until:now()+45000})
      }
    },
    read(actor,generation,records) {
      prune()
      return records.map(row=>{
        const others=[...entries.values()].filter(e=>e.actor!==actor && e.generation===generation && keyOf(e)===keyOf(row))
        return {...row,otherEditors:new Set(others.map(e=>e.actor)).size,expiresAt:others.length?Math.max(...others.map(e=>e.until)):0}
      })
    }
  }
}
const presence=createEditingPresence()
const buckets=new Map(),actorBuckets=new Map();let inFlight=0
export const workspaceSyncMetrics={requests:0,queries:0,limited:0}
export function admitSyncActor(actor,now=Date.now()) {
  for(const [key,b] of actorBuckets)if(b.until<=now)actorBuckets.delete(key)
  const bucket=actorBuckets.get(actor)||{count:0,until:now+60000}
  if(bucket.count>=30||!actorBuckets.has(actor)&&actorBuckets.size>=2048){workspaceSyncMetrics.limited++;fail('Wait briefly before checking again.',429,'SYNC_RATE_LIMIT')}
  actorBuckets.set(actor,{...bucket,count:bucket.count+1})
}
export function admitSync(token,now=Date.now()) {
  for(const [k,b] of buckets) if(b.until<=now) buckets.delete(k)
  const key=createHash('sha256').update(token).digest('hex'), bucket=buckets.get(key)||{count:0,until:now+60000}
  if(inFlight>=8 || bucket.count>=30 || !buckets.has(key)&&buckets.size>=2048) fail('Wait briefly before checking again.',429,'SYNC_RATE_LIMIT')
  buckets.set(key,{...bucket,count:bucket.count+1});inFlight++
  return ()=>{inFlight--}
}
const read = async query => { workspaceSyncMetrics.queries++; const result=await (query.abortSignal ? query.abortSignal(AbortSignal.timeout(6000)) : query);if(result.error) throw result.error;return result.data||[] }
// Select authorization metadata only, never proposal bodies for version checks.
const metadata = 'id,rev,deleted_at,owner:data->>owner,oppId:data->>oppId,needed:data->needed,approver:data->>approver,requestedBy:data->>requestedBy'
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export async function workspaceSync(client,auth,input) {
  workspaceSyncMetrics.requests++
  const {records,views,editing}=validateSyncRequest(input)
  const [stateRows,configRows]=await Promise.all([
    read(client.from('records').select('id,data,rev').eq('entity','state').in('id',['users','workspace_generation']).is('deleted_at',null)),
    read(client.from('settings').select('data,rev').eq('id','config').is('deleted_at',null)),
  ])
  const profile=(stateRows.find(r=>r.id==='users')?.data||[]).find(user=>matchesAccount(user,auth)&&isActiveUser(user))
  if(!profile) fail('This account no longer has workspace access.',403,'WORKSPACE_ACCESS_REVOKED')
  const generation=String(stateRows.find(r=>r.id==='workspace_generation')?.data?.value ?? '')
  if(generation!==input.generation) fail('The workspace changed. Refresh before continuing.',409,'WORKSPACE_PURGED')
  const config=configRows[0]?.data||{}, state={config,users:[profile],opportunities:[]}
  const wanted=[...new Map([...records,...editing].map(r=>[keyOf(r),r])).values()]
  const found=new Map()
  await Promise.all(entities.map(async entity=>{
    const ids=wanted.filter(r=>r.entity===entity).map(r=>r.id)
    if(!ids.length) return
    const rows=await read(client.from(entity).select(input.operation==='read_records'?'id,data,rev,deleted_at':metadata).in('id',ids))
    for(const row of rows) found.set(`${entity}:${row.id}`,{...row,entity})
  }))
  const viewRows=await Promise.all(views.map(async view=>{
    if (!effectiveAccess(profile,config).isAdmin && (view.entity==='approvals' ? !canAccessPage(profile,'approvals',config) : view.entity==='proposals' ? !canAccessPage(profile,'proposal',config) : !canReadWorkspaceRecord(profile,view.entity,{},config,state))) return {view,rows:[]}
    let query=client.from(view.entity).select(metadata).is('deleted_at',null)
    if(view.entity==='approvals'&&!effectiveAccess(profile,config).isAdmin&&!canPerform(profile,'commercial.view',config)) {
      // JSON-quoted filter values prevent PostgREST filter injection from role text.
      const role=JSON.stringify(profile.role)
      query=query.or(`data->>approver.eq.${role},data->>requestedBy.eq.${role},data->needed.cs.${JSON.stringify([profile.role])}`)
    }
    // Proposal ownership is in opportunities; page opportunity IDs first.
    if(view.entity==='proposals'&&!effectiveAccess(profile,config).isAdmin&&!canPerform(profile,'commercial.view',config)) return {view,rows:[]}
    const rows=await read(query.order('updated_at',{ascending:false}).order('id',{ascending:true}).range(view.page*50,view.page*50+50))
    for(const row of rows) found.set(`${view.entity}:${row.id}`,{...row,entity:view.entity})
    return {view,rows}
  }))
  const oppIds=[...new Set([...found.values()].filter(r=>['proposals','approvals','spares_lines','clarifications'].includes(r.entity)).map(r=>r.data?.oppId||r.oppId||r.id))]
  if(oppIds.length) state.opportunities=(await read(client.from('opportunities').select('id,owner:data->>owner').in('id',oppIds))).map(r=>({id:r.id,owner:r.owner}))
  const visible=row=>row&&!row.deleted_at&&canReadWorkspaceRecord(profile,row.entity,row.data||row,config,state)
  const availableRecords=records.filter(r=>visible(found.get(keyOf(r))))
  const resultRecords=records.map(r=>{
    const row=found.get(keyOf(r))
    if(!visible(row)) return {...r,rev:undefined,available:false}
    if(input.operation==='read_records') {
      const sliceKey=row.entity==='spares_lines'?'sparesLines':row.entity
      const slice=row.entity==='proposals'?{proposals:{[row.id]:row.data}}:{[sliceKey]:[row.data]}
      const projected=projectWorkspace({...state,...slice},profile)[sliceKey]
      const data=Array.isArray(projected)?projected.find(v=>v.id===row.id):projected?.[row.id]
      return {entity:r.entity,id:r.id,rev:row.rev,available:true,data}
    }
    return {entity:r.entity,id:r.id,rev:row.rev,available:true}
  })
  presence.update(auth.id,generation,input.tabId||'',editing.filter(r=>visible(found.get(keyOf(r)))))
  return {generation,accessVersion:workspaceProjectionVersion(profile,config),records:resultRecords,editing:presence.read(auth.id,generation,availableRecords.map(({entity,id})=>({entity,id}))),views:viewRows.map(({view,rows})=>{
    const permitted=rows.slice(0,50).filter(r=>visible(found.get(`${view.entity}:${r.id}`)))
    const records=permitted.map(r=>({entity:view.entity,id:r.id,rev:r.rev,available:true}))
    const token=digest([generation,configRows[0]?.rev,records,rows.length>50])
    return {...view,token,changed:token!==view.token,records,hasMore:rows.length>50}
  })}
}
