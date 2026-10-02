import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { CLOSE_REASONS, WON_REASONS, PROB_LEVELS, CATEGORIES, OWNERS, OPP_TYPES, BUS, SEGMENTS, PRODUCTS, ROLES, displayOpportunityId } from '../seed.js'
import { fmt, fmtRupeesFromK, rupeesToK, mmmYY, ddMmmYY, stageClass, productList, productLabel, productDisplayLabel, sameCustomer, displayRole, OPPORTUNITY_DATE_FIELDS, OPPORTUNITY_PERIODS, opportunityDateRange } from '../utils.js'
import { downloadTableXlsx } from '../proposal/tableExcelExport.js'
import { useFormulaBar } from '../formulabar.jsx'
import { useDrawer } from '../drawer.jsx'
import { nextActionWith } from '../gates.js'
import { suggestProbability } from '../insights.js'
import { MarkWonControl, Modal, Portal } from '../ui.jsx'
import { Icon, ModaeImageLogo } from '../icons.jsx'
import { workflowStageLabelFor } from '../workflowStage.js'
import { parsePipelineFile } from '../pipelineImport.js'
import {
  filterValueKey, filterValueLabel, matchesFilterQuery,
  toggleSubsetIn, toggleValueIn,
} from '../columnFilter.js'
import { colType, compareVals, matchesGlobalSearch, sortLabels } from '../trackerFilters.js'

const DEFAULT_DATE_FILTER = { field: 'orderDate', period: 'all', date: '', from: '', to: '' }

// Columns with their real-sheet letters (row number = Sl + 2, as in the sheet).
// `w` is the column's share of the sheet width — free text gets the generous
// shares, single-token chips the thin ones. The two views read the weights
// differently (see columnWidthCss): the key view divides the viewport between
// its 9 columns and wraps what does not fit, while the all-31 view turns the
// weights into px widths and scrolls sideways. `wAll` overrides `w` in the
// all-31 view, where the identity and date columns earn a bigger slice.
export const COLS = [
  // 11, not 8: an opp ID is 9 characters and must never wrap — at 8 the key
  // view gave the column ~64px against the ~66px the ID needs, so exactly one
  // character spilled onto a second line.
  { key: 'id', letter: 'C', label: 'Opp ID', w: 11, wAll: 13, wKey: 12 },
  { key: 'sellTo', letter: 'D', label: 'Sell To Customer*', w: 16, wAll: 13, wKey: 17 },
  { key: 'category', letter: 'E', label: 'Category', w: 6 },
  { key: 'location', letter: 'F', label: 'Location', w: 6 },
  { key: 'customerStatus', letter: 'G', label: 'Customer Status', w: 5 },
  { key: 'eucName', letter: 'H', label: 'EUC Name*', w: 8 },
  { key: 'eucLocation', letter: 'I', label: 'EUC Location', w: 6 },
  { key: 'oppName', letter: 'J', label: 'Opportunity Name/Description*', w: 22, wAll: 18, wKey: 27 },
  { key: 'owner', letter: 'K', label: 'Owner', w: 4 },
  { key: 'oppType', letter: 'L', label: 'Opp Type', w: 10, wAll: 8, wKey: 10 },
  { key: 'bu', letter: 'M', label: 'BU', w: 4 },
  { key: 'segment', letter: 'N', label: 'Segment', w: 5 },
  { key: 'product', letter: 'O', label: 'Equipment / Product Family', w: 6 },
  { key: 'prob', letter: 'P', label: 'Prob (%)', w: 9, wAll: 7, wKey: 8 },
  { key: 'valueK', letter: 'Q', label: 'Value (₹)*', num: true, w: 8, wKey: 9 },
  { key: 'cogsK', letter: 'R', label: 'COGS (₹)*', num: true, w: 5 },
  { key: 'gmK', letter: 'S', label: 'GM (₹)', num: true, w: 4 },
  { key: 'gmPct', letter: 'T', label: 'GM%', num: true, w: 3 },
  { key: 'createDate', letter: 'U', label: 'Create Date', w: 5, wAll: 7 },
  { key: 'proposalDate', letter: 'V', label: 'Proposal Send Date', w: 5, wAll: 7, wKey: 12 },
  { key: 'orderDate', letter: 'W', label: 'Expected Order Date', w: 14, wAll: 9, wKey: 12 },
  { key: 'invoiceDate', letter: 'X', label: 'Expected Ship Date', w: 7, wAll: 9 },
  { key: 'status', letter: 'Y', label: 'Status*', w: 5 },
  { key: 'stage', letter: 'Z', label: 'Stage*', w: 11, wAll: 8, wKey: 13 },
  { key: 'closedReason', letter: 'AA', label: 'Closed Reason*', w: 6 },
  { key: 'contactPerson', letter: 'AB', label: 'Contact Person*', w: 7 },
  { key: 'contactPhone', letter: 'AC', label: 'Contact Phone #*', w: 6 },
  { key: 'lastUpdated', letter: 'AD', label: 'Last Updated', w: 5, wAll: 7 },
  { key: 'forecast', letter: 'AE', label: 'Forecast', w: 3 },
  { key: 'remarks', letter: 'AF', label: 'Update/Remarks', w: 10 },
  { key: 'nextActionOwner', letter: 'AG', label: 'Next Action', w: 11, wKey: 15 },
]

// The columns a sales owner actually works from, in Biji's words on 13 Aug:
// "Opportunity ID, Customer, Opportunity Name, Stage, Probability… I need
// value, proposal send date, expected order date… and I should know where is the next action
// pending." He was explicit that Opportunity Owner and Updated are not
// required — a rep filtered to their own rows already knows the owner.
const KEY_COLS = ['id', 'sellTo', 'oppName', 'stage', 'oppType', 'prob', 'valueK', 'proposalDate', 'orderDate', 'nextActionOwner']

function PipelineUploadPreview({ preview, onClose }) {
  const { fileName, sheetName, headers, rows, previewRows, missing } = preview
  const shown = previewRows.slice(0, 25)
  return (
    <Modal title={`Pipeline upload preview — ${fileName}`} onClose={onClose} wide className="workbook-preview-modal">
      <p className="hint">
        This is only a preview. Nothing has been imported or saved.
        {' '}{rows.length} row{rows.length === 1 ? '' : 's'} read from {sheetName || 'the first sheet'}.
      </p>
      {missing.length > 0 && (
        <div className="warnbox" role="alert">
          The preview could not find: {missing.map(key => key === 'sellTo' ? 'Customer' : 'Opportunity Name').join(' and ')}.
          Check the workbook headings before the later migration step.
        </div>
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
      <div className="form-actions" style={{ marginTop: 12 }}>
        <button type="button" onClick={onClose}>Close preview</button>
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

// Both views size their columns from COLS[].w, but they spend it differently.
//
// Key view: table-layout: fixed, nothing scrolls sideways, so the 9 columns
// divide the viewport between them as percentages renormalised over that set —
// that way the key view is not left with a 9-column table filling 40% of the
// width. Anything too long for its share wraps onto a second line.
//
// All-31 view: 31 columns cannot share one viewport and stay readable (it came
// to ~37px each at 1366px), so the weights become px widths and the sheet
// scrolls sideways inside .sheet-wrap instead.
//
// Same nth-child indexing as hiddenColumnCss: the Sl rowhead is child 1, so
// COLS[i] is child i + 2. Only the Sl rowhead lives outside COLS.
// Percentages must stay plain — Chrome resolves a calc() containing a
// percentage as `auto` for fixed-layout column widths, which silently
// collapses every column to an equal share and undoes the whole point.
const ROWHEAD_PCT = 2.6
// px per weight unit in the scrolling view, and the floor below which a column
// is too narrow to read its own header. Sums to a sheet about 3000px wide.
const PX_PER_UNIT = 13
const MIN_COL_PX = 78
const ROWHEAD_PX = 34

function columnWidthCss(cols, scope, all = false) {
  const share = c => (all && c.wAll) || (!all && c.wKey) || c.w
  const rule = (sel, value) => `${scope} thead tr > ${sel}, ${scope} tbody tr > ${sel} { ${value} }`
  const label = value => `--tracker-cell-label: ${JSON.stringify(value)};`
  if (all) {
    const px = c => Math.max(MIN_COL_PX, Math.round(share(c) * PX_PER_UNIT))
    return [
      rule(':nth-child(1)', `width: ${ROWHEAD_PX}px; min-width: ${ROWHEAD_PX}px; ${label('SL')}`),
      ...cols.map(c => rule(`:nth-child(${COLS.indexOf(c) + 2})`, `min-width: ${px(c)}px; ${label(c.label)}`)),
    ].join('\n')
  }
  const total = cols.reduce((sum, c) => sum + share(c), 0)
  const budget = 100 - ROWHEAD_PCT
  const pct = value => `width: ${value.toFixed(3)}%;`
  return [
    rule(':nth-child(1)', `${pct(ROWHEAD_PCT)} ${label('SL')}`),
    ...cols.map(c => rule(`:nth-child(${COLS.indexOf(c) + 2})`, `${pct((share(c) / total) * budget)} ${label(c.label)}`)),
  ].join('\n')
}

// A cell whose text has to wrap. <input> is single-line by construction, so the
// wide free-text columns of the key view use a textarea grown to fit its own
// content instead. Enter is swallowed: these are one-value fields that happen
// to need two lines, not multiline notes. The observer watches the cell, not
// the textarea — resizing ourselves would feed our own notifications back.
function WrapInput({ value, onChange, title }) {
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
    <textarea ref={ref} className="wrapcell" rows={1} value={value} title={title}
      onKeyDown={e => { if (e.key === 'Enter') e.preventDefault() }}
      onChange={e => {
        // Enter is blocked above, but a paste can still carry newlines into a
        // field the rest of the app renders as one line.
        e.target.value = e.target.value.replace(/\s*\n+\s*/g, ' ')
        onChange(e)
      }} />
  )
}

// A capturing window listener sits on the propagation path of every element's
// scroll event, so a popover that scrolls its own overflow used to close itself.
// Harmless while the lists were short; fatal once they scroll or take arrow keys.
const scrolledInsidePopover = event => {
  const target = event.target
  return !!(target && target.nodeType === 1 && target.closest?.('.filter-pop'))
}

export default function Tracker({ initialOwnerFilter, onCreateOpportunity }) {
  const store = useStore()
  const fb = useFormulaBar()
  const drawer = useDrawer()
  const [sheet, setSheet] = useState('Opportunities') // Opportunities | My Orders

  const isSalesRep = OWNERS.includes(store.role)
  const isManager = ROLES[store.role]?.admin || ROLES[store.role]?.commercial
  const defaultOwnerFilter = initialOwnerFilter || (isSalesRep && !isManager ? 'Mine' : 'All')
  const [ownerFilter, setOwnerFilter] = useState(defaultOwnerFilter)

  const [filters, setFilters] = useState({})           // col key -> Set of allowed display values
  const [sort, setSort] = useState(null)               // { key, dir: 1 | -1 }
  const [openFilter, setOpenFilter] = useState(null)   // { key, x, y } of the open dropdown
  const [filterSearch, setFilterSearch] = useState({})
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [dateFilter, setDateFilter] = useState(DEFAULT_DATE_FILTER)
  const [dateFilterDraft, setDateFilterDraft] = useState(DEFAULT_DATE_FILTER)
  const [dateFilterOpen, setDateFilterOpen] = useState(false)
  const [pipelinePreview, setPipelinePreview] = useState(null)
  const [pipelineUploadError, setPipelineUploadError] = useState('')
  const pipelineFileRef = useRef(null)
  const [dateFilterPos, setDateFilterPos] = useState(null)
  const [productPick, setProductPick] = useState(null) // { id, x, y } of the open product picker
  const [closePending, setClosePending] = useState(null) // { id, stage } awaiting outcome and reason
  const [closeReason, setCloseReason] = useState('')
  const [closeReasonNote, setCloseReasonNote] = useState('')
  const sheetWrapRef = useRef(null)
  const lastSheetScrollLeft = useRef(0)
  const horizontalGestureNudged = useRef(false)
  const horizontalGestureTimer = useRef(null)
  // Sales owners open on the eight columns they work from; everyone else on the
  // full sheet. Either can switch — nothing is taken away, only folded.
  const [colView, setColView] = useState(() => ((OWNERS.includes(store.role)
    && !(ROLES[store.role]?.admin || ROLES[store.role]?.commercial)) ? 'key' : 'all'))

  useEffect(() => {
    if (!openFilter) return undefined
    const close = event => {
      if (event.key === 'Escape') setOpenFilter(null)
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
    if (!dateFilterOpen) return undefined
    const close = event => {
      if (event.key === 'Escape') setDateFilterOpen(false)
    }
    const onResize = () => setDateFilterOpen(false)
    const onScroll = event => { if (!scrolledInsidePopover(event)) setDateFilterOpen(false) }
    window.addEventListener('keydown', close)
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('keydown', close)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [dateFilterOpen])

  const gmK = o => (o.valueK || 0) - (o.cogsK || 0)
  const gmPct = o => (o.valueK ? Math.round((gmK(o) / o.valueK) * 100) + '%' : null)
  const customerStatusFor = o => store.customers.find(c => sameCustomer(c.name, o.sellTo))?.status || o.customerStatus || 'Blue'

  // Display value used for filtering & sorting (what the user sees in the cell).
  const cellVal = (o, key) => {
    switch (key) {
      case 'customerStatus': return customerStatusFor(o)
      case 'gmK': return gmK(o) * 1000
      case 'gmPct': return gmPct(o) || '—'
      case 'valueK': return (o.valueK || 0) * 1000
      case 'cogsK': return (o.cogsK || 0) * 1000
      case 'createDate': case 'proposalDate': return mmmYY(o[key])
      case 'orderDate': case 'invoiceDate': return o[key] ? mmmYY(o[key]) : ''
      case 'lastUpdated': return ddMmmYY(o[key])
      case 'forecast': return o.forecast ? '✓ Checked' : '☐ Unchecked'
      case 'prob': return o.prob || ''
      case 'product': return productLabel(o.product).replace(/\bVarious\b/g, 'Multiple equipment items')
      case 'owner': return displayRole(o.owner)
      case 'nextActionOwner': return displayRole(o.nextActionOwner || nextActionWith(o, store.getProposal(o.id), store).owner || '')
      default: return o[key] ?? ''
    }
  }

  const all = [...store.opportunities].sort((a, b) => a.sl - b.sl)
  const owners = [...(isSalesRep ? ['Mine'] : []), 'All', ...new Set(all.map(o => o.owner))]
  const base = all.filter(o =>
    (ownerFilter === 'Mine' ? o.owner === store.role : ownerFilter === 'All' || o.owner === ownerFilter) &&
    (sheet !== 'My Orders' || o.status === 'Closed'))

  const searchableBase = base.filter(o => matchesGlobalSearch(o, searchTerm, COLS, cellVal))
  const statusOptions = [...new Set(all.map(o => o.status).filter(Boolean))].sort()
  const statusFilteredBase = statusFilter
    ? searchableBase.filter(o => o.status === statusFilter)
    : searchableBase

  // Filters are derived from the current searchable rows so toolbar search,
  // owner selection, and every column filter always compose predictably.
  const applyFilters = nextFilters => setFilters(nextFilters)
  const matchesFilters = (o, activeFilters = filters, except = null) =>
    Object.entries(activeFilters).every(([key, allowed]) =>
      key === except || !allowed || allowed.has(String(cellVal(o, key))))

  const dateFilterState = opportunityDateRange(dateFilter.period, dateFilter)
  const dateFilterActive = !!dateFilterState.range
  const matchesDateFilter = o => {
    if (!dateFilterActive) return true
    const value = String(o[dateFilter.field] || '').slice(0, 10)
    if (!value) return false
    const [from, to] = dateFilterState.range
    return (!from || value >= from) && (!to || value <= to)
  }
  const dateFilteredBase = statusFilteredBase.filter(o => matchesDateFilter(o))

  // Analytics bars land here pre-filtered via query params (?owner= / ?oppType= / ?bu= / ?stage=).
  const [params, setParams] = useSearchParams()
  useEffect(() => {
    if (![...params.keys()].length) return
    const owner = params.get('owner')
    if (owner) setOwnerFilter(owner)
    const next = {}
    for (const key of ['oppType', 'bu', 'stage']) {
      const v = params.get(key)
      if (v) next[key] = new Set(v.split(',').map(value => value.trim()).filter(Boolean))
    }
    if (Object.keys(next).length) applyFilters(next)
    setParams({}, { replace: true })
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps
  const DATE_KEYS = ['createDate', 'proposalDate', 'orderDate', 'invoiceDate', 'lastUpdated']
  const sortVal = (o, key) => (DATE_KEYS.includes(key) ? (o[key] || '') : cellVal(o, key))

  let rows = dateFilteredBase.filter(o => matchesFilters(o))
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

  const totals = rows.reduce((t, o) => ({ v: t.v + (+o.valueK || 0), c: t.c + (+o.cogsK || 0) }), { v: 0, c: 0 })
  const workspaceLoading = ['connecting', 'reconnecting'].includes(store.liveSyncStatus)
  const resultCountLabel = workspaceLoading
    ? 'Loading shared data…'
    : rows.length === base.length
    ? `${base.length} loaded`
    : `${rows.length} of ${base.length} shown`
  const activeFilterCount = Object.values(filters).filter(value => value instanceof Set).length
    + (dateFilterActive || dateFilterState.error ? 1 : 0)
    + (searchTerm.trim() ? 1 : 0)
    + (statusFilter ? 1 : 0)

  const clearAllTableState = () => {
    setSearchTerm('')
    setStatusFilter('')
    setOwnerFilter(defaultOwnerFilter)
    setFilters({})
    setSort(null)
    setFilterSearch({})
    setOpenFilter(null)
    setDateFilter(DEFAULT_DATE_FILTER)
    setDateFilterDraft(DEFAULT_DATE_FILTER)
    setDateFilterOpen(false)
  }

  const openDateFilterMenu = event => {
    event.stopPropagation()
    if (dateFilterOpen) {
      setDateFilterOpen(false)
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    setDateFilterDraft({ ...dateFilter })
    setDateFilterPos({
      x: Math.max(8, Math.min(rect.left, window.innerWidth - 330)),
      y: Math.min(rect.bottom + 4, window.innerHeight - 390),
    })
    setOpenFilter(null)
    setDateFilterOpen(true)
  }

  const applyDateFilter = () => {
    const nextState = opportunityDateRange(dateFilterDraft.period, dateFilterDraft)
    if (nextState.error) return
    setDateFilter({ ...dateFilterDraft })
    setDateFilterOpen(false)
  }

  const clearDateFilter = () => {
    setDateFilter(DEFAULT_DATE_FILTER)
    setDateFilterDraft(DEFAULT_DATE_FILTER)
    setDateFilterOpen(false)
  }

  const openColumnMenu = (col, event) => {
    event.stopPropagation()
    setDateFilterOpen(false)
    if (openFilter?.key === col.key) {
      setOpenFilter(null)
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    setOpenFilter({
      key: col.key,
      x: Math.max(8, Math.min(rect.left, window.innerWidth - 230)),
      y: Math.min(rect.bottom + 4, window.innerHeight - 330),
    })
  }

  const upd = (id, field) => e => {
    let value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    const current = store.opportunities.find(o => o.id === id)
    if (field === 'invoiceDate' && value && current?.orderDate && value <= current.orderDate) return
    if (field === 'orderDate' && value && current?.invoiceDate && value >= current.invoiceDate) return
    // Numeric columns must store numbers so margin calculations and proposal
    // write-back comparisons remain stable.
    if (field === 'valueK' || field === 'cogsK') value = rupeesToK(e.target.value)
    const patch = { [field]: value }
    // Reopening clears the closure fields; a Won/Lost stage must not survive.
    if (field === 'status' && value === 'Open') Object.assign(patch, { closedReason: '', closedReasonNote: '', stage: 'Firm Bid' })
    if (field === 'closedReason' && !['Others', 'Other'].includes(value)) patch.closedReasonNote = ''
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
    const requiresNote = closePending?.stage === 'Won' ? closeReason === 'Other' : closeReason === 'Others'
    if (!closePending || !closeReason || (requiresNote && !note)) return
    if (closePending.stage === 'Won') {
      store.markWon(closePending.id, closeReason, requiresNote ? note : '')
    } else {
      store.closeLost(closePending.id, closeReason, null, requiresNote ? note : '')
    }
    cancelClose()
  }

  useEffect(() => () => clearTimeout(horizontalGestureTimer.current), [])

  const handleSheetScroll = e => {
    if (openFilter) setOpenFilter(null)
    const wrap = e.currentTarget
    const movedHorizontally = Math.abs(wrap.scrollLeft - lastSheetScrollLeft.current) > 0
    if (movedHorizontally && !horizontalGestureNudged.current && wrap.scrollHeight > wrap.clientHeight) {
      const maxTop = wrap.scrollHeight - wrap.clientHeight
      wrap.scrollTop = Math.min(wrap.scrollTop + 12, maxTop)
      horizontalGestureNudged.current = true
    }
    lastSheetScrollLeft.current = wrap.scrollLeft
    clearTimeout(horizontalGestureTimer.current)
    horizontalGestureTimer.current = setTimeout(() => {
      horizontalGestureNudged.current = false
    }, 140)
  }

  // Formula-bar selection: address + underlying formula + commit (for editable cells).
  const TEXT_FIELDS = ['sellTo', 'location', 'eucName', 'eucLocation', 'oppName', 'contactPerson', 'contactPhone', 'remarks']
  const selectCell = (o, col) => () => {
    const r = o.sl + 2
    let formula = String(cellVal(o, col.key))
    let commit = null
    let kind = 'number'
    if (col.key === 'gmK') formula = `=Q${r}-R${r}`
    else if (col.key === 'gmPct') formula = `=S${r}/Q${r}`
    else if (col.key === 'valueK') commit = v => store.updateOpportunity(o.id, { valueK: rupeesToK(v) })
    else if (col.key === 'cogsK') commit = v => store.updateOpportunity(o.id, { cogsK: rupeesToK(v) })
    else if (TEXT_FIELDS.includes(col.key)) { formula = o[col.key] || ''; kind = 'text'; commit = v => store.updateOpportunity(o.id, { [col.key]: String(v) }) }
    fb.select({ ref: `${col.letter}${r}`, formula, commit, kind })
  }
  const isSel = (o, col) => fb.sel.ref === `${col.letter}${o.sl + 2}`

  const exportCols = COLS
  // A real .xlsx rather than CSV: CSV carries no formatting, so long text
  // (opportunity names, remarks) landed unwrapped in one endless row.
  const exportRows = async () => downloadTableXlsx(
    'Sales_Pipeline_Report.xlsx',
    'Pipeline',
    ['Sl', ...exportCols.map(col => col.label)],
    rows.map((o, index) => [index + 1, ...exportCols.map(col => {
      switch (col.key) {
        case 'customerStatus': return customerStatusFor(o)
      case 'product': return productLabel(o.product).replace(/\bVarious\b/g, 'Multiple equipment items')
        case 'valueK': return o.valueK ? o.valueK * 1000 : ''
        case 'cogsK': return o.cogsK ? o.cogsK * 1000 : ''
        case 'gmK': return o.valueK ? gmK(o) * 1000 : ''
        case 'gmPct': return gmPct(o) || ''
        case 'nextActionOwner': return o.nextActionOwner || nextActionWith(o, store.getProposal(o.id), store).owner || ''
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
  // Checkbox picker for the multi-value Product cell. Reuses the filter
  // popover's overlay + positioning so the grid keeps one dropdown idiom.
  const renderProductPop = (o, pos) => {
    const chosen = productList(o.product)
    const toggle = p => {
      const next = chosen.includes(p) ? chosen.filter(x => x !== p) : [...chosen, p]
      store.updateOpportunity(o.id, { product: next })
    }
    return (
      <>
        <div className="filter-overlay" onClick={() => setProductPick(null)} />
        <div className="filter-pop" style={{ position: 'fixed', left: pos.x, top: pos.y + 4 }} onClick={e => e.stopPropagation()}>
          {PRODUCTS.map(p => (
            <label className="fitem" key={p}>
              <input type="checkbox" checked={chosen.includes(p)} onChange={() => toggle(p)} /> {p === 'Various' ? 'Multiple equipment items' : p}
            </label>
          ))}
          <hr />
          <div className="fitem" onClick={() => setProductPick(null)}>Done</div>
        </div>
      </>
    )
  }

  const renderFilterPop = (col, pos) => {
    const rowsForVals = dateFilteredBase.filter(o => matchesFilters(o, filters, col.key))
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
    const close = () => setOpenFilter(null)
    const clearColumnFilter = () => {
      setFilters(current => ({ ...current, [col.key]: undefined }))
      setSort(current => current?.key === col.key ? null : current)
      close()
    }
    const sortColumn = dir => {
      setSort({ key: col.key, dir })
      close()
    }
    const menu = (
      <>
        <div className="filter-overlay" onClick={close} />
        <div className="filter-pop" style={{ position: 'fixed', left: pos.x, top: pos.y }} onClick={e => e.stopPropagation()} role="dialog" aria-label={`${col.label} sort and filter`}>
          <button type="button" className="fitem" onClick={() => sortColumn(1)}>⇩ Sort {sortLabels(colType(col.key)).asc}</button>
          <button type="button" className="fitem" onClick={() => sortColumn(-1)}>⇧ Sort {sortLabels(colType(col.key)).desc}</button>
          <button type="button" className="fitem" onClick={clearColumnFilter}>✕ Clear this column filter</button>
          <hr />
          <input className="filter-search" type="search" placeholder={`Search ${col.label}`} value={filterSearch[col.key] || ''}
            onChange={e => setFilterSearch({ ...filterSearch, [col.key]: e.target.value })} />
          <label className="fitem">
            <input type="checkbox" checked={visibleValues.length > 0 && visibleValues.every(v => !active || active.has(v))}
              onChange={() => setFilters(current => ({
                ...current,
                [col.key]: toggleSubsetIn(current[col.key], values, visibleValues),
              }))} /> (Select All)
          </label>
          {visibleValues.map(v => (
            <label className="fitem" key={filterValueKey(v)}>
              <input type="checkbox" checked={isChecked(v)} onChange={() => toggle(v)} /> {filterValueLabel(v)}
            </label>
          ))}
        </div>
      </>
    )
    return <Portal>{menu}</Portal>
  }

  const renderDateFilterPop = pos => {
    const draftState = opportunityDateRange(dateFilterDraft.period, dateFilterDraft)
    const fieldLabel = OPPORTUNITY_DATE_FIELDS.find(field => field.key === dateFilterDraft.field)?.label || 'Date'
    const summary = draftState.range
      ? `${fieldLabel} · ${draftState.range[0] || '…'} → ${draftState.range[1] || '…'}`
      : `${fieldLabel} · All time`
    const updateDraft = patch => setDateFilterDraft(current => ({ ...current, ...patch }))
    const menu = (
      <>
        <div className="filter-overlay" onClick={() => setDateFilterOpen(false)} />
        <div className="filter-pop tracker-date-pop" style={{ position: 'fixed', left: pos.x, top: pos.y }}
          onClick={e => e.stopPropagation()} role="dialog" aria-label="Custom date filter">
          <div className="tracker-date-pop-title">Custom date filter</div>
          <div className="tracker-date-pop-summary">{summary}</div>
          <label className="tracker-date-pop-field">
            <span>Date field</span>
            <select aria-label="Custom filter date field" value={dateFilterDraft.field}
              onChange={e => updateDraft({ field: e.target.value })}>
              {OPPORTUNITY_DATE_FIELDS.map(field => <option key={field.key} value={field.key}>{field.label}</option>)}
            </select>
          </label>
          <label className="tracker-date-pop-field">
            <span>Period</span>
            <select aria-label="Custom filter period" value={dateFilterDraft.period}
              onChange={e => updateDraft({ period: e.target.value })}>
              {OPPORTUNITY_PERIODS.map(period => <option key={period.key} value={period.key}>{period.label}</option>)}
            </select>
          </label>
          {dateFilterDraft.period === 'specific' && (
            <label className="tracker-date-pop-field">
              <span>Specific date</span>
              <input type="date" aria-label="Custom filter specific date" value={dateFilterDraft.date}
                onChange={e => updateDraft({ date: e.target.value })} />
            </label>
          )}
          {dateFilterDraft.period === 'custom' && (
            <div className="tracker-date-pop-range">
              <label className="tracker-date-pop-field"><span>From</span><input type="date" aria-label="Custom filter from date" value={dateFilterDraft.from}
                onChange={e => updateDraft({ from: e.target.value })} /></label>
              <label className="tracker-date-pop-field"><span>To</span><input type="date" aria-label="Custom filter to date" value={dateFilterDraft.to}
                onChange={e => updateDraft({ to: e.target.value })} /></label>
            </div>
          )}
          {draftState.error && <div className="tracker-date-error" role="alert">{draftState.error}</div>}
          <div className="tracker-date-pop-actions">
            <button type="button" className="ghost" onClick={clearDateFilter}>Clear</button>
            <button type="button" onClick={() => setDateFilterOpen(false)}>Cancel</button>
            <button type="button" className="primary" disabled={!!draftState.error} onClick={applyDateFilter}>Apply</button>
          </div>
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
    ownerFilter !== defaultOwnerFilter && { id: 'owner', label: `Owner: ${ownerFilter === 'Mine' ? 'My opportunities' : displayRole(ownerFilter)}`, remove: () => setOwnerFilter(defaultOwnerFilter) },
    statusFilter && { id: 'status', label: `Status: ${statusFilter}`, remove: () => setStatusFilter('') },
    dateFilterActive && { id: 'date', label: dateFilterSummary, remove: clearDateFilter },
    ...Object.entries(filters)
      .filter(([, allowed]) => allowed instanceof Set)
      .map(([key, allowed]) => ({
        id: `column-${key}`,
        label: `${COLS.find(col => col.key === key)?.label || key}: ${allowed.size} selected`,
        remove: () => setFilters(current => ({ ...current, [key]: undefined })),
      })),
  ].filter(Boolean)

  return (
    <div className="page tracker-page">
      <h2>{sheet === 'My Orders' ? 'My Orders' : 'Opportunities'} <span className="tracker-result-count" aria-live="polite">{resultCountLabel}</span></h2>
      <div className="toolbar">
        <div className="tracker-toolbar-filters">
          <select id="opportunities-owner-filter" aria-label="Opportunity owner" value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)}>
            {owners.map(p => <option key={p} value={p}>
              {p === 'All' ? 'All Opportunities' : p === 'Mine' ? 'My Opportunities' : displayRole(p)}
            </option>)}
          </select>
          <label className="tracker-search" aria-label="Search all opportunities">
            <Icon name="search" size={14} />
            <input type="search" placeholder="Search all opportunities…" value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)} />
          </label>
          <label className="tracker-quick-filter">
            <span>Status</span>
            <select aria-label="Filter opportunities by status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              {statusOptions.map(status => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
          <button type="button" className={`tracker-date-filter-button${dateFilterActive ? ' active' : ''}`} onClick={openDateFilterMenu}
            aria-haspopup="dialog" aria-expanded={dateFilterOpen} title={dateFilterSummary}>
            Date filter{dateFilterActive ? ' · Active' : ''}
          </button>
          {isSalesRep && (
            <button
              type="button"
              className={`scope-toggle${ownerFilter === 'All' ? ' active' : ''}`}
              aria-pressed={ownerFilter === 'All'}
              title="Show all opportunities"
              onClick={() => setOwnerFilter(ownerFilter === 'All' ? 'Mine' : 'All')}>
              {ownerFilter === 'All' ? 'Showing all' : 'Show all'}
            </button>
          )}
        </div>
        <div className="tracker-toolbar-actions">
          {activeFilterCount > 0 && (
            <button type="button" className="tracker-clear-filters" onClick={clearAllTableState}>
              Clear filters &amp; sort ({activeFilterCount})
            </button>
          )}
          {colView === 'key' && (
            <span className="pill Blue" title="Total value of the rows shown">₹ {fmt(totals.v)}K</span>
          )}
          <button onClick={() => setColView(colView === 'key' ? 'all' : 'key')}
            title={colView === 'key'
              ? 'Show every column in the pipeline sheet'
              : `Show only the working columns: ${KEY_COLS.length} of ${COLS.length}`}>
            {colView === 'key' ? `All ${COLS.length} columns` : 'Key columns'}
          </button>
          <button onClick={exportRows} title="Export all columns for the rows shown">Extract to Excel</button>
          <button type="button" onClick={() => pipelineFileRef.current?.click()} title="Preview an existing pipeline workbook without importing it">
            Upload Excel
          </button>
          <input ref={pipelineFileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={onPipelineFile} />
          {onCreateOpportunity ? (
            <button
              className="tracker-create-logo"
              onClick={onCreateOpportunity}
              aria-label="Create opportunity"
              title="Create opportunity"
            >
              <ModaeImageLogo height={30} />
            </button>
          ) : (
            <Link className="tracker-create-logo" to="/new" aria-label="Create opportunity" title="Create opportunity">
              <ModaeImageLogo height={30} />
            </Link>
          )}
        </div>
        {activeChips.length > 0 && (
          <div className="tracker-filter-chips flex flex-wrap items-center gap-1" aria-label="Active filters">
            {activeChips.map(chip => (
              <button key={chip.id} type="button" className="tracker-filter-chip inline-flex items-center gap-1" onClick={chip.remove}
                title={`Remove ${chip.label}`} aria-label={`Remove ${chip.label}`}>
                <span>{chip.label}</span><span aria-hidden="true">×</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {pipelineUploadError && <div className="errbox" role="alert">{pipelineUploadError}</div>}
      {pipelinePreview && <PipelineUploadPreview preview={pipelinePreview} onClose={() => setPipelinePreview(null)} />}
      {dateFilterOpen && dateFilterPos && renderDateFilterPop(dateFilterPos)}

      <div ref={sheetWrapRef} className="sheet-wrap fill" onScroll={handleSheetScroll}>
        {colView === 'key'
          ? <style>{[
            hiddenColumnCss(COLS.map((c, i) => (KEY_COLS.includes(c.key) ? -1 : i)).filter(i => i >= 0)),
            columnWidthCss(COLS.filter(c => KEY_COLS.includes(c.key)), '.tracker-page .sheet.cols-key'),
          ].join('\n')}</style>
          : <style>{columnWidthCss(COLS, '.tracker-page .sheet:not(.cols-key)', true)}</style>}
        <table className={`sheet${colView === 'key' ? ' cols-key' : ''}`}>
          <thead>
            <tr>
              <th className="rowhead">Sl</th>
              {COLS.map(col => (
                <th key={col.key} className={`th-filter ${filters[col.key] ? 'filtered' : ''}`} title={col.label}
                  aria-sort={sort?.key === col.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" className="tracker-th-control" title={`Sort and filter ${col.label}`}
                    aria-label={`Sort and filter ${col.label}`} aria-haspopup="dialog"
                    aria-expanded={openFilter?.key === col.key} onClick={e => openColumnMenu(col, e)}>
                    <span className="tracker-th-label">{col.label}</span>
                    <span className="tracker-th-indicator" aria-hidden="true">
                      {filters[col.key] ? '▼*' : sort?.key === col.key ? (sort.dir === 1 ? '▲' : '▼') : '▼'}
                    </span>
                  </button>
                  {openFilter?.key === col.key && renderFilterPop(col, openFilter)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((o, index) => (
              <tr key={o.id} className="rowclick"
                onClick={e => {
                  // Row click opens the detail drawer — but never when the click
                  // landed on an inline editor, link, or the filter popover.
                  if (e.target.closest('input,textarea,select,a,button,label,.filter-pop')) return
                  drawer.open({ type: 'opp', id: o.id })
                }}>
                <td className="rowhead">{index + 1}</td>
                <td onClick={selectCell(o, COLS[0])} className={`oppid ${customerStatusFor(o)} ${stageClass(o) === 'open' ? '' : stageClass(o)} ${isSel(o, COLS[0]) ? 'cell-sel' : ''}`}>
                  <span className="tracker-oppid-actions">
                    <Link to={`/opp/${o.id}`} title="Open opportunity workspace">{displayOpportunityId(o.id, store.config?.roleNames)}</Link>
                  </span>
                </td>
                <td onClick={selectCell(o, COLS[1])} className={isSel(o, COLS[1]) ? 'cell-sel' : ''} title={o.sellTo}>{['Intake', 'Registration'].includes(o.milestone) ? <WrapInput value={o.sellTo} onChange={upd(o.id, 'sellTo')} title={o.sellTo} /> : <div className="ro" title="Locked after registration">{o.sellTo || '—'}</div>}</td>
                <td onClick={selectCell(o, COLS[2])} className={isSel(o, COLS[2]) ? 'cell-sel' : ''}>
                  {['Intake', 'Registration'].includes(o.milestone) ? <select value={o.category} onChange={upd(o.id, 'category')}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select> : <div className="ro" title="Locked after registration">{o.category || '—'}</div>}
                </td>
                <td onClick={selectCell(o, COLS[3])} className={isSel(o, COLS[3]) ? 'cell-sel' : ''} title={o.location}>{['Intake', 'Registration'].includes(o.milestone) ? <input type="text" value={o.location} onChange={upd(o.id, 'location')} /> : <div className="ro" title="Locked after registration">{o.location || '—'}</div>}</td>
                <td onClick={selectCell(o, COLS[4])} className={`cstat ${customerStatusFor(o)} ${isSel(o, COLS[4]) ? 'cell-sel' : ''}`}
                  title="Customer status is managed from the Customer master">
                  <span className={`status-pill status-pill--${customerStatusFor(o).toLowerCase()}`}>
                    {customerStatusFor(o)}
                  </span>
                </td>
                <td onClick={selectCell(o, COLS[5])} className={isSel(o, COLS[5]) ? 'cell-sel' : ''} title={o.eucName}>{['Intake', 'Registration'].includes(o.milestone) ? <input type="text" value={o.eucName} onChange={upd(o.id, 'eucName')} /> : <div className="ro" title="Locked after registration">{o.eucName || '—'}</div>}</td>
                <td onClick={selectCell(o, COLS[6])} className={isSel(o, COLS[6]) ? 'cell-sel' : ''} title={o.eucLocation}>{['Intake', 'Registration'].includes(o.milestone) ? <input type="text" value={o.eucLocation} onChange={upd(o.id, 'eucLocation')} /> : <div className="ro" title="Locked after registration">{o.eucLocation || '—'}</div>}</td>
                <td onClick={selectCell(o, COLS[7])} className={isSel(o, COLS[7]) ? 'cell-sel' : ''} title={o.oppName}>{['Intake', 'Registration'].includes(o.milestone) ? <WrapInput value={o.oppName} onChange={upd(o.id, 'oppName')} title={o.oppName} /> : <div className="ro" title="Locked after registration">{o.oppName || '—'}</div>}</td>
                <td onClick={selectCell(o, COLS[8])} className={isSel(o, COLS[8]) ? 'cell-sel' : ''}>
                  {['Intake', 'Registration'].includes(o.milestone) ? <select value={o.owner} onChange={upd(o.id, 'owner')}>{OWNERS.map(c => <option key={c} value={c}>{displayRole(c)}</option>)}</select> : <div className="ro" title="Locked after registration">{displayRole(o.owner) || '—'}</div>}
                </td>
                <td onClick={selectCell(o, COLS[9])} className={isSel(o, COLS[9]) ? 'cell-sel' : ''}>
                  {['Intake', 'Registration'].includes(o.milestone) ? <select value={o.oppType} onChange={upd(o.id, 'oppType')}>{OPP_TYPES.map(c => <option key={c}>{c}</option>)}</select> : <div className="ro" title="Locked after registration">{o.oppType || '—'}</div>}
                </td>
                <td onClick={selectCell(o, COLS[10])} className={isSel(o, COLS[10]) ? 'cell-sel' : ''}>
                  {['Intake', 'Registration'].includes(o.milestone) ? <select value={o.bu} onChange={upd(o.id, 'bu')}>{BUS.map(c => <option key={c}>{c}</option>)}</select> : <div className="ro" title="Locked after registration">{o.bu || '—'}</div>}
                </td>
                <td onClick={selectCell(o, COLS[11])} className={isSel(o, COLS[11]) ? 'cell-sel' : ''}>
                  {['Intake', 'Registration'].includes(o.milestone) ? <select value={o.segment} onChange={upd(o.id, 'segment')}>{SEGMENTS.map(c => <option key={c}>{c}</option>)}</select> : <div className="ro" title="Locked after registration">{o.segment || '—'}</div>}
                </td>
                {/* Product is multi-value, so the cell is a checkbox popover
                    rather than a single-value <select> that would render blank
                    for any opportunity carrying more than one product. */}
                <td onClick={selectCell(o, COLS[12])} className={isSel(o, COLS[12]) ? 'cell-sel' : ''}>
                  {['Intake', 'Registration'].includes(o.milestone) ? <button type="button" className="cell-pick"
                    title={productDisplayLabel(o.product) || 'No equipment or product family selected'}
                    onClick={e => {
                      e.stopPropagation()
                      if (productPick?.id === o.id) { setProductPick(null); return }
                      const r = e.currentTarget.getBoundingClientRect()
                      setProductPick({ id: o.id, x: r.left, y: r.bottom })
                    }}>
                    {productDisplayLabel(o.product) || <span className="hint">— select equipment / product family —</span>}
                  </button> : <div className="ro" title="Locked after registration">{productDisplayLabel(o.product) || '—'}</div>}
                  {productPick?.id === o.id && renderProductPop(o, productPick)}
                </td>
                {/* Suggested from stage, account class and how long the row has
                    sat still — always a suggestion, never a write. */}
                <td onClick={selectCell(o, COLS[13])} className={isSel(o, COLS[13]) ? 'cell-sel' : ''}>
                  {(() => {
                    const sug = suggestProbability(o, store.getProposal(o.id), store.config)
                    return (
                      ['Intake', 'Registration'].includes(o.milestone) ? <select value={o.prob || ''} onChange={upd(o.id, 'prob')}
                        className={!o.prob && sug ? 'derived' : ''}
                        title={sug ? `Suggested ${sug.level} — ${sug.why}` : ''}>
                        <option value="">{sug ? `${sug.level} (suggested)` : ''}</option>
                        {PROB_LEVELS.map(p => <option key={p}>{p}</option>)}
                      </select> : <div className="ro" title="Locked after registration">{o.prob || (sug ? `${sug.level} (suggested)` : '—')}</div>
                    )
                  })()}
                </td>
                {/* Value and COGS are open tracker inputs for every role. GM and
                    GM% remain derived from them and are therefore read only. */}
                <td onClick={selectCell(o, COLS[14])} className={`num ${isSel(o, COLS[14]) ? 'cell-sel' : ''}`}><input type="number" min="0" value={o.valueK ? o.valueK * 1000 : ''} onChange={upd(o.id, 'valueK')} placeholder="-" /></td>
                <td onClick={selectCell(o, COLS[15])} className={`num ${isSel(o, COLS[15]) ? 'cell-sel' : ''}`}><input type="number" min="0" value={o.cogsK ? o.cogsK * 1000 : ''} onChange={upd(o.id, 'cogsK')} placeholder="-" /></td>
                <td onClick={selectCell(o, COLS[16])} className={`num ${isSel(o, COLS[16]) ? 'cell-sel' : ''}`}>{o.valueK ? fmtRupeesFromK(gmK(o)) : '-'}</td>
                {gmPct(o)
                  ? <td onClick={selectCell(o, COLS[17])} className={`num ${isSel(o, COLS[17]) ? 'cell-sel' : ''}`}>{gmPct(o)}</td>
                  : <td onClick={selectCell(o, COLS[17])} className={`${isSel(o, COLS[17]) ? 'cell-sel' : ''}`}>—</td>}
                {/* Created and Proposal are system-stamped — read only, like Last Updated. */}
                <td onClick={selectCell(o, COLS[18])} className={isSel(o, COLS[18]) ? 'cell-sel' : ''}>
                  <div className="ro" title="Stamped when the opportunity was created — read only">{mmmYY(o.createDate) || '—'}</div>
                </td>
                <td onClick={selectCell(o, COLS[19])} className={isSel(o, COLS[19]) ? 'cell-sel' : ''}>
                  <div className="ro" title="Stamped when the proposal was first priced — read only">{mmmYY(o.proposalDate) || '—'}</div>
                </td>
                {/* The salesperson's own forecast dates — mandatory, per the 13 Aug review:
                    "he has to put some date. It can be wrong, but he has to put some date." */}
                <td onClick={selectCell(o, COLS[20])}
                  className={`${isSel(o, COLS[20]) ? 'cell-sel ' : ''}${o.status === 'Open' && !o.orderDate ? 'need' : ''}`.trim()}>
                  <input type="date" value={o.orderDate} max={o.invoiceDate ? new Date(new Date(`${o.invoiceDate}T00:00:00`).getTime() - 86400000).toISOString().slice(0, 10) : undefined} onChange={upd(o.id, 'orderDate')}
                    title={o.orderDate ? '' : 'Expected order date is required on an open opportunity'} /></td>
                <td onClick={selectCell(o, COLS[21])}
                  className={`${isSel(o, COLS[21]) ? 'cell-sel ' : ''}${o.status === 'Open' && !o.invoiceDate ? 'need' : ''}`.trim()}>
                  <input type="date" value={o.invoiceDate} min={o.orderDate ? new Date(new Date(`${o.orderDate}T00:00:00`).getTime() + 86400000).toISOString().slice(0, 10) : undefined} onChange={upd(o.id, 'invoiceDate')}
                    title={o.invoiceDate ? '' : 'Expected ship date is required on an open opportunity'} /></td>
                <td onClick={selectCell(o, COLS[22])} className={isSel(o, COLS[22]) ? 'cell-sel' : ''}>
                  <select value={o.status} onChange={upd(o.id, 'status')}>
                    <option>Open</option><option>On Hold</option><option>Closed</option>
                  </select>
                </td>
                <td onClick={selectCell(o, COLS[23])} className={isSel(o, COLS[23]) ? 'cell-sel' : ''}>
                  <div className="tracker-stage-cell">
                    {o.status === 'Closed' && ['Won', 'Lost'].includes(o.stage) ? (
                      <div className={`tracker-terminal-stage ${o.stage.toLowerCase()}`} title="Terminal outcome; workflow milestone shown below">
                        <span className="tracker-outcome-label">{o.stage}</span>
                        <span className="tracker-stage-context">{workflowStageLabelFor(o)}</span>
                      </div>
                    ) : (
                      <div className="ro" title="Workflow stages are changed from the opportunity workspace">{workflowStageLabelFor(o)}</div>
                    )}
                    {o.status === 'Closed' && o.stage !== 'Lost' && <MarkWonControl opp={o} store={store} />}
                  </div>
                </td>
                <td onClick={selectCell(o, COLS[24])}
                  className={`${o.status === 'Closed' && !o.closedReason ? 'err' : ''} ${isSel(o, COLS[24]) ? 'cell-sel' : ''}`}
                  title={o.status === 'Closed' && !o.closedReason ? 'Closed Reason is mandatory — pick a justification' : ''}>
                  {o.status === 'Closed' ? (
                    <select value={o.closedReason} onChange={upd(o.id, 'closedReason')}
                      title={(o.closedReason === 'Others' || o.closedReason === 'Other') && o.closedReasonNote ? `${o.closedReason} — ${o.closedReasonNote}` : ''}>
                      <option value="">— required —</option>
                      {[...(o.stage === 'Won' ? WON_REASONS : CLOSE_REASONS), ...(o.closedReason && !(o.stage === 'Won' ? WON_REASONS : CLOSE_REASONS).includes(o.closedReason) ? [o.closedReason] : [])]
                        .map(r => <option key={r}>{r}</option>)}
                    </select>
                  ) : ''}
                </td>
                <td onClick={selectCell(o, COLS[25])} className={isSel(o, COLS[25]) ? 'cell-sel' : ''} title={o.contactPerson}>{['Intake', 'Registration'].includes(o.milestone) ? <input type="text" value={o.contactPerson} onChange={upd(o.id, 'contactPerson')} /> : <div className="ro" title="Locked after registration">{o.contactPerson || '—'}</div>}</td>
                <td onClick={selectCell(o, COLS[26])} className={isSel(o, COLS[26]) ? 'cell-sel' : ''} title={o.contactPhone}>{['Intake', 'Registration'].includes(o.milestone) ? <input type="text" value={o.contactPhone} onChange={upd(o.id, 'contactPhone')} /> : <div className="ro" title="Locked after registration">{o.contactPhone || '—'}</div>}</td>
                <td onClick={selectCell(o, COLS[27])} className={isSel(o, COLS[27]) ? 'cell-sel' : ''}>
                  <div className="ro" title="Auto-stamped — read only">{ddMmmYY(o.lastUpdated)}</div>
                </td>
                <td onClick={selectCell(o, COLS[28])} className={isSel(o, COLS[28]) ? 'cell-sel' : ''} style={{ textAlign: 'center' }}>
                  <input type="checkbox" checked={!!o.forecast} onChange={upd(o.id, 'forecast')} title="Include for roll-up" />
                </td>
                <td onClick={selectCell(o, COLS[29])} className={isSel(o, COLS[29]) ? 'cell-sel' : ''} title={o.remarks}><input type="text" value={o.remarks} onChange={upd(o.id, 'remarks')} /></td>
                {/* Derived from the live blockers, so the column is never the
                    "— none —" it read on every row before. Typing a value
                    overrides the derivation. */}
                <td onClick={selectCell(o, COLS[30])} className={isSel(o, COLS[30]) ? 'cell-sel' : ''}>
                  {(() => {
                    const na = nextActionWith(o, store.getProposal(o.id), store)
                    return (
                      <select value={o.nextActionOwner || ''} onChange={upd(o.id, 'nextActionOwner')}
                        className={!o.nextActionOwner && na.owner ? 'derived' : ''}
                        title={na.text || 'No blocker — set an owner if someone else owes you an action'}>
                        <option value="">{na.owner ? `${displayRole(na.owner)} (auto)` : '— none —'}</option>
                        {OWNERS.map(owner => <option key={owner} value={owner}>{displayRole(owner)}</option>)}
                      </select>
                    )
                  })()}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
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
              <td colSpan={14}>Totals {rows.length < base.length && <span className="hint">({rows.length} of {base.length} rows shown — filters active)</span>}</td>
              <td className="num">₹ {fmt(totals.v)}</td>
              <td className="num">₹ {fmt(totals.c)}</td>
              <td className="num">₹ {fmt(totals.v - totals.c)}</td>
              <td className="num" style={{ color: 'var(--amber-text)' }}>{totals.v ? Math.round(((totals.v - totals.c) / totals.v) * 100) + '%' : ''}</td>
              <td colSpan={13}></td>
            </tr>
          </tfoot>
        </table>
      </div>

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
          <p className="hint">Choose Won or Lost first, then select the reason before this opportunity is closed.</p>
          <div className="tracker-close-outcome-options" role="radiogroup" aria-label="Close opportunity outcome">
            {['Lost', 'Won'].map(outcome => (
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
                  if (!(closePending.stage === 'Won' ? e.target.value === 'Other' : e.target.value === 'Others')) setCloseReasonNote('')
                }}
                autoFocus
              >
                <option value="">— select a reason —</option>
                {(closePending.stage === 'Won' ? WON_REASONS : CLOSE_REASONS).map(reason => <option key={reason} value={reason}>{reason}</option>)}
              </select>
              {((closePending.stage === 'Won' && closeReason === 'Other') || (closePending.stage !== 'Won' && closeReason === 'Others')) && (
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
              <button className="primary" disabled={!closePending.stage || !closeReason || ((closePending.stage === 'Won' ? closeReason === 'Other' : closeReason === 'Others') && !closeReasonNote.trim())} onClick={confirmClose}>Confirm</button>
            <button onClick={cancelClose}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
