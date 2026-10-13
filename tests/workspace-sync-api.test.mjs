import test from 'node:test'
import assert from 'node:assert/strict'
import { createEditingPresence, validateSyncRequest } from '../api/_workspace-sync.js'
import { canReadWorkspaceRecord, projectWorkspace } from '../src/workspaceAccess.js'
import { defaultAccessPolicy } from '../src/accessPolicy.js'
test('editing indicators expire without database writes and isolate generation and actor',()=>{
  let time=0;const p=createEditingPresence({now:()=>time});const row={entity:'leads',id:'L'}
  p.update('A','1','tab',[row]);assert.equal(p.read('B','1',[row])[0].otherEditors,1)
  assert.equal(p.read('A','1',[row])[0].otherEditors,0);assert.equal(p.read('B','2',[row])[0].otherEditors,0)
  time=45001;assert.equal(p.read('B','1',[row])[0].otherEditors,0)
})
test('version endpoint rejects unbounded watches and unknown tables',()=>{
  assert.throws(()=>validateSyncRequest({operation:'versions',generation:'0',records:Array(101).fill({entity:'leads',id:'L'})}),e=>e.status===422)
  assert.throws(()=>validateSyncRequest({operation:'versions',generation:'0',records:[{entity:'users',id:'U'}]}),e=>e.status===422)
})
test('metadata visibility matches workspace projection for protected proposals and approvals',()=>{
  const config={accessPolicy:defaultAccessPolicy()},user={id:'u',role:'RS',roles:['STANDARD_USER']}
  const state={config,opportunities:[{id:'O',owner:'AH'}],proposals:{O:{id:'O'}},approvals:[{id:'A',oppId:'O',needed:['AH'],requestedBy:'AH'}]}
  assert.equal(canReadWorkspaceRecord(user,'proposals',{id:'O'},config,state),!!projectWorkspace(state,user).proposals.O)
  assert.equal(canReadWorkspaceRecord(user,'approvals',state.approvals[0],config,state),!!projectWorkspace(state,user).approvals.length)
})

import { workspaceSync } from '../api/_workspace-sync.js'
function database() {
  const rows={records:[{entity:'state',id:'users',data:[{id:'U',authId:'U',role:'ADMIN',status:'Active'}],rev:1},{entity:'state',id:'workspace_generation',data:{value:0}}],settings:[{id:'config',data:{accessPolicy:defaultAccessPolicy()},rev:1}],leads:Array.from({length:65},(_,i)=>({id:`L${String(i).padStart(3,'0')}`,rev:1,data:{id:`L${String(i).padStart(3,'0')}`,subject:'private body'},updated_at:String(i).padStart(5,'0')})),approvals:[],proposals:[],opportunities:[]}
  const calls=[]
  const client={from(table){
    const filters=[],orders=[];let columns='',start=0,end=Infinity,single=false
    const q={select(s){columns=s;return q},eq(k,v){filters.push(r=>r[k]===v);return q},is(k,v){filters.push(r=>(r[k]??null)===v);return q},in(k,v){filters.push(r=>v.includes(r[k]));return q},order(k,o){orders.push([k,o.ascending]);return q},range(a,b){start=a;end=b;return q},maybeSingle(){single=true;return q},then(resolve,reject){calls.push({table,columns});let result=rows[table].filter(r=>filters.every(f=>f(r)));result=result.sort((a,b)=>{for(const[k,asc]of orders){const c=String(a[k]).localeCompare(String(b[k]));if(c)return asc?c:-c}return 0}).slice(start,end+1)
      if(columns.includes('owner:data'))result=result.map(r=>({id:r.id,rev:r.rev,deleted_at:r.deleted_at,...Object.fromEntries(['owner','oppId','needed','approver','requestedBy'].map(k=>[k,r.data?.[k]]))}))
      return Promise.resolve({data:single?result[0]||null:result}).then(resolve,reject)}};return q}}
  return {client,rows,calls}
}
test('recent discovery includes new IDs beyond the first fifty and older scan is bounded',async()=>{
  const {client,calls}=database()
  const result=await workspaceSync(client,{id:'U'},{operation:'versions',generation:'0',views:[{entity:'leads',page:0,pageSize:50},{entity:'leads',page:1,pageSize:50}]})
  assert.equal(result.views[0].records[0].id,'L064')
  assert.equal(result.views[0].records.length,50);assert.equal(result.views[1].records.length,15)
  assert.ok(calls.filter(c=>c.table==='leads').every(c=>!c.columns.split(',').includes('data')))
  assert.ok(calls.length<=5)
})
test('inactive account and old generation cannot get revision metadata',async()=>{
  const {client,rows}=database()
  await assert.rejects(workspaceSync(client,{id:'U'},{operation:'versions',generation:'1'}),e=>e.status===409)
  rows.records[0].data[0].status='Suspended'
  await assert.rejects(workspaceSync(client,{id:'U'},{operation:'versions',generation:'0'}),e=>e.status===403)
})
test('targeted reads return the body and revision together',async()=>{
  const {client}=database()
  const result=await workspaceSync(client,{id:'U'},{operation:'read_records',generation:'0',records:[{entity:'leads',id:'L001'}]})
  assert.equal(result.records[0].data.subject,'private body');assert.equal(result.records[0].rev,1)
})

test('permission downgrade changes projection version even when record rev is unchanged',async()=>{
  const {client,rows}=database(),request={operation:'versions',generation:'0',records:[{entity:'leads',id:'L001'}]}
  const before=await workspaceSync(client,{id:'U'},request)
  rows.records[0].data[0]={id:'U',authId:'U',status:'Active',role:'RS',roles:['STANDARD_USER']}
  const after=await workspaceSync(client,{id:'U'},request)
  assert.equal(before.records[0].rev,after.records[0].rev)
  assert.equal(after.records[0].available,true)
  assert.notEqual(before.accessVersion,after.accessVersion)
})

test('targeted reads reject discovery and editing payloads before database queries',async()=>{
  for(const extra of [{views:[{entity:'leads',page:0,pageSize:50}]},{editing:[{entity:'leads',id:'L064'}],tabId:'tab'}]) {
    const {client,calls}=database()
    await assert.rejects(workspaceSync(client,{id:'U'},{operation:'read_records',generation:'0',records:[{entity:'leads',id:'L064'}],...extra}),e=>e.status===422)
    assert.equal(calls.length,0)
  }
})
