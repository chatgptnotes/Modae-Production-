import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { docModel, defaultDocTerms, docTermsHeading, recommendTerms } from '../src/proposalDoc.js'
import { newProposal } from '../src/seed.js'
import { oppBlockers } from '../src/gates.js'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

// The numbered block prints at the foot of the pricing sheet, as in the
// samples — so it lives in BoqSheet, not in the document shell.
const print = read('src/proposal/PrintDoc.jsx') + read('src/proposal/sheets/BoqSheet.jsx')

const forRoute = oppType => defaultDocTerms(newProposal('X', { oppType }), { oppType })
const labels = oppType => forRoute(oppType).map(t => t.label)

// Every sample proposal ends its pricing sheet with a numbered Terms &
// Conditions block of ten or so clauses. The app printed a two-column table of
// four — Payment, Delivery, Validity, Warranty — and nothing else, so Price
// Basis, Freight, PBG, LD and the standard-terms reference never reached the
// customer.
test('the printed terms are a numbered list, not a four-row table', () => {
  assert.match(print, /<ol className="doc-terms-list">/)
  assert.doesNotMatch(print, /<th style=\{\{ width: '26%' \}\}>Term<\/th>/,
    'the two-column Terms offered table is gone')
})

test('each route prints the clauses its sample carries', () => {
  for (const oppType of ['Project', 'Spares', 'Service']) {
    const ls = labels(oppType)
    assert.ok(ls.length >= 8, `${oppType} must carry the full clause set, got ${ls.length}`)
    assert.equal(ls[0], 'Proposal Validity', 'validity leads, as in the samples')
    assert.ok(ls.includes('Payment Terms'))
    assert.ok(ls.includes('Other Terms & Conditions'),
      'every sample ends by referring to the ModAE standard terms of sale')
  }
})

// PBG, LD and "make/model during detail engineering" appear only in the project
// sample; the spares and services offers would be over-committing.
test('project-only clauses stay on the project route', () => {
  const project = labels('Project')
  for (const only of ['Performance Bank Guarantee', 'Liquidated Damages', 'Make, Model & Part Numbers']) {
    assert.ok(project.includes(only), `project must carry ${only}`)
    assert.ok(!labels('Spares').includes(only), `spares must not carry ${only}`)
    assert.ok(!labels('Service').includes(only), `services must not carry ${only}`)
  }
})

// The services samples carry health-and-safety clauses no goods proposal has.
test('services carry the site clauses', () => {
  const services = labels('Service')
  assert.ok(services.includes('Site Deputation'))
  assert.ok(services.includes('Health & Safety'))
  const text = forRoute('Service').map(t => t.text).join(' ')
  assert.match(text, /12 hours in any day/)
  assert.match(text, /exclusive of GST/)
})

test('the project terms heading is the sample wording', () => {
  assert.equal(docTermsHeading({}, { oppType: 'Project' }),
    'Project Specific Special Commercial Terms & Conditions:')
  assert.equal(docTermsHeading({}, { oppType: 'Spares' }), 'Terms & Conditions:')
})

test('validity text follows the stored validity, not a hardcoded 30', () => {
  const opp = { oppType: 'Spares' }
  const terms = defaultDocTerms({ ...newProposal('X', opp), validityDays: 45 }, opp)
  assert.match(terms[0].text, /valid for 45 days/)
})

test('a stored terms list still wins over the sample default', () => {
  const doc = docModel({ docTerms: [{ label: 'Mine', text: 'Only this.' }] }, { oppType: 'Spares' })
  assert.deepEqual(doc.docTerms, [{ label: 'Mine', text: 'Only this.' }])
})

// The printed T&C list and the clause-by-clause compliance grid are different
// things — the samples keep them apart, and only the grid drives approvals.
// Pushing ten prose clauses into p.terms would invent deviations to approve.
test('the printed terms do not leak into the approval grid', () => {
  assert.equal(recommendTerms({ route: 'Spares' }).length, 4,
    'the compliance-grid seed stays the four commercial terms')

  const opp = { id: 'X', oppType: 'Spares', customerStatus: 'Green', route: 'Spares', milestone: 'Proposal' }
  const p = { ...newProposal('X', opp), terms: [] }
  const before = oppBlockers(opp, p, []).length
  const withDocTerms = oppBlockers(opp, { ...p, docTerms: defaultDocTerms(p, opp) }, []).length
  assert.equal(withDocTerms, before, 'printing terms must not raise or clear an approval')
})
