import test from 'node:test'
import assert from 'node:assert/strict'
import { createLeadAddressValidation } from '../src/leadAddressValidation.js'

const result = { status: 'Valid', confidence: 'High', issues: [], standardizedAddress: 'Corrected address', source: 'Google Address Validation', canApply: true }
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
test('background attempts expose pending synchronously, deduplicate rerenders, and do not change values', async () => {
  const d = deferred(); let calls = 0
  const registry = createLeadAddressValidation(async fields => { calls++; assert.equal(fields.eucLocation, 'Original'); return d.promise })
  const attempt = {}
  registry.start('user', 'lead', { eucLocation: 'Original' }, attempt)
  registry.start('user', 'lead', { eucLocation: 'Original' }, attempt)
  assert.equal(calls, 1)
  assert.equal(registry.read('user', 'lead', 'eucLocation', 'Original').pending, true)
  assert.equal(registry.read('user', 'lead', 'eucLocation', 'Edited'), null)
  d.resolve({ eucLocation: result }); await new Promise(resolve => setImmediate(resolve))
  assert.equal(registry.read('user', 'lead', 'eucLocation', 'Original').result, result)
  assert.equal(registry.read('user', 'lead', 'eucLocation', 'Edited'), null)
})
test('editing, new extraction attempts and account changes discard late results', async () => {
  const first = deferred(), second = deferred(); let calls = 0
  const registry = createLeadAddressValidation(() => ++calls === 1 ? first.promise : second.promise)
  registry.start('u', 'l', { eucLocation: 'A' }, {})
  registry.invalidate('u', 'l', 'eucLocation')
  first.resolve({ eucLocation: result }); await first.promise; await Promise.resolve()
  assert.equal(registry.read('u', 'l', 'eucLocation', 'A'), null)
  registry.start('u', 'l', { eucLocation: 'B' }, {})
  registry.setAccount('another-user')
  second.resolve({ eucLocation: result }); await second.promise; await Promise.resolve()
  assert.equal(registry.read('u', 'l', 'eucLocation', 'B'), null)
})
test('failed background requests settle without throwing and missing fields make no calls', async () => {
  let calls = 0
  const registry = createLeadAddressValidation(async () => { calls++; throw new Error('network') })
  registry.start('u', 'l', { eucLocation: '', sellToCustomerLocation: '' }, {})
  assert.equal(calls, 0)
  registry.start('u', 'l', { eucLocation: 'Custom' }, {})
  await new Promise(resolve => setImmediate(resolve))
  const check = registry.read('u', 'l', 'eucLocation', 'Custom')
  assert.equal(check.pending, false)
  assert.equal(check.result.status, 'Needs Clarification')
  assert.match(check.result.issues[0], /continue/i)
})
test('an older attempt cannot replace a newer extraction for the same text', async () => {
  const first = deferred(), second = deferred(); let n = 0
  const registry = createLeadAddressValidation(() => ++n === 1 ? first.promise : second.promise)
  registry.start('u', 'l', { eucLocation: 'A' }, {})
  registry.start('u', 'l', { eucLocation: 'A' }, {})
  second.resolve({ eucLocation: result }); await second.promise; await Promise.resolve()
  first.resolve({ eucLocation: { ...result, status: 'Invalid' } }); await first.promise; await Promise.resolve()
  assert.equal(registry.read('u', 'l', 'eucLocation', 'A').result.status, 'Valid')
})

test('a late extraction for a previous account cannot abort or replace the active account', async () => {
  const pending = deferred(); let calls = 0, signal
  const registry = createLeadAddressValidation((fields, inputSignal) => { calls++; signal = inputSignal; return pending.promise })
  registry.setAccount('B')
  registry.start('B', 'lead-B', { eucLocation: 'B address' }, {})
  registry.start('A', 'lead-A', { eucLocation: 'Private A address' }, {})
  assert.equal(calls, 1)
  assert.equal(signal.aborted, false)
  assert.equal(registry.read('B', 'lead-B', 'eucLocation', 'B address').pending, true)
  registry.setAccount(null)
  registry.start('A', 'lead-A', { eucLocation: 'Private A address' }, {})
  assert.equal(calls, 1, 'signout must reject late starts too')
  pending.resolve({ eucLocation: result })
})

test('checking one field preserves the other field result and its pending request', async () => {
  const first = deferred(), second = deferred(); let n = 0
  const registry = createLeadAddressValidation(() => ++n === 1 ? first.promise : second.promise)
  registry.start('u', 'l', { eucLocation: 'Site', sellToCustomerLocation: 'Office' }, {})
  registry.start('u', 'l', { eucLocation: 'Edited site' }, {}, { preserveOtherFields: true })
  first.resolve({ eucLocation: { ...result, status: 'Invalid' }, sellToCustomerLocation: result })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(registry.read('u', 'l', 'sellToCustomerLocation', 'Office').result.status, 'Valid')
  assert.equal(registry.read('u', 'l', 'eucLocation', 'Edited site').pending, true)
  second.resolve({ eucLocation: result }); await new Promise(resolve => setImmediate(resolve))
  assert.equal(registry.read('u', 'l', 'eucLocation', 'Edited site').result.status, 'Valid')
  assert.equal(registry.read('u', 'l', 'sellToCustomerLocation', 'Office').result.status, 'Valid')
})

test('repeated Enter checks for an identical pending value make only one request', () => {
  let calls = 0
  const registry = createLeadAddressValidation(() => { calls++; return new Promise(() => {}) })
  registry.start('u', 'l', { eucLocation: 'Site' }, {}, { preserveOtherFields: true })
  registry.start('u', 'l', { eucLocation: 'Site' }, {}, { preserveOtherFields: true })
  assert.equal(calls, 1)
  registry.setAccount(null)
})
