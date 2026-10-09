import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { ROLES, DEMO_PASSWORD, LEVEL3_ROLES, LEVEL3_ROLE_IDS } from '../seed.js'
import { ddMmmYY, isAdminRole } from '../utils.js'
import { applicationRoleFor, applicationRolePatch, newUserRole } from '../userApplicationRole.js'
import './users.css'
import { Icon } from '../icons.jsx'
import { ConfirmModal } from '../ui.jsx'
import { supabase } from '../supabase.js'
import { usePagedRows } from '../ui/Pagination.jsx'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const nextUserId = users => {
  const seq = Math.max(0, ...(users || []).map(user => parseInt(String(user.id).replace(/\D/g, ''), 10) || 0)) + 1
  return `U-${String(seq).padStart(3, '0')}`
}

const today = () => new Date().toISOString().slice(0, 10)

async function adminUserRequest(body) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.auth.getSession()
  if (error || !data?.session?.access_token) throw new Error('Your Supabase admin session has expired. Sign in again.')
  const response = await fetch('/api/admin-users', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session.access_token}` },
    body: JSON.stringify(body),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'User account request failed.')
  return result
}

export default function Users() {
  const store = useStore()
  const nav = useNavigate()
  const canManage = isAdminRole(store.roles || store.role)
  const [editingUserId, setEditingUserId] = useState(null)
  const [userDraft, setUserDraft] = useState(null)
  const [userErr, setUserErr] = useState('')
  const [roleNameDraft, setRoleNameDraft] = useState(() => ({ ...(store.config?.roleNames || {}) }))
  const [roleNameError, setRoleNameError] = useState('')
  const [roleNameSaved, setRoleNameSaved] = useState(false)
  const [usersView, setUsersView] = useState('accounts')
  const [rejecting, setRejecting] = useState(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createDraft, setCreateDraft] = useState({ name: '', email: '', password: '', confirmPassword: '', applicationRole: 'STANDARD_USER' })
  const [createErr, setCreateErr] = useState('')
  const [createBusy, setCreateBusy] = useState(false)
  const [credentialNotice, setCredentialNotice] = useState(null)
  const [resettingUserId, setResettingUserId] = useState(null)
  const [resetDraft, setResetDraft] = useState({ password: '', confirmPassword: '' })
  const [resetErr, setResetErr] = useState('')
  const [resetBusy, setResetBusy] = useState(false)
  const [userBusy, setUserBusy] = useState(false)
  const [authStatus, setAuthStatus] = useState({})
  const [provisionBusy, setProvisionBusy] = useState(false)
  const [provisionConfirm, setProvisionConfirm] = useState(false)
  const [provisionSummary, setProvisionSummary] = useState(null)
  const pending = store.users.filter(u => u.status === 'Pending')
  const { pagedRows: pagePending, pagination: pendingPagination } = usePagedRows(pending, store.users.length)
  const { pagedRows: pageUsers, pagination: usersPagination } = usePagedRows(store.users, store.users.length)

  useEffect(() => {
    let active = true
    if (!supabase || !canManage) return () => { active = false }
    adminUserRequest({ action: 'status' })
      .then(result => {
        if (!active) return
        setAuthStatus(Object.fromEntries((result.users || []).map(user => [user.id, user])))
      })
      .catch(error => {
        if (active) setAuthStatus({ error: error?.message || 'Could not check Supabase Auth accounts.' })
      })
    return () => { active = false }
  }, [canManage, store.users.length])

  // Route-level gate: the account roster (names, emails, roles) is restricted
  // directory data — non-admins get a restricted block, not a read-only view.
  if (!canManage) {
    return (
      <div className="page">
        <h2 className="workspace-page-title workspace-page-title--topbar-duplicate"><Icon name="shield" size={18} /> User management</h2>
        <div className="restricted" style={{ maxWidth: 520 }}>
          Restricted — user accounts and role assignments are visible to administrators only.
        </div>
      </div>
    )
  }

  const startUserEdit = user => {
    if (!canManage || userBusy) return
    setEditingUserId(user.id)
    setUserDraft({ name: user.name || '', email: user.email || '', applicationRole: applicationRoleFor(user), status: user.status })
    setUserErr('')
  }

  const cancelUserEdit = () => {
    if (userBusy) return
    setEditingUserId(null)
    setUserDraft(null)
    setUserErr('')
  }

  const saveUser = async user => {
    if (!canManage || userBusy || editingUserId !== user.id) return
    const name = String(userDraft?.name || '').trim()
    const email = String(userDraft?.email || '').trim()
    let assignment
    try { assignment = applicationRolePatch(user, userDraft?.applicationRole) }
    catch (error) { setUserErr(error.message); return }
    const { role, roles } = assignment
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
    if (!['Active', 'Pending', 'Suspended'].includes(status)) {
      setUserErr('Select a valid status.')
      return
    }
    setUserBusy(true)
    try {
      const remote = supabase && authStatus[user.id]?.authStatus === 'Created'
      ? await adminUserRequest({ action: 'update', authId: authStatus[user.id].authId, email: user.email, nextEmail: email, name, role, roles })
        : null
      store.updateUser(user.id, { name, email, role, roles, status, ...(remote?.user?.id ? { authId: remote.user.id } : {}) })
      if (remote?.user?.id) setAuthStatus(s => ({ ...s, [user.id]: { ...(s[user.id] || {}), authId: remote.user.id, email, authStatus: 'Created' } }))
      setEditingUserId(null)
      setUserDraft(null)
      setUserErr('')
    } catch (error) {
      setUserErr(error?.message || 'Could not update the account.')
    } finally {
      setUserBusy(false)
    }
  }

  const saveRoleNames = event => {
    event.preventDefault()
    const invalid = Object.entries(ROLES).find(([id]) => !String(roleNameDraft[id] || '').trim())
    if (invalid) {
      setRoleNameError(`${invalid[0]} needs a display name.`)
      setRoleNameSaved(false)
      return
    }
    store.updateRoleNames(Object.fromEntries(Object.keys(ROLES).map(id => [id, String(roleNameDraft[id]).trim()])))
    setRoleNameError('')
    setRoleNameSaved(true)
    setTimeout(() => setRoleNameSaved(false), 2500)
  }

  const closeCreate = () => {
    setCreateOpen(false)
    setCreateErr('')
    setCreateDraft({ name: '', email: '', password: '', confirmPassword: '', applicationRole: 'STANDARD_USER' })
  }

  const createAccount = async event => {
    event.preventDefault()
    setCreateErr('')
    const name = String(createDraft.name || '').trim()
    const email = String(createDraft.email || '').trim().toLowerCase()
    const password = String(createDraft.password || '')
    const confirmPassword = String(createDraft.confirmPassword || '')
    if (!name) return setCreateErr('Name is required.')
    if (!EMAIL_RE.test(email)) return setCreateErr('Enter a valid email address.')
    if (password.length < 8) return setCreateErr('Password must be at least 8 characters.')
    if (password !== confirmPassword) return setCreateErr('Passwords do not match.')
    let assignment
    try { assignment = newUserRole(createDraft.applicationRole) }
    catch (error) { return setCreateErr(error.message) }
    if (store.users.some(user => String(user.email || '').trim().toLowerCase() === email)) {
      return setCreateErr('That email is already registered.')
    }

    setCreateBusy(true)
    try {
      const remote = supabase
        ? await adminUserRequest({ action: 'create', name, email, password, ...assignment })
        : null
      store.addUser({
        id: nextUserId(store.users),
        ...(remote?.user?.id ? { authId: remote.user.id } : {}),
        name, email, ...assignment, status: 'Active', created: today(),
        // Supabase owns the password in cloud mode. Local demo mode retains
        // the existing browser-only credential model.
        ...(supabase ? { pw: '' } : { pw: password }),
      })
      setCredentialNotice({ email, password, action: 'created' })
      closeCreate()
    } catch (error) {
      setCreateErr(error?.message || 'Could not create the account.')
    } finally {
      setCreateBusy(false)
    }
  }

  const startPasswordReset = user => {
    setResettingUserId(user.id)
    setResetDraft({ password: '', confirmPassword: '' })
    setResetErr('')
  }

  const cancelPasswordReset = () => {
    setResettingUserId(null)
    setResetDraft({ password: '', confirmPassword: '' })
    setResetErr('')
  }

  const resetPassword = async user => {
    setResetErr('')
    const password = String(resetDraft.password || '')
    if (password.length < 8) return setResetErr('Password must be at least 8 characters.')
    if (password !== String(resetDraft.confirmPassword || '')) return setResetErr('Passwords do not match.')
    setResetBusy(true)
    try {
      if (supabase) {
        const result = await adminUserRequest({ action: 'reset', authId: user.authId, email: user.email, password })
        if (result?.user?.id && result.user.id !== user.authId) store.updateUser(user.id, { authId: result.user.id })
      } else {
        store.updateUser(user.id, { pw: password })
      }
      setCredentialNotice({ email: user.email, password, action: 'reset' })
      cancelPasswordReset()
    } catch (error) {
      setResetErr(error?.message || 'Could not reset the password.')
    } finally {
      setResetBusy(false)
    }
  }

  const resetRoleNames = () => {
    const defaults = Object.fromEntries(Object.entries(ROLES).map(([id, role]) => [id, role.name]))
    setRoleNameDraft(defaults)
    setRoleNameError('')
    setRoleNameSaved(false)
    store.updateRoleNames(defaults)
  }

  const provisionAllAccounts = async () => {
    setProvisionBusy(true)
    try {
      const result = await adminUserRequest({ action: 'provision', password: DEMO_PASSWORD })
      const nextStatus = Object.fromEntries((result.results || []).map(user => [user.id, user]))
      setAuthStatus(nextStatus)
      setProvisionSummary({
        created: (result.results || []).filter(user => user.authStatus === 'Created').length,
        failed: (result.results || []).filter(user => user.authStatus === 'Failed').length,
        total: (result.results || []).length,
      })
    } catch (error) {
      setProvisionSummary({ error: error?.message || 'Could not provision the Supabase Auth accounts.' })
    } finally {
      setProvisionBusy(false)
      setProvisionConfirm(false)
    }
  }

  return (
    <div className="page users-page">
      <h2 className="workspace-page-title workspace-page-title--topbar-duplicate"><Icon name="shield" size={18} /> User management</h2>
      <div className="toolbar">
        <span className="hint">Admins manage accounts, assign roles and approve registrations. {supabase ? 'Accounts are provisioned through Supabase Auth.' : 'Demo accounts are stored only in this browser.'}</span>
        <span className="spacer" />
        {supabase && <button type="button" onClick={() => setProvisionConfirm(true)} disabled={provisionBusy}>{provisionBusy ? 'Provisioning…' : 'Provision missing accounts'}</button>}
        <button type="button" className="primary" onClick={() => { setCreateOpen(true); setCreateErr('') }}>Create account</button>
      </div>

      <nav className="users-tabs" role="tablist" aria-label="User management sections">
        <button id="users-tab-accounts" type="button" role="tab" aria-selected={usersView === 'accounts'}
          aria-controls="users-panel-accounts" className={usersView === 'accounts' ? 'active' : ''}
          onClick={() => setUsersView('accounts')}>Accounts</button>
        <button id="users-tab-role-names" type="button" role="tab" aria-selected={usersView === 'roleNames'}
          aria-controls="users-panel-role-names" className={usersView === 'roleNames' ? 'active' : ''}
          onClick={() => setUsersView('roleNames')}>Owner names</button>
      </nav>

      <section id="users-panel-accounts" className="users-tab-panel" role="tabpanel"
        aria-labelledby="users-tab-accounts" hidden={usersView !== 'accounts'}>
      {createOpen && (
        <form className="users-create-panel" onSubmit={createAccount}>
          <div className="users-create-heading">
            <div>
              <div className="section-title">Create account</div>
              <p className="hint">The email address is the user ID. This account will be active immediately.</p>
            </div>
            <button type="button" onClick={closeCreate} disabled={createBusy}>Cancel</button>
          </div>
          <div className="users-create-grid">
            <label>Full name<input autoFocus value={createDraft.name} onChange={e => setCreateDraft(d => ({ ...d, name: e.target.value }))} placeholder="First and last name" /></label>
            <label>User ID / email<input type="email" value={createDraft.email} onChange={e => setCreateDraft(d => ({ ...d, email: e.target.value }))} placeholder="person@company.com" /></label>
            <label>Password<input type="password" autoComplete="new-password" value={createDraft.password} onChange={e => setCreateDraft(d => ({ ...d, password: e.target.value }))} placeholder="At least 8 characters" /></label>
            <label>Confirm password<input type="password" autoComplete="new-password" value={createDraft.confirmPassword} onChange={e => setCreateDraft(d => ({ ...d, confirmPassword: e.target.value }))} placeholder="Repeat password" /></label>
            <label>Role<select value={createDraft.applicationRole} onChange={e => setCreateDraft(d => ({ ...d, applicationRole: e.target.value }))} aria-label="Application role">
              {LEVEL3_ROLE_IDS.map(id => <option key={id} value={id}>{LEVEL3_ROLES[id].name}</option>)}
            </select></label>
          </div>
          {createErr && <div className="err-text" role="alert">{createErr}</div>}
          <div className="forms-actions users-create-actions"><button type="submit" className="primary" disabled={createBusy}>{createBusy ? 'Creating…' : 'Create account'}</button></div>
        </form>
      )}
      {credentialNotice && (
        <div className="users-credential-notice" role="status">
          <div><b>{credentialNotice.action === 'created' ? 'Account created' : 'Password reset'}</b><span>{credentialNotice.email}</span></div>
          <code>{credentialNotice.password}</code>
          <button type="button" onClick={() => navigator.clipboard?.writeText(credentialNotice.password)}>Copy password</button>
          <button type="button" aria-label="Dismiss password notice" onClick={() => setCredentialNotice(null)}>Dismiss</button>
        </div>
      )}
      {provisionSummary && (
        <div className={`users-provision-summary ${provisionSummary.error ? 'error' : ''}`} role="status">
          {provisionSummary.error
            ? provisionSummary.error
            : `${provisionSummary.created} of ${provisionSummary.total} accounts are now available in Supabase Auth${provisionSummary.failed ? `; ${provisionSummary.failed} failed` : ''}.`}
          <button type="button" onClick={() => setProvisionSummary(null)}>Dismiss</button>
        </div>
      )}
      {canManage && pending.length > 0 && (
        <>
          <div className="section-title">Awaiting approval ({pending.length})</div>
          <div className="sheet-wrap sheet-wrap-fill" style={{ marginBottom: 14 }}>
            <table className="sheet">
              <tbody>
                {pagePending.map(u => (
                  <tr key={u.id}>
                    <td><b>{u.name}</b></td><td>{u.email}</td>
                    <td>Requested <b>{LEVEL3_ROLES[applicationRoleFor(u)].name}</b></td>
                    <td>
                      <button className="primary" onClick={() => store.updateUser(u.id, { status: 'Active' })}>Approve</button>{' '}
                      <button onClick={() => setRejecting(u)}>Reject</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pendingPagination}
        </>
      )}
      <div className="section-title">Accounts ({store.users.length})</div>
      <div className="sheet-wrap sheet-wrap-fill">
        <table className="sheet users-table">
          <colgroup>
            <col className="users-col-name" /><col className="users-col-email" /><col className="users-col-role" />
            <col className="users-col-status" /><col className="users-col-auth" /><col className="users-col-created" />
            <col className="users-col-edit" /><col className="users-col-actions" />
          </colgroup>
          <thead>
            <tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Supabase Auth</th><th>Created</th>{canManage && <><th>Edit</th><th>Actions</th></>}</tr>
          </thead>
          <tbody>
            {pageUsers.map(u => (
              <React.Fragment key={u.id}>
              <tr className={editingUserId === u.id ? 'users-row-editing' : undefined}
                onKeyDown={event => {
                  if (editingUserId !== u.id || userBusy) return
                  if (event.key === 'Escape') { event.preventDefault(); cancelUserEdit() }
                  if (event.key === 'Enter' && event.target.tagName === 'INPUT') { event.preventDefault(); saveUser(u) }
                }}>
                {editingUserId === u.id ? (
                  <>
                    <td>
                      <input
                        className="user-field-input"
                        disabled={userBusy}
                        value={userDraft.name}
                        onChange={e => { setUserDraft(d => ({ ...d, name: e.target.value })); setUserErr('') }}
                        autoFocus
                        aria-label={`Name for ${u.name}`}
                      />
                      {u.role === store.role && <span className="pill you"> You</span>}
                    </td>
                    <td><input className="user-field-input" type="email" disabled={userBusy} value={userDraft.email} onChange={e => { setUserDraft(d => ({ ...d, email: e.target.value })); setUserErr('') }} aria-label={`Email for ${u.name}`} /></td>
                    <td>
                      <select value={userDraft.applicationRole} disabled={u.role === 'SUPER' || userBusy} onChange={e => { setUserDraft(d => ({ ...d, applicationRole: e.target.value })); setUserErr('') }} aria-label={`Role for ${u.name}`}>
                        {LEVEL3_ROLE_IDS.map(r => <option key={r} value={r}>{LEVEL3_ROLES[r].name}</option>)}
                      </select>
                    </td>
                    <td><select disabled={userBusy} value={userDraft.status} onChange={e => { setUserDraft(d => ({ ...d, status: e.target.value })); setUserErr('') }} aria-label={`Status for ${u.name}`}>
                      {['Active', 'Pending', 'Suspended'].map(status => <option key={status} value={status}>{status}</option>)}
                    </select></td>
                  </>
                ) : (
                  <>
                    <td><div className="user-name-display"><b>{u.name}</b>{u.role === store.role && <span className="pill you"> You</span>}</div></td>
                    <td>{u.email || 'No email assigned'}</td>
                    <td>{LEVEL3_ROLES[applicationRoleFor(u)].name}</td>
                    <td><span className={`pill status-${u.status}`}>{u.status}</span></td>
                  </>
                )}
                <td>
                  {!supabase
                    ? <span className="users-auth-status neutral">Local demo</span>
                    : authStatus.error
                      ? <span className="users-auth-status warning" title={authStatus.error}>Unavailable</span>
                      : !authStatus[u.id]
                        ? <span className="users-auth-status checking">Checking…</span>
                        : <span className={`users-auth-status ${authStatus[u.id].authStatus === 'Created' ? 'ok' : 'warning'}`}>{authStatus[u.id].authStatus}</span>}
                </td>
                <td>{ddMmmYY(u.created)}</td>
                {canManage && (
                  <td className="users-edit-cell">
                    {editingUserId === u.id ? (
                      <div className="user-row-editor-actions">
                        <button type="button" className="primary" disabled={userBusy} onClick={() => saveUser(u)} aria-label={`Save details for ${u.name}`}>{userBusy ? 'Saving…' : 'Save'}</button>
                        <button type="button" disabled={userBusy} onClick={cancelUserEdit} aria-label={`Cancel edit for ${u.name}`}>Cancel</button>
                      </div>
                    ) : (
                      <button type="button" className="users-edit-button" disabled={editingUserId !== null || userBusy} onClick={() => startUserEdit(u)} aria-label={`Edit details for ${u.name}`}>Edit</button>
                    )}
                  </td>
                )}
                {canManage && (
                  <td className="users-account-actions">
                    {u.status === 'Active' &&
                      <><button disabled={editingUserId !== null} onClick={() => { store.signInAs(u.id); nav('/opportunities') }}>Sign in as</button>{' '}<button disabled={editingUserId !== null} onClick={() => startPasswordReset(u)}>Reset password</button></>}
                  </td>
                )}
              </tr>
              {editingUserId === u.id && userErr && (
                <tr className="users-edit-error"><td colSpan={8}><div className="err-text" role="alert">{userErr}</div></td></tr>
              )}
              {resettingUserId === u.id && (
                <tr key={`${u.id}-reset`} className="users-reset-row">
                  <td colSpan={8}>
                    <div className="users-reset-panel">
                      <strong>Reset password for {u.name}</strong>
                      <input type="password" autoFocus autoComplete="new-password" value={resetDraft.password} onChange={e => setResetDraft(d => ({ ...d, password: e.target.value }))} placeholder="New password" aria-label={`New password for ${u.name}`} />
                      <input type="password" autoComplete="new-password" value={resetDraft.confirmPassword} onChange={e => setResetDraft(d => ({ ...d, confirmPassword: e.target.value }))} placeholder="Confirm password" aria-label={`Confirm password for ${u.name}`} />
                      {resetErr && <span className="err-text" role="alert">{resetErr}</span>}
                      <button type="button" className="primary" disabled={resetBusy} onClick={() => resetPassword(u)}>{resetBusy ? 'Saving…' : 'Save password'}</button>
                      <button type="button" disabled={resetBusy} onClick={cancelPasswordReset}>Cancel</button>
                    </div>
                  </td>
                </tr>
              )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {usersPagination}
      </section>

      <section id="users-panel-role-names" className="users-tab-panel" role="tabpanel"
        aria-labelledby="users-tab-role-names" hidden={usersView !== 'roleNames'}>
      <form className="users-role-names-panel" onSubmit={saveRoleNames}>
        <div className="section-title">Owner names</div>
        <p className="hint">Change owner display names used elsewhere in the workspace. Account roles are managed in the Accounts tab.</p>
        <div className="users-role-name-list">
          {Object.entries(ROLES).map(([id, roleDef]) => (
            <label className="users-role-name-row" key={id}>
              <span className="role-id">{id}</span>
              <input type="text" value={roleNameDraft[id] ?? roleDef.name}
                onChange={e => { setRoleNameDraft(d => ({ ...d, [id]: e.target.value })); setRoleNameError(''); setRoleNameSaved(false) }}
                aria-label={`Display name for ${id}`} />
            </label>
          ))}
        </div>
        {roleNameError && <div className="err-text" role="alert">{roleNameError}</div>}
        {roleNameSaved && <div className="hint" role="status">Role names saved.</div>}
        <div className="forms-actions users-role-name-actions">
          <button type="button" onClick={resetRoleNames}>Reset to defaults</button>
          <button type="submit" className="primary">Save names</button>
        </div>
      </form>
      </section>

      {rejecting && <ConfirmModal title="Reject registration" tone="danger"
        message={`Reject and remove the registration for ${rejecting.email}?`}
        confirmLabel="Reject registration" onClose={() => setRejecting(null)}
        onConfirm={() => { store.deleteUser(rejecting.id); setRejecting(null) }} />}
      {provisionConfirm && <ConfirmModal title="Provision all missing accounts?"
        message="This will create Supabase Auth accounts for all 11 visible profiles, including Customer contact, using the shared password Demo@1234. Change these passwords before production use."
        confirmLabel="Provision accounts" onClose={() => setProvisionConfirm(false)} onConfirm={provisionAllAccounts} />}
    </div>
  )
}
