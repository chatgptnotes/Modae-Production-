import test from 'node:test'
import assert from 'node:assert/strict'
import { deriveOpportunityScope } from '../src/leadScope.js'

test('derives opportunity scope from extracted spare-part lines', () => {
  const scope = deriveOpportunityScope([
    { description: 'Bently Nevada Proximity Probe', partNumber: '330101', qty: 4, uom: 'EA' },
    { description: 'Extension Cable', partNumber: '330130', qty: 4, uom: 'Nos.' },
  ])
  assert.equal(scope, 'Supply of Bently Nevada Proximity Probe (330101) — Qty 4 EA; Extension Cable (330130) — Qty 4 Nos.')
})
