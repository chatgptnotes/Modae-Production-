import React, { useState } from 'react'
import { useStore } from '../store.jsx'
import { defaultCosting } from '../seed.js'
import { canPriceProposal, unitCostINR, unitSellINR, fmt } from '../utils.js'
import { Chip, ConfChip, AiBadge, Modal } from '../ui.jsx'
import { Icon } from '../icons.jsx'

// Spares workbench — customer references vs interpreted part numbers, match
// confidence, price-source freshness, and the merge into the proposal BoQ.
export default function WbSpares({ opp, openBuilder }) {
  const store = useStore()
  const comm = canPriceProposal(store.role)
  const lines = store.sparesLines.filter(l => l.oppId === opp.id)
  const [compareFor, setCompareFor] = useState(null)
  const [evidence, setEvidence] = useState(null)
  const [sent, setSent] = useState(false)
  const [np, setNp] = useState({ pn: '', desc: '', qty: '1', listPrice: '' })
  const [priceDrafts, setPriceDrafts] = useState({})

  const isBnk = l => String(l.priceList || '').startsWith('BNK')
  const sellINR = l => unitSellINR(l.listPrice || 0, defaultCosting, l.currency || 'EUR', isBnk(l))
  const costINR = l => unitCostINR(l.listPrice || 0, defaultCosting, l.currency || 'EUR', isBnk(l))
  const totals = lines.reduce((t, l) => ({
    value: t.value + sellINR(l) * (l.qty || 0),
    cogs: t.cogs + costINR(l) * (l.qty || 0),
  }), { value: 0, cogs: 0 })
  const gmPct = totals.value ? ((totals.value - totals.cogs) / totals.value) * 100 : 0
  const expiredLines = lines.filter(l => l.priceState === 'Expired')
  const clarifications = (store.clarifications || []).filter(c => c.oppId === opp.id && c.status === 'Answered')

  const bumpQty = (l, d) => store.updateSparesLine(l.id, { qty: Math.max(1, (l.qty || 1) + d) })

  const commitPrice = l => {
    const raw = priceDrafts[l.id]
    if (raw == null) return
    const value = Number(raw)
    if (!Number.isFinite(value) || value < 0) {
      setPriceDrafts(drafts => ({ ...drafts, [l.id]: String(l.listPrice ?? '') }))
      return
    }
    store.updateSparesLine(l.id, {
      listPrice: value,
      currency: 'INR',
      priceList: 'Manual entry',
      priceState: 'Current',
    })
    setPriceDrafts(drafts => {
      const next = { ...drafts }
      delete next[l.id]
      return next
    })
  }

  // Selecting an alternative must carry ITS price data — keeping the
  // superseded part's price while flipping to "Current" would silently bypass
  // the expired-price readiness gate.
  const useAlternative = (l, alt) => {
    let priced = null
    for (const [name, pl] of Object.entries(store.priceLists || {})) {
      const row = (pl.parts || []).find(p => p.pn === alt.pn)
      if (row) { priced = { listPrice: row.price, currency: pl.currency, priceList: `${name} ${pl.version}` }; break }
    }
    store.updateSparesLine(l.id, {
      pn: alt.pn, desc: alt.desc, confirmed: true,
      ...(priced || {}),
      priceState: priced ? (alt.priceState || 'Current') : 'Expired',
    })
    setCompareFor(null)
  }

  const addManual = () => {
    if (!np.pn.trim() && !np.desc.trim()) return
    store.addSparesLine(opp.id, {
      custRef: np.pn.trim() || np.desc.trim(), pn: np.pn.trim(), desc: np.desc.trim(),
      qty: +np.qty || 1, listPrice: +np.listPrice || 0, currency: 'INR',
      priceList: 'Manual entry', priceState: 'Current', oem: 'Manual', leadTime: 'TBC',
    })
    setNp({ pn: '', desc: '', qty: '1', listPrice: '' })
  }

  const sendToProposal = () => {
    store.sendLinesToProposal(opp.id)
    setSent(true)
  }

  return (
    <div>
      <div className="section-title">Spares workbench — part matching ({lines.length} line{lines.length === 1 ? '' : 's'})</div>
      {clarifications.length > 0 && (
        <div className="okbox sourcing-clarification-context">
          <b>Confirmed customer information</b>
          <span className="hint"> These answers stay attached to the opportunity and should be checked while validating each line.</span>
          {clarifications.map(c => (
            <div key={c.id} className="sourcing-clarification-row">
              <b>{c.category || 'Clarification'}:</b> {c.response}
              <span className="hint"> · {c.answerSource || 'Customer'}{c.answeredAt ? ` · ${c.answeredAt}` : ''}</span>
            </div>
          ))}
        </div>
      )}
      {!!expiredLines.length && (
        <div className="warnbox spares-price-warning">
          <b>{expiredLines.length} price source{expiredLines.length === 1 ? '' : 's'} expired.</b>{' '}
          Use <b>Request price update</b> in the Actions column, or apply a current manufacturer quote only when the approved price list cannot be used.
        </div>
      )}
      <div className="sheet-wrap">
        <table className="sheet">
          <thead>
            <tr>
              <th>Customer reference → interpreted part</th>
              <th>Match</th>
              <th>OEM</th>
              <th>Qty</th>
              <th>Lead time</th>
              <th>Price source</th>
              <th>List price</th>
              <th>Evidence</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {lines.map(l => (
              <tr key={l.id}>
                <td>
                  <span className="hint">{l.custRef}</span>
                  <div><b>{l.pn}</b> — {l.desc}</div>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span>{l.match}</span>
                    <ConfChip conf={l.conf} thresholds={store.config?.aiThresholds} />
                    {l.confirmed
                      ? <Chip tone="state-Accepted">Confirmed</Chip>
                      : <Chip tone="state-Blocks">Blocks readiness</Chip>}
                  </div>
                </td>
                <td>{l.oem}</td>
                <td className="num" style={{ whiteSpace: 'nowrap' }}>
                  <button onClick={() => bumpQty(l, -1)} title="Decrease quantity">-</button>
                  <b style={{ padding: '0 8px' }}>{l.qty}</b>
                  <button onClick={() => bumpQty(l, 1)} title="Increase quantity">+</button>
                </td>
                <td>{l.leadTime}</td>
                <td>
                  {l.priceList}{' '}
                  {l.priceState === 'Expired'
                    ? <><Chip tone="state-Blocks">Expired price source</Chip> <AiBadge label="pricing anomaly" /></>
                    : <Chip tone="state-Accepted">Current</Chip>}
                </td>
                <td className="num">
                  {comm
                    ? <input aria-label={`List price for ${l.pn || l.custRef || l.id}`} type="number" min="0" step="0.01"
                        value={priceDrafts[l.id] ?? (l.listPrice ?? '')} style={{ width: 100 }}
                        onChange={e => setPriceDrafts(drafts => ({ ...drafts, [l.id]: e.target.value }))}
                        onBlur={() => commitPrice(l)} />
                    : <span className="restricted"><Icon name="lock" size={11} /> Restricted</span>}
                </td>
                <td>
                  <a style={{ cursor: 'pointer' }} onClick={() => setEvidence(l)}>
                    {l.priceList === 'Manual entry' ? 'Manual price' : 'Price-list row'}
                  </a>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {!l.confirmed && (
                    <button className="primary" onClick={() => store.updateSparesLine(l.id, { confirmed: true })}>
                      <Icon name="check" size={12} /> Confirm
                    </button>
                  )}{' '}
                  <button onClick={() => setCompareFor(l.id)}><Icon name="gitCompare" size={12} /> Compare</button>{' '}
                  {l.priceState === 'Expired' && (
                    <button onClick={() => store.refreshPrice(l.id)}><Icon name="refresh" size={12} /> Request price update</button>
                  )}{' '}
                  <button onClick={() => store.removeSparesLine(l.id)}><Icon name="x" size={12} /> Remove</button>
                </td>
              </tr>
            ))}
            {!lines.length && (
              <tr><td colSpan={9} className="hint">No imported or manual spares lines yet — add a part below or re-run lead extraction.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="form-card" style={{ marginTop: 12 }}>
        <div className="section-title">Add manual part</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input placeholder="Part number" value={np.pn} style={{ width: 160 }}
            onChange={e => setNp({ ...np, pn: e.target.value })} />
          <input placeholder="Description" value={np.desc} style={{ width: 260 }}
            onChange={e => setNp({ ...np, desc: e.target.value })} />
          <input placeholder="Qty" type="number" min="1" value={np.qty} style={{ width: 70 }}
            onChange={e => setNp({ ...np, qty: e.target.value })} />
          <input placeholder="List price (INR)" type="number" value={np.listPrice} style={{ width: 130 }}
            onChange={e => setNp({ ...np, listPrice: e.target.value })} />
          <button onClick={addManual}><Icon name="plus" size={13} /> Add part</button>
        </div>

        <div className="section-title" style={{ marginTop: 14 }}>Totals</div>
        {comm ? (
          <table className="cost-table">
            <tbody>
              <tr><td>Proposal value</td><td className="num">₹ {fmt(totals.value)}</td></tr>
              <tr><td>COGS</td><td className="num">₹ {fmt(totals.cogs)}</td></tr>
              <tr className="total"><td>GM</td><td className="num">₹ {fmt(totals.value - totals.cogs)} ({gmPct.toFixed(1)}%)</td></tr>
            </tbody>
          </table>
        ) : (
          <div className="restricted"><Icon name="lock" size={12} /> Totals and margin are restricted — sales owners, approvers and admin only</div>
        )}

        <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="primary" onClick={sendToProposal}>
            <Icon name="arrowRight" size={13} /> Continue to proposal
          </button>
          <span className="hint">Only confirmed sourcing lines synchronize into the draft proposal.</span>
        </div>
        {sent && (
          <div className="okbox">
            Proposal workbook BoM synchronized from the confirmed sourcing lines.{' '}
            <a style={{ cursor: 'pointer' }} onClick={openBuilder}>Open the proposal builder</a>
          </div>
        )}
      </div>

      {compareFor && (() => {
        const l = lines.find(x => x.id === compareFor)
        if (!l) return null
        const alts = store.sparesAlternatives.filter(a => a.forPn === l.pn)
        return (
          <Modal title={`Compare / select alternative — ${l.pn}`} onClose={() => setCompareFor(null)} wide>
            {alts.map((a, i) => (
              <div key={i} className="check-row">
                <b>{a.pn}</b>
                <span>{a.desc}</span>
                <ConfChip conf={a.conf} thresholds={store.config?.aiThresholds} />
                {a.priceState === 'Expired'
                  ? <Chip tone="state-Blocks">Expired price</Chip>
                  : <Chip tone="state-Accepted">Current price</Chip>}
                <span className="hint">{a.note}</span>
                <span style={{ marginLeft: 'auto' }}>
                  <button className="primary" onClick={() => useAlternative(l, a)}>Use this</button>
                </span>
              </div>
            ))}
            {!alts.length && <p className="hint">No catalogued alternatives for this part — confirm the match or add a manual line.</p>}
            <div style={{ marginTop: 10, textAlign: 'right' }}>
              <button onClick={() => setCompareFor(null)}>Close</button>
            </div>
          </Modal>
        )
      })()}

      {evidence && (
        <Modal title="Evidence — price source" onClose={() => setEvidence(null)}>
          <p style={{ fontSize: 12.5 }}>
            <b>{evidence.pn}</b> priced from <b>{evidence.priceList}</b> ({evidence.priceState}),{' '}
            {comm
              ? <>{fmt(evidence.listPrice)} {evidence.currency} list. </>
              : <span className="restricted"><Icon name="lock" size={11} /> list price restricted. </span>}
            Row-level evidence is simulated in this demo —
            the production system links the exact price-list row.
          </p>
          <div style={{ textAlign: 'right' }}><button onClick={() => setEvidence(null)}>Close</button></div>
        </Modal>
      )}
    </div>
  )
}
