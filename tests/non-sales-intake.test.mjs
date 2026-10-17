import test from 'node:test'
import assert from 'node:assert/strict'
import { effectiveAccess, canAccessPage, canPerform } from '../src/accessPolicy.js'
import { projectWorkspace, assertWorkspaceRowWrite, canReadWorkspaceRecord } from '../src/workspaceAccess.js'
import { intakeAssignees, buildSubmittedLead, createLeadIntakeHandler } from '../api/lead-intake.js'
import { projectedRows } from '../api/workspace-data.js'
import { applicationRoleFor, newUserRole } from '../src/userApplicationRole.js'
const actor = { id: 'non-sales', authId: 'auth-non-sales', role: 'LJS', roles: ['NON_SALES'], name: 'Operations', email: 'ops@example.com', status: 'Active' }
const state = { workspaceGeneration: 0, config: { secretRouting: 'private', ownershipRules: [] }, users: [actor, { id:'sales', role:'RS', name:'Salesperson', roles:['STANDARD_USER'], status:'Active' }, {id:'suspended',role:'PP',status:'Suspended'}], leads: [{id:'private',body:'private'}], opportunities: [{id:'private',valueK:999}], sales: {targets:{RS:99}} }
const input = { id: 'LD-12345678-1234-4234-8234-123456789abc', customerName: 'Customer', subject:'Enquiry', body:'Details', location:'', assignedOwner:'' }
test('non-sales grants remain submit-only despite legacy or mixed administrator roles', () => {
  for (const user of [actor,{...actor,roles:['ADMIN','NON_SALES']},'NON_SALES']) {
    assert.deepEqual(effectiveAccess(user).pages,['newLead'])
    assert.equal(canAccessPage(user,'inbox'),false)
    assert.equal(canAccessPage(user,'mydashboard'),false)
    assert.equal(canPerform(user,'opportunities.create'),false)
    assert.equal(canPerform(user,'leads.create'),true)
    assert.throws(()=>assertWorkspaceRowWrite(user,'leads',null,{id:'x'},{},state),{status:403})
    assert.equal(canReadWorkspaceRecord(user,'leads',{},state.config,state),false)
  }
  assert.equal(applicationRoleFor(actor),'NON_SALES')
  assert.deepEqual(newUserRole('NON_SALES'),{role:'NON_SALES',roles:['NON_SALES']})
})
test('bootstrap and direct table projections contain no sales or configuration data', () => {
  const visible=projectWorkspace(state,actor)
  assert.deepEqual(visible.leads,[]);assert.deepEqual(visible.opportunities,[]);assert.deepEqual(visible.config,{})
  assert.equal(visible.users.length,1);assert.equal(visible.users[0].id,actor.id)
  assert.deepEqual(projectedRows('settings',[{id:'config',data:state.config}],state,actor),[])
  assert.deepEqual(projectedRows('leads',[{id:'private',data:state.leads[0]}],state,actor),[])
})
test('assignee selection wins routing; blank selection falls back to LJS', () => {
  assert.deepEqual(intakeAssignees(state),[{id:'RS',name:'Salesperson'}])
  assert.equal(buildSubmittedLead({...input,assignedOwner:'RS'},actor,state).assignedOwner,'RS')
  const lead=buildSubmittedLead(input,actor,state)
  assert.equal(lead.from,'');assert.equal(lead.originator.email,actor.email);assert.equal(lead.assignedOwner,'LJS');assert.equal(lead.status,'New');assert.equal(lead.submittedBy,actor.id)
  assert.throws(()=>buildSubmittedLead({...input,assignedOwner:'PP'},actor,state),{status:400})
  assert.throws(()=>buildSubmittedLead({...input,status:'Qualified'},actor,state),{status:400})
  assert.equal(buildSubmittedLead({...input,customerName:'',body:'',source:'WhatsApp / Phone Call'},actor,state).source,'WhatsApp / Phone Call')
  assert.throws(()=>buildSubmittedLead({...input,subject:'',body:''},actor,state),{status:400})
})
test('attachments retain exact bytes and reject malformed or oversized payloads', () => {
  const attachment={name:'brief.txt',dataUrl:'data:text/plain;base64,SGVsbG8='}
  const lead=buildSubmittedLead({...input,attachments:[attachment]},actor,state)
  assert.equal(lead.attachments[0].dataUrl,attachment.dataUrl);assert.equal(lead.attachments[0].size,5)
  assert.throws(()=>buildSubmittedLead({...input,attachments:[{...attachment,dataUrl:'https://private/file'}]},actor,state),{status:400})
  assert.throws(()=>buildSubmittedLead({...input,attachments:[{...attachment,dataUrl:`data:text/plain;base64,${Buffer.alloc(6*1024*1024+1).toString('base64')}`}]},actor,state),{status:400})
})
function fixture(profile=actor) {
  let saved=null,calls=0
  const client={auth:{getUser:async()=>({data:{user:{id:'auth-non-sales'}}})},from(table){const query={select(){return query},eq(){return query},is(){return query},async maybeSingle(){return {data:table==='records'?{data:[profile],rev:1}:saved?{data:saved}:null}}};return query},async rpc(name,args){assert.equal(name,'save_rows');calls++;saved=args.p_rows[0].data;return {data:{accepted:[saved.id],conflicts:[]}}}}
  const handler=createLeadIntakeHandler({getClient:()=>client,getReader:()=>async()=>state})
  const send=async(method,body=input,headers={})=>{const res={statusCode:0,setHeader(){},status(code){this.statusCode=code;return this},json(data){this.body=data;return this}};await handler({method,body,headers:{authorization:'Bearer token','x-workspace-generation':'0',...headers}},res);return res}
  return {send,calls:()=>calls}
}
test('authenticated submit creates one row and safely retries without returning lead data',async()=>{
  const f=fixture();const first=await f.send('POST');assert.equal(first.statusCode,201);assert.deepEqual(first.body,{id:input.id,submitted:true})
  assert.equal((await f.send('POST')).statusCode,200);assert.equal(f.calls(),1)
  const listing=await f.send('GET');assert.deepEqual(Object.keys(listing.body).sort(),['assignees','generation'])
})
test('inactive accounts and stale generation cannot submit',async()=>{
  assert.equal((await fixture({...actor,status:'Suspended'}).send('POST')).statusCode,403)
  const f=fixture();assert.equal((await f.send('POST',input,{'x-workspace-generation':'9'})).statusCode,409);assert.equal(f.calls(),0)
  assert.equal((await f.send('POST',input,{authorization:''})).statusCode,401)
})
