import React, { useEffect, useState } from 'react'
import { WORKBOOK_FIELDS, fieldRows, workbookDefaults, validateWorkbookConfig } from '../workbookGovernance.js'
import './workbookGovernance.css'
import CustomerRulesMatrix from './CustomerRulesMatrix.jsx'

const clone = x => JSON.parse(JSON.stringify(x))
const configDraft = config => ({ ...workbookDefaults(), ...clone(config) })

export default function WorkbookGovernanceEditor(props) {
  return props.view === 'fields' ? <FieldListEditor {...props} /> : <CustomerRulesMatrix {...props} />
}

function FieldListEditor({ store, canEdit }) {
  const [draft, setDraft] = useState(() => configDraft(store.config))
  const [dirty, setDirty] = useState(false)
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState([])
  const [saved, setSaved] = useState(false)
  const [selectedField, setSelectedField] = useState('category')
  const [newValue, setNewValue] = useState('')
  const [sourceConfig, setSourceConfig] = useState(store.config)
  useEffect(() => { if (!dirty) { setDraft(configDraft(store.config)); setSourceConfig(store.config) } }, [store.config, dirty])
  const edit = patch => { setDraft(current => ({ ...current, ...patch })); setDirty(true); setSaved(false) }
  const updateRows = rows => edit({ fieldLists: { ...draft.fieldLists, [selectedField]: rows } })
  const rows = fieldRows(draft, selectedField)
  const save = () => {
    const failures = validateWorkbookConfig(draft)
    if (!reason.trim()) failures.push('Enter a reason for this policy change.')
    if (store.config !== sourceConfig) failures.push('Settings changed while you were editing. Cancel to reload the latest settings before saving.')
    setErrors(failures)
    if (failures.length) return
    const patch = Object.fromEntries(['fieldLists', 'probabilityWeights'].map(key => [key, draft[key]]))
    patch.workbookPolicyUpdatedAt = new Date().toISOString()
    patch.workbookPolicyRevision = (Number(store.config.workbookPolicyRevision) || 0) + 1
    const result = store.updateWorkbookPolicy(patch, reason.trim())
    if (result?.error) { setErrors([result.error]); return }
    setDirty(false); setReason(''); setSaved(true)
  }
  return <div className="workbook-governance">
    <section className="admin-card workbook-policy-intro">
      <h3>Excel field lists</h3>
      <p className="hint">Betser Sales Pipeline Usage · April 2026 field list. Save changes to apply them to active work. Historical records keep their saved values.</p>

      <div className="workbook-save-bar">
        <label>Reason for change<input value={reason} disabled={!canEdit} placeholder="Explain the policy update" onChange={e => setReason(e.target.value)} name="workbook-governance-editor-reason" /></label>
        <button className="primary" disabled={!canEdit || !dirty} onClick={save}>Save settings</button>
        <button disabled={!dirty} onClick={() => { setDirty(false); setDraft(configDraft(store.config)); setSourceConfig(store.config); setErrors([]); setReason('') }}>Cancel</button>
        <button disabled={!canEdit} onClick={() => { const defaults = workbookDefaults(); edit({ fieldLists: defaults.fieldLists, probabilityWeights: defaults.probabilityWeights }) }}>Use Excel defaults</button>
      </div>
      {errors.length > 0 && <div className="errbox" role="alert">{errors.map(error => <div key={error}>{error}</div>)}</div>}
      {saved && <p role="status" className="hint">Settings applied. {store.adminSaveState === 'error' ? 'Shared save failed; check the sync indicator and retry.' : store.adminSaveState === 'saving' ? 'Saving to the shared workspace…' : 'Check the sync indicator for shared save status.'}</p>}
    </section>
    <section className="admin-card workbook-field-editor">
      <h3>Field choices</h3><label>Field<select value={selectedField} onChange={e => { setSelectedField(e.target.value); setNewValue('') }} name="workbook-governance-editor-selected-field">{Object.entries(WORKBOOK_FIELDS).map(([key, def]) => <option key={key} value={key}>{def.label}</option>)}</select></label>
      <p className="hint">Rename display labels, change their order or retire a choice. IDs stay stable. Owners use existing operational IDs; Users and roles manages accounts.</p>
      <div className="workbook-choice-list">{rows.map((row, index) => <div className="workbook-choice-row" key={row.value}>
        <code>{row.value}</code><input aria-label={`Label for ${row.value}`} disabled={!canEdit} value={row.label} onChange={e => updateRows(rows.map((item, i) => i === index ? { ...item, label: e.target.value } : item))} name="workbook-governance-editor-label" />
        {['oppType', 'stage'].includes(selectedField) && <select aria-label={`Workflow behavior for ${row.value}`} disabled={!canEdit} value={row.base || row.value} onChange={e => updateRows(rows.map((item, i) => i === index ? { ...item, base: e.target.value } : item))} name="workbook-governance-editor-select">{WORKBOOK_FIELDS[selectedField].values.map(value => <option key={value}>{value}</option>)}</select>}
        <label><input type="checkbox" disabled={!canEdit || WORKBOOK_FIELDS[selectedField].fixed} checked={row.active !== false} onChange={e => updateRows(rows.map((item, i) => i === index ? { ...item, active: e.target.checked } : item))} name="workbook-governance-editor-checkbox" />Active</label>
        <button aria-label={`Move ${row.value} up`} disabled={!canEdit || index === 0} onClick={() => { const next = [...rows]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; updateRows(next) }}>↑</button>
        <button aria-label={`Move ${row.value} down`} disabled={!canEdit || index === rows.length - 1} onClick={() => { const next = [...rows]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; updateRows(next) }}>↓</button>
      </div>)}</div>
      {!WORKBOOK_FIELDS[selectedField].fixed && <div className="admin-actions"><input disabled={!canEdit} value={newValue} placeholder="New choice ID / name" onChange={e => setNewValue(e.target.value)} name="workbook-governance-editor-new-value" /><button disabled={!canEdit || !newValue.trim()} onClick={() => { const value = newValue.trim(); if (rows.some(row => row.value.toLowerCase() === value.toLowerCase())) { setErrors(['This choice already exists.']); return } updateRows([...rows, { value, label: value, active: true, ...(['oppType', 'stage'].includes(selectedField) ? { base: WORKBOOK_FIELDS[selectedField].values[0] } : {}) }]); setNewValue('') }}>Add choice</button></div>}
      {selectedField === 'prob' && <div className="workbook-four-grid">{['Low', 'Medium', 'High'].map(level => <label key={level}>{level} forecast weight (%)<input type="number" min="0" max="100" disabled={!canEdit} value={draft.probabilityWeights[level]} onChange={e => edit({ probabilityWeights: { ...draft.probabilityWeights, [level]: e.target.value } })} name={`workbook-governance-editor-${level}`} /></label>)}<p className="hint">25 / 50 / 75 are application defaults; Excel does not specify percentages.</p></div>}
    </section>
  </div>
}
