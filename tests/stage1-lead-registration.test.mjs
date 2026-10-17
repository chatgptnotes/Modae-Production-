import test from 'node:test'
import assert from 'node:assert/strict'
import { leadIdentity, leadRegistrationContext, existingLeadOpportunity } from '../src/leadFieldMapping.js'
import { opportunityOwnerFor, deadlineForLead } from '../src/leadRules.js'
import { registrationFields } from '../src/businessRules.js'

test('registration carries original enquiry, sender attribution and attachment data', () => {
  const lead = { id:'LD-42', source:'Phone', subject:'Pump request', body:'Please quote', notes:'Call tomorrow', originator:{id:'user-7'}, attachments:[{name:'drawing.pdf',dataUrl:'data:application/pdf;base64,QQ=='}], legacyCustomerClass:'Amber' }
  const context = leadRegistrationContext(lead)
  assert.deepEqual(context.attachments, lead.attachments)
  assert.deepEqual(context.originator, lead.originator)
  assert.equal(context.sourceBody, 'Please quote')
  assert.equal(context.sourceSubject, 'Pump request')
  assert.equal(context.source, 'Phone')
  assert.equal(context.legacyCustomerClass,'Amber')
})
test('repeat conversion finds the original opportunity even if lead link is stale', () => {
  const opportunity = {id:'OP-1',sourceLeadId:'LD-42'}
  assert.equal(existingLeadOpportunity([opportunity],{id:'LD-42'}), opportunity)
  assert.equal(existingLeadOpportunity([opportunity],{id:'other',oppId:'OP-1'}), opportunity)
  assert.equal(existingLeadOpportunity([opportunity],{id:'other'}),null)
})
test('blank enquiry identity remains blank and company alone is sufficient', () => {
  const identity = leadIdentity({}, [])
  assert.equal(identity.sellTo,'')
  assert.equal(identity.contactPerson,'')
  assert.equal(identity.eucLocation,'')
  assert.deepEqual(registrationFields({registrationRequiredFields:['sellTo','eucName']}),[['sellTo','Sell-to customer']])
})
test('missing KYC and AI details cannot expire or automatically drop an intake lead', () => {
  assert.deepEqual(deadlineForLead({customerStatus:'Blue',ai:{missing:['Phone']},ts:'2020-01-01'}),[])
  assert.equal(opportunityOwnerFor({}), 'LJS')
})
