import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { nextActionWith } from '../src/gates.js'
import { seedOpportunities, seedApprovals, seedKyc, seedSparesLines, seedSvcEstimates, newProposal, routeForType } from '../src/seed.js'
import { opportunityDateRange } from '../src/utils.js'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

const tracker = read('src/pages/Tracker.jsx')
const styles = read('src/styles.css')
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
test('the key-column set includes Proposal Send Date instead of Expected Order Date', () => {
  const m = tracker.match(/const KEY_COLS = \[([^\]]*)\]/)
  assert.ok(m, 'KEY_COLS must exist')
  const keys = m[1].split(',').map(s => s.trim().replace(/'/g, '')).filter(Boolean)
  assert.deepEqual(keys, ['id', 'sellTo', 'oppName', 'stage', 'oppType', 'prob', 'valueK', 'proposalDate', 'nextActionOwner'])
  assert.match(tracker, /label: 'Proposal Send Date'/)
  assert.match(tracker, /label: 'Expected Order Date'/)
  assert.ok(!keys.includes('owner'), 'Owner is not required for a sales owner')
  assert.ok(!keys.includes('lastUpdated'), 'Updated is not required for a sales owner')
})

test('sales owners open on the key columns, everyone else on the full sheet', () => {
  assert.match(tracker, /const \[colView, setColView\] = useState\(\(\) =>/)
  assert.match(tracker, /\? 'key' : 'all'/)
  // And the full sheet is one click away — nothing is removed.
  assert.match(tracker, /setColView\(colView === 'key' \? 'all' : 'key'\)/)
})

test('Excel export includes every tracker column for every role', () => {
  assert.match(tracker, /const exportCols = COLS/)
  assert.doesNotMatch(tracker, /COMMERCIAL_COLS/)
  assert.match(tracker, /\['Sl', \.\.\.exportCols\.map\(col => col\.label\)\]/)
  assert.match(tracker, /rows\.map\(\(o, index\) => \[index \+ 1, \.\.\.exportCols\.map\(col => \{/)
  assert.match(tracker, /case 'gmK': return gmK\(o\)/)
  assert.match(tracker, /case 'gmPct': return gmPct\(o\) \|\| ''/)
  assert.match(tracker, /nextActionWith\(o, store\.getProposal\(o\.id\), store\)\.owner \|\| ''/)
})

test('Value and COGS are editable for every tracker user while GM stays derived', () => {
  assert.match(tracker, /value=\{o\.valueK \? o\.valueK \* 1000 : ''\} onChange=\{upd\(o\.id, 'valueK'\)\}/)
  assert.match(tracker, /value=\{o\.cogsK \? o\.cogsK \* 1000 : ''\} onChange=\{upd\(o\.id, 'cogsK'\)\}/)
  assert.match(tracker, />\{o\.valueK \? fmtRupeesFromK\(gmK\(o\)\) : '-'\}<\/td>/)
  assert.doesNotMatch(tracker, /className="num locked"/)
  assert.doesNotMatch(tracker, /name="lock"/)
})

test('registration details become visibly read-only after registration', () => {
  assert.match(tracker, /Locked after registration/)
  assert.match(tracker, /\['Intake', 'Registration'\]\.includes\(o\.milestone\)/)
})

test('the opportunities table does not directly edit workflow stages', () => {
  assert.match(tracker, /Workflow stages are changed from the opportunity workspace/)
  assert.doesNotMatch(tracker, /store\.setMilestone\(o\.id, e\.target\.value/)
})

test('closed opportunities expose the shared mark-won control', () => {
  assert.match(tracker, /MarkWonControl/)
  assert.match(tracker, /o\.status === 'Closed' && <MarkWonControl opp=\{o\} store=\{store\} \/>/)
})

test('closing from the Status column requires outcome then reason', () => {
  assert.match(tracker, /field === 'status' && value === 'Closed'/)
  assert.match(tracker, /Choose Won or Lost first, then select the reason/)
  assert.match(tracker, /tracker-close-outcome-options/)
  assert.match(tracker, /closePending\.stage === outcome/)
  assert.match(tracker, /closePending\.stage === 'Won' \? WON_REASONS : CLOSE_REASONS/)
  assert.match(tracker, /store\.closeLost\(closePending\.id, reason\)/)
  assert.match(tracker, /store\.markWon\(closePending\.id, reason\)/)
})

test('tracker offers all, mine, and specific-owner filtering', () => {
  assert.match(tracker, /const owners = \[\.\.\.\(isSalesRep \? \['Mine'\] : \[\]\), 'All'/)
  assert.match(tracker, /ownerFilter === 'Mine' \? o\.owner === store\.role/)
  assert.match(tracker, /My Opportunities/)
  assert.match(tracker, /All Opportunities/)
  assert.match(tracker, /sortVal = \(o, key\) => \(DATE_KEYS\.includes\(key\) \? \(o\[key\] \|\| ''\)/)
})

test('tracker column controls compose filters and support select-all toggling', () => {
  assert.match(tracker, /matchesFilters = \(o, activeFilters = filters, except = null\)/)
  assert.match(tracker, /dateFilteredBase\.filter\(o => matchesFilters\(o\)\)/)
  assert.match(tracker, /current\[col\.key\] \? undefined : new Set\(values\)/)
  assert.match(tracker, /<button type="button" className="tracker-th-control"/)
  assert.match(styles, /table\.sheet th\.th-filter[\s\S]*font-weight: 700/)
})

test('tracker date filter supports specific dates and calendar periods', () => {
  assert.deepEqual(opportunityDateRange('specific', { date: '2026-09-19' }).range, ['2026-09-19', '2026-09-19'])
  assert.deepEqual(opportunityDateRange('week', {}, new Date('2026-09-19T12:00:00Z')).range, ['2026-09-14', '2026-09-20'])
  assert.deepEqual(opportunityDateRange('month', {}, new Date('2026-09-19T12:00:00Z')).range, ['2026-09-01', '2026-09-30'])
  assert.deepEqual(opportunityDateRange('quarter', {}, new Date('2026-09-19T12:00:00Z')).range, ['2026-07-01', '2026-09-30'])
  assert.deepEqual(opportunityDateRange('year', {}, new Date('2026-09-19T12:00:00Z')).range, ['2026-01-01', '2026-12-31'])
})

test('tracker custom date range validates ordering and allows open bounds', () => {
  assert.equal(opportunityDateRange('custom', { from: '2026-10-01', to: '2026-09-01' }).error, 'From date must be on or before the To date.')
  assert.equal(opportunityDateRange('custom', {}).range, null)
  assert.deepEqual(opportunityDateRange('custom', { from: '2026-09-01', to: '' }).range, ['2026-09-01', ''])
})

test('tracker renders selectable date fields and period controls', () => {
  assert.match(tracker, /Custom date filter/)
  assert.match(tracker, /aria-label="Custom filter date field"/)
  assert.match(tracker, /aria-label="Custom filter period"/)
  assert.match(tracker, /OPPORTUNITY_DATE_FIELDS/)
  assert.match(tracker, /OPPORTUNITY_PERIODS/)
  assert.match(tracker, /matchesDateFilter\(o\)/)
})

test('My Opportunities shows the same working columns', () => {
  assert.match(myOpps, /<th>Expected Order Date<\/th><th>Next Action<\/th>/)
  assert.doesNotMatch(myOpps, /<th>Owner<\/th>/)
  assert.doesNotMatch(myOpps, /<th>Updated<\/th>/)
})

test('opportunity IDs open the full opportunity workspace', () => {
  assert.match(tracker, /<Link to=\{`\/opp\/\$\{o\.id\}`\} title="Open opportunity workspace">\{o\.id\}<\/Link>/)
  assert.doesNotMatch(tracker, /<Link to=\{`\/folders\/\$\{o\.id\}`\}>\{o\.id\}<\/Link>/)
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

test('an opportunity with incomplete customer verification names the verification owner', () => {
  const clear = { id: 'X-1', status: 'Open', owner: 'RS', route: 'Service', customerStatus: 'Green', oppType: 'Service', sellTo: 'ACME', eucName: 'ACME Plant', eucLocation: 'Pune', oppName: 'Service scope', contactPerson: 'Buyer', contactPhone: '9999999999' }
  const na = nextActionWith(clear, { bom: [], terms: [] }, { approvals: [], kyc: {}, sparesLines: [], svcEstimates: [] })
  assert.equal(na.owner, 'AH')
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
