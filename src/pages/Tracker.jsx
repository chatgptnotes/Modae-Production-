import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { STAGES, CLOSE_REASONS, PROB_LEVELS, CATEGORIES, OWNERS, OPP_TYPES, BUS, SEGMENTS, PRODUCTS, CUSTOMER_STATUSES, ROLES } from '../seed.js'
import { fmt, mmmYY, ddMmmYY, exportCSV, stageClass, canViewCommercial, canPriceProposal, productList, productLabel } from '../utils.js'
import { useFormulaBar } from '../formulabar.jsx'
import { useDrawer } from '../drawer.jsx'
import { nextActionWith } from '../gates.js'
import { suggestProbability } from '../insights.js'
import { Icon } from '../icons.jsx'

const OPEN_STAGES = STAGES.filter(s => s !== 'Won' && s !== 'Lost')

// Columns with their real-sheet letters (row number = Sl + 2, as in the sheet).
const COLS = [
  { key: 'id', letter: 'C', label: 'Opp ID' },
  { key: 'sellTo', letter: 'D', label: 'Sell To Customer*' },
  { key: 'category', letter: 'E', label: 'Category' },
  { key: 'location', letter: 'F', label: 'Location' },
  { key: 'customerStatus', letter: 'G', label: 'Customer Status' },
  { key: 'eucName', letter: 'H', label: 'EUC Name*' },
  { key: 'eucLocation', letter: 'I', label: 'EUC Location' },
  { key: 'oppName', letter: 'J', label: 'Opportunity Name/Description*' },
  { key: 'owner', letter: 'K', label: 'Owner' },
  { key: 'oppType', letter: 'L', label: 'Opp Type' },
  { key: 'bu', letter: 'M', label: 'BU' },
  { key: 'segment', letter: 'N', label: 'Segment' },
  { key: 'product', letter: 'O', label: 'Product' },
  { key: 'prob', letter: 'P', label: 'Prob (%)' },
  { key: 'valueK', letter: 'Q', label: 'Value (₹)*', num: true },
  { key: 'cogsK', letter: 'R', label: 'COGS (K₹)*', num: true },
  { key: 'gmK', letter: 'S', label: 'GM (K₹)', num: true },
  { key: 'gmPct', letter: 'T', label: 'GM%', num: true },
  { key: 'createDate', letter: 'U', label: 'Create Date' },
  { key: 'proposalDate', letter: 'V', label: 'Proposal Date' },
  { key: 'orderDate', letter: 'W', label: 'Expected Order Date' },
  { key: 'invoiceDate', letter: 'X', label: 'Expected Ship Date' },
  { key: 'status', letter: 'Y', label: 'Status*' },
  { key: 'stage', letter: 'Z', label: 'Stage*' },
  { key: 'closedReason', letter: 'AA', label: 'Closed Reason*' },
  { key: 'contactPerson', letter: 'AB', label: 'Contact Person*' },
  { key: 'contactPhone', letter: 'AC', label: 'Contact Phone #*' },
  { key: 'lastUpdated', letter: 'AD', label: 'Last Updated' },
  { key: 'forecast', letter: 'AE', label: 'Forecast' },
  { key: 'remarks', letter: 'AF', label: 'Update/Remarks' },
  { key: 'nextActionOwner', letter: 'AG', label: 'Next Action Pending Owner' },
]

// The columns a sales owner actually works from, in Biji's words on 13 Aug:
// "Opportunity ID, Customer, Opportunity Name, Stage, Probability… I need
// value, value and expected order date… and I should know where is the next
// action pending." He was explicit that Opportunity Owner and Updated are not
// required — a rep filtered to their own rows already knows the owner.
const KEY_COLS = ['id', 'sellTo', 'oppName', 'stage', 'prob', 'valueK', 'orderDate', 'nextActionOwner']

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

export default function Tracker() {
  const store = useStore()
  const nav = useNavigate()
  const fb = useFormulaBar()
  const drawer = useDrawer()
  const [sheet, setSheet] = useState('Opportunities') // Pivot | Opportunities | Old Closed Opps

  // Role-based default filtering for owner:
  // Sales reps default to their own opportunities, admins see all
  const isAdmin = ROLES[store.role]?.admin || ROLES[store.role]?.commercial
  const isSalesRep = OWNERS.includes(store.role)
  const defaultOwnerFilter = (isSalesRep && !isAdmin) ? store.role : 'All'
  const [ownerFilter, setOwnerFilter] = useState(defaultOwnerFilter)

  const [filters, setFilters] = useState({})           // col key -> Set of allowed display values
  const [frozenIds, setFrozenIds] = useState(null)     // row ids captured when a filter was applied
  const [sort, setSort] = useState(null)               // { key, dir: 1 | -1 }
  const [openFilter, setOpenFilter] = useState(null)   // { key, x, y } of the open dropdown
  const [productPick, setProductPick] = useState(null) // { id, x, y } of the open product picker
  // Sales owners open on the eight columns they work from; everyone else on the
  // full sheet. Either can switch — nothing is taken away, only folded.
  const [colView, setColView] = useState(() => ((OWNERS.includes(store.role)
    && !(ROLES[store.role]?.admin || ROLES[store.role]?.commercial)) ? 'key' : 'all'))

  const comm = canViewCommercial(store.role)
  const showValue = canPriceProposal(store.role)
  const gmK = o => (o.valueK || 0) - (o.cogsK || 0)
  const gmPct = o => (o.valueK ? Math.round((gmK(o) / o.valueK) * 100) + '%' : null)

  // Display value used for filtering & sorting (what the user sees in the cell).
  const cellVal = (o, key) => {
    switch (key) {
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
      case 'nextActionOwner': return o.nextActionOwner || nextActionWith(o, store.getProposal(o.id), store).owner || ''
      default: return o[key] ?? ''
    }
  }

  const all = [...store.opportunities].sort((a, b) => a.sl - b.sl)
  const owners = ['All', ...new Set(all.map(o => o.owner))]
  const base = all.filter(o =>
    (ownerFilter === 'All' || o.owner === ownerFilter) &&
    (sheet !== 'Old Closed Opps' || o.status === 'Closed'))

  // Excel-Table behavior: each column's dropdown lists values filtered by the OTHER columns.
  const rowsFilteredExcept = except => base.filter(o =>
    Object.entries(filters).every(([k, set]) => k === except || !set || set.has(String(cellVal(o, k)))))

  // Like Excel, filters are applied ONCE (row ids frozen at apply time), not
  // re-evaluated on every edit — otherwise a row vanishes mid-keystroke the
  // moment its value (or auto-bumped Last Updated) stops matching.
  const applyFilters = nextFilters => {
    setFilters(nextFilters)
    const active = Object.values(nextFilters).some(Boolean)
    setFrozenIds(active
      ? new Set(base.filter(o =>
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

  let rows = frozenIds ? base.filter(o => frozenIds.has(o.id)) : base
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
    // Numeric columns must store numbers — a string "0" is truthy and breaks
    // the GM% #DIV/0! branch (and the proposal-writeback equality guard).
    if (field === 'valueK' || field === 'cogsK') value = e.target.value === '' ? 0 : +e.target.value
    const patch = { [field]: value }
    // Reopening clears the closure fields; a Won/Lost stage must not survive.
    if (field === 'status' && value === 'Open') Object.assign(patch, { closedReason: '', stage: 'Firm Bid' })
    if (field === 'stage' && (value === 'Won' || value === 'Lost')) patch.status = 'Closed'
    store.updateOpportunity(id, patch)
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

  const exportRows = () => exportCSV(
    'Sales_Pipeline_Report.csv',
    ['Sl','Opp ID','Sell To Customer','Category','Location','Customer Status','EUC Name','EUC Location','Opportunity Name/Description','Owner','Opp Type','BU','Segment','Product','Prob (%)','Value (₹)','COGS (K₹)','GM (K₹)','GM%','Create Date','Proposal Date','Expected Order Date','Expected Ship Date','Status','Stage','Closed Reason','Contact Person','Contact Phone #','Last Updated','Forecast','Update/Remarks','Next Action Pending Owner'],
    rows.map(o => [o.sl,o.id,o.sellTo,o.category,o.location,o.customerStatus,o.eucName,o.eucLocation,o.oppName,o.owner,o.oppType,o.bu,o.segment,productLabel(o.product),o.prob||'',o.valueK,o.cogsK,gmK(o),gmPct(o)||'',o.createDate,o.proposalDate,o.orderDate,o.invoiceDate,o.status,o.stage,o.closedReason,o.contactPerson,o.contactPhone,o.lastUpdated,o.forecast?'Y':'N',o.remarks,o.nextActionOwner||''])
  )

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
          <label className="fitem">
            <input type="checkbox" checked={!active} onChange={() => applyFilters({ ...filters, [col.key]: undefined })} /> (Select All)
          </label>
          {values.map(v => (
            <label className="fitem" key={v || '(blank)'}>
              <input type="checkbox" checked={isChecked(v)} onChange={() => toggle(v)} /> {v === '' ? '(Blanks)' : v}
            </label>
          ))}
        </div>
      </>
    )
  }

  return (
    <div className="page">
      <h2>Sales Pipeline Report FY26–27 {sheet === 'Old Closed Opps' && '— Old Closed Opps'}</h2>
      <div className="toolbar">
        <label>Owner:{' '}
          <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)}>
            {owners.map(p => <option key={p}>{p}</option>)}
          </select>
        </label>
        <span className="hint">Rows are never deleted — close them via Stage (Won/Lost) with a mandatory Closed Reason. Click ▼ on a header to sort/filter; click a cell to see its formula.</span>
        <span className="spacer" />
        {colView === 'key' && showValue && (
          <span className="pill Blue" title="Total value of the rows shown">₹ {fmt(totals.v)}K</span>
        )}
        <button onClick={() => setColView(colView === 'key' ? 'all' : 'key')}
          title={colView === 'key'
            ? 'Show every column in the pipeline sheet'
            : `Show only the working columns: ${KEY_COLS.length} of ${COLS.length}`}>
          {colView === 'key' ? `All ${COLS.length} columns` : 'Key columns'}
        </button>
        <button onClick={exportRows} disabled={!comm}
          title={comm ? '' : 'Export includes commercial columns — restricted to approvers/admin'}>Extract to Excel</button>
        <Link className="btn primary" to="/new">Create Opportunity</Link>
      </div>

      <div className="sheet-wrap">
        {colView === 'key' && <style>{hiddenColumnCss(COLS.map((c, i) => (KEY_COLS.includes(c.key) ? -1 : i)).filter(i => i >= 0))}</style>}
        <table className={`sheet${colView === 'key' ? ' cols-key' : ''}`}>
          <thead>
            <tr>
              <th className="rowhead">Sl</th>
              {COLS.map(col => (
                <th key={col.key} className={`th-filter ${filters[col.key] ? 'filtered' : ''}`}>
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
            {rows.map(o => (
              <tr key={o.id} className="rowclick"
                onClick={e => {
                  // Row click opens the detail drawer — but never when the click
                  // landed on an inline editor, link, or the filter popover.
                  if (e.target.closest('input,select,a,button,label,.filter-pop')) return
                  drawer.open({ type: 'opp', id: o.id })
                }}>
                <td className="rowhead">{o.sl}</td>
                <td onClick={selectCell(o, COLS[0])} className={`oppid ${stageClass(o) === 'open' ? '' : stageClass(o)} ${isSel(o, COLS[0]) ? 'cell-sel' : ''}`}>
                  <Link to={`/folders/${o.id}`}>{o.id}</Link>
                </td>
                <td onClick={selectCell(o, COLS[1])} className={isSel(o, COLS[1]) ? 'cell-sel' : ''}><input type="text" value={o.sellTo} onChange={upd(o.id, 'sellTo')} style={{ minWidth: 150 }} /></td>
                <td onClick={selectCell(o, COLS[2])} className={isSel(o, COLS[2]) ? 'cell-sel' : ''}>
                  <select value={o.category} onChange={upd(o.id, 'category')}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select>
                </td>
                <td onClick={selectCell(o, COLS[3])} className={isSel(o, COLS[3]) ? 'cell-sel' : ''}><input type="text" value={o.location} onChange={upd(o.id, 'location')} style={{ minWidth: 80 }} /></td>
                <td onClick={selectCell(o, COLS[4])} className={`cstat ${o.customerStatus} ${isSel(o, COLS[4]) ? 'cell-sel' : ''}`}
                  title="Customer status normally comes from the accounting upload — overrides are logged to the audit trail">
                  <select value={o.customerStatus} onChange={upd(o.id, 'customerStatus')}>
                    {CUSTOMER_STATUSES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </td>
                <td onClick={selectCell(o, COLS[5])} className={isSel(o, COLS[5]) ? 'cell-sel' : ''}><input type="text" value={o.eucName} onChange={upd(o.id, 'eucName')} style={{ minWidth: 120 }} /></td>
                <td onClick={selectCell(o, COLS[6])} className={isSel(o, COLS[6]) ? 'cell-sel' : ''}><input type="text" value={o.eucLocation} onChange={upd(o.id, 'eucLocation')} style={{ minWidth: 90 }} /></td>
                <td onClick={selectCell(o, COLS[7])} className={isSel(o, COLS[7]) ? 'cell-sel' : ''} title={o.oppName} style={{ maxWidth: 280 }}><input type="text" value={o.oppName} onChange={upd(o.id, 'oppName')} style={{ minWidth: 220 }} /></td>
                <td onClick={selectCell(o, COLS[8])} className={isSel(o, COLS[8]) ? 'cell-sel' : ''}>
                  <select value={o.owner} onChange={upd(o.id, 'owner')}>{OWNERS.map(c => <option key={c}>{c}</option>)}</select>
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
                    const sug = suggestProbability(o, store.getProposal(o.id))
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
                {/* Value is the salesperson's own forecast — they type it at intake, so
                    they keep it here. COGS/GM stay commercial. */}
                {showValue ? (
                  <td onClick={selectCell(o, COLS[14])} className={`num ${isSel(o, COLS[14]) ? 'cell-sel' : ''}`}><input type="number" value={o.valueK || ''} onChange={upd(o.id, 'valueK')} style={{ textAlign: 'right', width: 70 }} placeholder="-" /></td>
                ) : (
                  <td className="num locked" title="Commercial data — approvers/admin only"><Icon name="lock" size={12} /></td>
                )}
                {!comm ? (
                  <>
                    <td className="num locked" title="Cost and margin — approvers/admin only"><Icon name="lock" size={12} /></td>
                    <td className="num locked"><Icon name="lock" size={12} /></td>
                    <td className="num locked"><Icon name="lock" size={12} /></td>
                  </>
                ) : (
                  <>
                    <td onClick={selectCell(o, COLS[15])} className={`num ${isSel(o, COLS[15]) ? 'cell-sel' : ''}`}><input type="number" value={o.cogsK || ''} onChange={upd(o.id, 'cogsK')} style={{ textAlign: 'right', width: 70 }} placeholder="-" /></td>
                    <td onClick={selectCell(o, COLS[16])} className={`num ${isSel(o, COLS[16]) ? 'cell-sel' : ''}`}>{o.valueK ? fmt(gmK(o)) : '-'}</td>
                    {gmPct(o)
                      ? <td onClick={selectCell(o, COLS[17])} className={`num ${isSel(o, COLS[17]) ? 'cell-sel' : ''}`}>{gmPct(o)}</td>
                      : <td onClick={selectCell(o, COLS[17])} className={`err ${isSel(o, COLS[17]) ? 'cell-sel' : ''}`}>#DIV/0!</td>}
                  </>
                )}
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
                  <input type="date" value={o.orderDate} onChange={upd(o.id, 'orderDate')} style={{ width: 108 }}
                    title={o.orderDate ? '' : 'Expected order date is required on an open opportunity'} /></td>
                <td onClick={selectCell(o, COLS[21])}
                  className={`${isSel(o, COLS[21]) ? 'cell-sel ' : ''}${o.status === 'Open' && !o.invoiceDate ? 'need' : ''}`.trim()}>
                  <input type="date" value={o.invoiceDate} onChange={upd(o.id, 'invoiceDate')} style={{ width: 108 }}
                    title={o.invoiceDate ? '' : 'Expected ship date is required on an open opportunity'} /></td>
                <td onClick={selectCell(o, COLS[22])} className={isSel(o, COLS[22]) ? 'cell-sel' : ''}>
                  <select value={o.status} onChange={upd(o.id, 'status')}>
                    <option>Open</option><option>Closed</option>
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
                <td onClick={selectCell(o, COLS[25])} className={isSel(o, COLS[25]) ? 'cell-sel' : ''}><input type="text" value={o.contactPerson} onChange={upd(o.id, 'contactPerson')} style={{ minWidth: 120 }} /></td>
                <td onClick={selectCell(o, COLS[26])} className={isSel(o, COLS[26]) ? 'cell-sel' : ''}><input type="text" value={o.contactPhone} onChange={upd(o.id, 'contactPhone')} style={{ minWidth: 110 }} /></td>
                <td onClick={selectCell(o, COLS[27])} className={isSel(o, COLS[27]) ? 'cell-sel' : ''}>
                  <div className="ro" title="Auto-stamped — read only">{ddMmmYY(o.lastUpdated)}</div>
                </td>
                <td onClick={selectCell(o, COLS[28])} className={isSel(o, COLS[28]) ? 'cell-sel' : ''} style={{ textAlign: 'center' }}>
                  <input type="checkbox" checked={!!o.forecast} onChange={upd(o.id, 'forecast')} title="Include for roll-up" />
                </td>
                <td onClick={selectCell(o, COLS[29])} className={isSel(o, COLS[29]) ? 'cell-sel' : ''}><input type="text" value={o.remarks} onChange={upd(o.id, 'remarks')} style={{ minWidth: 220 }} /></td>
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
                        <option value="">{na.owner ? `${na.owner} (auto)` : '— none —'}</option>
                        {OWNERS.map(owner => <option key={owner}>{owner}</option>)}
                      </select>
                    )
                  })()}
                </td>
                <td><Link to={`/proposal/${o.id}`}>Open ▸</Link></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="rowhead"></td>
              <td colSpan={14}>Totals {rows.length < base.length && <span className="hint">({rows.length} of {base.length} rows shown — filters active)</span>}</td>
              <td className="num">{showValue ? `₹ ${fmt(totals.v)}` : <Icon name="lock" size={12} />}</td>
              <td className="num">{comm ? `₹ ${fmt(totals.c)}` : <Icon name="lock" size={12} />}</td>
              <td className="num">{comm ? `₹ ${fmt(totals.v - totals.c)}` : <Icon name="lock" size={12} />}</td>
              <td className="num" style={{ color: 'var(--amber-text)' }}>{comm && totals.v ? Math.round(((totals.v - totals.c) / totals.v) * 100) + '%' : comm ? '' : <Icon name="lock" size={12} />}</td>
              <td colSpan={13}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="sheet-tabs">
        {['Pivot', 'Opportunities', 'Old Closed Opps'].map(t => (
          <div key={t} className={`tab ${sheet === t ? 'active' : ''}`}
            onClick={() => (t === 'Pivot' ? nav('/dashboard') : setSheet(t))}>
            {t}
          </div>
        ))}
        <div className="tab">＋</div>
      </div>
    </div>
  )
}
