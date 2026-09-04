import React from 'react'
import { useEffect, useState } from 'react'
import { fmt } from '../utils.js'
import { Icon } from '../icons.jsx'
import { useStore } from '../store.jsx'
import {
  docModel, docLayout, addDays, lineQty, standardFor, MODAE_COMPANY,
} from '../proposalDoc.js'

// Sheet keys are internal; these are what the salesperson sees.
const ANNEXE_LABELS = {
  compliance: 'Technical Compliance & Clarification Table',
  clarifications: 'Clarifications',
  sensorComparison: 'Sensor Comparison',
  sow: 'Scope of Work',
  issues: 'Issues List',
}

// A stored value exists only once the user has edited it — everything else is
// live auto-draft. That distinction is what "Reset to auto-draft" acts on.
const Auto = ({ p, field, onReset }) => (
  p[field] === undefined
    ? <span className="hint">Auto-drafted</span>
    : <button className="linklike" onClick={onReset} title="Discard the edit and go back to the generated text">
        Reset to auto-draft
      </button>
)

const sectionId = title => String(title).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()

function Section({ title, p, field, onReset, children }) {
  const id = sectionId(title)
  const initiallyOpen = /covering letter|executive summary/i.test(title)
  const compact = /annexes|bill of quantities|assumptions|exclusions|terms offered|validity|attachments/i.test(title)
  const [open, setOpen] = useState(initiallyOpen)

  useEffect(() => {
    const openFromNavigator = event => {
      if (event.detail !== id) return
      setOpen(true)
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    }
    window.addEventListener('proposal-doc-open', openFromNavigator)
    return () => window.removeEventListener('proposal-doc-open', openFromNavigator)
  }, [id])

  return (
    <section id={id} className={`form-card doc-edit ${compact ? 'doc-edit-compact' : ''} ${open ? 'is-open' : 'is-collapsed'}`}>
      <div className="doc-section-toggle" role="button" tabIndex={0} aria-expanded={open}
        onClick={() => setOpen(value => !value)}
        onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setOpen(value => !value) } }}>
        <span className="doc-section-chevron" aria-hidden="true">{open ? '−' : '+'}</span>
        <span>{title}</span>
        <span className="spacer" />
        {field && <span onClick={event => event.stopPropagation()}><Auto p={p} field={field} onReset={onReset} /></span>}
      </div>
      {open && <div className="doc-section-content">{children}</div>}
    </section>
  )
}

// Add / edit / remove / reorder for the plain-string list sections.
function ListEditor({ items, onChange, placeholder }) {
  const set = (i, v) => onChange(items.map((x, j) => (j === i ? v : x)))
  const move = (i, d) => {
    const next = [...items]
    const j = i + d
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  return (
    <>
      {items.map((it, i) => (
        <div key={i} className="doc-list-row">
          <span className="doc-list-n">{i + 1}</span>
          <textarea rows={2} value={it} onChange={e => set(i, e.target.value)} />
          <button onClick={() => move(i, -1)} disabled={i === 0} title="Move up"><Icon name="chevronUp" size={12} /></button>
          <button onClick={() => move(i, 1)} disabled={i === items.length - 1} title="Move down"><Icon name="chevronDown" size={12} /></button>
          <button onClick={() => onChange(items.filter((_, j) => j !== i))} title="Remove">✕</button>
        </div>
      ))}
      <button onClick={() => onChange([...items, ''])}>+ Add</button>
      {!items.length && <span className="hint"> {placeholder}</span>}
    </>
  )
}

// Same, for the two-column list sections (delivery and payment milestones).
function PairEditor({ items, keys, labels, onChange }) {
  const [a, b] = keys
  const set = (i, k, v) => onChange(items.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
  return (
    <>
      <table className="sheet">
        <thead><tr><th>{labels[0]}</th><th style={{ width: '32%' }}>{labels[1]}</th><th></th></tr></thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td><input value={it[a] || ''} onChange={e => set(i, a, e.target.value)} style={{ minWidth: 300 }} /></td>
              <td><input value={it[b] || ''} onChange={e => set(i, b, e.target.value)} style={{ minWidth: 140 }} /></td>
              <td><button onClick={() => onChange(items.filter((_, j) => j !== i))} title="Remove">✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={() => onChange([...items, { [a]: '', [b]: '' }])}>+ Add row</button>
    </>
  )
}

// The Document tab: every section of the customer document in one place —
// free text editable, derived sections shown read-only so the operator can see
// what will actually print.
export default function DocEditor({ p, opp, save, files, totals, priced }) {
  const store = useStore()
  const doc = docModel(p, opp, { files, config: store.config })
  const set = (k, v) => save({ ...p, [k]: v })
  const reset = k => () => { const next = { ...p }; delete next[k]; save(next) }

  const autoGrow = event => {
    const element = event.currentTarget
    element.style.height = 'auto'
    element.style.height = `${Math.max(element.scrollHeight, 72)}px`
  }
  const area = (field, rows = 4) => (
    <textarea className="doc-auto-textarea" rows={rows} value={doc[field]} onChange={e => set(field, e.target.value)} onInput={autoGrow} />
  )

  const navigation = [
    ['annexes-to-issue', 'Annexes'], ['covering-letter', 'Cover letter'], ['1-executive-summary', 'Summary'],
    ['2-scope-of-supply', 'Scope'], ['3-bill-of-quantities', 'BoQ'], ['4-commercial-summary', 'Commercial'],
    ['5-delivery-schedule', 'Delivery'], ['6-assumptions', 'Assumptions'], ['7-exclusions', 'Exclusions'],
    ['8-deviations', 'Deviations'], ['9-terms-offered', 'Terms'], ['10-validity-of-offer', 'Validity'],
    ['11-attachments-enclosures', 'Attachments'], ['about-modae-front-matter-page', 'About ModAE'],
  ]

  const gst = Math.round(totals.target * (doc.gstPct / 100))
  const annexes = (docLayout(p, opp).annexes || [])
    .map(key => ({ key, label: ANNEXE_LABELS[key] || key }))

  return (
    <div className="doc-editor">
      <nav className="doc-section-nav" aria-label="Document sections">
        <span className="doc-section-nav-label">Jump to:</span>
        {navigation.map(([id, label]) => <button type="button" key={id} onClick={() => window.dispatchEvent(new CustomEvent('proposal-doc-open', { detail: id }))}>{label}</button>)}
      </nav>
      <div className="costing-note" style={{ marginBottom: 10 }}>
        The printed proposal follows the ModAE sample proposals: a covering letter, one priced sheet, and
        the technical annexes for this route. Free text is auto-drafted from the opportunity and the BoQ
        and stays live until you edit it; derived content updates itself. Use <b>Print / PDF proposal</b>
        above to see the finished document, and switch <b>Headers and footers</b> off in the print dialog.
      </div>

      <Section title="Annexes to issue">
        <div className="costing-note" style={{ marginBottom: 8 }}>
          The sample workbooks keep these sheets hidden — prepared, but not sent. Tick one to include it
          in the printed document.
        </div>
        {annexes.length === 0
          ? <p className="hint">This route carries no optional annexes.</p>
          : annexes.map(a => (
            <label key={a.key} className="q" style={{ display: 'block' }}>
              <input type="checkbox" checked={(p.printAnnexes || []).includes(a.key)}
                onChange={e => {
                  const on = e.target.checked
                  const next = on
                    ? [...(p.printAnnexes || []), a.key]
                    : (p.printAnnexes || []).filter(k => k !== a.key)
                  save({ ...p, printAnnexes: next })
                }} />
              {' '}{a.label}
            </label>
          ))}
      </Section>

      <Section title="Covering letter">
        <div className="dgrid2" style={{ maxWidth: 620, marginBottom: 8 }}>
          <div>
            <label>Salutation <Auto p={p} field="letterSalutation" onReset={reset('letterSalutation')} /></label>
            <input value={doc.letterSalutation} onChange={e => set('letterSalutation', e.target.value)} />
          </div>
          <div>
            <label>Complimentary close <Auto p={p} field="letterClose" onReset={reset('letterClose')} /></label>
            <input value={doc.letterClose} onChange={e => set('letterClose', e.target.value)} />
          </div>
        </div>
        <div className="section-title">
          Letter body
          <span className="spacer" />
          <Auto p={p} field="letterBody" onReset={reset('letterBody')} />
        </div>
        {area('letterBody', 10)}
        <div className="costing-note">
          Blank lines separate paragraphs. Reference, date, addressee, Kind Attn and subject come from the
          Cover Letter tab; the enclosures list is the Attachments section below.
        </div>
        <div className="q" style={{ marginTop: 8 }}>
          <div className="q-label">CC (optional, comma separated)</div>
          <input value={doc.letterCc} onChange={e => set('letterCc', e.target.value)} placeholder="e.g. Executive Engineer (Stores), Major Stores-A" />
        </div>
      </Section>

      <Section title="1 · Executive summary" p={p} field="execSummary" onReset={reset('execSummary')}>
        {area('execSummary', 12)}
        <div className="costing-note">
          A paragraph whose first line is in CAPITALS prints that line as a sub-heading.
        </div>
      </Section>

      <Section title="2 · Scope of supply">
        <table className="sheet">
          <thead><tr><th>#</th><th>Category</th><th>Offered model</th><th className="num">Qty</th><th className="num">Spec points</th></tr></thead>
          <tbody>
            {doc.scope.map((it, i) => (
              <tr key={i}>
                <td className="rowhead">{i + 1}</td>
                <td><b>{it.category}</b></td>
                <td>{it.pn || <span className="hint">—</span>}</td>
                <td className="num">{it.qty} {it.uom}</td>
                <td className="num">{it.specs.length || <span className="hint">0</span>}</td>
              </tr>
            ))}
            {!doc.scope.length && <tr><td colSpan={5} className="hint">No BoQ lines yet — add them on the Priced BoQ tab.</td></tr>}
          </tbody>
        </table>
        <div className="costing-note">
          Specification points are split out of each tendered description and print under the item. Edit a
          description on the Priced BoQ tab to change them.
        </div>
        <div className="section-title" style={{ marginTop: 10 }}>
          Supplied with every item
          <span className="spacer" />
          <Auto p={p} field="scopeIncludes" onReset={reset('scopeIncludes')} />
        </div>
        <ListEditor items={doc.scopeIncludes} onChange={v => set('scopeIncludes', v)} placeholder="Nothing listed." />
        <div className="section-title" style={{ marginTop: 10 }}>
          Note under the scope
          <span className="spacer" />
          <Auto p={p} field="scopeNote" onReset={reset('scopeNote')} />
        </div>
        {area('scopeNote', 2)}
      </Section>

      <Section title="3 · Bill of quantities">
        <p className="hint">
          {(p.bom || []).length} line{(p.bom || []).length === 1 ? '' : 's'}, {(p.bom || []).reduce((s, l) => s + lineQty(l, p.units), 0)} nos total
          {priced ? ` — ₹ ${fmt(totals.target)}` : ' — prices withheld (unpriced technical bid)'}. Edit on the Priced BoQ tab.
        </p>
      </Section>

      <Section title="4 · Commercial summary" p={p} field="commercialNote" onReset={reset('commercialNote')}>
        <div className="dgrid2" style={{ maxWidth: 460, marginBottom: 8 }}>
          <div>
            <label>GST %</label>
            <input type="number" min="0" step="0.5" value={doc.gstPct} onChange={e => set('gstPct', +e.target.value || 0)} />
          </div>
          <div>
            <label>Shown as</label>
            <div style={{ paddingTop: 6 }}>{priced ? `₹ ${fmt(gst)} extra at actuals` : <span className="hint">not shown on an unpriced bid</span>}</div>
          </div>
        </div>
        <div className="section-title">
          Basis of the quoted prices
          <span className="spacer" />
          <Auto p={p} field="priceBasis" onReset={reset('priceBasis')} />
        </div>
        <table className="sheet">
          <thead><tr><th style={{ width: '32%' }}>Item</th><th>Basis</th><th></th></tr></thead>
          <tbody>
            {doc.priceBasis.map(([k, v], i) => (
              <tr key={i}>
                <td><input value={k} style={{ minWidth: 160 }}
                  onChange={e => set('priceBasis', doc.priceBasis.map((r, j) => (j === i ? [e.target.value, r[1]] : r)))} /></td>
                <td><input value={v} style={{ minWidth: 320 }}
                  onChange={e => set('priceBasis', doc.priceBasis.map((r, j) => (j === i ? [r[0], e.target.value] : r)))} /></td>
                <td><button onClick={() => set('priceBasis', doc.priceBasis.filter((_, j) => j !== i))} title="Remove">✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button onClick={() => set('priceBasis', [...doc.priceBasis, ['', '']])}>+ Add row</button>
        <div className="section-title" style={{ marginTop: 10 }}>
          Payment stages
          <span className="spacer" />
          <Auto p={p} field="paymentMilestones" onReset={reset('paymentMilestones')} />
        </div>
        <PairEditor items={doc.paymentMilestones} keys={['stage', 'pct']} labels={['Stage', 'Amount / term']}
          onChange={v => set('paymentMilestones', v)} />
        <div className="section-title" style={{ marginTop: 10 }}>Note under the commercial summary</div>
        {area('commercialNote', 3)}
      </Section>

      <Section title="5 · Delivery schedule">
        <div className="section-title">
          Milestones
          <span className="spacer" />
          <Auto p={p} field="deliveryMilestones" onReset={reset('deliveryMilestones')} />
        </div>
        <PairEditor items={doc.deliveryMilestones} keys={['milestone', 'timeline']} labels={['Milestone', 'Timeline']}
          onChange={v => set('deliveryMilestones', v)} />
        <div className="costing-note">Timelines are drafted from the delivery clause of the tender.</div>
        <div className="section-title" style={{ marginTop: 10 }}>
          Note under the schedule
          <span className="spacer" />
          <Auto p={p} field="deliveryNote" onReset={reset('deliveryNote')} />
        </div>
        {area('deliveryNote', 4)}
      </Section>

      <Section title="6 · Assumptions" p={p} field="assumptions" onReset={reset('assumptions')}>
        <ListEditor items={doc.assumptions} onChange={v => set('assumptions', v)} placeholder="No assumptions listed." />
      </Section>

      <Section title="7 · Exclusions" p={p} field="exclusions" onReset={reset('exclusions')}>
        <ListEditor items={doc.exclusions} onChange={v => set('exclusions', v)} placeholder="No exclusions listed." />
      </Section>

      <Section title="8 · Deviations">
        {doc.deviations.length === 0
          ? <div className="okbox">No deviations — the offer complies with every term of the enquiry.</div>
          : (
            <>
              <div className="warnbox">
                {doc.deviations.length} deviation{doc.deviations.length === 1 ? '' : 's'} — each needs approval before the proposal goes out.
                Which terms are deviations is set on the Cover Letter tab; the reasoning below is what prints.
              </div>
              {doc.deviations.map(t => (
                <div key={t.key || t.term} className="form-card" style={{ marginBottom: 8 }}>
                  <div className="section-title">
                    {t.term} <span className="hint">{t.clauseRef}</span>
                    <span className="spacer" />
                    {(p.deviationNotes || {})[t.key]
                      ? <button className="linklike" onClick={() => {
                          const next = { ...(p.deviationNotes || {}) }
                          delete next[t.key]
                          set('deviationNotes', Object.keys(next).length ? next : undefined)
                        }}>Reset to auto-draft</button>
                      : <span className="hint">Auto-drafted</span>}
                  </div>
                  <p className="hint" style={{ margin: '0 0 6px' }}>
                    <b>Your ask:</b> {t.customerAsk}<br /><b>Our position:</b> {t.ourResponse}
                  </p>
                  {[['why', 'Why we take this position'], ['impact', 'Impact if accepted as written'], ['proposal', 'What we propose instead']].map(([k, label]) => (
                    <div key={k} style={{ marginBottom: 6 }}>
                      <label>{label}</label>
                      <textarea rows={2} value={t.rationale[k]} style={{ width: '100%' }}
                        onChange={e => set('deviationNotes', {
                          ...(p.deviationNotes || {}),
                          [t.key]: { ...((p.deviationNotes || {})[t.key] || {}), [k]: e.target.value },
                        })} />
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}
      </Section>

      <Section title="9 · Terms offered" p={p} field="offerTerms" onReset={reset('offerTerms')}>
        <table className="sheet">
          <thead><tr><th>Term</th><th>Our offer</th><th></th></tr></thead>
          <tbody>
            {doc.offerTerms.map((t, i) => (
              <tr key={i}>
                <td><input value={t.term} style={{ minWidth: 120 }}
                  onChange={e => set('offerTerms', doc.offerTerms.map((x, j) => (j === i ? { ...x, term: e.target.value } : x)))} /></td>
                <td><input value={t.ourResponse} style={{ minWidth: 320 }}
                  onChange={e => set('offerTerms', doc.offerTerms.map((x, j) => (j === i ? { ...x, ourResponse: e.target.value } : x)))} /></td>
                <td><button onClick={() => set('offerTerms', doc.offerTerms.filter((_, j) => j !== i))} title="Remove">✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button onClick={() => set('offerTerms', [...doc.offerTerms, { term: '', ourResponse: '' }])}>+ Add term</button>
        <div className="costing-note">
          The full clause-by-clause compliance table ({(p.terms || []).length} rows, ModAE standard position included) prints below this,
          straight from the Cover Letter tab.
        </div>
      </Section>

      <Section title="10 · Validity of offer" p={p} field="validityDays" onReset={reset('validityDays')}>
        <div className="dgrid2" style={{ maxWidth: 460 }}>
          <div>
            <label>Valid for (days)</label>
            <input type="number" min="1" value={doc.validityDays} onChange={e => set('validityDays', +e.target.value || 0)} />
          </div>
          <div>
            <label>Expires</label>
            <div style={{ paddingTop: 6 }}><b>{addDays(p.revisionDate, doc.validityDays)}</b></div>
          </div>
        </div>
        <div className="section-title" style={{ marginTop: 10 }}>
          Validity note
          <span className="spacer" />
          <Auto p={p} field="validityNote" onReset={reset('validityNote')} />
        </div>
        {area('validityNote', 5)}
      </Section>

      <Section title="11 · Attachments & enclosures" p={p} field="attachments" onReset={reset('attachments')}>
        <ListEditor items={doc.attachments} onChange={v => set('attachments', v)} placeholder="No attachments listed." />
        <div className="costing-note">
          This same list prints as the <b>Encl:</b> of the covering letter.
          {files.length > 0 && p.attachments === undefined
            && ` Includes ${files.length} file${files.length === 1 ? '' : 's'} from the opportunity's Customer Specs folder.`}
        </div>
      </Section>

      <Section title="About ModAE (front-matter page)" p={p} field="about" onReset={reset('about')}>
        <label>Introduction</label>
        <textarea rows={4} value={doc.about.intro} style={{ width: '100%' }}
          onChange={e => set('about', { ...doc.about, intro: e.target.value })} />
        <div className="section-title" style={{ marginTop: 10 }}>Capability relevant to this enquiry</div>
        <ListEditor items={doc.about.capabilities} placeholder="Nothing listed."
          onChange={v => set('about', { ...doc.about, capabilities: v })} />
        <label style={{ marginTop: 10, display: 'block' }}>Closing paragraph</label>
        <textarea rows={3} value={doc.about.closing} style={{ width: '100%' }}
          onChange={e => set('about', { ...doc.about, closing: e.target.value })} />
      </Section>

      <Section title="Signature block" p={p} field="preparedBy" onReset={reset('preparedBy')}>
        <div className="dgrid2" style={{ maxWidth: 700 }}>
          {[['name', 'Name'], ['title', 'Designation'], ['email', 'Email'], ['phone', 'Phone']].map(([k, label]) => (
            <div key={k}>
              <label>{label}</label>
              <input value={doc.preparedBy[k] || ''} onChange={e => set('preparedBy', { ...doc.preparedBy, [k]: e.target.value })} />
            </div>
          ))}
        </div>
        <div className="costing-note">
          Signed for {MODAE_COMPANY.name}. Verified legal registration details are intentionally omitted until confirmed.
        </div>
      </Section>
    </div>
  )
}
