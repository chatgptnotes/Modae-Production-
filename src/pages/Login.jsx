import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { ROLES, OWNERS, DEMO_PASSWORD, PORTAL_ENABLED } from '../seed.js'
import { WarnBox } from '../ui.jsx'
import { displayRole, displayRoleLabel } from '../utils.js'
import { Icon, ModaeImageLogo, MicrosoftLogo } from '../icons.jsx'
import { InstallBanner } from '../install.jsx'
import BrandWatermark from '../branding/BrandWatermark.jsx'
import { supabase, signInWithPassword, signUpWithPassword } from '../supabase.js'

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
  const [msNotice, setMsNotice] = useState(false)

  const switchMode = m => { setMode(m); setErr(''); setOk(''); setMsNotice(false) }
  const microsoftSignIn = () => setMsNotice(true)

  // One-click demo sign-in — every ACTIVE account, same audited login path.
  // The customer account is only offered while its portal is on (seed.js).
  const quickAccounts = (store.users || []).filter(u => u.status === 'Active' && (PORTAL_ENABLED || u.role !== 'CUST'))
  const quickLogin = u => {
    setErr('')
    const res = store.login(u.email, u.pw || DEMO_PASSWORD)
    if (!res.ok) setErr(res.err)
    else nav('/my-dashboard', { replace: true })
  }
  const shortLabel = u => displayRole(u.role)

  const submitSignIn = async e => {
    e.preventDefault()
    setErr('')
    if (supabase) {
      const { data, error } = await signInWithPassword(email.trim(), pw)
      if (error) { setErr(error.message || 'Supabase sign-in failed.'); return }
      const res = store.loginExternal(data?.user)
      if (!res.ok) { setErr(res.err); return }
      nav('/my-dashboard', { replace: true })
      return
    }
    const res = store.login(email, pw)
    if (!res.ok) setErr(res.err)
    else nav('/my-dashboard', { replace: true })
    // on ok the integrator's App reacts to store.auth.user
  }

  const submitRegister = async e => {
    e.preventDefault()
    setErr('')
    if (!name.trim() || !email.trim() || !pw) {
      setErr('Name, email and password are all required.')
      return
    }
    if (supabase) {
      const { error } = await signUpWithPassword(email.trim(), pw, { name: name.trim(), role })
      if (error) { setErr(error.message || 'Supabase registration failed.'); return }
      setOk('Account created. Confirm your email if required, then sign in.')
      setMode('signin')
      setPw('')
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
      <BrandWatermark variant="login" />
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
            <div className="login-divider"><span>or</span></div>
            <button type="button" className="btn-microsoft" onClick={microsoftSignIn}>
              <MicrosoftLogo size={16} /> Sign in with Microsoft
            </button>
            {msNotice && <WarnBox>Microsoft sign-in isn't configured in this demo yet — use a quick-login account below or sign in with email/password.</WarnBox>}
            <div className="login-switch">
              Need an account? <a onClick={() => switchMode('register')}>Request access</a>
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
              {REG_ROLES.map(r => <option key={r} value={r}>{displayRoleLabel(r)}</option>)}
            </select>
            <div className="login-actions">
              <button className="primary" type="submit">Request access</button>
            </div>
            <div className="login-switch">
              Already have access? <a onClick={() => switchMode('signin')}>Sign in</a>
            </div>
          </form>
        )}

        {mode === 'signin' && !supabase && (
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
      </div>
    </div>
  )
}

export function RequireAuth({ children }) {
  const store = useStore()
  if (!store.auth?.user) return <Login />
  return children
}
