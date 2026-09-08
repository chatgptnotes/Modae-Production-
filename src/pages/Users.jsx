import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { DEMO_PASSWORD, PORTAL_ENABLED, selectableRoles } from '../seed.js'
import { ddMmmYY, isAdminRole, displayRoleLabel } from '../utils.js'
import { Icon } from '../icons.jsx'

// Roles assignable through the UI (incl. TECH) — SUPER is deliberately not
// offered, and CUST only while the portal is enabled (seed.js PORTAL_ENABLED).
const ASSIGNABLE = selectableRoles().map(([id]) => id).filter(r => r !== 'SUPER')

export default function Users() {
  const store = useStore()
  const nav = useNavigate()
  const canManage = isAdminRole(store.role)
  const [modal, setModal] = useState(false)
  const [err, setErr] = useState('')
  const [editingUserId, setEditingUserId] = useState(null)
  const [userDraft, setUserDraft] = useState(null)
  const [userErr, setUserErr] = useState('')

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

  const startUserEdit = user => {
    setEditingUserId(user.id)
    setUserDraft({ name: user.name || '', email: user.email || '', role: user.role, status: user.status })
    setUserErr('')
  }

  const cancelUserEdit = () => {
    setEditingUserId(null)
    setUserDraft(null)
    setUserErr('')
  }

  const saveUser = user => {
    const name = String(userDraft?.name || '').trim()
    const email = String(userDraft?.email || '').trim()
    const role = userDraft?.role
    const status = userDraft?.status
    if (!name) {
      setUserErr('Name is required.')
      return
    }
    const validEmail = !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    if (!validEmail) {
      setUserErr('Enter a valid email address or leave it blank.')
      return
    }
    const duplicate = email && store.users.some(u => u.id !== user.id && (u.email || '').trim().toLowerCase() === email.toLowerCase())
    if (duplicate) {
      setUserErr('That email is already registered.')
      return
    }
    if (role !== user.role && user.role === 'SUPER') {
      setUserErr('The System Owner role cannot be changed.')
      return
    }
    if (!ASSIGNABLE.includes(role) && role !== 'SUPER') {
      setUserErr('Select a valid role.')
      return
    }
    if (!['Active', 'Pending', 'Suspended'].includes(status)) {
      setUserErr('Select a valid status.')
      return
    }
    store.updateUser(user.id, { name, email, role, status })
    cancelUserEdit()
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
          <div className="sheet-wrap sheet-wrap-fill" style={{ marginBottom: 14 }}>
            <table className="sheet">
              <tbody>
                {pending.map(u => (
                  <tr key={u.id}>
                    <td><b>{u.name}</b></td><td>{u.email}</td>
                    <td>Requested <b>{displayRoleLabel(u.role)}</b></td>
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
      <div className="sheet-wrap sheet-wrap-fill">
        <table className="sheet">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th>{canManage && <><th>Edit</th><th>Actions</th></>}</tr>
          </thead>
          <tbody>
            {store.users.map(u => (
              <tr key={u.id}>
                {editingUserId === u.id ? (
                  <>
                    <td>
                      <input
                        className="user-field-input"
                        value={userDraft.name}
                        onChange={e => { setUserDraft(d => ({ ...d, name: e.target.value })); setUserErr('') }}
                        onKeyDown={e => { if (e.key === 'Enter') saveUser(u); if (e.key === 'Escape') cancelUserEdit() }}
                        autoFocus
                        aria-label={`Name for ${u.name}`}
                      />
                      {u.role === store.role && <span className="pill you"> You</span>}
                    </td>
                    <td><input className="user-field-input" type="email" value={userDraft.email} onChange={e => { setUserDraft(d => ({ ...d, email: e.target.value })); setUserErr('') }} aria-label={`Email for ${u.name}`} /></td>
                    <td>
                      <select value={userDraft.role} disabled={u.role === 'SUPER'} onChange={e => { setUserDraft(d => ({ ...d, role: e.target.value })); setUserErr('') }} aria-label={`Role for ${u.name}`}>
                        {u.role === 'SUPER' && <option value="SUPER">{displayRoleLabel('SUPER')}</option>}
                        {ASSIGNABLE.map(r => <option key={r} value={r}>{displayRoleLabel(r)}</option>)}
                      </select>
                    </td>
                    <td><select value={userDraft.status} onChange={e => { setUserDraft(d => ({ ...d, status: e.target.value })); setUserErr('') }} aria-label={`Status for ${u.name}`}>
                      {['Active', 'Pending', 'Suspended'].map(status => <option key={status} value={status}>{status}</option>)}
                    </select></td>
                  </>
                ) : (
                  <>
                    <td><div className="user-name-display"><b>{u.name}</b>{u.role === store.role && <span className="pill you"> You</span>}</div></td>
                    <td>{u.email || 'No email assigned'}</td>
                    <td>{displayRoleLabel(u.role) || u.role}</td>
                    <td><span className={`pill status-${u.status}`}>{u.status}</span></td>
                  </>
                )}
                <td>{ddMmmYY(u.created)}</td>
                {canManage && (
                  <td>
                    {editingUserId === u.id ? (
                      <div className="user-row-editor-actions">
                        <button type="button" className="primary" onClick={() => saveUser(u)} title="Save user details" aria-label={`Save details for ${u.name}`}><Icon name="check" size={15} /></button>
                        <button type="button" onClick={cancelUserEdit} title="Cancel user edit" aria-label={`Cancel edit for ${u.name}`}><Icon name="x" size={15} /></button>
                        {userErr && <div className="err-text">{userErr}</div>}
                      </div>
                    ) : (
                      <button type="button" className="user-email-action" onClick={() => startUserEdit(u)} title="Edit user details" aria-label={`Edit details for ${u.name}`}><Icon name="edit" size={15} /></button>
                    )}
                  </td>
                )}
                {canManage && (
                  <td>
                    {u.status === 'Active' &&
                      <> <button onClick={() => { store.signInAs(u.id); nav('/opportunities') }}>Sign in as</button></>}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <>
          <div className="filter-overlay" onClick={() => setModal(false)} />
          <form className="modal form-card" onSubmit={register}>
            <div className="section-title" style={{ marginTop: 0 }}>Register a user</div>
            <div className="q"><div className="q-label">Full name</div><input name="name" type="text" placeholder="e.g. S. Rao" /></div>
            <div className="q"><div className="q-label">Work email</div><input name="email" type="text" placeholder="name@modae.demo" /></div>
            <div className="q"><div className="q-label">Role</div>
              <select name="role" defaultValue="RS">
                {ASSIGNABLE.map(r => <option key={r} value={r}>{displayRoleLabel(r)}</option>)}
              </select>
            </div>
            <label className="q" style={{ display: 'block' }}>
              <input name="active" type="checkbox" defaultChecked /> Activate immediately (unchecked → awaits approval)
            </label>
            {err && <div className="err-text">{err}</div>}
            <div className="forms-actions">
                <button className="primary" type="submit">Create user account</button>
              <button type="button" onClick={() => setModal(false)}>Cancel</button>
            </div>
          </form>
        </>
      )}
    </div>
  )
}
