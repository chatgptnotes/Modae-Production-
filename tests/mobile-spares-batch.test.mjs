import test from 'node:test'
import assert from 'node:assert/strict'

const load = () => import('../src/workbench/mobileSpares.js')
const line = (id, extra = {}) => ({ id, oppId: 'O1', pn: 'SAME-PART', desc: 'Probe', qty: 2, listPrice: 100, listUnitPrice: 100, baseCost: 80, currency: 'INR', priceState: 'Current', priceSource: 'price-list', priceList: 'Approved', confirmed: false, markupPct: 0, discountPct: 0, ...extra })
const costing = { currencyRates: { EUR: 100, USD: 90 }, customsDutyPct: 10, ervPct: 0, handlingPct: 0 }

test('batch pricing previews all opportunity totals and only changes eligible selected IDs', async () => {
  const { buildSparesBatchReview } = await load()
  const lines = [line('A'), line('B', { priceState: 'Expired' }), line('C', { oppId: 'OTHER' }), line('D')]
  const review = buildSparesBatchReview({ lines, oppId: 'O1', mode: 'adjust', selectedIds: ['A', 'B', 'C'], markupPct: '20', discountPct: '0', costing })
  assert.deepEqual(review.changes.map(c => c.id), ['A'])
  assert.deepEqual(review.excluded.map(c => c.id), ['B', 'C'])
  assert.equal(review.totalsBefore.revenue, 600)
  assert.equal(review.totalsAfter.revenue, 640)
  assert.equal(review.totalsAfter.cogs, 480)
  assert.equal(lines[0].markupPct, 0, 'a preview must not mutate its source')
})

test('different quantities for repeated part numbers remain separate rows', async () => {
  const { buildSparesBatchReview, applySparesBatch } = await load()
  const lines = [line('A'), line('B')]
  const review = buildSparesBatchReview({ lines, oppId: 'O1', mode: 'qty', drafts: { A: '4', B: '7' }, costing })
  assert.equal(review.totalsAfter.quantity, 11)
  const result = applySparesBatch(lines, 'O1', review.changes)
  assert.equal(result.ok, true)
  assert.deepEqual(result.lines.map(l => [l.id, l.qty]), [['A', 4], ['B', 7]])
})

test('confirmation never confirms expired, removed or incomplete selected lines', async () => {
  const { buildSparesBatchReview } = await load()
  const lines = [line('A', { priceSourceSuggested: true }), line('B', { priceState: 'Expired' }), line('C', { qty: 0 }), line('D', { removedFromSourcing: true }), line('E', { listUnitPrice: 0 })]
  const review = buildSparesBatchReview({ lines, oppId: 'O1', mode: 'confirm', selectedIds: lines.map(l => l.id), costing })
  assert.deepEqual(review.changes.map(c => c.id), ['A'])
  assert.equal(review.changes[0].patch.confirmed, true)
  assert.equal(review.changes[0].patch.priceSourceSuggested, false)
  assert.equal(review.excluded.length, 4)
})

test('blank, negative and non-finite drafts cannot save as zero or corrupt prices', async () => {
  const { buildSparesBatchReview } = await load()
  for (const value of ['', '-1', 'Infinity', 'abc', '0']) {
    const review = buildSparesBatchReview({ lines: [line('A')], oppId: 'O1', mode: 'qty', drafts: { A: value }, costing })
    assert.equal(review.changes.length, 0)
    assert.equal(review.invalid.length, 1)
  }
})

test('customer price edits respect imported landed cost and existing markup limits', async () => {
  const { buildSparesBatchReview } = await load()
  const lines = [line('A', { currency: 'EUR', listUnitPrice: 10, listPrice: 10, qty: 1 })]
  const review = buildSparesBatchReview({ lines, oppId: 'O1', mode: 'customer', drafts: { A: '1320' }, displayCurrency: 'INR', costing })
  assert.ok(Math.abs(review.changes[0].patch.markupPct - 20) < 0.00001)
  assert.equal(review.totalsAfter.revenue, 1320)
  assert.equal(review.changes[0].patch.listUnitPrice, undefined)
  assert.equal(buildSparesBatchReview({ lines, oppId: 'O1', mode: 'customer', drafts: { A: '100' }, costing }).invalid.length, 1)
})

test('manual supplier edits retain attribution and use the displayed currency conversion', async () => {
  const { buildSparesBatchReview } = await load()
  const review = buildSparesBatchReview({ lines: [line('A')], oppId: 'O1', mode: 'supplier', drafts: { A: '15' }, displayCurrency: 'EUR', costing, actor: 'LJS', now: '2026-10-09T10:00:00.000Z' })
  const patch = review.changes[0].patch
  assert.equal(patch.listUnitPrice, 1500)
  assert.equal(patch.currency, 'INR')
  assert.equal(patch.priceSource, 'manual')
  assert.equal(patch.addedBy, 'LJS')
  assert.equal(patch.priceSourceDate, '2026-10-09')
})

test('stale or deleted lines reject the entire batch and preserve other opportunity rows', async () => {
  const { buildSparesBatchReview, applySparesBatch } = await load()
  const lines = [line('A'), line('B'), line('C', { oppId: 'OTHER' })]
  const review = buildSparesBatchReview({ lines, oppId: 'O1', mode: 'qty', drafts: { A: '3', B: '4' }, costing })
  const changed = [line('A', { qty: 9 }), ...lines.slice(1)]
  assert.equal(applySparesBatch(changed, 'O1', review.changes).ok, false)
  assert.equal(applySparesBatch(lines.filter(l => l.id !== 'B'), 'O1', review.changes).ok, false)
  const saved = applySparesBatch(lines, 'O1', review.changes)
  assert.equal(saved.lines[2], lines[2])
})

test('an old draft baseline is rejected rather than overwriting refreshed supplier data', async () => {
  const { buildSparesBatchReview } = await load()
  const before = line('A')
  const review = buildSparesBatchReview({ lines: [line('A', { listPrice: 500, listUnitPrice: 500 })], oppId: 'O1', mode: 'qty', drafts: { A: '7' }, baselines: { A: before }, costing })
  assert.equal(review.invalid.length, 1)
  assert.equal(review.changes.length, 0)
})

test('status filters separate ready matches from confirmed and incomplete parts', async () => {
  const { sparesMobileStatus } = await load()
  assert.equal(sparesMobileStatus(line('A')).key, 'ready')
  assert.equal(sparesMobileStatus(line('A', { confirmed: true })).key, 'confirmed')
  assert.equal(sparesMobileStatus(line('A', { confirmed: true, priceState: 'Expired' })).key, 'attention')
})

test('draft totals include unconfirmed priced parts and omit explicitly removed parts', async () => {
  const { sparesBatchTotals } = await load()
  const totals = sparesBatchTotals([line('A'), line('B', { confirmed: true }), line('C', { removedFromSourcing: true })], costing)
  assert.equal(totals.revenue, 400)
  assert.equal(totals.quantity, 4)
})

test('batch state boundary refuses restricted roles, closed opportunities and reviewed stages', async () => {
  const { applySparesBatchToState } = await import('../src/sparesBatchState.js')
  const { buildSparesBatchReview } = await load()
  const lines = [line('A')]
  const review = buildSparesBatchReview({ lines, oppId: 'O1', mode: 'qty', drafts: { A: '3' }, costing })
  const state = { role: 'LJS', opportunities: [{ id: 'O1', route: 'Spares', milestone: 'Sourcing', status: 'Open' }], sparesLines: lines, proposals: {}, config: {} }
  assert.equal(applySparesBatchToState(state, 'O1', review.changes).ok, true)
  for (const extra of [{ role: 'TECH' }, { opportunities: [{ ...state.opportunities[0], status: 'Closed' }] }, { opportunities: [{ ...state.opportunities[0], milestone: 'Proposal' }] }]) {
    assert.equal(applySparesBatchToState({ ...state, ...extra }, 'O1', review.changes).ok, false)
  }
})

test('batch state boundary rechecks the costing basis before applying the reviewed prices', async () => {
  const { applySparesBatchToState, sparesCostingSnapshot } = await import('../src/sparesBatchState.js')
  const { buildSparesBatchReview } = await load()
  const lines = [line('A')]
  const state = { role: 'LJS', opportunities: [{ id: 'O1', route: 'Spares', milestone: 'Sourcing', status: 'Open' }], sparesLines: lines, proposals: { O1: { costing: { currencyRates: { EUR: 100 } } } }, config: {} }
  const review = buildSparesBatchReview({ lines, oppId: 'O1', mode: 'qty', drafts: { A: '3' }, costing })
  const basis = sparesCostingSnapshot(state, 'O1')
  assert.equal(applySparesBatchToState({ ...state, proposals: { O1: { costing: { currencyRates: { EUR: 120 } } } } }, 'O1', review.changes, basis).ok, false)
})
