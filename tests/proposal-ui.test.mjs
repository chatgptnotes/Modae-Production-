import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { sparesProposalBom } from '../src/proposal/sparesBoq.js'
import { seedPriceLists } from '../src/seed.js'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

test('proposal review and context panels use distinct, descriptive labels', () => {
  const proposal = read('src/pages/Proposal.jsx')

  assert.match(proposal, /<span className="proposal-status-label">Review status<\/span>/)
  assert.match(proposal, /<span className="proposal-alert-toggle">Readiness &amp; approval<\/span>/)
  assert.match(proposal, /<summary>Route context<\/summary>/)
  assert.doesNotMatch(proposal, /<summary>Proposal notes/)
})

test('proposal readiness drawer exposes a useful collapsed summary', () => {
  const proposal = read('src/pages/Proposal.jsx')

  assert.match(proposal, /const readinessSummary = blocked/)
  assert.match(proposal, /'Ready — no blockers'/)
  assert.match(proposal, /'Submitted to customer'/)
  assert.match(proposal, /<span className="proposal-alert-summary">\{readinessSummary\}<\/span>/)
})

test('proposal drawers use compact expanded surfaces', () => {
  const styles = read('src/styles.css')

  assert.match(styles, /\.proposal-alert-drawer \.gate-strip \{[\s\S]*max-width: none;/)
  assert.match(styles, /\.proposal-alert-drawer \.gate-row \{[\s\S]*font-size: 11px;/)
  assert.match(styles, /\.proposal-context-drawer \.ai-notice,[\s\S]*padding: 5px 8px;/)
})

test('Spares proposals carry the standard support rows without export duplication', () => {
  const store = read('src/store.jsx')
  const props = read('src/proposal/docProps.js')
  const exporter = read('src/proposal/templateExcelExport.js')
  const support = read('src/proposal/sparesBoq.js')

  assert.match(support, /Warranty Certificate/)
  assert.match(support, /Country of Origin Certificate/)
  assert.match(support, /Freight Charges from B&K Germany To ModAE India/)
  assert.match(props, /route === 'Spares' \? withSparesSupportRows\(bom\)/)
  assert.match(store, /const supportBom = withSparesSupportRows\(\(base\.bom \|\| \[\]\)\.filter\(isSparesSupportRow\)\)/)
  assert.match(exporter, /p\.bom \|\| \[\]\)\.filter\(line => !isSparesSupportRow\(line\)/)
})

test('saved Spares proposal repair compares the full product and support BoQ', () => {
  const proposal = read('src/pages/Proposal.jsx')

  assert.match(proposal, /const productBom = sparesProposalBom\(confirmed, store\.priceLists\)/)
  assert.match(proposal, /const nextBom = withSparesSupportRows\(\[\.\.\.productBom, \.\.\.\(current\.bom \|\| \[\]\)\.filter\(isSparesSupportRow\)\]\)/)
})

test('Spares proposal conversion replaces stale descriptions from the B&K catalogue', () => {
  const bom = sparesProposalBom([
    {
      confirmed: true,
      pn: 'DS821.DS1001/10/075/012/005/000/0',
      custRef: 'DS821.DS1001/10/075/012/005/000/0',
      desc: 'Part code:- YES',
      qty: 10,
      listPrice: 599.04,
      listUnitPrice: 599.04,
      priceList: 'BNK 2026-Q2',
    },
    {
      confirmed: true,
      pn: 'CUSTOM-1',
      custRef: 'CUSTOM-1',
      desc: 'Custom spare item',
      qty: 1,
      listPrice: 0,
      priceList: 'Ad-hoc',
    },
  ], seedPriceLists)

  assert.equal(bom[0].desc, 'Non-contact Displacement Sensor with full length thread, Measuring Range 2mm, With 0.5m Integral Cable')
  assert.equal(bom[0].common, 10)
  assert.equal(bom[0].listPrice, 599.04)
  assert.equal(bom[1].desc, 'Custom spare item')
})
