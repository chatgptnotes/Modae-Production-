import test from 'node:test'
import assert from 'node:assert/strict'
import { DraftRegistry } from '../src/workspaceDrafts.js'
test('remote revision pauses dirty record without advancing its base', () => {
  const d = new DraftRegistry(); d.edit('leads','L',{data:{subject:'base'},rev:2})
  d.observe('leads','L',{available:true,rev:3})
  assert.equal(d.blocked('leads','L'),true)
  assert.equal(d.get('leads','L').base.rev,2)
})
test('clean records can refresh and unavailable drafts stay protected', () => {
  const d=new DraftRegistry()
  assert.equal(d.observe('leads','L',{available:true,rev:2}),true)
  d.edit('leads','L',{data:{},rev:2}); d.observe('leads','L',{available:false})
  assert.equal(d.get('leads','L').status,'unavailable')
  assert.equal(d.blocked('leads','L'),true)
})
test('late save acknowledgment never clears later input', () => {
  const d=new DraftRegistry(); d.edit('leads','L',{data:{},rev:1})
  const seq=d.get('leads','L').seq
  d.edit('leads','L',{data:{},rev:1})
  d.saved('leads','L',{data:{subject:'first'},rev:2},seq)
  assert.ok(d.get('leads','L'))
  assert.equal(d.get('leads','L').base.rev,2)
})
test('a remote change during a save remains a conflict after its acknowledgment', () => {
  const d=new DraftRegistry();d.edit('leads','L',{data:{},rev:1});const seq=d.get('leads','L').seq
  d.observe('leads','L',{available:true,rev:3});d.saved('leads','L',{data:{},rev:2},seq)
  assert.equal(d.blocked('leads','L'),true)
})
