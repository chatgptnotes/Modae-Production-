import React, { useEffect, useRef, useState } from 'react'
import { useStore } from '../store.jsx'
import { Icon } from '../icons.jsx'
import { supabase } from '../supabase.js'
import { isLocalDemoSession } from '../authMode.js'
import { validatePasswordChange } from '../passwordChange.js'

export default function ChangePasswordSettings() {
  const store = useStore()
  const local = !supabase || isLocalDemoSession(store)
  const [values, setValues] = useState({ current: '', password: '', confirmation: '' })
  const [visible, setVisible] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const locked = useRef(false)
  const mounted = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const submit = async event => {
    event.preventDefault()
    if (locked.current) return
    setError(''); setNotice('')
    try { validatePasswordChange(values.current, values.password, values.confirmation) }
    catch (problem) { setError(problem.message); return }
    locked.current = true
    setBusy(true)
    try {
      await store.changeOwnPassword(values.current, values.password, values.confirmation)
      if (!mounted.current) return
      setValues({ current: '', password: '', confirmation: '' })
      setVisible({})
      setNotice(local ? 'Password changed on this browser.' : 'Your account password has been changed.')
    } catch (problem) {
      if (mounted.current) setError(problem.message || 'Could not change your password. Please try again.')
    } finally {
      locked.current = false
      if (mounted.current) setBusy(false)
    }
  }
  return <form className="personal-settings-card personal-password-settings" onSubmit={submit} aria-labelledby="change-password-title">
    <h3 id="change-password-title">Change password</h3>
    <p className="personal-settings-description">Change the password for your own account. Enter your current password and choose a new password with at least 8 characters.</p>
    {[
      ['current', 'Current password', 'current-password'],
      ['password', 'New password', 'new-password'],
      ['confirmation', 'Confirm new password', 'new-password'],
    ].map(([key, label, autoComplete]) => <div className="personal-settings-field" key={key}>
      <label htmlFor={`personal-password-${key}`}>{label}</label>
      <div className="password-field">
        <input id={`personal-password-${key}`} name={`personal-password-${key}`} type={visible[key] ? 'text' : 'password'}
          autoComplete={autoComplete} required minLength={key === 'current' ? undefined : 8} disabled={busy}
          value={values[key]} onChange={event => { setValues(previous => ({ ...previous, [key]: event.target.value })); setError(''); setNotice('') }} />
        <button type="button" className="password-toggle" disabled={busy} aria-pressed={Boolean(visible[key])}
          aria-label={`${visible[key] ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
          onClick={() => setVisible(previous => ({ ...previous, [key]: !previous[key] }))}>
          <Icon name={visible[key] ? 'eyeOff' : 'eye'} size={17} />
        </button>
      </div>
    </div>)}
    {local && <p className="personal-settings-description">Local demo: this password change applies only on this browser.</p>}
    {error && <p className="personal-settings-warning" role="alert">{error}</p>}
    <p className="personal-settings-status" role="status">{busy ? 'Changing password…' : notice}</p>
    <div className="personal-settings-actions">
      <button type="submit" className="primary" disabled={busy || !values.current || !values.password || !values.confirmation} aria-busy={busy}>{busy ? 'Changing…' : 'Change password'}</button>
    </div>
  </form>
}
