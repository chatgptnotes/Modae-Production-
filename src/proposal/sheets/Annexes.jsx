import React from 'react'
import { SIGNAL_TYPES } from '../../rack.js'

// The technical annexes the sample workbooks carry beside the pricing sheet.
// Three of them ship hidden in the samples, so they only print when a proposal
// opts in — see `printAnnexes` and DOC_ROUTES.annexes in proposalDoc.js.

const Empty = ({ cols, children }) => (
  <tr><td colSpan={cols} className="doc-muted">{children}</td></tr>
)

// Sl. | Measurement Parameter | Sensor Type | Sensor Location | Qty Per Unit |
// Total Qty, plus the cabling take-off and the sensor-type roll-up beside it.
export function SignalListSheet({ p }) {
  const rows = (p.signals || []).filter(s => (s.perUnit || 0) || (s.units || 0))
  const cabling = p.cabling || []
  const rollup = SIGNAL_TYPES.map(t => ({
    type: t,
    qty: (p.signals || []).filter(s => (s.parameter || s.signal) === t)
      .reduce((n, s) => n + (s.perUnit || 0) * (s.units || 0), 0),
  })).filter(r => r.qty)
  const total = rows.reduce((n, s) => n + (s.perUnit || 0) * (s.units || 0), 0)

  return (
    <>
      <table className="doc-table">
        <thead>
          <tr>
            <th className="sl">Sl.</th>
            <th>Measurement Parameter</th>
            <th>Sensor Type</th>
            <th>Sensor Location</th>
            <th className="num">Qty Per Unit</th>
            <th className="num">Total Qty</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s, i) => (
            <tr key={i}>
              <td className="sl">{i + 1}</td>
              <td>{s.parameter || s.signal}</td>
              <td>{s.sensorType || ''}</td>
              <td>{s.location || ''}</td>
              <td className="num">{s.perUnit || 0}</td>
              <td className="num">{(s.perUnit || 0) * (s.units || 0)}</td>
            </tr>
          ))}
          {!rows.length && <Empty cols={6}>No sensing elements listed.</Empty>}
          {rows.length > 0 && (
            <tr className="doc-total-for"><td colSpan={5}>Total</td><td className="num">{total}</td></tr>
          )}
        </tbody>
      </table>

      {cabling.length > 0 && (
        <>
          <div className="doc-block-h">Cabling</div>
          <table className="doc-table">
            <thead><tr><th>JB</th><th className="num">#Pairs</th><th className="num"># Runs 8-Pair</th></tr></thead>
            <tbody>
              {cabling.map((c, i) => (
                <tr key={i}><td>{c.jb}</td><td className="num">{c.pairs}</td><td className="num">{c.runs8Pair}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {rollup.length > 0 && (
        <>
          <div className="doc-block-h">By sensor type</div>
          <table className="doc-table">
            <tbody>
              {rollup.map(r => <tr key={r.type}><td>{r.type}</td><td className="num">{r.qty}</td></tr>)}
            </tbody>
          </table>
        </>
      )}
    </>
  )
}

// A 16-slot chassis per rack, plus the module tally. `p.rackSlots` overrides the
// computed layout — the sample racks carry bSAM/PCM/TMM codes that rack.js does
// not model, so a real project can type its own.
export function RackLayoutSheet({ rack, p }) {
  // rackLayout() returns `racks` as arrays of 16 slot labels. `p.rackSlots`
  // overrides it in the same shape — the sample racks carry bSAM/PCM/TMM codes
  // that rack.js does not model, so a real project can type its own.
  const racks = (p.rackSlots || []).length ? p.rackSlots : (rack?.racks || [])
  if (!racks.length) return <p className="doc-muted">No rack layout derived — the signal list is empty.</p>
  return (
    <>
      {racks.map((slots, i) => (
        <div key={i} className="doc-rackgrid">
          <div className="doc-block-h">Rack {i + 1}</div>
          <table className="doc-table">
            <thead>
              <tr>{slots.map((_, s) => <th key={s} className="num">{s + 1}</th>)}</tr>
            </thead>
            <tbody>
              <tr>{slots.map((m, s) => <td key={s} className="num">{m || '—'}</td>)}</tr>
            </tbody>
          </table>
        </div>
      ))}
      {(rack?.modules || []).filter(m => m.qty > 0).length > 0 && (
        <>
          <div className="doc-block-h">Modules</div>
          <table className="doc-table">
            <thead><tr><th>Module</th><th>Part number</th><th className="num">Qty</th></tr></thead>
            <tbody>
              {rack.modules.filter(m => m.qty > 0).map(m => (
                <tr key={m.key}>
                  <td>{m.label}</td><td>{m.pn || ''}</td><td className="num">{m.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  )
}

// Sl. | Section | Clause # | Clause Description | Compliance | ModAE Comments |
// Status. `compliance` and `workflowStatus` are the customer-facing verdict and
// the tracking state; `status` stays the binary field the approval gates read.
export function ComplianceSheet({ rows }) {
  return (
    <table className="doc-table">
      <thead>
        <tr>
          <th className="sl">Sl.</th>
          <th>Section</th>
          <th>Clause #</th>
          <th>Clause Description</th>
          <th>Compliance</th>
          <th>ModAE Comments</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td className="sl">{i + 1}</td>
            <td>{r.section}</td>
            <td>{r.clauseRef}</td>
            <td>{r.clause}</td>
            <td>{r.compliance}</td>
            <td>{r.comments}</td>
            <td>{r.workflowStatus}</td>
          </tr>
        ))}
        {!rows.length && <Empty cols={7}>No clauses recorded against this enquiry.</Empty>}
      </tbody>
    </table>
  )
}

// Parameter-by-parameter against the part being replaced — the form the Meggitt
// offer uses to justify a functional equivalent.
export function SensorComparisonSheet({ compare }) {
  const rows = compare?.rows || []
  return (
    <>
      {compare?.title && <div className="doc-block-h">{compare.title}</div>}
      <table className="doc-table">
        <thead>
          <tr>
            <th>Parameter</th>
            <th>{compare?.baselineLabel || 'Existing'}</th>
            <th>{compare?.proposedLabel || 'Proposed'}</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{r.parameter}</td>
              <td>{r.baseline}</td>
              <td>{r.proposed}</td>
              <td>{r.status}</td>
            </tr>
          ))}
          {!rows.length && <Empty cols={4}>No comparison recorded.</Empty>}
        </tbody>
      </table>
    </>
  )
}

// Clarifications are the open questions carried alongside a spares offer.
export function ClarificationsSheet({ rows }) {
  return (
    <table className="doc-table">
      <thead>
        <tr><th className="sl">Sl.</th><th>Clause #</th><th>Your requirement</th><th>Our clarification</th></tr>
      </thead>
      <tbody>
        {rows.map((t, i) => (
          <tr key={i}>
            <td className="sl">{i + 1}</td>
            <td>{t.clauseRef}</td>
            <td>{t.customerAsk}</td>
            <td>{t.ourResponse}</td>
          </tr>
        ))}
        {!rows.length && <Empty cols={4}>No clarifications outstanding.</Empty>}
      </tbody>
    </table>
  )
}

export function SowSheet({ sow }) {
  const block = (head, items) => (items || []).filter(Boolean).length > 0 && (
    <>
      <div className="doc-block-h">{head}</div>
      <ul className="doc-list">{items.filter(Boolean).map((t, i) => <li key={i}>{t}</li>)}</ul>
    </>
  )
  return (
    <>
      {sow?.objective && (<><div className="doc-block-h">Objective</div><p>{sow.objective}</p></>)}
      {sow?.narrative && <p>{sow.narrative}</p>}
      {block('ModAE Deliverables', sow?.deliverables)}
      {block(`${sow?.customerLabel || 'Customer'} Responsibilities`, sow?.responsibilities)}
      {block('Exclusions', sow?.exclusions)}
      {!sow?.objective && !(sow?.deliverables || []).length && (
        <p className="doc-muted">No scope of work recorded yet.</p>
      )}
    </>
  )
}

export function IssuesSheet({ rows }) {
  return (
    <table className="doc-table">
      <thead>
        <tr>
          <th>Issue reported</th><th>Possible Causes</th><th>Proposed Resolution</th>
          <th>Additional Remarks</th><th>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td>{r.issue}</td><td>{r.causes}</td><td>{r.resolution}</td>
            <td>{r.remarks}</td><td>{r.status}</td>
          </tr>
        ))}
        {!rows.length && <Empty cols={5}>No issues recorded.</Empty>}
      </tbody>
    </table>
  )
}
