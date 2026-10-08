import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { canManagePriceLists } from '../src/utils.js'
import * as editing from '../src/priceListEditing.js'

test('only LJS and ADMIN can maintain pricing', () => {
  for (const role of ['LJS', 'ADMIN']) assert.equal(canManagePriceLists(role), true)
  for (const role of ['SUPER', 'AH', 'RS', 'TECH', 'MANAGEMENT', undefined]) {
    assert.equal(canManagePriceLists(role), false, String(role))
  }
})

test('pricing validation accepts zero and decimals but rejects empty and invalid amounts', () => {
  for (const value of [0, '0', 12.5, '12.5']) assert.equal(editing.validPriceAmount(value), true)
  for (const value of ['', ' ', null, undefined, -1, '-1', NaN, Infinity, 'abc']) {
    assert.equal(editing.validPriceAmount(value), false, String(value))
  }
  assert.equal(editing.validServiceRatePatch({ rates: { engineerDay: 0 }, gst: 100 }), true)
  assert.equal(editing.validServiceRatePatch({ gst: 101 }), false)
  assert.equal(editing.validServiceRatePatch({ rates: { engineerDay: '' } }), false)
  assert.equal(editing.validPriceListParts([{ pn: 'A', price: 1, adders: [{ price: -1 }] }]), false)
})

// Execute the actual store actions with an in-memory state setter, avoiding
// browser/auth side effects while exercising their permission and merge logic.
const source = fs.readFileSync('src/store.jsx', 'utf8')
test('local pricing edits survive reload while cloud catalogue caches stay compact', () => {
  const snapshotSource = source.match(/const localSnapshot = state => \(\{[^]*?\n\}\)/)[0]
  const state = { rateSheets: { India: sheet }, priceLists: { QA: { parts: [{ pn: 'A', price: 10 }] } } }
  for (const online of [false, true]) {
    const snapshot = new Function('datastore', `const CACHE_VERSION = 2; ${snapshotSource}; return localSnapshot` )({ dbEnabled: () => online })(state)
    assert.deepEqual(snapshot.rateSheets, state.rateSheets)
    assert.equal(snapshot.priceLists, online ? undefined : state.priceLists)
  }
})

function action(name, initial) {
  let state = initial
  const method = source.match(new RegExp(`    ${name}\\([^]*?\\n    \\},`))?.[0].trim().slice(0, -1)
  assert.ok(method, `Missing store action ${name}`)
  const api = new Function('setState', 'withAudit', 'canManagePriceLists', 'validServiceRatePatch', 'validPriceListParts', `return {${method}}`)(
    update => { state = update(state) },
    (next, action) => ({ ...next, audit: [...(next.audit || []), action] }),
    canManagePriceLists, editing.validServiceRatePatch, editing.validPriceListParts,
  )
  return { run: (...args) => api[name](...args), state: () => state }
}

const sheet = { currency: 'INR', gst: 18, rates: { engineerDay: 45, minCallout: 90 }, roles: [{ role: 'Engineer' }] }
test('service saves are authorized, audited, and isolated to the selected sheet', () => {
  for (const role of ['LJS', 'ADMIN', 'SUPER', 'RS', 'AH']) {
    const initial = { role, rateSheets: { India: sheet, International: { ...sheet, currency: 'USD' } } }
    const store = action('updateRateSheets', initial)
    store.run('India', { rates: { engineerDay: 55 }, gst: 20 })
    if (!['LJS', 'ADMIN'].includes(role)) {
      assert.equal(store.state(), initial)
      continue
    }
    assert.equal(store.state().rateSheets.India.rates.engineerDay, 55)
    assert.equal(store.state().rateSheets.India.rates.minCallout, 90)
    assert.equal(store.state().rateSheets.India.gst, 20)
    assert.equal(store.state().rateSheets.International, initial.rateSheets.International)
    assert.deepEqual(store.state().audit, ['Service rate sheet updated'])
    const saved = store.state()
    store.run('India', { gst: 101 })
    assert.equal(store.state(), saved)
    store.run('Unknown', { gst: 0 })
    assert.equal(store.state(), saved)
  }
})

test('supplier editing creates an active version without overwriting history', () => {
  const old = { id: 'v1', version: 'Original', currency: 'EUR', parts: [{ pn: 'A', price: 10 }] }
  for (const role of ['LJS', 'ADMIN', 'SUPER', 'RS']) {
    const initial = { role, priceLists: { BNK: { ...old, activeVersionId: old.id, versions: [old] } } }
    const store = action('savePriceListVersion', initial)
    store.run('BNK', 'v1', [{ pn: 'A', price: 20 }], { version: 'Revised' })
    if (!['LJS', 'ADMIN'].includes(role)) {
      assert.equal(store.state(), initial)
      continue
    }
    const list = store.state().priceLists.BNK
    assert.equal(list.parts[0].price, 20)
    assert.equal(list.versions[0], old)
    assert.equal(list.versions.length, 2)
    assert.equal(list.activeVersionId, list.versions[1].id)
    assert.equal(list.versions[1].basedOn, 'v1')
    assert.deepEqual(store.state().audit, ['Price list version saved'])
    const saved = store.state()
    store.run('BNK', list.activeVersionId, [{ pn: 'A', price: -1 }])
    assert.equal(store.state(), saved)
  }
})
