import React, { useEffect, useRef, useState } from 'react'
import XLSX from 'xlsx-js-style'
import { useParams, Link } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { effectiveRate, fmt, exportCSV, canPriceProposal, clampCosting, clampQty, MAX_GM_PCT } from '../utils.js'
import { useFormulaBar } from '../formulabar.jsx'
import { Icon, ModaeImageLogo } from '../icons.jsx'
import { Modal } from '../ui.jsx'
import { oppBlockers, isBlocked } from '../gates.js'
import { docModel, docRoute, enclosuresFor, MODAE_COMPANY } from '../proposalDoc.js'
import DocEditor from '../proposal/DocEditor.jsx'
import PrintDoc from '../proposal/PrintDoc.jsx'
import { signalsFromBom, countSignals, rackLayout, UMM_CHANNELS, RACK_SLOTS } from '../rack.js'
import { normalizeProposal, buildPricing } from '../proposal/docProps.js'
import ProposalSheetEditor from '../proposal/ProposalSheetEditor.jsx'
import PartPicker from '../proposal/PartPicker.jsx'
import { blobAttachment, pricedBoqAttachment } from '../proposal/emailAttachments.js'
import { downloadProposalXlsx } from '../proposal/excelExport.js'
import { routeForType } from '../seed.js'
import { buildLeadProposalData } from '../leadBoq.js'
import { extractPdfText, parseTender, matchParts, buildProposal } from '../tenderParse.js'
import { runTaskResult } from '../ai.js'

const ROUTE_TABS = {
  Project: ['Cover Letter', 'Edit Sheet', 'Document', 'Signal List', 'Rack Layout', 'Priced BoQ'],
  Services: ['Cover Letter', 'Edit Sheet', 'Document', 'Scope of Work', 'Issues List', 'Proposal', 'Service Rate Schedule'],
  Spares: ['Cover Letter', 'Edit Sheet', 'Document', 'Firm Offer', 'Clarifications', 'Sensor Comparison', 'Priced BoQ'],
}

const MEGGITT_ITEM_LIST_URL = new URL('../../branding/Further Inputs/Further Inputs/Proposals and T&Cs/Spares Opp-2 With Different Make (Not yet won)/Meggitt Item List.xlsx', import.meta.url).href
const SPARES_PROPOSAL_URL = new URL('../../branding/Further Inputs/Further Inputs/Proposals and T&Cs/Spares Opp-1 (Won almost)/Spares Firm Offer Rev00 2May2026.xlsx', import.meta.url).href
const SERVICE_PROPOSAL_URL = new URL('../../branding/Further Inputs/Further Inputs/Proposals and T&Cs/Big Service Opp-1 (Won) With SoW/Service Proposal 14Apr26 Rev-01.xlsx', import.meta.url).href

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

const templateColumnPercentages = (sheet, route) => {
  const widths = sheet.widths || []
  const sheetName = String(sheet.name || '').toLowerCase()
  if (sheetName.includes('cover letter') || sheetName.includes('scope of work') || sheetName === 'sow') {
    const percentages = widths.map(() => 1)
    if (percentages.length > 0) percentages[0] = 3
    if (percentages.length > 1) percentages[1] = 14
    if (percentages.length > 2) percentages[2] = 18
    const total = percentages.reduce((sum, item) => sum + item, 0) || 1
    return percentages.map(width => `${(width / total) * 100}%`)
  }
  const total = widths.reduce((sum, width) => sum + Math.max(1, Number(width) || 1), 0) || 1
  return widths.map(width => `${(Math.max(1, Number(width) || 1) / total) * 100}%`)
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
      <p className="hint">Spares template: customer references and unresolved commercial or technical questions.</p>
      {(p.terms || []).map((term, i) => <div className="route-template-row" key={i}><b>{term.term || `Clarification ${i + 1}`}</b><span>{term.customerAsk || 'No customer requirement recorded'} → {term.ourResponse || 'Response pending'}</span></div>)}
      {!p.terms?.length && <div className="hint">No clarifications captured yet.</div>}
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
      <table className="sheet"><thead><tr><th>#</th><th>Item / scope description</th><th>Proposed model / part no.</th><th>Qty</th>{priced && <th>Unit price (₹)</th>}</tr></thead><tbody>
        {rows.map(row => <tr key={row.index}><td>{row.index}</td><td>{row.desc || row.itemCategory || '—'}</td><td>{row.pn || '—'}</td><td className="num">{row.qty}</td>{priced && <td className="num">₹ {fmt(lineQuoted(row))}</td>}</tr>)}
        {!rows.length && <tr><td colSpan={priced ? 5 : 4} className="hint">No line items captured yet.</td></tr>}
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

// Rendered two ways: as the standalone /proposal/:oppId page, and embedded in the
// opportunity workspace (Proposal tab → Builder). Embedded mode drops the page
// chrome — title, back link, duplicated blocker list — and unpins the sheet tabs.
export default function Proposal({ oppId: oppIdProp, embedded = false, initialTab = 'Edit Sheet' }) {
  const { oppId: routeOppId } = useParams()
  const oppId = oppIdProp || routeOppId
  const store = useStore()
  const fb = useFormulaBar()
  const opp = store.opportunities.find(o => o.id === oppId)
  const [tab, setTab] = useState(initialTab)
  const [printing, setPrinting] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [referencePreviewOpen, setReferencePreviewOpen] = useState(false)
  const [referenceLoading, setReferenceLoading] = useState(false)
  const [referenceError, setReferenceError] = useState('')
  const [templatePreviewOpen, setTemplatePreviewOpen] = useState(false)
  const [activeTemplateSheet, setActiveTemplateSheet] = useState(0)
  const [editingTemplateCell, setEditingTemplateCell] = useState(null)
  const [templateLoading, setTemplateLoading] = useState(false)
  const [templateError, setTemplateError] = useState('')
  const [emailOpen, setEmailOpen] = useState(false)
  const [emailTo, setEmailTo] = useState('')
  const [emailCc, setEmailCc] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [emailAttachments, setEmailAttachments] = useState([])
  const [emailPreview, setEmailPreview] = useState(false)
  const [emailBusy, setEmailBusy] = useState(false)
  const [emailError, setEmailError] = useState('')
  const boqFileRef = useRef(null)
  const [boqExtractBusy, setBoqExtractBusy] = useState(false)
  const [boqExtractError, setBoqExtractError] = useState('')
  const [conditionTarget, setConditionTarget] = useState(null)
  const [conditionNote, setConditionNote] = useState('')
  const [p, setP] = useState(() => normalize(store.getProposal(oppId), opp))
  // Ref mirror: deferred commits (formula bar) must patch the CURRENT proposal,
  // never a click-time snapshot — a stale snapshot would silently revert edits.
  const pRef = React.useRef(p)
  pRef.current = p
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
    if (!opp || routeForType(opp.oppType) === 'Service') return
    const current = store.getProposal(oppId)
    if (!linkedLead || (current.leadImportId === linkedLead.id && current.bom?.length) || !linkedLead.ai) return
    const { extracted, workbenchRows, bom } = buildLeadProposalData(linkedLead, store.priceLists)
    if (!bom.length) return
    const next = { ...current, bom, extractedItems: extracted, units: 1, rfqNumber: linkedLead.ref || current.rfqNumber, subject: linkedLead.subject || current.subject, project: linkedLead.subject || current.project, leadImportId: linkedLead.id }
    store.addSparesLinesFromLead(oppId, workbenchRows)
    store.saveProposal(oppId, next)
    setP(normalize(next, opp))
  }, [oppId, opp?.sourceLeadId, opp?.remarks, linkedLead?.id, linkedLead?.oppId, store.proposals?.[oppId]?.leadImportId, store.proposals?.[oppId]?.bom?.length]) // eslint-disable-line

  // Print-all: render the full customer document (cover + terms + BoQ) first,
  // then open the dialog; afterprint restores the tabbed view.
  // Embedded, the surrounding opportunity page (summary, tab strips, lifecycle,
  // readiness panel) is not part of the customer document — the print stylesheet
  // hides it off this body class, which only exists while the dialog is open.
  useEffect(() => {
    if (!printing) return
    const done = () => setPrinting(false)
    if (embedded) document.body.classList.add('proposal-printing')
    window.addEventListener('afterprint', done, { once: true })
    const t = setTimeout(() => window.print(), 60)
    return () => {
      clearTimeout(t)
      window.removeEventListener('afterprint', done)
      document.body.classList.remove('proposal-printing')
    }
  }, [printing, embedded])

  if (!opp) return <div className="page"><h2>Unknown opportunity</h2><Link to="/">Back to tracker</Link></div>

  const comm = canPriceProposal(store.role)
  const customer = store.customers.find(c => c.name === opp.sellTo)
  const pendingForOpp = (store.approvals || []).filter(a => a.oppId === oppId && a.status === 'Pending')

  const units = p.units || 7

  // Shared with the Preview tab in the opportunity workspace — see docProps.js.
  const {
    allParts, totalQty, linePrice, lineCost, lineComputed, lineQuoted, computeTotals,
  } = buildPricing(store, p)

  const route = docRoute(p, opp)
  const referenceRows = p.referenceWorkbook?.rows || []
  const proposalTemplate = route === 'Spares' ? p.sparesProposalWorkbook : route === 'Services' ? p.serviceProposalWorkbook : null
  const proposalTemplateSheets = proposalTemplate?.sheets || []
  const activeTemplateSheetData = proposalTemplateSheets[activeTemplateSheet] || proposalTemplateSheets[0]
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
  }, [oppId, opp?.oppType, p.proposalType, p.referenceWorkbook]) // eslint-disable-line

  // The supplied proposal templates are editable reference workbooks. They are
  // deliberately stored separately from the BoQ: the Spares item list remains
  // the source of quoted lines, while these sheets preserve the customer-facing
  // layout (cover, firm offer, SOW, issues, and so on).
  useEffect(() => {
    if (!opp || (route !== 'Spares' && route !== 'Services') || proposalTemplate) return
    let cancelled = false
    const isSpares = route === 'Spares'
    const url = isSpares ? SPARES_PROPOSAL_URL : SERVICE_PROPOSAL_URL
    const key = isSpares ? 'sparesProposalWorkbook' : 'serviceProposalWorkbook'
    const filename = isSpares ? 'Spares Firm Offer Rev00 2May2026.xlsx' : 'Service Proposal 14Apr26 Rev-01.xlsx'
    setTemplateLoading(true)
    setTemplateError('')
    fetch(url)
      .then(response => { if (!response.ok) throw new Error('Proposal template could not be loaded'); return response.arrayBuffer() })
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
  }, [oppId, opp?.oppType, p.proposalType, route, proposalTemplate]) // eslint-disable-line

  const updateReferenceRow = (index, key, value) => {
    const rows = referenceRows.map((row, i) => {
      if (i !== index) return row
      if (key === 'quantityText') return { ...row, quantityText: value, quantity: parseQuantityCell(value) }
      return { ...row, [key]: key === 'unitPrice' ? Math.max(0, Number(value) || 0) : value }
    })
    const next = { ...p, referenceWorkbook: { ...p.referenceWorkbook, rows }, bom: referenceBom(rows) }
    save(next)
  }

  const openTemplatePreview = () => {
    setActiveTemplateSheet(0)
    setEditingTemplateCell(null)
    setTemplatePreviewOpen(true)
  }

  const updateTemplateCell = (sheetName, rowIndex, columnIndex, value) => {
    const targetSheet = proposalTemplateSheets.find(sheet => sheet.name === sheetName)
    if (!targetSheet) return
    const key = route === 'Spares' ? 'sparesProposalWorkbook' : 'serviceProposalWorkbook'
    const sheets = proposalTemplateSheets.map(sheet => sheet.name !== sheetName ? sheet : {
      ...sheet,
      rows: sheet.rows.map((row, r) => r !== rowIndex ? row : row.map((cell, c) => c !== columnIndex ? cell : value)),
    })
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

  const save = next => {
    // Once a BoQ has ever been priced, keep syncing even down to 0 — an emptied
    // BoQ must not leave stale Value/COGS on the tracker. Never-priced proposals
    // don't overwrite the intake estimate.
    next = { ...next, pricedOnce: pRef.current.pricedOnce || next.bom.length > 0 }
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

  // Add by index into allParts — part numbers are NOT unique across lists
  // (ad-hoc quotes can duplicate a BNK/Metrics PN, and repeat over time).
  const addBomLine = value => {
    const isSource = String(value).startsWith('source:')
    const sourceItem = isSource ? (p.extractedItems || [])[+String(value).slice(7)] : null
    const part = isSource
      ? allParts.find(x => x.pn && sourceItem?.partNumber && x.pn.toLowerCase() === sourceItem.partNumber.toLowerCase())
      : allParts[+value]
    if (isSource && !sourceItem) return
    if (!isSource && !part) return
    const requestedPn = sourceItem?.partNumber || sourceItem?.customerRef || ''
    const pn = part?.pn || requestedPn
    if (p.bom.some(line => (line.custRef || line.pn || '').toLowerCase() === pn.toLowerCase())) return
    save({
      ...p,
      bom: [...p.bom, {
        itemCategory: '', pn: part?.pn || '', custRef: requestedPn,
        desc: sourceItem?.description || part?.desc || '', listPrice: part?.price || 0, adders: [],
        qtyPerUnit: 0, common: sourceItem?.qty || 1, spares: 0, quoted: '',
        list: part?.list || 'Ad-hoc', currency: part?.currency || 'INR',
      }],
    })
  }
  const extractBoqFromPdf = async e => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBoqExtractBusy(true)
    setBoqExtractError('')
    try {
      const extracted = await extractPdfText(file)
      const localLead = {
        body: extracted.fullText,
        attachments: [{ name: file.name, text: extracted.fullText }],
      }
      let aiData = null
      if (file.size <= 12 * 1024 * 1024) {
        const bytes = new Uint8Array(await file.arrayBuffer())
        let binary = ''
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
        const aiResult = await runTaskResult('lead.extract', {
          from: opp.contactEmail || opp.contactPerson || '',
          subject: opp.oppName || p.subject || '',
          body: extracted.fullText,
          attachments: [{ name: file.name, text: extracted.fullText }],
          aiAttachments: [{ name: file.name, mimeType: 'application/pdf', dataBase64: btoa(binary) }],
        }, { fallback: store.config?.aiModel?.provider === 'Built-in fallback' })
        aiData = aiResult.data?.data || null
      }
      const aiLead = aiData?.lineItems?.length ? { ...localLead, ai: { lineItems: aiData.lineItems } } : null
      const leadData = buildLeadProposalData(aiLead || localLead, store.priceLists)
      const parsed = parseTender(extracted.fullText, extracted.struct)
      const items = parsed.items?.length
        ? parsed.items.map(item => ({
          description: item.description, partNumber: item.pn, customerRef: item.sapCode || item.pn,
          qty: item.qty, uom: item.uom || 'EA', evidence: item.evidence || 'Buyer PDF',
        }))
        : leadData.extracted
      if (!items.length) throw new Error('No BOQ line items were found in this PDF.')
      const matched = matchParts(items.map(item => ({
        description: item.description, pn: item.partNumber || item.pn, qty: item.qty,
      })), allParts)
      const next = parsed.items?.length ? buildProposal(oppId, opp, parsed, matched) : { ...p, bom: leadData.bom }
      save({
        ...p,
        // Keep the existing proposal header and commercial edits intact.
        bom: next.bom,
        terms: p.terms?.length ? p.terms : next.terms,
        extractedItems: items,
        attachments: [...new Set([...(p.attachments || []), file.name])],
        boqSource: `PDF: ${file.name}`,
      })
    } catch (error) {
      setBoqExtractError(error?.message || 'Could not extract BOQ lines from this PDF.')
    } finally {
      setBoqExtractBusy(false)
    }
  }
  // Unit Price ₹ stays a string field — blank means "use the computed price" —
  // so it can't go through clampQty; it only rejects negatives.
  const clampQuoted = s => {
    const t = String(s)
    if (t.trim() === '') return ''
    const n = Number(t)
    if (!isFinite(n)) return ''
    return n < 0 ? '0' : t
  }
  const updLine = (i, k, numeric = true) => e => {
    if (k === 'quoted') return
    const v = k === 'quoted' ? clampQuoted(e.target.value)
      : numeric ? clampQty(e.target.value) : e.target.value
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
      bom[i][key] = key === 'quoted' ? clampQuoted(value)
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

  const updTerm = (i, k) => e => save({ ...p, terms: p.terms.map((t, j) => (j === i ? { ...t, [k]: e.target.value } : t)) })
  const addTerm = () => save({ ...p, terms: [...p.terms, { term: '', customerAsk: '', ourResponse: '', status: 'Comply' }] })
  const removeTerm = i => () => save({ ...p, terms: p.terms.filter((_, j) => j !== i) })

  const comms = (store.communications || {})[oppId] || []

  // Submission gates: red-customer clearance, deviation approvals, and
  // approved-with-conditions confirmations, per the Aug 10 review.
  const blockers = oppBlockers(opp, p, store.approvals || [])
  const blocked = isBlocked(blockers)
  const submitted = comms.some(c => c.kind === 'submission')

  // Forward `needed` and `anyOf`. Dropping them let recordDecision fall back to
  // [approver], so a joint LJS+AH gate raised from this page — the Red customer
  // clearance among them — cleared on LJS alone. Workbench.jsx and PropBuilder
  // already forward both; this call site was the odd one out.
  const requestApproval = bl => () => store.requestApproval({
    oppId, type: bl.approvalType, approver: bl.approver, detail: bl.text,
    ...(bl.needed ? { needed: bl.needed } : {}),
    ...(bl.anyOf ? { anyOf: bl.anyOf } : {}),
  })
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
    })
    if (!opp.proposalDate) store.updateOpportunity(oppId, { proposalDate: new Date().toISOString().slice(0, 10) })
  }

  const generatedEmailBody = [
      'Dear Sir/Madam,',
      '',
      `Please find our Techno-Commercial Proposal ${oppId}${p.project ? ' for ' + p.project : ''}.`,
      ...(p.rfqNumber ? [`Ref: ${p.rfqNumber}`] : []),
      '',
      ...p.bom.slice(0, 6).map((l, i) => `${i + 1}. ${l.desc} — ${totalQty(l)} nos`),
      ...(p.bom.length > 6 ? [`…and ${p.bom.length - 6} more items`] : []),
      '',
      'Please find the priced Bill of Quantities attached.',
      '',
      'Best regards,',
      MODAE_COMPANY.name,
  ].join('\n')
  const emailAttachmentMimeType = file => file.type || (file.name.toLowerCase().endsWith('.pdf')
    ? 'application/pdf'
    : file.name.toLowerCase().endsWith('.xlsx')
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : '')
  const addEmailFiles = event => {
    const selected = Array.from(event.target.files || [])
    event.target.value = ''
    const allowed = new Set([
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ])
    const invalid = selected.find(file => !allowed.has(emailAttachmentMimeType(file)))
    if (invalid) {
      setEmailError('Only PDF and XLSX files can be attached')
      return
    }
    setEmailAttachments(current => {
      const next = [...current, ...selected.filter(file => !current.some(existing => existing.name === file.name && existing.size === file.size))]
      if (next.length > 4) {
        setEmailError('You can add up to four extra files (five attachments in total)')
        return next.slice(0, 4)
      }
      setEmailError('')
      return next
    })
  }
  // Shared with the lead-stage clarification draft (src/leadClarification.js),
  // so the two dispatch paths cannot drift apart.
  const sendEmail = async () => {
    if (!emailTo.trim()) {
      setEmailError('A recipient email is required')
      return
    }
    setEmailBusy(true)
    setEmailError('')
    try {
      const optionalAttachments = await Promise.all(emailAttachments.map(file => blobAttachment(file, file.name, emailAttachmentMimeType(file))))
      const response = await fetch('/api/send-proposal-email', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          oppId, to: emailTo.trim(), cc: emailCc.trim(), subject: emailSubject, body: emailBody,
          attachments: [
            pricedBoqAttachment({ p, opp, priced, totalQty, lineQuoted, route }),
            ...optionalAttachments,
          ],
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.ok) throw new Error(result.error || 'Email could not be sent')
      store.addCommunication(oppId, {
        to: emailTo.trim(), cc: emailCc.trim(), subject: emailSubject, kind: 'proposal-email',
        messageId: result.messageId, status: 'sent',
        attachmentNames: [`${oppId}_Priced_BoQ_Rev_${p.revision}.xlsx`,
          ...optionalAttachments.map(a => a.filename)],
      })
      setEmailOpen(false)
    } catch (error) {
      setEmailError(error?.message || 'Email could not be sent')
    } finally {
      setEmailBusy(false)
    }
  }

  const openEmail = () => {
    setEmailSubject(`${oppId} — Techno-Commercial Proposal${p.project ? ' — ' + p.project.slice(0, 60) : ''}`)
    setEmailTo(opp.contactEmail || customer?.email || '')
    setEmailCc('')
    setEmailBody(generatedEmailBody)
    setEmailAttachments([])
    setEmailPreview(false)
    setEmailError('')
    setEmailOpen(true)
  }

  const exportBoQ = () => exportCSV(
    `${oppId}_Priced_BoQ.csv`,
    ['Sl.', 'Item Category', 'Item/Scope Description', 'Proposed Model & Part Number', 'Customer Item Code', 'Adders', 'Qty/Unit', 'Common', 'Spares', 'Total Qty', 'UOM', 'Unit Price ₹', 'Total Price ₹', 'Unit Cost ₹', 'Total Cost ₹', `List Price`, 'Currency'],
    p.bom.map((l, i) => [i + 1, l.itemCategory, l.desc, l.pn, l.custRef, l.adders.join('+'), l.qtyPerUnit, l.common, l.spares, totalQty(l), l.uom, lineQuoted(l), lineQuoted(l) * totalQty(l), Math.round(lineCost(l)), Math.round(lineCost(l) * totalQty(l)), linePrice(l), l.currency])
  )
  const exportExcel = () => downloadProposalXlsx({ p, opp, doc, priced, totalQty, lineQuoted, route })

  // The customer document: sections auto-drafted from the opportunity and BoQ,
  // each overridable on the Document tab. Attachments pick up whatever the
  // intake wizard filed under Customer Specs.
  const specFiles = ((store.files || {})[oppId] || {})['Customer Specs'] || []
  const doc = docModel(p, opp, { files: specFiles.map(f => f.name).filter(Boolean) })
  // Selling rates are part of every priced proposal; internal costs and margins
  // remain separately protected by the commercial-role checks.
  const priced = p.bidType !== 'Unpriced (Technical)'

  // Signal List and Rack Layout are project artefacts. Biji, 13 Aug: "in the
  // spare parts case, there will not be any signal list, there will not be
  // rack layout." Hide the tabs rather than show them with an apology.
  const visibleTabs = ROUTE_TABS[route] || ROUTE_TABS.Project
  // Switching route while sitting on a now-hidden tab must not blank the page.
  if (!visibleTabs.includes(tab)) { setTab('Cover Letter'); return null }

  // Embedded, the opportunity page owns the padding and the sheet strip sits in
  // normal flow, so the 64px clearance `.page` reserves for the fixed bar is wrong.
  const shellClass = embedded ? 'proposal-embedded' : 'page'

  if (printing) {
    return (
      <div className={shellClass}>
        <PrintDoc p={p} opp={opp} doc={doc} priced={priced} totals={totals} lineQuoted={lineQuoted} />
      </div>
    )
  }

  return (
    <div className={shellClass}>
      {/* The opportunity summary header already names the opportunity, and there
          is no folder to go back to from inside it. */}
      {!embedded && <h2>{oppId} — {opp.sellTo} — Proposal Workbook</h2>}
      <div className="toolbar proposal-action-toolbar">
        {!embedded && <Link className="btn" to={`/folders/${oppId}`}>◂ Back to folder</Link>}
        <span className="spacer" />
        <label className="hint">Proposal type:{' '}
          <select value={p.proposalType || 'Project'} onChange={set('proposalType')}>
            <option>Project</option><option>Spares</option><option>Services</option>
          </select>
        </label>
        {pendingForOpp.length > 0 && <span className="pill Amber">{pendingForOpp.length} approval{pendingForOpp.length > 1 ? 's' : ''} pending</span>}
        <button onClick={openEmail}><Icon name="mail" size={13} /> Email proposal</button>
        {tab === 'Priced BoQ' && comm && <button onClick={exportBoQ}>Extract to Excel</button>}
        <button onClick={exportExcel}>Download Excel proposal</button>
        <button onClick={() => setPreviewOpen(true)}><Icon name="eye" size={13} /> Preview proposal</button>
        {(route === 'Spares' || route === 'Services') && <button onClick={openTemplatePreview}><Icon name="fileSheet" size={13} /> Preview {route === 'Spares' ? 'Spares firm offer' : 'service proposal'}</button>}
      </div>

      <div className="workbook-tabs proposal-artifact-tabs" role="tablist" aria-label="Proposal documents">
        {visibleTabs.map(name => (
          <button key={name} role="tab" aria-selected={tab === name} className={tab === name ? 'active' : ''} onClick={() => setTab(name)}>{name}</button>
        ))}
      </div>

      {opp.status === 'Open' && (
        <div className={`gate-strip ${blocked ? 'blocked' : 'ready'}`}>
          {blockers.length === 0 && (
            <div className="gate-row">
              <Icon name="checkCircle" size={15} />
              <span>No blockers — the proposal is clear to go to the customer.</span>
              <span className="spacer" />
              {submitted
                ? <span className="pill won">Submitted</span>
                : <button className="primary" onClick={markSubmitted}>Mark submitted to customer</button>}
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
          {blockers.length > 0 && !blocked && !submitted && (
            <div className="gate-row">
              <span className="spacer" />
              <button className="primary" onClick={markSubmitted}>Mark submitted to customer</button>
            </div>
          )}
          {blockers.length > 0 && !blocked && submitted && (
            <div className="gate-row"><span className="spacer" /><span className="pill won">Submitted</span></div>
          )}
        </div>
      )}

      {route !== 'Project' && (
        <div className="ai-notice" style={{ marginBottom: 10 }}>
          <b>{route} proposal route.</b> The printed document follows the{' '}
          {route.toLowerCase()} proposal template: a covering letter and one priced sheet,
          with no signal list, no rack layout and no project front matter. Optional annexes
          ({p.artifactSheets.filter(x => !['Cover Letter', 'Priced BoQ'].includes(x)).join(' · ')}) are
          issued only when ticked on the Document tab.
        </div>
      )}

      {route === 'Spares' && !linkedLead && (
        <div className="warnbox">No source lead is linked to this opportunity. The BoQ was not populated from another lead.</div>
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
            <div><b>Bid Stage:</b> <select value={p.bidStage} onChange={set('bidStage')}><option>Binding</option><option>Budgetary</option></select></div>
            <div><b>Bid Type:</b> <select value={p.bidType} onChange={set('bidType')}><option>Priced</option><option>Unpriced (Technical)</option></select></div>
            <div><b>Revision:</b> <select value={p.revision} onChange={set('revision')}>{['00','01','02','03','04'].map(r => <option key={r}>{r}</option>)}</select></div>
          </div>
          <div className="cover-meta">
            <div><b>{p.addressee}</b></div>
            <div>Kind Attn: <span className="cover-field"><input value={p.kindAttn} onChange={set('kindAttn')} /></span></div>
            <div>Mobile: {p.attnPhone}</div>
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
                  <td><button onClick={removeTerm(i)} title="Remove term">✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={addTerm} className="no-print">+ Add term</button>
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
        <DocEditor p={p} opp={opp} save={save} files={specFiles.map(f => f.name).filter(Boolean)}
          totals={totals} priced={priced} />
      )}

      {tab === 'Edit Sheet' && (
        <ProposalSheetEditor p={p} opp={opp} doc={doc} save={save} allParts={allParts} totals={totals} units={units} priced={priced}
          totalQty={totalQty} lineComputed={lineComputed} lineQuoted={lineQuoted} lineCost={lineCost}
          linePrice={linePrice} addBomLine={addBomLine} updLine={updLine} removeLine={removeLine}
          updTerm={updTerm} addTerm={addTerm} removeTerm={removeTerm} pasteBoq={pasteBoq} store={store}
          boqFileRef={boqFileRef} extractBoqFromPdf={extractBoqFromPdf} boqExtractBusy={boqExtractBusy} boqExtractError={boqExtractError} />
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
                <thead><tr><th>Module</th><th>Part Number</th><th>Qty</th></tr></thead>
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
          <div className="factors">
            <table>
              <thead><tr><th colSpan={2}>Imported Items Pricing &amp; Costing Factors</th></tr></thead>
              <tbody>
                <tr onClick={selCosting('O3', p.costing.baseRate, 'baseRate')}><td>Euro-₹ Base</td><td className="num"><input type="number" step="0.01" min="0" value={p.costing.baseRate} onChange={setCosting('baseRate')} /></td></tr>
                <tr onClick={selCosting('P3', p.costing.usdBase, 'usdBase')}><td>USD-₹ Base</td><td className="num"><input type="number" step="0.01" min="0" value={p.costing.usdBase} onChange={setCosting('usdBase')} /></td></tr>
                <tr onClick={selCosting('O4', p.costing.cdErvContPct === 16 ? '=8.5%+2.5%+5%' : p.costing.cdErvContPct, 'cdErvContPct', 'pct')}><td>CD+ERV+Cont.</td><td className="num"><input type="number" step="0.1" min="0" value={p.costing.cdErvContPct} onChange={setCosting('cdErvContPct')} />%</td></tr>
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

          <div className="toolbar">
            <PartPicker extractedItems={p.extractedItems} allParts={allParts} bom={p.bom} onSelect={addBomLine} />
            <span className="hint">Ad-hoc trader quotes captured in Price Lists appear here too (latest entry = reference price).</span>
          </div>

          <div className="sheet-wrap proposal-boq-sheet-wrap">
            <table className="sheet">
              <thead>
                <tr>
                  <th>Sl.</th><th>Item Category</th><th>Item/Scope Description</th><th>Proposed Model &amp; Part Number</th><th>Configurable Adders</th>
                  <th>Qty/Unit</th><th>Common</th><th>Spares</th><th>Total Qty</th><th>UOM</th>
                  <th>Unit Price ₹</th><th>Total Price ₹</th>
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
                      <td className="num"><input type="number" min="0" value={l.qtyPerUnit || ''} onChange={updLine(i, 'qtyPerUnit')} style={{ width: 52, textAlign: 'right' }} placeholder="-" /></td>
                      <td className="num"><input type="number" min="0" value={l.common || ''} onChange={updLine(i, 'common')} style={{ width: 52, textAlign: 'right' }} placeholder="-" /></td>
                      <td className="num"><input type="number" min="0" value={l.spares || ''} onChange={updLine(i, 'spares')} style={{ width: 52, textAlign: 'right' }} placeholder="-" /></td>
                      <td className="num"><b>{q}</b></td>
                      <td>{l.uom}</td>
                      <td className="num"><input type="number" min="0" value={l.quoted} onChange={updLine(i, 'quoted', false)} placeholder={fmt(Math.round(lineComputed(l)))} style={{ width: 90, textAlign: 'right' }} title="Customer-facing (target) price — blank = computed price" /></td>
                      <td className="num">₹ {fmt(lineQuoted(l) * q)}</td>
                      <td className="num internal">₹ {fmt(lineCost(l))}</td>
                      <td className="num internal">₹ {fmt(lineCost(l) * q)}</td>
                      <td className="num internal">₹ {fmt(Math.round(lineComputed(l)))}</td>
                      <td className="num internal">{l.currency === 'USD' ? '$' : l.currency === 'INR' ? '₹' : '€'} {fmt(linePrice(l))}</td>
                      <td><button onClick={removeLine(i)} title="Remove line">✕</button></td>
                    </tr>
                  )
                })}
                {!p.bom.length && <tr><td colSpan={17} className="hint">No lines yet — add parts from the price list above. Quantities work like the sheet: Total Qty = Qty/Unit × {units} units + Common + Spares.</td></tr>}
              </tbody>
              {p.bom.length > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={10}>Totals</td>
                    <td></td>
                    <td className="num">₹ {fmt(totals.target)}</td>
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

      {emailOpen && (
        <div className="modal form-card no-print">
          <div className="section-title"><Icon name="mail" size={15} /> Email proposal — {oppId}</div>
          <div className="q">
            <div className="q-label">From</div>
            <input type="text" value="Configured Gmail account" readOnly />
          </div>
          <div className="q">
            <div className="q-label">To</div>
            <input type="text" value={emailTo} onChange={e => setEmailTo(e.target.value)} placeholder="customer@company.com" autoFocus />
          </div>
          <div className="q">
            <div className="q-label">CC</div>
            <input type="text" value={emailCc} onChange={e => setEmailCc(e.target.value)} placeholder="name@company.com, another@company.com" />
          </div>
          <div className="q">
            <div className="q-label">Subject</div>
            <input type="text" value={emailSubject} onChange={e => setEmailSubject(e.target.value)} />
          </div>
          <div className="q">
            <div className="q-label">Message body</div>
            <textarea rows={11} value={emailBody} onChange={e => setEmailBody(e.target.value)} />
          </div>
          <div className="costing-note">
            The priced BoQ Excel is attached automatically. Add only the extra customer-facing files you want to send.
          </div>
          <div className="q">
            <div className="q-label">Additional attachments (optional)</div>
            <input type="file" accept=".pdf,.xlsx,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" multiple onChange={addEmailFiles} />
            <div className="hint">Up to four extra PDF or XLSX files. The priced BoQ is always included.</div>
            {!!emailAttachments.length && <div className="email-attachment-list">
              {emailAttachments.map((file, index) => <div key={`${file.name}-${file.size}`} className="email-attachment-row">
                <span>{file.name}</span>
                <button type="button" onClick={() => setEmailAttachments(current => current.filter((_, i) => i !== index))}>Remove</button>
              </div>)}
            </div>}
          </div>
          {emailError && <div className="errbox" style={{ marginTop: 8 }}>{emailError}</div>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setEmailPreview(!emailPreview)}>
              {emailPreview ? 'Hide proposal preview' : 'Preview proposal'}
            </button>
            <button type="button" onClick={() => { setEmailOpen(false); setPrinting(true) }}>
              <Icon name="printer" size={13} /> Save proposal PDF
            </button>
          </div>
          {emailPreview && (
            <div className="email-preview">
              <div className="hint" style={{ padding: '6px 0' }}>
                To {emailTo || '— no recipient —'}{emailCc.trim() ? ` · CC ${emailCc}` : ''} · Subject: {emailSubject}
              </div>
              <div className="email-preview-doc">
                <PrintDoc p={p} opp={opp} doc={doc} priced={priced} totals={totals} lineQuoted={lineQuoted} />
              </div>
            </div>
          )}
          <div className="forms-actions">
            <button className="primary" disabled={emailBusy || !emailTo.trim()} onClick={sendEmail}>
              <Icon name="send" size={13} /> {emailBusy ? 'Sending…' : `Send with ${1 + emailAttachments.length} attachment${emailAttachments.length ? 's' : ''}`}
            </button>
            <button onClick={() => setEmailOpen(false)}>Cancel</button>
          </div>
        </div>
      )}

      {previewOpen && (
        <Modal title={`Proposal preview — ${oppId}`} onClose={() => setPreviewOpen(false)} wide className="proposal-preview-modal">
          <div className="proposal-preview-toolbar">
            <span className="hint">Customer-facing document · Rev {p.revision} · Read-only preview</span>
            <div className="forms-actions">
              <button onClick={() => setPreviewOpen(false)}>Close</button>
              <button className="primary" onClick={() => { setPreviewOpen(false); setPrinting(true) }}>
                <Icon name="printer" size={13} /> Print / PDF proposal
              </button>
            </div>
          </div>
          <div className="proposal-preview-scroll">
            <PrintDoc p={p} opp={opp} doc={doc} priced={priced} totals={totals} lineQuoted={lineQuoted} />
          </div>
        </Modal>
      )}

      {referencePreviewOpen && (
        <Modal title={`Meggitt Item List — ${oppId}`} onClose={() => setReferencePreviewOpen(false)} wide className="proposal-preview-modal">
          <div className="proposal-preview-toolbar">
            <span className="hint">Editable source workbook · changes update the proposal BOQ immediately</span>
            <button onClick={() => setReferencePreviewOpen(false)}>Close</button>
          </div>
          {referenceLoading && <div className="hint">Loading Meggitt Item List.xlsx…</div>}
          {referenceError && <div className="errbox" role="alert">{referenceError}</div>}
          {!!referenceRows.length && <div className="proposal-preview-scroll reference-workbook-preview">
            <table className="sheet" style={{ minWidth: 940, tableLayout: 'fixed' }}>
              <colgroup><col style={{ width: 88 }} /><col style={{ width: 560 }} /><col style={{ width: 110 }} /><col style={{ width: 120 }} /><col style={{ width: 140 }} /></colgroup>
              <thead><tr><th>Sr. No</th><th>Item Description</th><th>Quantity</th><th>Unit Price</th><th>Total Price</th></tr></thead>
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
        <Modal title={`${route === 'Spares' ? 'Spares Firm Offer' : 'Service Proposal'} - ${oppId}`} onClose={() => setTemplatePreviewOpen(false)} wide className="proposal-preview-modal">
          <div className="proposal-preview-toolbar">
            <span className="hint">Editable Excel template - each tab is a worksheet - changes are saved to this proposal</span>
            <button onClick={() => setTemplatePreviewOpen(false)}>Close</button>
          </div>
          {!!proposalTemplateSheets.length && <nav className="template-workbook-page-nav template-workbook-page-nav-top" aria-label="Workbook pages">
            <button type="button" onClick={() => setActiveTemplateSheet(index => Math.max(0, index - 1))} disabled={activeTemplateSheet <= 0}>Previous page</button>
            <div className="template-workbook-page-tabs">
              {proposalTemplateSheets.map((sheet, index) => <button type="button" key={sheet.name} className={index === activeTemplateSheet ? 'active' : ''} onClick={() => { setEditingTemplateCell(null); setActiveTemplateSheet(index) }}>Page {index + 1} - {sheet.name.trim() || 'Sheet'}</button>)}
            </div>
            <button type="button" onClick={() => setActiveTemplateSheet(index => Math.min(proposalTemplateSheets.length - 1, index + 1))} disabled={activeTemplateSheet >= proposalTemplateSheets.length - 1}>Next page</button>
          </nav>}
          {templateLoading && <div className="hint">Loading proposal workbook...</div>}
          {templateError && <div className="errbox" role="alert">{templateError}</div>}
          {!!activeTemplateSheetData && <div className="proposal-preview-scroll template-workbook-preview">
            <section className={`template-workbook-page ${templatePageClass(activeTemplateSheetData, route)}`}>
              <div className="template-workbook-page-title">Page {activeTemplateSheet + 1} - {activeTemplateSheetData.name.trim() || 'Sheet'}</div>
              <div className="template-workbook-page-scroll">
                <table className="sheet template-workbook-table">
                  <colgroup>{(activeTemplateSheetData.widths || []).map((width, i) => <col key={i} style={{ width: `${Math.max(90, Number(width) || 110)}px` }} />)}</colgroup>
                  <tbody>{activeTemplateSheetData.rows.map((row, rowIndex) => <tr key={rowIndex} style={{ minHeight: activeTemplateSheetData.heights?.[rowIndex] || 24 }}>
                    {templateCellsForRow(activeTemplateSheetData, rowIndex).map(cell => {
                      const editing = editingTemplateCell
                        && editingTemplateCell.sheetName === activeTemplateSheetData.name
                        && editingTemplateCell.rowIndex === rowIndex
                        && editingTemplateCell.columnIndex === cell.columnIndex
                      return <td key={cell.columnIndex} rowSpan={cell.rowSpan} colSpan={cell.colSpan}
                        className={`${templateCellClass(activeTemplateSheetData, cell)}${editing ? ' is-editing' : ''}`}
                        tabIndex={editing ? -1 : 0}
                        onClick={() => { if (!editing) beginTemplateCellEdit(activeTemplateSheetData.name, rowIndex, cell.columnIndex, cell.value) }}
                        onDoubleClick={() => beginTemplateCellEdit(activeTemplateSheetData.name, rowIndex, cell.columnIndex, cell.value)}
                        onKeyDown={event => {
                          if (event.key === 'Enter' || event.key === 'F2') {
                            event.preventDefault()
                            beginTemplateCellEdit(activeTemplateSheetData.name, rowIndex, cell.columnIndex, cell.value)
                          }
                        }}>
                        {editing ? <textarea autoFocus className="template-cell-editor" aria-label={`${activeTemplateSheetData.name} row ${rowIndex + 1} column ${cell.columnIndex + 1}`} value={editingTemplateCell.value}
                          onChange={event => setEditingTemplateCell(current => ({ ...current, value: event.target.value }))}
                          onBlur={() => finishTemplateCellEdit()}
                          onKeyDown={event => {
                            if (event.key === 'Escape') { event.preventDefault(); finishTemplateCellEdit(true) }
                            if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); finishTemplateCellEdit() }
                          }} /> : <span className="template-cell-value">{cell.value || '\u00a0'}</span>}
                      </td>
                    })}
                  </tr>)}</tbody>
                </table>
              </div>
            </section>
          </div>}
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
