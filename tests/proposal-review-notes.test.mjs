import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { modaeStandardCommercialTerms } from '../src/commercialTerms.js'

const proposal = fs.readFileSync(new URL('../src/pages/Proposal.jsx', import.meta.url), 'utf8')
const reviewWorkbook = fs.readFileSync(new URL('../src/proposal/reviewWorkbook.js', import.meta.url), 'utf8')
const aiRoute = fs.readFileSync(new URL('../api/ai.js', import.meta.url), 'utf8')

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

test('proposal validation shows staged scan progress and reviews generated proposals with AI', () => {
  assert.match(proposal, /import ScanProgress from '\.\.\/ScanProgress\.jsx'/)
  assert.match(proposal, /const \[reviewStage, setReviewStage\] = useState\(0\)/)
  assert.match(proposal, /<ScanProgress[\s\S]*title=\{reviewProgressTitle\}/)
  assert.match(proposal, /setReviewProgressStages\(automatic \? UPLOAD_REVIEW_STAGES : GENERATED_REVIEW_STAGES\)/)
  assert.match(proposal, /const UPLOAD_REVIEW_STAGES = \['Reading workbook…', 'Importing proposal values…', 'Running local checks…', 'AI semantic review in progress…', 'Applying review results…'\]/)
  assert.match(proposal, /<button className="primary" onClick=\{\(\) => setValidateChoice\(true\)\} disabled=\{reviewBusy\}>/)
  assert.match(proposal, /const yieldToPaint = \(\) => new Promise/)
  assert.match(proposal, /const uploadReviewedProposal = async event =>/)
  assert.match(proposal, /setReviewProgressTitle\('Uploading reviewed proposal'\)/)
  assert.match(proposal, /setReviewProgressStages\(UPLOAD_REVIEW_STAGES\)/)
  assert.match(proposal, /setReviewFileName\(file\.name\)/)
  assert.match(proposal, /fileName=\{reviewFileName\}/)
  assert.match(proposal, /setReviewStage\(3\)/)
  assert.match(proposal, /await validateReviewedProposal\(next, \{ automatic: true, preserveRevision: true, retainProgress: true \}\)/)
  assert.match(proposal, /Upload reviewed workbook/)
  assert.match(proposal, /reviewBusy\s*\?\s*<><span className="auth-loading__spinner/)
  assert.match(proposal, /Scanning…/)
  assert.match(proposal, /const aiResult = await runTaskResult\('proposal\.review'/)
  assert.doesNotMatch(proposal, /if \(reviewedUpload\?\.sheets\?\.length\) \{\s*const aiResult/)
  assert.match(reviewWorkbook, /artifactType: workbook\?\.sheets\?\.length \? 'uploaded-workbook' : 'generated-proposal'/)
  assert.match(aiRoute, /supplied \$\{p\.artifactType === 'uploaded-workbook'/)
  assert.match(aiRoute, /approval summary/i)
  assert.match(proposal, /reviewSummary: aiSummary/)
})

test('stored workbook reviews are recomputed from the pre-import snapshot and shown first', () => {
  assert.match(proposal, /reviewedUpload\.baseProposal/)
  assert.match(proposal, /comparisonAvailable: true/)
  assert.match(proposal, /review\.comparison-unavailable/)
  assert.match(proposal, /Workbook changes detected/)
  assert.match(proposal, /const workbookChangeIssues = displayReviewIssues\.filter\(issue => \['line\.value-changed', 'term\.value-changed'\]\.includes\(issue\.code\)\)/)
  assert.match(proposal, /const otherReviewIssues = displayReviewIssues\.filter\(issue => !\['line\.value-changed', 'term\.value-changed'\]\.includes\(issue\.code\)\)/)
})

test('uploaded human term changes are displayed as red non-blocking workbook changes', () => {
  assert.match(reviewWorkbook, /code: 'term\.value-changed'/)
  assert.match(reviewWorkbook, /severity: 'info'/)
  assert.match(proposal, /\['line\.value-changed', 'term\.value-changed'\]\.includes\(issue\.code\)/)
  assert.match(proposal, /issue\.humanReview \? 'human-review' : ''/)
  assert.match(proposal, /Human-uploaded proposal — manual review/)
  assert.match(proposal, /this notice does not block the workflow/)
})

test('validation findings are grouped with a readable summary', () => {
  assert.match(proposal, /proposal-review-issues-header/)
  assert.match(proposal, /proposal-review-counts/)
  assert.match(proposal, /<details className=\{`proposal-review-issue/)
  assert.match(proposal, /proposal-review-issue-summary-text/)
  assert.match(proposal, /proposal-review-issue-body/)
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
  assert.match(proposal, /const change = \['line\.value-changed', 'term\.value-changed'\]\.includes\(issue\.code\) \? issue\.change : null/)
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
