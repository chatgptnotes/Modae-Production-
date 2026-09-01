import React, { useRef, useState } from 'react'
import { fmt } from '../utils.js'
import { nextCell } from './sheetNav.js'
import InputsWorkbook from './InputsWorkbook.jsx'

// The sheet is deliberately built from native inputs: browser copy/paste and
// keyboard focus are enough here, and keep the proposal model as the only data
// source.
const inputProps = (row, col, onKeyDown) => ({
  'data-sheet-cell': `${row}:${col}`,
  onKeyDown,
})

export default function ProposalSheetEditor({
  p, opp, doc, save, allParts, totals, units, totalQty, lineComputed, lineQuoted, priced,
  lineCost, linePrice, addBomLine, updLine, removeLine, updTerm, addTerm, removeTerm, pasteBoq, store,
  boqFileRef, extractBoqFromPdf, boqExtractBusy, boqExtractError,
}) {
  const [workbook, setWorkbook] = useState('proposal')
  // Edit Sheet is the single entry point from the proposal navigation. Start on
  // BOQ so extracted buyer parts are immediately visible without another tab row.
  const [sheet, setSheet] = useState('BOQ')
  const sheetRef = useRef(null)
  const focusCell = (row, col) => sheetRef.current?.querySelector(`[data-sheet-cell="${row}:${col}"]`)?.focus()
  const keyNav = (e, row, col, rows, cols) => {
    const target = nextCell(row, col, e.key, rows, cols)
    if (!target) return
    e.preventDefault()
    focusCell(...target)
  }
  const paste = (startRow, startCol, e) => {
    const values = e.clipboardData.getData('text').split(/\r?\n/).map(row => row.split('\t'))
    if (values.length === 1 && values[0].length === 1) return
    e.preventDefault()
    pasteBoq(startRow, startCol, values)
  }
  const field = (label, key, type = 'text') => (
    <label className="proposal-sheet-field">{label}
      <input type={type} value={p[key] || ''} onChange={e => save({ ...p, [key]: e.target.value })} />
    </label>
  )

  if (workbook === 'inputs') return <div className="proposal-sheet-editor"><div className="workbook-switcher"><button onClick={() => setWorkbook('proposal')}>Proposal Workbook</button><button className="active">Inputs Workbook</button></div><InputsWorkbook store={store} /></div>

  const show = name => sheet === name
  return (
    <div className="proposal-sheet-editor" ref={sheetRef}>
      <div className="proposal-sheet-head">
        <div><p className="hint">Edit white cells. Calculated totals stay locked and update the Preview automatically.</p></div>
        <div className="workbook-switcher"><button className="active">Proposal Workbook</button><button onClick={() => setWorkbook('inputs')}>Inputs Workbook</button></div>
      </div>

      {show('Cover') && <section className="form-card wide">
        <div className="section-title">Proposal header</div>
        <div className="proposal-sheet-fields">
          {field('Revision date', 'revisionDate', 'date')}
          {field('Our reference', 'ourRef')}
          {field('Bid stage', 'bidStage')}
          {field('Bid type', 'bidType')}
          {field('Revision', 'revision')}
          {field('Addressee', 'addressee')}
          {field('Kind attention', 'kindAttn')}
          {field('RFQ number', 'rfqNumber')}
          {field('Subject', 'subject')}
          {field('Project', 'project')}
        </div>
      </section>}

      {show('Commercial Terms') && <section className="form-card wide">
        <div className="section-title">Commercial terms</div>
        <div className="sheet-wrap">
          <table className="sheet">
            <thead><tr><th>Term</th><th>Customer ask</th><th>Our response</th><th>Status</th><th /></tr></thead>
            <tbody>{(p.terms || []).map((t, i) => (
              <tr key={i}>
                <td><input value={t.term || ''} onChange={updTerm(i, 'term')} /></td>
                <td><input value={t.customerAsk || ''} onChange={updTerm(i, 'customerAsk')} /></td>
                <td><input value={t.ourResponse || ''} onChange={updTerm(i, 'ourResponse')} /></td>
                <td><select value={t.status || 'Comply'} onChange={updTerm(i, 'status')}><option>Comply</option><option>Deviation</option></select></td>
                <td><button onClick={removeTerm(i)} title="Remove term">✕</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <button onClick={addTerm}>+ Add term</button>
      </section>}

      {show('BOQ') && <section className="form-card wide">
        <div className="section-title">Bill of quantities</div>
        <div className="toolbar">
          <input ref={boqFileRef} type="file" accept="application/pdf" onChange={extractBoqFromPdf} style={{ display: 'none' }} />
          <button onClick={() => boqFileRef.current?.click()} disabled={boqExtractBusy}>
            {boqExtractBusy ? 'Extracting PDF…' : 'Extract BOQ from buyer PDF'}
          </button>
          <label>Add part from buyer PDF or price list: <select value="" onChange={e => e.target.value !== '' && addBomLine(e.target.value)}>
            <option value="">— select part number —</option>
            {(p.extractedItems || []).length > 0 && <optgroup label="Buyer PDF items">
              {(p.extractedItems || []).map((x, i) => {
                const key = x.partNumber || x.customerRef || x.description || ''
                const exists = p.bom.some(line => (line.custRef || line.pn || '').toLowerCase() === key.toLowerCase())
                return <option key={`source-${i}`} value={`source:${i}`} disabled={exists}>
                  {key || x.description}{exists ? ' (already added)' : ''}
                </option>
              })}
            </optgroup>}
            <optgroup label="Price-list items">
              {allParts.map((x, i) => <option key={i} value={i}>{x.list} · {x.pn} — {x.desc}</option>)}
            </optgroup>
          </select></label>
          <span className="hint">Paste tab-separated cells into the editable columns. Use arrows, Enter, or Tab to move.</span>
        </div>
        {boqExtractError && <div className="errbox" role="alert">{boqExtractError}</div>}
        {p.boqSource && <div className="hint">Source: {p.boqSource}. Review extracted rows before pricing.</div>}
        <div className="sheet-wrap">
          <table className="sheet proposal-edit-grid">
            <thead><tr>
              <th>Sl.</th><th>Item category</th><th>Description</th><th>Model / part number</th>
              <th>Qty/unit</th><th>Common</th><th>Spares</th><th>Total qty</th><th>UOM</th>
              {priced && <><th>Unit price ₹</th><th>Total price ₹</th></>}<th />
            </tr></thead>
            <tbody>{p.bom.map((l, i) => {
              const editable = ['itemCategory', 'desc', 'qtyPerUnit', 'common', 'spares', 'quoted']
              return <tr key={i}>
                <td className="rowhead">{i + 1}</td>
                <td><input {...inputProps(i, 0, e => { paste(i, 0, e); keyNav(e, i, 0, p.bom.length, 6) })} value={l.itemCategory || ''} onChange={updLine(i, 'itemCategory', false)} /></td>
                <td><input {...inputProps(i, 1, e => { paste(i, 1, e); keyNav(e, i, 1, p.bom.length, 6) })} value={l.desc || ''} onChange={updLine(i, 'desc', false)} /></td>
                <td>{l.pn || '—'}{l.custRef && <div className="hint">{l.custRef}</div>}</td>
                {editable.slice(2, 5).map((key, j) => <td className="num" key={key}><input type="number" min="0" {...inputProps(i, j + 2, e => { paste(i, j + 2, e); keyNav(e, i, j + 2, p.bom.length, 6) })} value={l[key] || ''} onChange={updLine(i, key)} /></td>)}
                <td className="num"><b>{totalQty(l)}</b></td>
                <td>{l.uom || '—'}</td>
                {priced && <><td className="num"><input type="number" min="0" {...inputProps(i, 5, e => { paste(i, 5, e); keyNav(e, i, 5, p.bom.length, 6) })} value={l.quoted || ''} placeholder={fmt(Math.round(lineComputed(l)))} onChange={updLine(i, 'quoted', false)} /></td>
                <td className="num">₹ {fmt(lineQuoted(l) * totalQty(l))}</td></>}
                <td><button onClick={removeLine(i)} title="Remove line">✕</button></td>
              </tr>
            })}</tbody>
            {priced && <tfoot><tr><td colSpan={10}>Totals</td><td className="num">₹ {fmt(totals.target)}</td><td /></tr></tfoot>}
          </table>
        </div>
        <div className="costing-note">Internal cost and margin calculations remain protected; {priced ? 'the customer-facing quoted price is editable.' : 'pricing is restricted for this role.'}</div>
      </section>}

      {show('Document') && <section className="form-card wide">
        <div className="section-title">Document text</div>
        <label>Executive summary<textarea rows={5} value={p.execSummary ?? doc.execSummary ?? ''} onChange={e => save({ ...p, execSummary: e.target.value })} /></label>
        <label>Commercial note<textarea rows={3} value={p.commercialNote ?? doc.commercialNote ?? ''} onChange={e => save({ ...p, commercialNote: e.target.value })} /></label>
      </section>}
    </div>
  )
}
