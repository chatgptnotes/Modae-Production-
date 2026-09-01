import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { normalizeProposal, buildDocProps, lineQty } from '../src/proposal/docProps.js'
import { newProposal } from '../src/seed.js'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

const workbench = read('src/pages/Workbench.jsx')
const proposal = read('src/pages/Proposal.jsx')

// The Proposal tab's Preview sub-tab showed BoQ line count, revision, value,
// COGS and GM — a summary of the document, never the document. The salesperson
// and the approver both have to read what the customer will read.
test('the Preview sub-tab renders the real document', () => {
  assert.match(workbench, /<div className="proposal-preview-scroll">\s*<PrintDoc/,
    'Preview must render PrintDoc')
  assert.doesNotMatch(workbench, /<div className="section-title">Workbook preview<\/div>/,
    'the old stat card must be gone')
})

// One document, one derivation. If the Preview tab built its own totals they
// would drift from the printed ones the first time the pricing rules changed.
test('preview and print derive their props the same way', () => {
  assert.match(workbench, /buildDocProps\(store, opp\.id\)/)
  assert.match(proposal, /buildPricing\(store, p\)/)
  assert.doesNotMatch(proposal, /const allParts = \[/,
    'the pricing chain must live in docProps.js, not be duplicated in the page')
  // gates.js#computeProposalTotals is a different shape and ignores part
  // adders, so it must not creep back in as the preview's source of truth.
  assert.doesNotMatch(workbench, /computeProposalTotals/)
})

test('proposal keeps one artifact tab row and no top-level print action', () => {
  assert.match(proposal, /proposal-artifact-tabs/, 'the canonical artifact tabs remain available')
  assert.doesNotMatch(proposal, /<div className=\{embedded \? 'sheet-tabs inline' : 'sheet-tabs'\}>/, 'the duplicate bottom tab row is removed')
  assert.doesNotMatch(proposal, /<button className="primary" onClick=\{\(\) => setPrinting\(true\)\}><Icon name="printer"/, 'the toolbar Print/PDF action is removed')
})

// normalize() used to live in Proposal.jsx, which node:test cannot parse
// because it is JSX. Moving it out is what makes the migration testable.
test('the proposal migration is reachable from a test', () => {
  const migrated = normalizeProposal({ oppId: 'X', bom: [{ pn: 'A', qty: 4, adders: [] }] }, { oppType: 'Spares' })
  assert.equal(migrated.bom[0].common, 4, 'a legacy single qty becomes Common')
  assert.equal(migrated.bom[0].qtyPerUnit, 0)
  assert.equal(migrated.units, 7)
  assert.ok(Array.isArray(migrated.artifactSheets))
})

test('normalizing twice changes nothing more', () => {
  const opp = { oppType: 'Spares' }
  const once = normalizeProposal(newProposal('X', opp), opp)
  const twice = normalizeProposal(once, opp)
  assert.deepEqual(twice, once)
})

// Qty/Unit × units + Common + Spares — the rule the printed BoQ, the signal
// list and the tracker totals all have to agree on.
test('the BoQ quantity rule stays in one place', () => {
  assert.equal(lineQty({ qtyPerUnit: 2, common: 3, spares: 1 }, 7), 18)
  assert.equal(lineQty({ common: 4 }, 7), 4)
})

// A preview that throws on an opportunity nobody has priced yet is worse than
// the stat card it replaced.
test('an unknown opportunity yields no props rather than throwing', () => {
  const store = { opportunities: [], getProposal: () => newProposal('X', {}), role: 'RS' }
  assert.equal(buildDocProps(store, 'nope'), null)
})

test('an empty proposal still builds a document', () => {
  const opp = { id: 'X', oppType: 'Spares', sellTo: 'KSB' }
  const store = {
    opportunities: [opp],
    getProposal: () => newProposal('X', opp),
    priceLists: {}, adhocParts: [], files: {}, role: 'RS',
  }
  const props = buildDocProps(store, 'X')
  assert.ok(props.doc, 'a document model is produced')
  assert.deepEqual(props.totals, { cost: 0, target: 0 })
})

// An unpriced technical bid prints no prices; selling rates on a priced bid are
// customer-facing and therefore visible regardless of the logged-in role.
test('priced proposals show rates to every role', () => {
  const opp = { id: 'X', oppType: 'Spares', sellTo: 'KSB' }
  const mk = (role, bidType) => buildDocProps({
    opportunities: [opp],
    getProposal: () => ({ ...newProposal('X', opp), bidType }),
    priceLists: {}, adhocParts: [], files: {}, role,
  }, 'X').priced

  for (const role of ['RS', 'AH', 'LJS', 'TECH', 'CUST']) {
    assert.equal(mk(role, 'Priced'), true, `${role} must see selling rates on priced proposals`)
  }
  assert.equal(mk('RS', 'Unpriced (Technical)'), false, 'an unpriced bid never shows prices')
})
