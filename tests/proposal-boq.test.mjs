import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { BOQ_COLUMNS, BOQ_LANDSCAPE, boqGroups } from '../src/proposalDoc.js'
import { normalizeProposal } from '../src/proposal/docProps.js'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

const labels = variant => BOQ_COLUMNS[variant].map(c => c.label)
const lineQuoted = l => l.quoted || 100

const proposal = (bom, extra = {}) => normalizeProposal(
  { oppId: 'X', units: 2, bom, ...extra }, { oppType: 'Spares' })

// The sample pricing sheets are built from numbered item groups — `Item-10`,
// `Item-20` — each with its own header, its own `Total For` line and its own
// notes. The app printed one flat table with a single grand total.
test('lines fold into the sample item groups', () => {
  const p = proposal(
    [{ pn: 'A', common: 1, adders: [] }, { pn: 'B', groupId: 'g2', common: 2, adders: [] }],
    { itemGroups: [
      { id: 'g1', no: 'Item-10', title: 'Sensors' },
      { id: 'g2', no: 'Item-20', title: 'Services' },
    ] })
  const groups = boqGroups(p, { lineQuoted, units: 2 })
  assert.equal(groups.length, 2)
  assert.deepEqual(groups.map(g => g.no), ['Item-10', 'Item-20'])
  assert.equal(groups[0].rows.length, 1)
  assert.equal(groups[1].rows.length, 1)
})

// Sl. numbers run across the whole sheet, not restarting per group.
test('the serial number runs across groups', () => {
  const p = proposal(
    [{ pn: 'A', common: 1, adders: [] }, { pn: 'B', groupId: 'g2', common: 1, adders: [] }],
    { itemGroups: [{ id: 'g1', no: 'Item-10', title: 'One' }, { id: 'g2', no: 'Item-20', title: 'Two' }] })
  const groups = boqGroups(p, { lineQuoted, units: 2 })
  assert.equal(groups[0].rows[0].sl, 1)
  assert.equal(groups[1].rows[0].sl, 2)
})

// Total For = Σ(unit price × the Qty/Unit × units + Common + Spares rule).
test('each group totals its own lines', () => {
  const p = proposal([
    { pn: 'A', qtyPerUnit: 2, common: 1, quoted: 50, adders: [] },
    { pn: 'B', common: 3, quoted: 10, adders: [] },
  ])
  const [g] = boqGroups(p, { lineQuoted, units: 2 })
  // A: (2×2)+1 = 5 @ 50 = 250; B: 3 @ 10 = 30
  assert.equal(g.rows[0].qty, 5)
  assert.equal(g.total, 280)
})

// A group can be deleted; its priced lines must not vanish off the document.
test('an orphaned line still prints, under the first group', () => {
  const p = proposal([{ pn: 'A', groupId: 'gone', common: 1, quoted: 7, adders: [] }])
  const groups = boqGroups(p, { lineQuoted, units: 1 })
  assert.equal(groups.length, 1)
  assert.equal(groups[0].rows.length, 1, 'the orphan is adopted rather than dropped')
  assert.equal(groups[0].total, 7)
})

test('a proposal with no groups still gets Item-10', () => {
  const p = proposal([{ pn: 'A', common: 1, adders: [] }])
  const [g] = boqGroups(p, { lineQuoted, units: 1 })
  assert.equal(g.no, 'Item-10')
})

// Column sets come from the sample headers, one per variant.
test('each variant carries its sample column set', () => {
  assert.deepEqual(labels('project'), [
    'Sl.', 'Item Category', 'Item/Scope Description', 'Proposed Model & Part Number',
    'Qty Per Unit', 'Common', 'Spares', 'Total Qty', 'Unit Price ₹', 'Total Price ₹',
  ])
  assert.deepEqual(labels('firm'), [
    'Sl.', 'Item Description', 'Proposed Model/Part No.', 'Qty', 'Unit Price ₹', 'Total Price ₹',
  ])
  assert.deepEqual(labels('rate'), [
    'Sl.', 'Item Description', 'Total Qty', 'Unit Price ₹', 'Total Price ₹',
  ])
})

// The app used to compute Qty/Unit, Common and Spares but print only the total.
test('the project sheet publishes the quantity build-up', () => {
  for (const col of ['Qty Per Unit', 'Common', 'Spares', 'Total Qty']) {
    assert.ok(labels('project').includes(col), `the project BoQ must show ${col}`)
  }
})

// The Meggitt offer is a substitution: its whole argument is "your obsolete
// part → our equivalent", so the existing part number is published. PrintDoc
// used to suppress the customer's own code deliberately.
test('the options sheet prints the existing part it replaces', () => {
  const ls = labels('options')
  assert.ok(ls.includes('Existing Part Number'))
  assert.ok(ls.includes('Existing Item/Part Description'))
  assert.ok(ls.includes('RFQ Item'))
  const print = read('src/proposal/PrintDoc.jsx')
  assert.doesNotMatch(print, /deliberately NOT printed/,
    'the SAP-code suppression is gone')
})

test('an unpriced bid drops exactly the two price columns', () => {
  for (const v of Object.keys(BOQ_COLUMNS)) {
    const priced = BOQ_COLUMNS[v].filter(c => c.priced)
    assert.equal(priced.length, 2, `${v} must have two price columns`)
    assert.deepEqual(priced.map(c => c.label), ['Unit Price ₹', 'Total Price ₹'])
  }
})

// Ten columns of goods will not fit portrait A4.
test('the wide variants print landscape', () => {
  assert.deepEqual(BOQ_LANDSCAPE, ['project', 'options'])
  for (const v of BOQ_LANDSCAPE) assert.ok(BOQ_COLUMNS[v].length >= 9)
})

// The workbooks keep cost and margin in hidden columns beside the price. A PDF
// has no hidden columns, and this document goes to the customer.
test('cost and margin never reach the printed sheet', () => {
  const sheet = read('src/proposal/sheets/BoqSheet.jsx')
  for (const leak of [/Net GM/, /Target Price/, /lineCost/, /Euro-₹/, /ModAE Costs/]) {
    assert.doesNotMatch(sheet, leak, 'the printed BoQ must not carry costing')
  }
  for (const v of Object.keys(BOQ_COLUMNS)) {
    for (const c of BOQ_COLUMNS[v]) {
      assert.ok(!/cost|margin|gm\b/i.test(c.label), `${v} column "${c.label}" leaks costing`)
    }
  }
})
