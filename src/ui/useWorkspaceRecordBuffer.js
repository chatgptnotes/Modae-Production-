import { useState, useSyncExternalStore } from 'react'
import { workspaceDrafts } from '../workspaceDrafts.js'
import { workspaceSyncState, subscribeWorkspaceSync, workspaceRecordResolution } from '../workspaceSyncState.js'
import { reconcileEditorBuffer } from '../workspaceReconcile.js'

const snapshot=()=>workspaceSyncState.revision
export function useWorkspaceRecordBuffer(entity,id,source,normalize) {
  useSyncExternalStore(subscribeWorkspaceSync,snapshot,snapshot)
  const resolution=workspaceRecordResolution(entity,id)
  const [buffer,setBuffer]=useState(()=>({id,source,value:normalize(source),resolution}))
  const next=reconcileEditorBuffer(buffer,{
    id,source,resolution,dirty:!workspaceSyncState.enabled || !!workspaceDrafts.get(entity,id),
  },normalize)
  // React retries this component before committing its children or handlers.
  if(next!==buffer)setBuffer(next)
  const setValue=value=>setBuffer(previous=>({id,source,resolution,value:typeof value==='function'?value(previous.value):value}))
  return [next.value,setValue]
}
