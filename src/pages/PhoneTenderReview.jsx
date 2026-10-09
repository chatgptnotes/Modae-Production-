import React from 'react'
import { fmt } from '../utils.js'

export function TenderConfidence({ v }) {
  const cls = v >= 0.9 ? 'hi' : v >= 0.6 ? 'med' : 'lo'
  const label = v >= 0.9 ? 'High' : v >= 0.6 ? 'Medium' : 'Low'
  return <span className={`conf-badge ${cls}`} title={`AI extraction confidence ${Math.round(v * 100)}%`}>AI · {label}</span>
}

export function TenderPriceEvidence({ match }) {
  if (!match) return <span className="evidence warn">No price — ad-hoc part will be created (supplier quote needed)</span>
  return match.tier === 4
    ? <span className="evidence warn">{match.list} · {match.currency} {fmt(match.price)} — {match.pn} (suggested from the description — confirm)</span>
    : <span className="evidence ok">{match.list} · {match.currency} {fmt(match.price)} (price list)</span>
}

export function PhoneTenderLines({ items, include, matched, setItem, toggleInclude }) {
  return <section className="phone-tender-review" aria-label="Tender BOQ lines">
    {items.map((item, index) => <article key={index} className="phone-tender-line" data-included={Boolean(include[index])}>
      <header><label><input type="checkbox" checked={Boolean(include[index])} onChange={() => toggleInclude(index)} />Include line {item.sn}</label><TenderConfidence v={item.confidence} /></header>
      <label>Scope description<textarea value={item.description || ''} onChange={setItem(index, 'description')} /></label>
      <p className="hint">Item code: {item.sapCode || 'Not stated'} · Unit: {item.uom || 'Not stated'}</p>
      <label>Part number<input value={item.pn || ''} onChange={setItem(index, 'pn')} /></label>
      <label>Quantity<input type="number" min="0" value={item.qty ?? 0} onChange={setItem(index, 'qty', true)} /></label>
      <div className="phone-tender-evidence"><TenderPriceEvidence match={matched[index]?.match} /></div>
    </article>)}
  </section>
}

export function PhoneTenderTerms({ comp, parse, setCompRow }) {
  return <section className="phone-tender-review" aria-label="Tender commercial terms">
    {comp.map((term, index) => <article key={term.key} className="phone-tender-term">
      <h3>{term.label}</h3>
      {term.needsReview && <p className="hint">Requires engineering review</p>}
      <p><b>Customer ask:</b> {term.customerAsk || 'Not stated'}</p>
      <label>Our response<input value={term.ourResponse || ''} onChange={setCompRow(index, 'ourResponse')} /></label>
      <label>Verdict<select value={term.status} onChange={setCompRow(index, 'status')}><option>Comply</option><option>Deviation</option></select></label>
      <details><summary>{term.clauseRef || 'Source'}</summary><p>{parse.terms.find(t => `Clause ${t.n}` === term.clauseRef)?.text || parse.preNotes.find(note => term.clauseRef === 'Tender notes' && note) || 'No source text available.'}</p></details>
    </article>)}
  </section>
}
