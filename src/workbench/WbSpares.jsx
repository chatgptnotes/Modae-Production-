import React, { useEffect, useMemo, useRef, useState } from 'react'
import { isPlaceholderSparesLine, useStore } from '../store.jsx'
import { defaultCosting } from '../seed.js'
import { canPriceProposal, clampCosting, unitCostINR, fmt, ddMmmYY } from '../utils.js'
import { pricingApprovalFor, pricingThresholdExceptions, sparesSourcingBlockers } from '../gates.js'
import { Chip, ConfChip, AiBadge, ConfirmModal, Modal } from '../ui.jsx'
import { Icon } from '../icons.jsx'
import { PRICE_SOURCES, formatPriceSource, isConfirmableSparesLine, isMissingSparesDescription, normalizeMarkupPct, reconcileCatalogueMatch, reconcilePriceSource, resolvePriceSource, sparesLineFinancials } from '../pricing.js'
import { convertCurrency, currencySymbol, normalizedCurrencyRates } from '../currency.js'
import { descriptionMatch, familyOf } from './sparesMatching.js'
import { isLegacyAutoSparesSupportRow, orderSparesLines, supportRowForDescription } from '../proposal/sparesBoq.js'
import { buildLeadProposalData } from '../leadBoq.js'
import { getSparesMatchEntry, requestSparesMatch } from './sparesMatchCache.js'

// requestSparesMatch delegates the same server contract as runJson('spares.match')
// and keeps compare results cached so opening the dialog never auto-applies a match.
// Confirmed rows use the compact badge: <Chip title="Sourcing line confirmed">OK</Chip>

const n = value => Number.isFinite(Number(value)) ? Number(value) : 0
const money = value => `₹ ${fmt(n(value))}`

const proposalSourcingRows = proposal => (proposal?.bom || [])
  .filter(line => !isPlaceholderSparesLine(line) && String(line?.desc || line?.itemCategory || line?.pn || '').trim())
  .map(line => {
    const qty = Number(line.common) > 0
      ? Number(line.common)
      : Number(line.qty) > 0
        ? Number(line.qty)
        : Math.max(0, Number(line.qtyPerUnit) || 0) * Math.max(1, Number(proposal.units) || 1)
    const listPrice = Number(line.listUnitPrice ?? line.listPrice) || 0
    return {
      origin: 'proposal',
      custRef: line.custRef || line.pn || line.desc || line.itemCategory,
      pn: line.pn || '',
      desc: line.desc || line.itemCategory || '',
      qty,
      uom: line.uom || 'EA',
      listPrice,
      listUnitPrice: listPrice,
      baseCost: Number(line.baseCost) || 0,
      currency: line.currency || 'INR',
      priceList: line.priceSourceName || line.priceList || 'Ad-hoc',
      priceSource: line.priceSource || 'manual',
      priceState: listPrice > 0 || Number(line.quoted) > 0 ? 'Current' : 'Needs pricing',
      confirmed: qty > 0 && (listPrice > 0 || Number(line.quoted) > 0),
    }
  })

// Keep numeric costing inputs canonical while preserving a usable editing
// state. In particular, 016 becomes 16, while 0.5 remains 0.5.
const normalizeNumericDraft = value => {
  const text = String(value ?? '')
  if (!text) return ''
  if (!/^\d*\.?\d*$/.test(text)) return text
  const [whole = '', fraction] = text.split('.')
  const normalizedWhole = whole.replace(/^0+(?=\d)/, '') || (whole ? '0' : '')
  return fraction === undefined ? normalizedWhole : `${normalizedWhole || '0'}.${fraction}`
}

function CostingNumberInput({ value, onChange, onBlur, ...props }) {
  const [draft, setDraft] = useState(() => normalizeNumericDraft(value))
  const focusedRef = useRef(false)

  useEffect(() => {
    if (!focusedRef.current) setDraft(normalizeNumericDraft(value))
  }, [value])

  const commit = raw => {
    const normalized = normalizeNumericDraft(raw)
    const numeric = normalized === '' ? 0 : Number(normalized)
    setDraft(normalized === '' ? '0' : normalized)
    onChange(numeric)
    onBlur?.(numeric)
  }

  return <input
    {...props}
    type="number"
    value={draft}
    onFocus={() => { focusedRef.current = true }}
    onChange={event => {
      const normalized = normalizeNumericDraft(event.target.value)
      setDraft(normalized)
      if (normalized !== '') onChange(Number(normalized))
    }}
    onBlur={() => {
      focusedRef.current = false
      commit(draft)
    }}
  />
}

const sourcingDescription = line => {
  const description = String(line?.desc || '').trim()
  if (description && !/^Customer-requested item\s+\d+(?:\.\d+)?$/i.test(description)) return description
  const reference = String(line?.custRef || line?.pn || '').trim()
  return /^\d+(?:\.\d+)?$/.test(reference) ? `Description missing · Customer reference ${reference}` : (reference || 'Unspecified part')
}

const sourcingPartReference = line => {
  const values = [line?.pn, line?.custRef]
    .map(value => String(value ?? '').trim())
    .filter(value => value && !/^na$/i.test(value) && !/^\d+(?:\.\d+)?$/.test(value))
  if (values[0]) return values[0]
  if (line?.sparesSupport) return '—'
  const description = String(line?.desc ?? '').trim()
  if (!description) return '—'
  const vmReference = description.match(/^(VM\d+\s+[A-Z0-9]+)/i)
  return vmReference?.[1] || description
}

function PricingApprovalCard({ approval, approvers, role, canRequest, onRequest, onDecide, onRefresh, refreshingApproval, pricingRows }) {
  const [decision, setDecision] = useState('Approved')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const needed = approval?.needed?.length ? approval.needed : [approval?.approver].filter(Boolean)
  const myDecision = approval && (approval.decisions || {})[role]
  const canDecide = approval?.status === 'Pending' && needed.includes(role) && !myDecision
  const status = approval?.status || 'Required'
  const statusClass = status === 'Approved' || status === 'Approved with conditions' ? 'okbox' : status === 'Rejected' ? 'errbox' : 'warnbox'

  const submitDecision = async event => {
    event.preventDefault()
    if (!note.trim()) {
      setError('Add a decision note before submitting.')
      return
    }
    setError('')
    const saved = await onDecide({ d: decision, comment: note.trim() })
    if (!saved) {
      setError('The decision could not be saved. Check your connection and try again.')
      return
    }
    setNote('')
  }

  return <div className={`sourcing-pricing-approval ${statusClass}`} role="status">
    <div className="sourcing-pricing-approval-header">
      <div><b>Pricing approval</b><span className="hint"> Approval from either {approvers.join(' or ')} is required before proposal.</span></div>
      <span className="sourcing-approval-status">{status === 'Required' ? 'Required' : status}</span>
    </div>
    {!approval && <div className="sourcing-approval-copy">The pricing threshold exception must be reviewed before this opportunity can continue.</div>}
    {approval && <div className="sourcing-approval-copy">Requested by <b>{approval.requestedBy || 'user'}</b>{approval.ts ? ` · ${ddMmmYY(approval.ts.slice(0, 10))}` : ''}{approval.status === 'Pending' && !myDecision ? ` · awaiting ${needed.filter(r => !(approval.decisions || {})[r]).join(' or ')}` : ''}</div>}
    {!!pricingRows?.length && <div className="sourcing-approval-reason">
      <div><b>Why approval is required:</b> the requested pricing is outside the configured commercial limit. One approval from {approvers.join(' or ')} is required before the proposal can continue.</div>
      <div className="sourcing-approval-summary">
        <span><b>Affected lines</b> {pricingRows.length}</span>
        {pricingRows.some(row => row.discount > row.discountPct) && <span><b>Discount exceptions</b> {pricingRows.filter(row => row.discount > row.discountPct).length}</span>}
        {pricingRows.some(row => row.markup > row.markupPct) && <span><b>Markup exceptions</b> {pricingRows.filter(row => row.markup > row.markupPct).length}</span>}
        {pricingRows.some(row => row.listTotalINR > 0) && <span><b>Total list value</b> {money(pricingRows.reduce((sum, row) => sum + (n(row.listTotalINR)), 0))}</span>}
        {pricingRows.some(row => row.discountAmountINR > 0) && <span><b>Total discount impact</b> {money(pricingRows.reduce((sum, row) => sum + (n(row.discountAmountINR)), 0))}</span>}
      </div>
      <div className="sourcing-approval-reason-rows">{pricingRows.map((row, index) => <div key={`${row.label}-${index}`}><b>{row.label}</b>{row.discount > row.discountPct && <span>Discount {row.discount}% <small>(allowed {row.discountPct}%, exceeds by {row.discountExcessPct} points)</small></span>}{row.markup > row.markupPct && <span>Markup {row.markup}% <small>(allowed {row.markupPct}%, exceeds by {row.markupExcessPct} points)</small></span>}{row.quantity > 0 && <span>Qty {row.quantity}</span>}{row.discountAmountINR > 0 && <span>Impact {money(row.discountAmountINR)}</span>}</div>)}</div>
    </div>}
    {approval?.status === 'Rejected' && approval.decisionNote && <div className="sourcing-approval-copy">Decision note: {approval.decisionNote}</div>}
    {approval && myDecision && <div className="sourcing-approval-copy">Your decision: <b>{myDecision.d}</b>{myDecision.c ? ` — ${myDecision.c}` : ''}</div>}
    {canRequest && <button type="button" className="sourcing-approval-action" onClick={onRequest}><Icon name="clipboardCheck" size={13} /> Request approval</button>}
    {approval?.status === 'Pending' && <button type="button" className="sourcing-approval-action" disabled={refreshingApproval} onClick={onRefresh}><Icon name="refresh" size={13} /> {refreshingApproval ? 'Refreshing approval…' : 'Refresh approval status'}</button>}
    {canDecide && <form className="sourcing-approval-form" onSubmit={submitDecision}>
      <label>Decision note <textarea value={note} onChange={event => setNote(event.target.value)} placeholder="Explain the pricing decision" rows="2" /></label>
      <div className="sourcing-approval-decision-row">
        <select value={decision} onChange={event => setDecision(event.target.value)} aria-label="Pricing approval decision">
          <option>Approved</option><option>Rejected</option>
        </select>
        <button type="submit" className="sourcing-approval-action"><Icon name="check" size={13} /> Submit decision</button>
      </div>
      {error && <div className="sourcing-approval-error">{error}</div>}
    </form>}
  </div>
}

export default function WbSpares({ opp, openBuilder, onContinue }) {
  const store = useStore()
  const comm = canPriceProposal(store.role)
  const sourcingDataStatus = store.sourcingDataStatus || 'ready'
  const lines = useMemo(() => store.sparesLines.filter(l => l.oppId === opp.id && !isPlaceholderSparesLine(l) && !isLegacyAutoSparesSupportRow(l)), [store.sparesLines, opp.id])
  const proposal = store.getProposal(opp.id)
  const [compareFor, setCompareFor] = useState(null)
  const [compareSearch, setCompareSearch] = useState('')
  const [aiSuggestions, setAiSuggestions] = useState([])
  const [compareAiBusy, setCompareAiBusy] = useState(false)
  const [compareAiError, setCompareAiError] = useState('')
  const [evidence, setEvidence] = useState(null)
  const [pricePreview, setPricePreview] = useState(null)
  const [sent, setSent] = useState(false)
  const [showAddPart, setShowAddPart] = useState(false)
  const [manualLineError, setManualLineError] = useState('')
  const [newLine, setNewLine] = useState({ pn: '', desc: '', qty: '1', listPrice: '' })
  const [pendingRemove, setPendingRemove] = useState(null)
  const [refreshingApproval, setRefreshingApproval] = useState(false)
  const sourcingSheetWrapRef = useRef(null)
  const compareRequestRef = useRef(0)
  const dedupedOppRef = useRef('')
  const reconciledOppRef = useRef('')
  useEffect(() => {
    if (sourcingDataStatus !== 'ready') return
    if (reconciledOppRef.current === opp.id) return
    const linkedLead = [...(store.leads || []), ...(store.leadArchive || [])]
      .find(lead => lead.id === opp.sourceLeadId || lead.oppId === opp.id)
    if (!linkedLead) return
    reconciledOppRef.current = opp.id
    const { workbenchRows } = buildLeadProposalData(linkedLead, store.priceLists, store.adhocParts)
    if (workbenchRows.length) {
      store.addSparesLinesFromLead(opp.id, workbenchRows, { auditAction: 'Sourcing lines restored from lead' })
    }
  }, [sourcingDataStatus, opp.id, opp.sourceLeadId, store.leads, store.leadArchive, store.priceLists, store.adhocParts])
  useEffect(() => {
    if (sourcingDataStatus !== 'ready' || lines.length || !proposal?.bom?.length) return
    const rows = proposalSourcingRows(proposal)
    if (rows.length) store.addSparesLinesFromLead(opp.id, rows, { auditAction: 'Sourcing lines restored from proposal' })
  }, [sourcingDataStatus, opp.id, lines.length, proposal])
  useEffect(() => {
    if (sourcingDataStatus !== 'ready') return
    if (!comm || dedupedOppRef.current === opp.id || !lines.length) return
    dedupedOppRef.current = opp.id
    store.dedupeSparesLines(opp.id)
  }, [sourcingDataStatus, comm, opp.id, lines.length])
  useEffect(() => {
    if (sourcingDataStatus !== 'ready') return
    lines.forEach(line => {
      const reconciled = reconcileCatalogueMatch(line, store.priceLists)
      const changed = Object.keys(reconciled).some(key => reconciled[key] !== line[key])
      if (changed) store.updateSparesLine(line.id, reconciled)
    })
  }, [sourcingDataStatus, lines, store.priceLists])
  useEffect(() => {
    if (sourcingDataStatus !== 'ready') return
    // Existing opportunities may have been created before extraction learned
    // to keep a customer reference separate from its description. Reconcile
    // only blocked rows, using the matching source lead, and never overwrite
    // prices or confirmation decisions made in Sourcing.
    const linkedLead = [...(store.leads || []), ...(store.leadArchive || [])]
      .find(lead => lead.id === opp.sourceLeadId)
    if (!linkedLead || !lines.some(isMissingSparesDescription)) return
    const { workbenchRows } = buildLeadProposalData(linkedLead, store.priceLists, store.adhocParts)
    lines.filter(isMissingSparesDescription).forEach(line => {
      const currentRef = String(line.custRef || '').trim().toLowerCase()
      const currentPn = String(line.pn || '').trim().toLowerCase()
      const candidate = workbenchRows.find(row => {
        const rowRef = String(row.custRef || '').trim().toLowerCase()
        const rowPn = String(row.pn || '').trim().toLowerCase()
        return row.desc && ((currentRef && rowRef === currentRef) || (currentPn && rowPn === currentPn))
      })
      if (candidate?.desc && !isMissingSparesDescription(candidate)) {
        store.updateSparesLine(line.id, {
          desc: candidate.desc,
          missingDescription: false,
          evidence: candidate.evidence || line.evidence,
        })
      }
    })
  }, [sourcingDataStatus, opp.id, opp.sourceLeadId, lines, store.leads, store.leadArchive, store.priceLists, store.adhocParts])
  useEffect(() => {
    if (sourcingDataStatus !== 'ready') return
    store.dedupeSparesLines?.(opp.id)
    store.ensureSparesSupportLines?.(opp.id)
  }, [sourcingDataStatus, opp.id, store.sparesLines.length])
  const quoteValidityDays = Math.max(1, n(store.config?.proposalValidityDays ?? 30))
  const currencyRates = normalizedCurrencyRates(store.config?.currencyRates)
  const displayCurrencies = ['INR', ...Object.keys(currencyRates).filter(currency => currency !== 'INR')]
  const [displayCurrency, setDisplayCurrency] = useState('INR')
  const costingDefaults = store.config?.costingDefaults || {}
  const hasSplitCosting = ['customsDutyPct', 'ervPct', 'handlingPct'].some(key => proposal.costing?.[key] != null)
  const legacyImportFactor = proposal.costing?.cdErvHandlingPct ?? proposal.costing?.cdErvContPct
  const costing = {
    ...defaultCosting,
    ...costingDefaults,
    ...(proposal.costing || {}),
    customsDutyPct: proposal.costing?.customsDutyPct ?? (!hasSplitCosting && legacyImportFactor != null ? legacyImportFactor : costingDefaults.customsDutyPct ?? 8.5),
    ervPct: proposal.costing?.ervPct ?? (!hasSplitCosting && legacyImportFactor != null ? 0 : costingDefaults.ervPct ?? 2.5),
    handlingPct: proposal.costing?.handlingPct ?? (!hasSplitCosting && legacyImportFactor != null ? 0 : costingDefaults.handlingPct ?? 5),
    cdErvHandlingPct: proposal.costing?.cdErvHandlingPct ?? proposal.costing?.cdErvContPct ?? costingDefaults.cdErvHandlingPct ?? defaultCosting.cdErvContPct,
    currencyRates: normalizedCurrencyRates(proposal.costing?.currencyRates || currencyRates),
  }
  // Keep recalculation tied to the actual costing inputs rather than relying
  // only on the proposal object identity. This makes every valid keystroke
  // flow through the row and summary calculations immediately.
  const costingSignature = JSON.stringify({
    baseRate: costing.baseRate,
    usdBase: costing.usdBase,
    customsDutyPct: costing.customsDutyPct,
    ervPct: costing.ervPct,
    handlingPct: costing.handlingPct,
    cdErvHandlingPct: costing.cdErvHandlingPct,
    cdErvContPct: costing.cdErvContPct,
    bnkDiscPct: costing.bnkDiscPct,
    currencyRates: costing.currencyRates,
  })
  const handlingMin = n(costingDefaults.cdErvHandlingMinPct ?? 15)
  const handlingMax = n(costingDefaults.cdErvHandlingMaxPct ?? 20)
  const importFactorPct = costing.customsDutyPct + costing.ervPct + costing.handlingPct
  const handlingOutOfRange = importFactorPct < handlingMin || importFactorPct > handlingMax
  const displayAmount = value => convertCurrency(value, 'INR', displayCurrency, costing.currencyRates)
  // INR is shown as whole rupees; foreign currencies retain two decimals so a
  // small converted price such as ₹23 is visible as €0.21 rather than 0.
  const displayValue = value => Math.max(0, n(displayAmount(value)))
  const displayDigits = displayCurrency === 'INR' ? 0 : 2
  const displayMoney = value => `${currencySymbol(displayCurrency)} ${fmt(displayValue(value), displayDigits)} `
  const updateCosting = (field, value) => {
    if (!comm) return
    if (field === 'currencyRates') {
      store.updateProposalCosting(opp.id, { currencyRates: normalizedCurrencyRates(value) })
      return
    }
    const next = clampCosting(field, value)
    store.updateProposalCosting(opp.id, { [field]: next })
  }

  const values = line => {
    const row = sparesLineFinancials(line, costing)
    return {
      ...row,
      adjustedUnitPrice: row.adjustedUnitPriceINR,
      baseCost: row.baseCostINR,
      listUnitPriceINR: row.listUnitPriceINR,
      listTotal: row.listTotalINR,
      lineTotal: row.lineTotalINR,
      cogs: row.cogsINR,
    }
  }
  // Adapt persisted sourcing rows to the calculation schema, then derive every
  // monetary value from the current inputs. Store updates trigger this memo to
  // recalculate immediately without duplicating business values in local state.
  const lineItems = useMemo(() => lines.map(line => {
    const row = values(line)
    return {
      id: line.id,
      partNo: line.pn || line.custRef || '',
      description: sourcingDescription(line),
      qty: row.qty,
      listUnitPrice: row.listUnitPrice,
      listUnitPriceINR: row.listUnitPriceINR,
      discountPercent: row.discountPct,
      markupPercent: row.markupPct,
      baseCost: row.baseCost,
      landedUnitCost: row.landedUnitCostINR,
      listTotal: row.listTotal,
      landedTotal: row.landedTotalINR,
      adjustedUnitPrice: row.adjustedUnitPrice,
      lineTotal: row.lineTotal,
      lineTotalCogs: row.cogs,
      confirmed: !!line.confirmed,
      sourceLine: line,
    }
  }), [lines, proposal, costingSignature])
  const orderedLineItems = useMemo(() => orderSparesLines(lineItems, item => item.sourceLine), [lineItems])
  const calculatedItems = useMemo(() => orderedLineItems.map(item => {
    return { ...item, lineProfit: item.lineTotal - item.lineTotalCogs }
  }), [orderedLineItems])
  const activeSourceLines = lines.filter(line => line.qty > 0 && !line.removedFromSourcing && !isPlaceholderSparesLine(line))
  const pricedItems = calculatedItems.filter(item => item.qty > 0 && item.listUnitPrice > 0)
  const activeItems = calculatedItems.filter(item => item.qty > 0 && item.confirmed)
  const eligibleActiveItems = activeItems.filter(item => !isMissingSparesDescription(item.sourceLine))
  const missingDescriptionLines = activeSourceLines.filter(isMissingSparesDescription)
  const pendingConfirmationCount = activeSourceLines.filter(line => !line.confirmed).length
  const needsPricingLines = activeSourceLines.filter(line => line.priceState === 'Needs pricing' || !(Number(line.listUnitPrice ?? line.listPrice) > 0))
  const expiredLines = activeSourceLines.filter(line => line.priceState === 'Expired')
  const pricingExceptions = pricingThresholdExceptions(opp, proposal, store)
  const pricingApprovers = store.config?.approvalThresholds?.pricingApprovers?.filter(Boolean)?.length
    ? store.config.approvalThresholds.pricingApprovers.filter(Boolean)
    : ['AH', 'LJS']
  const pricingApproval = pricingExceptions.rows.length
    ? pricingApprovalFor(opp, proposal, store.approvals || [], pricingExceptions.rows)
    : null
  const pricingApprovalClear = !pricingExceptions.rows.length || pricingApproval?.status === 'Approved'
  const sourceBlockers = sparesSourcingBlockers(opp, proposal, store)
  const canContinueToProposal = sourceBlockers.length === 0
    && activeSourceLines.length > 0
    && missingDescriptionLines.length === 0
    && pendingConfirmationCount === 0
    && needsPricingLines.length === 0
    && expiredLines.length === 0
    && pricedItems.length === activeSourceLines.length
    && eligibleActiveItems.length === activeSourceLines.length
    && pricingApprovalClear
  const totals = useMemo(() => pricedItems.reduce((total, item) => ({
    revenue: total.revenue + item.lineTotal,
    cogs: total.cogs + item.lineTotalCogs,
    originalTotal: total.originalTotal + item.listTotal,
    quantity: total.quantity + item.qty,
  }), { revenue: 0, cogs: 0, originalTotal: 0, quantity: 0 }), [pricedItems])
  const grossProfit = totals.revenue - totals.cogs
  const grossMarginPct = totals.revenue > 0 ? grossProfit / totals.revenue * 100 : 0
  const importedLineCount = lines.filter(line => String(line.currency || 'INR').toUpperCase() !== 'INR').length
  const domesticLineCount = lines.length - importedLineCount
  const proposalOnlyMismatch = !lines.length && (proposal.bom || []).length > 0
  const clarifications = (store.clarifications || []).filter(c => c.oppId === opp.id && c.status === 'Answered')

  const requestPricingApproval = () => store.requestApproval({
    oppId: opp.id,
    type: 'Pricing threshold exception',
    rev: String(proposal?.revision ?? ''),
    approver: pricingApprovers[0],
    needed: pricingApprovers,
    anyOf: pricingApprovers.length > 1,
    detail: `Pricing threshold exception: discount above ${pricingExceptions.discountPct}% or markup above ${pricingExceptions.markupPct}%`,
    pricingRows: pricingExceptions.rows,
  })
  const removeLine = line => {
    setPendingRemove(line)
  }
  const confirmRemoveLine = line => {
    const removedLine = { ...line, qty: 0, removedFromSourcing: true, confirmed: false }
    const remainingPricing = pricingThresholdExceptions(opp, proposal, {
      ...store,
      sparesLines: store.sparesLines.map(item => item.id === line.id ? removedLine : item),
    })
    store.updateSparesLine(line.id, {
      qty: 0,
      removedQty: Math.max(1, n(line.qty)),
      removedFromSourcing: true,
      confirmed: false,
    })
    if (!remainingPricing.rows.length && pricingApproval?.status === 'Pending') {
      store.cancelApproval(pricingApproval.id, 'Cancelled automatically: the pricing-exception line was removed from Sourcing.')
    }
    setPendingRemove(null)
  }
  const restoreLine = line => store.updateSparesLine(line.id, {
    qty: Math.max(1, n(line.removedQty)),
    removedFromSourcing: false,
    confirmed: false,
    markupPct: normalizeMarkupPct(line.markupPct),
  })
  const continueTitle = !canContinueToProposal
    ? (pricingExceptions.rows.length && !pricingApprovalClear
      ? (pricingApproval?.status === 'Pending' ? `Awaiting pricing approval from ${pricingApprovers.join(' or ')}` : `Request pricing approval from ${pricingApprovers.join(' or ')}`)
      : sourceBlockers.some(item => item.key.startsWith('sp-qty-')) ? 'Enter a positive quantity for every sourcing line first'
      : missingDescriptionLines.length ? `Add descriptions to ${missingDescriptionLines.length} sourcing line${missingDescriptionLines.length === 1 ? '' : 's'} first`
      : pendingConfirmationCount ? `Confirm ${pendingConfirmationCount} remaining sourcing line${pendingConfirmationCount === 1 ? '' : 's'} first`
      : expiredLines.length ? `Refresh ${expiredLines.length} expired price source${expiredLines.length === 1 ? '' : 's'} first`
      : needsPricingLines.length ? `Price ${needsPricingLines.length} sourcing line${needsPricingLines.length === 1 ? '' : 's'} first`
      : 'Add and complete at least one sourcing line first')
    : ''

  const updateLine = (line, field, value) => {
    if (!comm) return
    const patch = { [field]: value }
    if (field === 'listUnitPrice') {
      const addedAt = new Date().toISOString()
      const addedBy = store.auth?.user?.name || store.auth?.user?.email || store.role
      patch.listPrice = value
      // Manual values are entered in the INR-denominated table. Rebuild the
      // cost basis as INR too, rather than retaining the old EUR/USD/BNK cost
      // from the previous source row.
      patch.currency = 'INR'
      patch.baseCost = unitCostINR(value, { ...defaultCosting, ...(proposal.costing || {}) }, 'INR', false)
      patch.priceSource = 'manual'
      patch.priceSourceName = 'Manual pricing'
      patch.priceList = 'Manual pricing'
      patch.priceState = 'Current'
      patch.addedBy = addedBy
      patch.addedByName = addedBy
      patch.addedAt = addedAt
      patch.priceSourceDate = addedAt.slice(0, 10)
      // A positive manual amount is already a completed sourcing decision.
      // Keep the explicit Confirm action for price-list/vendor matches, but
      // do not make users confirm the same manual entry a second time.
      patch.confirmed = isConfirmableSparesLine({ ...line, ...patch })
    }
    store.updateSparesLine(line.id, patch)
  }

  const addManual = () => {
    if (!newLine.pn.trim() && !newLine.desc.trim()) {
      setManualLineError('Enter a part number or description.')
      return
    }
    const price = Math.max(0, n(newLine.listPrice))
    const quantity = Math.max(0, n(newLine.qty))
    const addedAt = new Date().toISOString()
    const addedBy = store.auth?.user?.name || store.auth?.user?.email || store.role
    const supportRow = supportRowForDescription(newLine.desc)
    store.addSparesLine(opp.id, { origin: 'manual', custRef: newLine.pn.trim() || newLine.desc.trim(), pn: newLine.pn.trim(), desc: newLine.desc.trim(), qty: quantity, confirmed: quantity > 0 && price > 0, listPrice: price, listUnitPrice: price, baseCost: price, currency: 'INR', priceList: 'Manual pricing', priceSource: 'manual', priceState: price > 0 ? 'Current' : 'Needs pricing', priceSourceDate: addedAt.slice(0, 10), oem: 'Manual', leadTime: '', addedBy, addedByName: addedBy, addedAt, ...(supportRow ? { sparesSupport: true, supportAddedManually: true, pn: newLine.pn.trim() || supportRow.pn, desc: supportRow.desc } : {}) })
    setNewLine({ pn: '', desc: '', qty: '1', listPrice: '' })
    setManualLineError('')
  }
  const openManualLine = () => {
    setNewLine({ pn: '', desc: '', qty: '1', listPrice: '' })
    setManualLineError('')
    setShowAddPart(true)
  }
  // Vendor/manufacturer quotations remain historical data, but are no longer
  // an active sourcing path. Current sourcing uses approved price lists or an
  // explicitly entered manual price.
  const sourceDetails = line => formatPriceSource(reconcilePriceSource(line, store.priceLists, []))
  const manualAttribution = line => {
    if (line.addedByName || line.addedBy || line.addedAt) return line
    const audit = (store.audit || []).find(entry => entry.action === 'Spares line updated'
      && entry.objectId === line.oppId
      && String(entry.detail || '').includes(line.id)
      && /listUnitPrice|listPrice/.test(entry.detail || ''))
    return audit ? { addedBy: audit.role || '', addedAt: audit.ts || '' } : {}
  }
  const priceListNameFor = line => {
    const sourceName = String(line.priceSourceName || '').trim()
    const sourceLabel = String(line.priceList || '').trim()
    return Object.keys(store.priceLists || {}).find(name =>
      name === sourceName || name === sourceLabel || sourceLabel.startsWith(`${name} `)) || sourceName
  }
  const openPriceList = line => {
    // The preview must follow the row that was clicked. Do not use a source
    // reference or a previously selected part as a fallback here: those can
    // belong to a different line in older persisted sourcing data.
    const part = String(line.pn || line.custRef || '').trim()
    const list = priceListNameFor(line)
    if (!part || !list) return
    const priceList = store.priceLists?.[list]
    const requestedVersion = String(line.priceSourceVersion || '').trim()
    const version = requestedVersion
      ? priceList?.versions?.find(item => item.version === requestedVersion)
      : null
    const displayList = requestedVersion ? version : priceList
    const normalizedPart = part.toUpperCase()
    const priceListPartIndex = displayList?.parts?.findIndex(item =>
      String(item.pn || '').trim().toUpperCase() === normalizedPart) ?? -1
    const priceListPart = priceListPartIndex >= 0 ? displayList.parts[priceListPartIndex] : null
    setPricePreview({
      part,
      list,
      version: displayList?.version || requestedVersion,
      uploaded: displayList?.uploaded || priceList?.uploaded || '',
      currency: String(displayList?.currency || line.currency || 'INR').trim().toUpperCase(),
      price: priceListPart?.price,
      partNumber: priceListPart?.pn || part,
      srNo: priceListPartIndex >= 0 ? priceListPartIndex + 1 : null,
      description: priceListPart?.desc || '',
      adders: priceListPart?.adders || [],
      found: !!priceList && (!requestedVersion || !!version) && !!priceListPart,
    })
  }
  // Where an alternative's price would come from if selected — mirrors the same
  // price-list → vendor-quote → manual precedence used for confirmed lines.
  const altSourceInfo = alt => {
    const resolved = resolvePriceSource({ pn: alt.pn }, store.priceLists, [], [])
    if (resolved?.source === PRICE_SOURCES.LIST) return { tone: '', label: `Price list · ${resolved.sourceName} ${resolved.sourceVersion}`.trim() }
    return { tone: 'grey', label: 'Manual — no priced match yet' }
  }

  const allPriceListParts = () => Object.entries(store.priceLists || {})
    .flatMap(([name, pl]) => (pl.parts || []).map(part => ({ ...part, list: name, version: pl.version, currency: pl.currency })))
  // Lists are quoted in their own currency (BNK in EUR, Metrics in USD), so the
  // suggestion has to name it rather than assume rupees.
  const listPriceLabel = part => `${part.list} ${part.version} price list · ${part.currency || ''} ${fmt(part.price)}`.replace(/\s+/g, ' ')
  const searchPriceListParts = (line, query) => {
    const q = String(query || '').trim().toLowerCase()
    if (!q) return []
    return allPriceListParts()
      .filter(part => part.pn !== line.pn && (part.pn.toLowerCase().includes(q) || String(part.desc || '').toLowerCase().includes(q)))
      .slice(0, 20)
      .map(part => ({
        forPn: line.pn, pn: part.pn, desc: part.desc, conf: null,
        note: listPriceLabel(part),
        priceState: 'Current',
      }))
  }
  const priceListAlternatives = line => {
    const allParts = allPriceListParts()
    const family = familyOf(line.pn)
    const toAlt = (part, conf, note, reason) => ({
      forPn: line.pn, pn: part.pn, desc: part.desc, conf,
      note: note || listPriceLabel(part), reason,
      priceState: 'Current',
    })
    const results = []
    // Exact part-number match — same part sitting in the current price list,
    // offered so a manually-priced line can be refreshed to the list price.
    const exact = allParts.find(part => part.pn === line.pn)
    if (exact) results.push(toAlt(exact, 100, `Same part in ${exact.list} ${exact.version} — refresh to list price ${exact.currency || ''} ${fmt(exact.price)}`.replace(/\s+/g, ' '), 'The part number is an exact match in the current approved price list.'))
    // Description overlap — specific technical terms can create a
    // recommendation; generic nouns such as "card" cannot.
    allParts.filter(part => part.pn !== line.pn).forEach(part => {
      const match = descriptionMatch(line.desc, part.desc)
      if (match) {
        results.push(toAlt(part, match.confidence, undefined,
          `The description matches on specific terms: ${match.words.join(', ')}.`))
      }
    })
    // Same part-number family (e.g. "DS821.*") — related accessories/variants worth reviewing.
    if (family) {
      allParts.filter(part => part.pn !== line.pn && familyOf(part.pn) === family
        && !results.some(r => r.pn === part.pn)).forEach(part => results.push(toAlt(part, 55, undefined,
        `The part number shares the ${family} family with the requested line.`)))
    }
    const seen = new Set()
    return results.filter(a => (seen.has(a.pn) ? false : (seen.add(a.pn), true))).slice(0, 6)
  }
  const loadAiSuggestions = async line => {
    const byPartNumber = new Map()
    const requestId = ++compareRequestRef.current
    setCompareAiError('')
    const cached = getSparesMatchEntry(opp.id, line, store.priceLists)
    if (cached?.status === 'ready') {
      setAiSuggestions(cached.suggestions || [])
      setCompareAiBusy(false)
      return
    }
    setCompareAiBusy(true)
    const result = await requestSparesMatch({
      oppId: opp.id,
      line: {
        ...line,
        manufacturer: opp.product || opp.manufacturer || line.oem || '',
      },
      priceLists: store.priceLists,
      model: store.config?.aiModel?.model,
      fallback: store.config?.aiModel?.provider === 'Built-in fallback',
    })
    byPartNumber.set(line.pn, result)
    if (requestId !== compareRequestRef.current) return
    setAiSuggestions(result.suggestions || [])
    if (result.status === 'error') setCompareAiError(result.error)
    setCompareAiBusy(false)
  }
  const openCompare = line => {
    setCompareFor(line.id)
    setCompareSearch('')
    loadAiSuggestions(line)
  }
  const useAlternative = (line, alt) => {
    const resolved = resolvePriceSource({ pn: alt.pn }, store.priceLists, [], [])
    const isDifferentPart = String(alt.pn || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
      !== String(line.custRef || line.pn || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
    const priced = resolved && resolved.price > 0 ? {
      listPrice: resolved.price, listUnitPrice: resolved.price, currency: resolved.currency,
      priceList: `${resolved.sourceName} ${resolved.sourceVersion}`.trim(),
      priceSource: resolved.source, priceSourceName: resolved.sourceName, priceSourceVersion: resolved.sourceVersion,
    } : null
    const nextLine = { ...line, pn: alt.pn, desc: alt.desc, ...(priced || {}), priceState: priced ? (alt.priceState || 'Current') : 'Needs pricing' }
    store.updateSparesLine(line.id, {
      pn: alt.pn,
      desc: alt.desc,
      confirmed: isDifferentPart ? false : isConfirmableSparesLine(nextLine),
      match: isDifferentPart ? 'Suggested price-list match' : 'Exact',
      priceSourceSuggested: isDifferentPart,
      priceSourceSuggestedPart: isDifferentPart ? alt.pn : '',
      priceSourceSuggestedDescription: isDifferentPart ? alt.desc : '',
      priceSourceSuggestedList: isDifferentPart ? (alt.priceList || resolved?.sourceName || '') : '',
      priceSourceSuggestedVersion: isDifferentPart ? (alt.priceListVersion || resolved?.sourceVersion || '') : '',
      ...(priced || {}),
      priceState: nextLine.priceState,
    })
    setCompareFor(null)
    setCompareSearch('')
  }
  const sendToProposal = () => {
    if (!canContinueToProposal) return
    store.sendLinesToProposal(opp.id)
    setSent(true)
    onContinue?.()
  }

  return <div className="sourcing-workbench">
    {pendingRemove && <ConfirmModal title="Remove sourcing line" tone="danger"
      message={`Remove ${sourcingDescription(pendingRemove)} from this BOQ?`}
      confirmLabel="Remove line" onClose={() => setPendingRemove(null)}
      onConfirm={() => confirmRemoveLine(pendingRemove)} />}
    <div className="section-title">Bill of Quantities (BOQ) — Spares sourcing ({lines.length} line{lines.length === 1 ? '' : 's'})</div>
    {!canContinueToProposal && <div className="warnbox sourcing-handoff-warning"><b>Complete Sourcing before Proposal.</b> {continueTitle} The next page remains locked until every active line is described, priced, matched, and confirmed here.</div>}
    {clarifications.length > 0 && <details className="okbox customer-information-banner sourcing-clarification-context">
      <summary><b>Confirmed customer information</b><span className="hint"> These answers stay attached to the opportunity and should be checked while validating each line.</span></summary>
      <div className="sourcing-clarification-content">{clarifications.map(c => <div key={c.id} className="sourcing-clarification-row"><b>{c.category || 'Clarification'}:</b> {c.response}<span className="hint"> · {c.answerSource || 'Customer'}{c.answeredAt ? ` · ${c.answeredAt}` : ''}</span></div>)}</div>
    </details>}
    {!!expiredLines.length && <div className="warnbox spares-price-warning"><b>{expiredLines.length} price source{expiredLines.length === 1 ? '' : 's'} expired.</b>{' '}Use <b>Compare</b> in the Actions column to select a current approved price-list part, or enter a manual price. <button type="button" onClick={() => openCompare(lines.find(line => line.priceState === 'Expired') || lines[0])}>Request price update</button></div>}
    {!!needsPricingLines.length && <div className="warnbox spares-price-warning"><b>{needsPricingLines.length} line{needsPricingLines.length === 1 ? '' : 's'} need pricing.</b>{' '}Use <b>Compare</b> to select a current approved price-list part or enter a manual price before continuing.</div>}
    {!!missingDescriptionLines.length && <div className="warnbox spares-price-warning"><b>{missingDescriptionLines.length} line{missingDescriptionLines.length === 1 ? '' : 's'} need{missingDescriptionLines.length === 1 ? 's' : ''} a description.</b>{' '}The customer reference alone is not enough to send this line to Proposal.</div>}
    {sourcingDataStatus === 'loading' && <p className="hint" role="status">Loading saved sourcing lines…</p>}
    {sourcingDataStatus === 'error' && <div className="errbox">Sourcing data could not be loaded. <button type="button" onClick={() => store.refreshSharedData()}>Retry</button></div>}
    {sourcingDataStatus === 'ready' && <>
    {!!pricingExceptions.rows.length && <PricingApprovalCard approval={pricingApproval} approvers={pricingApprovers} role={store.role} pricingRows={pricingExceptions.rows} canRequest={(comm || pricingApprovers.includes(store.role)) && (!pricingApproval || pricingApproval.status === 'Rejected')} onRequest={requestPricingApproval} onDecide={decision => pricingApproval && store.recordDecision(pricingApproval.id, decision)} onRefresh={async () => { setRefreshingApproval(true); try { await store.refreshSharedData() } finally { setRefreshingApproval(false) } }} refreshingApproval={refreshingApproval} />}
    {proposalOnlyMismatch && <div className="warnbox sourcing-flow-warning"><b>Proposal data is not linked to Sourcing.</b> Existing proposal rows are not imported automatically. Add or import the real parts here before continuing to Proposal.</div>}
    <div className="sourcing-table-card">
      <div className="sourcing-table-heading"><div><b>BOQ lines — review quantity, price source, and totals</b><span className="hint"> Each line shows whether the price came from an approved price list, supplier quotation, or manual pricing.</span></div><div className="sourcing-table-heading-actions"><span className="sourcing-currency-indicator" title={`All displayed amounts are in ${displayCurrency}`}>Currency: {displayCurrency} ({currencySymbol(displayCurrency)})</span>{comm && <label className="sourcing-currency-view">View amounts in <select value={displayCurrency} onChange={e => setDisplayCurrency(e.target.value)}>{displayCurrencies.map(currency => <option key={currency}>{currency}</option>)}</select></label>}{comm && <button type="button" className="sourcing-add-part-link" aria-expanded={showAddPart} onClick={openManualLine}>Add manual line</button>}{!comm && <span className="restricted"><Icon name="lock" size={12} /> Pricing restricted</span>}</div></div>
      {comm && <div className="sourcing-costing-controls" aria-label="Sourcing costing basis">
        <b>Costing basis</b>
        <label>1 EUR = ₹ <CostingNumberInput min="0.0001" step="0.01" value={costing.currencyRates.EUR || ''} onChange={value => updateCosting('currencyRates', { ...costing.currencyRates, EUR: value })} /></label>
        <label>1 USD = ₹ <CostingNumberInput min="0.0001" step="0.01" value={costing.currencyRates.USD || ''} onChange={value => updateCosting('currencyRates', { ...costing.currencyRates, USD: value })} /></label>
        <label>Customs Duty <CostingNumberInput min="0" max="200" step="0.1" value={costing.customsDutyPct} onChange={value => updateCosting('customsDutyPct', value)} />%</label>
        <label>ERV <CostingNumberInput min="0" max="200" step="0.1" value={costing.ervPct} onChange={value => updateCosting('ervPct', value)} />%</label>
        <label>Handling <CostingNumberInput min="0" max="200" step="0.1" value={costing.handlingPct} onChange={value => updateCosting('handlingPct', value)} />%</label>
        <span className={handlingOutOfRange ? 'warnbox sourcing-costing-warning' : 'hint'}>{handlingOutOfRange ? `Combined total ${importFactorPct.toFixed(1)}% — recommended range is ${handlingMin}–${handlingMax}%` : `Combined: ${importFactorPct.toFixed(1)}% · Admin guide: ${handlingMin}–${handlingMax}%`}</span>
        <span className="hint" aria-live="polite">Live: {importedLineCount} imported row{importedLineCount === 1 ? '' : 's'} recalculating{domesticLineCount ? ` · ${domesticLineCount} INR row${domesticLineCount === 1 ? '' : 's'} unchanged` : ''}</span>
      </div>}
      <div ref={sourcingSheetWrapRef} className="sheet-wrap sourcing-sheet-wrap"><table id="sourcing-spares-grid" className="sheet sourcing-sheet sourcing-sheet--fixed border-collapse">
        <thead><tr><th>Part number / customer reference</th><th>Description</th><th>Price source</th><th>Quantity</th><th>Supplier unit cost</th><th>Discount %</th><th>Markup %</th><th>Landed unit cost</th><th>Customer unit price</th><th>Base cost</th><th>Original total</th><th>Quoted total</th><th>Actions</th></tr></thead>
        <tbody>
          {calculatedItems.map(item => { const line = item.sourceLine; const displayLine = reconcilePriceSource(line, store.priceLists, []); const row = { ...item, discountPct: item.discountPercent, markupPct: item.markupPercent, listTotal: item.listTotal, lineTotal: item.lineTotal, cogs: item.lineTotalCogs }; const confirmable = isConfirmableSparesLine(line); const invalidState = row.qty <= 0 ? 'Cannot confirm' : 'Needs pricing'; const customerMeta = line.customerConfirmed ? `Customer confirmed${line.customerConfirmationPreviousQty != null ? ` · qty ${line.customerConfirmationPreviousQty} → ${line.qty}` : ''}` : ''; const rowMeta = line.sparesSupport ? 'Support charge' : [line.oem, line.leadTime && `Lead: ${line.leadTime}`, customerMeta].filter(Boolean).join(' · '); const partReference = sourcingPartReference(line); const removed = !!line.removedFromSourcing; return <tr key={line.id} className={row.qty === 0 ? 'sourcing-zero-row' : ''}>
            <td className="sourcing-cell-part-number align-top p-2 overflow-hidden" title={line.custRef || '—'}>{comm ? <input aria-label={`Customer reference for ${line.pn || line.id}`} placeholder={`Customer reference for ${line.pn || line.id}`} value={line.custRef || ''} onChange={event => updateLine(line, 'custRef', event.target.value)} /> : (line.custRef || '—')}</td>
            <td className="sourcing-cell-description align-top p-2 overflow-hidden"><div className="sourcing-part-line">{comm && (removed ? <button type="button" className="sourcing-restore-row" title="Restore row to active proposal" aria-label={`Restore ${line.pn || line.id}`} onClick={() => restoreLine(line)}>✓</button> : <button type="button" className="sourcing-remove-row sourcing-row-action" title="Remove row from active proposal" aria-label={`Remove ${line.pn || line.id}`} onClick={() => removeLine(line)}><Icon name="x" size={14} /></button>)}<div className="sourcing-part-copy"><div className="sourcing-part-description line-clamp-2 text-xs font-medium text-gray-900 leading-snug" title={sourcingDescription(line)}>{sourcingDescription(line)}</div><small className="hint truncate overflow-hidden text-ellipsis whitespace-nowrap" title={line.customerConfirmationEvidence || ''}>{rowMeta}</small></div></div></td>
            <td className="sourcing-cell-source align-top p-2 overflow-hidden"><div className="sourcing-source-stack">{(() => { const source = sourceDetails(displayLine); const attribution = manualAttribution(line); const sourcePayload = { ...source, pn: displayLine.pn || displayLine.custRef || displayLine.id, priceState: displayLine.priceState || 'Unstated', listPrice: displayLine.listUnitPrice ?? displayLine.listPrice, currency: displayLine.currency || 'INR', addedBy: attribution.addedByName || attribution.addedBy || '', addedAt: attribution.addedAt || '' }; const isCatalogued = source.source === PRICE_SOURCES.LIST && priceListNameFor(displayLine); return <><div className="sourcing-source-primary">{isCatalogued ? <button type="button" className="sourcing-source-link sourcing-source-name" title={`Open ${source.full} in the price list`} aria-label={`Open ${source.full} in the price list`} onClick={() => openPriceList(displayLine)}>{source.primary}</button> : <button type="button" className="sourcing-source-details-link sourcing-source-name" title={`View full source: ${source.full}`} aria-label={`View full source: ${source.full}`} onClick={() => setEvidence(sourcePayload)}>{source.primary}</button>}</div>{source.secondary && <span className="sourcing-source-meta" title={source.full}>{source.secondary}</span>}{line.priceState === 'Expired' ? <><Chip tone="state-Blocks">Expired</Chip><AiBadge label="pricing anomaly" /></> : line.priceState === 'Needs pricing' ? <Chip tone="state-Review">Needs pricing</Chip> : source.source !== PRICE_SOURCES.MANUAL ? <Chip tone="state-Accepted">Current</Chip> : null}</> })()}</div></td>
            <td className="num"><EditableNumber value={row.qty} label={`Quantity for ${line.pn || line.id}`} disabled={!comm} step="1" onChange={value => updateLine(line, 'qty', Math.max(0, Math.round(value)))} /></td>
            <td className="num"><EditableNumber prefix={currencySymbol(displayCurrency)} value={fmt(displayValue(row.listUnitPriceINR), displayDigits)} label={`List price for ${line.pn || line.id} in ${displayCurrency}`} disabled={!comm} onChange={value => updateLine(line, 'listUnitPrice', convertCurrency(value, displayCurrency, 'INR', costing.currencyRates))} /></td>
            <td className="num"><EditableNumber value={Math.round(row.discountPct)} label={`Discount for ${line.pn || line.id}`} disabled={!comm} step="1" onChange={value => updateLine(line, 'discountPct', Math.min(100, Math.max(0, Math.round(value))))} suffix="%" /></td>
            <td className="num"><EditableNumber value={Math.round(row.markupPct)} label={`Markup for ${line.pn || line.id}`} disabled={!comm} step="1" onChange={value => updateLine(line, 'markupPct', normalizeMarkupPct(Math.round(value)))} suffix="%" /></td>
            <td className="num">{comm ? displayMoney(row.landedUnitCost) : <span className="restricted"><Icon name="lock" size={11} /></span>}</td>
            <td className="num"><b>{comm ? displayMoney(row.adjustedUnitPrice) : <span className="restricted"><Icon name="lock" size={11} /></span>}</b></td>
            <td className="num"><EditableNumber prefix={currencySymbol(displayCurrency)} className={`sourcing-base-cost-input ${line.baseCost == null || n(line.baseCost) <= 0 || row.adjustedUnitPrice < row.baseCost ? 'is-warning' : ''}`} value={fmt(displayValue(row.baseCost), displayDigits)} label={`Base cost for ${line.pn || line.id} in ${displayCurrency}`} disabled={!comm} onChange={value => store.updateSparesLine(line.id, { baseCost: Math.max(0, convertCurrency(value, displayCurrency, 'INR', costing.currencyRates)) })} /></td>
            <td className="num">{comm ? displayMoney(row.listTotal) : '—'}</td><td className="num"><b>{comm ? displayMoney(row.lineTotal) : '—'}</b></td>
            <td className="sourcing-cell-actions align-top p-2">{comm && <div className="sourcing-row-actions">{line.confirmed && confirmable ? <Chip tone="state-Accepted" title="Sourcing line confirmed"><Icon name="check" size={11} /> OK</Chip> : confirmable ? <button type="button" className="primary sourcing-row-action sourcing-row-action--confirm" title="Confirm sourcing line" aria-label={`Confirm match for ${line.pn || line.custRef || line.id}`} onClick={() => store.updateSparesLine(line.id, { confirmed: true, match: line.priceSourceSuggested ? 'Confirmed equivalent' : (line.match || 'Exact'), priceSourceSuggested: false, priceSourceSuggestedPart: '', priceSourceSuggestedDescription: '', priceSourceSuggestedList: '', priceSourceSuggestedVersion: '' })}>OK</button> : <button type="button" className="sourcing-row-action sourcing-row-action--confirm sourcing-row-action--disabled" disabled title={`${invalidState}: enter a positive ${row.qty <= 0 ? 'quantity' : 'list price'}`} data-disabled-reason="Enter a positive list price" aria-label={`${invalidState} for ${line.pn || line.id}`}><Icon name="lock" size={12} /> {invalidState}</button>}<button type="button" className="sourcing-row-action sourcing-row-action--compare" title="Compare sourcing alternatives" aria-label={`Compare alternatives for ${line.pn || line.id}`} onClick={() => openCompare(line)}><Icon name="gitCompare" size={14} /></button></div>}</td>
          </tr> })}
        </tbody>
        {comm && <tfoot className="sourcing-total-row"><tr>
          <td><b>Totals</b></td><td></td><td></td><td></td><td className="num"><b>{totals.quantity}</b></td><td></td><td></td><td></td><td></td><td></td><td></td>
          <td className="num"><b>{displayMoney(totals.originalTotal)}</b></td><td className="num"><b>{displayMoney(totals.revenue)}</b></td><td></td>
        </tr></tfoot>}
      </table></div>
      {comm && <div className="sourcing-financial-summary-bar mt-3 flex flex-col sm:flex-row items-center justify-between bg-slate-50 border border-slate-200 rounded-lg p-3.5 shadow-sm" aria-label="BOQ financial totals" aria-live="polite">
        <div className="sourcing-financial-summary-metrics flex items-center space-x-6 text-xs">
          <div><span>BOQ Revenue</span><strong className="font-semibold text-gray-900">{displayMoney(totals.revenue)}</strong></div>
          <div><span>Projected COGS</span><strong className="font-semibold text-gray-700">{displayMoney(totals.cogs)}</strong></div>
          <div><span>Gross Profit</span><strong className="font-bold text-red-600">{displayMoney(grossProfit)}</strong></div>
          <div><span>Gross Margin</span><strong className={`inline-flex items-center px-2 py-0.5 rounded font-bold bg-red-100 text-red-700 text-xs ${grossMarginPct >= 0 ? 'is-positive' : ''}`}>{grossMarginPct.toFixed(1)}%</strong></div>
          <div className="sourcing-summary-validity"><span>Quote Validity</span><strong>{quoteValidityDays} days</strong></div>
        </div>
        <div className="sourcing-summary-actions ml-auto flex-shrink-0"><button className="primary sourcing-summary-action" disabled={!canContinueToProposal} title={continueTitle} onClick={sendToProposal}><Icon name="arrowRight" size={13} /> Next: Proposal</button></div>
      </div>}
      {showAddPart && <Modal title="Add manual part" onClose={() => { setShowAddPart(false); setManualLineError('') }} className="sourcing-manual-modal">
        <form className="sourcing-manual-form" onSubmit={event => { event.preventDefault(); addManual() }}>
          <p className="hint">Add a real customer-requested part that is not available in the approved price lists.</p>
          <label>Part number <input aria-label="Manual part number" placeholder="Part number" value={newLine.pn} onChange={e => setNewLine({ ...newLine, pn: e.target.value })} /></label>
          <label>Description <textarea aria-label="Manual description" placeholder="Description" rows="3" value={newLine.desc} onChange={e => setNewLine({ ...newLine, desc: e.target.value })} /></label>
          <div className="sourcing-manual-form-grid">
            <label>Quantity <input className="sourcing-number" aria-label="Manual quantity" type="number" min="0" step="1" value={newLine.qty} onChange={e => setNewLine({ ...newLine, qty: e.target.value })} /></label>
            <label>Manual list price (INR) <input className="sourcing-number" aria-label="Manual list price" placeholder="List price" type="number" min="0" step="0.01" value={newLine.listPrice} onChange={e => setNewLine({ ...newLine, listPrice: e.target.value })} /></label>
          </div>
          {manualLineError && <div className="warnbox" role="alert">{manualLineError}</div>}
          <div className="sourcing-manual-form-actions"><button type="button" onClick={() => { setShowAddPart(false); setManualLineError('') }}>Cancel</button><button type="button" onClick={() => { setShowAddPart(false); setManualLineError('') }}>Done</button><button type="submit" className="primary sourcing-manual-add"><Icon name="plus" size={13} /> Add line</button></div>
        </form>
      </Modal>}
      {!comm && <div className="restricted sourcing-restricted-footer"><Icon name="lock" size={12} /> Totals and margin are restricted — sales owners, approvers and admin only</div>}
    {sent && <div className="okbox">Proposal workbook BoM synchronized from the confirmed sourcing lines. <a style={{ cursor: 'pointer' }} onClick={openBuilder}>Open the proposal builder</a></div>}
    </div>
    </>}
    {compareFor && (() => {
      const line = lines.find(x => x.id === compareFor)
      if (!line) return null
      const close = () => { setCompareFor(null); setCompareSearch(''); setAiSuggestions([]); setCompareAiError('') }
      const searchResults = searchPriceListParts(line, compareSearch)
      const curated = store.sparesAlternatives.filter(a => a.forPn === line.pn)
      const fromPriceLists = priceListAlternatives(line).filter(a => !curated.some(c => c.pn === a.pn))
      const suggested = [...aiSuggestions, ...curated, ...fromPriceLists].map(item => ({ ...item, ...(aiSuggestions.includes(item) ? { suggestedBy: 'AI' } : {}) })).filter((item, index, all) => all.findIndex(other => other.pn === item.pn) === index)
      const renderAlt = a => { const src = altSourceInfo(a); const isAiSuggested = a.suggestedBy === 'AI'; const reason = a.reason || a.note || 'Configured interchangeability evidence.'; return <div key={a.pn} className="compare-alt-row">
        <div className="compare-alt-info">
          <div className="compare-alt-header">
            <b>{a.pn}</b>
            {isAiSuggested && <AiBadge label="AI suggested" />}
            {a.conf != null && <ConfChip conf={a.conf} label="AI match" thresholds={store.config?.aiThresholds} />}
            {a.priceState === 'Expired' ? <Chip tone="state-Blocks">Expired price</Chip> : <Chip tone="state-Accepted">Current price</Chip>}
            <Chip tone={src.tone}>{src.label}</Chip>
          </div>
          <div className="compare-alt-desc">{a.desc}</div>
          {isAiSuggested && <div className="compare-alt-reason"><b>Why AI suggested this:</b> {reason}</div>}
          {a.note && <span className="hint">{a.note}</span>}
        </div>
        <button className="primary compare-alt-action" onClick={() => useAlternative(line, a)}>Use this</button>
      </div> }
      return <Modal title={`Compare / select alternative — ${line.pn}`} onClose={close} wide>
        <input type="text" placeholder="Search all price lists by part number or description…" value={compareSearch} onChange={e => setCompareSearch(e.target.value)} style={{ width: '100%', marginBottom: 10, padding: '6px 8px' }} autoFocus />
        {compareAiBusy && !compareSearch.trim() && <div className="hint compare-ai-status">AI is checking the approved price lists for likely matches…</div>}
        {compareAiError && !compareSearch.trim() && <div className="hint compare-ai-status">{compareAiError} Use the search box below to find and confirm a catalogue part.</div>}
        {compareSearch.trim()
          ? <>{searchResults.map(renderAlt)}{!searchResults.length && <p className="hint">No price-list parts match "{compareSearch}".</p>}</>
          : <>{aiSuggestions.length > 0 && <div className="compare-ai-heading">AI-ranked suggestions</div>}{suggested.map(renderAlt)}{!suggested.length && !compareAiBusy && <p className="hint">No catalogued alternatives or similar price-list parts found for this part — search above, confirm the match, or add a manual line.</p>}</>}
        <div style={{ marginTop: 10, textAlign: 'right' }}><button onClick={close}>Close</button></div>
      </Modal>
    })()}
    {pricePreview && <Modal title="Approved price list preview" className="sourcing-price-preview-modal" onClose={() => setPricePreview(null)}><div className="sourcing-price-preview">{pricePreview.found ? <><div className="sourcing-price-preview-heading"><b>{pricePreview.list}{pricePreview.version ? ` · ${pricePreview.version}` : ''}</b><span className="chip state-Accepted">APPROVED PRICE LIST</span></div>{pricePreview.uploaded && <p className="sourcing-price-preview-published">Published {ddMmmYY(pricePreview.uploaded)}</p>}<div className="sourcing-price-preview-table-wrap"><table className="sourcing-price-preview-table"><thead><tr><th className="pl-sr-no">Sr. No.</th><th>Part number</th><th>Description</th><th>Price ({pricePreview.currency} {currencySymbol(pricePreview.currency)})</th><th>Configurable adders</th></tr></thead><tbody><tr><td className="pl-sr-no"><b>{pricePreview.srNo || '—'}</b></td><td><b>{pricePreview.partNumber}</b></td><td>{pricePreview.description || '—'}</td><td className="num"><b>{currencySymbol(pricePreview.currency)}{fmt(pricePreview.price)}</b></td><td>{pricePreview.adders.length ? pricePreview.adders.map((adder, index) => <div key={`${adder.code || adder.desc || 'adder'}-${index}`}>{adder.code ? `${adder.code} — ` : ''}{adder.desc || 'Unnamed adder'}{adder.price != null ? ` (+${currencySymbol(pricePreview.currency)}${fmt(adder.price)})` : ''}</div>) : '—'}</td></tr></tbody></table></div></> : <p className="hint">The approved price-list row for <b>{pricePreview.part}</b> is unavailable in the saved list version.</p>}<div className="sourcing-price-preview-actions"><button onClick={() => setPricePreview(null)}>Close</button></div></div></Modal>}
    {evidence && <Modal title="Evidence — price source" onClose={() => setEvidence(null)}><p style={{ fontSize: 12.5 }}><b>{evidence.pn}</b> uses <b>{evidence.full}</b>.</p><dl className="sourcing-source-evidence"><div><dt>Source type</dt><dd>{evidence.kind}</dd></div><div><dt>Price status</dt><dd>{evidence.priceState}</dd></div>{comm && evidence.listPrice != null && <div><dt>Unit price</dt><dd>{fmt(evidence.listPrice)} {evidence.currency}</dd></div>}{evidence.secondary && <div><dt>Source detail</dt><dd>{evidence.secondary}</dd></div>}{evidence.source === PRICE_SOURCES.MANUAL && <div><dt>Added by</dt><dd>{evidence.addedBy || 'Existing manual entry'}</dd></div>}{evidence.source === PRICE_SOURCES.MANUAL && <div><dt>Added on</dt><dd>{evidence.addedAt ? ddMmmYY(evidence.addedAt.slice(0, 10)) : 'Not recorded'}</dd></div>}</dl><p className="hint">Row-level evidence is simulated in this demo — the production system links the exact price-list row.</p><div style={{ textAlign: 'right' }}><button onClick={() => setEvidence(null)}>Close</button></div></Modal>}
  </div>
}

function EditableNumber({ value, label, disabled, onChange, prefix = '', suffix = '', className = '', step = '0.01' }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value ?? 0))

  const begin = event => {
    if (disabled) return
    setDraft(String(value ?? 0))
    setEditing(true)
    const editor = event.currentTarget
    window.requestAnimationFrame(() => {
      if (!editor?.isConnected) return
      const input = editor.querySelector('input')
      if (input?.isConnected) input.focus()
    })
  }
  const commit = () => {
    if (!editing) return
    setEditing(false)
    onChange(n(draft))
  }
  const cancel = () => { setDraft(String(value ?? 0)); setEditing(false) }

  return <span className={`sourcing-edit-number ${className}`.trim()}>{prefix && <small className="sourcing-number-prefix">{prefix}</small>}{editing ? <input className="sourcing-number sourcing-edit-input w-full max-w-[60px] px-1 py-0.5 text-xs text-right" style={{ width: `${Math.max(3, String(draft ?? '').length + 1)}ch`, maxWidth: 'none' }} aria-label={label} type="text" inputMode={step === '1' ? 'numeric' : 'decimal'} value={draft} autoFocus onFocus={event => { if (n(value) === 0) event.currentTarget.select() }} onChange={event => setDraft(step === '1' ? event.target.value.replace(/\D/g, '') : event.target.value)} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commit() } if (event.key === 'Escape') { event.preventDefault(); cancel() } }} /> : <button type="button" className="sourcing-read-value" aria-label={`${label}; click to edit`} disabled={disabled} onClick={begin}>{value}</button>}{suffix && <small>{suffix}</small>}</span>
}
