import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { STAGES, CLOSE_REASONS, PROB_LEVELS, CATEGORIES, OWNERS, OPP_TYPES, BUS, SEGMENTS, PRODUCTS, ROLES } from '../seed.js'
import { fmt, mmmYY, ddMmmYY, stageClass, productList, productLabel, sameCustomer, displayRole } from '../utils.js'
import { downloadTableXlsx } from '../proposal/excelExport.js'
import { useFormulaBar } from '../formulabar.jsx'
import { useDrawer } from '../drawer.jsx'
import { nextActionWith } from '../gates.js'
import { suggestProbability } from '../insights.js'
import { Modal } from '../ui.jsx'
import { Icon } from '../icons.jsx'

const OPEN_STAGES = STAGES.filter(s => s !== 'Won' && s !== 'Lost')

// Columns with their real-sheet letters (row number = Sl + 2, as in the sheet).
// `w` is the column's share of the sheet width — free text gets the generous
// shares, single-token chips the thin ones. The two views read the weights
// differently (see columnWidthCss): the key view divides the viewport between
// its 9 columns and wraps what does not fit, while the all-31 view turns the
// weights into px widths and scrolls sideways. `wAll` overrides `w` in the
// all-31 view, where the identity and date columns earn a bigger slice.
export const COLS = [
  { key: 'id', letter: 'C', label: 'Opp ID', w: 8, wAll: 13 },
  { key: 'sellTo', letter: 'D', label: 'Sell To Customer*', w: 16, wAll: 13 },
  { key: 'category', letter: 'E', label: 'Category', w: 6 },
  { key: 'location', letter: 'F', label: 'Location', w: 6 },
  { key: 'customerStatus', letter: 'G', label: 'Customer Status', w: 5 },
  { key: 'eucName', letter: 'H', label: 'EUC Name*', w: 8 },
  { key: 'eucLocation', letter: 'I', label: 'EUC Location', w: 6 },
  { key: 'oppName', letter: 'J', label: 'Opportunity Name/Description*', w: 20, wAll: 18 },
  { key: 'owner', letter: 'K', label: 'Owner', w: 4 },
  { key: 'oppType', letter: 'L', label: 'Opp Type', w: 11, wAll: 8 },
  { key: 'bu', letter: 'M', label: 'BU', w: 4 },
  { key: 'segment', letter: 'N', label: 'Segment', w: 5 },
  { key: 'product', letter: 'O', label: 'Product', w: 6 },
  { key: 'prob', letter: 'P', label: 'Prob (%)', w: 9, wAll: 7 },
  { key: 'valueK', letter: 'Q', label: 'Value (₹)*', num: true, w: 8 },
  { key: 'cogsK', letter: 'R', label: 'COGS (K₹)*', num: true, w: 5 },
  { key: 'gmK', letter: 'S', label: 'GM (K₹)', num: true, w: 4 },
  { key: 'gmPct', letter: 'T', label: 'GM%', num: true, w: 3 },
  { key: 'createDate', letter: 'U', label: 'Create Date', w: 5, wAll: 7 },
  { key: 'proposalDate', letter: 'V', label: 'Proposal Date', w: 5, wAll: 7 },
  { key: 'orderDate', letter: 'W', label: 'Expected Order Date', w: 11, wAll: 9 },
  { key: 'invoiceDate', letter: 'X', label: 'Expected Ship Date', w: 7, wAll: 9 },
  { key: 'status', letter: 'Y', label: 'Status*', w: 5 },
  { key: 'stage', letter: 'Z', label: 'Stage*', w: 11, wAll: 8 },
  { key: 'closedReason', letter: 'AA', label: 'Closed Reason*', w: 6 },
  { key: 'contactPerson', letter: 'AB', label: 'Contact Person*', w: 7 },
  { key: 'contactPhone', letter: 'AC', label: 'Contact Phone #*', w: 6 },
  { key: 'lastUpdated', letter: 'AD', label: 'Last Updated', w: 5, wAll: 7 },
  { key: 'forecast', letter: 'AE', label: 'Forecast', w: 3 },
  { key: 'remarks', letter: 'AF', label: 'Update/Remarks', w: 10 },
  { key: 'nextActionOwner', letter: 'AG', label: 'Next Action', w: 9 },
]

// The columns a sales owner actually works from, in Biji's words on 13 Aug:
// "Opportunity ID, Customer, Opportunity Name, Stage, Probability… I need
// value, value and expected order date… and I should know where is the next
// action pending." He was explicit that Opportunity Owner and Updated are not
// required — a rep filtered to their own rows already knows the owner.
const KEY_COLS = ['id', 'sellTo', 'oppName', 'stage', 'oppType', 'prob', 'valueK', 'orderDate', 'nextActionOwner']
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
// COLS[i] is child i + 2. Two columns live outside COLS and still need sizing:
// the Sl rowhead at child 1 and the trailing Proposal link at the last child.
// Percentages must stay plain — Chrome resolves a calc() containing a
// percentage as `auto` for fixed-layout column widths, which silently
// collapses every column to an equal share and undoes the whole point.
const ROWHEAD_PCT = 2.6
const PROPOSAL_PCT = 6.5
// px per weight unit in the scrolling view, and the floor below which a column
// is too narrow to read its own header. Sums to a sheet about 3000px wide.
const PX_PER_UNIT = 13
const MIN_COL_PX = 78
const ROWHEAD_PX = 34
const PROPOSAL_PX = 84

function columnWidthCss(cols, scope, all = false) {
  const share = c => (all && c.wAll) || c.w
  const rule = (sel, value) => `${scope} thead tr > ${sel}, ${scope} tbody tr > ${sel} { ${value} }`
  if (all) {
    const px = c => Math.max(MIN_COL_PX, Math.round(share(c) * PX_PER_UNIT))
    return [
      rule(':nth-child(1)', `width: ${ROWHEAD_PX}px; min-width: ${ROWHEAD_PX}px;`),
      ...cols.map(c => rule(`:nth-child(${COLS.indexOf(c) + 2})`, `min-width: ${px(c)}px;`)),
      rule(':last-child', `min-width: ${PROPOSAL_PX}px;`),
    ].join('\n')
  }
  const total = cols.reduce((sum, c) => sum + share(c), 0)
  const budget = 100 - ROWHEAD_PCT - PROPOSAL_PCT
  const pct = value => `width: ${value.toFixed(3)}%;`
  return [
    rule(':nth-child(1)', pct(ROWHEAD_PCT)),
    ...cols.map(c => rule(`:nth-child(${COLS.indexOf(c) + 2})`, pct((share(c) / total) * budget))),
    rule(':last-child', pct(PROPOSAL_PCT)),
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

export default function Tracker({ initialOwnerFilter, onCreateOpportunity }) {
  const store = useStore()
  const navigate = useNavigate()
  const fb = useFormulaBar()
  const drawer = useDrawer()
  const [sheet, setSheet] = useState('Opportunities') // Opportunities | Old Closed Opps

  const isSalesRep = OWNERS.includes(store.role)
  const isManager = ROLES[store.role]?.admin || ROLES[store.role]?.commercial
  const [ownerFilter, setOwnerFilter] = useState(() => initialOwnerFilter || (isSalesRep && !isManager ? store.role : 'All'))

  const [filters, setFilters] = useState({})           // col key -> Set of allowed display values
  const [frozenIds, setFrozenIds] = useState(null)     // row ids captured when a filter was applied
  const [sort, setSort] = useState(null)               // { key, dir: 1 | -1 }
  const [openFilter, setOpenFilter] = useState(null)   // { key, x, y } of the open dropdown
  const [filterSearch, setFilterSearch] = useState({})
  const [searchTerm, setSearchTerm] = useState('')
  const [productPick, setProductPick] = useState(null) // { id, x, y } of the open product picker
  const [closePending, setClosePending] = useState(null) // { id, stage } awaiting a closed reason
  const [closeReason, setCloseReason] = useState('')
  const sheetWrapRef = useRef(null)
  const lastSheetScrollLeft = useRef(0)
  const horizontalGestureNudged = useRef(false)
  const horizontalGestureTimer = useRef(null)
  // Sales owners open on the eight columns they work from; everyone else on the
  // full sheet. Either can switch — nothing is taken away, only folded.
  const [colView, setColView] = useState(() => ((OWNERS.includes(store.role)
    && !(ROLES[store.role]?.admin || ROLES[store.role]?.commercial)) ? 'key' : 'all'))

  const gmK = o => (o.valueK || 0) - (o.cogsK || 0)
  const gmPct = o => (o.valueK ? Math.round((gmK(o) / o.valueK) * 100) + '%' : null)
  const customerStatusFor = o => store.customers.find(c => sameCustomer(c.name, o.sellTo))?.status || o.customerStatus || 'Blue'

  // Display value used for filtering & sorting (what the user sees in the cell).
  const cellVal = (o, key) => {
    switch (key) {
      case 'customerStatus': return customerStatusFor(o)
      case 'gmK': return gmK(o)
      case 'gmPct': return gmPct(o) || '#DIV/0!'
      case 'valueK': return o.valueK || 0
      case 'cogsK': return o.cogsK || 0
      case 'createDate': case 'proposalDate': return mmmYY(o[key])
      case 'orderDate': case 'invoiceDate': return o[key] ? mmmYY(o[key]) : ''
      case 'lastUpdated': return ddMmmYY(o[key])
      case 'forecast': return o.forecast ? '✓ Checked' : '☐ Unchecked'
      case 'prob': return o.prob || ''
      case 'product': return productLabel(o.product)
      case 'owner': return displayRole(o.owner)
      case 'nextActionOwner': return displayRole(o.nextActionOwner || nextActionWith(o, store.getProposal(o.id), store).owner || '')
      default: return o[key] ?? ''
    }
  }

  const all = [...store.opportunities].sort((a, b) => a.sl - b.sl)
  const owners = ['All', ...new Set(all.map(o => o.owner))]
  const base = all.filter(o =>
    (ownerFilter === 'All' || o.owner === ownerFilter) &&
    (sheet !== 'Old Closed Opps' || o.status === 'Closed'))

  const normalizedSearch = searchTerm.trim().toLowerCase()
  const searchableBase = normalizedSearch
    ? base.filter(o => [o.id, o.sellTo, o.oppName].some(value => String(value || '').toLowerCase().includes(normalizedSearch)))
    : base

  // Excel-Table behavior: each column's dropdown lists values filtered by the OTHER columns.
  const rowsFilteredExcept = except => searchableBase.filter(o =>
    Object.entries(filters).every(([k, set]) => k === except || !set || set.has(String(cellVal(o, k)))))

  // Like Excel, filters are applied ONCE (row ids frozen at apply time), not
  // re-evaluated on every edit — otherwise a row vanishes mid-keystroke the
  // moment its value (or auto-bumped Last Updated) stops matching.
  const applyFilters = nextFilters => {
    setFilters(nextFilters)
    const active = Object.values(nextFilters).some(Boolean)
    setFrozenIds(active
      ? new Set(searchableBase.filter(o =>
          Object.entries(nextFilters).every(([k, set]) => !set || set.has(String(cellVal(o, k))))).map(o => o.id))
      : null)
  }

  // Analytics bars land here pre-filtered via query params (?owner= / ?oppType= / ?bu= / ?stage=).
  const [params, setParams] = useSearchParams()
  useEffect(() => {
    if (![...params.keys()].length) return
    const owner = params.get('owner')
    if (owner) setOwnerFilter(owner)
    const next = {}
    for (const key of ['oppType', 'bu', 'stage']) {
      const v = params.get(key)
      if (v) next[key] = new Set([v])
    }
    if (Object.keys(next).length) applyFilters(next)
    setParams({}, { replace: true })
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps
  const DATE_KEYS = ['createDate', 'proposalDate', 'orderDate', 'invoiceDate', 'lastUpdated']
  const sortVal = (o, key) => (DATE_KEYS.includes(key) ? (o[key] || '') : cellVal(o, key))

  let rows = frozenIds ? searchableBase.filter(o => frozenIds.has(o.id)) : searchableBase
  if (sort) {
    const { key, dir } = sort
    rows = [...rows].sort((a, b) => {
      const va = sortVal(a, key), vb = sortVal(b, key)
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
      return String(va).localeCompare(String(vb), undefined, { numeric: true }) * dir
    })
  }

  const totals = rows.reduce((t, o) => ({ v: t.v + (+o.valueK || 0), c: t.c + (+o.cogsK || 0) }), { v: 0, c: 0 })

  const upd = (id, field) => e => {
    let value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    const current = store.opportunities.find(o => o.id === id)
    if (field === 'invoiceDate' && value && current?.orderDate && value <= current.orderDate) return
    if (field === 'orderDate' && value && current?.invoiceDate && value >= current.invoiceDate) return
    // Numeric columns must store numbers — a string "0" is truthy and breaks
    // the GM% #DIV/0! branch (and the proposal-writeback equality guard).
    if (field === 'valueK' || field === 'cogsK') value = e.target.value === '' ? 0 : +e.target.value
    const patch = { [field]: value }
    // Reopening clears the closure fields; a Won/Lost stage must not survive.
    if (field === 'status' && value === 'Open') Object.assign(patch, { closedReason: '', stage: 'Firm Bid' })
    if (field === 'stage' && (value === 'Won' || value === 'Lost')) {
      setClosePending({ id, stage: value })
      setCloseReason('')
      return
    }
    store.updateOpportunity(id, patch)
  }

  const cancelClose = () => {
    setClosePending(null)
    setCloseReason('')
  }

  const confirmClose = () => {
    if (!closePending || !closeReason) return
    store.updateOpportunity(closePending.id, {
      stage: closePending.stage,
      status: 'Closed',
      closedReason: closeReason,
    })
    cancelClose()
  }

  useEffect(() => () => clearTimeout(horizontalGestureTimer.current), [])

  const handleSheetScroll = e => {
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
    else if (col.key === 'valueK') commit = v => store.updateOpportunity(o.id, { valueK: Math.round(v) })
    else if (col.key === 'cogsK') commit = v => store.updateOpportunity(o.id, { cogsK: Math.round(v) })
    else if (TEXT_FIELDS.includes(col.key)) { formula = o[col.key] || ''; kind = 'text'; commit = v => store.updateOpportunity(o.id, { [col.key]: String(v) }) }
    fb.select({ ref: `${col.letter}${r}`, formula, commit, kind })
  }
  const isSel = (o, col) => fb.sel.ref === `${col.letter}${o.sl + 2}`

  const exportCols = COLS
  // A real .xlsx rather than CSV: CSV carries no formatting, so long text
  // (opportunity names, remarks) landed unwrapped in one endless row.
  const exportRows = () => downloadTableXlsx(
    'Sales_Pipeline_Report.xlsx',
    'Pipeline',
    ['Sl', ...exportCols.map(col => col.label)],
    rows.map((o, index) => [index + 1, ...exportCols.map(col => {
      switch (col.key) {
        case 'customerStatus': return customerStatusFor(o)
        case 'product': return productLabel(o.product)
        case 'gmK': return gmK(o)
        case 'gmPct': return gmPct(o) || ''
        case 'nextActionOwner': return o.nextActionOwner || nextActionWith(o, store.getProposal(o.id), store).owner || ''
        case 'forecast': return o.forecast ? 'Y' : 'N'
        default: return o[col.key] ?? ''
      }
    })])
  )

  const showLatestCreated = () => {
    setOwnerFilter('All')
    setSort({ key: 'createDate', dir: -1 })
    setFilters({})
    setFrozenIds(null)
    setOpenFilter(null)
  }

  // Plain render function (not a component type) so the open dropdown's DOM is
  // diffed in place — checkbox focus and scroll position survive toggles.
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
              <input type="checkbox" checked={chosen.includes(p)} onChange={() => toggle(p)} /> {p}
            </label>
          ))}
          <hr />
          <div className="fitem" onClick={() => setProductPick(null)}>Done</div>
        </div>
      </>
    )
  }

  const renderFilterPop = (col, pos) => {
    const rowsForVals = rowsFilteredExcept(col.key)
    const values = DATE_KEYS.includes(col.key)
      ? [...new Set([...rowsForVals].sort((a, b) => String(a[col.key] || '').localeCompare(String(b[col.key] || '')))
          .map(o => String(cellVal(o, col.key))))]
      : [...new Set(rowsForVals.map(o => String(cellVal(o, col.key))))]
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    const active = filters[col.key]
    const query = String(filterSearch[col.key] || '').trim().toLowerCase()
    const visibleValues = query ? values.filter(v => v.toLowerCase().includes(query)) : values
    const isChecked = v => !active || active.has(v)
    const toggle = v => {
      const next = new Set(active || values)
      if (next.has(v)) next.delete(v); else next.add(v)
      // "No filter" only when every visible value is explicitly checked.
      applyFilters({ ...filters, [col.key]: values.every(x => next.has(x)) ? undefined : next })
    }
    return (
      <>
        <div className="filter-overlay" onClick={() => setOpenFilter(null)} />
        <div className="filter-pop" style={{ position: 'fixed', left: pos.x, top: pos.y + 4 }} onClick={e => e.stopPropagation()}>
          <div className="fitem" onClick={() => { setSort({ key: col.key, dir: 1 }); setOpenFilter(null) }}>⇩ Sort A to Z</div>
          <div className="fitem" onClick={() => { setSort({ key: col.key, dir: -1 }); setOpenFilter(null) }}>⇧ Sort Z to A</div>
          <div className="fitem" onClick={() => { setSort(null); applyFilters({ ...filters, [col.key]: undefined }); setOpenFilter(null) }}>✕ Clear filter &amp; sort</div>
          <hr />
          <input className="filter-search" type="search" placeholder={`Search ${col.label}`} value={filterSearch[col.key] || ''}
            onChange={e => setFilterSearch({ ...filterSearch, [col.key]: e.target.value })} />
          <label className="fitem">
            <input type="checkbox" checked={!active} onChange={() => applyFilters({ ...filters, [col.key]: undefined })} /> (Select All)
          </label>
          {visibleValues.map(v => (
            <label className="fitem" key={v || '(blank)'}>
              <input type="checkbox" checked={isChecked(v)} onChange={() => toggle(v)} /> {v === '' ? '(Blanks)' : v}
            </label>
          ))}
        </div>
      </>
    )
  }

  return (
    <div className="page tracker-page">
      <h2>Opportunities {sheet === 'Old Closed Opps' && '— Old Closed Opps'}</h2>
      <div className="toolbar">
        {isSalesRep && ownerFilter === store.role ? (
          <button type="button" onClick={() => setOwnerFilter('All')}>Show All Opportunities</button>
        ) : (
          <>
            <label className="owner-view-label" htmlFor="opportunities-owner-filter">View opportunities for:</label>
            <select id="opportunities-owner-filter" value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)}>
              {owners.map(p => <option key={p} value={p}>{p === 'All' ? 'All Opportunities' : displayRole(p)}</option>)}
            </select>
            {isSalesRep && <button type="button" onClick={() => setOwnerFilter(store.role)}>My Opportunities</button>}
          </>
        )}
        <label className="tracker-search" aria-label="Search opportunities">
          <Icon name="search" size={14} />
          <input type="search" placeholder="Search opportunity ID, customer or name" value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setFrozenIds(null) }} />
        </label>
        <button type="button" onClick={showLatestCreated}>Latest created</button>
        <span className="hint">Rows are never deleted — close them via Stage (Won/Lost) with a mandatory Closed Reason. Click ▼ on a header to sort/filter; click a cell to see its formula.</span>
        <span className="spacer" />
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
        {onCreateOpportunity
          ? <button className="primary" onClick={onCreateOpportunity}>Create Opportunity</button>
          : <Link className="btn primary" to="/new">Create Opportunity</Link>}
      </div>

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
                <th key={col.key} className={`th-filter ${filters[col.key] ? 'filtered' : ''}`} title={col.label}>
                  {col.label}
                  <span className="filter-caret" title="Sort & filter"
                    onClick={e => {
                      e.stopPropagation()
                      if (openFilter?.key === col.key) { setOpenFilter(null); return }
                      const r = e.currentTarget.getBoundingClientRect()
                      setOpenFilter({ key: col.key, x: Math.min(r.left, window.innerWidth - 210), y: r.bottom })
                    }}>
                    {filters[col.key] ? '▼*' : sort?.key === col.key ? (sort.dir === 1 ? '▲' : '▼') : '▼'}
                  </span>
                  {openFilter?.key === col.key && renderFilterPop(col, openFilter)}
                </th>
              ))}
              <th>Proposal</th>
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
                  <Link to={`/opp/${o.id}`} title="Open opportunity workspace">{o.id}</Link>
                </td>
                <td onClick={selectCell(o, COLS[1])} className={isSel(o, COLS[1]) ? 'cell-sel' : ''} title={o.sellTo}><WrapInput value={o.sellTo} onChange={upd(o.id, 'sellTo')} title={o.sellTo} /></td>
                <td onClick={selectCell(o, COLS[2])} className={isSel(o, COLS[2]) ? 'cell-sel' : ''}>
                  <select value={o.category} onChange={upd(o.id, 'category')}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select>
                </td>
                <td onClick={selectCell(o, COLS[3])} className={isSel(o, COLS[3]) ? 'cell-sel' : ''} title={o.location}><input type="text" value={o.location} onChange={upd(o.id, 'location')} /></td>
                <td onClick={selectCell(o, COLS[4])} className={`cstat ${customerStatusFor(o)} ${isSel(o, COLS[4]) ? 'cell-sel' : ''}`}
                  title="Customer status is managed from the Customer master">
                  {customerStatusFor(o)}
                </td>
                <td onClick={selectCell(o, COLS[5])} className={isSel(o, COLS[5]) ? 'cell-sel' : ''} title={o.eucName}><input type="text" value={o.eucName} onChange={upd(o.id, 'eucName')} /></td>
                <td onClick={selectCell(o, COLS[6])} className={isSel(o, COLS[6]) ? 'cell-sel' : ''} title={o.eucLocation}><input type="text" value={o.eucLocation} onChange={upd(o.id, 'eucLocation')} /></td>
                <td onClick={selectCell(o, COLS[7])} className={isSel(o, COLS[7]) ? 'cell-sel' : ''} title={o.oppName}><WrapInput value={o.oppName} onChange={upd(o.id, 'oppName')} title={o.oppName} /></td>
                <td onClick={selectCell(o, COLS[8])} className={isSel(o, COLS[8]) ? 'cell-sel' : ''}>
                  <select value={o.owner} onChange={upd(o.id, 'owner')}>{OWNERS.map(c => <option key={c} value={c}>{displayRole(c)}</option>)}</select>
                </td>
                <td onClick={selectCell(o, COLS[9])} className={isSel(o, COLS[9]) ? 'cell-sel' : ''}>
                  <select value={o.oppType} onChange={upd(o.id, 'oppType')}>{OPP_TYPES.map(c => <option key={c}>{c}</option>)}</select>
                </td>
                <td onClick={selectCell(o, COLS[10])} className={isSel(o, COLS[10]) ? 'cell-sel' : ''}>
                  <select value={o.bu} onChange={upd(o.id, 'bu')}>{BUS.map(c => <option key={c}>{c}</option>)}</select>
                </td>
                <td onClick={selectCell(o, COLS[11])} className={isSel(o, COLS[11]) ? 'cell-sel' : ''}>
                  <select value={o.segment} onChange={upd(o.id, 'segment')}>{SEGMENTS.map(c => <option key={c}>{c}</option>)}</select>
                </td>
                {/* Product is multi-value, so the cell is a checkbox popover
                    rather than a single-value <select> that would render blank
                    for any opportunity carrying more than one product. */}
                <td onClick={selectCell(o, COLS[12])} className={isSel(o, COLS[12]) ? 'cell-sel' : ''}>
                  <button type="button" className="cell-pick"
                    title={productLabel(o.product) || 'No product selected'}
                    onClick={e => {
                      e.stopPropagation()
                      if (productPick?.id === o.id) { setProductPick(null); return }
                      const r = e.currentTarget.getBoundingClientRect()
                      setProductPick({ id: o.id, x: r.left, y: r.bottom })
                    }}>
                    {productLabel(o.product) || <span className="hint">— select —</span>}
                  </button>
                  {productPick?.id === o.id && renderProductPop(o, productPick)}
                </td>
                {/* Suggested from stage, account class and how long the row has
                    sat still — always a suggestion, never a write. */}
                <td onClick={selectCell(o, COLS[13])} className={isSel(o, COLS[13]) ? 'cell-sel' : ''}>
                  {(() => {
                    const sug = suggestProbability(o, store.getProposal(o.id), store.config)
                    return (
                      <select value={o.prob || ''} onChange={upd(o.id, 'prob')}
                        className={!o.prob && sug ? 'derived' : ''}
                        title={sug ? `Suggested ${sug.level} — ${sug.why}` : ''}>
                        <option value="">{sug ? `${sug.level} (suggested)` : ''}</option>
                        {PROB_LEVELS.map(p => <option key={p}>{p}</option>)}
                      </select>
                    )
                  })()}
                </td>
                {/* Value and COGS are open tracker inputs for every role. GM and
                    GM% remain derived from them and are therefore read only. */}
                <td onClick={selectCell(o, COLS[14])} className={`num ${isSel(o, COLS[14]) ? 'cell-sel' : ''}`}><input type="number" value={o.valueK || ''} onChange={upd(o.id, 'valueK')} placeholder="-" /></td>
                <td onClick={selectCell(o, COLS[15])} className={`num ${isSel(o, COLS[15]) ? 'cell-sel' : ''}`}><input type="number" value={o.cogsK || ''} onChange={upd(o.id, 'cogsK')} placeholder="-" /></td>
                <td onClick={selectCell(o, COLS[16])} className={`num ${isSel(o, COLS[16]) ? 'cell-sel' : ''}`}>{o.valueK ? fmt(gmK(o)) : '-'}</td>
                {gmPct(o)
                  ? <td onClick={selectCell(o, COLS[17])} className={`num ${isSel(o, COLS[17]) ? 'cell-sel' : ''}`}>{gmPct(o)}</td>
                  : <td onClick={selectCell(o, COLS[17])} className={`err ${isSel(o, COLS[17]) ? 'cell-sel' : ''}`}>#DIV/0!</td>}
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
                  <select value={o.stage} onChange={upd(o.id, 'stage')}>
                    {(o.status === 'Closed' ? STAGES : OPEN_STAGES.concat(['Won', 'Lost'])).map(s => <option key={s}>{s}</option>)}
                  </select>
                </td>
                <td onClick={selectCell(o, COLS[24])}
                  className={`${o.status === 'Closed' && !o.closedReason ? 'err' : ''} ${isSel(o, COLS[24]) ? 'cell-sel' : ''}`}
                  title={o.status === 'Closed' && !o.closedReason ? 'Closed Reason is mandatory — pick a justification' : ''}>
                  {o.status === 'Closed' ? (
                    <select value={o.closedReason} onChange={upd(o.id, 'closedReason')}>
                      <option value="">— required —</option>
                      {CLOSE_REASONS.map(r => <option key={r}>{r}</option>)}
                    </select>
                  ) : ''}
                </td>
                <td onClick={selectCell(o, COLS[25])} className={isSel(o, COLS[25]) ? 'cell-sel' : ''} title={o.contactPerson}><input type="text" value={o.contactPerson} onChange={upd(o.id, 'contactPerson')} /></td>
                <td onClick={selectCell(o, COLS[26])} className={isSel(o, COLS[26]) ? 'cell-sel' : ''} title={o.contactPhone}><input type="text" value={o.contactPhone} onChange={upd(o.id, 'contactPhone')} /></td>
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
                <td>
                  <Link to={`/proposal/${o.id}`}>Open ▸</Link>
                  <button type="button" className="link-button" title="Create a new proposal revision"
                    onClick={e => { e.stopPropagation(); store.reviseProposal(o.id, 'Revision opened from Opportunities list'); navigate(`/opp/${o.id}/proposal`) }}>
                    Revise
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="rowhead"></td>
              <td colSpan={14}>Totals {rows.length < base.length && <span className="hint">({rows.length} of {base.length} rows shown — filters active)</span>}</td>
              <td className="num">₹ {fmt(totals.v)}</td>
              <td className="num">₹ {fmt(totals.c)}</td>
              <td className="num">₹ {fmt(totals.v - totals.c)}</td>
              <td className="num" style={{ color: 'var(--amber-text)' }}>{totals.v ? Math.round(((totals.v - totals.c) / totals.v) * 100) + '%' : ''}</td>
              <td colSpan={14}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="sheet-tabs">
        {['Opportunities', 'Old Closed Opps'].map(t => (
          <div key={t} className={`tab ${sheet === t ? 'active' : ''}`}
            onClick={() => setSheet(t)}>
            {t}
          </div>
        ))}
        <div className="tab">＋</div>
      </div>

      {closePending && (
        <Modal title={`Close opportunity as ${closePending.stage}`} onClose={cancelClose}>
          <p className="hint">Select a reason before this opportunity is moved to {closePending.stage}.</p>
          <label htmlFor="tracker-close-reason">Closed reason</label>
          <select
            id="tracker-close-reason"
            value={closeReason}
            onChange={e => setCloseReason(e.target.value)}
            autoFocus
          >
            <option value="">— select a reason —</option>
            {CLOSE_REASONS.map(reason => <option key={reason} value={reason}>{reason}</option>)}
          </select>
          <div className="forms-actions">
            <button className="primary" disabled={!closeReason} onClick={confirmClose}>Confirm</button>
            <button onClick={cancelClose}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
