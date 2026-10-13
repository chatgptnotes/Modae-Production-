import { beginWorkspaceInput, releaseWorkspaceInputs, resetWorkspaceInputs } from '../workspaceInputOwnership.js'
import { WorkspaceNavigationGuard } from './WorkspaceNavigationGuard.jsx'
import { DEPLOYMENT_ID, resetAndReload } from '../deployment.js'
import { workspaceProjectionVersion } from '../workspaceAccess.js'
import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useStore } from '../store.jsx'
import { getWorkspaceGeneration } from '../workspaceApi.js'
import { dbEnabled, workspaceRecord } from '../datastore.js'
import { workspaceDrafts, recordKey } from '../workspaceDrafts.js'
import { createWorkspaceCoordinator } from '../workspaceSync.js'
import { workspaceSyncRequest } from '../workspaceSyncApi.js'
import { workspaceSyncState, subscribeWorkspaceSync, syncChanged, watchWorkspace, watchedWorkspace, setSyncEnabled, onWorkspaceCommit, registerWorkspaceEditor, relatedWorkspaceRecords } from '../workspaceSyncState.js'
import { recordFrom, reviewedRecord } from '../workspaceReconcile.js'
import './workspaceSync.css'

const snapshot=()=>workspaceSyncState.revision
export function useWorkspaceWatch(records,views=[]) {
  const key=useRef(Symbol('watch')),signature=JSON.stringify([records,views])
  useEffect(()=>watchWorkspace(key.current,records,views),[signature])
}
export function markWorkspaceEditing(records) {
  if (!workspaceSyncState.enabled) return
  for (const r of records) { const base=workspaceRecord(r.entity,r.id); if(base)workspaceDrafts.edit(r.entity,r.id,base,true) }
}
export function WorkspaceRecordBoundary({records,children}) {
  const [epoch,setEpoch]=useState(0), editorKey=useRef(Symbol('editor'))
  const capture=useWorkspaceEditing(records), signature=JSON.stringify(records)
  useEffect(()=>registerWorkspaceEditor(editorKey.current,records),[signature])
  useEffect(()=>{const discard=e=>{const discarded=e.detail.records||[e.detail];if(records.some(r=>discarded.some(d=>r.entity===d.entity&&r.id===d.id)))setEpoch(n=>n+1)};window.addEventListener('workspace-draft-discard',discard);return()=>window.removeEventListener('workspace-draft-discard',discard)},[signature])
  return <div style={{display:'contents'}} onInputCapture={capture}><WorkspaceEditingHint records={records}/><React.Fragment key={epoch}>{children}</React.Fragment></div>
}
export function useWorkspaceEditing(records) {
  useWorkspaceWatch(records)
  return event=>{
    if(!workspaceSyncState.enabled || !event.target.matches('input,textarea,select,[contenteditable="true"]'))return
    beginWorkspaceInput(event.target,records)
    markWorkspaceEditing(records)
  }
}
export function WorkspaceEditingHint({records}) {
  useSyncExternalStore(subscribeWorkspaceSync,snapshot,snapshot)
  if(!workspaceSyncState.enabled)return null
  const active=workspaceSyncState.editors.filter(e=>e.otherEditors&&e.expiresAt>Date.now()&&records.some(r=>recordKey(r.entity,r.id)===recordKey(e.entity,e.id)))
  return active.length?<div className="workspace-editing-hint" role="status">Another tab is editing this record. Unsaved text is private.</div>:null
}

export function WorkspaceSyncRuntime() {
  const store=useStore(),storeRef=useRef(store);storeRef.current=store
  const actor=store.auth?.user?.id,generation=getWorkspaceGeneration()
  useSyncExternalStore(subscribeWorkspaceSync,snapshot,snapshot)
  const [review,setReview]=useState(null),[message,setMessage]=useState('')
  const coordinatorRef=useRef(null)
  useEffect(()=>{
    setReview(null); setMessage('')
    if(!actor||!generation||!dbEnabled()||!store.authReady)return
    if(workspaceSyncState.generation && workspaceSyncState.generation!==generation){workspaceSyncState.suspended=true;workspaceSyncState.error='Workspace changed. Saving is paused. Copy unsaved inputs before reloading.';syncChanged();return}
    let alive=true,coordinator,fetching=false,queued=null
    let scanPage=1
    const controller=new AbortController(),tokens=new Map()
    const current=()=>alive&&storeRef.current.auth?.user?.id===actor&&getWorkspaceGeneration()===generation&&!workspaceSyncState.suspended
    async function receive(result){
      if(!current()||!result)return
      if(result.kind==='committed'){
        const rows=result.records.filter(r=>['leads','opportunities','proposals','approvals','spares_lines','clarifications'].includes(r?.entity)&&typeof r.id==='string'&&Number.isSafeInteger(r.rev)&&r.rev>0&&(r.available===false||r.data&&typeof r.data==='object'))
        storeRef.current.syncInstall(rows,current);return
      }
      if(result.kind==='editing'){
        workspaceSyncState.editors=(result.records||[]).map(r=>({...r,otherEditors:1,expiresAt:Date.now()+45000}));syncChanged();return
      }
      if(result.deploymentId&&DEPLOYMENT_ID!=='local'&&result.deploymentId!==DEPLOYMENT_ID){void resetAndReload();return}
      if(result.enabled===false){coordinator?.dispose();workspaceSyncState.error='Automatic checks are disabled. Existing drafts remain protected.';syncChanged();return}
      if(result.generation!==generation)return
      if(result.accessVersion!==workspaceProjectionVersion({...storeRef.current.auth.user,role:storeRef.current.role,roles:storeRef.current.roles},storeRef.current.config)){storeRef.current.syncAccessChanged();return}
      if(fetching){queued=result;return}
      fetching=true
      try {
        const own=watchedWorkspace(),keys=new Set(own.records.map(r=>recordKey(r.entity,r.id)))
        const watchedViews=new Set(own.views.map(v=>v.entity))
        const candidates=[...(result.records||[])]
        for(const view of result.views||[])if(watchedViews.has(view.entity)) {
          tokens.set(`${view.entity}:${view.page}`,view.token)
          if(view.page>0)scanPage=view.hasMore&&view.page<100?view.page+1:1
          for(const row of view.records||[]){keys.add(recordKey(row.entity,row.id));candidates.push(row)}
        }
        workspaceSyncState.editors=(result.editing||[]).filter(r=>keys.has(recordKey(r.entity,r.id)));syncChanged()
        const changed=[...new Map(candidates.filter(r=>keys.has(recordKey(r.entity,r.id))).map(r=>[recordKey(r.entity,r.id),r])).values()]
          .filter(r=>!r.available||workspaceRecord(r.entity,r.id)?.rev!==r.rev)
        const clean=[]
        for(const row of changed)if(workspaceDrafts.observe(row.entity,row.id,row))clean.push(row)
        if(clean.length){
          const records=await workspaceSyncRequest({operation:'read_records',records:clean.slice(0,100).map(({entity,id})=>({entity,id})),generation},controller.signal)
          if(current()&&records.generation===generation){if(records.accessVersion!==result.accessVersion){storeRef.current.syncAccessChanged();return}storeRef.current.syncInstall(records.records,current)}
        }
      }catch(e){handleError(e)}finally{fetching=false;if(queued&&current()){const next=queued;queued=null;void receive(next)}}
    }
    function handleError(e){
      if(!alive)return
      if(e.code==='DEPLOYMENT_CHANGED'){void resetAndReload();return}
      if(e.status===401||e.code==='WORKSPACE_ACCESS_REVOKED'){storeRef.current.syncAccessChanged();return}
      workspaceSyncState.error=e.message
      if(e.status===401||e.status===403||e.code==='WORKSPACE_PURGED'){
        workspaceSyncState.suspended=true;coordinator?.dispose()
        workspaceSyncState.error='Access or workspace changed. Saving is paused. Copy any unsaved inputs before reloading.'
      }
      syncChanged()
    }
    workspaceSyncRequest({operation:'sync_capabilities'},controller.signal).then(result=>{
      if(!current())return
      if(result.enabled)workspaceSyncState.generation=generation
      workspaceSyncState.ready=true
      setSyncEnabled(result.enabled===true)
      if(!result.enabled)return
      coordinator=createWorkspaceCoordinator({scope:`${location.origin}:${result.deploymentId}:${actor}:${generation}:${workspaceProjectionVersion({...storeRef.current.auth.user,role:storeRef.current.role,roles:storeRef.current.roles},storeRef.current.config)}`,interests:()=>{
        const own=watchedWorkspace()
        return {...own,records:own.records.map(r=>({...r,rev:workspaceRecord(r.entity,r.id)?.rev||0})),views:(own.views.length===1?[own.views[0],{...own.views[0],page:scanPage}]:own.views).map(v=>({...v,token:tokens.get(`${v.entity}:${v.page}`)||''})),editing:[...workspaceDrafts.entries.values()].filter(e=>Date.now()-e.touchedAt<120000&&own.records.some(r=>r.entity===e.entity&&r.id===e.id)).slice(0,10).map(({entity,id})=>({entity,id}))}
      },check:(batch,signal)=>workspaceSyncRequest({operation:'versions',...batch,generation},signal),receive:r=>{void receive(r)},error:handleError})
      coordinatorRef.current=coordinator
    }).catch(handleError)
    const unsubscribe=onWorkspaceCommit(records=>coordinator?.committed(records.filter(r=>Number.isSafeInteger(r.rev))))
    const stopEditing=workspaceDrafts.subscribe(()=>coordinator?.editing([...workspaceDrafts.entries.values()].filter(e=>Date.now()-e.touchedAt<45000).slice(0,10).map(({entity,id})=>({entity,id}))))
    return()=>{alive=false;controller.abort();coordinator?.dispose();coordinatorRef.current=null;unsubscribe();stopEditing();workspaceSyncState.editors=[];if(storeRef.current.auth?.user?.id!==actor){setSyncEnabled(false);workspaceSyncState.generation='';workspaceSyncState.suspended=false;workspaceSyncState.error='';resetWorkspaceInputs();workspaceDrafts.reset()}}
  },[actor,generation,store.authReady,workspaceProjectionVersion({...store.auth?.user,role:store.role,roles:store.roles},store.config)])
  // Watch changes may result from typing/filtering; they never trigger requests.
  const [saving,setSaving]=useState(''),[saveMessage,setSaveMessage]=useState('')
  const drafts=[...workspaceDrafts.entries.values()]
  const conflicts=[...workspaceDrafts.entries.values()].filter(e=>workspaceDrafts.blocked(e.entity,e.id))
  async function openReview(entry){
    setMessage('')
    const expectedActor=actor,expectedGeneration=generation
    try {
      const result=await workspaceSyncRequest({operation:'read_records',records:[{entity:entry.entity,id:entry.id}]})
      if(storeRef.current.auth?.user?.id!==expectedActor||getWorkspaceGeneration()!==expectedGeneration||result.generation!==expectedGeneration)return
      if(result.accessVersion!==workspaceProjectionVersion({...storeRef.current.auth.user,role:storeRef.current.role,roles:storeRef.current.roles},storeRef.current.config)){storeRef.current.syncAccessChanged();return}
      const remote=result.records[0]
      const local=recordFrom(storeRef.current,entry.entity,entry.id)||{}
      setReview({entry:structuredClone(entry),remote,local:structuredClone(local),choices:{},scope:{actor:expectedActor,generation:expectedGeneration}})
    }catch(e){setMessage(e.message)}
  }
  async function discardReview() {
    const target=review
    const records=relatedWorkspaceRecords([{entity:target.entry.entity,id:target.entry.id}])
    if(records.length>100){setMessage('Too many related editors are open. Close other editors before discarding.');return}
    const sequences=new Map(records.map(r=>[recordKey(r.entity,r.id),workspaceDrafts.get(r.entity,r.id)?.seq]))
    if(!window.confirm(`Discard local edits in this editor and reload these records: ${records.map(r=>`${r.entity}/${r.id}`).join(', ')}? Copy any inputs you want to keep first.`))return
    try {
      const result=await workspaceSyncRequest({operation:'read_records',records,generation:target.scope.generation})
      if(workspaceSyncState.suspended||storeRef.current.auth?.user?.id!==target.scope.actor||getWorkspaceGeneration()!==target.scope.generation||result.generation!==target.scope.generation)return
      if(result.accessVersion!==workspaceProjectionVersion({...storeRef.current.auth.user,role:storeRef.current.role,roles:storeRef.current.roles},storeRef.current.config)){storeRef.current.syncAccessChanged();return}
      if(records.some(r=>workspaceDrafts.get(r.entity,r.id)?.seq!==sequences.get(recordKey(r.entity,r.id)))){setMessage('Your draft changed while loading. Nothing was discarded.');return}
      const currentGroup=relatedWorkspaceRecords(records)
      if(currentGroup.length!==records.length){setMessage('Another related editor opened. Review the discard again.');return}
      if(records.some(r=>!result.records?.some(row=>row.entity===r.entity&&row.id===r.id)))throw new Error('Could not reload every related record. Nothing was discarded.')
      // All asynchronous work and checks finish before changing any draft.
      for(const row of result.records)storeRef.current.syncResolve(row,row.data,target.scope,{discard:true,expectedSeq:sequences.get(recordKey(row.entity,row.id))})
      setReview(null);setMessage('')
      releaseWorkspaceInputs(records)
      window.dispatchEvent(new CustomEvent('workspace-draft-discard',{detail:{records}}))
    }catch(e){setMessage(e.message)}
  }
  if(!workspaceSyncState.enabled)return null
  return <>
    <WorkspaceNavigationGuard enabled={workspaceSyncState.enabled} pending={drafts.some(e=>e.localOnly)}
      onSave={async()=>{const ok=await storeRef.current.saveSelectedRecords(drafts.map(({entity,id})=>({entity,id})));return ok&&![...workspaceDrafts.entries.values()].some(e=>e.localOnly)}}
      onDiscard={()=>{releaseWorkspaceInputs(drafts);const scope={actor,generation};for(const entry of drafts)storeRef.current.syncResolve({entity:entry.entity,id:entry.id,...entry.base,available:entry.base.rev>0},entry.base.data,scope,{discard:true,expectedSeq:entry.seq})}} />
    <aside className="workspace-sync-notice" aria-live="polite">
      <strong>Explicit saves</strong> — typing stays on this device.
      {drafts.map(entry=><div key={recordKey(entry.entity,entry.id)}>
        {entry.id}: {workspaceDrafts.blocked(entry.entity,entry.id)?'Conflict—review required':'Unsaved'}
        <button disabled={!!saving||workspaceDrafts.blocked(entry.entity,entry.id)||workspaceSyncState.suspended} onClick={async()=>{
          document.activeElement?.blur()
          const key=recordKey(entry.entity,entry.id);setSaving(key);setSaveMessage('Saving…')
          try{const ok=await storeRef.current.saveSelectedRecords(relatedWorkspaceRecords([{entity:entry.entity,id:entry.id}]))
            setSaveMessage(ok?'Applied changes saved. Form-only inputs still need their form’s Save action.':'Not saved. Review conflicts or retry the explicit save.')
          }finally{setSaving('')}
        }}>{saving===recordKey(entry.entity,entry.id)?'Saving…':'Save changes'}</button>
      </div>)}
      <button disabled={!!saving||workspaceSyncState.suspended} onClick={async()=>{setSaving('other');try{setSaveMessage(await storeRef.current.saveOtherWorkspaceChanges()?'Other workspace changes saved.':'Not saved. Check pending changes.')}finally{setSaving('')}}}>Save other workspace changes</button>
      {saveMessage&&<p role="status">{saveMessage}</p>}
    </aside>
    {(conflicts.length>0||workspaceSyncState.error)&&<aside className="workspace-sync-notice" aria-live="polite">
      {workspaceSyncState.error&&<p>{workspaceSyncState.error}</p>}
      {conflicts.map(entry=><div key={recordKey(entry.entity,entry.id)}><strong>{entry.id}</strong>: changed elsewhere. Your inputs are preserved; saving this record is paused. <button onClick={()=>openReview(entry)}>Review changes</button></div>)}
      {message&&<p role="alert">{message}</p>}
    </aside>}
    {review&&<div className="workspace-sync-overlay"><section role="dialog" aria-modal="true" aria-labelledby="sync-review-title" className="workspace-sync-review">
      <h2 id="sync-review-title">Review changes — {review.entry.id}</h2>
      <p>Server values are selected by default. Review each field before keeping your changes.</p>
      {!review.remote.available&&<p role="alert">This record is unavailable and cannot be saved. Your local inputs remain in the editor. Copy anything you need before discarding.</p>}
      {review.entry.localOnly&&<p role="alert">This editor contains form inputs that are not included in this comparison. Merging is paused to protect them. Keep reviewing later to copy your inputs, or explicitly discard this editor’s drafts.</p>}
      {[...new Set([...Object.keys(review.entry.base.data||{}),...Object.keys(review.local),...Object.keys(review.remote.data||{})])].filter(k=>JSON.stringify(review.entry.base.data?.[k])!==JSON.stringify(review.local[k])||JSON.stringify(review.entry.base.data?.[k])!==JSON.stringify(review.remote.data?.[k])).map(k=><div className="workspace-sync-field" key={k}>
        <strong>{k}</strong><label>Saved elsewhere<pre>{JSON.stringify(review.remote.data?.[k],null,2)??'(removed)'}</pre></label><label>Your draft<pre>{JSON.stringify(review.local[k],null,2)??'(removed)'}</pre></label>
        {JSON.stringify(review.entry.base.data?.[k])!==JSON.stringify(review.local[k])&&<label><input type="checkbox" checked={review.choices[k]==='mine'} onChange={e=>setReview({...review,choices:{...review.choices,[k]:e.target.checked?'mine':'server'}})} /> Keep my value</label>}
      </div>)}
      <button onClick={()=>setReview(null)}>Keep reviewing later</button>
      <button disabled={review.entry.localOnly||!review.remote.available||workspaceSyncState.suspended} onClick={()=>{
        if(review.entry.seq!==workspaceDrafts.get(review.entry.entity,review.entry.id)?.seq){setReview(null);setMessage('Your draft changed during review. Open review again.');return}
        if(storeRef.current.syncResolve(review.remote,reviewedRecord(review.entry.base.data,review.local,review.remote.data,review.choices),review.scope,{expectedSeq:review.entry.seq}))setReview(null)
        else setMessage('The draft or workspace changed. Open review again.')
      }}>Apply reviewed values</button>
      <button disabled={workspaceSyncState.suspended} onClick={discardReview}>Discard editor drafts</button>
      {message&&<p role="alert">{message}</p>}
    </section></div>}
  </>
}
