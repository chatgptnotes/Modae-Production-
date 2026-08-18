import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { ROLES, OWNERS, DEMO_PASSWORD } from '../seed.js'
import { WarnBox } from '../ui.jsx'
import { Icon, ModaeImageLogo } from '../icons.jsx'
import { InstallBanner } from '../install.jsx'

// Roles a new registrant may request: the sales owners plus the technical
// reviewer. Approvers/admin accounts are provisioned by a super admin.
const REG_ROLES = [...OWNERS, 'TECH']

export default function Login() {
  const store = useStore()
  const nav = useNavigate()
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('RS')
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')

  const switchMode = m => { setMode(m); setErr(''); setOk('') }

  // One-click demo sign-in — every ACTIVE account, same audited login path.
  const quickAccounts = (store.users || []).filter(u => u.status === 'Active')
  const quickLogin = u => {
    setErr('')
    const res = store.login(u.email, u.pw || DEMO_PASSWORD)
    if (!res.ok) setErr(res.err)
    else nav('/my-dashboard', { replace: true })
  }
  const shortLabel = u => (ROLES[u.role]?.label || u.role).split('—')[0].trim()

  const submitSignIn = e => {
    e.preventDefault()
    setErr('')
    const res = store.login(email, pw)
    if (!res.ok) setErr(res.err)
    else nav('/my-dashboard', { replace: true })
    // on ok the integrator's App reacts to store.auth.user
  }

  const submitRegister = e => {
    e.preventDefault()
    setErr('')
    if (!name.trim() || !email.trim() || !pw) {
      setErr('Name, email and password are all required.')
      return
    }
    const res = store.registerUser({ name: name.trim(), email: email.trim(), pw, role })
    if (!res.ok) { setErr(res.err); return }
    setOk('Registration submitted — a super admin must approve your account before you can sign in.')
    setMode('signin')
    setPw('')
  }

  return (
    <div className="login-bg">
      <div className="login-card">
        <ModaeImageLogo className="login-logo" height={38} />

        <InstallBanner />

        {ok && <div className="okbox">{ok}</div>}
        {err && <div className="err-text">{err}</div>}

        {mode === 'signin' ? (
          <form onSubmit={submitSignIn}>
            <label htmlFor="lg-email">Work email</label>
            <input id="lg-email" type="email" autoComplete="username" autoFocus
              value={email} onChange={e => setEmail(e.target.value)} placeholder="you@modae.demo" />
            <label htmlFor="lg-pw">Password</label>
            <input id="lg-pw" type="password" autoComplete="current-password"
              value={pw} onChange={e => setPw(e.target.value)} placeholder="Password" />
            <div className="login-actions">
              <button className="primary" type="submit">Sign in</button>
            </div>
            <div className="login-switch">
              No account yet? <a onClick={() => switchMode('register')}>Register</a>
            </div>
          </form>
        ) : (
          <form onSubmit={submitRegister}>
            <label htmlFor="rg-name">Full name</label>
            <input id="rg-name" autoFocus value={name}
              onChange={e => setName(e.target.value)} placeholder="First and last name" />
            <label htmlFor="rg-email">Work email</label>
            <input id="rg-email" type="email" autoComplete="username"
              value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.demo" />
            <label htmlFor="rg-pw">Password</label>
            <input id="rg-pw" type="password" autoComplete="new-password"
              value={pw} onChange={e => setPw(e.target.value)} placeholder="At least 8 characters" />
            <label htmlFor="rg-role">Requested role</label>
            <select id="rg-role" value={role} onChange={e => setRole(e.target.value)}>
              {REG_ROLES.map(r => <option key={r} value={r}>{ROLES[r]?.label || r}</option>)}
            </select>
            <div className="login-actions">
              <button className="primary" type="submit">Create account</button>
            </div>
            <div className="login-switch">
              Already registered? <a onClick={() => switchMode('signin')}>Sign in</a>
            </div>
          </form>
        )}

        {mode === 'signin' && (
          <div className="quick-login">
            <div className="ql-title"><Icon name="sparkles" size={12} /> Quick login — one tap, no password</div>
            <div className="ql-grid">
              {quickAccounts.map(u => (
                <button key={u.id} type="button" className="ql-btn" onClick={() => quickLogin(u)}
                  title={`${u.name} — ${u.email}`}>
                  <b>{shortLabel(u)}</b>
                  <span>{u.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="login-demo">
          Demo accounts — password Demo@1234 for all. Manual sign-in above works too:
          admin@modae.demo (Super Admin), ljs@modae.demo (Strategic Approver),
          ah@modae.demo (Commercial &amp; Ops), rs@modae.demo / pp@modae.demo (Sales),
          tech@modae.demo (Technical), customer@portal.demo (Customer portal).
        </div>
        <WarnBox>Demo authentication — passwords are stored in plain text in this browser only. Not for production.</WarnBox>
      </div>
    </div>
  )
}

export function RequireAuth({ children }) {
  const store = useStore()
  if (!store.auth?.user) return <Login />
  return children
}
