import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { modaeStandardCommercialTerms } from '../src/commercialTerms.js'

const proposal = fs.readFileSync(new URL('../src/pages/Proposal.jsx', import.meta.url), 'utf8')

test('missing part numbers and terms are informational validation notes', () => {
  assert.match(proposal, /severity: 'info', code: 'line\.part-number-missing'/)
  assert.match(proposal, /severity: 'info', code: 'terms\.missing'/)
  assert.match(proposal, /const informationalReviewFinding = issue =>/)
  assert.match(proposal, /const normalizedReviewIssues = \(p\.reviewIssues \|\| \[\]\)\.map\(informationalReviewFinding\)/)
  assert.match(proposal, /reviewIssuesAreInformational \? 'Validation notes' : 'Validation findings'/)
})

test('only blocking findings prevent proposal validation', () => {
  assert.match(proposal, /const hasActiveBlock = allIssues\.some\(issue => issue\.severity === 'block'\)/)
  assert.match(proposal, /reviewStatus: hasActiveBlock \? 'Needs attention'/)
})

test('ModAE standard commercial terms are complete and non-blocking', () => {
  const terms = modaeStandardCommercialTerms()
  assert.deepEqual(terms.map(term => term.key), ['payment', 'delivery', 'warranty', 'freight', 'validity'])
  assert.ok(terms.every(term => term.status === 'Comply' && term.decision === 'Compliant'))
  assert.match(proposal, /Use ModAE standard terms/)
  assert.match(proposal, /preserveReview = false/)
  assert.match(proposal, /reviewNeedsRevision: !preserveReview/)
})
