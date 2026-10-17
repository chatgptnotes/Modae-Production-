import { normalizeCustomerClass } from '../customerClasses.js'
import { fmtRupeesFromK, rupeesToK } from '../utils.js'
import { useWorkspaceWatch, markWorkspaceEditing } from '../ui/WorkspaceSync.jsx'
import EditableOpportunityCell, { OpportunityCellEditingProvider, EditableOpportunityRow, OpportunityRowEditButton, OpportunityRowEditOnly } from '../ui/EditableOpportunityCell.jsx'
import { validateOpportunityEdit } from '../opportunityEdits.js'
import { displayOpportunityId } from '../seed.js'
import { useFieldLists } from '../useFieldLists.js'
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useStore } from '../store.jsx'

import { fmt, ddMmmYY, ddMMyyyy, stageClass, productList, productLabel, productDisplayLabel, sameCustomer, displayRole, OPPORTUNITY_DATE_FIELDS, opportunityDateRange } from '../utils.js'
import { downloadTableXlsx } from '../proposal/tableExcelExport.js'
import { useFormulaBar } from '../formulabar.jsx'
import { suggestProbability } from '../insights.js'
import { MarkWonControl, Modal, Portal } from '../ui.jsx'
import { Icon } from '../icons.jsx'
import { PIPELINE_COLUMNS, financials, fiscalQuarter } from '../excelLogic.js'
import { parsePipelineFile } from '../pipelineImport.js'
import {
  filterValueKey, filterValueLabel, matchesFilterQuery,
  toggleSubsetIn, toggleValueIn,
} from '../columnFilter.js'
import { columnSortValue, isConditionActive, conditionSummary, colType, compareVals, matchesGlobalSearch, sortLabels } from '../trackerFilters.js'
import { useWorkspaceView } from '../ui/WorkspaceViewContext.jsx'
import usePhoneLayout from '../tablet/usePhoneLayout.js'
import { PhoneOverlayHeader } from '../tablet/PhoneWorkspaceChrome.jsx'
import OpportunityFilters from './OpportunityFilters.jsx'
import { DEFAULT_OPPORTUNITY_DATE_FILTER, normalizeOpportunityFilters, filterOpportunityRows, scopedOpportunityRows, matchesOpportunitySelections, matchesOpportunityConditions, matchesOpportunityDate, opportunityFilterFields } from '../opportunityFilters.js'
import { PhonePagePicker } from '../ui/Pagination.jsx'
import useListState from '../tablet/useListState.js'
import { useViewportPageSize } from '../ui/useViewportPageSize.js'
import { PhoneOpportunityRow } from './PhoneOpportunityViews.jsx'
import { isAdminRole, canSeePage } from '../utils.js'

import OpportunityAiSearch from '../ui/OpportunityAiSearch.jsx'
import TrackerDateCell from '../ui/TrackerDateCell.jsx'
import { matchesOpportunitySearch, searchSummary, SEARCH_FIELDS } from '../opportunitySearch.js'
import { bookingRegister } from '../orderBookings.js'
import ColumnCondition from '../ui/ColumnCondition.jsx'
import './trackerColumns.css'

const DEFAULT_DATE_FILTER = DEFAULT_OPPORTUNITY_DATE_FILTER

// Columns with their real-sheet letters (row number = Sl + 2, as in the sheet).
// `w` is the column's share of the sheet width — free text gets the generous
// shares, single-token chips the thin ones. The all-31 view turns these
// weights into px widths and scrolls sideways. The key view shares the
// available width; `wAll` gives full-view identity/date columns a bigger slice.
export const COLS = PIPELINE_COLUMNS.map(col => col.key === 'owner'
  ? { ...col, label: 'Opportunity Owner' }
  : ['valueK', 'cogsK', 'gmK'].includes(col.key) ? { ...col, label: col.label.replace('K₹', 'INR') } : col)

// The columns a sales owner actually works from, in Biji's words on 13 Aug:
// "Opportunity ID, Customer, Opportunity Name, Stage, Probability… I need
// value, proposal send date, expected order date… and I should know where is the next action
// pending." He was explicit that Opportunity Owner and Updated are not
// required — a rep filtered to their own rows already knows the owner.
const KEY_COLS = ['id', 'sellTo', 'oppName', 'stage', 'oppType', 'prob', 'valueK', 'proposalDate', 'orderDate', 'fqFy']
const KEY_COL_WIDTHS = {
  id: 8, sellTo: 12, oppName: 23, stage: 8, oppType: 6,
  prob: 7, valueK: 7, proposalDate: 7, orderDate: 12,
  fqFy: 7,
}

function PipelineUploadPreview({ preview, onClose, onImport }) {
  const store = useStore()
  const [review, setReview] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    let active = true
    if (preview.importData?.opportunities?.length && !preview.importData.error) {
      store.previewWorkbookData(preview.importData).then(result => { if (active) setReview(result) }).catch(error => { if (active) setError(error.message) })
    }
    return () => { active = false }
  }, [preview])
  const { fileName, sheetName, headers, rows, previewRows, missing, importData } = preview
  const shown = previewRows.slice(0, 25)
  return (
    <Modal title={`Pipeline upload preview — ${fileName}`} onClose={onClose} wide className="workbook-preview-modal">
      <p className="hint">
        Review this workbook before importing. Existing saved values will be kept.
        {' '}{rows.length} row{rows.length === 1 ? '' : 's'} read from {sheetName || 'the first sheet'}.
      </p>
      {missing.length > 0 && (
        <div className="warnbox" role="alert">
          The preview could not find: {missing.map(key => key === 'sellTo' ? 'Customer' : 'Opportunity Name').join(' and ')}.
          Check the workbook headings before importing.
        </div>
      )}
      {importData?.error && (
        <div className="warnbox" role="alert">{importData.error}</div>
      )}
      {!rows.length ? (
        <div className="hint">No data rows were found in the first sheet.</div>
      ) : (
        <div className="sheet-wrap" style={{ maxHeight: '52vh', overflow: 'auto' }}>
          <table className="sheet">
            <thead><tr>{headers.map(header => <th key={header}>{header}</th>)}</tr></thead>
            <tbody>{shown.map((row, index) => (
              <tr key={index}>{headers.map(header => <td key={header}>{String(row[header] ?? '')}</td>)}</tr>
            ))}</tbody>
          </table>
          {rows.length > shown.length && <p className="hint">Showing the first {shown.length} rows only.</p>}
        </div>
      )}
      {error && <div className="errbox" role="alert">{error}</div>}
      {review && <div>
        <p>{review.addedOpportunities} new opportunities · {review.addedCustomers} new customers · {review.skippedDeleted} deleted records skipped. Existing edits and files will be kept.</p>
        {review.conflicts?.length > 0 && <details><summary>{review.conflicts.length} differences — saved values will be kept</summary>
          <div style={{ maxHeight: '20vh', overflow: 'auto' }}><table className="sheet"><thead><tr><th>Record</th><th>Field</th><th>Saved</th><th>Excel</th></tr></thead><tbody>
            {review.conflicts.map((c, i) => <tr key={i}><td>{c.id}</td><td>{c.field}</td><td>{JSON.stringify(c.saved)}</td><td>{JSON.stringify(c.incoming)}</td></tr>)}
          </tbody></table></div>
        </details>}
      </div>}
      <div className="form-actions" style={{ marginTop: 12 }}>
        <button type="button" onClick={onClose}>Close preview</button>
        {importData?.opportunities?.length > 0 && !importData.error && (
          <button type="button" className="btn-primary" disabled={!review || saving} onClick={async () => { setSaving(true); try { await onImport(review?.reviewToken) } catch (err) { setError(err.message); setReview(null); store.previewWorkbookData(preview.importData).then(setReview).catch(e => setError(e.message)) } finally { setSaving(false) } }}>
            {saving ? 'Importing…' : `Merge workbook (${importData.opportunities.length} opportunities)`}
          </button>
        )}
      </div>
    </Modal>
  )
}
// Hiding a spreadsheet column means hiding the header and the matching cell in
// every row. The cells are written out in COLS order, so one generated rule per
// hidden column does it — the same thing Excel's "hide column" does, and it
// keeps the row markup untouched. <tfoot> carries colSpan cells, so the
// key-column view hides it rather than misaligning it.
function hiddenColumnCss(hidden) {
  if (!hidden.length) return ''
  const sel = hidden
    .map(i => `.sheet.cols-key thead tr > :nth-child(${i + 2}), .sheet.cols-key tbody tr > :nth-child(${i + 2})`)
    .join(',')
  return `${sel} { display: none; } .sheet.cols-key tfoot { display: none; }`
}

// Key tracks use percentages so descriptions keep their intended width.
// The full workbook retains readable pixel widths and frozen identity tracks.
const PX_PER_UNIT = 13
const MIN_COL_PX = 120
function columnWidth(col, all = false) {
  if (!all) return `${KEY_COL_WIDTHS[col.key] / Object.values(KEY_COL_WIDTHS).reduce((sum, value) => sum + value, 0) * 97}%`
  if (col.key === 'id') return 'var(--tracker-id-width)'
  if (col.key === 'sellTo') return 'var(--tracker-customer-width)'
  if (all) {
    const px = Math.max(MIN_COL_PX, Math.round(((col.wAll || col.w) * PX_PER_UNIT)))
    return `max(120px, calc(${px}px * var(--opp-density, 1)))`
  }
}

function columnWidthCss(cols, scope, all = false) {
  const rule = (sel, value) => `${scope} thead tr > ${sel}, ${scope} tbody tr > ${sel} { ${value} }`
  const label = value => `--tracker-cell-label: ${JSON.stringify(value)};`
  const tableWidth = all
    ? `calc(var(--tracker-sl-width) + ${cols.map(col => columnWidth(col, true)).join(' + ')})`
    : 'max(100%, 1200px)'
  return [
    `${scope} { table-layout: fixed; width: ${tableWidth}; min-width: 0; }`,
    rule(':nth-child(1)', label('SL')),
    ...cols.map(col => rule(`:nth-child(${COLS.indexOf(col) + 2})`, label(col.label))),
  ].join('\n')
}

// A cell whose text has to wrap. <input> is single-line by construction, so the
// wide free-text columns of the key view use a textarea grown to fit its own
// content instead. Enter is swallowed: these are one-value fields that happen
// to need two lines, not multiline notes. The observer watches the cell, not
// the textarea — resizing ourselves would feed our own notifications back.
function WrapInput({ value, onChange, title, label, disabled = false, onBlur, onFocus, onKeyDown }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const el = ref.current
    const cell = el?.parentElement
    if (!cell) return
    const fit = () => { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px` }
    fit()
    let width = cell.getBoundingClientRect().width
    const ro = new ResizeObserver(entries => {
      const next = entries[0].contentRect.width
      if (next === width) return   // height-only change: that was us
      width = next
      fit()
    })
    ro.observe(cell)
    return () => ro.disconnect()
  }, [value])
  return (
    <textarea disabled={disabled} ref={ref} className="wrapcell" rows={1} value={value} title={title} aria-label={label}
      onBlur={onBlur} onFocus={onFocus} onKeyDown={onKeyDown}
      onChange={e => {
        // Enter is blocked above, but a paste can still carry newlines into a
        // field the rest of the app renders as one line.
        e.target.value = e.target.value.replace(/\s*\n+\s*/g, ' ')
        onChange(e)
      }} name="tracker-value" />
  )
}

// A capturing window listener sits on the propagation path of every element's
// scroll event, so a popover that scrolls its own overflow used to close itself.
// Harmless while the lists were short; fatal once they scroll or take arrow keys.
const scrolledInsidePopover = event => {
  const target = event.target
  return !!(target && target.nodeType === 1 && target.closest?.('.filter-pop'))
}

export default function Tracker({ initialOwnerFilter, onCreateOpportunity, afterTable = null, topContent = null }) {
  const store = useStore()
  const canEditOpportunities = store.canPerform?.('opportunities.edit') !== false
  const { PRODUCTS, CATEGORIES, OWNERS, OPP_TYPES, BUS, SEGMENTS, PROB_LEVELS, WON_REASONS, CLOSE_REASONS, labelFor } = useFieldLists(store.opportunities)
  const narrow = usePhoneLayout()
  const phone = narrow && store.viewMode === 'tablet'
  const [filtersOpen, setFiltersOpen] = useState(false)
  const filterTrigger = useRef(null)
  const { scope } = useWorkspaceView()
  const fb = useFormulaBar()
  const [savedSheet, setSheet] = useListState(`${store.auth?.user?.id || store.role}:${store.role}:${scope}:opportunities:sheet`, 'Opportunities')
  const sheet = savedSheet === 'My Orders' ? 'My Orders' : 'Opportunities'
  const [page, setPage] = useListState(`${store.auth?.user?.id || store.role}:${store.role}:${scope}:opportunities:page`, 1)
  const gridRef = useRef(null)

  const defaultOwnerFilter = initialOwnerFilter || 'All'
  const [ownerFilter, setOwnerFilter] = useListState(`${store.auth?.user?.id || store.role}:${store.role}:${scope}:opportunities:ownerFilter`, defaultOwnerFilter)
  const [savedFilters, setSavedFilters] = useListState(`${store.auth?.user?.id || store.role}:${store.role}:${scope}:opportunities:filters-inr-v2`, {})           // col key -> Set of allowed display values
  const filters = normalizeOpportunityFilters(savedFilters, ownerFilter)
  const setFilters = next => {
    setSavedFilters(current => typeof next === 'function' ? next(normalizeOpportunityFilters(current, ownerFilter)) : next)
    setOwnerFilter('All')
  }
  const [sort, setSort] = useListState(`${store.auth?.user?.id || store.role}:${store.role}:${scope}:opportunities:sort`, null)               // { key, dir: 1 | -1 }
  const columnMenuTrigger = useRef(null)
  const [openFilter, setOpenFilter] = useState(null)   // { key, x, y } of the open dropdown
  const [conditions, setConditions] = useListState(`${store.auth?.user?.id || store.role}:${store.role}:${scope}:opportunities:conditions-inr-v2`, {})
  const [filterSearch, setFilterSearch] = useState({})
  const [searchTerm, setSearchTerm] = useListState(`${store.auth?.user?.id || store.role}:${store.role}:${scope}:opportunities:searchTerm`, '')
  const aiIdentity = `${store.auth?.user?.id || store.role}:${store.role}:${scope}`
  const [aiSearch, setAiSearch] = useState(null)
  const activeAi = aiSearch?.identity === aiIdentity ? aiSearch : null
  useEffect(() => { setAiSearch(null) }, [aiIdentity])
  const [dateFilter, setDateFilter] = useListState(`${store.auth?.user?.id || store.role}:${store.role}:${scope}:opportunities:dateFilter`, DEFAULT_DATE_FILTER)
  const [pipelinePreview, setPipelinePreview] = useState(null)
  const [pipelineUploadError, setPipelineUploadError] = useState('')
  const pipelineFileRef = useRef(null)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const moreMenuRef = useRef(null)
  const [closePending, setClosePending] = useState(null) // { id, stage } awaiting outcome and reason
  const [closeReason, setCloseReason] = useState('')
  const [closeReasonNote, setCloseReasonNote] = useState('')
  const sheetWrapRef = useRef(null)
  // Open on the readable working columns for every role. The complete sheet is
  // still one click away; this keeps the page aligned at desktop widths where
  // all 31 columns cannot fit without becoming unusably narrow.
  const [colView, setColView] = useState('key')
  const [mobileTable, setMobileTable] = useState(false)
  useEffect(() => {
    if (!phone || !mobileTable) return
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const close = event => { if (event.key === 'Escape') setMobileTable(false) }
    document.addEventListener('keydown', close)
    document.querySelector('.phone-table-close')?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', close)
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [phone, mobileTable])

  useEffect(() => {
    if (!openFilter) return undefined
    const close = event => {
      if (event.key === 'Escape') { setOpenFilter(null); columnMenuTrigger.current?.focus() }
    }
    const onResize = () => setOpenFilter(null)
    const onScroll = event => { if (!scrolledInsidePopover(event)) setOpenFilter(null) }
    window.addEventListener('keydown', close)
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('keydown', close)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [openFilter])

  useEffect(() => {
    if (!moreMenuOpen) return undefined
    const close = event => {
      if (event.key === 'Escape') setMoreMenuOpen(false)
    }
    const onPointerDown = event => {
      if (!moreMenuRef.current?.contains(event.target)) setMoreMenuOpen(false)
    }
    window.addEventListener('keydown', close)
    window.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', close)
      window.removeEventListener('pointerdown', onPointerDown)
    }
  }, [moreMenuOpen])

  const gmK = o => financials(o).gmK
  const gmPct = o => (o.valueK ? Math.round(financials(o).gmPct * 100) + '%' : null)
  const customerStatusFor = o => normalizeCustomerClass(o.customerStatus || store.customers.find(c => sameCustomer(c.name, o.sellTo))?.status)

  // Display value used for filtering & sorting (what the user sees in the cell).
  const cellVal = (o, key) => {
    switch (key) {
      case 'customerStatus': return customerStatusFor(o)
      case 'gmK': return gmK(o) * 1000
      case 'gmPct': return gmPct(o) || '—'
      case 'valueK': return o.valueK == null ? '' : o.valueK * 1000
      case 'cogsK': return o.cogsK == null ? '' : o.cogsK * 1000
      case 'createDate': return ddMMyyyy(o[key])
      case 'proposalDate': case 'orderDate': case 'invoiceDate': return o[key] ? ddMMyyyy(o[key]) : ''
      case 'lastUpdated': return ddMmmYY(o[key])
      case 'forecast': return o.forecast ? '✓ Checked' : '☐ Unchecked'
      case 'prob': return o.prob || ''
      case 'product': return Array.isArray(o.product) ? o.product.join(', ') : o.product || ''
      case 'owner': return o.owner || ''
      case 'fqFy': return fiscalQuarter(o.orderDate)
      default: return o[key] ?? ''
    }
  }

  const all = [...store.opportunities].sort((a, b) => a.sl - b.sl)
  const confirmedBookingDates = new Map(bookingRegister(store).orders.map(order => [order.oppId || order.id, order.booked]))
  const aiValue = (o, key) => key === 'bookingDate' ? confirmedBookingDates.get(o.id) || '' : key === 'gmK' ? gmK(o) : key === 'gmPct' ? (financials(o).gmPct == null ? null : financials(o).gmPct * 100) : key === 'customerStatus' ? customerStatusFor(o) : key === 'fqFy' ? fiscalQuarter(o.orderDate) : o[key]
  const aiRows = all.filter(o => matchesOpportunitySearch(o, activeAi?.plan, { me: store.role, valueOf: aiValue }))
  const scopedRows = scopedOpportunityRows(aiRows, scope, store.role, sheet)
  const base = scopedRows.filter(o => scope === 'my' || !filters.owner || filters.owner.has(String(o.owner || '')))


  // Filters are derived from the current searchable rows so toolbar search,
  // owner selection, and every column filter always compose predictably.
  const applyFilters = nextFilters => setFilters(nextFilters)
  const conditionValue = (o, key) => key === 'gmPct' ? (financials(o).gmPct == null ? null : financials(o).gmPct * 100) : ['date', 'multi-enum', 'bool'].includes(colType(key)) ? o[key] : cellVal(o, key)
  const matchesConditions = (o, except = null) => matchesOpportunityConditions(o, conditions, conditionValue, except || (scope === 'my' ? 'owner' : null))
  const matchesFilters = (o, activeFilters = filters, except = null) => matchesOpportunitySelections(o, activeFilters, cellVal, except || (scope === 'my' ? 'owner' : null))

  const dateFilterState = opportunityDateRange(dateFilter.period, dateFilter)
  const dateFilterActive = !!dateFilterState.range
  const matchesDateFilter = o => matchesOpportunityDate(o, dateFilter)

  // Analytics bars land here pre-filtered via query params (?owner= / ?oppType= / ?bu= / ?stage=).
  const [params, setParams] = useSearchParams()
  useEffect(() => {
    if (![...params.keys()].length) return
    const owner = params.get('owner')
    if (owner) setFilters(current => ({ ...current, owner: new Set([owner]) }))
    const next = {}
    for (const key of ['oppType', 'bu', 'stage', 'status']) {
      const v = params.get(key)
      if (v) next[key] = new Set(v.split(',').map(value => value.trim()).filter(Boolean))
    }
    if (Object.keys(next).length) applyFilters(current => ({ ...current, ...next }))
    setParams({}, { replace: true })
  }, [params])  // eslint-disable-line react-hooks/exhaustive-deps
  const DATE_KEYS = ['createDate', 'proposalDate', 'orderDate', 'invoiceDate', 'lastUpdated']
  const sortVal = (o, key) => columnSortValue(key, key === 'bookingDate' ? aiValue(o, key) : DATE_KEYS.includes(key) ? (o[key] || '') : key === 'gmPct' ? conditionValue(o, key) : cellVal(o, key))

  const criteria = { scope, actor: store.role, sheet, search: searchTerm, filters, conditions, date: dateFilter }
  const filterContext = { columns: COLS, valueOf: cellVal, conditionValueOf: conditionValue }
  const filterOptions = Object.fromEntries(['owner', 'status', 'stage', 'oppType', 'prob'].map(key => [key, [...new Set(scopedRows.map(row => String(cellVal(row, key) ?? '')))].sort()]))
  filterOptions.status = [...new Set(['Open', 'Closed', ...filterOptions.status])]
  filterOptions.prob = [...new Set(['High', 'Medium', 'Low', '', ...filterOptions.prob])]
  let rows = filterOpportunityRows(aiRows, criteria, filterContext)
  if (sort) {
    const { key, dir } = sort
    rows = [...rows].sort((a, b) => {
      const va = sortVal(a, key), vb = sortVal(b, key)
      const aBlank = va === '' || va == null
      const bBlank = vb === '' || vb == null
      if (aBlank || bBlank) {
        if (aBlank && bBlank) return 0
        return aBlank ? 1 : -1
      }
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
      return compareVals(va, vb, dir)
    })
  }

  const listMounted = useRef(false)
  useEffect(() => {
    if (listMounted.current) setPage(1)
    listMounted.current = true
  }, [sheet, ownerFilter, searchTerm, savedFilters, conditions, sort, dateFilter, activeAi])

  const { pageSize, listRef: pageListRef, pagerRef: pagePagerRef } = useViewportPageSize(rows.length, { enabled: !phone, rootRef: gridRef })
  const pageCount = Math.max(1, Math.ceil(rows.length / (phone ? 10 : pageSize)))
  useEffect(() => {
    setPage(current => Math.min(current, pageCount))
  }, [pageCount])
  const currentPage = Math.min(page, pageCount)
  const visiblePageSize = phone ? 10 : pageSize
  const pageRows = rows.slice((currentPage - 1) * visiblePageSize, currentPage * visiblePageSize)
  useWorkspaceWatch(pageRows.map(r=>({entity:'opportunities',id:r.id})),[{entity:'opportunities',page:0,pageSize:50}])
  const firstRow = rows.length ? (currentPage - 1) * visiblePageSize + 1 : 0
  const lastRow = Math.min(currentPage * visiblePageSize, rows.length)

  const totals = rows.reduce((t, o) => ({ v: t.v + (+o.valueK || 0), c: t.c + (+o.cogsK || 0) }), { v: 0, c: 0 })
  const activeFilterCount = opportunityFilterFields(criteria, scope).size + (activeAi ? 1 : 0)

  const clearAllTableState = () => {
    setAiSearch(null)
    setFilters({})
    setConditions({})
    setFilterSearch({})
    setOpenFilter(null)
    setDateFilter(DEFAULT_DATE_FILTER)
    setFiltersOpen(false)
  }
  const clearDateFilter = () => setDateFilter(DEFAULT_DATE_FILTER)

  const openColumnMenu = (col, event) => {
    event.stopPropagation()
    setFiltersOpen(false)
    if (openFilter?.key === col.key) {
      setOpenFilter(null)
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    columnMenuTrigger.current = event.currentTarget
    setOpenFilter({
      key: col.key,
      x: Math.max(8, Math.min(rect.left, window.innerWidth - 336)),
      y: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 540)),
    })
  }

  const canEditRow = o => !!o && canEditOpportunities && (o.owner === store.role || isAdminRole(store.role))
  const canTransfer = isAdminRole(store.role) || store.canPerform?.('commercial.view') === true

  const upd = (id, field) => e => {
    if (!canEditOpportunities) return
    let value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    const current = store.opportunities.find(o => o.id === id)
    if (!canEditRow(current) || field === 'owner' && !canTransfer) return
    try { validateOpportunityEdit(field, value) } catch (error) { window.alert(error.message); return }
    // Numeric columns must store numbers so margin calculations and proposal
    // write-back comparisons remain stable.
    if (field === 'valueK' || field === 'cogsK') value = e.target.value === '' ? null : rupeesToK(e.target.value)
    const patch = { [field]: value }
    // Reopening clears the closure fields; a Won/Lost stage must not survive.
    if (field === 'status' && value === 'Open') Object.assign(patch, { closedReason: '', closedReasonNote: '', stage: 'Firm Bid' })
    if (field === 'closedReason' && value !== 'Other') patch.closedReasonNote = ''
    if (field === 'status' && value === 'Closed') {
      setClosePending({ id, stage: '' })
      setCloseReason('')
      setCloseReasonNote('')
      return
    }
    if (field === 'stage' && (value === 'Won' || value === 'Lost')) {
      setClosePending({ id, stage: value })
      setCloseReason('')
      setCloseReasonNote('')
      return
    }
    store.updateOpportunity(id, patch)
  }

  const cancelClose = () => {
    setClosePending(null)
    setCloseReason('')
    setCloseReasonNote('')
  }

  const confirmClose = () => {
    const note = closeReasonNote.trim()
    const requiresNote = closePending?.stage === 'Won' ? closeReason === 'Other' : closeReason === 'Other'
    if (!canEditOpportunities || !closePending || !closeReason || (requiresNote && !note)) return
    if (closePending.stage === 'Won') {
      store.markWon(closePending.id, closeReason, requiresNote ? note : '')
    } else {
      store.closeLost(closePending.id, closeReason, null, requiresNote ? note : '', closePending.stage)
    }
    cancelClose()
  }

  useLayoutEffect(() => {
    if (sheetWrapRef.current) sheetWrapRef.current.scrollLeft = 0
  }, [colView])

  const handleSheetScroll = () => {
    if (openFilter) setOpenFilter(null)
  }

  // Imported serials can repeat across workbook tabs. Use the current combined
  // register position for unique inspection addresses, without changing records.
  const inspectionRows = new Map(rows.map((o, index) => [o.id, index + 3]))

  // Formula-bar selection is a read-only inspection; pencils activate editing.
  const selectCell = (o, col) => () => {
    const r = inspectionRows.get(o.id)
    let formula = String(cellVal(o, col.key))
    let kind = 'text'
    if (col.key === 'gmK') { formula = `=Q${r}-R${r}`; kind = 'number' }
    else if (col.key === 'fqFy') formula = fiscalQuarter(o.orderDate)
    else if (col.key === 'gmPct') { formula = `=S${r}/Q${r}`; kind = 'number' }
    fb.select({ ref: `${col.letter}${r}`, formula, commit: null, kind })
  }
  const isSel = (o, col) => fb.sel.ref === `${col.letter}${inspectionRows.get(o.id)}`

  const exportCols = COLS
  // A real .xlsx rather than CSV: CSV carries no formatting, so long text
  // (opportunity names, remarks) landed unwrapped in one endless row.
  const exportRows = async () => downloadTableXlsx(
    'Sales_Pipeline_Report.xlsx',
    'Pipeline',
    ['Sl.', ...exportCols.map(col => col.label)],
    rows.map((o, index) => [index + 1, ...exportCols.map(col => {
      switch (col.key) {
        case 'owner': return displayRole(o.owner)
        case 'customerStatus': return customerStatusFor(o)
      case 'product': return Array.isArray(o.product) ? o.product.join(', ') : o.product || ''
        case 'valueK': return o.valueK == null ? '' : o.valueK * 1000
        case 'cogsK': return o.cogsK == null ? '' : o.cogsK * 1000
        case 'gmK': return gmK(o) * 1000
        case 'gmPct': return financials(o).gmPct == null ? '' : `${financials(o).gmPct * 100}%`
        case 'fqFy': return fiscalQuarter(o.orderDate)
        case 'forecast': return o.forecast ? 'Y' : 'N'
        default: return o[col.key] ?? ''
      }
    })])
  )

  const onPipelineFile = async event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setPipelineUploadError('')
    try {
      const parsed = parsePipelineFile(await file.arrayBuffer())
      setPipelinePreview({ ...parsed, fileName: file.name, sheetName: 'first sheet' })
    } catch {
      setPipelineUploadError('The file could not be read. Please choose an .xlsx, .xls, or .csv file.')
    }
  }

  // The filter menu is portaled to document.body so it is not clipped or
  // trapped behind the sticky table header while the sheet scrolls.
  const renderFilterPop = (col, pos) => {
    const rowsForVals = scopedRows.filter(o => matchesGlobalSearch(o, searchTerm, COLS, cellVal) && matchesDateFilter(o) && matchesFilters(o, filters, col.key) && matchesConditions(o, col.key))
    const values = DATE_KEYS.includes(col.key)
      ? [...new Set([...rowsForVals].sort((a, b) => String(a[col.key] || '').localeCompare(String(b[col.key] || '')))
          .map(o => String(cellVal(o, col.key))))]
      : [...new Set(rowsForVals.map(o => String(cellVal(o, col.key))))]
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    const active = filters[col.key]
    const query = String(filterSearch[col.key] || '').trim().toLowerCase()
    const visibleValues = query ? values.filter(v => matchesFilterQuery(v, query)) : values
    const isChecked = v => !active || active.has(v)
    const toggle = v => {
      setFilters(current => {
        const currentAllowed = current[col.key]
        return { ...current, [col.key]: toggleValueIn(currentAllowed, values, v) }
      })
    }
    const close = () => { setOpenFilter(null); columnMenuTrigger.current?.focus() }
    const clearColumnFilter = () => {
      setFilters(current => ({ ...current, [col.key]: undefined }))
      setConditions(current => ({ ...current, [col.key]: undefined }))
      close()
    }
    const sortColumn = dir => {
      setSort({ key: col.key, dir })
      close()
    }
    const menu = (
      <>
        <div className="filter-overlay" onClick={close} />
        <div className="filter-pop tracker-column-pop" style={{ position: 'fixed', left: pos.x, top: pos.y }} onClick={e => e.stopPropagation()} role="dialog" aria-label={`${col.label} sort and filter`}>
          <div className="tracker-column-pop-title"><strong>{col.label}</strong><button type="button" onClick={close} aria-label="Close column menu">×</button></div>
          <button type="button" className="fitem" onClick={() => sortColumn(1)}>⇩ Sort {sortLabels(colType(col.key), col.key).asc}</button>
          <button type="button" className="fitem" onClick={() => sortColumn(-1)}>⇧ Sort {sortLabels(colType(col.key), col.key).desc}</button>
          <button type="button" className="fitem" onClick={clearColumnFilter}>✕ Clear this column filter</button>
          {sort?.key === col.key && <button type="button" className="fitem" onClick={() => { setSort(null); close() }}>Clear sort</button>}
          <ColumnCondition key={col.key} type={colType(col.key)} label={col.label} value={conditions[col.key]} onApply={condition => { setConditions(current => ({ ...current, [col.key]: condition })); close() }} />
          <div className="tracker-column-values">
          <input className="filter-search" type="search" autoFocus aria-label={`Search ${col.label} values`} placeholder={`Search ${col.label}`} value={filterSearch[col.key] || ''}
            onChange={e => setFilterSearch({ ...filterSearch, [col.key]: e.target.value })} name="tracker-search" />
          <label className="fitem">
            <input type="checkbox" ref={el => { if (el) el.indeterminate = visibleValues.some(isChecked) && !visibleValues.every(isChecked) }} checked={visibleValues.length > 0 && visibleValues.every(v => !active || active.has(v))}
              onChange={() => setFilters(current => ({
                ...current,
                [col.key]: toggleSubsetIn(current[col.key], values, visibleValues),
              }))} name="tracker-checkbox" /> (Select All)
          </label>
          <div className="tracker-column-value-list">
          {!visibleValues.length && <p className="hint">No matching values</p>}
          {visibleValues.map(v => (
            <label className="fitem" key={filterValueKey(v)}>
              <input type="checkbox" checked={isChecked(v)} onChange={() => toggle(v)} name="tracker-checkbox-2" /> <span>{filterValueLabel(v)}</span>
            </label>
          ))}
          </div></div>
          <div className="tracker-column-pop-footer"><span>{visibleValues.filter(isChecked).length} of {visibleValues.length} shown selected</span><button type="button" onClick={close}>Done</button></div>
        </div>
      </>
    )
    return <Portal>{menu}</Portal>
  }

  const dateFilterSummary = dateFilterActive && dateFilterState.range
    ? `${OPPORTUNITY_DATE_FIELDS.find(field => field.key === dateFilter.field)?.label || 'Date'} · ${dateFilterState.range[0] || '…'} → ${dateFilterState.range[1] || '…'}`
    : 'Choose a date field and period'

  const activeChips = [
    searchTerm.trim() && { id: 'search', label: `Search: ${searchTerm.trim()}`, remove: () => setSearchTerm('') },
    dateFilterActive && { id: 'date', label: dateFilterSummary, remove: clearDateFilter },
    ...Object.entries(conditions).filter(([key, condition]) => (scope !== 'my' || key !== 'owner') && isConditionActive(condition, colType(key))).map(([key, condition]) => ({
      id: `condition-${key}`, label: `${COLS.find(col => col.key === key)?.label || key}: ${conditionSummary(condition, colType(key))}`,
      remove: () => setConditions(current => ({ ...current, [key]: undefined })),
    })),
    ...Object.entries(filters)
      .filter(([key, allowed]) => allowed instanceof Set && allowed.size && (scope !== 'my' || key !== 'owner'))
      .map(([key, allowed]) => ({
        id: `column-${key}`,
        label: `${COLS.find(col => col.key === key)?.label || key}: ${[...allowed].map(value => !value ? 'Not set' : key === 'owner' ? displayRole(value) : labelFor(key, value) || value).join(', ')}`,
        remove: () => setFilters(current => ({ ...current, [key]: undefined })),
      })),
  ].filter(Boolean)

  return (
    <div className="page tracker-page">
      <h2 className={`workspace-page-title${sheet === 'Opportunities' ? ' workspace-page-title--topbar-duplicate' : ''}`}><Icon name="cards" size={18} /> {sheet}</h2>
      <div className="tracker-grid-shell" ref={gridRef}>
      {!phone && (typeof topContent === 'function' ? topContent({ filters, onStage: (stages, status) => setFilters(current => ({ ...current, stage: new Set(stages), status: new Set([status]) })) }) : topContent)}
      <div className="toolbar">
        <div className="tracker-toolbar-filters">
          <div className="tracker-search-group">
            <OpportunityAiSearch value={activeAi?.query || searchTerm} identity={`${aiIdentity}:${sheet}`}
              context={{ financialYear: store.sales?.fy || '', enums: Object.fromEntries(Object.entries({owner:OWNERS,oppType:OPP_TYPES,prob:PROB_LEVELS,product:PRODUCTS,category:CATEGORIES,bu:BUS,segment:SEGMENTS,status:['Open','Closed','On Hold'],stage:[...new Set(store.opportunities.map(o=>o.stage).filter(Boolean))]}).map(([key,values])=>[key,values.map(value=>({value,label:labelFor(key,value)}))])) }}
              onChange={value => { setAiSearch(null); setSearchTerm(value) }}
              onApply={(plan, query) => { clearAllTableState(); setSearchTerm(''); setOwnerFilter('All'); setSheet('Opportunities'); setSort(plan.sort); setAiSearch({ identity: aiIdentity, query, plan }); setPage(1) }} />
            <button type="button" ref={filterTrigger} className={`tracker-search-filter${activeFilterCount ? ' active' : ''}`} onClick={() => { setOpenFilter(null); setMoreMenuOpen(false); setFiltersOpen(true) }}
              aria-haspopup="dialog" aria-expanded={filtersOpen} aria-label={`Filter opportunities${activeFilterCount ? ` (${activeFilterCount} active)` : ''}`}>
              <Icon name="filter" size={16} /><span>Filters{activeFilterCount ? ` (${activeFilterCount})` : ''}</span>
            </button>
          </div>
        </div>
        <div className="tracker-toolbar-actions">
          <div className="tracker-more-menu" ref={moreMenuRef}>
            <button type="button" className="tracker-more-trigger" aria-haspopup="menu" aria-expanded={moreMenuOpen}
              aria-label="Opportunity actions"
              onClick={() => setMoreMenuOpen(open => !open)}>
              <Icon name="menu" size={phone ? 20 : 15} />{!phone && ' More'}
            </button>
            {moreMenuOpen && (
              <div className="tracker-more-menu-list" role="menu">
                <button type="button" role="menuitem" onClick={() => { exportRows(); setMoreMenuOpen(false) }}>Export to Excel</button>
                {phone && <button type="button" className="mobile-record-view" role="menuitem" onClick={() => { setMobileTable(true); setMoreMenuOpen(false) }}>Open editable table</button>}
                {isAdminRole(store.role) && <button type="button" role="menuitem" onClick={() => { pipelineFileRef.current?.click(); setMoreMenuOpen(false) }}
                  title="Review and merge an Excel pipeline workbook">Import Excel</button>}
              </div>
            )}
          </div>
          {phone && <select name="opportunity-list-view" aria-label="Opportunity list view" value={sheet} onChange={event => setSheet(event.target.value)}><option>Opportunities</option><option>My Orders</option></select>}
          <button type="button" className="tracker-columns-toggle"
            onClick={() => { setColView(colView === 'key' ? 'all' : 'key'); setMobileTable(true) }}
            title={colView === 'key'
              ? 'Show every column in the pipeline sheet'
              : `Show only the working columns: ${KEY_COLS.length} of ${COLS.length}`}>
            {colView === 'key' ? `All ${COLS.length + 1} columns` : 'Key columns'}
          </button>
          <input ref={pipelineFileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={onPipelineFile} name="tracker-file" />
          {store.canPerform?.('opportunities.create') !== false && (onCreateOpportunity || canSeePage(store.role, 'new')) && (onCreateOpportunity ? (
            <button
              className="tracker-create-logo"
            onClick={onCreateOpportunity}
            aria-label="Create opportunity"
            title="Create opportunity"
          >
              <Icon name="plus" size={16} /> Create opportunity
            </button>
          ) : (
            <Link className="tracker-create-logo" to="/new" aria-label="Create opportunity" title="Create opportunity">
              <Icon name="plus" size={16} /> Create opportunity
            </Link>
          ))}
        </div>
        {(activeChips.length > 0 || sort) && (
          <div className="tracker-filter-chips flex flex-wrap items-center gap-1" aria-label="Active filters">
            {activeFilterCount > 0 && <button type="button" className="tracker-filter-chip" onClick={clearAllTableState}>Clear filters</button>}
            {sort && <button type="button" className="tracker-filter-chip" onClick={() => setSort(null)}>Reset sort</button>}
            {activeChips.map(chip => (
              <button key={chip.id} type="button" className="tracker-filter-chip inline-flex items-center gap-1" onClick={chip.remove}
                title={`Remove ${chip.label}`} aria-label={`Remove ${chip.label}`}>
                <span>{chip.label}</span><span aria-hidden="true">×</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {activeAi && <div className="opportunity-ai-results" role="status"><div><strong>AI search · {rows.length} {rows.length === 1 ? 'result' : 'results'}</strong><p>{searchSummary(activeAi.plan)}{activeAi.plan.sort ? ` · Sorted by ${SEARCH_FIELDS[activeAi.plan.sort.key].label} (${activeAi.plan.sort.dir === 1 ? 'ascending' : 'descending'})` : ''}</p></div><button type="button" onClick={() => { setAiSearch(null); setSearchTerm(''); setSort(null) }}>Clear AI search</button></div>}
      {pipelineUploadError && <div className="errbox" role="alert">{pipelineUploadError}</div>}
      {filtersOpen && <OpportunityFilters criteria={criteria} sort={sort} options={filterOptions} columns={COLS} scope={scope} phone={phone} labelFor={labelFor}
        countMatches={draft => filterOpportunityRows(aiRows, draft, filterContext).length}
        onClose={() => setFiltersOpen(false)}
        onApply={draft => { setFilters(draft.filters); setConditions(draft.conditions); setDateFilter(draft.date); setSort(draft.sort); setPage(1) }} />}


      <div className={`mobile-opportunity-cards${mobileTable ? ' is-hidden' : ''}`}>
        <div className="phone-opportunity-list-label">{sheet} · {rows.length} result{rows.length === 1 ? '' : 's'}</div>
        {!pageRows.length && <p>No matching opportunities. Adjust your search or filters.</p>}
        {pageRows.map(o => <PhoneOpportunityRow key={o.id} opportunity={o} canSeeValue due={o.orderDate || o.proposalDate} register={phone && sheet === 'Opportunities'} />)}
      </div>
      <div ref={sheetWrapRef} className={`sheet-wrap fill${mobileTable ? ' phone-table-workspace' : ' mobile-table-collapsed'}`} onScroll={handleSheetScroll}>
        {mobileTable && <div className="phone-table-chrome"><PhoneOverlayHeader /><button type="button" className="mobile-record-view phone-table-close" onClick={() => setMobileTable(false)}>Close table</button></div>}
        {colView === 'key'
          ? <style>{[
            hiddenColumnCss(COLS.map((c, i) => (KEY_COLS.includes(c.key) ? -1 : i)).filter(i => i >= 0)),
            columnWidthCss(COLS.filter(c => KEY_COLS.includes(c.key)), '.shell .opportunities-page .tracker-page .tracker-grid-shell > .sheet-wrap.fill .sheet.cols-key'),
          ].join('\n')}</style>
          : <style>{columnWidthCss(COLS, '.shell .opportunities-page .tracker-page .tracker-grid-shell > .sheet-wrap.fill .sheet:not(.cols-key)', true)}</style>}
        <OpportunityCellEditingProvider>
        <table className={`sheet${colView === 'key' ? ' cols-key' : ''}`}>
          <colgroup>
            <col style={{ width: colView === 'key' ? '3%' : 'var(--tracker-sl-width)' }} />
            {COLS.filter(col => colView === 'all' || KEY_COLS.includes(col.key)).map(col => <col key={col.key} style={{ width: columnWidth(col, colView === 'all') }} />)}
          </colgroup>
          <thead>
            <tr>
              <th className="rowhead">Sl.</th>
              {COLS.map(col => (
                <th key={col.key} className={`th-filter ${filters[col.key] || isConditionActive(conditions[col.key], colType(col.key)) ? 'filtered' : ''}`} title={col.label}
                  aria-sort={sort?.key === col.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" className="tracker-th-control" title={`Sort and filter ${col.label}`}
                    aria-label={`Sort and filter ${col.label}`} aria-haspopup="dialog"
                    aria-expanded={openFilter?.key === col.key} onClick={e => openColumnMenu(col, e)}>
                    <span className="tracker-th-label">{({sellTo:'Customer',oppName:'Opportunity description',prob:'Probability',orderDate:'Order date',proposalDate:'Proposal date'})[col.key] || col.label}</span>
                  </button>
                  {openFilter?.key === col.key && renderFilterPop(col, openFilter)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody ref={pageListRef}>
            {pageRows.map((o, index) => (
              <EditableOpportunityRow key={o.id} prepareEdit={() => store.loadOpportunityDetails?.(o.id) ?? true}>
                <td className="rowhead">{firstRow + index}</td>
                <td onClick={selectCell(o, COLS[0])} className={`oppid ${isSel(o, COLS[0]) ? 'cell-sel' : ''}`}>
                  <span className="tracker-oppid-actions" title={`Customer class: ${customerStatusFor(o)}`}>
                    <Link to={`/opp/${o.id}`} title="Open opportunity workspace">{displayOpportunityId(o.id)}</Link>
                    <OpportunityRowEditButton disabled={!canEditRow(o)} label={displayOpportunityId(o.id)} />
                  </span>
                </td>
                <td onClick={selectCell(o, COLS[1])} className={`tracker-free-text ${isSel(o, COLS[1]) ? 'cell-sel' : ''}`} title={o.sellTo}><span className="tracker-cell-label">{COLS[1].label}</span>{canEditRow(o) ? <EditableOpportunityCell as={WrapInput} disabled={!canEditRow(o)} value={o.sellTo} onChange={upd(o.id, 'sellTo')} title={o.sellTo} label={COLS[1].label} /> : <div className="ro" title="Read only for your role or ownership scope">{o.sellTo || '—'}</div>}</td>
                <td onClick={selectCell(o, COLS[2])} className={isSel(o, COLS[2]) ? 'cell-sel' : ''}>
                  {canEditRow(o) ? <EditableOpportunityCell as="select" value={o.category} label={COLS.find(c => c.key === 'category')?.label} onChange={upd(o.id, 'category')} disabled={!canEditRow(o)}>{CATEGORIES.map(c => <option key={c} value={c}>{labelFor('category', c)}</option>)}</EditableOpportunityCell> : <div className="ro" title="Read only for your role or ownership scope">{o.category || '—'}</div>}
                </td>
                <td onClick={selectCell(o, COLS[3])} className={isSel(o, COLS[3]) ? 'cell-sel' : ''} title={o.location}>{canEditRow(o) ? <EditableOpportunityCell type="text" value={o.location} label={COLS.find(c => c.key === 'location')?.label} onChange={upd(o.id, 'location')} disabled={!canEditRow(o)} /> : <div className="ro" title="Read only for your role or ownership scope">{o.location || '—'}</div>}</td>
                <td onClick={selectCell(o, COLS[4])} className={`cstat ${customerStatusFor(o)} ${isSel(o, COLS[4]) ? 'cell-sel' : ''}`}
                  title="Customer status is managed from the Customer master">
                  <span className={`status-pill status-pill--${customerStatusFor(o).toLowerCase()}`}>
                    {customerStatusFor(o)}
                  </span>
                </td>
                <td onClick={selectCell(o, COLS[5])} className={isSel(o, COLS[5]) ? 'cell-sel' : ''} title={o.eucName}>{canEditRow(o) ? <EditableOpportunityCell type="text" value={o.eucName} label={COLS.find(c => c.key === 'eucName')?.label} onChange={upd(o.id, 'eucName')} disabled={!canEditRow(o)} /> : <div className="ro" title="Read only for your role or ownership scope">{o.eucName || '—'}</div>}</td>
                <td onClick={selectCell(o, COLS[6])} className={isSel(o, COLS[6]) ? 'cell-sel' : ''} title={o.eucLocation}>{canEditRow(o) ? <EditableOpportunityCell type="text" value={o.eucLocation} label={COLS.find(c => c.key === 'eucLocation')?.label} onChange={upd(o.id, 'eucLocation')} disabled={!canEditRow(o)} /> : <div className="ro" title="Read only for your role or ownership scope">{o.eucLocation || '—'}</div>}</td>
                <td onClick={selectCell(o, COLS[7])} className={`tracker-free-text ${isSel(o, COLS[7]) ? 'cell-sel' : ''}`} title={o.oppName}><span className="tracker-cell-label">{COLS[7].label}</span>{canEditRow(o) ? <EditableOpportunityCell as={WrapInput} disabled={!canEditRow(o)} value={o.oppName} onChange={upd(o.id, 'oppName')} title={o.oppName} label={COLS[7].label} /> : <div className="ro" title="Read only for your role or ownership scope">{o.oppName || '—'}</div>}</td>
                <td onClick={selectCell(o, COLS[8])} className={isSel(o, COLS[8]) ? 'cell-sel' : ''}>
                  {canEditRow(o) ? <EditableOpportunityCell as="select" value={o.owner} label={COLS.find(c => c.key === 'owner')?.label} onChange={upd(o.id, 'owner')} disabled={!canEditRow(o) || !canTransfer}>{OWNERS.map(c => <option key={c} value={c}>{labelFor('owner', c)}</option>)}</EditableOpportunityCell> : <div className="ro" title="Read only for your role or ownership scope">{displayRole(o.owner) || '—'}</div>}
                </td>
                <td onClick={selectCell(o, COLS[9])} className={isSel(o, COLS[9]) ? 'cell-sel' : ''}>
                  <span className="tracker-cell-label">{COLS[9].label}</span>
                  {canEditRow(o) ? <EditableOpportunityCell as="select" value={o.oppType} label={COLS.find(c => c.key === 'oppType')?.label} onChange={upd(o.id, 'oppType')} disabled={!canEditRow(o)} aria-label={COLS[9].label}>{OPP_TYPES.map(c => <option key={c} value={c}>{labelFor('oppType', c)}</option>)}</EditableOpportunityCell> : <div className="ro" title="Read only for your role or ownership scope">{o.oppType || '—'}</div>}
                </td>
                <td onClick={selectCell(o, COLS[10])} className={isSel(o, COLS[10]) ? 'cell-sel' : ''}>
                  {canEditRow(o) ? <EditableOpportunityCell as="select" value={o.bu} label={COLS.find(c => c.key === 'bu')?.label} onChange={upd(o.id, 'bu')} disabled={!canEditRow(o)}>{BUS.map(c => <option key={c} value={c}>{labelFor('bu', c)}</option>)}</EditableOpportunityCell> : <div className="ro" title="Read only for your role or ownership scope">{o.bu || '—'}</div>}
                </td>
                <td onClick={selectCell(o, COLS[11])} className={isSel(o, COLS[11]) ? 'cell-sel' : ''}>
                  {canEditRow(o) ? <EditableOpportunityCell as="select" value={o.segment} label={COLS.find(c => c.key === 'segment')?.label} onChange={upd(o.id, 'segment')} disabled={!canEditRow(o)}>{SEGMENTS.map(c => <option key={c} value={c}>{labelFor('segment', c)}</option>)}</EditableOpportunityCell> : <div className="ro" title="Read only for your role or ownership scope">{o.segment || '—'}</div>}
                </td>
                {/* Product is multi-value, so the cell is a checkbox popover
                    rather than a single-value <select> that would render blank
                    for any opportunity carrying more than one product. */}
                <td onClick={selectCell(o, COLS[12])} className={isSel(o, COLS[12]) ? 'cell-sel' : ''}>
                  <EditableOpportunityCell type="multi" label={COLS[12].label} value={productList(o.product)} displayValue={productDisplayLabel(o.product)} disabled={!canEditRow(o)}
                    options={PRODUCTS.map(value => ({ value, label: value === 'Various' ? 'Multiple equipment items' : value }))} onChange={upd(o.id, 'product')} />
                </td>
                {/* Suggested from stage, account class and how long the row has
                    sat still — always a suggestion, never a write. */}
                <td onClick={selectCell(o, COLS[13])} className={isSel(o, COLS[13]) ? 'cell-sel' : ''}>
                  <span className="tracker-cell-label">{COLS[13].label}</span>
                  {(() => {
                    const sug = suggestProbability(o, store.getProposal(o.id), store.config)
                    const factors = sug?.why.split(' · ').slice(0, 2).join(', ')
                    const hasMoreFactors = (sug?.why.split(' · ').length || 0) > 2
                    return (
                      canEditRow(o) ? <EditableOpportunityCell as="select" value={o.prob || ''} label={COLS.find(c => c.key === 'prob')?.label} onChange={upd(o.id, 'prob')} disabled={!canEditRow(o)} aria-label={COLS[13].label}
                        className={!o.prob && sug ? 'derived' : ''}
                        data-explain-title={sug ? `Suggested probability · ${sug.level}` : undefined}
                        data-explain={sug ? `Based on ${factors}${hasMoreFactors ? ' and other factors' : ''}. Select to apply.` : undefined}>
                        <option value="">Select probability</option>
                        {PROB_LEVELS.map(p => <option key={p} value={p}>{labelFor('prob', p)}</option>)}
                      </EditableOpportunityCell> : <div className="ro" tabIndex={0}
                        data-explain-title="Probability · read only"
                        data-explain={sug ? `Suggested ${sug.level} from ${factors}. Read only for your role or ownership scope.` : `Current value: ${o.prob || 'not set'}. Read only for your role or ownership scope.`}
                      >{o.prob || (sug ? sug.level : '—')}</div>
                    )
                  })()}
                </td>
                {/* Value and COGS are open tracker inputs for every role. GM and
                    GM% remain derived from them and are therefore read only. */}
                <td onClick={selectCell(o, COLS[14])} className={`num ${isSel(o, COLS[14]) ? 'cell-sel' : ''}`}><span className="tracker-cell-label">{COLS[14].label}</span><EditableOpportunityCell type="number" min="0" step="any" value={o.valueK == null ? '' : o.valueK * 1000} label={COLS.find(c => c.key === 'valueK')?.label} onChange={upd(o.id, 'valueK')} disabled={!canEditRow(o)} aria-label={COLS[14].label} placeholder="-" /></td>
                <td onClick={selectCell(o, COLS[15])} className={`num ${isSel(o, COLS[15]) ? 'cell-sel' : ''}`}><EditableOpportunityCell type="number" min="0" step="any" value={o.cogsK == null ? '' : o.cogsK * 1000} label={COLS.find(c => c.key === 'cogsK')?.label} onChange={upd(o.id, 'cogsK')} disabled={!canEditRow(o)} placeholder="-" /></td>
                <td onClick={selectCell(o, COLS[16])} className={`num ${isSel(o, COLS[16]) ? 'cell-sel' : ''}`}>{fmt(gmK(o) * 1000, 2)}</td>
                {gmPct(o)
                  ? <td onClick={selectCell(o, COLS[17])} className={`num ${isSel(o, COLS[17]) ? 'cell-sel' : ''}`}>{gmPct(o)}</td>
                  : <td onClick={selectCell(o, COLS[17])} className={`${isSel(o, COLS[17]) ? 'cell-sel' : ''}`}>—</td>}
                {/* Created and Proposal are system-stamped — read only, like Last Updated. */}
                <td onClick={selectCell(o, COLS[18])} className={isSel(o, COLS[18]) ? 'cell-sel' : ''}>
                  <div className="ro" title="Stamped when the opportunity was created — read only">{ddMMyyyy(o.createDate) || '—'}</div>
                </td>
                <td onClick={selectCell(o, COLS[19])} className={isSel(o, COLS[19]) ? 'cell-sel' : ''}>
                  <span className="tracker-cell-label">{COLS[19].label}</span>
                  <div className="ro" title="Stamped when the proposal was sent — read only">{ddMMyyyy(o.proposalDate) || '—'}</div>
                </td>
                {/* The salesperson's own forecast dates — mandatory, per the 13 Aug review:
                    "he has to put some date. It can be wrong, but he has to put some date." */}
                <td onClick={selectCell(o, COLS[20])}
                  className={`${isSel(o, COLS[20]) ? 'cell-sel ' : ''}${o.status === 'Open' && !o.orderDate ? 'need' : ''}`.trim()}>
                  <span className="tracker-cell-label">{COLS[20].label}</span>
                  <TrackerDateCell value={o.orderDate || ''} onChange={upd(o.id, 'orderDate')} disabled={!canEditRow(o)} label={COLS[20].label}
                    title={o.orderDate ? '' : 'Expected order date is required on an open opportunity'} /></td>
                <td onClick={selectCell(o, COLS[21])} className={isSel(o, COLS[21]) ? 'cell-sel' : ''}>{fiscalQuarter(o.orderDate) || '—'}</td>
                <td onClick={selectCell(o, COLS[22])}
                  className={`${isSel(o, COLS[22]) ? 'cell-sel ' : ''}`.trim()}>
                  <TrackerDateCell value={o.invoiceDate || ''} onChange={upd(o.id, 'invoiceDate')} disabled={!canEditRow(o)} label={COLS[22].label}
                    title="Invoice date" /></td>
                <td onClick={selectCell(o, COLS[23])} className={isSel(o, COLS[23]) ? 'cell-sel' : ''}>
                  <EditableOpportunityCell as="select" value={o.status} label={COLS.find(c => c.key === 'status')?.label} onChange={upd(o.id, 'status')} disabled={!canEditRow(o)}>
                    <option>Open</option><option>On Hold</option><option>Closed</option>
                  </EditableOpportunityCell>
                </td>
                <td onClick={selectCell(o, COLS[24])} className={isSel(o, COLS[24]) ? 'cell-sel' : ''}>
                  <span className="tracker-cell-label">{COLS[24].label}</span>
                  <div className="tracker-stage-cell">
                    {o.status === 'Closed' && ['Won', 'Lost'].includes(o.stage) ? (
                      <div className={`tracker-terminal-stage ${o.stage.toLowerCase()}`} title="Terminal outcome; workflow milestone shown below">
                        <span className="tracker-outcome-label">{o.stage}</span>
                      </div>
                    ) : (
                      <div className="ro" title="Workflow stages are changed from the opportunity workspace">{o.stage || '—'}</div>
                    )}
                    {canEditRow(o) && <OpportunityRowEditOnly>{o.status === 'Closed' && !['Won', 'Lost'].includes(o.stage) && <MarkWonControl opp={o} store={store} />}</OpportunityRowEditOnly>}
                  </div>
                </td>
                <td onClick={selectCell(o, COLS[25])}
                  className={`${o.status === 'Closed' && !o.closedReason ? 'err' : ''} ${isSel(o, COLS[25]) ? 'cell-sel' : ''}`}
                  title={o.status === 'Closed' && !o.closedReason ? 'Closed Reason is mandatory — pick a justification' : ''}>
                  <span className="tracker-cell-label">{COLS[25].label}</span>
                  {o.status === 'Closed' ? (
                    <EditableOpportunityCell as="select" value={o.closedReason} label={COLS.find(c => c.key === 'closedReason')?.label} onChange={upd(o.id, 'closedReason')} disabled={!canEditRow(o)} aria-label={COLS[25].label}
                      title={o.closedReason === 'Other' && o.closedReasonNote ? `${o.closedReason} — ${o.closedReasonNote}` : ''}>
                      <option value="">— required —</option>
                      {[...(o.stage === 'Won' ? WON_REASONS : CLOSE_REASONS), ...(o.closedReason && !(o.stage === 'Won' ? WON_REASONS : CLOSE_REASONS).includes(o.closedReason) ? [o.closedReason] : [])]
                        .map(r => <option key={r}>{r}</option>)}
                    </EditableOpportunityCell>
                  ) : ''}
                </td>
                <td onClick={selectCell(o, COLS[26])} className={isSel(o, COLS[26]) ? 'cell-sel' : ''} title={o.contactPerson}>{canEditRow(o) ? <EditableOpportunityCell type="text" value={o.contactPerson} label={COLS.find(c => c.key === 'contactPerson')?.label} onChange={upd(o.id, 'contactPerson')} disabled={!canEditRow(o)} /> : <div className="ro" title="Read only for your role or ownership scope">{o.contactPerson || '—'}</div>}</td>
                <td onClick={selectCell(o, COLS[27])} className={isSel(o, COLS[27]) ? 'cell-sel' : ''} title={o.contactPhone}>{canEditRow(o) ? <EditableOpportunityCell type="text" value={o.contactPhone} label={COLS.find(c => c.key === 'contactPhone')?.label} onChange={upd(o.id, 'contactPhone')} disabled={!canEditRow(o)} /> : <div className="ro" title="Read only for your role or ownership scope">{o.contactPhone || '—'}</div>}</td>
                <td onClick={selectCell(o, COLS[28])} className={isSel(o, COLS[28]) ? 'cell-sel' : ''}>
                  <div className="ro" title="Auto-stamped — read only">{ddMmmYY(o.lastUpdated)}</div>
                </td>
                <td onClick={selectCell(o, COLS[29])} className={isSel(o, COLS[29]) ? 'cell-sel' : ''} style={{ textAlign: 'center' }}>
                  <EditableOpportunityCell type="checkbox" label="Forecast" checked={!!o.forecast} onChange={upd(o.id, 'forecast')} disabled={!canEditRow(o)} title="Include for roll-up" />
                </td>
                <td onClick={selectCell(o, COLS[30])} className={isSel(o, COLS[30]) ? 'cell-sel' : ''} title={o.remarks}><EditableOpportunityCell type="text" value={o.remarks} label={COLS.find(c => c.key === 'remarks')?.label} onChange={upd(o.id, 'remarks')} disabled={!canEditRow(o)} /></td>

              </EditableOpportunityRow>
            ))}
            {!rows.length && (
              <tr onInputCapture={()=>markWorkspaceEditing([{entity:"opportunities",id:o.id}])}>
                <td colSpan={COLS.length + 1} className="tracker-empty-state">
                  <strong>{base.length ? 'No opportunities match these filters.' : 'No opportunities are loaded for this view.'}</strong>
                  <span>{base.length
                    ? 'Try changing the search or removing an active filter.'
                    : sheet === 'My Orders'
                      ? 'Closed history is empty in the current workspace.'
                      : ownerFilter === 'All'
                        ? 'All Opportunities is selected; the workspace currently contains no rows to display.'
                        : 'Switch the owner filter to All Opportunities to view the full loaded workspace.'}</span>
                  {(base.length > 0 || activeFilterCount > 0 || ownerFilter !== 'All') && (
                    <button type="button" onClick={clearAllTableState}>Clear all filters</button>
                  )}
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td className="rowhead"></td>
              <td colSpan={14}>Totals {rows.length < base.length && <span className="hint">({rows.length} matching rows — filters active)</span>}</td>
              <td className="num">{fmtRupeesFromK(totals.v)}</td>
              <td className="num">{fmtRupeesFromK(totals.c)}</td>
              <td className="num">{fmtRupeesFromK(totals.v - totals.c)}</td>
              <td className="num" style={{ color: 'var(--amber-text)' }}>{totals.v ? Math.round(((totals.v - totals.c) / totals.v) * 100) + '%' : ''}</td>
              <td colSpan={13}></td>
            </tr>
          </tfoot>
        </table>
        </OpportunityCellEditingProvider>
      </div>
      <div className="tracker-pagination" ref={pagePagerRef} aria-label="Opportunity table pages">
        <span className="tracker-pagination-range">{firstRow}–{lastRow} of {rows.length}</span>
        <div className="tracker-pagination-controls">
          <button type="button" onClick={() => setPage(1)} disabled={currentPage <= 1} aria-label="First page">First</button>
          <button type="button" onClick={() => setPage(currentPage - 1)} disabled={currentPage <= 1} aria-label="Previous page">Previous</button>
          <span>Page {currentPage} of {pageCount}</span>
          <PhonePagePicker page={currentPage} pageCount={pageCount} onPageChange={setPage} />
          <button type="button" onClick={() => setPage(currentPage + 1)} disabled={currentPage >= pageCount} aria-label="Next page">Next</button>
          <button type="button" onClick={() => setPage(pageCount)} disabled={currentPage >= pageCount} aria-label="Last page">Last</button>
        </div>
      </div>
      {afterTable}
      </div>
      {pipelinePreview && <PipelineUploadPreview preview={pipelinePreview} onClose={() => setPipelinePreview(null)} onImport={async reviewToken => {
        try {
          const result = await store.importWorkbookData(pipelinePreview.importData, reviewToken)
          if (!result.ok) {
            setPipelineUploadError(result.error)
            return
          }
          setPipelinePreview(null)
          setPipelineUploadError(`Imported ${result.opportunities} opportunities and ${result.customers} customers. Existing edits were preserved.`)
        } catch (error) {
          setPipelineUploadError(error?.message || 'The workbook could not be imported. Refresh and preview again.')
          throw error
        }
      }} />}

      <div className="sheet-tabs">
        {['Opportunities', 'My Orders'].map(t => (
          <div key={t} className={`tab ${sheet === t ? 'active' : ''}`}
            onClick={() => setSheet(t)}>
            {t}
          </div>
        ))}
        <div className="tab">＋</div>
      </div>

      {closePending && (
        <Modal title="Close opportunity" onClose={cancelClose}>
          <p className="hint">Choose the outcome, then select the reason before this opportunity is closed.</p>
          <div className="tracker-close-outcome-options" role="radiogroup" aria-label="Close opportunity outcome">
            {['Lost', 'Won', 'Abandoned', 'No Bid'].map(outcome => (
              <label key={outcome} className={`tracker-close-outcome-option ${outcome.toLowerCase()}${closePending.stage === outcome ? ' selected' : ''}`}>
                <input type="radio" name="tracker-close-outcome" value={outcome} checked={closePending.stage === outcome}
                  onChange={() => { setClosePending(pending => ({ ...pending, stage: outcome })); setCloseReason(''); setCloseReasonNote('') }} />
                <span>Mark as {outcome}</span>
              </label>
            ))}
          </div>
          {closePending.stage && (
            <>
              <label htmlFor="tracker-close-reason">{closePending.stage} reason</label>
              <select
                id="tracker-close-reason"
                value={closeReason}
                onChange={e => {
                  setCloseReason(e.target.value)
                  if (e.target.value !== 'Other') setCloseReasonNote('')
                }}
                autoFocus
              >
                <option value="">— select a reason —</option>
                {(closePending.stage === 'Won' ? WON_REASONS : CLOSE_REASONS).map(reason => <option key={reason} value={reason}>{reason}</option>)}
              </select>
              {closeReason === 'Other' && (
                <label className="tracker-close-reason-note" htmlFor="tracker-close-reason-note">
                  Additional explanation
                  <textarea
                    id="tracker-close-reason-note"
                    value={closeReasonNote}
                    onChange={e => setCloseReasonNote(e.target.value)}
                    maxLength={240}
                    placeholder="Enter the reason"
                    rows={3}
                  />
                </label>
              )}
            </>
          )}
          <div className="forms-actions">
              <button className="primary" disabled={!closePending.stage || !closeReason || (closeReason === 'Other' && !closeReasonNote.trim())} onClick={confirmClose}>Confirm</button>
            <button onClick={cancelClose}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
