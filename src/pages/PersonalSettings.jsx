import React, { useEffect, useState } from 'react'
import { FONT_CHOICES } from '../userFontPreferences.js'
import { fontAvailable } from '../workspaceFonts.js'
import { useWorkspaceFont } from '../ui/WorkspaceFontContext.jsx'
import { useStore } from '../store.jsx'
import ChangePasswordSettings from '../ui/ChangePasswordSettings.jsx'

export default function PersonalSettings() {
  const store = useStore()
  const preferences = useWorkspaceFont()
  const { font, rev, loaded, loading, saving, error, remote, save, refresh } = preferences
  const [draft, setDraft] = useState(font)
  const [available, setAvailable] = useState(null)
  const [notice, setNotice] = useState('')
  useEffect(() => { setDraft(font) }, [font, rev])
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
    {store.auth?.user && <ChangePasswordSettings key={`${store.auth.source}:${store.auth.user.id}`} />}
  </section>
}
