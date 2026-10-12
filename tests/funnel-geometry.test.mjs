import test from 'node:test'
import assert from 'node:assert/strict'
import { dynamicFunnelGeometry, funnelBandPath } from '../src/pages/myDashboard/funnelGeometry.js'

for (const counts of [[1, 6, 1, 0, 1, 11], [6, 5, 4, 3, 2, 1], [1, 2, 3, 4, 5, 6], [2, 2, 2, 2, 2, 2], [0, 0, 0, 0, 0, 0], [0, 1000000, 0, 1, 0, 5]]) {
  test(`curved funnel remains bounded and connected for ${counts}`, () => {
    const geometry = dynamicFunnelGeometry(counts.map(count => ({ count })))
    geometry.forEach((row, index) => {
      assert.ok(row.width >= 30 && row.width <= 80)
      assert.equal(row.width, 30 + 50 * counts[index] / Math.max(1, ...counts))
      assert.ok(row.controls.every(width => width >= 264 && width <= 704.000001))
      if (index) assert.equal(row.controls[0], geometry[index - 1].controls[6])
      assert.doesNotMatch(funnelBandPath(row), /NaN|Infinity/)
      if (!counts[index]) assert.equal(row.width, 30)
    })
  })
}

test('probability bands share curved boundaries without overlap or gaps', () => {
  const [geometry] = dynamicFunnelGeometry([{ count: 6 }, { count: 1 }])
  const first = funnelBandPath(geometry, 0, 1 / 6)
  const second = funnelBandPath(geometry, 1 / 6, 1)
  const boundary = geometry.controls.map(width => 440 + (1 / 6 - .5) * width)
  assert.ok(first.includes(`L ${boundary[6]} 100`))
  assert.ok(second.startsWith(`M ${boundary[0]} 0`))
  assert.ok(second.includes(`${boundary[6]} 100 L`))
})
