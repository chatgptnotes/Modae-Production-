import test from 'node:test'
import assert from 'node:assert/strict'
import { allocateTarget, targetPaise, targetRupees, targetThousands, targetTotal, targetAmountsEqual } from '../src/pages/myDashboard/targetAllocation.js'

test('a 500 rupee annual target splits into four 125 rupee quarters', () => {
  assert.deepEqual(allocateTarget(targetThousands(500), [1, 1, 1, 1]).map(targetRupees), [125, 125, 125, 125])
})
test('small fractional owner weights retain their proportion', () => {
  const shares = allocateTarget(targetThousands(500), [targetThousands(100), targetThousands(300)])
  assert.deepEqual(shares.map(targetRupees), [125, 375])
  assert.equal(targetPaise(targetTotal(shares)), 50000)
})
test('allocation preserves every paise and resolves indivisible remainders deterministically', () => {
  const shares = allocateTarget(targetThousands('0.05'), [0, 0, 0, 0])
  assert.deepEqual(shares.map(targetRupees), [0.02, 0.01, 0.01, 0.01])
  assert.equal(targetTotal(shares), targetThousands('0.05'))
  assert.deepEqual(allocateTarget(1, [], 0), [])
})
test('decimal INR validation compares integer paise rather than floating point sums', () => {
  const values = ['0.10', '0.20', '0.30', '0.40'].map(targetThousands)
  assert.equal(targetAmountsEqual(targetTotal(values), targetThousands('1.00')), true)
  assert.equal(targetAmountsEqual(targetTotal(values), targetThousands('1.01')), false)
  assert.equal(targetRupees(targetThousands('500.01')), 500.01)
})
test('company allocation and quarter allocation conserve the full decimal target', () => {
  const annuals = allocateTarget(targetThousands('1000.03'), [1, 2, 3, 4, 5, 6, 7])
  const quarters = annuals.map(annual => allocateTarget(annual, [1, 1, 1, 1]))
  assert.equal(targetPaise(targetTotal(annuals)), 100003)
  quarters.forEach((rows, i) => assert.equal(targetPaise(targetTotal(rows)), targetPaise(annuals[i])))
})
