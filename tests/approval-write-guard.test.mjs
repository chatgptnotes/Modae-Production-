import test from 'node:test'
import assert from 'node:assert/strict'
import { assertNoApprovalCommandWrite, publicAuditEvent } from '../src/approvalWriteGuard.js'
test('generic saves cannot inject decisions or release evidence',()=>{
  for (const [entity,before,after] of [
    ['approvals',{status:'Pending',decisions:{}},{status:'Approved',decisions:{LJS:{d:'Approved'}}}],
    ['approvals',{status:'Approved'},{status:'Pending'}],
    ['proposals',{approvedPricing:null},{approvedPricing:{approvalId:'A'}}],
    ['proposals',{releaseStatus:'Draft'},{releaseStatus:'Released'}],
  ]) assert.throws(()=>assertNoApprovalCommandWrite(entity,before,after),e=>e.status===403)
})
test('proposal draft pricing history and approval cancellation remain available',()=>{
  assert.doesNotThrow(()=>assertNoApprovalCommandWrite('proposals',{pricingHistory:[]},{pricingHistory:[{status:'Submitted for approval'}]}))
  assert.doesNotThrow(()=>assertNoApprovalCommandWrite('approvals',{status:'Pending',decisions:{}},{status:'Cancelled',decisions:{}}))
})
test('audit event projection removes private command receipts',()=>{
  assert.deepEqual(publicAuditEvent({kind:'approval_command',action:'Approval approved',command:{secret:'x'},result:{status:'Approved'}}),{kind:'approval_command',action:'Approval approved'})
})
test('first signature freezes the request snapshot and all requested pricing',()=>{
  const before={status:'Pending',decisions:{LJS:{d:'Approved'}},approvalSnapshot:{price:1},requestedValue:100}
  for(const patch of [{approvalSnapshot:{price:2}},{requestedValue:200},{needed:['AH']}]) {
    assert.throws(()=>assertNoApprovalCommandWrite('approvals',before,{...before,...patch}),e=>e.status===403)
  }
})
test('generic audit writes cannot forge an idempotency receipt',()=>{
  assert.throws(()=>assertNoApprovalCommandWrite('audit',null,{id:'APPROVAL-COMMAND:forged'}),e=>e.status===403)
})
