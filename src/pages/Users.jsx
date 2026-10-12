import { isLocalDemoSession } from '../authMode.js'
import { isActiveUser, isDeletedUser, matchesAccount, accountChangeError } from '../userManagement.js'
import React, { useEffect, useRef, useState } from 'react'
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
import { useViewportPageSize } from '../ui/useViewportPageSize.js'

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
  const shared = Boolean(supabase) && !isLocalDemoSession(store)
  const [openActionId, setOpenActionId] = useState(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [roleFilter, setRoleFilter] = useState('All')
  const [deleting, setDeleting] = useState(null)
  const [actionError, setActionError] = useState('')
  const [actionBusy, setActionBusy] = useState(false)
  const [actionNotice, setActionNotice] = useState('')
  const roster = store.users.filter(user => !isDeletedUser(user))
  const actor = store.users.find(user => matchesAccount(user, store.auth?.user))
  const filteredUsers = roster.filter(user =>
    `${user.name} ${user.email}`.toLowerCase().includes(query.trim().toLowerCase()) &&
    (statusFilter === 'All' || user.status === statusFilter) &&
    (roleFilter === 'All' || applicationRoleFor(user) === roleFilter))
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
  const pending = roster.filter(u => u.status === 'Pending')
  const pendingRegionRef = useRef(null)
  const accountsRegionRef = useRef(null)
  const pendingFit = useViewportPageSize(pending.length, { enabled: canManage && usersView === 'accounts' && pending.length > 0, rootRef: pendingRegionRef })
  const accountsFit = useViewportPageSize(filteredUsers.length, { enabled: canManage && usersView === 'accounts' && !openActionId && !editingUserId && !resettingUserId, rootRef: accountsRegionRef })
  const { pagedRows: pagePending, pagination: pendingPagination } = usePagedRows(pending, store.users.length, pendingFit.pageSize, pendingFit.pagerRef)
  const { pagedRows: pageUsers, pagination: usersPagination } = usePagedRows(filteredUsers, `${query}:${statusFilter}:${roleFilter}`, accountsFit.pageSize, accountsFit.pagerRef)

  useEffect(() => {
    let active = true
    if (!shared || !canManage) return () => { active = false }
    adminUserRequest({ action: 'status' })
      .then(result => {
        if (!active) return
        setAuthStatus(Object.fromEntries((result.users || []).map(user => [user.id, user])))
      })
      .catch(error => {
        if (active) setAuthStatus({ error: error?.message || 'Could not check Supabase Auth accounts.' })
      })
    return () => { active = false }
  }, [canManage, shared, store.users])

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
    setUserDraft({ name: user.name || '', email: user.email || '', applicationRole: applicationRoleFor(user), status: user.pendingAccountPatch?.status || user.status })
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
      if (shared) {
        const remote = await adminUserRequest({ action: 'update', profileId: user.id, expectedRevision: user.accountRevision || 0,
          nextEmail: email, name, applicationRole: userDraft.applicationRole, status })
        store.acceptUserRoster(remote.users)
      } else store.updateUser(user.id, { name, email, role, roles, status })
      setEditingUserId(null)
      setUserDraft(null)
      setUserErr('')
    } catch (error) {
      setUserErr(error?.message || 'Could not update the account.')
      if (shared) await store.refreshSharedData()
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
      const remote = shared
        ? await adminUserRequest({ action: 'create', name, email, password, applicationRole: createDraft.applicationRole })
        : null
      if (remote) store.acceptUserRoster(remote.users)
      else store.addUser({
        id: nextUserId(store.users),
        ...(remote?.user?.id ? { authId: remote.user.id } : {}),
        name, email, ...assignment, status: 'Active', created: today(),
        // Supabase owns the password in cloud mode. Local demo mode retains
        // the existing browser-only credential model.
        pw: password,
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
      if (shared) {
        const result = await adminUserRequest({ action: 'reset', profileId: user.id, email: user.email, password })
        if (!result.ok) throw new Error('Password reset failed.')
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

  const changeAccess = async (user, status) => {
    setActionBusy(true); setActionError(''); setActionNotice('')
    try {
      if (shared) {
        const result = await adminUserRequest({ action: 'access', profileId: user.id, expectedRevision: user.accountRevision || 0, status })
        store.acceptUserRoster(result.users)
      } else store.updateUser(user.id, { status })
      setActionNotice(`${user.name}: ${status}`)
    } catch (error) { setActionError(error.message); if (shared) await store.refreshSharedData() }
    finally { setActionBusy(false) }
  }
  const deleteAccount = async user => {
    setActionBusy(true); setActionError(''); setActionNotice('')
    try {
      if (shared) {
        const result = await adminUserRequest({ action: 'delete', profileId: user.id, expectedRevision: user.accountRevision || 0 })
        store.acceptUserRoster(result.users)
      } else store.removeUserAccount(user.id)
      setActionNotice(`${user.name} was deleted. Business records and history were preserved.`)
      setDeleting(null); setRejecting(null)
    } catch (error) {
      setActionError(error.message); setDeleting(null); setRejecting(null)
      if (shared) await store.refreshSharedData()
    } finally { setActionBusy(false) }
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
        <span className="hint">Admins manage accounts, assign roles and approve registrations. {shared ? 'Shared workspace — account access is managed on the server.' : 'Local demo — changes affect only this browser.'}</span>
        <span className="spacer" />
        {shared && <button type="button" onClick={() => setProvisionConfirm(true)} disabled={provisionBusy}>{provisionBusy ? 'Provisioning…' : 'Provision missing accounts'}</button>}
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
        <div ref={pendingRegionRef}>
          <div className="section-title">Awaiting approval ({pending.length})</div>
          <div className="sheet-wrap sheet-wrap-fill" style={{ marginBottom: 14 }}>
            <table className="sheet">
              <tbody ref={pendingFit.listRef}>
                {pagePending.map(u => (
                  <tr key={u.id}>
                    <td><b>{u.name}</b></td><td>{u.email}</td>
                    <td>Requested <b>{LEVEL3_ROLES[applicationRoleFor(u)].name}</b></td>
                    <td>
                      <button className="primary" disabled={actionBusy} onClick={() => changeAccess(u, 'Active')}>Approve</button>{' '}
                      <button onClick={() => setRejecting(u)}>Reject</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pendingPagination}
        </div>
      )}
      <div className="users-summary" aria-label="Account totals">{['Active', 'Pending', 'Suspended'].map(status => <button key={status} onClick={() => setStatusFilter(status)} aria-pressed={statusFilter === status}><strong>{roster.filter(u => u.status === status).length}</strong> {status}</button>)}</div>
      <div className="users-filters">
        <label>Search accounts<input type="search" placeholder="Name or email" value={query} onChange={e => setQuery(e.target.value)} /></label>
        <label>Status<select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>{['All', 'Active', 'Pending', 'Suspended'].map(status => <option key={status}>{status}</option>)}</select></label>
        <label>Access role<select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}><option value="All">All roles</option>{LEVEL3_ROLE_IDS.map(role => <option key={role} value={role}>{LEVEL3_ROLES[role].name}</option>)}</select></label>
        <button onClick={() => { setQuery(''); setStatusFilter('All'); setRoleFilter('All') }}>Clear filters</button>
      </div>
      {actionError && <div role="alert" className="err-text">{actionError}</div>}
      {actionNotice && <p role="status">{actionNotice}</p>}
      {!filteredUsers.length && <p>No accounts match these filters.</p>}
      <div ref={accountsRegionRef}>
      <div className="section-title">Accounts ({filteredUsers.length} of {roster.length})</div>
      <div className="sheet-wrap sheet-wrap-fill">
        <table className="sheet users-table">
          <colgroup>
            <col className="users-col-name" /><col className="users-col-email" /><col className="users-col-role" />
            <col className="users-col-status" /><col className="users-col-auth" /><col className="users-col-created" />
            {canManage && editingUserId && <col className="users-col-edit" />}
            {canManage && <col className="users-col-actions" />}
          </colgroup>
          <thead>
            <tr><th>Name</th><th>Email</th><th>Access role / Owner</th><th>Status</th><th>Login status</th><th>Created</th>{canManage && <>{editingUserId && <th className="users-edit-heading">Edit</th>}<th className="users-actions-heading">Actions</th></>}</tr>
          </thead>
          <tbody ref={accountsFit.listRef}>
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
                      {matchesAccount(u, store.auth?.user) && <span className="pill you"> You</span>}
                    </td>
                    <td><input className="user-field-input" type="email" disabled={userBusy} value={userDraft.email} onChange={e => { setUserDraft(d => ({ ...d, email: e.target.value })); setUserErr('') }} aria-label={`Email for ${u.name}`} /></td>
                    <td>
                      <select value={userDraft.applicationRole} disabled={u.role === 'SUPER' || userBusy} onChange={e => { setUserDraft(d => ({ ...d, applicationRole: e.target.value })); setUserErr('') }} aria-label={`Role for ${u.name}`}>
                        {!LEVEL3_ROLE_IDS.includes(userDraft.applicationRole) && <option value={userDraft.applicationRole} disabled>Legacy role — choose Standard or Management User</option>}
                        {LEVEL3_ROLE_IDS.map(r => <option key={r} value={r}>{LEVEL3_ROLES[r].name}</option>)}
                      </select>
                    </td>
                    <td><select disabled={userBusy} value={userDraft.status} onChange={e => { setUserDraft(d => ({ ...d, status: e.target.value })); setUserErr('') }} aria-label={`Status for ${u.name}`}>
                      {['Active', 'Pending', 'Suspended'].map(status => <option key={status} value={status}>{status}</option>)}
                    </select></td>
                  </>
                ) : (
                  <>
                    <td><div className="user-name-display"><b>{u.name}</b>{matchesAccount(u, store.auth?.user) && <span className="pill you"> You</span>}</div></td>
                    <td>{u.email || 'No email assigned'}</td>
                    <td>{LEVEL3_ROLES[applicationRoleFor(u)].name}<small className="users-owner">Owner: {store.config?.roleNames?.[u.role] || ROLES[u.role]?.name || u.role} ({u.role})</small></td>
                    <td><span className={`pill status-${u.status}`}>{u.deletionPendingAt ? 'Deletion pending' : u.accessPending ? 'Update pending' : u.status}</span></td>
                  </>
                )}
                <td>
                  {!shared
                    ? <span className="users-auth-status neutral">Local demo</span>
                    : authStatus.error
                      ? <span className="users-auth-status warning" title={authStatus.error}>Unavailable</span>
                      : !authStatus[u.id]
                        ? <span className="users-auth-status checking">Checking…</span>
                        : <span className={`users-auth-status ${authStatus[u.id].authStatus === 'Created' ? 'ok' : 'warning'}`}>{authStatus[u.id].authStatus}</span>}
                </td>
                <td>{ddMmmYY(u.created)}</td>
                {canManage && editingUserId && (
                  <td className={`users-edit-cell${editingUserId === u.id ? ' is-editing' : ''}`}>
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
                    <details className="users-action-menu" onToggle={e => { const open = e.currentTarget.open; setOpenActionId(current => open ? u.id : current === u.id ? null : current) }} onKeyDown={e => { if (e.key === 'Escape') { e.currentTarget.open = false; e.currentTarget.querySelector('summary').focus() } }}>
                      <summary aria-label={`Actions for ${u.name}`}>Actions ▾</summary>
                      <div>
                        <button disabled={actionBusy || editingUserId !== null || Boolean(u.deletionPendingAt)} onClick={() => startUserEdit(u)}>Edit</button>
                        <button disabled={actionBusy || Boolean(u.deletionPendingAt)} onClick={() => startPasswordReset(u)}>Reset password</button>
                        {!shared && isActiveUser(u) && <button disabled={actionBusy} onClick={() => { store.signInAs(u.id); nav('/opportunities') }}>Preview as user</button>}
                        <button disabled={actionBusy || Boolean(accountChangeError(store.users, actor, u, { status: u.status === 'Active' ? 'Suspended' : 'Active' }))}
                          title={accountChangeError(store.users, actor, u, { status: u.status === 'Active' ? 'Suspended' : 'Active' })}
                          onClick={() => changeAccess(u, u.status === 'Active' ? 'Suspended' : 'Active')}>{u.status === 'Active' ? 'Suspend' : 'Reactivate'}</button>
                        <button className="users-delete" disabled={actionBusy || Boolean(accountChangeError(store.users, actor, u, {}, true))}
                          title={accountChangeError(store.users, actor, u, {}, true)} onClick={() => setDeleting(u)}>{u.deletionPendingAt ? 'Retry delete' : 'Delete'}</button>
                      </div>
                    </details>
                  </td>
                )}
              </tr>
              {editingUserId === u.id && userErr && (
                <tr className="users-edit-error"><td colSpan={canManage ? (editingUserId ? 8 : 7) : 6}><div className="err-text" role="alert">{userErr}</div></td></tr>
              )}
              {resettingUserId === u.id && (
                <tr key={`${u.id}-reset`} className="users-reset-row">
                  <td colSpan={canManage ? (editingUserId ? 8 : 7) : 6}>
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
      </div>
      </section>

      <section id="users-panel-role-names" className="users-tab-panel" role="tabpanel"
        aria-labelledby="users-tab-role-names" hidden={usersView !== 'roleNames'}>
      <form className="users-role-names-panel" onSubmit={saveRoleNames}>
        <div className="section-title">Owner names</div><p className="hint">Owner identities label business records. Access roles control permissions; changing an owner name does not change access.</p>
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

      {deleting && <ConfirmModal title="Delete user" tone="danger"
        message={`Delete ${deleting.name} (${deleting.email})? Their login will be removed. Opportunities, documents, approvals, bookings and audit history will be preserved. This cannot be undone.`}
        confirmLabel={actionBusy ? 'Deleting…' : 'Delete user'} onClose={() => { if (!actionBusy) setDeleting(null) }}
        onConfirm={() => { if (!actionBusy) deleteAccount(deleting) }} />}
      {rejecting && <ConfirmModal title="Reject registration" tone="danger"
        message={`Reject and remove the registration for ${rejecting.email}?`}
        confirmLabel="Reject registration" onClose={() => setRejecting(null)}
        onConfirm={() => { if (!actionBusy) deleteAccount(rejecting) }} />}
      {provisionConfirm && <ConfirmModal title="Provision all missing accounts?"
        message="This will create Supabase Auth logins for eligible active profiles, using the shared password Demo@1234. Change these passwords before production use."
        confirmLabel="Provision accounts" onClose={() => setProvisionConfirm(false)} onConfirm={provisionAllAccounts} />}
    </div>
  )
}
