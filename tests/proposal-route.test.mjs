import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { docRoute, docLayout, DOC_ROUTES, DOC_BODY_SECTIONS, defaultExecSummary } from '../src/proposalDoc.js'
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
  const migrated = read('src/store.jsx')
  assert.match(migrated, /o\.oppType === 'AMC' \|\| o\.oppType === 'Training' \? 'Service'/,
    'store.migrate must remap saved AMC/Training rows onto Service')
})

test('the proposal type selector overrides the opportunity route', () => {
  assert.equal(docRoute({ proposalType: 'Spares' }, { oppType: 'Project' }), 'Spares')
  assert.equal(docRoute({ proposalType: 'Project' }, { oppType: 'Spares' }), 'Project')
})

test('spares and services print fewer sections than a project', () => {
  const project = docLayout({}, { oppType: 'Project' })
  const spares = docLayout({}, { oppType: 'Spares' })
  const services = docLayout({}, { oppType: 'Service' })

  assert.equal(project.sections.length, DOC_BODY_SECTIONS.length)
  assert.ok(spares.sections.length < project.sections.length,
    'the spares document must be shorter than the project document')
  assert.ok(services.sections.length < project.sections.length,
    'the services document must be shorter than the project document')

  // Every route's sections must be real sections, in the canonical order.
  for (const layout of Object.values(DOC_ROUTES)) {
    for (const s of layout.sections) assert.ok(DOC_BODY_SECTIONS.includes(s), `unknown section ${s}`)
    const order = layout.sections.map(s => DOC_BODY_SECTIONS.indexOf(s))
    assert.deepEqual(order, [...order].sort((a, b) => a - b), 'sections must stay in document order')
  }
})

// A two-page spares quote does not need a table of contents or a company profile.
test('spares drops the project front matter', () => {
  const spares = docLayout({}, { oppType: 'Spares' })
  assert.equal(spares.contents, false)
  assert.equal(spares.about, false)
  assert.equal(docLayout({}, { oppType: 'Project' }).contents, true)
  assert.equal(docLayout({}, { oppType: 'Project' }).about, true)
})

test('a services proposal quotes a scope of work, not a scope of supply', () => {
  assert.equal(docLayout({}, { oppType: 'Service' }).scopeTitle, 'Scope of work')
  assert.equal(docLayout({}, { oppType: 'Project' }).scopeTitle, 'Scope of supply')
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
  assert.match(print, /const S = Object\.fromEntries\(sections\.map/)
  // Every section page must go through page(), which drops unlisted sections.
  assert.doesNotMatch(print, /<Page[^>]*n=\{S\['Attachments/,
    'the attachments page must render through page() so spares can drop it')
})

// "In the spare parts case, there will not be any signal list, there will not
// be rack layout."
test('signal list and rack layout tabs are hidden off the project route', () => {
  const proposal = read('src/pages/Proposal.jsx')
  assert.match(proposal, /const route = docRoute\(p, opp\)/)
  assert.match(proposal, /Project: \['Cover Letter', 'Document', 'Signal List', 'Rack Layout', 'Priced BoQ'\]/)
  assert.match(proposal, /Services: \['Cover Letter', 'Document', 'Scope of Work', 'Issues List', 'Proposal', 'Service Rate Schedule'\]/)
  assert.match(proposal, /Spares: \['Cover Letter', 'Document', 'Firm Offer', 'Clarifications', 'Sensor Comparison', 'Priced BoQ'\]/)
  assert.match(proposal, /const visibleTabs = ROUTE_TABS\[route\]/)
  assert.match(proposal, /visibleTabs\.map/, 'the tab bar must render the filtered list')
})
