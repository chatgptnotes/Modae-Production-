import React, { useEffect, useId, useRef, useState } from 'react'
import { CUSTOMER_COLOURS } from '../workbookGovernance.js'
import { matrixDraft, compileMatrix, parseMatrixCell } from './customerRuleMatrix.js'
import './workbookGovernance.css'

function DefinitionHelp({ label }) {
  const id = useId()
  return <span className="matrix-definition-help" tabIndex={0} aria-label={`Needs definition: ${label}`} aria-describedby={id}>
    <span aria-hidden="true">!</span>
    <span id={id} className="matrix-definition-tooltip" role="tooltip">Needs definition. Enter exact values for this row before it can be used for classification.</span>
  </span>
}

function MatrixTextArea({ value, ...props }) {
  const ref = useRef(null)
  useEffect(() => {
    const element = ref.current
    const resize = () => { element.style.height = '0px'; element.style.height = `${element.scrollHeight}px` }
    resize()
    let width = element.clientWidth
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
      if (element.clientWidth !== width) { width = element.clientWidth; resize() }
    })
    observer?.observe(element)
    return () => observer?.disconnect()
  }, [value])
  return <textarea {...props} ref={ref} rows={1} value={value} />
}

export default function CustomerRulesMatrix({ store, canEdit }) {
  const [draft, setDraft] = useState(() => matrixDraft(store.config))
  const [source, setSource] = useState(store.config)
  const [dirty, setDirty] = useState(false)
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState([])
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    if (!dirty) { setDraft(matrixDraft(store.config)); setSource(store.config) }
  }, [store.config, dirty])
  const edit = patch => { setDraft(current => ({ ...current, ...patch })); setDirty(true); setSaved(false) }
  const patchRow = (id, patch) => edit({ classificationCriteria: draft.classificationCriteria.map(row => row.id === id ? { ...row, ...patch } : row) })
  const cancel = () => { setDraft(matrixDraft(store.config)); setSource(store.config); setDirty(false); setReason(''); setErrors([]); setSaved(false) }
  const save = () => {
    const result = compileMatrix(draft)
    if (!reason.trim()) result.errors.push('Enter a reason for the rule change.')
    if (source !== store.config) result.errors.push('Rules changed while you were editing. Cancel to load the latest rules.')
    setErrors(result.errors)
    if (result.errors.length) return
    const keys = ['classificationCriteria', 'customerClasses', 'classRules', 'amberFee', 'customerActionCells', 'customerActionLabel', 'customerActionRemarks', 'customerAccountCells', 'customerAccountLabel', 'customerAccountRemarks', 'customerMatrixVersion']
    const patch = Object.fromEntries(keys.map(key => [key, result.config[key]]))
    patch.workbookPolicyRevision = (Number(store.config.workbookPolicyRevision) || 0) + 1
    patch.workbookPolicyUpdatedAt = new Date().toISOString()
    const outcome = store.updateWorkbookPolicy(patch, reason.trim())
    if (outcome?.error) { setErrors([outcome.error]); return }
    setDirty(false); setReason(''); setSaved(true)
  }
  return <section className="workbook-governance customer-matrix" aria-label="Customer status management">
    <div className="customer-matrix-scroll" tabIndex="0" role="region" aria-label="Editable customer rules table">
      <table className="customer-matrix-table">
        <caption>Customer status management</caption>
        <colgroup><col className="matrix-criteria-column" />{CUSTOMER_COLOURS.map(colour => <col key={colour} className="matrix-rule-column" />)}<col className="matrix-remarks-column" /></colgroup>
        <thead><tr><th scope="col">Criteria</th>{CUSTOMER_COLOURS.map(colour => <th key={colour} scope="col" className={`matrix-${colour.toLowerCase()}`}>{colour}</th>)}<th scope="col">Remarks</th></tr></thead>
        <tbody>{draft.classificationCriteria.map(row => <tr key={row.id}>
          <th scope="row"><input aria-label={`Criterion name: ${row.label}`} disabled={!canEdit} value={row.label} onChange={event => patchRow(row.id, { label: event.target.value })} /></th>
          {CUSTOMER_COLOURS.map(colour => {
            const cell = row.cells[colour] || ''
            const parsed = parseMatrixCell(cell, row.type)
            return <td key={colour}><div className={`matrix-cell ${parsed.needsDefinition ? 'has-definition-help' : ''}`}><input aria-label={`${row.label} / ${colour}`} disabled={!canEdit} value={cell} onChange={event => patchRow(row.id, { cells: { ...row.cells, [colour]: event.target.value } })} />{parsed.needsDefinition && <DefinitionHelp label={`${row.label} / ${colour}`} />}</div></td>
          })}
          <td><input aria-label={`Remarks: ${row.label}`} disabled={!canEdit} value={row.remarks} onChange={event => patchRow(row.id, { remarks: event.target.value })} /></td>
        </tr>)}
        <tr className="matrix-actions-row"><th scope="row"><input aria-label="Action criterion name" disabled={!canEdit} value={draft.customerActionLabel} onChange={event => edit({ customerActionLabel: event.target.value })} /></th>{CUSTOMER_COLOURS.map(colour => <td key={colour}><input aria-label={`Quoting action / ${colour}`} disabled={!canEdit} value={draft.customerActionCells[colour]} onChange={event => edit({ customerActionCells: { ...draft.customerActionCells, [colour]: event.target.value } })} /></td>)}<td><input aria-label="Remarks: quoting actions" disabled={!canEdit} value={draft.customerActionRemarks} onChange={event => edit({ customerActionRemarks: event.target.value })} /></td></tr>
        <tr className="matrix-accounts-row"><th scope="row"><input aria-label="Typical accounts criterion name" disabled={!canEdit} value={draft.customerAccountLabel} onChange={event => edit({ customerAccountLabel: event.target.value })} /></th>{CUSTOMER_COLOURS.map(colour => <td key={colour}><MatrixTextArea aria-label={`Typical accounts / ${colour}`} disabled={!canEdit} value={draft.customerAccountCells[colour]} onChange={event => edit({ customerAccountCells: { ...draft.customerAccountCells, [colour]: event.target.value } })} /></td>)}<td><MatrixTextArea aria-label="Remarks: typical accounts" disabled={!canEdit} value={draft.customerAccountRemarks} onChange={event => edit({ customerAccountRemarks: event.target.value })} /></td></tr>
        </tbody>
      </table>
    </div>
    <div className="workbook-save-bar matrix-save-bar"><label>Reason for change<input disabled={!canEdit} value={reason} placeholder="Explain the rule change" onChange={event => setReason(event.target.value)} /></label><button className="primary" disabled={!canEdit || (!dirty && store.config.customerMatrixVersion === 1 && store.adminSaveState !== 'error')} onClick={save}>Save rules</button><button disabled={!dirty} onClick={cancel}>Cancel</button></div>
    {errors.length > 0 && <div className="errbox" role="alert">{errors.map(error => <div key={error}>{error}</div>)}</div>}
    {saved && <p role="status">{store.adminSaveState === 'error' ? 'Shared save failed. Check the sync indicator and retry.' : store.adminSaveState === 'saving' ? 'Saving rules to the shared workspace…' : 'Rules saved. Check the sync indicator for shared save status.'}</p>}
  </section>
}
