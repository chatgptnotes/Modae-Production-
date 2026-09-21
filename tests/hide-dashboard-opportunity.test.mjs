import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { isHiddenDashboardOpportunity } from '../src/utils.js'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

test('Primary 10 Opportunity is hidden from dashboard/list presentation only', () => {
  assert.equal(isHiddenDashboardOpportunity({ oppName: 'Primary 10 Opportunity' }), true)
  assert.equal(isHiddenDashboardOpportunity({ oppName: ' primary 10 opportunity ' }), true)
  assert.equal(isHiddenDashboardOpportunity({ oppName: 'Another Opportunity' }), false)
  assert.match(read('src/pages/MyOpps.jsx'), /store\.opportunities\.filter\(o => !isHiddenDashboardOpportunity\(o\)/)
})
