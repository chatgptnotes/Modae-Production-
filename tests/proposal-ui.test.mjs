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

  assert.match(proposal, /<div className="proposal-header-meta" aria-label="Proposal setup">/)
  assert.match(proposal, /<span className="proposal-status-label">Review status<\/span>/)
  assert.match(proposal, /<span className="proposal-alert-toggle">Readiness &amp; approval<\/span>/)
  assert.match(proposal, /<summary>Route context<\/summary>/)
  assert.doesNotMatch(proposal, /<div className="proposal-control-groups">/)
  assert.doesNotMatch(proposal, /<summary>Proposal notes/)
})

test('validated uploaded workbooks remain the active proposal source', () => {
  const proposal = read('src/pages/Proposal.jsx')

  assert.match(proposal, /const validatedUploadActive = hasValidatedUploadedWorkbook\(p\)/)
  assert.match(read('src/proposal/validatedWorkbook.js'), /VALIDATED_REVIEW_STATUSES = new Set\(\['Validated', 'Override accepted'\]\)/)
  assert.match(proposal, /Validated uploaded proposal/)
  assert.match(proposal, /Uploaded workbook validated and set as the active proposal/)
  assert.match(proposal, /const next = \{[\s\S]*reviewedUpload,[\s\S]*reviewStatus: hasActiveBlock/)
  assert.match(proposal, /Use AI draft instead/)
  assert.match(proposal, /Upload reviewed workbook/)
  assert.match(proposal, /await validateReviewedProposal\(next, \{ automatic: true, preserveRevision: true, retainProgress: true \}\)/)
  assert.match(proposal, /validatedWorkbookPreview\(previewModel\.p\)/)
  assert.match(read('src/store.jsx'), /reviewedUpload,\n    reviewStatus: p\.reviewStatus/)
})

test('proposal readiness drawer exposes a useful collapsed summary', () => {
  const proposal = read('src/pages/Proposal.jsx')

  assert.match(proposal, /const readinessSummaryFor = \(\{ blockers = \[\], pendingForOpp = \[\], submitted = false \}/)
  assert.match(proposal, /item\$\{blockers\.length === 1 \? '' : 's'\} need attention: \$\{visible\.join\('; '\)\}/)
  assert.match(proposal, /const readinessSummary = readinessSummaryFor\(\{ blockers, pendingForOpp, submitted \}\)/)
  assert.match(proposal, /'Ready — no blockers'/)
  assert.match(proposal, /'Submitted to customer'/)
  assert.match(proposal, /<span className="proposal-alert-summary" title=\{readinessSummary\}>\{readinessSummary\}<\/span>/)
})

test('proposal drawers use compact expanded surfaces', () => {
  const styles = read('src/styles.css')

  assert.match(styles, /\.proposal-alert-drawer \.gate-strip \{[\s\S]*max-width: none;/)
  assert.match(styles, /\.proposal-alert-drawer \.gate-row \{[\s\S]*font-size: 11px;/)
  assert.match(styles, /\.proposal-context-drawer \.ai-notice,[\s\S]*padding: 5px 8px;/)
})

test('embedded proposal review chrome does not cover the review banner', () => {
  const styles = read('src/styles.css')
  assert.match(styles, /\.proposal-embedded \.proposal-workspace-header \{[\s\S]*position: static;[\s\S]*top: auto;/)
})

test('proposal approval requests carry concise review findings', () => {
  const proposal = read('src/pages/Proposal.jsx')
  const approvals = read('src/pages/Approvals.jsx')
  assert.match(proposal, /const approvalDetail = bl =>/)
  assert.match(proposal, /detail: approvalDetail\(bl\)/)
  assert.match(proposal, /const ensureApprovalSummary = async \(proposalOverride = null\) =>/)
  assert.match(proposal, /Approval summary generation failed; continuing with fallback/)
  assert.match(proposal, /return fallback/)
  assert.match(proposal, /opportunitySummary: summary\.text/)
  assert.match(proposal, /summarySource: summary\.source/)
  assert.match(approvals, /Review findings:/)
})

test('proposal BOQ is a read-only table without row editing controls', () => {
  const proposal = read('src/proposal/ProposalSheetEditor.jsx')
  const styles = read('src/styles.css')
  const boq = proposal.slice(proposal.indexOf("{show('BOQ')"), proposal.indexOf("{show('Document')"))

  assert.match(boq, /proposal-edit-grid \$\{isSpares \? 'proposal-edit-grid-spares'/)
  assert.match(boq, /<table aria-readonly="true" className=/)
  assert.doesNotMatch(boq, /boq-action-head|boq-action-cell|\+ Add line|proposal-row-minus/)
  assert.match(boq, /Read-only reference\. Quantities, descriptions, and prices are maintained in the sourcing workflow\./)
  assert.match(styles, /\.proposal-edit-grid th \{[\s\S]*white-space: normal;[\s\S]*overflow-wrap: anywhere;/)
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
  assert.match(store, /orderedSparesProposalBom\(orderedSourceLines, s\.priceLists, costing\)/)
  assert.match(exporter, /const lines = p\.bom \|\| \[\]/)
})

test('customer preview is clearly separated from the legacy workbook draft', () => {
  const proposal = read('src/pages/Proposal.jsx')
  assert.match(proposal, /Draft workbook \(reference\)/)
  assert.match(proposal, /customer documents use the current ModAE preview/)
  assert.doesNotMatch(proposal, />Customer Preview · read-only</)
})

test('PDF preview renders the customer document separately from the Excel workbook', () => {
  const proposal = read('src/pages/Proposal.jsx')
  assert.match(proposal, /onPreviewProposal=\{\(\) => setPdfPreviewTarget\(/)
  assert.match(proposal, /<Modal title=\{`PDF preview — \$\{oppId\}`\}/)
  assert.match(proposal, /<PrintDoc p=\{pdfPreviewModel\.p\} opp=\{opp\}/)
  assert.match(proposal, /Print \/ Save PDF/)
  assert.match(proposal, /<WorkbookPreview workbook=\{previewWorkbook\}/)
})

test('revision badge opens current and snapshot-backed historical previews', () => {
  const proposal = read('src/pages/Proposal.jsx')
  assert.match(proposal, /function RevisionMenu\({ currentRevision, options, onSelect }\)/)
  assert.match(proposal, /const revisionOptions = \[/)
  assert.match(proposal, /snapshot \|\| null/)
  assert.match(proposal, /Snapshot unavailable/)
  assert.match(proposal, /onSelect=\{option => setPreviewTarget\(option\)\}/)
})

test('historical proposal previews stay read-only but can print the selected revision', () => {
  const proposal = read('src/pages/Proposal.jsx')
  assert.match(proposal, /Historical customer-facing Excel workbook/)
  assert.match(proposal, /<WorkbookPreview workbook=\{previewWorkbook\}/)
  assert.match(proposal, /read-only historical snapshot/)
  assert.match(proposal, /setPrintingModel\(previewModel\)/)
})

test('submitted proposal communications capture the approved proposal snapshot', () => {
  const submission = read('src/workbench/SubmissionPanel.jsx')
  const store = read('src/store.jsx')
  assert.match(submission, /proposalSnapshot: snapshotProposal\(p\)/)
  assert.match(store, /revision: p\.revision, bom: p\.bom/)
})

test('generated support rows continue the live BOQ numbering', () => {
  const exporter = read('src/proposal/templateExcelExport.js')
  assert.match(exporter, /setValue\(worksheet\.getCell\(`B\$\{row\}`\), index \+ 1/)
  assert.match(exporter, /const round2 = value/)
})

test('customer-facing proposal prices use exactly two decimal places', () => {
  const editor = read('src/proposal/ProposalSheetEditor.jsx')
  const proposal = read('src/pages/Proposal.jsx')
  const workbook = read('src/proposal/workbook.js')
  const utils = read('src/utils.js')

  assert.match(editor, /fmt\(lineQuoted\(l\), 2\)/)
  assert.match(editor, /fmt\(lineQuoted\(l\) \* quantity, 2\)/)
  assert.match(proposal, /fmt\(lineQuoted\(l\) \* q, 2\)/)
  assert.match(utils, /minimumFractionDigits: digits/)
  assert.match(utils, /maximumFractionDigits: digits/)
  assert.match(workbook, /minimumFractionDigits: 2/)
  assert.match(workbook, /maximumFractionDigits: 2/)
})

test('saved Spares proposal repair compares the full product and support BoQ', () => {
  const proposal = read('src/pages/Proposal.jsx')

  assert.match(proposal, /const sourceLines = \(store\.sparesLines \|\| \[\]\)\.filter\(line => line\.oppId === oppId/)
  assert.match(proposal, /const nextBom = orderedSparesProposalBom\(sourceLines, store\.priceLists, current\.costing\)/)
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
