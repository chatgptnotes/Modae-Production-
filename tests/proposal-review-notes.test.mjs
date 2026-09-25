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

test('stored workbook reviews are recomputed from the pre-import snapshot and shown first', () => {
  assert.match(proposal, /reviewedUpload\.baseProposal/)
  assert.match(proposal, /comparisonAvailable: true/)
  assert.match(proposal, /review\.comparison-unavailable/)
  assert.match(proposal, /Workbook changes detected/)
  assert.match(proposal, /const workbookChangeIssues = displayReviewIssues\.filter\(issue => issue\.code === 'line\.value-changed'\)/)
  assert.match(proposal, /const otherReviewIssues = displayReviewIssues\.filter\(issue => issue\.code !== 'line\.value-changed'\)/)
})

test('validation findings are grouped with a readable summary', () => {
  assert.match(proposal, /proposal-review-issues-header/)
  assert.match(proposal, /proposal-review-counts/)
  assert.match(proposal, /const blockingReviewIssues = otherReviewIssues\.filter\(issue => issue\.severity === 'block'\)/)
  assert.match(proposal, /const warningReviewIssues = otherReviewIssues\.filter\(issue => issue\.severity === 'warning'\)/)
  assert.match(proposal, /const informationalReviewIssues = otherReviewIssues\.filter\(issue => issue\.severity === 'info'\)/)
  assert.match(proposal, /Blocking findings/)
  assert.match(proposal, /Needs review/)
  assert.match(proposal, /Informational/)
})

test('AI findings and extracted value changes use structured display formatting', () => {
  assert.match(proposal, /if \(code === 'ai\.unavailable'\) return 'AI review unavailable'/)
  assert.match(proposal, /const aiLabel = code\.replace\(\/\^ai\[-_\.\]\?\/i/)
  assert.match(proposal, /const reviewNumber = new Intl\.NumberFormat\('en-IN'/)
  assert.match(proposal, /const change = issue\.code === 'line\.value-changed' \? issue\.change : null/)
  assert.match(proposal, /Previous/)
  assert.match(proposal, /Uploaded value/)
  assert.match(proposal, /proposal-review-ai-text/)
})

test('ModAE standard commercial terms are complete and non-blocking', () => {
  const terms = modaeStandardCommercialTerms()
  assert.deepEqual(terms.map(term => term.key), ['payment', 'delivery', 'warranty', 'freight', 'validity'])
  assert.ok(terms.every(term => term.status === 'Comply' && term.decision === 'Compliant'))
  assert.match(proposal, /Use ModAE standard terms/)
  assert.match(proposal, /preserveReview = false/)
  assert.match(proposal, /reviewNeedsRevision: !preserveReview/)
})
