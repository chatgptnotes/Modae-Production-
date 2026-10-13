import { workspaceDrafts, recordKey } from './workspaceDrafts.js'
const listeners=new Set(), watches=new Map(), commits=new Set()
const editors=new Map()
const resolutions=new Map()
export const workspaceRecordResolution=(entity,id)=>resolutions.get(recordKey(entity,id))||0
export function resolvedWorkspaceRecord(entity,id){const key=recordKey(entity,id);resolutions.set(key,workspaceRecordResolution(entity,id)+1);syncChanged()}
export function registerWorkspaceEditor(key,records){editors.set(key,records);return()=>editors.delete(key)}
// A boundary remount resets all its children. Include overlapping boundaries
// so discarding one record never silently drops another form's local inputs.
export function relatedWorkspaceRecords(records){
  const related=new Map(records.map(r=>[recordKey(r.entity,r.id),r]))
  let changed=true
  while(changed){
    changed=false
    for(const group of editors.values())if(group.some(r=>related.has(recordKey(r.entity,r.id)))){
      for(const r of group)if(!related.has(recordKey(r.entity,r.id))){related.set(recordKey(r.entity,r.id),r);changed=true}
    }
  }
  return [...related.values()]
}
export const workspaceSyncState={ready:false,enabled:false,editors:[],error:'',revision:0}
export const subscribeWorkspaceSync=fn=>{listeners.add(fn);return()=>listeners.delete(fn)}
export const syncChanged=()=>{workspaceSyncState.revision++;for(const fn of listeners)fn()}
export function setSyncEnabled(enabled){workspaceSyncState.enabled=enabled;syncChanged()}
export function watchWorkspace(key,records,views=[]){watches.set(key,{records,views});syncChanged();return()=>{watches.delete(key);syncChanged()}}
export function watchedWorkspace(){return {records:[...new Map([...watches.values()].flatMap(w=>w.records).map(r=>[recordKey(r.entity,r.id),r])).values()].slice(0,100),views:[...new Map([...watches.values()].flatMap(w=>w.views).map(v=>[`${v.entity}:${v.page}`,v])).values()].slice(0,2)}}
export function committedWorkspace(records){for(const fn of commits)fn(records)}
export const onWorkspaceCommit=fn=>{commits.add(fn);return()=>commits.delete(fn)}
workspaceDrafts.subscribe(syncChanged)
