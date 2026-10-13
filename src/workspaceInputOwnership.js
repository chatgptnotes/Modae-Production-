import {workspaceDrafts,recordKey} from './workspaceDrafts.js'
import {recordFrom} from './workspaceReconcile.js'
const targets=new WeakMap(),owners=new Map(),elements=new Map()
let active=null
export const activeWorkspaceInput=()=>active
export function beginWorkspaceInput(target,records){
  let owner=targets.get(target);if(!owner){owner=Symbol('input');targets.set(target,owner)}
  owners.set(owner,records);elements.set(owner,target)
  const input={owner,records};active=input
  queueMicrotask(()=>{if(active===input)active=null})
  return input
}
// Only a state update invoked by this input event can acknowledge that input.
// Unrelated saves and updates cannot clear other component-local buffers.
export function appliedWorkspaceInput(input,before,after){
  if(!input||!input.records.some(r=>JSON.stringify(recordFrom(before,r.entity,r.id))!==JSON.stringify(recordFrom(after,r.entity,r.id))))return
  queueMicrotask(()=>{
    if(owners.get(input.owner)!==input.records)return
    owners.delete(input.owner);elements.delete(input.owner)
    for(const r of input.records){
      const draft=workspaceDrafts.get(r.entity,r.id)
      if(draft)draft.localOnly=[...owners.values()].some(group=>group.some(other=>recordKey(other.entity,other.id)===recordKey(r.entity,r.id)))
    }
    workspaceDrafts.notify()
  })
}
export function releaseWorkspaceInputs(records){for(const[owner,group]of owners)if(group.some(r=>records.some(x=>recordKey(x.entity,x.id)===recordKey(r.entity,r.id)))){owners.delete(owner);elements.delete(owner)}}

export function resetWorkspaceInputs(){owners.clear();elements.clear();active=null}

export function releaseWorkspaceElementInputs(root){
  if(!root)return
  const touched=[]
  for(const[owner,records]of owners)if(root.contains(elements.get(owner))){touched.push(...records);owners.delete(owner);elements.delete(owner)}
  for(const r of touched){const draft=workspaceDrafts.get(r.entity,r.id);if(draft)draft.localOnly=[...owners.values()].some(group=>group.some(x=>recordKey(x.entity,x.id)===recordKey(r.entity,r.id)))}
  workspaceDrafts.notify()
}
