import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
test('explicit record saves preserve partial successes and do not retry conflicts',async()=>{
 const {commitWorkspaceRecords}=await import('../src/workspaceExplicitSave.js');let calls=0
 const result=await commitWorkspaceRecords([{entity:'leads',id:'A',rev:1,data:{id:'A'}},{entity:'leads',id:'B',rev:1,data:{id:'B'}}],async(name,args)=>{calls++;assert.equal(args.p_rows.length,2);return {data:{committed:[{entity:'leads',id:'A',rev:2,data:{id:'A'},available:true}],conflicts:[{id:'B',rev:2,data:{id:'B'}}]}}})
 assert.equal(calls,1);assert.equal(result.committed[0].id,'A');assert.equal(result.conflicts[0].id,'B')
})
test('mode gates background flushes and removes recurring network timers',()=>{
 const store=fs.readFileSync('src/store.jsx','utf8')
 assert.match(store,/workspaceSyncState.enabled && !explicit/)
 for(const file of ['src/workspaceSync.js','src/deployment.js','src/presence.js'])assert.doesNotMatch(fs.readFileSync(file,'utf8'),/setInterval\(/)
})
test('a later failed entity retains earlier confirmed writes',async()=>{
 const {commitWorkspaceRecords}=await import('../src/workspaceExplicitSave.js')
 const result=await commitWorkspaceRecords([{entity:'leads',id:'A',rev:1,data:{}},{entity:'opportunities',id:'B',rev:1,data:{}}],async(name,args)=>args.p_entity==='leads'?{data:{committed:[{entity:'leads',id:'A',rev:2,data:{},available:true}],conflicts:[]}}:{error:new Error('unavailable')})
 assert.equal(result.committed[0].id,'A');assert.equal(result.error.message,'unavailable')
})
test('input ownership is acknowledged only by its own applied update',async()=>{
 const {workspaceDrafts}=await import('../src/workspaceDrafts.js')
 const {beginWorkspaceInput,appliedWorkspaceInput,resetWorkspaceInputs}=await import('../src/workspaceInputOwnership.js')
 const records=[{entity:'leads',id:'L'}]
 workspaceDrafts.edit('leads','L',{data:{id:'L'},rev:1},true)
 const unapplied=beginWorkspaceInput({},records)
 const applied=beginWorkspaceInput({},records)
 appliedWorkspaceInput(applied,{leads:[{id:'L',subject:'old'}]},{leads:[{id:'L',subject:'new'}]})
 await Promise.resolve()
 assert.equal(workspaceDrafts.get('leads','L').localOnly,true)
 appliedWorkspaceInput(unapplied,{leads:[{id:'L',subject:'old'}]},{leads:[{id:'L',subject:'new'}]})
 await Promise.resolve()
 assert.equal(workspaceDrafts.get('leads','L').localOnly,false)
 workspaceDrafts.reset();resetWorkspaceInputs()
})
test('incoming sourcing commits register a pending local line before installation',async()=>{
 const source=fs.readFileSync('src/store.jsx','utf8')
 const {DraftRegistry,SYNC_ENTITIES}=await import('../src/workspaceDrafts.js')
 const {recordFrom}=await import('../src/workspaceReconcile.js')
 const drafts=new DraftRegistry()
 const stateRef={current:{sparesLines:[{id:'S',oppId:'O',qty:5}]}}
 const lastSavedRef={current:{sparesLines:[{id:'S',oppId:'O',qty:1}]}}
 const body=source.slice(source.indexOf('  const registerDirtyRecords ='),source.indexOf('  const dirtySlices ='))
 const deps={workspaceSyncState:{enabled:true},SYNC_ENTITIES,stateRef,lastSavedRef,recordFrom,workspaceDrafts:drafts,datastore:{workspaceRecord:()=>({rev:2})}}
 const register=new Function(...Object.keys(deps),`${body};return registerDirtyRecords`)(...Object.values(deps))
 register();assert.equal(drafts.get('spares_lines','S').base.rev,2)
 assert.equal(drafts.observe('spares_lines','S',{available:true,rev:3,data:{qty:9}}),false)
 assert.equal(drafts.blocked('spares_lines','S'),true)
})
