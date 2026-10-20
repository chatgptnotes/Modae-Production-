import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { reconcileWorkspaceCollection } from '../src/workspaceViews.js'
import { DraftRegistry, SYNC_ENTITIES } from '../src/workspaceDrafts.js'
import { recordFrom, replaceRecord, reviewedRecord } from '../src/workspaceReconcile.js'
const source=fs.readFileSync('src/store.jsx','utf8')
for (const enabled of [true, false]) test(`actual lifecycle applyServer preserves dirty row and baseline while installing clean records (sync=${enabled})`,()=>{
  const drafts=new DraftRegistry(),state={leads:[{id:'L',subject:'my text'},{id:'C',subject:'old'}],approvals:[{id:'APP',status:'Pending',note:'my edit'}],config:{}}
  drafts.edit('leads','L',{data:{id:'L',subject:'base'},rev:1},true)
  const stateRef={current:state},lastSavedRef={current:{leads:[{id:'L',subject:'base'},{id:'C',subject:'old'}],approvals:[{id:'APP',status:'Pending',note:'old'}]}}
  let installed
  const dependencies={reconcileWorkspaceCollection,authInvalidRef:{current:false},registerDirtyRecords:()=>{},setSyncDiagnostics:()=>{},stateRef,lastSavedRef,bootRef:{current:{}},syncedOf:v=>v,workspaceSyncState:{enabled},SYNC_ENTITIES,workspaceDrafts:drafts,recordFrom,replaceRecord,approvalViewRevisionsRef:{current:{APP:7}},reconcileApprovedSubmissions:v=>v,migrate:v=>v,applyAuthoritativeProfile:v=>v,setState:v=>{installed=v}}
  const body=source.slice(source.indexOf('  const applyServer ='),source.indexOf('  const loadApprovedPriceLists ='))
  const apply=new Function(...Object.keys(dependencies),`${body};return applyServer`)(...Object.values(dependencies))
  apply({leads:[{id:'L',subject:'remote'},{id:'C',subject:'new'}],approvals:[{id:'APP',status:'Approved',note:'remote'}],_approvalRevisions:{APP:9}})
  assert.equal(installed.leads.find(r=>r.id==='L').subject,'my text')
  assert.equal(installed.leads.find(r=>r.id==='C').subject,'new')
  assert.equal(drafts.get('leads','L').base.rev,1)
  assert.equal(lastSavedRef.current.leads.find(row=>row.id==='L').subject,'base')
  assert.equal(lastSavedRef.current.leads.find(row=>row.id==='C').subject,'new')
  assert.equal(dependencies.approvalViewRevisionsRef.current.APP,7)
  assert.equal(installed.approvals[0].note,'my edit')
  assert.equal(lastSavedRef.current.approvals[0].note,'old')
})
test('review only applies explicitly selected local differences to latest record',()=>{
  const merged=reviewedRecord({subject:'base',status:'New'},{subject:'mine',status:'New'},{subject:'remote',status:'Qualified'},{subject:'mine'})
  assert.deepEqual(merged,{subject:'mine',status:'Qualified'})
})
test('component-local buffers survive unrelated successful store saves',()=>{
  const drafts=new DraftRegistry();drafts.edit('leads','L',{data:{},rev:1},true)
  drafts.saved('leads','L',{data:{subject:'saved'},rev:2},drafts.get('leads','L').seq)
  assert.equal(drafts.get('leads','L').localOnly,true)
  drafts.observe('leads','L',{available:true,rev:3});assert.equal(drafts.blocked('leads','L'),true)
})
test('actual resolution rejects a review from another actor or generation',()=>{
  const method=source.slice(source.indexOf('    syncResolve('),source.indexOf('    canPerform(action)',source.indexOf('    syncResolve(')))
  const dependencies={workspaceSyncState:{suspended:false},stateRef:{current:{auth:{user:{id:'new'}}}},getWorkspaceGeneration:()=> '2'}
  const api=new Function(...Object.keys(dependencies),`return {${method}}`)(...Object.values(dependencies))
  assert.equal(api.syncResolve({entity:'leads',id:'L'},{},{actor:'old',generation:'1'}),false)
  assert.equal(api.syncResolve({entity:'leads',id:'L'},{},{actor:'new',generation:'1'}),false)
})

test('clean proposal buffer uses refreshed fields before the next edit',async()=>{
  const { reconcileEditorBuffer }=await import('../src/workspaceReconcile.js')
  const old={subject:'old',price:10},remote={subject:'remote',price:20}
  const buffer={id:'P',source:old,value:{...old}}
  const next=reconcileEditorBuffer(buffer,{id:'P',source:remote,dirty:false},v=>({...v}))
  assert.deepEqual({...next.value,subject:'my next edit'},{subject:'my next edit',price:20})
  assert.equal(next.source,remote)
  assert.equal(reconcileEditorBuffer(next,{id:'P',source:remote,dirty:false},v=>v),next)
})
test('background updates cannot reset a dirty proposal buffer',async()=>{
  const { reconcileEditorBuffer }=await import('../src/workspaceReconcile.js')
  const buffer={id:'P',source:{subject:'base'},value:{subject:'typing'}}
  assert.equal(reconcileEditorBuffer(buffer,{id:'P',source:{subject:'remote'},dirty:true},v=>v),buffer)
})
test('resolution rejects unchecked component-local inputs at the store boundary',()=>{
  const drafts=new DraftRegistry();drafts.edit('leads','L',{data:{},rev:1},true)
  const method=source.slice(source.indexOf('    syncResolve('),source.indexOf('    canPerform(action)',source.indexOf('    syncResolve(')))
  const dependencies={workspaceSyncState:{suspended:false},stateRef:{current:{auth:{user:{id:'A'}}}},getWorkspaceGeneration:()=> '1',workspaceDrafts:drafts}
  const api=new Function(...Object.keys(dependencies),`return {${method}}`)(...Object.values(dependencies))
  assert.equal(api.syncResolve({entity:'leads',id:'L',available:true,data:{}},{},{actor:'A',generation:'1'}),false)
  assert.ok(drafts.get('leads','L'))
})
test('discard groups include overlapping editors but exclude unrelated forms',async()=>{
  const {registerWorkspaceEditor,relatedWorkspaceRecords}=await import('../src/workspaceSyncState.js')
  const p={entity:'proposals',id:'P'},o={entity:'opportunities',id:'P'},l={entity:'leads',id:'L'},other={entity:'leads',id:'other'}
  const cleanup=[registerWorkspaceEditor(Symbol(),[p,o]),registerWorkspaceEditor(Symbol(),[o,l]),registerWorkspaceEditor(Symbol(),[other])]
  try {assert.deepEqual(relatedWorkspaceRecords([p]),[p,o,l])}finally{cleanup.forEach(fn=>fn())}
  assert.deepEqual(relatedWorkspaceRecords([p]),[p])
})

test('an explicitly resolved draft replaces the editor buffer even when the merge needs saving',async()=>{
  const {reconcileEditorBuffer}=await import('../src/workspaceReconcile.js')
  const buffer={id:'P',source:{subject:'base'},value:{subject:'old draft'},resolution:0}
  const source={subject:'reviewed merge'}
  const next=reconcileEditorBuffer(buffer,{id:'P',source,dirty:true,resolution:1},v=>v)
  assert.equal(next.value,source)
})
