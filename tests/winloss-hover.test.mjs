import test from 'node:test'
import assert from 'node:assert/strict'
import { donutOutcomeAt, donutTiltAt } from '../src/pages/myDashboard/donutGeometry.js'

test('hover follows the fixed ring, including the lifted edge, but excludes the centre', () => {
  assert.equal(donutOutcomeAt(150, 30, .25), 'won')
  assert.equal(donutOutcomeAt(80, 155, .25), 'lost')
  assert.equal(donutOutcomeAt(80, 80, .25), null)
  assert.equal(donutOutcomeAt(79.9, -5, .25), 'lost')
  assert.equal(donutOutcomeAt(80, -20, .25), null)
})

test('single outcomes and tiny slices preserve their true proportions', () => {
  assert.equal(donutOutcomeAt(80, 5, 1), 'won')
  assert.equal(donutOutcomeAt(80, 5, 0), 'lost')
  assert.equal(donutOutcomeAt(80.1, 5, .001), 'won')
  assert.equal(donutOutcomeAt(81, 5, .001), 'lost')
})


test('lifted outer edge remains interactive and pointer tilt is bounded', () => {
  assert.equal(donutOutcomeAt(80, -13, 1), 'won')
  assert.equal(donutOutcomeAt(80, -17, 1), null)
  assert.deepEqual(donutTiltAt(80, 80), { x: 0, y: 0 })
  assert.deepEqual(donutTiltAt(160, 0), { x: 4, y: 4 })
  assert.deepEqual(donutTiltAt(-20, 180), { x: -4, y: -4 })
})
