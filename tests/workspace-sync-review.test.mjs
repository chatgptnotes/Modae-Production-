import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {DraftRegistry,recordKey} from '../src/workspaceDrafts.js'
import {recordFrom,replaceRecord} from '../src/workspaceReconcile.js'
const ui=fs.readFileSync('src/ui/WorkspaceSync.jsx','utf8')
const store=fs.readFileSync('src/store.jsx','utf8')
const bind=(body,name,deps)=>new Function(...Object.keys(deps),`${body};return ${name}`)(...Object.values(deps))
const openBody=ui.slice(ui.indexOf('  async function openReview('),ui.indexOf('  async function discardReview('))
const discardBody=ui.slice(ui.indexOf('  async function discardReview('),ui.indexOf('  if(!workspaceSyncState.enabled)return null',ui.indexOf('  async function discardReview(')))
function fixture(){
  const drafts=new DraftRegistry(),p={entity:'proposals',id:'P'},o={entity:'opportunities',id:'P'}
  drafts.edit(p.entity,p.id,{data:{subject:'base'},rev:1},true)
  drafts.edit(o.entity,o.id,{data:{id:'P',name:'base'},rev:1},true)
  const stateRef={current:{auth:{user:{id:'U'}},proposals:{P:{subject:'local'}},opportunities:[{id:'P',name:'local'}]}}
  const lastSavedRef={current:{}},accepted=[],events=[],messages=[],resolved=[]
  const remote=[{...p,available:false},{...o,available:true,rev:2,data:{id:'P',name:'server'}}]
  const state={suspended:false}
  const scope={actor:'U',generation:'1'}
  const entry=structuredClone(drafts.get(p.entity,p.id))
  const dependencies={workspaceSyncState:state,stateRef,lastSavedRef,getWorkspaceGeneration:()=> '1',workspaceDrafts:drafts,datastore:{acceptWorkspaceRecord:r=>accepted.push(r)},replaceRecord,setState:()=>{},resolvedWorkspaceRecord:(...args)=>resolved.push(args)}
  const method=store.slice(store.indexOf('    syncResolve('),store.indexOf('    canPerform(action)',store.indexOf('    syncResolve(')))
  const api=new Function(...Object.keys(dependencies),`return {${method}}`)(...Object.values(dependencies))
  const storeRef={current:{...stateRef.current,...api}}
  const deps={releaseWorkspaceInputs:()=>{},review:{entry,scope,remote:remote[0]},relatedWorkspaceRecords:()=>[p,o],workspaceDrafts:drafts,recordKey,setMessage:m=>messages.push(m),window:{confirm:()=>true,dispatchEvent:e=>events.push(e)},workspaceSyncRequest:async()=>({generation:'1',accessVersion:'v',records:remote}),workspaceSyncState:state,storeRef,getWorkspaceGeneration:()=> '1',workspaceProjectionVersion:()=> 'v',setReview:()=>{},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail}}}
  return {deps,drafts,stateRef,remote,accepted,events,messages,resolved,p,o,entry}
}
test('unavailable record can enter review without dropping local inputs',async()=>{
  const f=fixture();let review
  const open=bind(openBody,'openReview',{...f.deps,actor:'U',generation:'1',recordFrom,setReview:r=>{review=r}})
  await open(f.entry)
  assert.equal(review.remote.available,false)
  assert.deepEqual(review.local,{subject:'local'})
  assert.ok(f.drafts.get('proposals','P'))
})
test('confirmed discard clears unavailable record and resets the complete editor group',async()=>{
  const f=fixture();let confirmation=''
  f.deps.window.confirm=text=>{confirmation=text;return true}
  await bind(discardBody,'discardReview',f.deps)()
  assert.match(confirmation,/proposals\/P/);assert.match(confirmation,/opportunities\/P/)
  assert.equal(f.drafts.entries.size,0)
  assert.deepEqual(f.stateRef.current.proposals,{})
  assert.equal(f.stateRef.current.opportunities[0].name,'server')
  assert.deepEqual(f.events[0].detail.records,[f.p,f.o])
  assert.equal(f.resolved.length,2)
})
test('typing during discard reload preserves every related draft',async()=>{
  const f=fixture(),fetch=f.deps.workspaceSyncRequest
  f.deps.workspaceSyncRequest=async()=>{f.drafts.edit('opportunities','P',{data:{},rev:1},true);return fetch()}
  await bind(discardBody,'discardReview',f.deps)()
  assert.equal(f.accepted.length,0);assert.equal(f.events.length,0);assert.equal(f.drafts.entries.size,2)
  assert.match(f.messages[0],/Nothing was discarded/)
})
test('account switch during discard does not alter or remount forms',async()=>{
  const f=fixture(),fetch=f.deps.workspaceSyncRequest
  f.deps.workspaceSyncRequest=async()=>{f.deps.storeRef.current.auth={user:{id:'other'}};return fetch()}
  await bind(discardBody,'discardReview',f.deps)()
  assert.equal(f.accepted.length,0);assert.equal(f.events.length,0);assert.equal(f.drafts.entries.size,2)
})
test('cancelled discard makes no request and preserves the draft',async()=>{
  const f=fixture();f.deps.window.confirm=()=>false
  f.deps.workspaceSyncRequest=()=>assert.fail('cancelled discard must not fetch')
  await bind(discardBody,'discardReview',f.deps)()
  assert.equal(f.drafts.entries.size,2);assert.equal(f.events.length,0)
})
