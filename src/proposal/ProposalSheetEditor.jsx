import React, { useState } from 'react'
import { fmt } from '../utils.js'
import InputsWorkbook from './InputsWorkbook.jsx'
import { currencySymbol } from '../currency.js'

export default function ProposalSheetEditor({
  p, opp, doc, save, editable = true, totals, units, totalQty, lineComputed, lineQuoted, priced,
   lineCost, linePrice, updLine, removeLine, adjustLineQty, updTerm, addTerm, removeTerm, addLine, pasteBoq, store, workbook = 'proposal', setWorkbook,
}) {
  const [localWorkbook, setLocalWorkbook] = useState('proposal')
  const activeWorkbook = setWorkbook ? workbook : localWorkbook
  const isSpares = p?.proposalType === 'Spares' || opp?.route === 'Spares'
  const isServices = p?.proposalType === 'Services' || opp?.route === 'Service' || opp?.route === 'Services'
  const proposalSymbol = currencySymbol(p?.sourceCurrency || 'INR')
  // Edit Sheet is the single entry point from the proposal navigation. Start on
  // BOQ so extracted buyer parts are immediately visible without another tab row.
  const [sheet, setSheet] = useState('BOQ')
  const field = (label, key, type = 'text') => (
    <label className="proposal-sheet-field">{label}
      <input type={type} value={p[key] || ''} onChange={e => save({ ...p, [key]: e.target.value })} />
    </label>
  )

  if (activeWorkbook === 'inputs') return <div className="proposal-sheet-editor"><InputsWorkbook store={store} /></div>

  const show = name => sheet === name
  return (
    <div className={`proposal-sheet-editor ${editable ? '' : 'proposal-sheet-editor-readonly'}`}>
      <div className="proposal-sheet-head">
        <div><p className="hint">{editable ? 'Edit white cells. Calculated totals stay locked and update the Preview automatically.' : 'Read-only view. Only the opportunity owner or an administrator can edit this proposal.'}</p></div>
      </div>
      <fieldset disabled={!editable}>

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
        <p className="hint proposal-boq-edit-note">Read-only reference. Quantities, descriptions, and prices are maintained in the sourcing workflow.</p>
        <div className="sheet-wrap proposal-edit-wrap">
           <table aria-readonly="true" className={`sheet proposal-edit-grid ${isSpares ? 'proposal-edit-grid-spares' : isServices ? 'proposal-edit-grid-services' : 'proposal-edit-grid-project'} ${priced ? 'is-priced' : 'is-unpriced'}`}>
             {isSpares || isServices ? (
               <colgroup>
                 <col className="boq-col-si" /><col className="boq-col-description" />
                 {isSpares && <col className="boq-col-part" />}
                 <col className="boq-col-total-qty" />
                 {priced && <><col className="boq-col-unit-price" /><col className="boq-col-total-price" /></>}
               </colgroup>
             ) : (
               <colgroup>
                 <col className="boq-col-si" /><col className="boq-col-category" /><col className="boq-col-description" /><col className="boq-col-part" />
                 <col className="boq-col-qty" /><col className="boq-col-qty" /><col className="boq-col-qty" /><col className="boq-col-total-qty" /><col className="boq-col-uom" />
                 {priced && <><col className="boq-col-unit-price" /><col className="boq-col-total-price" /></>}
               </colgroup>
             )}
             <thead><tr>
              {isSpares || isServices ? (
                <><th>Sl.</th><th>{isServices ? 'Scope / activity' : 'Item Description'}</th>{isSpares && <th>Proposed Model/Part No.</th>}<th>{isServices ? 'Days / hours' : 'Qty'}</th>
                  {priced && <><th>{isServices ? `Rate ${proposalSymbol}` : `Unit Price ${proposalSymbol}`}</th><th>Total Price {proposalSymbol}</th></>}
                </>
              ) : (
                <><th>Sl.</th><th>Item category</th><th>Description</th><th>Model / part number</th>
                  <th>Qty/unit</th><th>Common</th><th>Spares</th><th>Total qty</th><th>UOM</th>
                  {priced && <><th>Unit price ₹</th><th>Total price ₹</th></>}
                </>
              )}
            </tr></thead>
            <tbody>{p.bom.map((l, i) => {
              const editableFields = ['itemCategory', 'desc', 'qtyPerUnit', 'common', 'spares', 'quoted']
              if (isSpares || isServices) {
                const quantity = totalQty(l)
                const visiblePartNumber = l.sparesSupport && /^na$/i.test(String(l.pn || '')) ? '' : (l.pn || '')
                return <tr key={i}>
                  <td className="rowhead">{i + 1}</td>
                  <td><div className="proposal-cell-text">{l.desc || '—'}</div></td>
                  {isSpares && <td>
                    <div className="proposal-cell-text">{visiblePartNumber || '—'}</div>
                    {l.custRef && l.custRef.trim().toLowerCase() !== (l.pn || '').trim().toLowerCase() && <div className="hint">{l.custRef}</div>}
                  </td>}
                  <td className="num">
                    <span>{quantity || '—'}</span>
                  </td>
                  {priced && <><td className="num">{proposalSymbol} {fmt(lineQuoted(l))}</td>
                    <td className="num">{proposalSymbol} {fmt(lineQuoted(l) * quantity)}</td></>}
                </tr>
              }
              return <tr key={i}>
                <td className="rowhead">{i + 1}</td>
                <td>{l.itemCategory || '—'}</td>
                <td><div className="proposal-cell-text">{l.desc || '—'}</div></td>
                <td>{l.pn || '—'}{l.custRef && l.custRef.trim().toLowerCase() !== (l.pn || '').trim().toLowerCase() && <div className="hint">{l.custRef}</div>}</td>
                {editableFields.slice(2, 5).map(key => <td className="num" key={key}>{l[key] || '—'}</td>)}
                <td className="num"><b>{totalQty(l)}</b></td>
                <td>{l.uom || '—'}</td>
                {priced && <><td className="num">{proposalSymbol} {fmt(lineQuoted(l))}</td>
                <td className="num">{proposalSymbol} {fmt(lineQuoted(l) * totalQty(l))}</td></>}
              </tr>
            })}</tbody>
            {priced && <tfoot><tr><td colSpan={isSpares ? 5 : isServices ? 4 : 10}>{isSpares ? `Total For ${p.subject || opp?.oppName || 'Proposal'}` : 'Totals'}</td><td className="num">{proposalSymbol} {fmt(lineQuoted ? p.bom.reduce((sum, line) => sum + lineQuoted(line) * totalQty(line), 0) : 0)}</td></tr></tfoot>}
          </table>
        </div>
        <div className="costing-note">Internal cost and margin calculations remain protected; proposal editing is restricted to the sourcing workflow.</div>
      </section>}

      {show('Document') && <section className="form-card wide">
        <div className="section-title">Document text</div>
        <label>Executive summary<textarea rows={5} value={p.execSummary ?? doc.execSummary ?? ''} onChange={e => save({ ...p, execSummary: e.target.value })} /></label>
        <label>Commercial note<textarea rows={3} value={p.commercialNote ?? doc.commercialNote ?? ''} onChange={e => save({ ...p, commercialNote: e.target.value })} /></label>
      </section>}
      </fieldset>
    </div>
  )
}
