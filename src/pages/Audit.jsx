import React, { useState } from 'react'
import { useStore } from '../store.jsx'
import { useWorkspaceView } from '../ui/WorkspaceViewContext.jsx'
import { useDrawer } from '../drawer.jsx'
import { Icon } from '../icons.jsx'
import { ddMmmYY, exportCSV, canSeePage, displayRole } from '../utils.js'
import { usePagedRows } from '../ui/Pagination.jsx'
import usePhoneLayout from '../tablet/usePhoneLayout.js'

const when = ts => `${ddMmmYY(ts.slice(0, 10))} ${ts.slice(11, 16)}`

export default function Audit() {
  const store = useStore()
  const narrow = usePhoneLayout()
  const phone = narrow && store.viewMode === 'tablet'
  const { scope } = useWorkspaceView()
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
        <h2 className="workspace-page-title workspace-page-title--topbar-duplicate"><Icon name="list" size={18} /> Audit Trail</h2>
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
    (scope === 'my' ? e.role === store.role : role === 'All' || e.role === role)
    && (action === 'All' || e.action === action)
    && (!needle || [e.action, e.objectId, e.detail].some(v => String(v ?? '').toLowerCase().includes(needle))))
  const { pagedRows, pagination } = usePagedRows(rows, JSON.stringify([scope, q, role, action]))

  const doExport = () => exportCSV(
    'Audit_Trail.csv',
    ['When', 'Role', 'Action', 'Object', 'Detail'],
    rows.map(e => [when(e.ts), displayRole(e.role), e.action, e.objectId ?? '', e.detail ?? '']))

  return (
    <div className="page">
      <h2 className="workspace-page-title workspace-page-title--topbar-duplicate"><Icon name="list" size={18} /> Audit Trail</h2>
      <div className="toolbar">
        <input type="text" placeholder="Search actions, objects, details…" value={q}
          onChange={e => setQ(e.target.value)} style={{ width: 240 }} />
        <label>Role:{' '}
          <select value={role} onChange={e => setRole(e.target.value)}>
            <option>All</option>
            {roles.map(r => <option key={r} value={r}>{displayRole(r)}</option>)}
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

      {phone ? <section aria-label="Audit entries">{pagedRows.map((entry, index) => <article className="phone-audit-row" key={`${entry.ts}-${index}`}><strong>{entry.action}</strong><small>{when(entry.ts)} · {displayRole(entry.role)}</small>{oppIds.has(entry.objectId) ? <button onClick={() => drawer.open({ type: 'opp', id: entry.objectId })}>{entry.objectId}</button> : <span>{entry.objectId}</span>}<details><summary>Details</summary><p>{String(entry.detail ?? 'No additional details')}</p></details></article>)}{!rows.length && <p>No audit entries match.</p>}</section> : <div className="sheet-wrap">
        <table className="sheet">
          <thead><tr><th>When</th><th>Role</th><th>Action</th><th>Object</th><th>Detail</th></tr></thead>
          <tbody>
            {pagedRows.map((e, i) => {
              const d = String(e.detail ?? '')
              return (
                <tr key={`${e.ts}-${i}`}>
                  <td style={{ whiteSpace: 'nowrap' }}>{when(e.ts)}</td>
                  <td>{displayRole(e.role)}</td>
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
      }
      {pagination}
    </div>
  )
}
