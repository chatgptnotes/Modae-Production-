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
  p, opp, doc, save, totals, units, totalQty, lineComputed, lineQuoted, priced,
   lineCost, linePrice, updLine, removeLine, adjustLineQty, updTerm, addTerm, removeTerm, addLine, pasteBoq, store, workbook = 'proposal', setWorkbook,
}) {
  const [localWorkbook, setLocalWorkbook] = useState('proposal')
  const activeWorkbook = setWorkbook ? workbook : localWorkbook
  const isSpares = p?.proposalType === 'Spares' || opp?.route === 'Spares'
  const isServices = p?.proposalType === 'Services' || opp?.route === 'Service' || opp?.route === 'Services'
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
    if (isSpares || isServices) {
      const keys = ['desc', 'common', 'quoted']
      const bom = p.bom.map(line => ({ ...line }))
      values.forEach((row, rowOffset) => row.forEach((value, colOffset) => {
        const line = bom[startRow + rowOffset]
        const key = keys[startCol + colOffset]
        if (!line || !key) return
        line[key] = key === 'desc' ? value : key === 'quoted' ? value : Math.max(0, Number(value) || 0)
        if (key === 'common') {
          line.qtyPerUnit = 0
          line.spares = 0
        }
      }))
      save({ ...p, bom })
      return
    }
    pasteBoq(startRow, startCol, values)
  }
  const field = (label, key, type = 'text') => (
    <label className="proposal-sheet-field">{label}
      <input type={type} value={p[key] || ''} onChange={e => save({ ...p, [key]: e.target.value })} />
    </label>
  )

  if (activeWorkbook === 'inputs') return <div className="proposal-sheet-editor"><InputsWorkbook store={store} /></div>

  const show = name => sheet === name
  return (
    <div className="proposal-sheet-editor" ref={sheetRef}>
      <div className="proposal-sheet-head">
        <div><p className="hint">Edit white cells. Calculated totals stay locked and update the Preview automatically.</p></div>
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
                <td><button className="proposal-row-minus" onClick={removeTerm(i)} title="Remove term" aria-label="Remove term">−</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <button onClick={addTerm}>+ Add term</button>
      </section>}

      {show('BOQ') && <section className="form-card wide">
        <div className="section-title">Bill of quantities</div>
        <p className="hint proposal-boq-edit-note">Edit the existing rows directly. Use copy/paste or the keyboard to update the white cells.</p>
        <div className="sheet-wrap proposal-edit-wrap">
           <table className={`sheet proposal-edit-grid ${isSpares ? 'proposal-edit-grid-spares' : isServices ? 'proposal-edit-grid-services' : 'proposal-edit-grid-project'}`}>
             {isSpares || isServices ? (
               <colgroup>
                 <col className="boq-col-si" /><col className="boq-col-description" />
                 {isSpares && <col className="boq-col-part" />}
                 <col className="boq-col-total-qty" />
                 {priced && <><col className="boq-col-unit-price" /><col className="boq-col-total-price" /></>}<col className="boq-col-action" />
               </colgroup>
             ) : (
               <colgroup>
                 <col className="boq-col-si" /><col className="boq-col-category" /><col className="boq-col-description" /><col className="boq-col-part" />
                 <col className="boq-col-qty" /><col className="boq-col-qty" /><col className="boq-col-qty" /><col className="boq-col-total-qty" /><col className="boq-col-uom" />
                 {priced && <><col className="boq-col-unit-price" /><col className="boq-col-total-price" /></>}<col className="boq-col-action" />
               </colgroup>
             )}
             <thead><tr>
              {isSpares || isServices ? (
                <><th>Sl.</th><th>{isServices ? 'Scope / activity' : 'Item Description'}</th>{isSpares && <th>Proposed Model/Part No.</th>}<th>{isServices ? 'Days / hours' : 'Qty'}</th>
                  {priced && <><th>{isServices ? 'Rate ₹' : 'Unit Price ₹'}</th><th>Total Price ₹</th></>}<th>Actions</th></>
              ) : (
                <><th>Sl.</th><th>Item category</th><th>Description</th><th>Model / part number</th>
                  <th>Qty/unit</th><th>Common</th><th>Spares</th><th>Total qty</th><th>UOM</th>
                  {priced && <><th>Unit price ₹</th><th>Total price ₹</th></>}<th /></>
              )}
            </tr></thead>
            <tbody>{p.bom.map((l, i) => {
              const editable = ['itemCategory', 'desc', 'qtyPerUnit', 'common', 'spares', 'quoted']
              if (isSpares || isServices) {
                const quantity = totalQty(l)
                return <tr key={i}>
                  <td className="rowhead">{i + 1}</td>
                  <td><textarea rows={2} className="proposal-description-editor" {...inputProps(i, 0, e => { paste(i, 0, e); keyNav(e, i, 0, p.bom.length, 4) })} value={l.desc || ''} onChange={updLine(i, 'desc', false)} /></td>
                  {isSpares && <td>
                    <textarea rows={2} className="proposal-pn-editor" value={l.pn || ''} onChange={updLine(i, 'pn', false)} />
                    {l.custRef && l.custRef.trim().toLowerCase() !== (l.pn || '').trim().toLowerCase() && <div className="hint">{l.custRef}</div>}
                  </td>}
                  <td className="num">
                    <input type="number" min="0" {...inputProps(i, 1, e => { paste(i, 1, e); keyNav(e, i, 1, p.bom.length, 4) })}
                      value={quantity || ''} onChange={e => {
                        const nextQuantity = Math.max(0, Number(e.target.value) || 0)
                        save({ ...p, bom: p.bom.map((line, j) => j === i ? { ...line, qtyPerUnit: 0, common: nextQuantity, spares: 0 } : line) })
                      }} />
                  </td>
                  {priced && <><td className="num"><input type="number" min="0" {...inputProps(i, 2, e => { paste(i, 2, e); keyNav(e, i, 2, p.bom.length, 4) })} value={l.quoted || ''} placeholder={fmt(Math.round(lineComputed(l)))} onChange={updLine(i, 'quoted', false)} /></td>
                    <td className="num">₹ {fmt(lineQuoted(l) * quantity)}</td></>}
                  <td><button type="button" onClick={removeLine(i)} title="Remove line"><span className="proposal-row-control">Remove</span></button></td>
                </tr>
              }
              return <tr key={i}>
                <td className="rowhead">{i + 1}</td>
                <td><input {...inputProps(i, 0, e => { paste(i, 0, e); keyNav(e, i, 0, p.bom.length, 6) })} value={l.itemCategory || ''} onChange={updLine(i, 'itemCategory', false)} /></td>
                <td><textarea rows={2} className="proposal-description-editor" {...inputProps(i, 1, e => { paste(i, 1, e); keyNav(e, i, 1, p.bom.length, 6) })} value={l.desc || ''} onChange={updLine(i, 'desc', false)} /></td>
                <td>{l.pn || '—'}{l.custRef && l.custRef.trim().toLowerCase() !== (l.pn || '').trim().toLowerCase() && <div className="hint">{l.custRef}</div>}</td>
                {editable.slice(2, 5).map((key, j) => <td className="num" key={key}>
                  {key === 'qtyPerUnit'
                    ? <div className="quantity-stepper">
                        <button type="button" onClick={adjustLineQty(i, -1)} title="Decrease quantity" aria-label={`Decrease quantity for line ${i + 1}`}>−</button>
                        <input type="number" min="0" {...inputProps(i, j + 2, e => { paste(i, j + 2, e); keyNav(e, i, j + 2, p.bom.length, 6) })} value={l[key] || ''} onChange={updLine(i, key)} />
                        <button type="button" onClick={adjustLineQty(i, 1)} title="Increase quantity" aria-label={`Increase quantity for line ${i + 1}`}>＋</button>
                      </div>
                    : <input type="number" min="0" {...inputProps(i, j + 2, e => { paste(i, j + 2, e); keyNav(e, i, j + 2, p.bom.length, 6) })} value={l[key] || ''} onChange={updLine(i, key)} />}
                </td>)}
                <td className="num"><b>{totalQty(l)}</b></td>
                <td>{l.uom || '—'}</td>
                {priced && <><td className="num"><input type="number" min="0" {...inputProps(i, 5, e => { paste(i, 5, e); keyNav(e, i, 5, p.bom.length, 6) })} value={l.quoted || ''} placeholder={fmt(Math.round(lineComputed(l)))} onChange={updLine(i, 'quoted', false)} /></td>
                <td className="num">₹ {fmt(lineQuoted(l) * totalQty(l))}</td></>}
                <td><span className="proposal-row-control" title="Adjust quantity with the stepper">Qty</span></td>
              </tr>
            })}</tbody>
            {priced && <tfoot><tr><td colSpan={isSpares ? 5 : isServices ? 4 : 10}>{isSpares ? `Total For ${p.subject || opp?.oppName || 'Proposal'}` : 'Totals'}</td><td className="num">₹ {fmt(totals.target)}</td><td /></tr></tfoot>}
          </table>
        </div>
        <button onClick={addLine}>+ Add line</button>
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
