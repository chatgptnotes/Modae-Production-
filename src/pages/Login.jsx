import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { OWNERS } from '../seed.js'
import { displayRoleLabel } from '../utils.js'
import { Icon, ModaeImageLogo } from '../icons.jsx'
import { InstallBanner } from '../install.jsx'
import BrandWatermark from '../branding/BrandWatermark.jsx'
import { supabase, signInWithPassword, signUpWithPassword } from '../supabase.js'
import { canUseLocalDemoAuth } from '../authMode.js'
import { ThemeToggle } from '../theme.jsx'

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
  const [showPassword, setShowPassword] = useState(false)
  const [signingIn, setSigningIn] = useState(false)

  const switchMode = m => { setMode(m); setErr(''); setOk(''); setShowPassword(false) }

  const submitSignIn = async e => {
    e.preventDefault()
    if (signingIn) return
    setErr('')
    setSigningIn(true)
    try {
      if (supabase) {
        const { data, error } = await signInWithPassword(email.trim(), pw)
        if (error) {
          if (canUseLocalDemoAuth(window.location.hostname, supabase, error)) {
            const local = store.login(email, pw, 'local-demo')
            if (local.ok) {
              nav('/my-dashboard', { replace: true })
              return
            }
          }
          setErr(error.message || 'Supabase sign-in failed.')
          return
        }
        const res = store.loginExternal(data?.user)
        if (!res.ok) { setErr(res.err); return }
        nav('/my-dashboard', { replace: true })
        return
      }
      const res = store.login(email, pw)
      if (!res.ok) setErr(res.err)
      else nav('/my-dashboard', { replace: true })
      // on ok the integrator's App reacts to store.auth.user
    } finally {
      setSigningIn(false)
    }
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
      <ThemeToggle className="login-theme-toggle" />
      <div className="login-card">
        <ModaeImageLogo className="login-logo" height={38} />

        <InstallBanner />

        {ok && <div className="okbox">{ok}</div>}
        {err && <div className="err-text">{err}</div>}

        {mode === 'signin' ? (
          <form onSubmit={submitSignIn}>
            <label htmlFor="lg-email">Work email</label>
            <input id="lg-email" type="email" autoComplete="username" autoFocus disabled={signingIn}
              value={email} onChange={e => setEmail(e.target.value)} placeholder="you@modae.demo" />
            <label htmlFor="lg-pw">Password</label>
            <div className="password-field">
              <input id="lg-pw" type={showPassword ? 'text' : 'password'} autoComplete="current-password" disabled={signingIn}
                value={pw} onChange={e => setPw(e.target.value)} placeholder="Password" />
              <button type="button" className="password-toggle" onClick={() => setShowPassword(show => !show)} disabled={signingIn}
                aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>
                <Icon name={showPassword ? 'eyeOff' : 'eye'} size={17} />
              </button>
            </div>
            <div className="login-actions">
              <button className="primary" type="submit" disabled={signingIn} aria-busy={signingIn}>
                {signingIn ? <><span className="auth-loading__spinner auth-loading__spinner-inline" aria-hidden="true" /> Signing in…</> : 'Sign in'}
              </button>
            </div>
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
            <div className="password-field">
              <input id="rg-pw" type={showPassword ? 'text' : 'password'} autoComplete="new-password"
                value={pw} onChange={e => setPw(e.target.value)} placeholder="At least 8 characters" />
              <button type="button" className="password-toggle" onClick={() => setShowPassword(show => !show)}
                aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>
                <Icon name={showPassword ? 'eyeOff' : 'eye'} size={17} />
              </button>
            </div>
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
      </div>
    </div>
  )
}

export function RequireAuth({ children }) {
  const store = useStore()
  if (!store.authReady) return (
    <div className="login-bg auth-loading" role="status" aria-live="polite">
      <div className="auth-loading__content">
        <ModaeImageLogo height={42} className="auth-loading__logo" />
        <span className="auth-loading__spinner" aria-hidden="true" />
        <span>Checking your session…</span>
      </div>
    </div>
  )
  if (!store.auth?.user) return <Login />
  return children
}
