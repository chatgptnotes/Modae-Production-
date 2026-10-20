import test from 'node:test'
import assert from 'node:assert/strict'
import {mergeLeadIntake,mergeLeadReviewSuggestions} from '../src/leadReviewMerge.js'

test('blank intake fields preserve document facts while explicit overrides win',()=>{
  const extracted={sellTo:'Original Company',contactPerson:'Anita Rao',contactEmail:'anita@example.com',subject:'Customer RFQ',source:'Email',rfqNumber:'RFQ-1'}
  assert.deepEqual(mergeLeadIntake(extracted,{id:'LD-1',sellTo:'',contactEmail:'',subject:'(no subject)',source:''}),{...extracted,id:'LD-1',sellTo:'Original Company',contactEmail:'anita@example.com',subject:'Customer RFQ',source:'Email',contactPhone:'',sellToCustomerLocation:'',location:'',rfqDate:''})
  assert.equal(mergeLeadIntake(extracted,{sellTo:'Manually entered company'}).sellTo,'Manually entered company')
})

test('re-run refreshes untouched suggestions but keeps reviewed, dirty and explicitly cleared fields',()=>{
  const baseline={sellTo:'old.pdf',contactPerson:'old@example.com',scope:'Old scope',rfqNumber:'',contactEmail:'old@example.com',sellToCustomerLocation:''}
  const draft={...baseline,scope:'My draft scope',contactEmail:''}
  const before=structuredClone(baseline)
  const next=mergeLeadReviewSuggestions(draft,baseline,{sellTo:'Company',contactPerson:'Anita',scope:'New scope',rfqNumber:'RFQ-1',contactEmail:'new@example.com',sellToCustomerLocation:'Bengaluru'},[{k:'Contact person',state:'accepted'}],new Set(['sellToCustomerLocation']))
  assert.equal(next.sellTo,'Company')
  assert.equal(next.contactPerson,baseline.contactPerson)
  assert.equal(next.scope,'My draft scope')
  assert.equal(next.contactEmail,'')
  assert.equal(next.rfqNumber,'RFQ-1')
  assert.equal(next.sellToCustomerLocation,'')
  assert.deepEqual(baseline,before)
})

test('consecutive extraction refreshes generated suggestions without moving the saved baseline',()=>{
  const baseline={sellTo:'old.pdf',scope:''}
  const firstSuggestions={sellTo:'Company A',scope:'Supply of kits'}
  const first=mergeLeadReviewSuggestions(baseline,baseline,firstSuggestions)
  const second=mergeLeadReviewSuggestions(first,baseline,{sellTo:'Company B',scope:'Supply of kits and gaskets'},[],new Set(),firstSuggestions)
  assert.equal(second.sellTo,'Company B')
  assert.equal(second.scope,'Supply of kits and gaskets')
  assert.deepEqual(baseline,{sellTo:'old.pdf',scope:''})
  const edited=mergeLeadReviewSuggestions({...first,scope:'My custom scope'},baseline,{scope:'New scope'},[],new Set(),firstSuggestions)
  assert.equal(edited.scope,'My custom scope')
})
