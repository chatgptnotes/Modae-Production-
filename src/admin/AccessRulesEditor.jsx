import React, { useEffect, useRef, useState } from 'react'
import { ACCESS_ACTIONS, ACCESS_PAGES, defaultAccessPolicy, validateAccessPolicy } from '../accessPolicy.js'
import { DEFAULT_OPPORTUNITY_NUMBERING, previewOpportunityNumber, validateOpportunityNumbering } from '../opportunityNumbering.js'
import './AccessRulesEditor.css'

const ROLES = [['STANDARD_USER', 'Standard user'], ['MANAGEMENT', 'Management']]
const draftFor = (config = {}) => ({
  accessPolicy: structuredClone(config.accessPolicy || defaultAccessPolicy()),
  opportunityNumbering: { ...DEFAULT_OPPORTUNITY_NUMBERING, ...config.opportunityNumbering },
})

export default function AccessRulesEditor({ store, canEdit }) {
  const currentStore = useRef(store)
  currentStore.current = store
  const mounted = useRef(false)
  const [draft, setDraft] = useState(() => draftFor(store.config))
  const [revision, setRevision] = useState(null)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState([])
  const [status, setStatus] = useState('')
  const [stale, setStale] = useState(false)

  async function load() {
    if (!canEdit) return
    setBusy(true); setReady(false); setErrors([]); setStatus('')
    try {
      const result = await currentStore.current.getAccessRules()
      if (!mounted.current) return
      setDraft(draftFor(result.config)); setRevision(result.rev)
      setDirty(false); setReason(''); setStale(false); setReady(true)
    } catch (error) {
      if (mounted.current) setErrors([error.message || 'Could not load access rules. Try reloading.'])
    } finally { if (mounted.current) setBusy(false) }
  }
  useEffect(() => {
    mounted.current = true
    load()
    return () => { mounted.current = false }
  }, [canEdit])

  const edit = patch => { setDraft(value => ({ ...value, ...patch })); setDirty(true); setStatus(''); setErrors([]) }
  const toggle = (role, collection, id, enabled) => {
    const policy = draft.accessPolicy
    const values = policy.roles[role][collection]
    edit({ accessPolicy: { ...policy, roles: { ...policy.roles, [role]: { ...policy.roles[role], [collection]: enabled ? [...values, id] : values.filter(value => value !== id) } } } })
  }
  async function save() {
    if (!canEdit || !ready || busy || stale) return
    const failures = []
    try { failures.push(...validateAccessPolicy(draft.accessPolicy).errors) } catch (error) { failures.push(error.message) }
    try { validateOpportunityNumbering(draft.opportunityNumbering) } catch (error) { failures.push(error.message) }
    if (!reason.trim()) failures.push('Enter a reason for this change.')
    setErrors(failures)
    if (failures.length) return
    setBusy(true); setStatus('')
    try {
      const result = await currentStore.current.saveAccessRules(draft, revision, reason.trim())
      if (!mounted.current) return
      setDraft(draftFor(result.config)); setRevision(result.rev); setDirty(false); setReason('')
      setStatus(result.local ? 'Rules saved locally for this demo.' : 'Rules saved to the shared workspace.')
    } catch (error) {
      if (!mounted.current) return
      const conflict = error.status === 409 || error.statusCode === 409
      setStale(conflict)
      setErrors([conflict ? 'These rules changed while you were editing. Cancel and reload the latest rules before saving again.' : error.message || 'Rules could not be saved. Your draft is still available.'])
    } finally { if (mounted.current) setBusy(false) }
  }
  let preview = ''
  try { preview = previewOpportunityNumber(store.opportunities || [], draft.opportunityNumbering) } catch { /* Invalid draft is explained on save. */ }
  const disabled = !canEdit || !ready || busy || stale
  return <section className="admin-card admin-card-wide access-rules-editor" aria-labelledby="access-rules-title">
    <h3 id="access-rules-title">Role permissions &amp; opportunity IDs</h3>
    <p className="hint">Choose pages and actions for each role. Administrator access is always protected. Existing record ownership and approval requirements still apply.</p>
    {!canEdit && <p role="status">Only administrators can load and change these rules.</p>}
    {canEdit && busy && <p role="status">{ready ? 'Saving rules…' : 'Loading current rules…'}</p>}
    <fieldset disabled={disabled} className="access-rules-fields">
      <legend>Role permissions</legend>
      <div className="access-rules-matrices">
        {[['pages', 'Page access', ACCESS_PAGES], ['actions', 'Allowed actions', ACCESS_ACTIONS]].map(([collection, title, entries]) => <table key={collection} className="access-rules-matrix">
          <caption>{title}</caption>
          <thead><tr><th scope="col">{collection === 'pages' ? 'Page' : 'Action'}</th>{ROLES.map(([role, label]) => <th scope="col" key={role}>{label}</th>)}</tr></thead>
          <tbody>{entries.map(({ id, label }) => <tr key={id}><th scope="row">{label}</th>{ROLES.map(([role, roleLabel]) => <td key={role}><input type="checkbox" aria-label={`${roleLabel}: ${label}`} checked={draft.accessPolicy.roles[role][collection].includes(id)} onChange={event => toggle(role, collection, id, event.target.checked)} name="access-rules-editor-checkbox" /></td>)}</tr>)}</tbody>
        </table>)}
      </div>
    </fieldset>
    <fieldset disabled={disabled} className="access-rules-fields">
      <legend>Opportunity ID format</legend>
      <p className="hint">Applies to newly created opportunities. Existing IDs stay unchanged. Dates follow India Standard Time.</p>
      <div className="access-rules-numbering">
        <label>Prefix<input value={draft.opportunityNumbering.prefix} maxLength={12} placeholder="Optional, e.g. OPP" onChange={event => edit({ opportunityNumbering: { ...draft.opportunityNumbering, prefix: event.target.value.toUpperCase() } })} name="access-rules-editor-prefix" /></label>
        <label>Date format<select value={draft.opportunityNumbering.dateFormat} onChange={event => edit({ opportunityNumbering: { ...draft.opportunityNumbering, dateFormat: event.target.value } })} name="access-rules-editor-date-format">{['YYMM', 'YYYYMM', 'YYYY', 'none'].map(value => <option value={value} key={value}>{value === 'none' ? 'No date' : value}</option>)}</select></label>
        <label>Separator<select value={draft.opportunityNumbering.separator} onChange={event => edit({ opportunityNumbering: { ...draft.opportunityNumbering, separator: event.target.value } })} name="access-rules-editor-separator"><option value="">None</option><option value="-">Hyphen (-)</option></select></label>
        <label>Sequence digits<input type="number" min={3} max={8} value={draft.opportunityNumbering.sequenceWidth} onChange={event => edit({ opportunityNumbering: { ...draft.opportunityNumbering, sequenceWidth: event.target.value === '' ? '' : Number(event.target.value) } })} name="access-rules-editor-sequence-width" /></label>
        <label>Sequence resets<select value={draft.opportunityNumbering.reset} onChange={event => edit({ opportunityNumbering: { ...draft.opportunityNumbering, reset: event.target.value } })} name="access-rules-editor-reset">{[['monthly', 'Monthly'], ['yearly', 'Yearly'], ['continuous', 'Never']].map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      </div>
      <p className="access-rules-preview">Provisional preview: <output aria-live="polite">{preview || 'Choose a valid date and reset combination'}</output></p>
      <p className="hint">The final ID is reserved when an opportunity is created. Monthly resets require a month in the date; yearly resets require a year.</p>
    </fieldset>
    <div className="access-rules-save">
      <label>Reason for change<input disabled={disabled} value={reason} maxLength={1000} placeholder="Describe why these rules are changing" onChange={event => setReason(event.target.value)} name="access-rules-editor-reason" /></label>
      <div className="access-rules-buttons">
        <button type="button" className="primary" disabled={disabled || !dirty || !reason.trim()} onClick={save}>Save access rules</button>
        <button type="button" disabled={!canEdit || busy} onClick={load}>{dirty || stale ? 'Cancel and reload' : 'Reload rules'}</button>
        <button type="button" disabled={disabled} onClick={() => edit(draftFor())}>Use existing defaults</button>
      </div>
    </div>
    {dirty && <p className="hint">Unsaved changes. Defaults also require an explicit save.</p>}
    {!!errors.length && <div role="alert" className="errbox">{errors.map((error, index) => <p key={index}>{error}</p>)}</div>}
    {status && <p role="status">{status}</p>}
  </section>
}
