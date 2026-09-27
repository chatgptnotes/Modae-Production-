import React, { useEffect, useRef, useState } from 'react'
import XLSX from 'xlsx-js-style'
import { useParams, Link } from 'react-router-dom'
import { useStore, sparesProposalBom, snapshotProposal } from '../store.jsx'
import { isPlaceholderSparesLine } from '../store.jsx'
import { effectiveRate, fmt, exportCSV, canPriceProposal, isAdminRole, clampCosting, clampQty, MAX_GM_PCT, displayRole, formatISTDateTime } from '../utils.js'
import { useFormulaBar } from '../formulabar.jsx'
import { Icon, ModaeImageLogo } from '../icons.jsx'
import { ConfirmModal, Modal } from '../ui.jsx'
import AttachmentViewer from '../AttachmentViewer.jsx'
import { readiness, isBlocked } from '../gates.js'
import { docModel, docRoute, enclosuresFor, MODAE_COMPANY } from '../proposalDoc.js'
import DocEditor from '../proposal/DocEditor.jsx'
import PrintDoc from '../proposal/PrintDoc.jsx'
import { signalsFromBom, countSignals, rackLayout, UMM_CHANNELS, RACK_SLOTS } from '../rack.js'
import { normalizeProposal, buildPricing } from '../proposal/docProps.js'
import ProposalSheetEditor from '../proposal/ProposalSheetEditor.jsx'
import { downloadProposalXlsx } from '../proposal/excelExport.js'
import WorkbookPreview from '../proposal/WorkbookPreview.jsx'
import { generateProposalWorkbook } from '../proposal/templateExcelExport.js'
import { parseProposalWorkbook as parseRenderedWorkbook } from '../proposal/workbook.js'
import { isWorkflowAvailable, routeForType } from '../seed.js'
import { buildLeadProposalData } from '../leadBoq.js'
import { getFile, putFiles } from '../leadBlobs.js'
import { fmtSize, uploadOppFile } from '../filestore.js'
import DetailTabs from '../DetailTabs.jsx'
import { isLegacyAutoSparesSupportRow, isSparesSupportRow, orderedSparesProposalBom, withSparesSupportRows } from '../proposal/sparesBoq.js'
import { runTaskResult } from '../ai.js'
import { filterLogicalChangeIssues, importReviewedWorkbook, normalizeAiReview, reviewWorkbookPayload } from '../proposal/reviewWorkbook.js'
import { clausesFor, clauseWarnings } from '../clauses.js'
import { fromInr, toInr, currencySymbol } from '../currency.js'
import { reviewFindingKey } from '../approvalMemory.js'
import OpportunityComingSoon from '../workbench/OpportunityComingSoon.jsx'
import { COMMERCIAL_DECISIONS, CUSTOMER_CONFIRMATION_STATUSES, commercialApprovalDetails, modaeStandardCommercialTerms, needsCommercialResolution, normalizeCommercialTerm } from '../commercialTerms.js'
import { proposalApprovalSnapshot } from '../approvalMemory.js'
import { loadProposalTemplateBuffer, resolveProposalTemplate } from '../proposal/templateRegistry.js'
import { customerProposalArtifact } from '../proposal/emailAttachments.js'
import { latestSubmissionForRevision, submissionStatusLabel } from '../submissionStatus.js'
import { hasValidatedUploadedWorkbook, validatedWorkbookPreview } from '../proposal/validatedWorkbook.js'
import ScanProgress from '../ScanProgress.jsx'

const GENERATED_REVIEW_STAGES = ['Preparing proposal…', 'Running local checks…', 'AI semantic review in progress…', 'Applying review results…']
const UPLOAD_REVIEW_STAGES = ['Reading workbook…', 'Importing proposal values…', 'Running local checks…', 'AI semantic review in progress…', 'Applying review results…']
const yieldToPaint = () => new Promise(resolve => {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(resolve)
  else setTimeout(resolve, 0)
})

// Approved customer proposals use the server-side SMTP route so the browser
// never handles mailbox credentials and every generated attachment is sent in
// one governed message.
// The submission surface renders the same sender field: <div className="q-label">From</div>.
export async function sendProposalEmailRequest(payload = {}) {
  const attachments = [...(payload.attachments || [])]
  const response = await fetch('/api/send-proposal-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, attachments: [ ...attachments ] }),
  })
  let result = {}
  try { result = await response.json() } catch { /* preserve the HTTP failure */ }
  if (!response.ok || result.ok === false) throw new Error(result.error || 'Proposal email could not be sent')
  return result
}

const ROUTE_TABS = {
  Project: ['Cover Letter', 'Edit Sheet', 'Document', 'Signal List', 'Rack Layout', 'Priced BoQ'],
  Services: ['Cover Letter', 'Edit Sheet', 'Document', 'Scope of Work', 'Issues List', 'Proposal', 'Service Rate Schedule'],
  Spares: ['Cover Letter', 'Edit Sheet', 'Document', 'Firm Offer', 'Clarifications', 'Sensor Comparison', 'Priced BoQ'],
}

const MEGGITT_ITEM_LIST_URL = new URL('../../branding/Further Inputs/Further Inputs/Proposals and T&Cs/Spares Opp-2 With Different Make (Not yet won)/Meggitt Item List.xlsx', import.meta.url).href

const approvalTermKey = value => {
  const text = String(value || '').toLowerCase()
  if (/payment|credit|advance/.test(text)) return 'payment'
  if (/delivery|lead\s*time|schedule/.test(text)) return 'delivery'
  if (/warranty|guarantee|defect/.test(text)) return 'warranty'
  return ''
}
const approvalTermMatches = (term, value) => {
  const text = String(value || '').toLowerCase()
  if (term === 'payment') return /payment|credit|advance/.test(text)
  if (term === 'delivery') return /delivery|lead\s*time|schedule/.test(text)
  if (term === 'warranty') return /warranty|guarantee|defect/.test(text)
  return false
}

const approvalDate = ts => {
  const date = new Date(ts || '')
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

const readinessSummaryFor = ({ blockers = [], pendingForOpp = [], submitted = false } = {}) => {
  if (blockers.length) {
    const visible = blockers.slice(0, 3).map(item => item.text).filter(Boolean)
    const extra = blockers.length > visible.length ? `; +${blockers.length - visible.length} more` : ''
    const approvals = pendingForOpp.length
      ? `; ${pendingForOpp.length} approval${pendingForOpp.length === 1 ? '' : 's'} pending`
      : ''
    return `${blockers.length} item${blockers.length === 1 ? '' : 's'} need attention: ${visible.join('; ')}${extra}${approvals}`
  }
  if (pendingForOpp.length) {
    const types = pendingForOpp.map(item => item.type).filter(Boolean).slice(0, 3).join('; ')
    return `${pendingForOpp.length} approval${pendingForOpp.length === 1 ? '' : 's'} pending${types ? `: ${types}` : ''}`
  }
  return submitted ? 'Submitted to customer' : 'Ready — no blockers'
}

const approvedDeviationFor = (issue, approvals, oppId, revision) => {
  const findingKey = approvalTermKey(`${issue?.code || ''} ${issue?.text || ''}`)
  if (!findingKey) return null
  return (approvals || []).find(approval => {
    if (approval.oppId !== oppId || approval.type !== 'Commercial deviation') return false
    if (!['Approved', 'Approved with conditions'].includes(approval.status)) return false
    if (approval.rev != null && String(approval.rev) !== String(revision ?? '')) return false
    const approvedSources = [
      ...(approval.deviationDetails || []).map(deviation => deviation.term),
      approval.detail,
      approval.blockingReason,
    ]
    return approvedSources.some(source => approvalTermMatches(findingKey, source))
  }) || null
}

const rememberApprovedFindings = (issues, approvals, oppId, revision) => issues.map(issue => {
  const approval = approvedDeviationFor(issue, approvals, oppId, revision)
  if (!approval) return issue
  return {
    ...issue,
    severity: 'info',
    approval: {
      status: approval.status,
      approver: displayRole(approval.approver),
      date: approvalDate(approval.decisionTs),
    },
  }
})

const rememberOverriddenFindings = (issues, override) => issues.map(issue => {
  if (!override?.accepted) return issue
  const key = reviewFindingKey(issue)
  const remembered = (override.findings || []).find(saved => saved.findingKey === key || reviewFindingKey(saved) === key)
  if (!remembered) return issue
  return {
    ...issue,
    originalSeverity: issue.severity,
    severity: 'info',
    overridden: true,
    findingKey: key,
  }
})

// These two checks make the quotation easier to review, but they do not make
// its pricing or quantity invalid. Older saved validations used `warning` for
// them, which made a Validated proposal display contradictory “Needs review”
// badges. Normalize legacy records as well as new validations.
const informationalReviewFinding = issue => {
  const text = String(issue?.text || '')
  const code = String(issue?.code || '')
  if (code === 'line.part-number-missing' || /one or more (?:line items|BOQ lines) are missing a model or part number/i.test(text)) {
    return { ...issue, code: 'line.part-number-missing', severity: 'info' }
  }
  if (code === 'terms.missing' || /commercial terms have not been added yet/i.test(text)) {
    return { ...issue, code: 'terms.missing', severity: 'info' }
  }
  return issue
}

const reviewFindingTitle = issue => {
  const code = String(issue?.code || '')
  if (code === 'line.unmatched') return 'Workbook line needs review'
  if (code === 'line.value-changed') return 'Workbook value changed'
  if (code === 'term.value-changed') return 'Commercial term changed'
  if (code === 'line.part') return 'Part number is missing'
  if (code === 'line.quantity') return 'Quantity is invalid'
  if (code === 'line.price') return 'Quoted price is invalid'
  if (code === 'line.total') return 'Line total does not reconcile'
  if (/contradict/i.test(issue?.text)) return 'Commercial term mismatch'
  if (/upload received/i.test(issue?.text)) return 'Reviewed workbook received'
  if (issue?.source === 'AI') {
    if (code === 'ai.unavailable') return 'AI review unavailable'
    const aiLabel = code.replace(/^ai[-_.]?/i, '').replace(/[-_.]+/g, ' ').trim()
    return aiLabel ? `${aiLabel.charAt(0).toUpperCase()}${aiLabel.slice(1)} review` : 'AI review finding'
  }
  return 'Review finding'
}

const reviewSeverityLabel = severity => ({ block: 'Blocking', warning: 'Needs review', info: 'Information' }[severity] || 'Needs review')
const reviewNumber = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })
const reviewCurrencyNumber = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const reviewValue = (field, value) => {
  if (value == null || String(value).trim() === '') return 'Blank'
  if (['unitPrice', 'totalPrice'].includes(field) && Number.isFinite(Number(value))) return reviewCurrencyNumber.format(Number(value))
  if (field === 'quantity' && Number.isFinite(Number(value))) return reviewNumber.format(Number(value))
  return String(value)
}
const reviewIssueSummary = (issue, change) => change
  ? `${change.line || 'Proposal line'} · ${change.label || 'Changed value'} · ${reviewValue(change.field, change.before)} → ${reviewValue(change.field, change.after)}`
  : issue.text

function ReviewIssue({ issue, overridden = false, onUseStandardTerms }) {
  const change = ['line.value-changed', 'term.value-changed'].includes(issue.code) ? issue.change : null
  return <details className={`proposal-review-issue ${overridden ? 'info' : issue.severity} ${issue.humanReview ? 'human-review' : ''}`}>
    <summary className="proposal-review-issue-summary">
      <div className="proposal-review-issue-head"><span className="proposal-review-severity">{overridden ? 'Overridden' : reviewSeverityLabel(issue.severity)}</span><strong>{reviewFindingTitle(issue)}</strong>{issue.source === 'AI' && <span className="proposal-review-source">AI review</span>}</div>
      <span className="proposal-review-issue-summary-text">{reviewIssueSummary(issue, change)}</span>
    </summary>
    <div className="proposal-review-issue-body">
      {change
        ? <div className="proposal-review-value-change">
            <div className="proposal-review-value-change-item"><span>{issue.code === 'term.value-changed' ? 'Term' : 'Item'}</span><strong>{change.line || 'Proposal line'}</strong></div>
            <div className="proposal-review-value-change-field"><span>{change.label || 'Changed value'}</span></div>
            <div className="proposal-review-value-change-values">
              <div><span>Previous</span><code>{reviewValue(change.field, change.before)}</code></div>
              <div><span>Uploaded value</span><code>{reviewValue(change.field, change.after)}</code></div>
            </div>
          </div>
        : <p className={`proposal-review-issue-text ${issue.source === 'AI' ? 'proposal-review-ai-text' : ''}`}>{issue.text}</p>}
      {issue.evidence && <div className="proposal-review-evidence"><span>Evidence</span><code>{issue.evidence}</code></div>}
      {issue.approval && <span className="proposal-review-approval">Already approved{issue.approval.approver ? ` by ${issue.approval.approver}` : ''}{issue.approval.date ? ` on ${issue.approval.date}` : ''}</span>}
      {!overridden && issue.code === 'terms.missing' && onUseStandardTerms && <button type="button" className="btn-secondary proposal-review-action" onClick={onUseStandardTerms}>Use ModAE standard terms</button>}
    </div>
  </details>
}

function ProposalDatasheets({ opp, p, save, store }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const files = p.proposalDatasheets || []
  const library = store.config?.uploads?.datasheets || []
  const addFromLibrary = event => {
    const name = event.target.value
    event.target.value = ''
    if (!name || files.some(file => (typeof file === 'string' ? file : file.name) === name)) return
    const source = library.find(file => file.name === name)
    save({ ...p, proposalDatasheets: [...files, { ...source, source: 'Admin library' }] })
  }
  const upload = async event => {
    const selected = [...(event.target.files || [])]
    event.target.value = ''
    if (!selected.length) return
    setBusy(true); setError('')
    try {
      await putFiles(`proposal-${opp.id}`, selected)
      const records = []
      for (const file of selected) {
        const uploaded = await uploadOppFile(opp, 'Proposal Datasheets', file)
        records.push({ name: file.name, type: file.type, size: file.size, date: new Date().toISOString().slice(0, 10), ...uploaded })
      }
      const merged = [...files.filter(old => !records.some(next => next.name === (typeof old === 'string' ? old : old.name))), ...records]
      save({ ...p, proposalDatasheets: merged })
    } catch (e) { setError(e?.message || 'Datasheet upload failed') }
    finally { setBusy(false) }
  }
  return (
    <section className="form-card proposal-datasheets">
      <div className="section-title">Datasheets</div>
      <p className="hint">Add manufacturer datasheets that should travel with this customer proposal.</p>
      <label className="btn-secondary proposal-upload-button">
        <Icon name="upload" size={13} /> {busy ? 'Uploading…' : 'Add datasheet'}
        <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" multiple disabled={busy} onChange={upload} />
      </label>
      {library.length > 0 && <label style={{ display: 'inline-flex', marginLeft: 8 }}>Add from Admin library
        <select defaultValue="" onChange={addFromLibrary} style={{ marginLeft: 6 }}>
          <option value="">Choose datasheet</option>
          {library.map(file => <option key={file.name} value={file.name}>{file.name}</option>)}
        </select>
      </label>}
      {error && <div className="errbox" style={{ marginTop: 8 }}>{error}</div>}
      {files.length ? <div className="attachment-list">{files.map(file => <div key={typeof file === 'string' ? file : file.name} className="attach-row"><Icon name="fileText" size={13} /> {typeof file === 'string' ? file : file.name}</div>)}</div> : <p className="hint">No proposal-specific datasheets added.</p>}
    </section>
  )
}

const parseQuantityCell = value => {
  const match = String(value ?? '').match(/\d+(?:\.\d+)?/)
  return Number(match?.[0] || 0)
}

const parseReferenceWorkbook = (buffer, filename) => {
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' })
  return {
    filename, sheetName,
    rows: rows.slice(1).filter(row => row.some(Boolean)).map((row, i) => ({
      srNo: Number(row[0]) || i + 1,
      description: String(row[1] || ''),
      quantity: parseQuantityCell(row[2]),
      quantityText: String(row[2] || ''),
      uom: /nos?/i.test(String(row[2])) ? 'EA' : 'EA',
      unitPrice: Number(row[3]) || 0,
      totalPrice: Number(row[4]) || 0,
    })),
  }
}

const parseProposalWorkbook = (buffer, filename) => {
  const workbook = XLSX.read(buffer, { type: 'array', cellStyles: true })
  return {
    filename,
    sheets: workbook.SheetNames.map(name => {
      const sheet = workbook.Sheets[name]
      const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1')
      const rows = []
      for (let r = range.s.r; r <= range.e.r; r++) {
        const row = []
        for (let c = range.s.c; c <= range.e.c; c++) {
          const cell = sheet[XLSX.utils.encode_cell({ r, c })]
          row.push(cell?.w ?? (cell?.v == null ? '' : String(cell.v)))
        }
        rows.push(row)
      }
      const rawWidths = sheet['!cols'] || []
      const merges = (sheet['!merges'] || []).map(merge => ({
        s: { r: merge.s.r - range.s.r, c: merge.s.c - range.s.c },
        e: { r: merge.e.r - range.s.r, c: merge.e.c - range.s.c },
      }))
       const rawRows = sheet['!rows'] || []
       // Some proposal templates include one completely empty layout row at
       // the top. Hide that unused row while keeping all intentional spacing
       // below it. Merge coordinates and heights must follow the same shift.
       const dropFirstRow = rows.length > 1 && rows[0].every(value => String(value ?? '').trim() === '')
       const visibleRows = dropFirstRow ? rows.slice(1) : rows
       const visibleMerges = dropFirstRow
         ? merges.filter(merge => merge.e.r > 0).map(merge => ({
           s: { ...merge.s, r: Math.max(0, merge.s.r - 1) },
           e: { ...merge.e, r: merge.e.r - 1 },
         }))
         : merges
       return {
         name,
         rows: visibleRows,
         merges: visibleMerges,
         heights: Array.from({ length: range.e.r - range.s.r + 1 }, (_, i) => rawRows[range.s.r + i]?.hpx || rawRows[range.s.r + i]?.hpt || 24).slice(dropFirstRow ? 1 : 0),
        // Some Excel writers emit all 16,384 column definitions. Only retain
        // the columns the sheet actually uses so the preview stays usable.
        widths: Array.from({ length: range.e.c - range.s.c + 1 }, (_, i) => rawWidths[range.s.c + i]?.wpx || 110),
      }
    }),
  }
}

const templateCellsForRow = (sheet, rowIndex) => {
  const columnCount = sheet.widths.length || Math.max(1, ...sheet.rows.map(row => row.length))
  const cells = []
  for (let columnIndex = 0; columnIndex < columnCount; columnIndex++) {
    const merge = (sheet.merges || []).find(item => item.s.r <= rowIndex && item.e.r >= rowIndex && item.s.c <= columnIndex && item.e.c >= columnIndex)
    if (merge && (merge.s.r !== rowIndex || merge.s.c !== columnIndex)) continue
    let colSpan = merge ? merge.e.c - merge.s.c + 1 : 1
    const value = sheet.rows[rowIndex]?.[columnIndex] ?? ''
    // Excel lets text flow into trailing empty cells even when no formal
    // merge exists. Reproduce that behavior for long labels and paragraphs,
    // but never span across another populated or merged field.
    if (!merge && String(value).length > 35) {
      let end = columnIndex
      while (end + 1 < columnCount
        && !(sheet.rows[rowIndex]?.[end + 1])
        && !(sheet.merges || []).some(item => item.s.r <= rowIndex && item.e.r >= rowIndex && item.s.c <= end + 1 && item.e.c >= end + 1)) end++
      colSpan = end - columnIndex + 1
    }
    const rowSpan = merge ? merge.e.r - merge.s.r + 1 : 1
    const width = (sheet.widths || []).slice(columnIndex, columnIndex + colSpan).reduce((sum, item) => sum + item, 0)
    const portrait = /cover letter|scope of work|^sow$|issues/i.test(String(sheet.name || ''))
    const wideSheet = /firm|pricing|proposal/i.test(String(sheet.name || ''))
    const previewWidth = portrait ? 820 : wideSheet ? 1400 : 1180
    const totalWidth = (sheet.widths || []).reduce((sum, item) => sum + Math.max(1, Number(item) || 1), 0) || 1
    const renderedWidth = Math.max(24, (width / totalWidth) * previewWidth)
    // Use the width the user actually sees, rather than the source Excel
    // width. This keeps long descriptions and terms from being clipped.
    const rows = Math.max(1, Math.ceil(String(value).length / Math.max(12, Math.floor(renderedWidth / 7))))
    cells.push({
      columnIndex,
      colSpan,
      rowSpan,
      value,
      rows,
    })
    columnIndex += colSpan - 1
  }
  return cells
}

const templatePageClass = (sheet, route) => {
  const name = String(sheet.name || '').toLowerCase()
  const portrait = name.includes('cover letter') || name.includes('scope of work') || name === 'sow' || name.includes('issues')
  const wide = !portrait && /firm|pricing|proposal/i.test(name)
  return `${portrait ? 'template-page-portrait' : 'template-page-landscape'}${wide ? ' template-page-wide' : ''}`
}

const templateCellClass = (sheet, cell) => {
  const value = String(cell.value ?? '')
  const name = String(sheet.name || '').toLowerCase()
  const numeric = /^\s*[₹$€£]?[-+\d.,%]+\s*$/.test(value)
  const code = /^[A-Z0-9][A-Z0-9._\-/]{10,}$/i.test(value.replace(/\s+/g, ''))
  const wideText = value.length >= 42 || /description|terms|conditions|address|subject|project|paragraph|letter/i.test(value)
  return [
    'template-workbook-cell',
    value ? '' : 'template-workbook-empty',
    wideText ? 'template-cell-description' : '',
    code ? 'template-cell-code' : '',
    numeric ? 'template-cell-number' : '',
    !wideText && !code && !numeric && /firm|pricing|proposal/i.test(name) && value.length <= 14 ? 'template-cell-compact' : '',
  ].filter(Boolean).join(' ')
}

function RouteTemplateTab({ route, tab, p, doc, priced, lineQuoted }) {
  const proposalSymbol = currencySymbol(p?.sourceCurrency || 'INR')
  const rows = (p.bom || []).map((line, i) => ({
    ...line,
    index: i + 1,
    qty: (line.qtyPerUnit || 0) * (p.units || 1) + (line.common || 0) + (line.spares || 0),
  }))
  const title = tab === 'Service Rate Schedule' ? 'Service Rate Schedule'
    : tab === 'Firm Offer' ? 'Firm Offer'
      : tab

  if (tab === 'Scope of Work') {
    return <div className="form-card route-template-panel">
      <div className="section-title">Scope of Work</div>
      <p className="hint">Service template: execution scope and deliverables from the service proposal and SOW.</p>
      {(doc.scope || []).map((item, i) => <div className="route-template-row" key={i}><b>{i + 1}. {item.category || item.desc}</b><span>{item.desc || item.pn || 'Scope item'}</span></div>)}
      {(doc.scopeIncludes || []).map((item, i) => <div className="route-template-row" key={`include-${i}`}><b>Deliverable</b><span>{item}</span></div>)}
      {!doc.scope?.length && !doc.scopeIncludes?.length && <div className="hint">Add the service scope in the Document tab.</div>}
    </div>
  }

  if (tab === 'Issues List') {
    return <div className="form-card route-template-panel">
      <div className="section-title">Issues List</div>
      <p className="hint">Service template: open issues, assumptions, and resolution notes stay tied to the proposal.</p>
      {(p.terms || []).map((term, i) => <div className="route-template-row" key={i}><b>{term.term || `Issue ${i + 1}`}</b><span>{term.customerAsk || term.ourResponse || 'Review required'} · {term.status}</span></div>)}
      {!p.terms?.length && <div className="hint">No service issues captured yet.</div>}
    </div>
  }

  if (tab === 'Proposal') {
    return <div className="form-card route-template-panel">
      <div className="section-title">Service Proposal</div>
      <p className="route-template-lead">{doc.execSummary}</p>
      <div className="section-title">Commercial note</div>
      <p>{doc.commercialNote || 'Commercial terms are maintained in the Document tab.'}</p>
    </div>
  }

  if (tab === 'Clarifications') {
    return <div className="form-card route-template-panel">
      <div className="section-title">Clarifications</div>
      <p className="hint">Only missing technical, equipment, quantity, delivery, or contact information belongs here. Commercial requests and counter-offers are managed in Commercial decision and Follow-up.</p>
      <div className="route-template-row"><b>No commercial clarification</b><span>Customer requests already known in the quotation are not repeated as questions.</span></div>
    </div>
  }

  if (tab === 'Sensor Comparison') {
    return <div className="form-card route-template-panel">
      <div className="section-title">Sensor Comparison</div>
      <p className="hint">Spares template: compare the customer item reference with the proposed ModAE/OEM item.</p>
      <table className="sheet"><thead><tr><th>#</th><th>Customer item</th><th>Proposed item</th><th>Description</th></tr></thead><tbody>
        {rows.map(row => <tr key={row.index}><td>{row.index}</td><td>{row.custRef || '—'}</td><td>{row.pn || '—'}</td><td>{row.desc || '—'}</td></tr>)}
        {!rows.length && <tr><td colSpan={4} className="hint">No comparison rows captured yet.</td></tr>}
      </tbody></table>
    </div>
  }

  if (tab === 'Service Rate Schedule' || tab === 'Firm Offer') {
    return <div className="form-card route-template-panel">
      <div className="section-title">{title}</div>
      <p className="hint">{route === 'Services' ? 'Service template: priced activities, man-days, mobilisation, and payment milestones.' : 'Spares template: offered parts, quantities, unit prices, and total prices.'}</p>
      <table className="sheet"><thead><tr><th>#</th><th>Scope / equipment description</th><th>Proposed model / part no.</th><th>Quantity</th>{priced && <th>{`Unit price (${proposalSymbol})`}</th>}</tr></thead><tbody>
        {rows.map(row => <tr key={row.index}><td>{row.index}</td><td>{row.desc || row.itemCategory || '—'}</td><td>{row.pn || '—'}</td><td className="num">{row.qty}</td>{priced && <td className="num">{proposalSymbol} {fmt(lineQuoted(row), 2)}</td>}</tr>)}
        {!rows.length && <tr><td colSpan={priced ? 5 : 4} className="hint">No BOQ lines captured yet.</td></tr>}
      </tbody></table>
    </div>
  }

  return null
}

// Qty/Unit × units + Common + Spares — the BoQ quantity rule, in one place so
// the signal-list derivation reads the same totals the sheet shows.
// normalize() and the line-pricing chain moved to proposal/docProps.js so the
// opportunity workspace's Preview tab can build the same document this page
// prints. `normalize` keeps its old name here to leave the call sites alone.
const normalize = normalizeProposal

// Combines the current ModAE customer preview and the legacy workbook draft
// into one toolbar dropdown. The workbook is never the customer document.
// following the same open/close + click-outside pattern as DetailTabs' overflow menu.
function PreviewMenu({ onPreviewProposal, onPreviewTemplate }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const close = event => {
      if (!menuRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  return (
    <div className="proposal-toolbar-menu" ref={menuRef}>
      <button type="button" className="btn-secondary" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(v => !v)}>
        <Icon name="eye" size={13} /> Preview <Icon name="chevronDown" size={12} />
      </button>
      {open && (
        <div className="proposal-toolbar-menu-list" role="menu">
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onPreviewProposal() }}>Preview PDF</button>
          {onPreviewTemplate && <button type="button" role="menuitem" onClick={() => { setOpen(false); onPreviewTemplate() }}>Draft workbook (reference)</button>}
        </div>
      )}
    </div>
  )
}

function RevisionMenu({ currentRevision, options, onSelect }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const close = event => {
      if (!menuRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  return (
    <span className="proposal-revision-menu" ref={menuRef}>
      <button
        type="button"
        className="proposal-meta-chip proposal-revision-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
      >
        Rev-{currentRevision || '00'} <Icon name="chevronDown" size={11} />
      </button>
      {open && (
        <span className="proposal-revision-menu-list" role="menu" aria-label="Proposal revisions">
          {options.map(option => (
            <button
              key={option.key}
              type="button"
              role="menuitem"
              disabled={!option.available}
              className={option.current ? 'current' : ''}
              onClick={() => {
                if (!option.available) return
                setOpen(false)
                onSelect(option)
              }}
            >
              <span>Rev-{option.revision}</span>
              <small>{option.current ? 'Current' : option.available ? 'Historical preview' : 'Snapshot unavailable'}</small>
            </button>
          ))}
        </span>
      )}
    </span>
  )
}

// Rendered two ways: as the standalone /proposal/:oppId page, and embedded in the
// opportunity workspace (Proposal tab → Builder). Embedded mode drops the page
// chrome — title, back link, duplicated blocker list — and unpins the sheet tabs.
// Keep the Greenfield gate in a wrapper so the editor's hook order never changes
// when navigation switches between opportunity types.
export default function Proposal(props) {
  const { oppId: oppIdProp } = props
  const { oppId: routeOppId } = useParams()
  const store = useStore()
  const opp = store.opportunities.find(o => o.id === (oppIdProp || routeOppId))
  if (opp && !isWorkflowAvailable(opp.oppType)) return <OpportunityComingSoon opp={opp} />
  return <ProposalEditor {...props} />
}

function ProposalEditor({ oppId: oppIdProp, embedded = false, initialTab = 'Edit Sheet' }) {
  const { oppId: routeOppId } = useParams()
  const oppId = oppIdProp || routeOppId
  const store = useStore()
  const fb = useFormulaBar()
  const opp = store.opportunities.find(o => o.id === oppId)
  const isComingSoon = !!opp && !isWorkflowAvailable(opp.oppType)
  const canEditProposal = !!opp && (opp.owner === store.role || isAdminRole(store.role))
  const [tab, setTab] = useState(initialTab)
  const [workbook, setWorkbook] = useState('proposal')
  const [printingModel, setPrintingModel] = useState(null)
  const [pdfPreviewTarget, setPdfPreviewTarget] = useState(null)
  const [previewTarget, setPreviewTarget] = useState(null)
  const [previewWorkbook, setPreviewWorkbook] = useState(null)
  const [previewWorkbookBusy, setPreviewWorkbookBusy] = useState(false)
  const [previewWorkbookError, setPreviewWorkbookError] = useState('')
  const [referencePreviewOpen, setReferencePreviewOpen] = useState(false)
  const [referenceLoading, setReferenceLoading] = useState(false)
  const [referenceError, setReferenceError] = useState('')
  const [templatePreviewOpen, setTemplatePreviewOpen] = useState(false)
  const [templatePreviewMode, setTemplatePreviewMode] = useState('draft')
  const [renderedTemplateWorkbook, setRenderedTemplateWorkbook] = useState(null)
  const [editingTemplateCell, setEditingTemplateCell] = useState(null)
  const [templateLoading, setTemplateLoading] = useState(false)
  const [templateError, setTemplateError] = useState('')
  const [reviewBusy, setReviewBusy] = useState(false)
  const [reviewStage, setReviewStage] = useState(0)
  const [reviewProgressTitle, setReviewProgressTitle] = useState('Scanning proposal with AI')
  const [reviewProgressStages, setReviewProgressStages] = useState(GENERATED_REVIEW_STAGES)
  const [reviewFileName, setReviewFileName] = useState('')
  const [validateChoice, setValidateChoice] = useState(false)
  const [reviewedUploadViewing, setReviewedUploadViewing] = useState(false)
  const uploadInputRef = useRef(null)
  const [reviewMessage, setReviewMessage] = useState('')
  const [reviewError, setReviewError] = useState('')
  const [overrideConfirmOpen, setOverrideConfirmOpen] = useState(false)
  const [conditionTarget, setConditionTarget] = useState(null)
  const [conditionNote, setConditionNote] = useState('')
  const [readinessOpen, setReadinessOpen] = useState(false)
  const [p, setP] = useState(() => normalize(store.getProposal(oppId), opp))
  // Ref mirror: deferred commits (formula bar) must patch the CURRENT proposal,
  // never a click-time snapshot — a stale snapshot would silently revert edits.
  const pRef = React.useRef(p)
  pRef.current = p
  const reviewedUploadStorageRef = React.useRef(new Map())
  const linkedLead = opp && [...(store.leads || []), ...(store.leadArchive || [])].find(l => l.id === opp.sourceLeadId
    || l.oppId === oppId
    || String(opp.remarks || '').includes(`lead ${l.id}`)
    || (opp.rfqNumber && l.ref && String(opp.rfqNumber).trim() === String(l.ref).trim())
    || (opp.oppName && l.subject && String(opp.oppName).trim() === String(l.subject).trim()))

  // /proposal/:oppId reuses this component instance — reload state per opportunity.
  useEffect(() => { setP(normalize(store.getProposal(oppId), opp)); setTab(initialTab) }, [oppId, initialTab]) // eslint-disable-line

  // Older converted opportunities predate structured lead imports. Backfill
  // their BoQ once from the linked lead so existing work does not stay on the
  // generic starter rows. New registrations carry leadImportId themselves.
  useEffect(() => {
    if (isComingSoon) return
    // Spares must always enter Proposal through the Sourcing workbench. Do not
    // manufacture sourcing rows from a saved/demo Proposal BoQ when this page
    // is opened; real Spares creation paths write sparesLines first.
    if (!opp || ['Service', 'Spares'].includes(routeForType(opp.oppType))) return
    const current = store.getProposal(oppId)
    if (!linkedLead || (current.leadImportId === linkedLead.id && current.bom?.length) || !linkedLead.ai) return
    const { extracted, workbenchRows, bom } = buildLeadProposalData(linkedLead, store.priceLists, store.adhocParts)
    if (!bom.length) return
    const next = { ...current, bom, extractedItems: extracted, units: 1, rfqNumber: linkedLead.ref || current.rfqNumber, subject: linkedLead.subject || current.subject, project: linkedLead.subject || current.project, leadImportId: linkedLead.id }
    store.addSparesLinesFromLead(oppId, workbenchRows)
    store.saveProposal(oppId, next)
    setP(normalize(next, opp))
  }, [oppId, opp?.sourceLeadId, opp?.remarks, linkedLead?.id, linkedLead?.oppId, store.proposals?.[oppId]?.leadImportId, store.proposals?.[oppId]?.bom?.length, isComingSoon]) // eslint-disable-line

  // A saved Spares proposal may predate the sourcing-to-proposal sync and still
  // contain unrelated lead-extracted rows. Repair that state on load so the
  // screen immediately reflects the confirmed sourcing dataset.
  useEffect(() => {
    if (isComingSoon) return
    if (!opp || routeForType(opp.oppType) !== 'Spares') return
    const sourceLines = (store.sparesLines || []).filter(line => line.oppId === oppId
      && !line.removedFromSourcing
      && !isPlaceholderSparesLine(line)
      && !isLegacyAutoSparesSupportRow(line)
      && (line.confirmed && Number(line.qty) > 0 || isSparesSupportRow(line)))
      .filter(line => line.origin !== 'proposal-support')
    if (!sourceLines.length) return
    const current = store.getProposal(oppId)
    const nextBom = orderedSparesProposalBom(sourceLines, store.priceLists, current.costing)
    const same = current.bom?.length === nextBom.length
      && current.bom.every((line, index) => {
        const next = nextBom[index]
        return line.pn === next.pn && line.custRef === next.custRef && line.desc === next.desc
          && Number(line.common || 0) === next.common && Number(line.listPrice || 0) === next.listPrice
      })
    if (same) return
    const next = { ...current, bom: nextBom }
    store.sendLinesToProposal(oppId)
    setP(normalize(next, opp))
  }, [oppId, opp?.oppType, store.sparesLines, store.proposals?.[oppId]?.bom, isComingSoon]) // eslint-disable-line

  // Print-all: render the full customer document (cover + terms + BoQ) first,
  // then open the dialog; afterprint restores the tabbed view.
  // Embedded, the surrounding opportunity page (summary, tab strips, lifecycle,
  // readiness panel) is not part of the customer document — the print stylesheet
  // hides it off this body class, which only exists while the dialog is open.
  useEffect(() => {
    if (!printingModel) return
    const done = () => setPrintingModel(null)
    if (embedded) document.body.classList.add('proposal-printing')
    window.addEventListener('afterprint', done, { once: true })
    const t = setTimeout(() => window.print(), 60)
    return () => {
      clearTimeout(t)
      window.removeEventListener('afterprint', done)
      document.body.classList.remove('proposal-printing')
    }
  }, [printingModel, embedded])

  if (!opp) return <div className="page"><h2>Unknown opportunity</h2><Link to="/">Back to tracker</Link></div>
  if (isComingSoon) return <OpportunityComingSoon opp={opp} />

  const comm = canPriceProposal(store.role)
  const pendingForOpp = (store.approvals || []).filter(a => a.oppId === oppId && a.status === 'Pending')

  const units = p.units || 7

  // Shared with the Preview tab in the opportunity workspace — see docProps.js.
  const {
    allParts, totalQty, linePrice, lineCost, lineComputed, lineQuoted, computeTotals,
  } = buildPricing(store, p)
  const proposalCurrency = p.sourceCurrency || 'INR'
  const proposalSymbol = currencySymbol(proposalCurrency)
  const proposalRate = store.config?.currencyRates

  const route = docRoute(p, opp)
  const artifactSheets = p.artifactSheets || []
  const referenceRows = p.referenceWorkbook?.rows || []
  const proposalTemplate = route === 'Project' ? p.projectProposalWorkbook
    : route === 'Spares' ? p.sparesProposalWorkbook
      : route === 'Services' ? p.serviceProposalWorkbook : null
  const configuredProposalTemplate = resolveProposalTemplate(store.config, route)
  const proposalTemplateSheets = proposalTemplate?.sheets || []
  const referencePartNumber = description => String(description || '').match(/[A-Z]{1,8}[A-Z0-9]*(?:[./-][A-Z0-9]+){2,}/i)?.[0] || ''
  const referenceBom = rows => rows.map(row => {
    const pn = referencePartNumber(row.description)
    const match = allParts.find(part => (pn && part.pn?.toLowerCase() === pn.toLowerCase()) || part.desc?.toLowerCase() === row.description.toLowerCase())
    return {
      itemCategory: 'Hardware', pn: match?.pn || pn, custRef: pn,
      desc: row.description, uom: row.uom || 'EA', listPrice: row.unitPrice || match?.price || 0,
      adders: [], qtyPerUnit: 0, common: row.quantity || 1, spares: 0, quoted: row.unitPrice || '',
      list: match?.list || 'Ad-hoc', currency: match?.currency || 'INR',
    }
  })

  useEffect(() => {
    if (isComingSoon) return
    if (!opp || docRoute(p, opp) !== 'Spares' || p.referenceWorkbook) return
    let cancelled = false
    setReferenceLoading(true)
    setReferenceError('')
    fetch(MEGGITT_ITEM_LIST_URL)
      .then(response => { if (!response.ok) throw new Error('Meggitt item list could not be loaded'); return response.arrayBuffer() })
      .then(buffer => {
        if (cancelled) return
        const workbook = parseReferenceWorkbook(buffer, 'Meggitt Item List.xlsx')
        const current = pRef.current
        const next = { ...current, referenceWorkbook: workbook, bom: referenceBom(workbook.rows) }
        store.saveProposal(oppId, next)
        setP(normalize(next, opp))
      })
      .catch(error => { if (!cancelled) setReferenceError(error?.message || 'Reference workbook could not be loaded') })
      .finally(() => { if (!cancelled) setReferenceLoading(false) })
    return () => { cancelled = true }
  }, [oppId, opp?.oppType, p.proposalType, p.referenceWorkbook, isComingSoon]) // eslint-disable-line

  // The supplied proposal templates are editable reference workbooks. They are
  // deliberately stored separately from the BoQ: the Spares item list remains
  // the source of quoted lines, while these sheets preserve the customer-facing
  // layout (cover, firm offer, SOW, issues, and so on).
  useEffect(() => {
    if (isComingSoon) return
    if (!opp || !['Project', 'Spares', 'Services'].includes(route) || proposalTemplate) return
    let cancelled = false
    const selectedTemplate = resolveProposalTemplate(store.config, route)
    const isSpares = route === 'Spares'
    const key = route === 'Project' ? 'projectProposalWorkbook' : isSpares ? 'sparesProposalWorkbook' : 'serviceProposalWorkbook'
    const filename = selectedTemplate.filename
    setTemplateLoading(true)
    setTemplateError('')
    loadProposalTemplateBuffer(selectedTemplate)
      .then(buffer => {
        if (cancelled) return
        const workbook = parseProposalWorkbook(buffer, filename)
        const current = pRef.current
        const next = { ...current, [key]: workbook }
        store.saveProposal(oppId, next)
        setP(normalize(next, opp))
      })
      .catch(error => { if (!cancelled) setTemplateError(error?.message || 'Proposal template could not be loaded') })
      .finally(() => { if (!cancelled) setTemplateLoading(false) })
    return () => { cancelled = true }
  }, [oppId, opp?.oppType, p.proposalType, route, proposalTemplate, store.config?.uploads?.proposalTemplates, isComingSoon]) // eslint-disable-line

  const updateReferenceRow = (index, key, value) => {
    const rows = referenceRows.map((row, i) => {
      if (i !== index) return row
      if (key === 'quantityText') return { ...row, quantityText: value, quantity: parseQuantityCell(value) }
      return { ...row, [key]: key === 'unitPrice' ? Math.max(0, Number(value) || 0) : value }
    })
    const next = { ...p, referenceWorkbook: { ...p.referenceWorkbook, rows }, bom: referenceBom(rows) }
    save(next)
  }

  const openTemplatePreview = async () => {
    setEditingTemplateCell(null)
    setTemplatePreviewOpen(true)
    setTemplatePreviewMode('draft')
    setTemplateLoading(true)
    setTemplateError('')
    try {
      const selectedTemplate = resolveProposalTemplate(store.config, route)
      const bytes = await generateProposalWorkbook({
        templateBuffer: await loadProposalTemplateBuffer(selectedTemplate),
        p, opp, doc, priced, totalQty, lineQuoted, lineCost, linePrice, totals, route,
        mapping: selectedTemplate.mapping,
        mappingWarnings: selectedTemplate.mappingWarnings,
        redactInternalCosting: false,
      })
      setRenderedTemplateWorkbook(parseRenderedWorkbook(bytes, selectedTemplate.filename || proposalTemplate?.filename || `${oppId} Proposal.xlsx`))
    } catch (error) {
      setTemplateError(error?.message || 'Proposal workbook could not be generated')
      setRenderedTemplateWorkbook(null)
    } finally {
      setTemplateLoading(false)
    }
  }

  const updateTemplateCell = (sheetName, rowIndex, columnIndex, value) => {
    const targetSheet = renderedTemplateWorkbook?.sheets?.find(sheet => sheet.name === sheetName)
    if (!targetSheet) return
    const currentValue = String(targetSheet.rows?.[rowIndex]?.[columnIndex] ?? '').trim()
    const kind = targetSheet.kinds?.[rowIndex]?.[columnIndex]
    if (!currentValue || kind === 'formula' || kind === 'number'
      || /^\s*[₹$€£]?[-+\d.,%]+\s*$/.test(currentValue)
      || /^[A-Z0-9][A-Z0-9._\-/]{10,}$/i.test(currentValue.replace(/\s+/g, ''))
      || /^(our ref|bid stage|bid type|revision|sl\.?\s*no\.?|item description|proposed model|part no\.?|qty|quantity|unit price|total price|unit cost|total cost|computed|list price|total for|terms\s*&?\s*conditions?)\s*:?$/i.test(currentValue)) return
    const key = route === 'Project' ? 'projectProposalWorkbook' : route === 'Spares' ? 'sparesProposalWorkbook' : 'serviceProposalWorkbook'
    const sheets = renderedTemplateWorkbook.sheets.map(sheet => sheet.name !== sheetName ? sheet : {
      ...sheet,
      rows: sheet.rows.map((row, r) => r !== rowIndex ? row : row.map((cell, c) => c !== columnIndex ? cell : value)),
    })
    const nextWorkbook = { ...renderedTemplateWorkbook, sheets }
    setRenderedTemplateWorkbook(nextWorkbook)
    save({ ...p, [key]: { ...proposalTemplate, sheets } })
  }

  const beginTemplateCellEdit = (sheetName, rowIndex, columnIndex, value) => {
    setEditingTemplateCell({ sheetName, rowIndex, columnIndex, value: String(value ?? '') })
  }

  const finishTemplateCellEdit = (cancel = false) => {
    if (!editingTemplateCell) return
    if (!cancel) {
      const { sheetName, rowIndex, columnIndex, value } = editingTemplateCell
      updateTemplateCell(sheetName, rowIndex, columnIndex, value)
    }
    setEditingTemplateCell(null)
  }

  const totals = computeTotals(p)
  const financeCost = (p.costing.financeCostK || 0) * 1000
  const netGM = totals.target - totals.cost - financeCost
  // The BoQ's own reading of the signal count — offered as the default and as a
  // "recalculate" action, but never forced over a figure the user has typed.
  const derivedSignals = signalsFromBom(p.bom, units, totalQty)
  const derivedTotal = countSignals(derivedSignals)
  const totalSignals = countSignals(p.signals)
  const signalsStale = derivedTotal > 0 && derivedTotal !== totalSignals
  const rack = rackLayout(totalSignals)

  const save = (next, { preserveReview = false } = {}) => {
    if (!canEditProposal) return
    const isSparesProposal = next.proposalType === 'Spares' || next.route === 'Spares' || opp?.route === 'Spares'
    if (isSparesProposal) next = { ...next, bom: withSparesSupportRows(next.bom) }
    // Once a BoQ has ever been priced, keep syncing even down to 0 — an emptied
    // BoQ must not leave stale Value/COGS on the tracker. Never-priced proposals
    // don't overwrite the intake estimate.
    next = {
      ...next,
      pricedOnce: pRef.current.pricedOnce || next.bom.length > 0,
      reviewStatus: !preserveReview && ['Validated', 'Override accepted'].includes(next.reviewStatus) ? 'Needs review' : (next.reviewStatus || pRef.current.reviewStatus),
      reviewIssues: !preserveReview && ['Validated', 'Override accepted'].includes(next.reviewStatus) ? [] : (next.reviewIssues || pRef.current.reviewIssues || []),
      reviewNeedsRevision: !preserveReview && ['Validated', 'Override accepted'].includes(next.reviewStatus) ? true : (next.reviewNeedsRevision || pRef.current.reviewNeedsRevision || false),
    }
    setP(next)
    store.saveProposal(oppId, next)
    if (next.pricedOnce) {
      const t = computeTotals(next)
      const valueK = Math.round(t.target / 1000)
      const cogsK = Math.round(t.cost / 1000)
      if (isFinite(valueK) && isFinite(cogsK) && (valueK !== opp.valueK || cogsK !== opp.cogsK || !opp.proposalDate)) {
        store.updateOpportunity(oppId, {
          valueK, cogsK,
          ...(opp.proposalDate ? {} : { proposalDate: new Date().toISOString().slice(0, 10) }),
        })
      }
    }
  }
  const set = k => e => save({ ...p, [k]: e.target.value })
  const setCosting = k => e => save({ ...p, costing: { ...p.costing, [k]: clampCosting(k, e.target.value) } })

  // Formula-bar selection for the costing block — the same cell refs and
  // formulas as the real Priced BoQ sheet (O4 is literally =8.5%+2.5%+5%).
  const selCosting = (ref, formula, key, kind = 'number') => () => fb.select({
    ref, formula,
    // Patch against pRef.current, not the render-time p — the commit may fire
    // long after other edits (BoQ lines, units, terms) have changed the proposal.
    // Clamped here too — the bar writes to state directly, so the cells' own
    // min/max attributes never see the value.
    commit: key ? v => { const cur = pRef.current; save({ ...cur, costing: { ...cur.costing, [key]: clampCosting(key, v) } }) } : null,
    kind,
  })

  // Unit Price stays a string field — blank means "use the computed price" —
  // so it can't go through clampQty; it only rejects negatives.
  const clampQuoted = s => {
    const t = String(s)
    if (t.trim() === '') return ''
    const n = Number(t)
    if (!isFinite(n)) return ''
    return n < 0 ? '0' : t
  }
  const updLine = (i, k, numeric = true) => e => {
    const raw = k === 'quoted' ? clampQuoted(e.target.value)
      : numeric ? clampQty(e.target.value) : e.target.value
    const v = k === 'quoted' && raw !== ''
      ? String(Math.round(Number(raw) * (Number(proposalRate?.[proposalCurrency]) || 1)))
      : raw
    save({ ...p, bom: p.bom.map((l, j) => (j === i ? { ...l, [k]: v } : l)) })
  }
  const pasteBoq = (startRow, startCol, values) => {
    const keys = ['itemCategory', 'desc', 'qtyPerUnit', 'common', 'spares', 'quoted']
    const current = pRef.current
    const bom = current.bom.map(l => ({ ...l }))
    values.forEach((row, r) => row.forEach((value, c) => {
      const i = startRow + r
      const key = keys[startCol + c]
      if (!bom[i] || !key) return
      bom[i][key] = key === 'quoted' ? (() => {
        const quoted = clampQuoted(value)
        return quoted === '' ? '' : String(Math.round(toInr(quoted, proposalCurrency, proposalRate)))
      })()
        : ['itemCategory', 'desc'].includes(key) ? value : clampQty(value)
    }))
    save({ ...current, bom })
  }
  const toggleAdder = (i, adder) => () => {
    const bom = p.bom.map((l, j) => {
      if (j !== i) return l
      const has = l.adders.includes(adder.code)
      return { ...l, adders: has ? l.adders.filter(a => a !== adder.code) : [...l.adders, adder.code] }
    })
    save({ ...p, bom })
  }
  const removeLine = i => () => save({ ...p, bom: p.bom.filter((_, j) => j !== i) })
  const adjustLineQty = (i, delta) => () => {
    const current = Number(pRef.current.bom[i]?.qtyPerUnit) || 0
    const bom = pRef.current.bom.map((line, j) => j === i
      ? { ...line, qtyPerUnit: Math.max(0, current + delta) }
      : line)
    save({ ...pRef.current, bom })
  }

  const updTerm = (i, k) => e => save({ ...p, terms: p.terms.map((t, j) => (j === i ? normalizeCommercialTerm({ ...t, [k]: e.target.value }) : t)) })
  const addTerm = () => save({ ...p, terms: [...p.terms, { term: '', customerAsk: '', ourResponse: '', status: 'Comply', decision: 'Compliant', customerConfirmationStatus: 'Not required' }] })
  const useModaeStandardTerms = () => {
    const current = pRef.current
    if (current.terms?.length) return
    const next = {
      ...current,
      terms: modaeStandardCommercialTerms(),
      reviewIssues: (current.reviewIssues || []).filter(issue => informationalReviewFinding(issue).code !== 'terms.missing'),
    }
    save(next, { preserveReview: true })
    setReviewMessage('ModAE standard commercial terms added.')
  }
  const commercialDecisionTerms = (p.terms || []).filter(term => term.status === 'Deviation')
  const requestCommercialApproval = async terms => {
    if (store.config?.requireCommercialDeviationApproval === false) return
    const deviationDetails = commercialApprovalDetails(terms)
    if (!deviationDetails.length) return
    const lead = (store.leads || []).find(item => item.oppId === oppId)
    const aiSummary = lead?.ai?.summary?.trim() || ''
    const reviewSummary = await ensureApprovalSummary({
      ...pRef.current,
      terms,
      reviewStatus: 'Needs review',
      reviewNeedsRevision: true,
    })
    store.requestApproval({
      oppId,
      type: 'Commercial deviation',
      rev: String(pRef.current.revision ?? ''),
      approver: 'AH',
      needed: ['AH'],
      anyOf: false,
      detail: 'Customer-requested commercial terms matched. AH approval is required before quotation submission.',
      blockingReason: 'The proposal matches one or more customer-requested commercial terms that differ from ModAE standard terms and require AH approval.',
      opportunitySummary: reviewSummary.text || aiSummary || `${opp.oppName || 'This opportunity'} is a ${opp.route || 'sales'} opportunity for ${opp.sellTo || 'the customer'}.`,
      summarySource: reviewSummary.source || (aiSummary ? 'ai' : 'fallback'),
      deviationDetails,
      approvalSnapshot: proposalApprovalSnapshot({ ...pRef.current, terms }, opp),
      refreshPendingContext: true,
    })
    setReviewMessage('AH approval was requested for the matched customer terms.')
  }
  const setCommercialDecision = (index, decision) => {
    const current = pRef.current
    const nextTerms = (current.terms || []).map((term, termIndex) => termIndex === index
      ? normalizeCommercialTerm({
        ...term,
        decision,
        ourResponse: decision === 'Match customer terms'
          ? term.customerAsk
          : (term.proposedTerm || term.standardTerm || term.ourResponse),
        customerConfirmationStatus: decision === 'Counter-offer with ModAE standard terms'
          ? 'Awaiting reply'
          : 'Not required',
      })
      : term)
    save({ ...current, terms: nextTerms })
    if (decision === 'Match customer terms') requestCommercialApproval(nextTerms)
  }
  const setCounterOffer = (index, value) => {
    const current = pRef.current
    save({ ...current, terms: current.terms.map((term, termIndex) => termIndex === index
      ? normalizeCommercialTerm({ ...term, proposedTerm: value, ourResponse: value })
      : term) })
  }
  const setCustomerConfirmation = (index, status) => {
    const current = pRef.current
    save({ ...current, terms: current.terms.map((term, termIndex) => termIndex === index
      ? normalizeCommercialTerm({ ...term, customerConfirmationStatus: status })
      : term) })
  }
  const routeScope = opp.international || opp.location === 'International' ? 'international' : 'domestic'
  const availableClauses = clausesFor(store.config?.clauses, route === 'Service' ? 'Services' : route, routeScope)
  const selectedClauses = (p.clauseIds || []).map(id => availableClauses.find(clause => clause.id === id)).filter(Boolean)
  const toggleClause = id => save({ ...p, clauseIds: (p.clauseIds || []).includes(id) ? p.clauseIds.filter(item => item !== id) : [...(p.clauseIds || []), id] })
  const editClause = (id, text) => save({ ...p, clauses: [...(p.clauses || []).filter(clause => clause.id !== id), { id, label: availableClauses.find(clause => clause.id === id)?.label || id, text }] })
  const moveClause = (id, delta) => {
    const ids = [...(p.clauseIds || [])]
    const from = ids.indexOf(id); const to = from + delta
    if (from < 0 || to < 0 || to >= ids.length) return
    ;[ids[from], ids[to]] = [ids[to], ids[from]]
    save({ ...p, clauseIds: ids })
  }
  const addLine = () => save({ ...p, bom: [...p.bom, {
    itemCategory: '', desc: '', pn: '', custRef: '', listPrice: 0, adders: [],
    qtyPerUnit: 0, common: 1, spares: 0, quoted: '', uom: 'EA',
  }] })
  const removeTerm = i => () => save({ ...p, terms: p.terms.filter((_, j) => j !== i) })

  const comms = (store.communications || {})[oppId] || []
  const currentSubmission = latestSubmissionForRevision(comms, p.revision)

  // Submission gates: red-customer clearance, deviation approvals, and
  // approved-with-conditions confirmations, per the Aug 10 review.
  const blockers = readiness(opp, p, store)
  const blocked = isBlocked(blockers)
  const submitted = comms.some(c => c.kind === 'submission' || c.kind === 'proposal-email')
  const reviewStatus = p.reviewStatus || 'Not reviewed'
  const reviewReady = reviewStatus === 'Validated' || reviewStatus === 'Override accepted'
  const validatedUploadActive = hasValidatedUploadedWorkbook(p)
  const overrideAccepted = reviewStatus === 'Override accepted' && p.reviewOverride?.accepted
  const normalizedReviewIssues = (p.reviewIssues || []).map(informationalReviewFinding)
  const displayReviewIssues = normalizedReviewIssues.map(issue => overrideAccepted
    ? { ...issue, severity: 'info', overridden: true }
    : issue)
  const reviewIssuesAreInformational = displayReviewIssues.length > 0
    && displayReviewIssues.every(issue => issue.severity === 'info')
  const workbookChangeIssues = displayReviewIssues.filter(issue => ['line.value-changed', 'term.value-changed'].includes(issue.code))
  const otherReviewIssues = displayReviewIssues.filter(issue => !['line.value-changed', 'term.value-changed'].includes(issue.code))
  const blockingReviewIssues = otherReviewIssues.filter(issue => issue.severity === 'block')
  const warningReviewIssues = otherReviewIssues.filter(issue => issue.severity === 'warning')
  const informationalReviewIssues = otherReviewIssues.filter(issue => issue.severity === 'info')
  const workflowBlocked = blockers.some(bl => bl.severity === 'block' || bl.severity === 'wait')
  const approvalRequired = blockers.some(bl => bl.approvalType && bl.severity !== 'wait') || pendingForOpp.length > 0
  const reviewBanner = reviewStatus === 'Needs attention'
    ? { tone: 'warning', title: 'Validation needs attention', text: 'Fix the issues listed below before requesting approval.' }
    : reviewStatus === 'Validated'
      ? p.reviewedUpload
        ? { tone: 'warning', title: 'Human-uploaded proposal — manual review', text: workflowBlocked ? 'The workbook was checked. Resolve the remaining readiness items before moving to Approval.' : 'The workbook was checked. Review the red changes below before approval; this notice does not block the workflow.' }
        : workflowBlocked
          ? { tone: 'warning', title: 'Review complete — action required', text: 'Resolve the remaining readiness items before moving to Approval.' }
          : approvalRequired
            ? { tone: 'success', title: 'Review complete', text: 'Approval is required before the quote can be released.' }
            : { tone: 'success', title: 'Review complete', text: 'This proposal is ready for approval.' }
      : reviewStatus === 'Override accepted'
        ? { tone: 'override', title: 'Review override accepted', text: 'The findings were saved and the proposal can continue through approval.' }
        : p.reviewedUpload
            ? { tone: 'neutral', title: 'Uploaded proposal review', text: 'This uploaded workbook is being checked against the opportunity and its approval history.' }
          : { tone: 'neutral', title: 'Review the generated proposal', text: 'Validate the system-generated workbook before requesting approval.' }
  const readinessSummary = readinessSummaryFor({ blockers, pendingForOpp, submitted })

  // Keep the approval request self-contained so an approver can understand
  // the commercial reason without reopening the proposal first.
  const approvalDetail = bl => {
    const findings = displayReviewIssues
      .filter(issue => ['block', 'warning'].includes(issue.severity) && String(issue.text || '').trim())
      .slice(0, 3)
      .map(issue => issue.text.trim())
    return findings.length
      ? `${bl.text}. Review findings: ${findings.join(' | ')}`
      : bl.text
  }

  // Approval cards should lead with a concise AI summary, while the proposal
  // page keeps the complete structured findings. Reuse the validated summary
  // when it is current; only make another AI call when an older saved review
  // has no usable summary for this revision.
  const ensureApprovalSummary = async (proposalOverride = null) => {
    const current = proposalOverride || pRef.current
    const revision = String(current.revision ?? '')
    const fallback = {
      text: 'AI summary unavailable. Review the detailed validation findings on the proposal before approval.',
      source: 'fallback',
    }
    if (!current.reviewNeedsRevision
      && ['Validated', 'Override accepted'].includes(current.reviewStatus)
      && String(current.reviewSummaryRevision ?? '') === revision
      && String(current.reviewSummary || '').trim()) {
      return { text: current.reviewSummary.trim(), source: current.reviewSummarySource || 'ai' }
    }
    try {
      const result = await runTaskResult(
        'proposal.review',
        reviewWorkbookPayload(current.reviewedUpload, current, opp, current.reviewIssues || []),
        { model: store.config?.aiModel?.model },
      )
      const data = result.data?.data || result.data || {}
      const summary = String(data.summary || '').trim()
      if (summary) {
        const next = { ...current, reviewSummary: summary, reviewSummaryRevision: revision, reviewSummarySource: 'ai' }
        setP(next)
        store.saveProposal(oppId, next)
        return { text: summary, source: 'ai' }
      }
    } catch (error) {
      console.warn('Approval summary generation failed; continuing with fallback.', error)
    }
    return fallback
  }

  const approvalRequest = (bl, summary) => store.requestApproval({
    oppId, type: bl.approvalType, approver: bl.approver, rev: bl.rev || String(pRef.current.revision ?? ''), detail: approvalDetail(bl),
    opportunitySummary: summary.text,
    summarySource: summary.source,
    ...(bl.needed ? { needed: bl.needed } : {}),
    ...(bl.anyOf ? { anyOf: bl.anyOf } : {}),
    ...(bl.deviationDetails ? { deviationDetails: bl.deviationDetails } : {}),
    // Pricing approvals remember the offending rows, not the whole quote.
    ...(bl.pricingRows?.length ? { pricingRows: bl.pricingRows } : {}),
  })

  // Forward `needed` and `anyOf`. Dropping them let recordDecision fall back to
  // [approver], so a joint LJS+AH gate raised from this page — the Red customer
  // clearance among them — cleared on LJS alone. Workbench.jsx and PropBuilder
  // already forward both; this call site was the odd one out.
  const requestApproval = bl => async () => {
    const summary = await ensureApprovalSummary()
    approvalRequest(bl, summary)
  }
  const confirmCond = bl => () => {
    setConditionTarget(bl)
    setConditionNote('')
  }
  const saveCondition = () => {
    if (!conditionNote.trim() || !conditionTarget) return
    store.confirmCondition(conditionTarget.approvalId, conditionTarget.condIdx, conditionNote.trim())
    setConditionTarget(null)
    setConditionNote('')
  }
  const markSubmitted = () => {
    store.addCommunication(oppId, {
      to: opp.contactPerson || opp.sellTo,
      subject: `${oppId} — Proposal Rev ${p.revision} submitted to customer`,
      kind: 'submission',
      revision: String(p.revision ?? ''),
    })
    if (!opp.proposalDate) store.updateOpportunity(oppId, { proposalDate: new Date().toISOString().slice(0, 10) })
  }

  // Phase-one human-in-the-loop checkpoint. This is intentionally deterministic
  // in the local demo: production AI can replace the implementation while the
  // proposal state and UX remain the same.
  const updateReviewedUploadStorage = (blobKey, patch, fallbackProposal = null) => {
    reviewedUploadStorageRef.current.set(blobKey, patch)
    const current = pRef.current
    const base = current.reviewedUpload?.blobKey === blobKey
      ? current
      : fallbackProposal?.reviewedUpload?.blobKey === blobKey ? fallbackProposal : null
    if (!base) return false
    const next = {
      ...base,
      reviewedUpload: { ...base.reviewedUpload, ...patch },
    }
    setP(next)
    store.saveProposal(oppId, next, { immediate: true })
    return true
  }

  const startReviewedUploadStorage = ({ blobKey, file, proposal }) => {
    const localUpload = putFiles(blobKey, [file])
    const cloudUpload = uploadOppFile(opp, 'Proposal', file)
    Promise.allSettled([localUpload, cloudUpload]).then(results => {
      const cloud = results[1].status === 'fulfilled' ? results[1].value : null
      const failures = results
        .filter(result => result.status === 'rejected')
        .map(result => result.reason?.message || 'Storage upload failed')
      const storagePatch = failures.length
        ? { storageStatus: 'failed', storageError: failures.join('; ') }
        : {
          storageStatus: 'uploaded', storageError: '',
          ...(cloud ? { webUrl: cloud.webUrl, url: cloud.url, path: cloud.path, itemId: cloud.itemId } : {}),
        }
      updateReviewedUploadStorage(blobKey, storagePatch, proposal)
    })
  }

  const retryReviewedUpload = async () => {
    const upload = pRef.current.reviewedUpload
    if (!upload?.blobKey || !upload.filename) return
    setReviewError('')
    updateReviewedUploadStorage(upload.blobKey, { storageStatus: 'pending', storageError: '' })
    try {
      const file = await getFile(upload.blobKey, upload.filename)
      if (!file) throw new Error('The local workbook is unavailable. Upload the reviewed workbook again.')
      const cloud = await uploadOppFile(opp, 'Proposal', file)
      updateReviewedUploadStorage(upload.blobKey, {
        storageStatus: 'uploaded', storageError: '',
        webUrl: cloud.webUrl, url: cloud.url, path: cloud.path, itemId: cloud.itemId,
      })
    } catch (error) {
      updateReviewedUploadStorage(upload.blobKey, { storageStatus: 'failed', storageError: error?.message || 'Storage upload failed' })
      setReviewError(error?.message || 'The reviewed workbook could not be uploaded')
    }
  }

  const validateReviewedProposal = async (proposal = p, { automatic = false, preserveRevision = false, retainProgress = false } = {}) => {
    setReviewBusy(true)
    if (!retainProgress) {
      setReviewProgressTitle(automatic ? 'Reviewing uploaded proposal' : 'Scanning proposal with AI')
      setReviewProgressStages(automatic ? UPLOAD_REVIEW_STAGES : GENERATED_REVIEW_STAGES)
      setReviewStage(0)
    }
    setReviewMessage('')
    setReviewError('')
    // Let React paint the visible loading state before local checks and the
    // network request occupy the event loop.
    await yieldToPaint()
    try {
      const review = proposal
      setReviewStage(retainProgress ? 2 : 1)
      const issues = []
      let reviewedUpload = review.reviewedUpload
      const storagePatch = reviewedUpload?.blobKey
        ? reviewedUploadStorageRef.current.get(reviewedUpload.blobKey)
        : null
      if (storagePatch) reviewedUpload = { ...reviewedUpload, ...storagePatch }
      // Re-run the deterministic comparison from the pre-import snapshot so
      // older uploads also receive the exact old-value → new-value findings.
      if (reviewedUpload?.sheets?.length && reviewedUpload.baseProposal) {
        const recomputed = importReviewedWorkbook(
          { sheets: reviewedUpload.sheets },
          reviewedUpload.baseProposal,
          opp,
        )
        reviewedUpload = {
          ...reviewedUpload,
          importedChanges: recomputed.changes,
          termChanges: recomputed.termChanges,
          validationIssues: recomputed.issues,
          comparisonAvailable: true,
        }
      }
      // Uploading a reviewed workbook replaces the artifact for the current
      // quote. Only the explicit “open revision” workflow should bump Rev-00
      // to Rev-01; validation itself must not change the customer revision.
      const revisionChanged = !preserveRevision && !!review.reviewNeedsRevision
      const nextRevision = revisionChanged ? String((Number(review.revision) || 0) + 1).padStart(2, '0') : review.revision
      const nextRevisionLog = revisionChanged ? [...(review.revisions || []), {
        rev: `Rev-${nextRevision}`,
        when: new Date().toISOString().slice(0, 10), by: store.role,
        note: 'Proposal edited and revalidated', status: 'Revised', type: 'Other',
        snapshot: snapshotProposal(review),
      }] : (review.revisions || [])
      if (!review.bom?.length && route !== 'Services') issues.push({ severity: 'block', text: 'No BOQ lines were found in the proposal.' })
      if (review.bom?.some(line => !String(line.pn || '').trim())) issues.push({ severity: 'info', code: 'line.part-number-missing', text: 'One or more BOQ lines are missing a model or part number.' })
      if (review.bom?.some(line => Number(totalQty(line)) <= 0)) issues.push({ severity: 'block', text: 'Every proposal line must have a quantity greater than zero.' })
      if (review.bom?.some(line => line.quoted !== '' && Number(line.quoted) < 0)) issues.push({ severity: 'block', text: 'Negative quoted prices are not allowed.' })
      if (!review.terms?.length) issues.push({ severity: 'info', code: 'terms.missing', text: 'Commercial terms have not been added yet.' })
      if (reviewedUpload?.validationIssues?.length) issues.unshift(...reviewedUpload.validationIssues)
      if (reviewedUpload?.sheets?.length && !reviewedUpload.baseProposal) {
        issues.unshift({
          severity: 'info',
          code: 'review.comparison-unavailable',
          text: 'Exact workbook-change comparison is unavailable because the pre-upload proposal snapshot is missing. Upload the workbook again to compare changes.',
        })
      }

      setReviewStage(retainProgress ? 3 : 2)
      const aiResult = await runTaskResult('proposal.review', reviewWorkbookPayload(
        reviewedUpload,
        review,
        opp,
        issues,
        {
          baseline: reviewedUpload?.baseProposal,
          deterministicChanges: reviewedUpload?.importedChanges,
          deterministicTermChanges: reviewedUpload?.termChanges,
        },
      ), { model: store.config?.aiModel?.model })
      const aiReview = aiResult.data?.data || aiResult.data || {}
      const aiIssues = normalizeAiReview(aiReview)
      if (!aiResult.data && aiResult.error) aiIssues.push({ severity: 'info', code: 'ai.unavailable', source: 'AI', text: `AI semantic review was unavailable: ${aiResult.error}. Local checks were still completed.` })
      const aiSummary = String(aiReview.summary || '').trim()
      setReviewStage(retainProgress ? 4 : 3)
      const logicalIssues = filterLogicalChangeIssues(issues, aiReview, { aiAvailable: Boolean(aiResult.data) })
      const allIssues = rememberOverriddenFindings(
        rememberApprovedFindings([...logicalIssues, ...aiIssues], store.approvals, oppId, nextRevision),
        review.reviewOverride,
      )
      const hasActiveBlock = allIssues.some(issue => issue.severity === 'block')
      const hasRememberedOverride = allIssues.some(issue => issue.overridden)

      const next = {
        ...review,
        reviewedUpload,
        revision: nextRevision,
        revisions: nextRevisionLog,
        reviewStatus: hasActiveBlock ? 'Needs attention' : hasRememberedOverride ? 'Override accepted' : 'Validated',
        reviewIssues: allIssues,
        reviewSummary: aiSummary,
        reviewSummaryRevision: aiSummary ? String(nextRevision ?? '') : '',
        reviewSummarySource: aiSummary ? 'ai' : '',
        reviewCompletedAt: new Date().toISOString(),
        reviewNeedsRevision: false,
        reviewOverride: hasRememberedOverride
          ? { ...review.reviewOverride, findings: allIssues.filter(issue => issue.overridden) }
          : null,
      }
      setP(next)
      store.saveProposal(oppId, next, { immediate: true })
      if (next.reviewStatus === 'Validated') {
        const unresolvedCommercialTerms = (next.terms || []).filter(needsCommercialResolution)
        setReviewMessage(allIssues.length === 0
          ? unresolvedCommercialTerms.length
            ? `Review complete — resolve commercial decisions for ${unresolvedCommercialTerms.map(term => term.term).join(', ')} before moving to Approval.`
            : 'Review complete — proposal is ready to proceed.'
          : automatic
            ? 'Uploaded workbook validated and set as the active proposal. Review the findings before proceeding.'
            : 'Review complete. The proposal can now move to approval or customer send.')
      } else {
        setReviewError('Review found blocking issues. Resolve them before continuing.')
      }
    } catch (error) {
      setReviewError(error?.message || 'Proposal validation failed')
    } finally {
      setReviewBusy(false)
    }
  }

  const validateAiDraft = async () => {
    setValidateChoice(false)
    setReviewFileName('')
    const uploaded = p.reviewedUpload
    const { reviewedUpload, ...withoutUpload } = p
    const next = {
      ...withoutUpload,
      ...(uploaded?.baseProposal || {}),
      artifactSheets: p.artifactSheets || uploaded?.baseProposal?.artifactSheets || [],
      reviewStatus: 'Needs review',
      reviewIssues: [],
      reviewCompletedAt: null,
      reviewNeedsRevision: true,
      reviewOverride: null,
    }
    setP(next)
    store.saveProposal(oppId, next, { immediate: true })
    await validateReviewedProposal(next)
  }

  const uploadReviewedProposal = async event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!/\.xlsx?$/i.test(file.name)) {
      setReviewError('Upload the reviewed proposal as an XLSX file.')
      return
    }
    setValidateChoice(false)
    setReviewBusy(true)
    setReviewStage(0)
    setReviewProgressTitle('Uploading reviewed proposal')
    setReviewProgressStages(UPLOAD_REVIEW_STAGES)
    setReviewFileName(file.name)
    setReviewMessage('')
    setReviewError('')
    await yieldToPaint()
    try {
      setReviewStage(1)
      const parsed = parseRenderedWorkbook(await file.arrayBuffer(), file.name)
      const baselineProposal = p.draftBaseline || snapshotProposal(p)
      const imported = importReviewedWorkbook(parsed, baselineProposal, opp)
      // Keep each uploaded artifact addressable. Re-uploading a workbook must
      // not overwrite the bytes referenced by an older revision snapshot.
      const blobKey = `proposal-review-${opp.id}-rev-${String(p.revision || '00').padStart(2, '0')}-${Date.now()}`
      const next = {
        ...p,
        ...imported.proposal,
        artifactSheets: p.artifactSheets || imported.proposal.artifactSheets || [],
        reviewedUpload: { filename: file.name, type: file.type, size: file.size, uploadedAt: new Date().toISOString(), blobKey, storageStatus: 'pending', storageError: '', sheets: parsed.sheets, importedChanges: imported.changes, termChanges: imported.termChanges, validationIssues: imported.issues, table: imported.table, baseProposal: baselineProposal },
        reviewStatus: 'Ready for validation',
        reviewIssues: imported.issues,
        reviewNeedsRevision: false,
        reviewOverride: null,
      }
      setP(next)
      store.saveProposal(oppId, next, { immediate: true })
      // Storage is independent from validation. The workbook is already
      // parsed and available to local review, so AI does not wait for
      // IndexedDB, Supabase, or SharePoint uploads.
      startReviewedUploadStorage({ blobKey, file, proposal: next })
      setReviewStage(2)
      setReviewProgressTitle('Reviewing uploaded proposal')
      setReviewMessage(`${file.name} uploaded and imported. Validating…`)
      await validateReviewedProposal(next, { automatic: true, preserveRevision: true, retainProgress: true })
    } catch (error) {
      setReviewError(error?.message || 'The reviewed proposal could not be read')
      setReviewBusy(false)
    }
  }

  const continueAnyway = () => {
    const findings = p.reviewIssues || []
    const overriddenFindings = findings.map(issue => ({
      ...issue,
      originalSeverity: issue.originalSeverity || issue.severity,
      severity: 'info',
      overridden: true,
      findingKey: issue.findingKey || reviewFindingKey(issue),
    }))
    const next = {
      ...p,
      reviewStatus: 'Override accepted',
      reviewOverride: { accepted: true, by: store.role, at: new Date().toISOString(), findings: overriddenFindings },
      reviewIssues: overriddenFindings,
      reviewNeedsRevision: false,
    }
    setP(next)
    store.saveProposal(oppId, next, { immediate: true })
    setReviewError('')
    setReviewMessage('Validation findings were stored. You chose to continue anyway; this override was recorded in the audit trail.')
  }

  const exportBoQ = () => exportCSV(
    `${oppId}_Priced_BoQ.csv`,
                    ['Sl.', 'BOQ Line Category', 'Scope / Equipment Description', 'Proposed Model & Part Number', 'Customer Item Code', 'Adders', 'Quantity / Unit', 'Common', 'Spares', 'Total Quantity', 'UOM', `Unit Price ${proposalSymbol}`, `Total Price ${proposalSymbol}`, 'Unit Cost ₹', 'Total Cost ₹', `List Price`, 'Currency'],
    p.bom.map((l, i) => [i + 1, l.itemCategory, l.desc, l.pn, l.custRef, l.adders.join('+'), l.qtyPerUnit, l.common, l.spares, totalQty(l), l.uom, lineQuoted(l), lineQuoted(l) * totalQty(l), Math.round(lineCost(l)), Math.round(lineCost(l) * totalQty(l)), linePrice(l), l.currency])
  )
  const exportExcel = async () => {
    try {
      // Treat the downloaded AI draft as the authoritative comparison
      // baseline for the workbook that the user may edit and upload later.
      const draftBaseline = snapshotProposal(p)
      store.saveProposal(oppId, {
        ...p,
        draftBaseline,
        draftBaselineAt: new Date().toISOString(),
      }, { immediate: true })
      const templateBuffer = await loadProposalTemplateBuffer(configuredProposalTemplate)
      await downloadProposalXlsx({
        templateBuffer, p, opp, doc, priced, totalQty, lineQuoted, lineCost, linePrice, totals, route,
        mapping: configuredProposalTemplate?.mapping,
        mappingWarnings: configuredProposalTemplate?.mappingWarnings,
      })
    } catch (error) {
      console.error('Proposal Excel export failed', error)
      setReviewError(`The proposal workbook could not be downloaded: ${error?.message || 'unknown export error'}`)
    }
  }
  const submitForApproval = async () => {
    if (!reviewReady) {
      setReviewError('Run validation after reviewing the proposal before requesting approval.')
      return
    }
    const pendingTypes = new Set(pendingForOpp.map(item => item.type))
    const actionable = blockers.filter(bl => bl.approvalType && bl.severity !== 'wait' && !pendingTypes.has(bl.approvalType))
    const summary = await ensureApprovalSummary()
    actionable.forEach(bl => store.requestApproval({
      oppId, type: bl.approvalType, approver: bl.approver, rev: bl.rev || String(pRef.current.revision ?? ''), detail: approvalDetail(bl),
      opportunitySummary: summary.text,
      summarySource: summary.source,
      ...(bl.needed ? { needed: bl.needed } : {}),
      ...(bl.anyOf ? { anyOf: bl.anyOf } : {}),
      ...(bl.deviationDetails ? { deviationDetails: bl.deviationDetails } : {}),
      // Pricing approvals remember the offending rows, not the whole quote.
      ...(bl.pricingRows?.length ? { pricingRows: bl.pricingRows } : {}),
    }))
    setReadinessOpen(true)
  }

  // The customer document: sections auto-drafted from the opportunity and BoQ,
  // each overridable on the Document tab. Attachments pick up whatever the
  // intake wizard filed under Customer Specs.
  const specFiles = ((store.files || {})[oppId] || {})['Customer Specs'] || []
  const doc = docModel(p, opp, { files: specFiles.map(f => f.name).filter(Boolean), config: store.config })
  // Selling rates are part of every priced proposal; internal costs and margins
  // remain separately protected by the commercial-role checks.
  const priced = p.bidType !== 'Unpriced (Technical)'

  const revisionOptions = [
    {
      key: 'current',
      revision: String(p.revision || '00'),
      proposal: p,
      current: true,
      available: true,
    },
    ...(p.revisions || []).map((entry, index) => {
      const openedRevision = String(entry.rev || '').replace(/^Rev[- ]?/i, '')
      const snapshot = entry.snapshot
      const revision = String(snapshot?.revision ?? openedRevision)
      return {
        key: `history-${index}-${revision}`,
        revision,
        proposal: snapshot || null,
        current: false,
        available: !!snapshot,
      }
    }),
  ]
    .filter(option => /^\d+$/.test(option.revision))
    .filter((option, index, all) => index === all.findIndex(item => item.revision === option.revision))
    .sort((a, b) => Number(b.revision) - Number(a.revision))

  const previewModel = previewTarget
    ? (() => {
      const previewP = normalize(previewTarget.proposal, opp)
      const previewPricing = buildPricing(store, previewP)
      return {
        p: previewP,
        doc: docModel(previewP, opp, { files: specFiles.map(f => f.name).filter(Boolean), config: store.config }),
        priced: previewP.bidType !== 'Unpriced (Technical)',
        totals: previewPricing.computeTotals(previewP),
        lineQuoted: previewPricing.lineQuoted,
        historical: !previewTarget.current,
      }
    })()
    : null

  const pdfPreviewModel = pdfPreviewTarget
    ? (() => {
      const previewP = normalize(pdfPreviewTarget.proposal, opp)
      const previewPricing = buildPricing(store, previewP)
      return {
        p: previewP,
        doc: docModel(previewP, opp, { files: specFiles.map(f => f.name).filter(Boolean), config: store.config }),
        priced: previewP.bidType !== 'Unpriced (Technical)',
        totals: previewPricing.computeTotals(previewP),
        lineQuoted: previewPricing.lineQuoted,
      }
    })()
    : null

  // Revision previews use the same customer-safe workbook artifact that is
  // attached during submission, keeping the preview faithful to the Excel
  // file the customer will receive for every proposal route.
  useEffect(() => {
    let cancelled = false
    if (!previewModel || !previewTarget) {
      setPreviewWorkbook(null)
      setPreviewWorkbookBusy(false)
      setPreviewWorkbookError('')
      return () => { cancelled = true }
    }
    const previewRoute = docRoute(previewModel.p, opp)
    if (hasValidatedUploadedWorkbook(previewModel.p)) {
      // Historical and current validated uploads already contain the exact
      // parsed workbook that was reviewed. Do not regenerate a template here:
      // that would make the revision popup disagree with the saved upload.
      setPreviewWorkbook(validatedWorkbookPreview(previewModel.p))
      setPreviewWorkbookBusy(false)
      return () => { cancelled = true }
    }
    const selectedTemplate = resolveProposalTemplate(store.config, previewRoute)
    const pricing = buildPricing(store, previewModel.p)
    setPreviewWorkbook(null)
    setPreviewWorkbookBusy(true)
    setPreviewWorkbookError('')
    loadProposalTemplateBuffer(selectedTemplate)
      .then(templateBuffer => customerProposalArtifact({
        templateBuffer,
        p: previewModel.p,
        opp,
        doc: previewModel.doc,
        priced: previewModel.priced,
        totalQty: pricing.totalQty,
        lineQuoted: pricing.lineQuoted,
        lineCost: pricing.lineCost,
        linePrice: pricing.linePrice,
        totals: pricing.computeTotals(previewModel.p),
        route: previewRoute,
        mapping: selectedTemplate.mapping,
        mappingWarnings: selectedTemplate.mappingWarnings,
      }))
      .then(artifact => {
        if (!cancelled) setPreviewWorkbook(artifact.workbookPreview)
      })
      .catch(error => {
        if (!cancelled) setPreviewWorkbookError(error?.message || 'Proposal Excel preview could not be generated')
      })
      .finally(() => { if (!cancelled) setPreviewWorkbookBusy(false) })
    return () => { cancelled = true }
  }, [previewTarget?.key, previewModel?.p?.revision, oppId, store.config?.uploads?.proposalTemplates]) // eslint-disable-line

  // Signal List and Rack Layout are project artefacts. Biji, 13 Aug: "in the
  // spare parts case, there will not be any signal list, there will not be
  // rack layout." Hide the tabs rather than show them with an apology.
  const visibleTabs = (ROUTE_TABS[route] || ROUTE_TABS.Project)
    .filter(name => name !== 'Priced BoQ' || comm)
  // Switching route while sitting on a now-hidden tab must not blank the page.
  if (!visibleTabs.includes(tab)) { setTab('Cover Letter'); return null }

  // Embedded, the opportunity page owns the padding and the sheet strip sits in
  // normal flow, so the 64px clearance `.page` reserves for the fixed bar is wrong.
  const shellClass = embedded ? 'proposal-embedded' : 'page'

  // One definition, rendered both on the Priced BoQ tab and inside the preview
  // modal's ModAE-internal section — the same controlled inputs, so an edit in
  // either place lands on the same proposal state.
  const costingFactorsPanel = (
    <>
      <div className="factors">
        <table>
          <thead><tr><th colSpan={2}>Imported Items Pricing &amp; Costing Factors</th></tr></thead>
          <tbody>
            <tr onClick={selCosting('O3', p.costing.baseRate, 'baseRate')}><td>Euro-₹ Base</td><td className="num"><input type="number" step="0.01" min="0" value={p.costing.baseRate} onChange={setCosting('baseRate')} /></td></tr>
            <tr onClick={selCosting('P3', p.costing.usdBase, 'usdBase')}><td>USD-₹ Base</td><td className="num"><input type="number" step="0.01" min="0" value={p.costing.usdBase} onChange={setCosting('usdBase')} /></td></tr>
            <tr onClick={selCosting('O4', p.costing.customsDutyPct ?? 8.5, 'customsDutyPct', 'pct')}><td>Customs Duty</td><td className="num"><input type="number" step="0.1" min="0" value={p.costing.customsDutyPct ?? 8.5} onChange={setCosting('customsDutyPct')} />%</td></tr>
            <tr onClick={selCosting('O4', p.costing.ervPct ?? 2.5, 'ervPct', 'pct')}><td>ERV</td><td className="num"><input type="number" step="0.1" min="0" value={p.costing.ervPct ?? 2.5} onChange={setCosting('ervPct')} />%</td></tr>
            <tr onClick={selCosting('O4', p.costing.handlingPct ?? 5, 'handlingPct', 'pct')}><td>Handling</td><td className="num"><input type="number" step="0.1" min="0" value={p.costing.handlingPct ?? 5} onChange={setCosting('handlingPct')} />%</td></tr>
            <tr onClick={selCosting('O5', p.costing.bnkDiscPct, 'bnkDiscPct', 'pct')}><td>B&amp;K Disc%</td><td className="num"><input type="number" step="0.1" min="0" max="100" value={p.costing.bnkDiscPct} onChange={setCosting('bnkDiscPct')} />%</td></tr>
            <tr onClick={selCosting('O6', '=ROUNDUP((O3*(1+O4)*(1-O5)),0)', null)}><td><b>Eff. Rate</b></td><td className="num"><b>₹ {fmt(effectiveRate(p.costing))} / €&nbsp;·&nbsp;₹ {fmt(effectiveRate(p.costing, 'USD', false))} / $</b></td></tr>
            <tr onClick={selCosting('O7', p.costing.inputGMPct, 'inputGMPct', 'pct')}><td>Input GM%</td><td className="num"><input type="number" step="0.1" min="0" max={MAX_GM_PCT} value={p.costing.inputGMPct} onChange={setCosting('inputGMPct')} />%</td></tr>
          </tbody>
        </table>
        <table>
          <thead><tr><th colSpan={2}>Roll-up (internal)</th></tr></thead>
          <tbody>
            <tr onClick={selCosting('Q3', '=SUM(Total Cost ₹)', null)}><td>ModAE Costs</td><td className="num">₹ {fmt(totals.cost)}</td></tr>
            <tr onClick={selCosting('Q4', '=SUM(Total Price ₹)', null)}><td>Target Price</td><td className="num">₹ {fmt(totals.target)}</td></tr>
            <tr onClick={selCosting('Q5', p.costing.financeCostK, 'financeCostK')}><td>Finance Cost (K₹)</td><td className="num"><input type="number" step="1" min="0" value={p.costing.financeCostK} onChange={setCosting('financeCostK')} /></td></tr>
            <tr onClick={selCosting('Q6', '=Q4-Q3-Q5*1000', null)}><td><b>Net GM ₹</b></td><td className="num"><b>₹ {fmt(netGM)}</b></td></tr>
            <tr onClick={selCosting('Q7', '=Q6/Q4', null)}><td><b>Net GM %</b></td><td className="num"><b>{totals.target ? ((netGM / totals.target) * 100).toFixed(2) + '%' : '—'}</b></td></tr>
          </tbody>
        </table>
        <table>
          <thead><tr><th colSpan={2}>Project</th></tr></thead>
          <tbody>
            <tr><td>№ of Units</td><td className="num"><input type="number" min="1" value={units} onChange={e => save({ ...p, units: +e.target.value || 1 })} /></td></tr>
          </tbody>
        </table>
      </div>
      <div className="costing-note">
        Eff. Rate = ROUNDUP(base × (1 + CD+ERV+Cont.) × (1 − B&amp;K Disc)) — e.g. 112 × 1.16 × 0.50 → ₹65 (B&amp;K discount applies to the B&amp;K list only).
        Unit ₹ price = list × Eff. Rate ÷ (1 − GM). Net GM = Target − ModAE Costs − Finance Cost, so quoting below the computed price or adding finance cost pulls Net GM% under the Input GM%.
        Input GM% is capped at {MAX_GM_PCT}%, the discount at 100%, and finance cost cannot be negative — the cells hold at those limits.
      </div>
    </>
  )

  if (printingModel) {
    return (
      <div className={shellClass}>
        <PrintDoc p={printingModel.p} opp={opp} doc={printingModel.doc} priced={printingModel.priced} totals={printingModel.totals} lineQuoted={printingModel.lineQuoted} />
      </div>
    )
  }

  return (
    <div className={shellClass}>
      {/* The opportunity summary header already names the opportunity, and there
          is no folder to go back to from inside it. */}
      {!embedded && <h2>{oppId} — {opp.sellTo} — Proposal Workbook</h2>}
      <header className="proposal-workspace-header">
        <div className="proposal-workspace-title">
          <span className="eyebrow">Customer proposal</span>
          <h3>{route} proposal <RevisionMenu
            currentRevision={p.revision || '00'}
            options={revisionOptions}
            onSelect={option => setPreviewTarget(option)}
          /></h3>
          <div className="proposal-header-meta" aria-label="Proposal setup">
            <span className="proposal-source-label">{validatedUploadActive ? 'Validated uploaded proposal' : p.reviewedUpload ? 'Uploaded proposal' : 'System-generated proposal'}</span>
            {!embedded && <Link className="btn proposal-folder-link" to={`/folders/${oppId}`}>Back to folder</Link>}
            <span className="proposal-status-label">Review status</span>
            <span className={`pill ${reviewReady ? 'won' : reviewStatus === 'Needs attention' ? 'Red' : 'grey'}`}>{reviewStatus}</span>
            <span className="proposal-status-label">Customer submission</span>
            <span className={`pill ${currentSubmission?.status === 'sent' ? 'won' : currentSubmission?.status === 'draft' ? 'Amber' : 'grey'}`}>
              {submissionStatusLabel(currentSubmission)}
            </span>
            {currentSubmission?.status === 'sent' && (
              <span className="proposal-submission-meta">
                {currentSubmission.to || 'Recipient not recorded'}{currentSubmission.ts ? ` · ${formatISTDateTime(currentSubmission.ts)}` : ''}
              </span>
            )}
            {pendingForOpp.length > 0 && <span className="pill Amber">{pendingForOpp.length} approval{pendingForOpp.length > 1 ? 's' : ''} pending</span>}
          </div>
        </div>
        <div className="toolbar proposal-action-toolbar" aria-label="Proposal actions">
          <button className="btn-secondary" onClick={exportExcel} title="Download Draft">
            <Icon name="download" size={13} /> Draft
          </button>
          <PreviewMenu
            onPreviewProposal={() => setPdfPreviewTarget({
              key: 'current', revision: String(p.revision || '00'), proposal: p, current: true, available: true,
            })}
            onPreviewTemplate={['Project', 'Spares', 'Services'].includes(route) ? openTemplatePreview : null}
          />
          {reviewReady && approvalRequired && !pendingForOpp.length && (
            <button className="btn-secondary" onClick={submitForApproval}><Icon name="send" size={13} /> Request approval</button>
          )}
          <button className="primary" onClick={() => setValidateChoice(true)} disabled={reviewBusy}>
            {reviewBusy
              ? <><span className="auth-loading__spinner auth-loading__spinner-inline" aria-hidden="true" /> Scanning…</>
              : <><Icon name="checkCircle" size={13} /> Validate review</>}
          </button>
        </div>
      </header>

      <input
        className="visually-hidden"
        type="file"
        accept=".xlsx,.xls"
        ref={uploadInputRef}
        onChange={uploadReviewedProposal}
        tabIndex={-1}
        aria-hidden="true"
      />

      <section className={`proposal-review-strip proposal-review-strip-${reviewBanner.tone}`} aria-label="Human review checkpoint">
        <div>
          <strong>{reviewBanner.title}</strong>
          <span>{reviewBanner.text}</span>
        </div>
      </section>
      {reviewBusy && <ScanProgress
        title={reviewProgressTitle}
        fileName={reviewFileName}
        stages={reviewProgressStages}
        active={reviewStage}
      />}
      {p.reviewedUpload && (
        <section className="proposal-uploaded-file-card" aria-label="Uploaded proposal">
          <div>
            <span className="eyebrow">{validatedUploadActive ? 'Active uploaded proposal' : 'Uploaded proposal'}</span>
            <strong>{p.reviewedUpload.filename}</strong>
            <span className="hint">Uploaded {approvalDate(p.reviewedUpload.uploadedAt)} · {fmtSize(p.reviewedUpload.size)}</span>
            {p.reviewedUpload.storageStatus === 'pending' && <span className="hint">Storage upload in progress… validation can continue.</span>}
            {p.reviewedUpload.storageStatus === 'uploaded' && <span className="hint">Storage upload complete.</span>}
            {p.reviewedUpload.storageStatus === 'failed' && <span className="err-text">Storage upload failed: {p.reviewedUpload.storageError || 'retry required'}</span>}
          </div>
          <div className="proposal-uploaded-file-actions">
            <button type="button" className="btn-secondary" onClick={() => setReviewedUploadViewing(true)}>
              <Icon name="eye" size={13} /> Open uploaded file
            </button>
            <button type="button" className="btn-secondary" onClick={validateAiDraft} disabled={reviewBusy}>
              Use AI draft instead
            </button>
            {(p.reviewedUpload.webUrl || p.reviewedUpload.url) && (
              <a className="btn" href={p.reviewedUpload.webUrl || p.reviewedUpload.url} target="_blank" rel="noreferrer">
                Open storage link
              </a>
            )}
            {p.reviewedUpload.storageStatus === 'failed' && <button type="button" className="btn-secondary" onClick={retryReviewedUpload} disabled={reviewBusy}>Retry storage upload</button>}
          </div>
        </section>
      )}
      {reviewedUploadViewing && p.reviewedUpload && (
        <AttachmentViewer
          leadId={p.reviewedUpload.blobKey || `proposal-review-${oppId}`}
          dialogTitle={`${route === 'Project' ? 'Project Proposal' : route === 'Spares' ? 'Spares Firm Offer' : 'Service Proposal'} - ${oppId}`}
          attachment={{
            ...p.reviewedUpload,
            name: p.reviewedUpload.name || p.reviewedUpload.filename,
            workbook: p.reviewedUpload.sheets?.length ? { sheets: p.reviewedUpload.sheets } : undefined,
          }}
          onClose={() => setReviewedUploadViewing(false)}
        />
      )}
      {validateChoice && (
        <Modal title="Validate review" onClose={() => setValidateChoice(false)}>
          <p className="hint">Validate the current AI-generated draft as-is, or upload a workbook that's already been reviewed outside the app.</p>
          <div className="forms-actions proposal-review-actions">
            <button className="primary" onClick={validateAiDraft}>
              <Icon name="checkCircle" size={13} /> Continue with AI draft
            </button>
            <button onClick={() => uploadInputRef.current?.click()}>
              <Icon name="upload" size={13} /> Upload reviewed workbook
            </button>
          </div>
        </Modal>
      )}
      {(reviewError || reviewMessage || p.reviewIssues?.length > 0 || p.reviewCompletedAt) && (
        <section className="proposal-review-results" aria-live="polite">
          {reviewError && <div className="errbox">{reviewError}</div>}
          {reviewMessage && <div className="okbox">{reviewMessage}</div>}
          {p.reviewedUpload && !p.reviewCompletedAt && <div className="proposal-review-issue info">The uploaded revision is being compared with the AI draft. Only meaningful business changes will be shown after validation.</div>}
          {p.reviewCompletedAt && <div className={`proposal-review-issues ${overrideAccepted ? 'is-overridden' : ''}`}>
            <div className="proposal-review-issues-header">
              <div>
                <strong>{overrideAccepted ? 'Previously reviewed findings' : reviewIssuesAreInformational ? 'Validation notes' : 'Validation findings'}</strong>
                <span>{displayReviewIssues.length ? 'Review each item before moving this proposal forward.' : 'The validation pass completed without findings.'}</span>
              </div>
              {!!displayReviewIssues.length && <div className="proposal-review-counts" aria-label="Finding summary">
                {!!blockingReviewIssues.length && <span className="proposal-review-count proposal-review-count-block">{blockingReviewIssues.length} blocking</span>}
                {!!warningReviewIssues.length && <span className="proposal-review-count proposal-review-count-warning">{warningReviewIssues.length} needs review</span>}
                {!!informationalReviewIssues.length && <span className="proposal-review-count proposal-review-count-info">{informationalReviewIssues.length} informational</span>}
                {!!workbookChangeIssues.length && <span className="proposal-review-count proposal-review-count-change">{workbookChangeIssues.length} workbook change{workbookChangeIssues.length === 1 ? '' : 's'}</span>}
              </div>}
            </div>
            {overrideAccepted && <div className="proposal-review-memory-summary">{displayReviewIssues.length} finding{displayReviewIssues.length === 1 ? '' : 's'} overridden by {displayRole(p.reviewOverride.by)}{p.reviewOverride.at ? ` on ${approvalDate(p.reviewOverride.at)}` : ''}. These findings are retained for audit and no longer block this proposal.</div>}
            {p.reviewedUpload?.comparisonAvailable && !workbookChangeIssues.length && <div className="proposal-review-issue info">No meaningful workbook changes found in uploaded {p.reviewedUpload.filename || `Rev-${p.revision || '00'}`}.</div>}
            {!!workbookChangeIssues.length && <div className="proposal-review-workbook-changes">
              <div className="proposal-review-group-head"><strong>Workbook changes detected</strong><span>{workbookChangeIssues.length} item{workbookChangeIssues.length === 1 ? '' : 's'}</span></div>
              <div className="proposal-review-group-list">{workbookChangeIssues.map((issue, index) => <ReviewIssue key={`change-${index}`} issue={issue} overridden={overrideAccepted} />)}</div>
            </div>}
            {!!otherReviewIssues.length
              ? overrideAccepted
                ? <details className="proposal-review-history"><summary>Show finding details</summary>
                    {!!blockingReviewIssues.length && <div className="proposal-review-group proposal-review-group-block"><div className="proposal-review-group-head"><strong>Blocking findings</strong><span>{blockingReviewIssues.length} item{blockingReviewIssues.length === 1 ? '' : 's'}</span></div><div className="proposal-review-group-list">{blockingReviewIssues.map((issue, index) => <ReviewIssue key={`block-${index}`} issue={issue} overridden />)}</div></div>}
                    {!!warningReviewIssues.length && <div className="proposal-review-group proposal-review-group-warning"><div className="proposal-review-group-head"><strong>Needs review</strong><span>{warningReviewIssues.length} item{warningReviewIssues.length === 1 ? '' : 's'}</span></div><div className="proposal-review-group-list">{warningReviewIssues.map((issue, index) => <ReviewIssue key={`warning-${index}`} issue={issue} overridden />)}</div></div>}
                    {!!informationalReviewIssues.length && <div className="proposal-review-group proposal-review-group-info"><div className="proposal-review-group-head"><strong>Informational</strong><span>{informationalReviewIssues.length} item{informationalReviewIssues.length === 1 ? '' : 's'}</span></div><div className="proposal-review-group-list">{informationalReviewIssues.map((issue, index) => <ReviewIssue key={`info-${index}`} issue={issue} overridden />)}</div></div>}
                  </details>
                : <>
                    {!!blockingReviewIssues.length && <div className="proposal-review-group proposal-review-group-block"><div className="proposal-review-group-head"><strong>Blocking findings</strong><span>{blockingReviewIssues.length} item{blockingReviewIssues.length === 1 ? '' : 's'}</span></div><div className="proposal-review-group-list">{blockingReviewIssues.map((issue, index) => <ReviewIssue key={`block-${index}`} issue={issue} onUseStandardTerms={useModaeStandardTerms} />)}</div></div>}
                    {!!warningReviewIssues.length && <div className="proposal-review-group proposal-review-group-warning"><div className="proposal-review-group-head"><strong>Needs review</strong><span>{warningReviewIssues.length} item{warningReviewIssues.length === 1 ? '' : 's'}</span></div><div className="proposal-review-group-list">{warningReviewIssues.map((issue, index) => <ReviewIssue key={`warning-${index}`} issue={issue} onUseStandardTerms={useModaeStandardTerms} />)}</div></div>}
                    {!!informationalReviewIssues.length && <div className="proposal-review-group proposal-review-group-info"><div className="proposal-review-group-head"><strong>Informational</strong><span>{informationalReviewIssues.length} item{informationalReviewIssues.length === 1 ? '' : 's'}</span></div><div className="proposal-review-group-list">{informationalReviewIssues.map((issue, index) => <ReviewIssue key={`info-${index}`} issue={issue} onUseStandardTerms={useModaeStandardTerms} />)}</div></div>}
                  </>
              : !workbookChangeIssues.length && <div className="proposal-review-issue info">Review complete — proposal is ready to proceed.</div>}
            {reviewStatus === 'Needs attention' && <button className="btn-secondary" onClick={() => setOverrideConfirmOpen(true)}>Continue anyway</button>}
          </div>}
        </section>
      )}
      {overrideConfirmOpen && <ConfirmModal title="Continue with validation findings?" tone="danger"
        message="These findings will be overridden and the decision will be stored in the audit trail."
        confirmLabel="Continue anyway" onClose={() => setOverrideConfirmOpen(false)}
        onConfirm={() => { continueAnyway(); setOverrideConfirmOpen(false) }} />}

      <div className="proposal-tab-bar proposal-artifact-tabs">
        <DetailTabs ariaLabel="Proposal documents" activeId={tab}
          items={visibleTabs.map(name => ({ id: name, label: name }))}
          showOverflow={false}
          onChange={setTab} />
      </div>

      {opp.status === 'Open' && (
        <details className="proposal-alert-drawer" open={readinessOpen || blocked || pendingForOpp.length > 0} onToggle={e => setReadinessOpen(e.currentTarget.open)}>
          <summary>
            <span className={`proposal-alert-indicator ${blocked ? 'blocked' : 'ready'}`} />
            <span className="proposal-alert-summary" title={readinessSummary}>{readinessSummary}</span>
            {submitted && <span className="pill won">Submitted</span>}
            <span className="proposal-alert-toggle">Readiness &amp; approval</span>
          </summary>
          <div className="proposal-alert-drawer-body">
        {(commercialDecisionTerms.length > 0 || !(p.terms || []).length) && (
          <section className="proposal-commercial-decision" aria-label="Commercial terms decision">
            <div className="proposal-commercial-decision-head">
              <div>
                <b>Commercial terms decision</b>
                <p className="hint">Resolve customer-requested Payment or Delivery terms here before moving to Approval.</p>
              </div>
              {!(p.terms || []).length && <button className="btn-secondary" type="button" onClick={useModaeStandardTerms} disabled={!canEditProposal}>Use ModAE standard terms</button>}
            </div>
            {commercialDecisionTerms.map(term => {
              const index = p.terms.indexOf(term)
              return <div className="route-template-row commercial-decision-row" key={`proposal-commercial-decision-${index}`}>
                <b className="commercial-decision-term">{term.term || `Term ${index + 1}`}</b>
                <div className="commercial-decision-request">
                  <div><b>Customer requested</b><span>{term.customerAsk || 'Not recorded'}</span></div>
                  <div><b>ModAE standard</b><span>{term.standardTerm || term.ourResponse || 'Not recorded'}</span></div>
                </div>
                <label className="commercial-decision-choice">Decision
                  <select value={term.decision || 'Decision pending'} onChange={e => setCommercialDecision(index, e.target.value)} disabled={!canEditProposal}>
                    {COMMERCIAL_DECISIONS.map(option => <option key={option}>{option}</option>)}
                  </select>
                  {term.decision === 'Match customer terms' && <span className="hint">AH approval requested — quotation submission remains blocked until approval.</span>}
                  {(!term.decision || term.decision === 'Decision pending') && <span className="err">Choose Match customer terms or Counter-offer with ModAE standard terms.</span>}
                </label>
                {term.decision === 'Counter-offer with ModAE standard terms' && <div className="commercial-decision-followup">
                  <label>Counter offer <input value={term.proposedTerm || term.ourResponse || ''} onChange={e => setCounterOffer(index, e.target.value)} disabled={!canEditProposal} /></label>
                  <label>Customer response <select value={term.customerConfirmationStatus || 'Awaiting reply'} onChange={e => setCustomerConfirmation(index, e.target.value)} disabled={!canEditProposal}>
                    {CUSTOMER_CONFIRMATION_STATUSES.filter(status => status !== 'Not required').map(status => <option key={status}>{status}</option>)}
                  </select></label>
                  <span className="hint">Customer confirmation is tracked in Follow-up.</span>
                </div>}
              </div>
            })}
          </section>
        )}
        <div className={`gate-strip ${blocked ? 'blocked' : 'ready'}`}>
          {blockers.length === 0 && (
            <div className="gate-row">
              <Icon name="checkCircle" size={15} />
              <span>No blockers — the reviewed proposal is ready to send.</span>
              <span className="spacer" />
              {submitted
                ? <span className="pill won">Submitted</span>
                : reviewReady && <span className="pill grey">Ready — send from the Follow-up step</span>}
            </div>
          )}
          {/* Embedded, the readiness panel directly above already lists every
              blocker with the same Request-approval buttons — repeating them
              here would show the same list twice on one screen. */}
          {embedded && blockers.length > 0 && (
            <div className={`gate-row ${blocked ? 'block' : 'info'}`}>
              <Icon name={blocked ? 'lock' : 'alert'} size={15} />
              <span>
                {blockers.length} open item{blockers.length > 1 ? 's' : ''} — see
                {' '}<b>Readiness &amp; approval</b> above.
              </span>
            </div>
          )}
          {!embedded && blockers.map(bl => (
            <div key={bl.key} className={`gate-row ${bl.severity}`}>
              <Icon name={bl.severity === 'info' ? 'alert' : bl.severity === 'wait' ? 'clock' : 'lock'} size={15} />
              <span>{bl.text}</span>
              <span className="spacer" />
              {bl.approvalType && bl.severity !== 'wait' && (
                <button onClick={requestApproval(bl)}>Request {bl.approver} approval</button>
              )}
              {bl.approvalId != null && bl.condIdx != null && (
                <button onClick={confirmCond(bl)}>Confirm incorporated</button>
              )}
            </div>
          ))}
          {blockers.length > 0 && !blocked && !submitted && reviewReady && (
            <div className="gate-row">
              <span className="spacer" />
              <span className="pill grey">Ready — send from the Follow-up step</span>
            </div>
          )}
          {blockers.length > 0 && !blocked && submitted && (
            <div className="gate-row"><span className="spacer" /><span className="pill won">Submitted</span></div>
           )}
         </div>
          </div>
        </details>
      )}

      {route !== 'Project' && (
        <details className="proposal-context-drawer">
          <summary>Route context</summary>
          <div className="proposal-context-drawer-body">
        <div className="ai-notice">
          <b>{route} proposal route.</b> The printed document follows the{' '}
          {route.toLowerCase()} proposal template: a covering letter and one priced sheet,
          with no signal list, no rack layout and no project front matter. Optional annexes
          ({artifactSheets.filter(x => !['Cover Letter', 'Priced BoQ'].includes(x)).join(' · ')}) are
          issued only when ticked on the Document tab.
        </div>
          </div>
        </details>
      )}

      {route === 'Spares' && !linkedLead && (
        <details className="proposal-context-drawer">
          <summary>Source lead notice <span className="hint">No linked lead</span></summary>
          <div className="proposal-context-drawer-body"><div className="warnbox">No source lead is linked to this opportunity. The BoQ was not populated from another lead.</div></div>
        </details>
      )}

      {tab === 'Cover Letter' && (
        <div className="cover-sheet">
          <div className="cover-head">
            <ModaeImageLogo className="cover-logo" height={34} />
            <span className="tagline">{MODAE_COMPANY.tagline}</span>
          </div>
          <div className="cover-meta">
            <div><b>Date:</b> <span className="cover-field"><input type="date" value={p.revisionDate} onChange={set('revisionDate')} /></span></div>
            <div><b>Our Ref:</b> {p.ourRef}</div>
            <div><b>Bid Stage:</b> <select value={p.bidStage} onChange={set('bidStage')}><option>Biding</option><option>Budgetary</option></select></div>
            <div><b>Bid Type:</b> <select value={p.bidType} onChange={set('bidType')}><option>Priced</option><option>Unpriced (Technical)</option></select></div>
            <div><b>Revision:</b> <select value={p.revision} onChange={set('revision')}>{['00','01','02','03','04'].map(r => <option key={r}>{r}</option>)}</select></div>
          </div>
          <div className="cover-meta">
            <div><b>{p.addressee}</b></div>
            <div>Kind Attn: <span className="cover-field"><input value={p.kindAttn} onChange={set('kindAttn')} /></span></div>
            <div>Mobile: {p.attnPhone}</div>
          </div>
          <div className="cover-meta proposal-currency-meta" aria-label="Proposal currency conversion">
            <div><b>Proposal currency:</b> <select value={p.sourceCurrency || 'INR'} onChange={e => save({ ...p, sourceCurrency: e.target.value, sourceRate: store.config?.currencyRates?.[e.target.value] || 1, sourceRateDate: new Date().toISOString().slice(0, 10) })}><option>INR</option><option>EUR</option><option>USD</option><option>GBP</option></select></div>
            <div>Customer value: {proposalSymbol} {fmt(fromInr(totals.target, proposalCurrency, proposalRate))}</div>
            <div>INR conversion: ₹ {fmt(totals.target)}</div>
            <div>Admin rate: ₹ {fmt(Number(p.sourceRate) || 1)} / {p.sourceCurrency || 'INR'} · rate date {p.sourceRateDate || '—'}</div>
          </div>
          <div className="cover-meta">
            <div><b>Subject:</b> RFQ # <span className="cover-field"><input value={p.rfqNumber} onChange={set('rfqNumber')} placeholder="RFQ number & date" style={{ minWidth: 180 }} /></span></div>
            <div style={{ marginLeft: 62 }}>{p.subject}</div>
            <div><b>Project:</b> <span className="cover-field"><input value={p.project} onChange={set('project')} style={{ minWidth: 420 }} /></span></div>
          </div>
          <div className="cover-body">
            <p>Dear Sir,</p>
            <p>With reference to your RFQ {p.rfqNumber && `# ${p.rfqNumber}`} we are pleased to submit our Techno-Commercial Proposal for your review and consideration.</p>
            <p>Based on our understanding of the requirement and the information shared by your team, we have prepared the enclosed proposal to support your planning, budgeting, and technical evaluation activities.</p>
          </div>

          <div className="section-title">Commercial Terms &amp; Compliance</div>
          <table className="sheet" style={{ marginBottom: 8 }}>
            <thead>
              <tr><th>Term</th><th>Customer Ask</th><th>Our Response</th><th>Comply / Deviation</th><th></th></tr>
            </thead>
            <tbody>
              {p.terms.map((t, i) => (
                <tr key={i}>
                  <td><input value={t.term} onChange={updTerm(i, 'term')} placeholder="e.g. Payment" /></td>
                  <td><input value={t.customerAsk} onChange={updTerm(i, 'customerAsk')} /></td>
                  <td><input value={t.ourResponse} onChange={updTerm(i, 'ourResponse')} /></td>
                  <td className={t.status === 'Deviation' ? 'err' : ''}>
                    <select value={t.status} onChange={updTerm(i, 'status')}>
                      <option>Comply</option><option>Deviation</option>
                    </select>
                  </td>
                  <td><button className="proposal-row-minus" onClick={removeTerm(i)} title="Remove term" aria-label={`Remove term ${i + 1}`}>−</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={addTerm} className="no-print">+ Add term</button>
          <section className="form-card proposal-clause-library" aria-label="Terms and conditions clause library">
            <div className="section-title">Terms &amp; conditions clauses</div>
            <p className="hint">Select and order the clauses that will be printed. Required or changed clauses are shown before submission.</p>
            {availableClauses.map(clause => {
              const selected = (p.clauseIds || []).includes(clause.id)
              const saved = (p.clauses || []).find(item => item.id === clause.id)
              return <div key={clause.id} className="check-row">
                <input type="checkbox" checked={selected} onChange={() => toggleClause(clause.id)} />
                <span style={{ flex: 1 }}><b>{clause.label}</b>{clause.required && <small className="hint"> · required</small>}
                  {selected && <textarea value={saved?.text || clause.text} onChange={e => editClause(clause.id, e.target.value)} rows={2} style={{ display: 'block', width: '100%', marginTop: 4 }} />}</span>
                {selected && <span><button type="button" className="proposal-row-minus" title="Move clause up" onClick={() => moveClause(clause.id, -1)}>↑</button><button type="button" className="proposal-row-minus" title="Move clause down" onClick={() => moveClause(clause.id, 1)}>↓</button><button type="button" className="proposal-row-minus" title="Remove clause" onClick={() => toggleClause(clause.id)}>−</button></span>}
              </div>
            })}
            {(() => { const warnings = clauseWarnings(p, store.config?.clauses, route === 'Service' ? 'Services' : route, routeScope); return (warnings.missing.length || warnings.changed.length) ? <div className="warnbox">Before submission: {warnings.missing.length ? `${warnings.missing.length} required clause(s) missing` : ''}{warnings.changed.length ? `${warnings.missing.length ? '; ' : ''}${warnings.changed.length} clause(s) changed in Admin` : ''}.</div> : null })()}
          </section>
          <div className="costing-note">
            Every deviation from the customer's preferred commercial terms is called out here — deviations need approval before submission.
          </div>
          {comms.length > 0 && (
            <div className="comms-log">
              <div className="section-title">Communications</div>
              <table className="sheet">
                <thead><tr><th>When</th><th>To</th><th>Subject</th></tr></thead>
                <tbody>
                  {comms.map((c, i) => (
                    <tr key={i}>
                      <td>{c.ts.slice(0, 16).replace('T', ' ')}</td><td>{c.to}</td><td>{c.subject}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'Document' && (
        <>
          <DocEditor p={p} opp={opp} save={save} files={specFiles.map(f => f.name).filter(Boolean)}
            totals={totals} priced={priced} />
          <ProposalDatasheets opp={opp} p={p} save={save} store={store} />
        </>
      )}

      {tab === 'Edit Sheet' && (
          <ProposalSheetEditor p={p} opp={opp} doc={doc} save={save} editable={canEditProposal} totals={totals} units={units} priced={priced} workbook={workbook} setWorkbook={setWorkbook}
          totalQty={totalQty} lineComputed={lineComputed} lineQuoted={lineQuoted} lineCost={lineCost}
          linePrice={linePrice} updLine={updLine} removeLine={removeLine} adjustLineQty={adjustLineQty}
          updTerm={updTerm} addTerm={addTerm} removeTerm={removeTerm} addLine={addLine} pasteBoq={pasteBoq} store={store}
          />
      )}

      {['Scope of Work', 'Issues List', 'Proposal', 'Service Rate Schedule', 'Firm Offer', 'Clarifications', 'Sensor Comparison'].includes(tab) && (
        <RouteTemplateTab route={route} tab={tab} p={p} doc={doc} priced={priced} lineQuoted={lineQuoted} />
      )}

      {tab === 'Signal List' && (
        <div className="form-card print-landscape">
          <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>Signal List</span>
            {derivedTotal > 0
              ? <span className="hint">(counted from the priced BoQ — edit any cell to override)</span>
              : ['Spares', 'Retrofit', 'Service'].includes(opp.oppType) &&
                <span className="hint">(not applicable for spares/service proposals — shown for reference)</span>}
            {signalsStale && (
              <button style={{ marginLeft: 'auto', fontSize: 12, padding: '3px 10px' }}
                onClick={() => save({ ...p, signals: derivedSignals })}>
                Recalculate from BoQ ({derivedTotal})
              </button>
            )}
          </div>
          <table className="sheet">
            <thead><tr><th>Signal</th><th>Per Unit</th><th>Units</th><th>Total</th><th>PI Tags (×15)</th></tr></thead>
            <tbody>
              {p.signals.map((s, i) => (
                <tr key={i}>
                  <td>{s.signal}</td>
                  <td className="num"><input type="number" min="0" value={s.perUnit} onChange={e => { const signals = p.signals.map((x, j) => j === i ? { ...x, perUnit: clampQty(e.target.value) } : x); save({ ...p, signals }) }} style={{ width: 60, textAlign: 'right' }} /></td>
                  <td className="num"><input type="number" min="0" value={s.units} onChange={e => { const signals = p.signals.map((x, j) => j === i ? { ...x, units: clampQty(e.target.value) } : x); save({ ...p, signals }) }} style={{ width: 60, textAlign: 'right' }} /></td>
                  <td className="num">{s.perUnit * s.units}</td>
                  <td className="num">{s.perUnit * s.units * 15}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td>Total</td><td></td><td></td><td className="num">{totalSignals}</td><td className="num">{totalSignals * 15}</td></tr>
            </tfoot>
          </table>
          <div className="costing-note">
            {totalSignals > 0
              ? <>1 vibration signal ≈ 15 AVEVA PI tags. {totalSignals * 15} tags → select the next-higher CMS license tier from the B&K price list (e.g. CMS-TAG-4000).</>
              : <>No sensing elements on the priced BoQ yet — add accelerometers, proximity probes or keyphasors there and the counts appear here, or type them in directly.</>}
          </div>
        </div>
      )}

      {tab === 'Rack Layout' && (
        <div className="form-card print-landscape">
          <div className="section-title">Rack Layout <span className="hint">(sized from the signal list)</span></div>
          {totalSignals === 0 ? (
            <div className="hint" style={{ padding: '18px 2px' }}>
              Nothing to size yet — the rack follows the signal count. Add sensing elements to the
              priced BoQ, or enter counts on the Signal List tab.
            </div>
          ) : (
            <>
              <div className="costing-note" style={{ marginTop: 0, marginBottom: 12 }}>
                {totalSignals} signals ÷ {UMM_CHANNELS} channels per UMM → {rack.ummCount} UMM.
                With 2× PSU, RCM and eSAM fixed in every rack, that is {rack.slotsUsed} of {rack.totalSlots} slots
                across {rack.rackCount} rack{rack.rackCount > 1 ? 's' : ''} — {rack.spareSlots} spare.
              </div>
              <table className="sheet" style={{ maxWidth: 560, marginBottom: 18 }}>
                <thead><tr><th>Module</th><th>Part Number</th><th>Quantity</th></tr></thead>
                <tbody>
                  {rack.modules.map(m => (
                    <tr key={m.key}>
                      <td>{m.label}</td>
                      <td>{m.pn}</td>
                      <td className="num">{m.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rack.racks.map((slots, r) => (
                <div key={r} style={{ marginBottom: 14 }}>
                  <div className="hint" style={{ marginBottom: 6 }}>
                    Rack {r + 1} of {rack.rackCount} — {RACK_SLOTS}-slot VC-8000/RCK
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {slots.map((mod, i) => (
                      <div key={i} title={`Slot ${i + 1}${mod ? ` — ${mod}` : ' — spare'}`}
                        style={{
                          width: 62, padding: '10px 0', textAlign: 'center', fontSize: 12,
                          borderRadius: 4, border: '1px solid var(--border-soft)',
                          background: mod ? 'var(--primary-soft)' : 'transparent',
                          color: mod ? 'var(--primary-deep)' : 'var(--text-subtle)',
                          borderStyle: mod ? 'solid' : 'dashed',
                          fontWeight: mod ? 600 : 400,
                        }}>
                        {mod || 'spare'}
                        <div style={{ fontSize: 10, fontWeight: 400, opacity: 0.6 }}>{i + 1}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
          <div className="hint">Module counts must match the hardware BoQ; the final rack drawing is attached by the engineer.</div>
        </div>
      )}

      {tab === 'Priced BoQ' && !comm && (
        <div className="restricted" style={{ maxWidth: 640 }}>
          <Icon name="lock" size={13} /> Restricted — the Priced BoQ (costing factors, landed costs, margins) is visible to the sales owner, approvers and admin — technical reviewers see quantities only.
        </div>
      )}

      {tab === 'Priced BoQ' && comm && (
        <>
          {costingFactorsPanel}

          <div className="sheet-wrap proposal-boq-sheet-wrap">
            <table className="sheet">
              <thead>
                <tr>
                  <th>Sl.</th><th>BOQ line category</th><th>Scope / equipment description</th><th>Model / part number</th><th>Add-ons</th>
                  <th>Quantity / unit</th><th>Common</th><th>Spares</th><th>Total quantity</th><th>UOM</th>
                  <th>{`Unit Price ${proposalSymbol}`}</th><th>{`Total Price ${proposalSymbol}`}</th>
                  <th className="internal">Unit Cost ₹</th><th className="internal">Total Cost ₹</th><th className="internal">Computed ₹</th><th className="internal">List Price</th><th></th>
                </tr>
              </thead>
              <tbody>
                {p.bom.map((l, i) => {
                  const part = allParts.find(x => x.pn === l.pn && (x.list === l.list || !l.list))
                  const q = totalQty(l)
                  return (
                    <tr key={i}>
                      <td className="rowhead">{i + 1}</td>
                      <td><input value={l.itemCategory} onChange={updLine(i, 'itemCategory', false)} placeholder="e.g. Proximity Transducer" style={{ minWidth: 140 }} /></td>
                      <td><textarea rows={2} value={l.desc} onChange={updLine(i, 'desc', false)} /></td>
                      <td>
                        {l.pn || l.custRef || <span className="hint">—</span>}
                        {l.custRef && l.pn && l.custRef.trim().toLowerCase() !== l.pn.trim().toLowerCase() && (
                          <div className="hint" title="Customer's own item code from the tender">{l.custRef}</div>
                        )}
                      </td>
                      <td>
                        {(part?.adders || []).length
                          ? part.adders.map(a => (
                            <label key={a.code} style={{ marginRight: 10 }}>
                              <input type="checkbox" checked={l.adders.includes(a.code)} onChange={toggleAdder(i, a)} />
                              {' '}{a.desc} (+{l.currency === 'USD' ? '$' : l.currency === 'INR' ? '₹' : '€'}{a.price})
                            </label>
                          ))
                          : <span className="hint">—</span>}
                      </td>
                      <td className="num">
                        <div className="quantity-stepper">
                          <button type="button" onClick={adjustLineQty(i, -1)} title="Decrease quantity" aria-label={`Decrease quantity for line ${i + 1}`}>−</button>
                          <input type="number" min="0" value={l.qtyPerUnit || ''} onChange={updLine(i, 'qtyPerUnit')} placeholder="-" />
                          <button type="button" onClick={adjustLineQty(i, 1)} title="Increase quantity" aria-label={`Increase quantity for line ${i + 1}`}>＋</button>
                        </div>
                      </td>
                      <td className="num"><input type="number" min="0" value={l.common || ''} onChange={updLine(i, 'common')} style={{ width: 52, textAlign: 'right' }} placeholder="-" /></td>
                      <td className="num"><input type="number" min="0" value={l.spares || ''} onChange={updLine(i, 'spares')} style={{ width: 52, textAlign: 'right' }} placeholder="-" /></td>
                      <td className="num"><b>{q}</b></td>
                      <td>{l.uom}</td>
                      <td className="num"><input type="number" min="0" value={l.quoted} onChange={updLine(i, 'quoted', false)} placeholder={fmt(Math.round(lineComputed(l)))} style={{ width: 90, textAlign: 'right' }} title="Customer-facing (target) price — blank = computed price" /></td>
                      <td className="num">{proposalSymbol} {fmt(lineQuoted(l) * q, 2)}</td>
                      <td className="num internal">₹ {fmt(lineCost(l))}</td>
                      <td className="num internal">₹ {fmt(lineCost(l) * q)}</td>
                      <td className="num internal">₹ {fmt(Math.round(lineComputed(l)))}</td>
                        <td className="num internal">{l.currency === 'USD' ? '$' : l.currency === 'INR' ? '₹' : '€'} {fmt(linePrice(l))}<div className="hint">{l.priceSourceName || l.priceList || 'Price source'}</div></td>
                      <td><span className="proposal-row-control" title="Adjust quantity with the stepper">Quantity</span></td>
                    </tr>
                  )
                })}
                {!p.bom.length && <tr><td colSpan={17} className="hint">No BOQ lines yet — add parts from the price list above. Quantities work like the sheet: Total Quantity = Quantity / Unit × {units} units + Common + Spares.</td></tr>}
              </tbody>
              {p.bom.length > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={10}>Totals</td>
                    <td></td>
                    <td className="num">{proposalSymbol} {fmt(p.bom.reduce((sum, line) => sum + lineQuoted(line) * totalQty(line), 0), 2)}</td>
                    <td className="internal"></td>
                    <td className="num internal">₹ {fmt(totals.cost)}</td>
                    <td className="internal" colSpan={2}></td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <div className="costing-note">Grey columns are the internal costing block (never shown to the customer); the white columns are the customer-facing BoQ, quoted in ₹ only.</div>
        </>
      )}

      {pdfPreviewModel && (
        <Modal title={`PDF preview — ${oppId}`} onClose={() => setPdfPreviewTarget(null)} wide className="proposal-preview-modal proposal-pdf-preview-modal">
          <div className="proposal-preview-toolbar">
            <span className="hint">Customer-facing PDF document · Rev-{pdfPreviewModel.p.revision} · Read-only preview</span>
            <div className="forms-actions">
              <button onClick={() => setPdfPreviewTarget(null)}>Close</button>
              <button className="primary" onClick={() => { setPdfPreviewTarget(null); setPrintingModel(pdfPreviewModel) }}>
                <Icon name="printer" size={13} /> Print / Save PDF
              </button>
            </div>
          </div>
          <div className="proposal-preview-scroll proposal-pdf-preview-scroll">
            <PrintDoc p={pdfPreviewModel.p} opp={opp} doc={pdfPreviewModel.doc} priced={pdfPreviewModel.priced} totals={pdfPreviewModel.totals} lineQuoted={pdfPreviewModel.lineQuoted} />
          </div>
        </Modal>
      )}

      {previewModel && (
        <Modal title={`Proposal preview — ${oppId}`} onClose={() => setPreviewTarget(null)} wide className="proposal-preview-modal workbook-preview-modal">
          <div className="proposal-preview-toolbar">
            <span className="hint">
              {previewModel.historical ? 'Historical customer-facing Excel workbook' : 'Customer-facing Excel workbook'} · Rev-{previewModel.p.revision}
              {previewModel.p.reviewedUpload?.filename ? ` · ${previewModel.p.reviewedUpload.filename}` : ''}
              {previewModel.historical ? ' · read-only historical snapshot' : ' · read-only customer-facing preview'}
            </span>
            <div className="forms-actions">
              <button onClick={() => setPreviewTarget(null)}>Close</button>
              <button className="primary" onClick={() => { setPreviewTarget(null); setPrintingModel(previewModel) }}>
                <Icon name="printer" size={13} /> Print / PDF proposal
              </button>
            </div>
          </div>
          <WorkbookPreview workbook={previewWorkbook} loading={previewWorkbookBusy} error={previewWorkbookError} />
        </Modal>
      )}

      {referencePreviewOpen && (
        <Modal title={`Meggitt Item List — ${oppId}`} onClose={() => setReferencePreviewOpen(false)} wide className="proposal-preview-modal workbook-preview-modal">
          <div className="proposal-preview-toolbar">
            <span className="hint">Editable source workbook · changes update the proposal BOQ immediately</span>
            <button onClick={() => setReferencePreviewOpen(false)}>Close</button>
          </div>
          {referenceLoading && <div className="hint">Loading Meggitt Item List.xlsx…</div>}
          {referenceError && <div className="errbox" role="alert">{referenceError}</div>}
          {!!referenceRows.length && <div className="proposal-preview-scroll reference-workbook-preview">
            <table className="sheet" style={{ minWidth: 940, tableLayout: 'fixed' }}>
              <colgroup><col style={{ width: 88 }} /><col style={{ width: 560 }} /><col style={{ width: 110 }} /><col style={{ width: 120 }} /><col style={{ width: 140 }} /></colgroup>
              <thead><tr><th>Sr. No</th><th>Scope / Equipment Description</th><th>Quantity</th><th>Unit Price</th><th>Total Price</th></tr></thead>
              <tbody>{referenceRows.map((row, i) => <tr key={i}>
                <td>{row.srNo}</td>
                <td><textarea rows={2} value={row.description} onChange={e => updateReferenceRow(i, 'description', e.target.value)} style={{ width: '100%', resize: 'vertical' }} /></td>
                <td><input value={row.quantityText ?? row.quantity} onChange={e => updateReferenceRow(i, 'quantityText', e.target.value)} style={{ width: '100%' }} /></td>
                <td><input type="number" min="0" value={row.unitPrice} onChange={e => updateReferenceRow(i, 'unitPrice', e.target.value)} style={{ width: '100%' }} /></td>
                <td className="num">{fmt((Number(row.quantity) || 0) * (Number(row.unitPrice) || 0))}</td>
              </tr>)}</tbody>
            </table>
          </div>}
        </Modal>
      )}

      {templatePreviewOpen && (
        <Modal title={`${route === 'Project' ? 'Project Proposal' : route === 'Spares' ? 'Spares Firm Offer' : 'Service Proposal'} - ${oppId}`} onClose={() => setTemplatePreviewOpen(false)} wide className="proposal-preview-modal workbook-preview-modal">
          <div className="proposal-preview-toolbar">
            <span className="hint">Draft/reference workbook only — customer documents use the current ModAE preview</span>
            <button onClick={() => setTemplatePreviewOpen(false)}>Close</button>
          </div>
          {!!renderedTemplateWorkbook && <div className="workbook-preview-mode-tabs" role="status" aria-label="Proposal workbook view">
            <span className="active">Draft/reference workbook · text editable</span>
          </div>}
          {templateLoading && <div className="hint">Loading proposal workbook...</div>}
          {templateError && <div className="errbox" role="alert">{templateError}</div>}
          {!!configuredProposalTemplate?.mappingWarnings?.length && <div className="warnbox">
            Template mapping needs review: {configuredProposalTemplate.mappingWarnings.join('; ')}
          </div>}
          {!!renderedTemplateWorkbook && <WorkbookPreview
            workbook={renderedTemplateWorkbook}
            editable={templatePreviewMode === 'draft'}
            onChange={updateTemplateCell}
            hidePlaceholderLocations
            customerFacingOnly={false}
          />}
        </Modal>
      )}

      {conditionTarget && (
        <Modal title="Confirm approval condition incorporated" onClose={() => setConditionTarget(null)}>
          <p className="hint">Record how this condition was incorporated in the proposal before release.</p>
          <textarea rows={4} value={conditionNote} onChange={e => setConditionNote(e.target.value)} placeholder="Describe the proposal change..." style={{ width: '100%' }} />
          <div className="forms-actions">
            <button className="primary" disabled={!conditionNote.trim()} onClick={saveCondition}>Confirm incorporated</button>
            <button onClick={() => setConditionTarget(null)}>Cancel</button>
          </div>
        </Modal>
      )}

    </div>
  )
}
