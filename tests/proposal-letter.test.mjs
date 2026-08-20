import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { docModel } from '../src/proposalDoc.js'
import { newProposal } from '../src/seed.js'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

// The "must not contain" assertions below are about what the component
// renders, so strip comments first — otherwise a comment explaining why a
// formula was dropped reads as the formula still being there.
const stripComments = src => src
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

const print = stripComments(read('src/proposal/PrintDoc.jsx'))

// The covering letter is the one page every proposal has, and it was the one
// page written from imagination rather than from the client's own documents.
// All five sample workbooks in doc/Further Inputs carry an identical Cover
// Letter sheet; these tests pin what it actually contains.

test('the letter prints the fields the samples print', () => {
  for (const label of ['Our Ref:', 'Bid Stage:', 'Bid Type:', 'Revision', 'Kind Attn:', 'Subject:', 'Project:']) {
    assert.match(print, new RegExp(`<b>${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</b>`),
      `the covering letter must print ${label}`)
  }
})

// Bid Stage and Bid Type were stored on every proposal and shown on the editing
// screens, but never reached the customer document.
test('bid stage and bid type reach the printed letter', () => {
  assert.match(print, /<b>Bid Stage:<\/b> \{p\.bidStage\}/)
  assert.match(print, /<b>Bid Type:<\/b> \{p\.bidType\}/)
})

// Subject and Project are two separate labelled rows in the samples; the app
// collapsed them into one line and printed whichever it found first.
test('subject and project are separate rows', () => {
  assert.doesNotMatch(print, /\{p\.project \|\| p\.subject \|\| opp\.oppName\}/,
    'project must not be printed in place of the subject')
  // The services rate-schedule sample has no Project line at all.
  assert.match(print, /\{\(p\.project \|\| ''\)\.trim\(\) && \(/,
    'the Project row must be omitted when there is no project')
})

test('the letter drops what no real letter contains', () => {
  assert.doesNotMatch(print, /<b>Encl:<\/b>/, 'no sample letter has an Encl: list')
  assert.doesNotMatch(print, /<b>CC:<\/b>/, 'no sample letter has a CC: line')
  assert.doesNotMatch(print, /Yours faithfully/)
  assert.doesNotMatch(print, /close-for/, 'no sample letter has a "For <company>" line')
  assert.doesNotMatch(print, /<div className="lbl">To<\/div>/,
    'the addressee block is unlabelled in the samples')
  assert.doesNotMatch(print, /<b>Your Ref:<\/b>/,
    'the RFQ number folds into the subject rather than standing alone')
})

test('the close is Best Regards over the signer block', () => {
  const doc = docModel({}, { oppType: 'Spares' })
  assert.equal(doc.letterClose, 'Best Regards')
  assert.equal(doc.preparedBy.division, 'VMS & CMS Solutions',
    'the samples carry a business-line row under the designation')
})

// The old body promised "our executive summary, the detailed scope of supply,
// … the deviations we have taken, our complete clause-by-clause compliance" —
// pages that no sample proposal contains.
test('the letter body does not narrate sections the document lacks', () => {
  const opp = { oppType: 'Spares', sellTo: 'KSB' }
  const doc = docModel(newProposal('X', opp), opp)
  for (const gone of [/executive summary/i, /clause-by-clause/i, /assumptions and exclusions/i]) {
    assert.doesNotMatch(doc.letterBody, gone)
  }
  assert.match(doc.letterBody, /perusal & approval/, 'wording follows the samples')
  assert.match(doc.letterBody, /mutually rewarding relationship/)
})

test('the letter body names the RFQ when there is one', () => {
  const opp = { oppType: 'Spares', sellTo: 'KSB' }
  const withRfq = docModel({ ...newProposal('X', opp), rfqNumber: 'RFQ-77' }, opp)
  assert.match(withRfq.letterBody, /your RFQ RFQ-77/)
  const without = docModel({ ...newProposal('X', opp), rfqNumber: '' }, opp)
  assert.match(without.letterBody, /reference to your RFQ,/)
})

// A stored edit always beats the auto-draft — the rule the whole doc model runs
// on, and the reason the Document tab's "Auto" reset means anything.
test('a stored letter still wins over the sample default', () => {
  const doc = docModel({ letterBody: 'Mine.', letterClose: 'Regards,' }, { oppType: 'Spares' })
  assert.equal(doc.letterBody, 'Mine.')
  assert.equal(doc.letterClose, 'Regards,')
})
