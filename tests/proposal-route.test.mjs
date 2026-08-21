import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  docRoute, docLayout, docSheets, DOC_ROUTES, DOC_SHEET_KINDS, defaultExecSummary,
} from '../src/proposalDoc.js'
import { newProposal, proposalTypeForOpp, OPP_TYPES } from '../src/seed.js'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

// 13 Aug client review: the full section set is the *project* proposal. "If it
// is not a project, then we have to have another template, simple template,
// because this is very complicated."
test('each opportunity type resolves to one document route', () => {
  const expected = {
    Spares: 'Spares',
    Retrofit: 'Spares',
    Service: 'Services',
    Project: 'Project',
    Upgrade: 'Project',
    Flow: 'Project',
  }
  for (const [oppType, route] of Object.entries(expected)) {
    assert.equal(docRoute({}, { oppType }), route, `${oppType} must use the ${route} document`)
  }
  // Every type the client's Field List allows must be covered above, so a new
  // one cannot be added without deciding which document it prints.
  assert.deepEqual([...OPP_TYPES].sort(), Object.keys(expected).sort())
})

// Diagram 02 §3 is headed "Retrofit / Spares - Main Flow" and the handover
// report's Stage 7 makes a Brownfield proposal cover letter + BoQ only, so a
// Retrofit must not print the 14-page project document.
test('Retrofit prints the Brownfield document, not the project one', () => {
  assert.notEqual(docRoute({}, { oppType: 'Retrofit' }), 'Project')
  assert.equal(newProposal('OPP-1', { oppType: 'Retrofit' }).proposalType, 'Spares')
  assert.equal(proposalTypeForOpp({ oppType: 'Retrofit' }), 'Spares')
})

// AMC and Training were ours, not the client's. They left OPP_TYPES when the
// Field List became the source of truth. Saved rows carrying them are remapped
// to Service by store.migrate, so nothing downstream needs to know them.
test('AMC and Training are off the opportunity type list', () => {
  for (const oppType of ['AMC', 'Training']) {
    assert.ok(!OPP_TYPES.includes(oppType), `${oppType} must be off the dropdown`)
  }
  const migrated = read('src/appState.js')
  assert.match(migrated, /o\.oppType === 'AMC' \|\| o\.oppType === 'Training' \? 'Service'/,
    'migrate must remap saved AMC/Training rows onto Service')
})

test('the proposal type selector overrides the opportunity route', () => {
  assert.equal(docRoute({ proposalType: 'Spares' }, { oppType: 'Project' }), 'Spares')
  assert.equal(docRoute({ proposalType: 'Project' }, { oppType: 'Spares' }), 'Project')
})

// The client's own sample proposals (doc/Further Inputs) settled what the
// documents actually are: a covering letter plus ONE commercial sheet, with
// technical annexes beside it. Not a long-or-short run of numbered sections —
// which is what the arrays this test used to assert against were.
test('every route is a covering letter plus one commercial sheet', () => {
  for (const [route, layout] of Object.entries(DOC_ROUTES)) {
    assert.equal(layout.sheets[0], 'cover', `${route} must open with the covering letter`)
    assert.equal(layout.sheets.filter(s => s === 'boq').length, 1,
      `${route} must carry exactly one pricing sheet`)
    for (const s of [...layout.sheets, ...layout.annexes]) {
      assert.ok(DOC_SHEET_KINDS.includes(s), `unknown sheet ${s} on ${route}`)
    }
  }
})

test('each route carries the sheets its sample carries', () => {
  assert.deepEqual(DOC_ROUTES.Project.sheets, ['cover', 'signalList', 'rackLayout', 'boq'])
  assert.deepEqual(DOC_ROUTES.Spares.sheets, ['cover', 'boq'])
  assert.deepEqual(DOC_ROUTES.Services.sheets, ['cover', 'boq'])
})

// No sample proposal has a contents page, a company page or an executive
// summary — not even the big project one, which is what the 13 Aug review was
// worried about. The front matter is gone from every route, not just spares.
test('no route prints project front matter', () => {
  const print = read('src/proposal/PrintDoc.jsx')
  for (const layout of Object.values(DOC_ROUTES)) {
    assert.equal(layout.contents, undefined)
    assert.equal(layout.about, undefined)
  }
  assert.doesNotMatch(print, /title="Contents"/)
  assert.doesNotMatch(print, /doc-toc/, 'the table of contents is gone')
})

// The annexes ship hidden in the workbooks — prepared, not issued. A PDF has no
// hidden sheets, so they stay out until the proposal opts in.
test('hidden annexes print only when opted in', () => {
  const opp = { oppType: 'Spares' }
  assert.deepEqual(docSheets({}, opp), ['cover', 'boq'])
  assert.deepEqual(docSheets({ printAnnexes: ['sensorComparison'] }, opp),
    ['cover', 'boq', 'sensorComparison'])
  // An annexe that does not belong to the route cannot be forced on.
  assert.deepEqual(docSheets({ printAnnexes: ['compliance'] }, opp), ['cover', 'boq'])
})

// The samples title the pricing sheet by revision — 'Rev-00', 'BoQ & Price-00'.
test('the pricing sheet is titled the way the samples title it', () => {
  const rev = { revision: '00' }
  assert.equal(docLayout(rev, { oppType: 'Project' }).boqTitle(rev), 'Priced BoQ')
  assert.equal(docLayout(rev, { oppType: 'Spares' }).boqTitle(rev), 'Rev-00')
  assert.equal(docLayout(rev, { oppType: 'Service' }).boqTitle(rev), 'BoQ & Price-00')
})

// Spares-2 quotes two makes side by side; Spares-1 quotes one. Same route, and
// the number of priced groups is what tells them apart.
test('a two-option spares offer picks the option column set', () => {
  const spares = docLayout({}, { oppType: 'Spares' })
  assert.equal(spares.boqVariant({ itemGroups: [{ id: 'g1' }] }), 'firm')
  assert.equal(spares.boqVariant({ itemGroups: [{ id: 'g1' }, { id: 'g2' }] }), 'options')
  const services = docLayout({}, { oppType: 'Service' })
  assert.equal(services.boqVariant({}), 'rate')
  assert.equal(services.boqVariant({ serviceKind: 'scope' }), 'scope')
})

// The auto-drafted "our understanding" paragraph described spare sensing
// elements on every proposal, including projects.
test('the executive summary describes the actual route', () => {
  const p = { bom: [], terms: [], units: 1, rfqNumber: 'RFQ-1' }
  const spares = defaultExecSummary(p, { oppType: 'Spares', sellTo: 'KSB' })
  const project = defaultExecSummary(p, { oppType: 'Project', sellTo: 'KSB' })
  const services = defaultExecSummary(p, { oppType: 'Service', sellTo: 'KSB' })

  assert.match(spares, /replacement and spare sensing elements/)
  assert.doesNotMatch(project, /replacement and spare sensing elements/)
  assert.doesNotMatch(services, /replacement and spare sensing elements/)
  for (const text of [spares, project, services]) assert.match(text, /OUR UNDERSTANDING/)
})

test('the printed document is driven by the route, not by a banner', () => {
  const print = read('src/proposal/PrintDoc.jsx')
  assert.match(print, /const layout = docLayout\(p, opp\)/)
  assert.match(print, /const sheets = docSheets\(p, opp\)/)
  // Every sheet must go through sheet(), which drops the ones this route or
  // this proposal does not carry. A bare <Page> would print unconditionally.
  assert.doesNotMatch(print, /<Page[^>]*title="(Signal List|Rack Layout|Clarifications)"/,
    'every sheet must render through sheet()')
})

// "In the spare parts case, there will not be any signal list, there will not
// be rack layout."
test('signal list and rack layout tabs are hidden off the project route', () => {
  const proposal = read('src/pages/Proposal.jsx')
  assert.match(proposal, /const route = docRoute\(p, opp\)/)
  assert.match(proposal, /Project: \['Cover Letter', 'Edit Sheet', 'Document', 'Signal List', 'Rack Layout', 'Priced BoQ'\]/)
  assert.match(proposal, /Services: \['Cover Letter', 'Edit Sheet', 'Document', 'Scope of Work', 'Issues List', 'Proposal', 'Service Rate Schedule'\]/)
  assert.match(proposal, /Spares: \['Cover Letter', 'Edit Sheet', 'Document', 'Firm Offer', 'Clarifications', 'Sensor Comparison', 'Priced BoQ'\]/)
  assert.match(proposal, /const visibleTabs = ROUTE_TABS\[route\]/)
  assert.match(proposal, /visibleTabs\.map/, 'the tab bar must render the filtered list')
})
