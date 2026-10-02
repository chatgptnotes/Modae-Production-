import test from 'node:test'
import assert from 'node:assert/strict'
import { funnelRows } from '../src/kpi.js'

test('shared funnel groups legacy stages under the reviewed labels', () => {
  const rows = funnelRows([
    { owner: 'RS', status: 'Open', stage: 'Lead', valueK: 10 },
    { owner: 'RS', status: 'Open', stage: 'RFI', valueK: 20 },
    { owner: 'RS', status: 'Open', stage: 'Budgetary', valueK: 30 },
    { owner: 'RS', status: 'Open', stage: 'RFQ', valueK: 40 },
    { owner: 'RS', status: 'Open', stage: 'Firm Bid', valueK: 50 },
    { owner: 'RS', status: 'Open', stage: 'Negotiate', valueK: 60 },
    { owner: 'RS', status: 'Closed', stage: 'Won', valueK: 70 },
    { owner: 'RS', status: 'Closed', stage: 'Lost', valueK: 80 },
  ])
  assert.deepEqual(rows.map(row => row.label), ['Qualified Lead', 'Budgetary', 'RFQ', 'Firm Proposal', 'Negotiate'])
  assert.deepEqual(rows.map(row => row.count), [2, 1, 1, 1, 1])
  assert.equal(rows[0].valueK, 30)
  assert.equal(rows.at(-1).valueK, 60)
  assert.ok(!rows.some(row => row.label === 'Won'))
})

test('shared funnel supports personal and global scopes', () => {
  const opportunities = [
    { owner: 'RS', status: 'Open', stage: 'RFQ', valueK: 1 },
    { owner: 'PP', status: 'Open', stage: 'RFQ', valueK: 2 },
  ]
  assert.equal(funnelRows(opportunities, { owner: 'RS' }).find(row => row.label === 'RFQ').count, 1)
  assert.equal(funnelRows(opportunities).find(row => row.label === 'RFQ').count, 2)
})
