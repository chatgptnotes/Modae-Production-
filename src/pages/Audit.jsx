import React, { useState } from 'react'
import { useStore } from '../store.jsx'
import { useDrawer } from '../drawer.jsx'
import { ROLES } from '../seed.js'
import { ddMmmYY, exportCSV, canSeePage } from '../utils.js'

const when = ts => `${ddMmmYY(ts.slice(0, 10))} ${ts.slice(11, 16)}`
// Labels read "LJS — Strategic Approver"; the table only needs the short part.
const shortRole = r => (ROLES[r]?.label ?? r).split('—')[0].trim()

export default function Audit() {
  const store = useStore()
  const drawer = useDrawer()
  const [q, setQ] = useState('')
  const [role, setRole] = useState('All')
  const [action, setAction] = useState('All')

  // The sidebar hides this page per PERMS, but the route itself must be gated
  // too — decision notes carry commercially sensitive history. PERMS grants
  // audit to admins AND the LJS/AH approvers (per the BT permission matrix).
  if (!canSeePage(store.role, 'audit')) {
    return (
      <div className="page">
        <h2>Audit Trail</h2>
        <div className="restricted" style={{ maxWidth: 520 }}>
          Restricted — your role does not have access to the audit trail.
        </div>
      </div>
    )
  }

  const log = store.audit // stored newest-first
  const roles = [...new Set(log.map(e => e.role))].sort()
  const actions = [...new Set(log.map(e => e.action))].sort()
  const oppIds = new Set(store.opportunities.map(o => o.id))

  const needle = q.trim().toLowerCase()
  const rows = log.filter(e =>
    (role === 'All' || e.role === role)
    && (action === 'All' || e.action === action)
    && (!needle || [e.action, e.objectId, e.detail].some(v => String(v ?? '').toLowerCase().includes(needle))))

  const doExport = () => exportCSV(
    'Audit_Trail.csv',
    ['When', 'Role', 'Action', 'Object', 'Detail'],
    rows.map(e => [when(e.ts), shortRole(e.role), e.action, e.objectId ?? '', e.detail ?? '']))

  return (
    <div className="page">
      <h2>Audit Trail</h2>
      <div className="toolbar">
        <input type="text" placeholder="Search actions, objects, details…" value={q}
          onChange={e => setQ(e.target.value)} style={{ width: 240 }} />
        <label>Role:{' '}
          <select value={role} onChange={e => setRole(e.target.value)}>
            <option>All</option>
            {roles.map(r => <option key={r} value={r}>{shortRole(r)}</option>)}
          </select>
        </label>
        <label>Action:{' '}
          <select value={action} onChange={e => setAction(e.target.value)}>
            <option>All</option>
            {actions.map(a => <option key={a}>{a}</option>)}
          </select>
        </label>
        <span className="hint">
          Read-only event log — every important action is recorded (capped at the 500 most recent).
          Successive edits to the same field within a minute are merged.
        </span>
        <span className="spacer" />
        <button onClick={doExport}>Extract to Excel</button>
      </div>

      <div className="sheet-wrap">
        <table className="sheet">
          <thead><tr><th>When</th><th>Role</th><th>Action</th><th>Object</th><th>Detail</th></tr></thead>
          <tbody>
            {rows.map((e, i) => {
              const d = String(e.detail ?? '')
              return (
                <tr key={`${e.ts}-${i}`}>
                  <td style={{ whiteSpace: 'nowrap' }}>{when(e.ts)}</td>
                  <td>{shortRole(e.role)}</td>
                  <td><b>{e.action}</b></td>
                  <td>
                    {oppIds.has(e.objectId)
                      ? <span className="oppid-link" style={{ cursor: 'pointer' }}
                          onClick={() => drawer.open({ type: 'opp', id: e.objectId })}>{e.objectId}</span>
                      : e.objectId}
                  </td>
                  <td title={d.length > 80 ? d : undefined}>{d.length > 80 ? d.slice(0, 79) + '…' : d}</td>
                </tr>
              )
            })}
            {!rows.length && (
              <tr><td colSpan={5} className="hint" style={{ textAlign: 'center', padding: 14 }}>
                No audit entries match.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
