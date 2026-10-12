import React, { useEffect, useState } from 'react'
import { DEFAULT_HEALTH_SCORE, REGISTRATION_FIELDS, healthScoreRules, registrationFields, validateBusinessRules } from '../businessRules.js'

const labels = {
  kycValid: 'Completed KYC', kycRenewal: 'KYC renewal due', kycMissing: 'Missing KYC',
  paymentOverdue: 'Overdue payment', paymentOnTime: 'On-time payment',
  payment90: 'Payment takes 90+ days', payment60: 'Payment takes 60–89 days',
  closedWeight: 'Win/loss history influence', idlePenalty: 'No open opportunities',
  healthyAt: 'Healthy score starts at', watchAt: 'Watch score starts at',
}
const draftFor = config => ({ registrationRequiredFields: registrationFields(config).map(([key]) => key), healthScore: healthScoreRules(config) })

export default function BusinessRulesEditor({ store, canEdit }) {
  const [draft, setDraft] = useState(() => draftFor(store.config))
  const [source, setSource] = useState(store.config)
  const [dirty, setDirty] = useState(false)
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState([])
  const [saved, setSaved] = useState(false)
  useEffect(() => { if (!dirty) { setDraft(draftFor(store.config)); setSource(store.config) } }, [store.config, dirty])
  const edit = patch => { setDraft(current => ({ ...current, ...patch })); setDirty(true); setSaved(false) }
  const reset = () => { setDraft(draftFor(store.config)); setSource(store.config); setDirty(false); setErrors([]); setReason(''); setSaved(false) }
  const save = () => {
    if (!canEdit) return
    const numeric = value => value === '' ? NaN : Number(value)
    const patch = { ...draft, healthScore: Object.fromEntries(Object.entries(draft.healthScore).map(([key, value]) =>
      [key, key === 'classBase' ? Object.fromEntries(Object.entries(value).map(([colour, score]) => [colour, numeric(score)])) : numeric(value)])) }
    const failures = validateBusinessRules(patch)
    if (!reason.trim()) failures.push('Enter a reason for this change.')
    if (source !== store.config) failures.push('Settings changed while you were editing. Cancel to reload the latest settings.')
    setErrors(failures)
    if (failures.length) return
    const result = store.updateWorkbookPolicy(patch, reason.trim())
    if (result?.error) { setErrors([result.error]); return }
    setDirty(false); setReason(''); setSaved(true)
  }
  return <section className="admin-card admin-card-wide workbook-governance">
    <h3>Registration and customer-health rules</h3>
    <p className="hint">Changes apply to new registration checks and health calculations. Saved opportunity probabilities and existing registrations stay as recorded.</p>
    <fieldset disabled={!canEdit}><legend>Required before registration</legend>
      {REGISTRATION_FIELDS.map(([key, label]) => <label className="check-row" key={key}><input type="checkbox" checked={draft.registrationRequiredFields.includes(key)} disabled={key === 'sellTo'} onChange={event => edit({ registrationRequiredFields: event.target.checked ? [...draft.registrationRequiredFields, key] : draft.registrationRequiredFields.filter(value => value !== key) })} />{label}{key === 'sellTo' ? ' (always required)' : ''}</label>)}
    </fieldset>
    <details><summary>Customer-health scoring</summary>
      <p className="hint">Starting score plus adjustments, capped at 0–100. Win/loss history uses (win rate − 40%) × influence after two closed outcomes. This score does not feed probability.</p>
      <div className="workbook-four-grid">{Object.entries(draft.healthScore.classBase).map(([colour, value]) => <label key={colour}>{colour} starting score<input type="number" min="0" max="100" disabled={!canEdit} value={value} onChange={event => edit({ healthScore: { ...draft.healthScore, classBase: { ...draft.healthScore.classBase, [colour]: event.target.value } } })} /></label>)}
      {Object.entries(labels).map(([key, label]) => <label key={key}>{label}<input type="number" min={['healthyAt', 'watchAt', 'closedWeight'].includes(key) ? 0 : -100} max="100" disabled={!canEdit} value={draft.healthScore[key]} onChange={event => edit({ healthScore: { ...draft.healthScore, [key]: event.target.value } })} /></label>)}</div>
    </details>
    <div className="workbook-save-bar"><label>Reason for change<input disabled={!canEdit} value={reason} onChange={event => setReason(event.target.value)} /></label><button type="button" className="primary" disabled={!canEdit || !dirty} onClick={save}>Save business rules</button><button type="button" disabled={!dirty} onClick={reset}>Cancel</button><button type="button" disabled={!canEdit} onClick={() => edit({ registrationRequiredFields: REGISTRATION_FIELDS.map(([key]) => key), healthScore: { ...DEFAULT_HEALTH_SCORE, classBase: { ...DEFAULT_HEALTH_SCORE.classBase } } })}>Use existing defaults</button></div>
    {!!errors.length && <div role="alert" className="errbox">{errors.map(error => <p key={error}>{error}</p>)}</div>}
    {saved && <p role="status">Rules applied locally. Check the sync indicator for shared save status.</p>}
  </section>
}
