import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { nextActionWith } from '../src/gates.js'
import { seedOpportunities, seedApprovals, seedKyc, seedSparesLines, seedSvcEstimates, newProposal, routeForType } from '../src/seed.js'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

const tracker = read('src/pages/Tracker.jsx')
const myOpps = read('src/pages/MyOpps.jsx')
const state = {
  approvals: seedApprovals, kyc: seedKyc,
  sparesLines: seedSparesLines, svcEstimates: seedSvcEstimates,
}
const opps = seedOpportunities.map(o => ({ ...o, route: o.route || routeForType(o.oppType) }))
const proposalFor = o => newProposal(o.id, o)

// Biji, 13 Aug, listing the columns he needs: "Opportunity ID, Customer,
// Opportunity Name, Stage, Probability… I need value, value and expected order
// date… and I should know where is the next action pending." Opportunity Owner
// and Updated were explicitly not required.
test('the key-column set is exactly the columns the client asked for', () => {
  const m = tracker.match(/const KEY_COLS = \[([^\]]*)\]/)
  assert.ok(m, 'KEY_COLS must exist')
  const keys = m[1].split(',').map(s => s.trim().replace(/'/g, '')).filter(Boolean)
  assert.deepEqual(keys, ['id', 'sellTo', 'oppName', 'stage', 'oppType', 'prob', 'valueK', 'orderDate', 'nextActionOwner'])
  assert.ok(!keys.includes('owner'), 'Owner is not required for a sales owner')
  assert.ok(!keys.includes('lastUpdated'), 'Updated is not required for a sales owner')
})

test('sales owners open on the key columns, everyone else on the full sheet', () => {
  assert.match(tracker, /const \[colView, setColView\] = useState\(\(\) =>/)
  assert.match(tracker, /\? 'key' : 'all'/)
  // And the full sheet is one click away — nothing is removed.
  assert.match(tracker, /setColView\(colView === 'key' \? 'all' : 'key'\)/)
})

test('My Opportunities shows the same working columns', () => {
  assert.match(myOpps, /<th>Expected Order Date<\/th><th>Next Action<\/th>/)
  assert.doesNotMatch(myOpps, /<th>Owner<\/th>/)
  assert.doesNotMatch(myOpps, /<th>Updated<\/th>/)
})

// --------------------------------------------------- next action pending owner
test('the next action owner is derived, not left blank', () => {
  const open = opps.filter(o => o.status === 'Open')
  assert.ok(open.length > 0)
  const named = open.filter(o => nextActionWith(o, proposalFor(o), state).owner)
  assert.equal(named.length, open.length,
    'every open opportunity must name who the next action sits with')
})

test('a typed owner overrides the derivation', () => {
  const o = { ...opps[0], nextActionOwner: 'PP' }
  const na = nextActionWith(o, proposalFor(o), state)
  assert.equal(na.owner, 'PP')
  assert.equal(na.derived, false)
})

test('an unblocked opportunity names nobody rather than guessing', () => {
  const clear = { id: 'X-1', status: 'Open', owner: 'RS', route: 'Service', customerStatus: 'Green', oppType: 'Service' }
  const na = nextActionWith(clear, { bom: [], terms: [] }, { approvals: [], kyc: {}, sparesLines: [], svcEstimates: [] })
  assert.equal(na.owner, '')
  assert.equal(na.derived, true)
})

test('a KYC block sits with the commercial approver', () => {
  const blue = { id: 'X-2', status: 'Open', owner: 'RS', route: 'Service', oppType: 'Service', customerStatus: 'Blue', sellTo: 'Unknown Ltd' }
  const na = nextActionWith(blue, { bom: [], terms: [] }, { approvals: [], kyc: {}, sparesLines: [], svcEstimates: [] })
  assert.equal(na.owner, 'AH')
  assert.match(na.text, /KYC/)
})

test('the derivation is wired into the sheet, the list and the drawer', () => {
  assert.match(tracker, /nextActionWith\(o, store\.getProposal\(o\.id\), store\)/)
  assert.match(myOpps, /nextActionWith\(o, store\.getProposal\(o\.id\), store\)/)
  assert.match(read('src/opppanel.jsx'), /nextActionWith\(opp, store\.getProposal\(oppId\), store\)/)
})

// ------------------------------------------------------------- dates
// "Create date, proposal date and last update date — it automatically system
// taken." Only the two expected dates are the salesperson's to type.
test('system-stamped dates are read-only on the sheet', () => {
  assert.doesNotMatch(tracker, /value=\{o\.createDate \|\| ''\} onChange=/,
    'Create Date must not be editable')
  assert.doesNotMatch(tracker, /value=\{o\.proposalDate \|\| ''\} onChange=/,
    'Proposal Date must not be editable')
  assert.match(tracker, /Stamped when the opportunity was created — read only/)
  assert.match(tracker, /Auto-stamped — read only/)
})

test('expected order and ship dates are flagged when missing', () => {
  assert.match(tracker, /o\.status === 'Open' && !o\.orderDate \? 'need' : ''/)
  assert.match(tracker, /o\.status === 'Open' && !o\.invoiceDate \? 'need' : ''/)
  assert.match(tracker, /Expected order date is required on an open opportunity/)
})

// The rename landed on the tracker only; the drawer, Analytics and the forecast
// dashboard still said Order Date / Invoice Date.
test('no surface still says Order Date or Invoice Date', () => {
  for (const file of [
    'src/pages/Tracker.jsx', 'src/pages/MyOpps.jsx', 'src/opppanel.jsx',
    'src/pages/Analytics.jsx', 'src/pages/Dashboard.jsx',
  ]) {
    const text = read(file)
    const stale = text.match(/(?<!Expected )(Order|Invoice) [Dd]ate/g) || []
    assert.deepEqual(stale, [], `${file} still carries: ${stale.join(', ')}`)
  }
})
