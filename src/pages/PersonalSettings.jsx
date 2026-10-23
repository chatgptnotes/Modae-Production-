import React, { useEffect, useState } from 'react'
import { FONT_CHOICES } from '../userFontPreferences.js'
import { fontAvailable } from '../workspaceFonts.js'
import { useWorkspaceFont } from '../ui/WorkspaceFontContext.jsx'
import { useStore } from '../store.jsx'
import ChangePasswordSettings from '../ui/ChangePasswordSettings.jsx'
import { linkMicrosoftIdentity, supabase } from '../supabase.js'

export default function PersonalSettings() {
  const store = useStore()
  const preferences = useWorkspaceFont()
  const { font, rev, loaded, loading, saving, error, remote, save, refresh } = preferences
  const [draft, setDraft] = useState(font)
  const [available, setAvailable] = useState(null)
  const [notice, setNotice] = useState('')
  const [identityError, setIdentityError] = useState('')
  const [microsoftLinked, setMicrosoftLinked] = useState(null)
  const microsoftQuery = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search)
  useEffect(() => { setDraft(font) }, [font, rev])
  useEffect(() => {
    let active = true
    if (!supabase || !store.auth?.user) { setMicrosoftLinked(null); return }
    supabase.auth.getUserIdentities().then(({ data, error }) => {
      if (!active) return
      if (error) { setIdentityError(error.message); setMicrosoftLinked(false) }
      else setMicrosoftLinked((data?.identities || []).some(identity => identity.provider === 'azure'))
    })
    return () => { active = false }
  }, [store.auth?.user?.id])
  useEffect(() => {
    let active = true
    setAvailable(null)
    fontAvailable(draft).then(result => { if (active) setAvailable(result) })
    return () => { active = false }
  }, [draft])
  const apply = async () => {
    setNotice('')
    try { await save(draft); setNotice(remote ? 'Font saved to your account.' : 'Font saved on this browser.') } catch { /* The shared status displays the retryable error. */ }
  }
  return <section className="page personal-settings">
    <h2 className="workspace-page-title workspace-page-title--topbar-duplicate">Personal settings</h2>
    <div className="personal-settings-card">
      <h3>Appearance</h3>
      <p className="personal-settings-description">Choose the font you find easiest to read. This changes only your interface; proposals and printed company documents keep Candara.</p>
      <label className="personal-settings-field" htmlFor="personal-font">Font
        <select id="personal-font" value={draft} disabled={saving} onChange={event => { setDraft(event.target.value); setNotice('') }}>
          {FONT_CHOICES.map(choice => <option key={choice.id} value={choice.id}>{choice.label}{choice.id === 'candara' ? ' (default)' : ''}</option>)}
        </select>
      </label>
      <div className="personal-settings-preview" aria-label="Font preview" style={{ '--preview-font': FONT_CHOICES.find(choice => choice.id === draft).family }}>
        <strong>ModAE Sales Workspace</strong>
        <p>Customer names and opportunity descriptions stay readable, even when they need more than one line.</p>
        <p>Opportunity 2610001 · Expected order 31/10/2026 · ₹12.50 L</p>
      </div>
      {available === false && <p role="status" className="personal-settings-warning">{draft === 'candara'
        ? 'Candara is not available on this device. A fallback font is shown until the company font is provided; choosing Candara still saves your preference.'
        : `${FONT_CHOICES.find(choice => choice.id === draft).label} could not load. Check your connection and reload this page to try again.`}</p>}
      <p className="personal-settings-description">{remote ? 'Your saved choice follows your account across devices.' : 'Local session: this choice is remembered for your user on this browser only.'}</p>
      {error && <p role="alert" className="personal-settings-warning">{error}</p>}
      <p role="status" className="personal-settings-status">{saving ? 'Saving…' : loading ? 'Loading saved settings…' : notice}</p>
      <div className="personal-settings-actions">
        <button type="button" className="primary" disabled={!loaded || saving || draft === font} onClick={apply}>Save font</button>
        <button type="button" disabled={saving} onClick={() => { setDraft('candara'); setNotice('Select Save font to apply the default.') }}>Reset to Candara</button>
        {remote && <button type="button" disabled={saving || loading} onClick={() => { setNotice(''); void refresh() }}>Reload settings</button>}
      </div>
    </div>
    {supabase && store.auth?.user && <div className="personal-settings-card">
      <h3>Microsoft sign-in</h3>
      <p className="personal-settings-description">Connect Microsoft to this WinTrack account before using the Microsoft button on the sign-in page. Your WinTrack role and account ID stay the same.</p>
      {identityError && <p role="alert">{identityError}</p>}
      {microsoftQuery.get('microsoft_error') && <p role="alert">{microsoftQuery.get('microsoft_error')}</p>}
      {microsoftQuery.get('microsoft') === 'connected' && <p role="status">Microsoft connected to your WinTrack account.</p>}
      {microsoftLinked
        ? <p role="status">Microsoft is connected to this account.</p>
        : <button type="button" disabled={microsoftLinked === null} onClick={() => { setIdentityError(''); void linkMicrosoftIdentity().catch(error => setIdentityError(error.message)) }}>Connect Microsoft sign-in</button>}
    </div>}
    {store.auth?.user && <ChangePasswordSettings key={`${store.auth.source}:${store.auth.user.id}`} />}
  </section>
}
