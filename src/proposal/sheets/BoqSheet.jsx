import React from 'react'
import { fmt } from '../../utils.js'
import { BOQ_COLUMNS, boqGroups, amountInWords } from '../../proposalDoc.js'

// The pricing sheet, in the shape the client's own proposals use: one or more
// `Item-10` / `Item-20` groups, each with its own column header, its own
// `Total For` line and its own notes, then the numbered Terms & Conditions
// block underneath.
//
// The cost and margin columns the sample workbooks keep hidden beside the
// customer price are deliberately absent. A workbook can hide a column; a PDF
// cannot, and this document goes to the customer.

const runs = (rows, key) => {
  // One Item Category spanning several part-number sub-rows is what makes the
  // printed sheet read like the sample rather than like a flat list.
  const out = []
  for (let i = 0; i < rows.length; i++) {
    const v = rows[i].line[key] || ''
    if (i > 0 && (rows[i - 1].line[key] || '') === v) { out.push(0); continue }
    let n = 1
    while (i + n < rows.length && (rows[i + n].line[key] || '') === v) n++
    out.push(n)
  }
  return out
}

const cellValue = (col, r) => {
  switch (col.key) {
    case 'sl': return r.sl
    case 'qty': return r.qty
    case 'unit': return `₹ ${fmt(r.unit)}`
    case 'total': return `₹ ${fmt(r.total)}`
    case 'qtyPerUnit': return r.line.qtyPerUnit || 0
    case 'common': return r.line.common || 0
    case 'spares': return r.line.spares || 0
    default: return r.line[col.key] || ''
  }
}

export default function BoqSheet({ p, doc, priced, variant, lineQuoted }) {
  const cols = (BOQ_COLUMNS[variant] || BOQ_COLUMNS.firm).filter(c => priced || !c.priced)
  const groups = boqGroups(p, { lineQuoted, units: p.units })
  const grand = groups.reduce((s, g) => s + g.total, 0)

  return (
    <>
      {groups.map(g => {
        const spans = cols.some(c => c.key === 'itemCategory') ? runs(g.rows, 'itemCategory') : null
        return (
          <div className="doc-boq-group" key={g.id}>
            <div className="doc-boq-band"><b>{g.no}</b><span>{g.title}</span></div>
            <table className="doc-table">
              <thead>
                <tr>{cols.map(c => <th key={c.key} className={c.cls || (c.num ? 'num' : '')}>{c.label}</th>)}</tr>
              </thead>
              <tbody>
                {g.rows.map((r, i) => (
                  <tr key={i}>
                    {cols.map(c => {
                      if (c.key === 'itemCategory' && spans) {
                        if (!spans[i]) return null
                        return <td key={c.key} rowSpan={spans[i]}><b>{r.line.itemCategory || ''}</b></td>
                      }
                      return (
                        <td key={c.key} className={c.cls || (c.num ? 'num' : '')}>
                          {cellValue(c, r)}
                        </td>
                      )
                    })}
                  </tr>
                ))}
                {!g.rows.length && (
                  <tr><td colSpan={cols.length} className="doc-muted">No line items.</td></tr>
                )}
                {priced && (
                  <tr className="doc-total-for">
                    <td colSpan={cols.length - 1}>Total For {g.title}</td>
                    <td className="num">₹ {fmt(g.total)}</td>
                  </tr>
                )}
              </tbody>
            </table>
            {g.notes.filter(Boolean).map((n, i) => (
              <p className="doc-note-row" key={i}><b>Note:</b> {n}</p>
            ))}
          </div>
        )
      })}

      {priced && groups.length > 1 && (
        <p className="doc-subtotal">Total ex-works, ₹ {fmt(grand)} — {amountInWords(grand)}</p>
      )}
      {priced && groups.length === 1 && (
        <p className="doc-subtotal">{amountInWords(grand)}</p>
      )}

      {doc.docTerms.length > 0 && (
        <div className="doc-boq-terms">
          <div className="doc-block-h">{doc.docTermsHeading}</div>
          <ol className="doc-terms-list">
            {doc.docTerms.map((t, i) => <li key={i}><b>{t.label}:</b> {t.text}</li>)}
          </ol>
        </div>
      )}

      {(doc.billingMilestones || []).length > 0 && (
        <div className="doc-boq-terms">
          <div className="doc-block-h">Billing &amp; Payment Milestones:</div>
          <table className="doc-table">
            <tbody>
              {doc.billingMilestones.map((m, i) => (
                <tr key={i}>
                  <td style={{ width: '18%' }}><b>{m.no || `Milestone-${i + 1}`}</b></td>
                  <td>{m.text}</td>
                  {priced && <td className="num" style={{ width: '16%' }}>{m.value}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
