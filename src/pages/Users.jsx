import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { ROLES, PERMS, DEMO_PASSWORD } from '../seed.js'
import { ddMmmYY, isAdminRole } from '../utils.js'
import { Icon } from '../icons.jsx'

// Roles assignable through the UI (incl. TECH and CUST) — SUPER is deliberately not offered.
const ASSIGNABLE = Object.keys(ROLES).filter(r => r !== 'SUPER')

// Page keys shown in the permissions matrix, in navigation order.
const PAGE_KEYS = ['home', 'inbox', 'tracker', 'my', 'new', 'tender', 'approvals', 'folders',
  'pricelists', 'dashboard', 'analytics', 'customers', 'po', 'aimap', 'admin', 'audit', 'users',
  'launcher', 'voice', 'portal']

export default function Users() {
  const store = useStore()
  const nav = useNavigate()
  const canManage = isAdminRole(store.role)
  const [modal, setModal] = useState(false)
  const [err, setErr] = useState('')

  // Route-level gate: the account roster (names, emails, roles) is restricted
  // directory data — non-admins get a restricted block, not a read-only view.
  if (!canManage) {
    return (
      <div className="page">
        <h2>User management</h2>
        <div className="restricted" style={{ maxWidth: 520 }}>
          Restricted — user accounts and role assignments are visible to administrators only.
        </div>
      </div>
    )
  }

  const pending = store.users.filter(u => u.status === 'Pending')
  const nextId = () => {
    const n = Math.max(0, ...store.users.map(u => parseInt(String(u.id).slice(2), 10) || 0)) + 1
    return `U-${String(n).padStart(3, '0')}`
  }

  const register = e => {
    e.preventDefault()
    const f = new FormData(e.target)
    const name = String(f.get('name') || '').trim()
    const email = String(f.get('email') || '').trim()
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErr('A name and a valid work email are required.')
      return
    }
    if (store.users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
      setErr('That email is already registered.')
      return
    }
    store.addUser({
      id: nextId(), name, email, role: f.get('role'),
      status: f.get('active') ? 'Active' : 'Pending',
      created: new Date().toISOString().slice(0, 10),
      // Without a pw the login screen would reject the account until reload.
      pw: DEMO_PASSWORD,
    })
    setErr('')
    setModal(false)
  }

  return (
    <div className="page">
      <h2>User management</h2>
      <div className="toolbar">
        <span className="hint">Admin creates accounts, assigns roles and approves registrations. Demo accounts — stored only in this browser, nothing is transmitted.</span>
        <span className="spacer" />
        {canManage && <button className="primary" onClick={() => { setErr(''); setModal(true) }}><Icon name="plus" size={13} /> Register user</button>}
      </div>

      {canManage && pending.length > 0 && (
        <>
          <div className="section-title">Awaiting approval ({pending.length})</div>
          <div className="sheet-wrap" style={{ maxWidth: 760, marginBottom: 14 }}>
            <table className="sheet">
              <tbody>
                {pending.map(u => (
                  <tr key={u.id}>
                    <td><b>{u.name}</b></td><td>{u.email}</td>
                    <td>Requested <b>{ROLES[u.role]?.label || u.role}</b></td>
                    <td>
                      <button className="primary" onClick={() => store.updateUser(u.id, { status: 'Active' })}>Approve</button>{' '}
                      <button onClick={() => { if (window.confirm(`Reject and remove the registration for ${u.email}?`)) store.deleteUser(u.id) }}>Reject</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="section-title">Accounts ({store.users.length})</div>
      <div className="sheet-wrap" style={{ maxWidth: 900 }}>
        <table className="sheet">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th>{canManage && <th>Actions</th>}</tr>
          </thead>
          <tbody>
            {store.users.map(u => (
              <tr key={u.id}>
                <td><b>{u.name}</b>{u.role === store.role && <span className="pill you"> You</span>}</td>
                <td>{u.email}</td>
                <td>
                  {canManage && u.role !== 'SUPER' ? (
                    <select value={u.role} onChange={e => store.updateUser(u.id, { role: e.target.value })}>
                      {ASSIGNABLE.map(r => <option key={r} value={r}>{ROLES[r].label}</option>)}
                    </select>
                  ) : (ROLES[u.role]?.label || u.role)}
                </td>
                <td><span className={`pill status-${u.status}`}>{u.status}</span></td>
                <td>{ddMmmYY(u.created)}</td>
                {canManage && (
                  <td>
                    {u.status === 'Active' && u.role !== 'SUPER' &&
                      <button onClick={() => store.updateUser(u.id, { status: 'Suspended' })}>Suspend</button>}
                    {u.status === 'Active' &&
                      <> <button onClick={() => { store.signInAs(u.id); nav('/opportunities') }}>Sign in as</button></>}
                    {u.status === 'Suspended' &&
                      <button onClick={() => store.updateUser(u.id, { status: 'Active' })}>Reactivate</button>}
                    {u.status === 'Pending' &&
                      <button className="primary" onClick={() => store.updateUser(u.id, { status: 'Active' })}>Approve</button>}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="section-title">Page permissions</div>
      <div className="sheet-wrap">
        <table className="sheet">
          <thead>
            <tr><th>Role</th>{PAGE_KEYS.map(p => <th key={p}>{p}</th>)}</tr>
          </thead>
          <tbody>
            {Object.keys(ROLES).map(r => (
              <tr key={r}>
                <td style={{ whiteSpace: 'nowrap' }}><b>{ROLES[r].label}</b></td>
                {PAGE_KEYS.map(p => (
                  <td key={p} style={{ textAlign: 'center' }}>
                    {(PERMS[r] || []).includes(p) && <Icon name="check" size={12} />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">Matrix is configuration-as-code in this demo; editable per-tenant in production.</p>

      {modal && (
        <>
          <div className="filter-overlay" onClick={() => setModal(false)} />
          <form className="modal form-card" onSubmit={register}>
            <div className="section-title" style={{ marginTop: 0 }}>Register a user</div>
            <div className="q"><div className="q-label">Full name</div><input name="name" type="text" placeholder="e.g. S. Rao" /></div>
            <div className="q"><div className="q-label">Work email</div><input name="email" type="text" placeholder="name@modae.demo" /></div>
            <div className="q"><div className="q-label">Role</div>
              <select name="role" defaultValue="RS">
                {ASSIGNABLE.map(r => <option key={r} value={r}>{ROLES[r].label}</option>)}
              </select>
            </div>
            <label className="q" style={{ display: 'block' }}>
              <input name="active" type="checkbox" defaultChecked /> Activate immediately (unchecked → awaits approval)
            </label>
            {err && <div className="err-text">{err}</div>}
            <div className="forms-actions">
              <button className="primary" type="submit">Create account</button>
              <button type="button" onClick={() => setModal(false)}>Cancel</button>
            </div>
          </form>
        </>
      )}
    </div>
  )
}
