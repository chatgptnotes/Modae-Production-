import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import { migrate, seedState, emptyState, stateFromSaved, syncedOf, mergeLeadSlice, mergeOpportunitySlice, mergeSparesLineSlice, mergeClarificationSlice, KEY } from '../src/appState.js'
import { seedAiLeads, seedJointApprovals } from '../src/seed.js'

// The app ships full of seeded demo records, and until now there was no way out
// of them: the three "Reset demo data" buttons restore the seeds rather than
// clear them. `demoData: false` + emptyState() is that way out.
//
// These tests RUN the state functions rather than regex-matching store.jsx —
// which is why the pure layer lives in appState.js. The regression they exist
// for is subtle: migrate() runs on every boot and used to re-inject seed records
// unconditionally, so an app emptied by clearDemo() would silently refill itself
// on the next reload.

const empty = () => emptyState(seedState())

test('lead hydration keeps a local mail created before the server save completes', () => {
  const local = [{ id: 'LD-local', subject: 'New mail', status: 'New' }]
  const server = [{ id: 'LD-old', subject: 'Old mail', status: 'New' }]
  const merged = mergeLeadSlice(local, server, [])
  assert.deepEqual(merged.rows.map(l => l.id), ['LD-local', 'LD-old'])
})

test('opportunity hydration merges local and server rows without jumping lists', () => {
  const local = [{ id: 'OP-local', oppName: 'Local opportunity' }]
  const server = [{ id: 'OP-server', oppName: 'Server opportunity' }]
  const merged = mergeOpportunitySlice(local, server, [])
  assert.deepEqual(merged.rows.map(o => o.id), ['OP-local', 'OP-server'])
})

test('opportunity hydration keeps local edits and deletions against a stale server snapshot', () => {
  const baseline = [
    { id: 'OP-edit', oppName: 'Before' },
    { id: 'OP-delete', oppName: 'Remove me' },
  ]
  const local = [{ id: 'OP-edit', oppName: 'After' }]
  const server = [...baseline]
  const merged = mergeOpportunitySlice(local, server, baseline)
  assert.deepEqual(merged.rows, [{ id: 'OP-edit', oppName: 'After' }])
})

test('pending opportunity hydration preserves a locally created row until the server confirms it', () => {
  const baseline = [{ id: 'OP-pending', oppName: 'New opportunity' }]
  const merged = mergeOpportunitySlice(baseline, [], baseline, [], ['OP-pending'])
  assert.deepEqual(merged.rows, baseline)
})

test('pending opportunity hydration clears protection once the server returns the row', () => {
  const local = [{ id: 'OP-pending', oppName: 'New opportunity' }]
  const server = [{ id: 'OP-pending', oppName: 'New opportunity' }]
  const merged = mergeOpportunitySlice(local, server, local, [], ['OP-pending'])
  assert.deepEqual(merged.rows, server)
})

test('an explicit opportunity deletion overrides pending sync protection', () => {
  const local = [{ id: 'OP-pending', oppName: 'New opportunity' }]
  const merged = mergeOpportunitySlice(local, [], local, ['OP-pending'], ['OP-pending'])
  assert.deepEqual(merged.rows, [])
})

test('legacy cached opportunities without a baseline are marked pending for recovery', () => {
  const saved = JSON.stringify({
    demoData: false,
    opportunities: [{ id: 'OP-legacy', sellTo: 'Customer' }],
    opportunitySyncBaseline: [],
  })
  const restored = stateFromSaved(saved)
  assert.deepEqual(restored.pendingOpportunitySyncIds, ['OP-legacy'])
})

test('legacy recovery also repairs an existing empty pending marker', () => {
  const saved = JSON.stringify({
    demoData: false,
    opportunities: [{ id: 'OP-legacy', sellTo: 'Customer' }],
    opportunitySyncBaseline: [],
    pendingOpportunitySyncIds: [],
  })
  const restored = stateFromSaved(saved)
  assert.deepEqual(restored.pendingOpportunitySyncIds, ['OP-legacy'])
})

test('spares hydration preserves local rows against an empty server slice', () => {
  const local = [{ id: 'SL-local', oppId: 'O-1', pn: 'RK16-BASE', qty: 1 }]
  const merged = mergeSparesLineSlice(local, [], [])
  assert.deepEqual(merged.rows, local)
})

test('spares hydration preserves local rows when an older baseline exists', () => {
  const local = [{ id: 'SL-local', oppId: 'O-1', pn: 'RK16-BASE', qty: 1, listPrice: 100 }]
  const merged = mergeSparesLineSlice(local, [], local)
  assert.deepEqual(merged.rows, local)
  assert.deepEqual(merged.baseline, [])
})

test('spares hydration keeps an intentional local deletion against a stale server slice', () => {
  const baseline = [{ id: 'SL-delete', oppId: 'O-1', pn: 'OLD-PART', qty: 1 }]
  const merged = mergeSparesLineSlice([], baseline, baseline)
  assert.deepEqual(merged.rows, [])
})

test('lead hydration preserves local edits and deletes against a stale server snapshot', () => {
  const baseline = [
    { id: 'LD-edit', subject: 'Before', status: 'New' },
    { id: 'LD-delete', subject: 'Remove me', status: 'New' },
  ]
  const local = [{ id: 'LD-edit', subject: 'After', status: 'Qualified' }]
  const server = [
    { id: 'LD-edit', subject: 'Before', status: 'New' },
    { id: 'LD-delete', subject: 'Remove me', status: 'New' },
  ]
  const merged = mergeLeadSlice(local, server, baseline)
  assert.deepEqual(merged.rows, [{ id: 'LD-edit', subject: 'After', status: 'Qualified' }])
})

test('clarification hydration preserves local questions against a stale empty server slice', () => {
  const local = [{ id: 'CL-local', oppId: 'O-1', status: 'Open', q: 'Confirm the delivery address' }]
  const merged = mergeClarificationSlice(local, [], [])
  assert.deepEqual(merged.rows, local)
})

test('clarification hydration preserves local answers but accepts confirmed server rows', () => {
  const baseline = [{ id: 'CL-1', oppId: 'O-1', status: 'Open', q: 'Confirm the part number', response: '' }]
  const local = [{ ...baseline[0], status: 'Answered', response: 'MX-2033' }]
  const server = [{ ...baseline[0], status: 'Answered', response: 'MX-2033' }, { id: 'CL-2', oppId: 'O-1', status: 'Open', q: 'Confirm quantity' }]
  const merged = mergeClarificationSlice(local, server, baseline)
  assert.deepEqual(merged.rows, local.concat(server.slice(1)))
})

test('clarification refresh preserves a confirmed question omitted by a stale server snapshot', () => {
  const confirmed = [{ id: 'CL-1', oppId: 'O-1', status: 'Open', q: 'Confirm the part number' }]
  const merged = mergeClarificationSlice(confirmed, [], confirmed)
  assert.deepEqual(merged.rows, confirmed)
  assert.deepEqual(merged.baseline, [])
})

test('an intentional clarification reset remains empty', () => {
  const server = [{ id: 'CL-old', oppId: 'O-1', status: 'Open', q: 'Old question' }]
  const merged = mergeClarificationSlice([], [], server)
  assert.deepEqual(merged.rows, [])
})

test('the seeded state is flagged as demo data', () => {
  assert.equal(seedState().demoData, true)
})

test('an emptied state has no business records left', () => {
  const s = empty()
  assert.equal(s.demoData, false)
  for (const k of ['opportunities', 'leads', 'leadArchive', 'leadDeadlines', 'approvals',
    'customers', 'audit', 'sparesLines', 'sparesAlternatives', 'svcEstimates',
    'clarifications', 'surveys', 'competitors']) {
    assert.deepEqual(s[k], [], `${k} must be emptied`)
  }
  for (const k of ['files', 'proposals', 'communications', 'kyc', 'poCompare', 'handover', 'bSteps']) {
    assert.deepEqual(s[k], {}, `${k} must be emptied`)
  }
  assert.deepEqual(s.sales.orders, [], 'booked orders are demo records')
})

// You have to be able to sign in and keep working after removing the demo data,
// which is the whole point of not wiping these.
test('logins, configuration and the catalogues survive the wipe', () => {
  const seeded = seedState()
  const s = empty()
  assert.ok(s.users.length > 0, 'the demo logins are how you get back in')
  assert.deepEqual(s.users, seeded.users)
  assert.ok(Object.keys(s.priceLists).length > 0, 'price lists are reference data')
  // One canonical set of service rate sheets since 22 Sep, and they are edited
  // in Admin, so a wipe must keep them.
  assert.ok(Object.keys(s.rateSheets).length > 0, 'the service rate sheets are reference data')
  assert.ok(s.rateSheets.India.rates.engineerDay > 0)
  assert.equal(s.rateSheet, undefined, 'the duplicate role table is gone')
  assert.ok(s.adhocParts.length >= 0)
  assert.ok(s.config.approvalThresholds, 'admin configuration is kept')
  assert.ok(Object.keys(s.sales.targets).length > 0, 'owner targets are configuration, not demo rows')
  assert.equal(s.sales.fy, seeded.sales.fy)
})

// seedConfig carries one placeholder upload that Admin renders with a
// "DUMMY — replace with actual" chip. It is demo data hiding inside config.
test('the placeholder price-list upload goes with the rest of the dummy data', () => {
  const seeded = seedState()
  assert.ok(seeded.config.uploads.priceLists.some(p => p.dummy),
    'the seed is expected to carry the dummy upload — this test is pointless otherwise')
  assert.equal(empty().config.uploads.priceLists.some(p => p.dummy), false)
})

// The load-bearing one. Before the demoData gate, migrate() ran
//   s.leads = [...seedAiLeads.filter(...), ...s.leads]
// unconditionally, so LD-203…LD-207 and AP-1 came back on every single boot.
test('a reload does not put the demo records back', () => {
  const rebooted = migrate(JSON.parse(JSON.stringify(empty())))
  assert.equal(rebooted.demoData, false)
  assert.deepEqual(rebooted.opportunities, [])
  assert.deepEqual(rebooted.leads, [], 'seedAiLeads must stay out')
  assert.deepEqual(rebooted.approvals, [], 'seedJointApprovals must stay out')
  assert.deepEqual(rebooted.customers, [])
  assert.deepEqual(rebooted.sales.orders, [])
  assert.deepEqual(rebooted.poCompare, {})
  assert.deepEqual(rebooted.handover, {})
  assert.deepEqual(rebooted.kyc, {})
})

test('migration repairs old unconfirmed description-only catalogue matches', () => {
  const state = seedState()
  state.demoData = false
  state.sparesLines = [
    { id: 'SL-legacy', oppId: 'OPP-1', origin: 'customer', custRef: 'VM600 rack backplane connectors', pn: 'VM600-ABE042', desc: 'VM600 ABE042 rack', match: 'Suggested · tier 4', confirmed: false, priceList: 'BNK', priceSource: 'price-list', priceState: 'Current', listPrice: 2650, listUnitPrice: 2650, baseCost: 2650 },
    { id: 'SL-exact', oppId: 'OPP-1', origin: 'customer', custRef: 'MPC4', pn: 'VM600-MPC4', desc: 'MPC4', qty: 1, match: 'Exact', confirmed: true, priceList: 'BNK', priceSource: 'price-list', priceState: 'Current', listPrice: 100, listUnitPrice: 100 },
    { id: 'SL-human', oppId: 'OPP-1', origin: 'customer', custRef: 'legacy confirmed', pn: 'VM600-ABE042', desc: 'VM600 ABE042 rack', qty: 1, match: 'Suggested · tier 4', confirmed: true, priceList: 'BNK', priceSource: 'price-list', priceState: 'Current', listPrice: 2650, listUnitPrice: 2650 },
  ]
  state.proposals = { 'OPP-1': { bom: [
    { pn: 'VM600-ABE042', custRef: 'VM600 rack backplane connectors', listPrice: 2650 },
    { pn: 'VM600-MPC4', custRef: 'MPC4', listPrice: 100 },
  ] } }
  const migrated = migrate(state)
  const legacy = migrated.sparesLines.find(line => line.id === 'SL-legacy')
  assert.equal(legacy.pn, '')
  assert.equal(legacy.desc, 'VM600 rack backplane connectors')
  const numberedLegacy = migrate({ ...state, sparesLines: [{ ...state.sparesLines[0], custRef: '9', desc: 'VM600 ABE042 rack' }] }).sparesLines[0]
  assert.equal(numberedLegacy.desc, '')
  assert.equal(numberedLegacy.missingDescription, true)
  assert.equal(legacy.listPrice, 0)
  assert.equal(legacy.priceState, 'Needs pricing')
  assert.equal(legacy.confirmed, false)
  assert.equal(migrated.sparesLines.find(line => line.id === 'SL-exact').pn, 'VM600-MPC4')
  assert.equal(migrated.sparesLines.find(line => line.id === 'SL-human').pn, 'VM600-ABE042')
  assert.deepEqual(migrated.proposals['OPP-1'].bom.map(line => line.pn), ['VM600-MPC4'])
  const rebooted = migrate(migrated)
  assert.deepEqual(rebooted, migrated)
})

test('migration removes legacy automatic Spares support rows but keeps manual ones', () => {
  const state = seedState()
  state.demoData = false
  state.sparesLines = [
    { id: 'SL-auto', oppId: 'OPP-1', sparesSupport: true, origin: 'proposal-support', pn: 'NA', desc: 'Warranty Certificate' },
    { id: 'SL-manual', oppId: 'OPP-1', sparesSupport: true, origin: 'manual', supportAddedManually: true, pn: 'NA', desc: 'Country of Origin Certificate' },
  ]
  state.proposals = { 'OPP-1': { bom: [
    { sparesSupport: true, pn: 'NA', desc: 'Warranty Certificate' },
    { sparesSupport: true, origin: 'manual', pn: 'NA', desc: 'Country of Origin Certificate' },
  ] } }
  const migrated = migrate(state)
  assert.deepEqual(migrated.sparesLines.map(line => line.id), ['SL-manual'])
  assert.deepEqual(migrated.proposals['OPP-1'].bom.map(line => line.desc), ['Country of Origin Certificate'])
})

test('migration clears generated customer item labels even when previously confirmed', () => {
  const state = seedState()
  state.demoData = false
  state.sparesLines = [{ id: 'SL-generated', oppId: 'OPP-1', confirmed: true, qty: 2, listPrice: 23, listUnitPrice: 23, priceState: 'Current', custRef: '2', desc: 'Customer-requested item 2' }]
  const migrated = migrate(state)
  assert.equal(migrated.sparesLines[0].desc, '')
  assert.equal(migrated.sparesLines[0].missingDescription, true)
  assert.equal(migrated.sparesLines[0].confirmed, false)
})

test('migration removes unknown sourcing placeholders without changing confirmed values', () => {
  const migrated = migrate({
    ...seedState(),
    demoData: false,
    sparesLines: [
      { id: 'SL-placeholder', oppId: 'OPP-1', oem: 'TBD', leadTime: 'TBC', qty: 1, listPrice: 0 },
      { id: 'SL-confirmed', oppId: 'OPP-1', oem: 'B&K', leadTime: '6-8 weeks', qty: 1, listPrice: 23 },
    ],
  })
  assert.deepEqual(migrated.sparesLines.map(line => [line.oem, line.leadTime]), [
    ['', ''],
    ['B&K', '6-8 weeks'],
  ])
})

// A record created after the wipe has to survive the same reload — an empty app
// that quietly drops the first real enquiry would be worse than the demo data.
test('records created after the wipe survive a reload', () => {
  const s = empty()
  const opp = {
    sl: 1, id: '2608001RS', sellTo: 'Real Customer Pvt Ltd', category: 'OEM',
    eucName: 'Real EUC', oppName: 'First real enquiry', owner: 'RS',
    oppType: 'Project', stage: 'Prospect', status: 'Open', valueK: 100,
  }
  const withOpp = { ...s, opportunities: [opp], demoData: false }
  const rebooted = migrate(JSON.parse(JSON.stringify(withOpp)))
  assert.equal(rebooted.opportunities.length, 1, 'the real enquiry must not be dropped')
  assert.equal(rebooted.opportunities[0].id, '2608001RS')
  assert.equal(rebooted.opportunities[0].sellTo, 'Real Customer Pvt Ltd')
  assert.ok(rebooted.opportunities[0].route, 'migrate still derives the workflow lane')
  assert.deepEqual(rebooted.leads, [], 'and no demo rows sneak in alongside it')
})

// The flag is opt-out, so every state saved before this change keeps behaving
// exactly as it did.
test('demo mode is still the default and still self-heals', () => {
  const noFlag = migrate({ ...seedState(), demoData: undefined, leads: [], approvals: [] })
  assert.equal(noFlag.demoData, true)
  assert.equal(noFlag.leads.length, seedAiLeads.length, 'seedAiLeads still land when demo is on')
  assert.equal(noFlag.approvals.length, seedJointApprovals.length)
})

test('migrate gives duplicate spares rows separate ids', () => {
  const s = seedState()
  s.sparesLines = [
    { id: 'SL-same', oppId: '2609001PP', pn: 'A' },
    { id: 'SL-same', oppId: '2609001PP', pn: 'B' },
  ]
  const migrated = migrate(JSON.parse(JSON.stringify(s)))
  assert.deepEqual(migrated.sparesLines.map(line => line.id), ['SL-same', 'SL-repair-1'])
})

// clearDemo pushes syncedOf(emptyState(...)) to Supabase, and datastore.resetAll
// deletes every app_state row whose key is not in that map. A slice missing from
// the synced set would be left behind on the server holding demo records, and
// the next device to focus would pull them straight back.
test('the emptied state covers every synced slice the seed has', () => {
  const seeded = Object.keys(syncedOf(seedState())).sort()
  const emptied = Object.keys(syncedOf(empty())).sort()
  assert.deepEqual(emptied, seeded)
  assert.ok(emptied.includes('demoData'), 'the flag itself has to sync, or devices disagree')
})

test('the storage key is unchanged — this feature must not force a reseed', () => {
  assert.equal(KEY, 'wintrack-modae-v4')
})

// ---- the actual boot path -------------------------------------------------
// clearDemo() writes emptyState() to localStorage and reloads; on the way back
// up the app calls stateFromSaved(localStorage.getItem(KEY)). These drive that
// round trip rather than migrate() alone, so they also cover the guard that
// decides whether a saved snapshot is trusted at all.

const boot = state => stateFromSaved(JSON.stringify(state))

test('booting from an emptied snapshot keeps the app empty', () => {
  const s = boot(empty())
  assert.equal(s.demoData, false)
  assert.deepEqual(s.opportunities, [])
  assert.deepEqual(s.leads, [])
  assert.deepEqual(s.approvals, [])
  assert.deepEqual(s.customers, [])
  assert.ok(s.users.length > 0, 'but you can still sign in')
})

// The snapshot guard reads opportunities[0].sellTo to spot a corrupt state. On a
// blank slate the first real enquiry IS opportunities[0], so a creation path
// that left sellTo undefined would make the whole saved state look corrupt and
// get thrown away — silently taking the user's work with it.
test('the first enquiry filed on a blank slate survives the reload', () => {
  const s = boot({
    ...empty(),
    opportunities: [{
      sl: 1, id: '2608001RS', sellTo: 'Real Customer Pvt Ltd', category: 'OEM',
      eucName: 'Real EUC', oppName: 'First real enquiry', owner: 'RS',
      oppType: 'Project', stage: 'Prospect', status: 'Open', valueK: 100,
    }],
    customers: [{ name: 'Real Customer Pvt Ltd', category: 'OEM', status: 'Blue', kyc: 'Pending', payment: '—' }],
  })
  assert.equal(s.opportunities.length, 1)
  assert.equal(s.opportunities[0].oppName, 'First real enquiry')
  assert.equal(s.customers.length, 1, 'and the customer it created')
  assert.deepEqual(s.leads, [], 'without the demo data coming back with it')
})

test('a first enquiry with no customer name still is not treated as corrupt', () => {
  const s = boot({ ...empty(), opportunities: [{ id: '2608001RS', sellTo: '', oppName: 'Draft' }] })
  assert.equal(s.opportunities.length, 1, "'' is a blank field, not a corrupt snapshot")
  assert.equal(s.demoData, false)
})

test('a missing or unreadable snapshot still falls back to the demo data', () => {
  for (const bad of [null, '', 'not json', '{}', '{"opportunities":"nope"}']) {
    const s = stateFromSaved(bad)
    assert.equal(s.demoData, true, `${JSON.stringify(bad)} must fall back to seeds`)
    assert.ok(s.opportunities.length > 0)
  }
})

// The three demo-data buttons must all be the shared control, or the wording and
// the confirm guards drift apart between them.
test('all three demo-data call sites use the shared control', () => {
  for (const f of ['src/App.jsx', 'src/pages/Admin.jsx', 'src/pages/Launcher.jsx']) {
    const src = fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
    assert.match(src, /<DemoDataControls/, `${f} must render DemoDataControls`)
    assert.match(src, /DemoDataControls[^\n]*} from '\.\.?\/(\.\.\/)?ui\.jsx'|DemoDataControls } from/,
      `${f} must import DemoDataControls`)
    assert.doesNotMatch(src, /window\.confirm\('Reset all demo data/,
      `${f} must not keep its own copy of the reset confirm`)
  }
})

// Every Launcher scenario deep-links to a seeded record, so they cannot work on
// an emptied app and must not pretend to.
test('the demo launcher stands down when the demo data is gone', () => {
  const src = fs.readFileSync(new URL('../src/pages/Launcher.jsx', import.meta.url), 'utf8')
  assert.match(src, /const demo = store\.demoData !== false/)
  assert.match(src, /if \(!demo\) return/, 'start() must refuse to navigate')
  assert.match(src, /disabled=\{!demo\}/, 'the scenario buttons must be disabled')
})

// A closed <select> over store.customers is unusable once the customer master is
// empty — you could not file the first real enquiry at all.
test('the intake form accepts a customer name that is not in the master yet', () => {
  const src = fs.readFileSync(new URL('../src/pages/IntakeForm.jsx', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /<Select field="sellTo"/, 'Sell To must not be a closed dropdown')
  assert.match(src, /<Input field="sellTo" list="intake-customers"/)
  assert.match(src, /<datalist id="intake-customers">/, 'the master is still offered as suggestions')
})
