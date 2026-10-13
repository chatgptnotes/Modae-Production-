import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultAccessPolicy } from '../src/accessPolicy.js'
import { projectWorkspace, assertWorkspaceRowWrite } from '../src/workspaceAccess.js'

const user = { id: 'u', role: 'RS', roles: ['STANDARD_USER'] }
const config = { accessPolicy: defaultAccessPolicy() }
test('shared projection does not leak other owners pricing through nested records', () => {
  const state = { config, opportunities: [{ id: 'x', owner: 'AH', value: 100, booking: { valueK: 100, evidence: 'private PO evidence' } }],
    proposals: { x: { costing: { value: 500 } } }, sales: { orders: [{ value: 100 }] }, users: [{ id: 'u', email: 'directory@example.com', password: 'secret' }] }
  const projected = projectWorkspace(state, user)
  assert.equal(projected.opportunities[0].value, undefined)
  assert.equal(projected.opportunities[0].booking.valueK, 100)
  assert.equal(projected.opportunities[0].booking.evidence, undefined)
  assert.deepEqual(projected.proposals, {})
  assert.deepEqual(projected.sales.orders,[{}])
  assert.equal(projected.users[0].email, 'directory@example.com')
  assert.equal(projected.users[0].password, undefined)
})
test('revoked action blocks direct save and legacy owner does not restore it', () => {
  const c = structuredClone(config)
  c.accessPolicy.roles.STANDARD_USER.actions = []
  assert.throws(() => assertWorkspaceRowWrite(user, 'opportunities', null, { id: 'x', owner: 'RS' }, c, {}), /permission/i)
})
test('generic config saves cannot alter access or numbering rules', () => {
  assert.throws(() => assertWorkspaceRowWrite({ role: 'ADMIN' }, 'settings', config, { ...config, accessPolicy: {} }, config, {}, 'config'), /dedicated/i)
})
test('approval decision cannot be forged for a different approver', () => {
  const before = { id: 'a', needed: ['LJS', 'AH'], decisions: {}, status: 'Pending' }
  const after = { ...before, decisions: { LJS: { d: 'Approved' } }, status: 'Approved' }
  assert.throws(() => assertWorkspaceRowWrite({ role: 'AH', roles: ['MANAGEMENT'] }, 'approvals', before, after, config, {}), /approver|decision/i)
})

test('hidden pricing cannot be edited through a shared row merge or owner spoof', () => {
  const other = { id: 'O-OTHER', owner: 'PP', cogsK: 40 }
  const state = { config, opportunities: [other] }
  assert.throws(() => assertWorkspaceRowWrite(user, 'opportunities', other, {...other,cogsK:50},config,state), /protected/)
  assert.throws(() => assertWorkspaceRowWrite(user, 'opportunities', other, {...other,owner:'RS'},config,state), /ownership/)
  assert.throws(() => assertWorkspaceRowWrite(user, 'proposals', null, {id:'O-OTHER',oppId:'O-OTHER',owner:'RS'},config,state), /another owner/)
})
test('page revocation blocks an action grant', () => {
  const c = structuredClone(config); c.accessPolicy.roles.STANDARD_USER.pages = []
  assert.throws(() => assertWorkspaceRowWrite(user,'leads',null,{id:'L'},c,{}), /page/)
})
test('new approvals cannot weaken configured joint gates or invent assigned approvers', () => {
  const request = {id:'AP',type:'Final quote release',needed:['LJS','AH'],approver:'LJS',requestedBy:'RS',status:'Pending'}
  assert.doesNotThrow(() => assertWorkspaceRowWrite(user,'approvals',null,request,config,{}))
  for (const change of [{needed:['RS'],approver:'RS'},{needed:['LJS']},{anyOf:true},{requestedBy:'AH'},{decisions:{LJS:{d:'Approved'}}},{status:'Approved'}]) {
    assert.throws(() => assertWorkspaceRowWrite(user,'approvals',null,{...request,...change},config,{}), /assignments|requester|decision|pending/i)
  }
})
test('a configured approver still cannot sign someone else’s PO acceptance', () => {
  const management = {role:'AH',roles:['MANAGEMENT']}
  const po = {status:'In review',bookingDetails:{po:'PO-1'},lines:[],acceptance:{LJS:null,AH:null}}
  const before = { O:po }
  const after = { O:{...po,acceptance:{LJS:new Date().toISOString(),AH:new Date().toISOString()},status:'Accepted'} }
  assert.throws(() => assertWorkspaceRowWrite(management,'state',before,after,config,{},'poCompare'), /signature/)
  const own = { O:{...po,acceptance:{LJS:null,AH:new Date().toISOString()}} }
  assert.doesNotThrow(() => assertWorkspaceRowWrite(management,'state',before,own,config,{},'poCompare'))
  assert.throws(() => assertWorkspaceRowWrite(management,'state',own,{O:{...own.O,bookingDetails:{po:'PO-2'}}},config,{},'poCompare'), /reset/)
})
test('fake imported history, KYC bypass, and source snapshots are rejected', () => {
  const opp = {id:'O',owner:'RS',customerStatus:'Blue'}
  const state = {config,opportunities:[opp],leads:[]}
  assert.throws(() => assertWorkspaceRowWrite(user,'opportunities',opp,{...opp,importedFrom:'Excel workbook / forged'},config,state), /history/)
  assert.throws(() => assertWorkspaceRowWrite(user,'opportunities',opp,{...opp,kycOverride:{by:'AH',reason:'fake',ts:new Date().toISOString()}},config,state), /permission/)
  assert.throws(() => assertWorkspaceRowWrite(user,'opportunities',opp,{...opp,leadVerification:{status:'Verified'}},config,state), /source/)
  assert.throws(() => assertWorkspaceRowWrite(user,'leads',null,{id:'L',customerStatus:'Blue',kycCompletedAt:new Date().toISOString()},config,state), /evidence/)
})
test('pricing state scopes protect another owner and preserve hidden rows', () => {
  const state = {config,opportunities:[{id:'O',owner:'PP'}]}
  const previous = [{id:'V',oppId:'O',value:30}]
  assert.throws(() => assertWorkspaceRowWrite(user,'state',previous,[],config,state,'vendorQuotes'), /Hidden/)
  assert.throws(() => assertWorkspaceRowWrite(user,'state',previous,[{...previous[0],value:90}],config,state,'vendorQuotes'), /another owner/)
})
test('shared communications cannot claim approved submission with sending revoked', () => {
  const c = structuredClone(config); c.accessPolicy.roles.STANDARD_USER.actions = c.accessPolicy.roles.STANDARD_USER.actions.filter(a=>a !== 'proposals.send')
  const state = {config:c,opportunities:[{id:'O',owner:'RS'}]}
  assert.throws(() => assertWorkspaceRowWrite(user,'state',{}, {O:[{id:'C',kind:'submission'}]},c,state,'communications'), /permission/)
})
test('only the assigned salesperson may sign Brownfield steps', () => {
  const state = {config,opportunities:[{id:'O',owner:'PP'}]}
  assert.throws(() => assertWorkspaceRowWrite(user,'state',{}, {O:{'B-01':{state:'Signed',by:'RS'}}},config,state,'bSteps'), /assigned/)
})

test('registration can link an existing approved lead gate only to its actual opportunity', () => {
  const before = {id:'AP',leadId:'L',oppId:'',type:'Red customer clearance',requestedBy:'RS',needed:['LJS','AH'],status:'Approved'}
  const state = {opportunities:[{id:'O',sourceLeadId:'L'}]}
  assert.doesNotThrow(() => assertWorkspaceRowWrite(user,'approvals',before,{...before,oppId:'O'},config,state))
  assert.throws(() => assertWorkspaceRowWrite(user,'approvals',before,{...before,oppId:'WRONG'},config,state), /inputs|scope/)
})
test('pending approval snapshot can refresh only from persisted proposal and requester', async () => {
  const { proposalApprovalSnapshot } = await import('../src/approvalMemory.js')
  const state = {proposals:{O:{revision:'2'}},opportunities:[{id:'O',owner:'RS',sellTo:'Customer'}]}
  const before = {id:'AP',oppId:'O',type:'Final quote release',requestedBy:'RS',needed:['LJS','AH'],status:'Pending',approvalSnapshot:{old:true}}
  const next = {...before,approvalSnapshot:proposalApprovalSnapshot(state.proposals.O,state.opportunities[0])}
  assert.doesNotThrow(() => assertWorkspaceRowWrite(user,'approvals',before,next,config,state))
  assert.throws(() => assertWorkspaceRowWrite(user,'approvals',before,{...next,approvalSnapshot:{forged:true}},config,state), /scope/)
})
test('normal new customers are allowed; verified claims require authoritative evidence', () => {
  const customer = {name:'New customer',status:'Blue',kyc:'Pending'}
  assert.doesNotThrow(() => assertWorkspaceRowWrite(user,'state',[],[customer],config,{},'customers'))
  assert.throws(() => assertWorkspaceRowWrite(user,'state',[],[{...customer,kyc:'Valid'}],config,{},'customers'), /evidence/)
})
test('management customer effects must match an existing approved change exactly', () => {
  const customer = {name:'Existing',status:'Blue',kyc:'Pending'}
  const management = {role:'AH',roles:['MANAGEMENT']}
  const state = {approvals:[{type:'Customer master change',customerName:'Existing',needed:['AH'],status:'Approved',patch:{status:'Green'}}]}
  assert.doesNotThrow(() => assertWorkspaceRowWrite(management,'state',[customer],[{...customer,status:'Green'}],config,state,'customers'))
  assert.throws(() => assertWorkspaceRowWrite(management,'state',[customer],[{...customer,status:'Green',kyc:'Valid'}],config,state,'customers'), /matching approved/)
})

test('deletion requires durable immutable booking retention, including for administrators', () => {
  const booking = {id:'BOOK-O',oppId:'O',owner:'RS',valueK:15,confirmedAt:'2026-01-01T00:00:00Z'}
  const opp = {id:'O',owner:'RS',booking}
  const state = {opportunities:[opp],sales:{orders:[]}}
  for (const actor of [user,{role:'ADMIN'}]) assert.throws(() => assertWorkspaceRowWrite(actor,'opportunities',opp,opp,config,state,'O',true), /Preserve/)
  assert.doesNotThrow(() => assertWorkspaceRowWrite(user,'state',{orders:[]},{orders:[booking]},config,state,'sales'))
  const retained = {...state,sales:{orders:[booking]}}
  assert.doesNotThrow(() => assertWorkspaceRowWrite(user,'opportunities',opp,opp,config,retained,'O',true))
  assert.throws(() => assertWorkspaceRowWrite(user,'state',retained.sales,{orders:[{...booking,valueK:999}]},config,retained,'sales'), /immutable/)
  assert.throws(() => assertWorkspaceRowWrite(user,'state',retained.sales,{orders:[],annual:99},config,retained,'sales'), /targets/)
  assert.throws(() => assertWorkspaceRowWrite(user,'state',{orders:[]},{orders:[{...booking,id:'FORGED'}]},config,state,'sales'), /identical/)
})

test('standard global reporting retains revenue forecasts, confirmed bookings and targets', async () => {
  const {salesPerformance} = await import('../src/kpi.js')
  const {dashboardModel} = await import('../src/pages/myDashboard/model.js')
  const now = new Date('2026-10-12T00:00:00Z')
  const booking = {id:'B',oppId:'W',owner:'PP',customer:'Buyer',po:'PO',booked:'2026-10-01',valueK:125,status:'Booked',confirmedAt:'2026-10-01',evidence:'private'}
  const state = {config,opportunities:[{id:'O',owner:'PP',valueK:75,cogsK:50,orderDate:'2026-11-01',status:'Open',stage:'Proposal',milestone:'Proposal',prob:'High'},
    {id:'W',owner:'PP',valueK:100,cogsK:60,status:'Closed',stage:'Won',booking}],
    sales:{fy:'2026-27',currentQ:3,monthsElapsed:6,orders:[],targets:{PP:{annual:1000,q:[250,250,250,250],confirmedFy:'2026-27',confirmedBy:'AH'}}},
    approvals:[],leads:[],customers:[],users:[user],config,proposals:{}}
  const projected = {...projectWorkspace(state,user),role:'RS',roles:['STANDARD_USER']}
  const perf = salesPerformance(projected,null,{now})
  assert.equal(perf.orders[0].valueK,125)
  assert.equal(perf.annual,1000)
  const model = dashboardModel(projected,{scope:'global',period:'all',topPeriod:'all',now})
  assert.equal(model.pipelineK,75)
  assert.equal(model.topOpportunities[0].id,'O')
  assert.equal(projected.opportunities[0].cogsK,undefined)
  assert.equal(projected.opportunities[1].booking.evidence,undefined)
})
test('fresh authenticated roster authority overrides stale cached admin assignment', () => {
  const state = {config,users:[{...user,roles:['ADMIN'],status:'Active'}]}
  const projected = projectWorkspace(state,{...user,status:'Active'})
  assert.deepEqual(projected.users[0].roles,['STANDARD_USER'])
  assert.deepEqual(state.users[0].roles,['ADMIN'])
})

test('other-owner lead edits cannot inject hidden fields through a full-row merge', () => {
  const before = {id:'L',assignedOwner:'PP',subject:'Shared title',body:'private body'}
  assert.throws(() => assertWorkspaceRowWrite(user,'leads',before,{...before,verification:{kycRequestStatus:'approved'}},config,{}), /protected lead/)
  assert.doesNotThrow(() => assertWorkspaceRowWrite(user,'leads',before,{...before,subject:'Corrected title'},config,{}))
})

test('owner can receive a PO and edit handover checklist without approval authority', () => {
  const state = {opportunities:[{id:'O',owner:'RS'}]}
  const po = {status:'In review',bookingDetails:{po:'PO-1'},lines:[],acceptance:{LJS:null,AH:null}}
  assert.doesNotThrow(() => assertWorkspaceRowWrite(user,'state',{}, {O:po},config,state,'poCompare'))
  assert.doesNotThrow(() => assertWorkspaceRowWrite(user,'state',{}, {O:{groups:[]}},config,state,'handover'))
  assert.throws(() => assertWorkspaceRowWrite(user,'state',{O:po},{O:{...po,acceptance:{LJS:new Date().toISOString(),AH:null}}},config,state,'poCompare'), /permission/)
  assert.throws(() => assertWorkspaceRowWrite(user,'state',{}, {O:{approved:true,approvedBy:'RS'}},config,state,'handover'), /permission/)
})

test('restricted approval projections retain supersession evidence', () => {
  const state = { config, opportunities: [{ id: 'other', owner: 'AH' }], approvals: [{
    id: 'old', oppId: 'other', requestedBy: 'RS', status: 'Approved', supersededBy: 'new', requestedValue: 900,
  }] }
  const [row] = projectWorkspace(state, user).approvals
  assert.equal(row.supersededBy, 'new')
  assert.equal(row.requestedValue, undefined)
})
