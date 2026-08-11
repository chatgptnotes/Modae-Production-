import React, { useState } from 'react'
import { useStore } from '../store.jsx'
import { isApprover } from '../utils.js'
import { Chip, Phase2Badge } from '../ui.jsx'
import { Icon } from '../icons.jsx'

const stateTone = s =>
  s === 'Match' ? 'state-Accepted' : s === 'Blocking deviation' ? 'state-Blocks' : 'state-Review'

// Phase 2 — PO validation against the released proposal, joint LJS + AH
// acceptance, then the handover checklist to the execution team.
export default function PoHandover({ opp }) {
  const store = useStore()
  const role = store.role
  const pc = store.poCompare[opp.id]
  const ho = store.handover[opp.id]
  const [reasons, setReasons] = useState({})
  const [acctSim, setAcctSim] = useState(false)

  if (!pc) {
    return (
      <div className="form-card">
        <div className="section-title"><Phase2Badge /> PO validation & handover</div>
        <p className="hint">
          No customer PO on record for this opportunity. PO validation compares the received PO
          line-by-line against the released proposal (part numbers, terms, delivery, value)
          before joint LJS + AH acceptance and handover.
        </p>
        <button className="primary" onClick={() => store.receivePO(opp.id)}>
          <Icon name="download" size={13} /> Simulate PO receipt
        </button>
      </div>
    )
  }

  const allResolved = pc.lines.every(l => l.resolved)
  const bothAccepted = !!(pc.acceptance.LJS && pc.acceptance.AH)
  const hoTotal = ho ? ho.groups.reduce((a, g) => a + g.items.length, 0) : 0
  const hoDone = ho ? ho.groups.reduce((a, g) => a + g.items.filter(i => i.done).length, 0) : 0

  const approveDeviation = i => {
    const reason = (reasons[i] || '').trim()
    if (!reason) return
    store.resolvePoLine(opp.id, i, `Deviation approved by ${role}: ${reason}`)
    setReasons({ ...reasons, [i]: '' })
  }

  const AcceptBtn = ({ r }) => {
    const done = pc.acceptance[r]
    const enabled = role === r && allResolved && !done
    return (
      <button className={done ? '' : 'primary'} disabled={!enabled}
        title={done ? `Accepted ${new Date(done).toLocaleString()}`
          : role !== r ? `Switch persona to ${r}` : !allResolved ? 'Resolve all review / blocking lines first' : ''}
        onClick={() => store.acceptPO(opp.id)}>
        {done ? <><Icon name="check" size={12} /> {r} accepted</> : `Accept as ${r}`}
      </button>
    )
  }

  return (
    <div>
      <div className="section-title"><Phase2Badge /> PO validation — {pc.poNo} <Chip tone="grey">{pc.status}</Chip></div>
      <div className="sheet-wrap">
        <table className="sheet">
          <thead><tr><th>Aspect</th><th>Proposal</th><th>PO</th><th>State</th><th>Actions</th></tr></thead>
          <tbody>
            {pc.lines.map((l, i) => (
              <tr key={i}>
                <td><b>{l.aspect}</b>{l.note && <div className="hint">{l.note}</div>}</td>
                <td>{l.prop}</td>
                <td>{l.po}</td>
                <td>
                  {l.resolved && l.state !== 'Match'
                    ? <Chip tone="state-Accepted">Resolved</Chip>
                    : <Chip tone={stateTone(l.state)}>{l.state}</Chip>}
                  {l.resolution && <div className="hint">{l.resolution}{l.resolvedBy ? ` — ${l.resolvedBy}` : ''}</div>}
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {!l.resolved && (
                    <>
                      <button disabled={l.state === 'Blocking deviation'}
                        title={l.state === 'Blocking deviation' ? 'Blocking deviations need an amendment or an approved deviation' : ''}
                        onClick={() => store.resolvePoLine(opp.id, i, 'Clarified with customer (simulated)')}>
                        Clarify
                      </button>{' '}
                      <button onClick={() => store.resolvePoLine(opp.id, i, '(amendment requested — aligned to proposal)')}>
                        Request amendment
                      </button>
                      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                        <input placeholder="Deviation reason (LJS/AH)" value={reasons[i] || ''} style={{ width: 170 }}
                          disabled={!(role === 'LJS' || role === 'AH')}
                          onChange={e => setReasons({ ...reasons, [i]: e.target.value })} />
                        <button disabled={!(role === 'LJS' || role === 'AH') || !(reasons[i] || '').trim()}
                          title={role === 'LJS' || role === 'AH' ? '' : 'LJS / AH only'}
                          onClick={() => approveDeviation(i)}>
                          Approve deviation
                        </button>
                      </div>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="form-card" style={{ marginTop: 12 }}>
        <div className="section-title">Joint acceptance (LJS + AH)</div>
        {!allResolved && <p className="hint">Resolve every review / blocking line before acceptance.</p>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <AcceptBtn r="LJS" />
          <AcceptBtn r="AH" />
        </div>
        {(pc.acceptance.LJS || pc.acceptance.AH) && (
          <p className="hint" style={{ marginTop: 6 }}>
            {pc.acceptance.LJS && <>LJS accepted {new Date(pc.acceptance.LJS).toLocaleString()}. </>}
            {pc.acceptance.AH && <>AH accepted {new Date(pc.acceptance.AH).toLocaleString()}.</>}
          </p>
        )}
        {bothAccepted
          ? <div className="okbox">PO jointly accepted — complete the handover checklist below.</div>
          : <p className="hint" style={{ marginTop: 6 }}>Joint acceptance needs both LJS and AH — switch persona to complete each signature.</p>}
      </div>

      {bothAccepted && ho && (
        <div className="form-card" style={{ marginTop: 12 }}>
          <div className="section-title">Handover checklist ({hoDone}/{hoTotal})</div>
          {ho.groups.map((g, gi) => (
            <div key={gi}>
              <div style={{ fontWeight: 700, fontSize: 12.5, marginTop: 8 }}>{g.g}</div>
              {g.items.map((it, ii) => (
                <div key={ii} className="check-row">
                  <input type="checkbox" checked={!!it.done} disabled={ho.approved}
                    onChange={e => store.hoToggleItem(opp.id, gi, ii, e.target.checked)} />
                  <span>{it.n}</span>
                  <Chip tone="grey">{it.owner}</Chip>
                  {it.done ? <Chip tone="state-Accepted">Complete</Chip> : <Chip tone="state-Review">Pending</Chip>}
                </div>
              ))}
            </div>
          ))}
          <div style={{ marginTop: 10 }}>
            <button className="primary"
              disabled={hoDone !== hoTotal || ho.approved || !isApprover(role)}
              title={ho.approved ? 'Already approved' : hoDone !== hoTotal ? 'Complete all checklist items first' : !isApprover(role) ? 'LJS / AH approve the handover' : ''}
              onClick={() => store.approveHandover(opp.id)}>
              <Icon name="clipboardCheck" size={13} /> Approve handover
            </button>
          </div>
          {ho.approved && (
            <>
              <div className="okbox">
                Opportunity Won — moved to Handover. Approved by {ho.approvedBy} on {ho.approvedOn};
                ownership passes to the execution team.
              </div>
              <div className="phase2-panel">
                <Phase2Badge /> <b>Accounting integration (Tally / Zoho Books)</b>
                <p className="hint">Phase 2: an accounting connector auto-creates the customer invoice from this record once handover is approved.</p>
                <button onClick={() => setAcctSim(true)}>Simulate invoice sync</button>
                {acctSim && <div className="okbox">Invoice draft synced to the accounting system (simulated).</div>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
