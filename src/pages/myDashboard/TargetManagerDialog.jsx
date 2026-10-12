import React, { useEffect, useMemo, useState } from 'react'
import { fieldLabel, fieldValues } from '../../workbookGovernance.js'
import { displayRole } from '../../utils.js'
import { targetPlan } from '../../orderBookings.js'

const toLakhs = value => (Number(value) || 0) / 100
const toK = value => Math.round((parseFloat(value) || 0) * 100)
const emptyTarget = { annual: 0, q: [0, 0, 0, 0] }

function allocate(total, weights, count) {
  if (!count) return []
  const amounts = weights.map(value => Math.max(0, Math.round(Number(value) || 0)))
  const weightTotal = amounts.reduce((sum, value) => sum + value, 0)
  const shares = weightTotal
    ? amounts.map(value => total * value / weightTotal)
    : amounts.map(() => total / count)
  const result = shares.map(Math.floor)
  let remainder = total - result.reduce((sum, value) => sum + value, 0)
  const order = shares.map((share, index) => ({ index, fraction: share - result[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)
  for (let i = 0; i < remainder; i += 1) result[order[i % order.length].index] += 1
  return result
}

function TargetManagerDialog({ store, onClose }) {
  const targets = store.sales?.targets || {}
  const owners = useMemo(() => fieldValues(store.config, 'owner', [
    ...(store.opportunities || []).map(row => row.owner), ...Object.keys(targets),
  ]), [store.config, store.opportunities, targets])
  const [drafts, setDrafts] = useState(() => Object.fromEntries(owners.map(owner => {
    const target = targets[owner] || emptyTarget
    return [owner, { annual: String(toLakhs(target.annual)), q: (target.q || emptyTarget.q).map(value => String(toLakhs(value))) }]
  })))
  const [companyTargetDraft, setCompanyTargetDraft] = useState(() => String(toLakhs(
    owners.reduce((sum, owner) => sum + toK(drafts[owner]?.annual), 0),
  )))
  const [errors, setErrors] = useState({})
  const [saved, setSaved] = useState({})
  const [globalError, setGlobalError] = useState('')
  const confirmedPlan = targetPlan(store)
  const draftAnnual = owners.reduce((sum, owner) => sum + toK(drafts[owner]?.annual), 0)
  const confirmedOwners = confirmedPlan.configuredCount

  useEffect(() => {
    const onKeyDown = event => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const update = (owner, key, value, quarterIndex = -1) => {
    const current = drafts[owner] || { annual: '0', q: ['0', '0', '0', '0'] }
    const nextOwner = { ...current,
      [key]: quarterIndex < 0 ? value : current[key].map((item, index) => index === quarterIndex ? value : item),
    }
    const nextDrafts = { ...drafts, [owner]: nextOwner }
    setDrafts(nextDrafts)
    setCompanyTargetDraft(String(toLakhs(owners.reduce((sum, key) => sum + toK(nextDrafts[key]?.annual), 0))))
    setErrors(current => ({ ...current, [owner]: '' }))
    setSaved(current => ({ ...current, [owner]: false }))
  }

  const applyCompanyTarget = () => {
    const companyK = toK(companyTargetDraft)
    const annuals = allocate(companyK, owners.map(owner => toK(drafts[owner]?.annual)), owners.length)
    const nextDrafts = Object.fromEntries(owners.map((owner, index) => {
      const draft = drafts[owner] || { annual: '0', q: ['0', '0', '0', '0'] }
      const quarters = allocate(annuals[index], draft.q.map(toK), 4)
      return [owner, { annual: String(toLakhs(annuals[index])), q: quarters.map(value => String(toLakhs(value))) }]
    }))
    setDrafts(nextDrafts)
    setCompanyTargetDraft(String(toLakhs(companyK)))
    setErrors({})
    setSaved({})
    setGlobalError('')
  }

  const split = owner => setDrafts(current => {
    const total = toK(current[owner].annual)
    const each = Math.floor(total / 4)
    return { ...current, [owner]: { ...current[owner], q: [each, each, each, total - each * 3].map(value => String(toLakhs(value))) } }
  })

  const save = owner => {
    const draft = drafts[owner]
    const annual = toK(draft.annual)
    const q = draft.q.map(toK)
    if (q.reduce((sum, value) => sum + value, 0) !== annual) {
      setErrors(current => ({ ...current, [owner]: 'Quarterly targets must add up to the annual target.' }))
      return
    }
    try {
      store.setSalesTarget(owner, { annual, q })
      setErrors(current => ({ ...current, [owner]: '' }))
      setSaved(current => ({ ...current, [owner]: true }))
    } catch (error) {
      setErrors(current => ({ ...current, [owner]: error.message }))
    }
  }

  const saveAll = () => {
    if (toK(companyTargetDraft) !== draftAnnual) {
      setGlobalError('Apply the company target first so it matches the owner total.')
      return
    }
    const nextErrors = {}
    for (const owner of owners) {
      const draft = drafts[owner] || { annual: '0', q: ['0', '0', '0', '0'] }
      const annual = toK(draft.annual)
      if (draft.q.map(toK).reduce((sum, value) => sum + value, 0) !== annual) {
        nextErrors[owner] = 'Quarterly targets must add up to the annual target.'
      }
    }
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors)
      setGlobalError('Fix the quarterly totals before confirming all targets.')
      return
    }
    try {
      for (const owner of owners) {
        const draft = drafts[owner] || { annual: '0', q: ['0', '0', '0', '0'] }
        store.setSalesTarget(owner, { annual: toK(draft.annual), q: draft.q.map(toK) })
      }
      setErrors({})
      setSaved(Object.fromEntries(owners.map(owner => [owner, true])))
      setGlobalError('All owner targets confirmed for this FY.')
    } catch (error) {
      setGlobalError(error.message)
    }
  }

  return <div className="target-manager-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="target-manager-dialog" role="dialog" aria-modal="true" aria-labelledby="target-manager-title">
      <header className="target-manager-header">
        <div><h2 id="target-manager-title">Manage sales targets</h2><p>Set annual and quarterly targets for each owner · ₹ lakh · {store.sales?.fy || 'Current FY'}</p></div>
        <button type="button" aria-label="Close target editor" onClick={onClose}>×</button>
      </header>
      <div className="target-manager-summary" aria-live="polite">
        <div className="target-manager-company-edit"><label htmlFor="company-target-draft">Company target · ₹ lakh</label><div><input id="company-target-draft" type="number" min="0" step="0.1" value={companyTargetDraft} onChange={event => { setCompanyTargetDraft(event.target.value); setGlobalError('') }} /><button type="button" onClick={applyCompanyTarget} disabled={!owners.length}>Apply</button></div></div>
        <div><span>Confirmed company target</span><strong>₹{toLakhs(confirmedPlan.annual).toLocaleString('en-IN', { maximumFractionDigits: 1 })} L</strong></div>
        <div><span>Draft total</span><strong>₹{toLakhs(draftAnnual).toLocaleString('en-IN', { maximumFractionDigits: 1 })} L</strong></div>
        <div><span>Targets confirmed</span><strong>{confirmedOwners} of {owners.length} owners</strong></div>
      </div>
      {globalError && <p className="target-manager-global-message" role="status">{globalError}</p>}
      <div className="target-manager-scroll">
        <table className="target-manager-table">
          <thead><tr><th>Owner</th><th>Annual</th><th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th><th /></tr></thead>
          <tbody>{owners.map(owner => {
            const draft = drafts[owner] || { annual: '0', q: ['0', '0', '0', '0'] }
            const label = fieldLabel(store.config, 'owner', owner)
            const ownerPlan = targetPlan(store, owner)
            const stored = targets[owner]
            const matchesStored = stored && toK(draft.annual) === Number(stored.annual)
              && draft.q.every((value, index) => toK(value) === Number(stored.q?.[index]))
            const confirmed = saved[owner] || (ownerPlan.configuredCount > 0 && matchesStored)
            const annual = Number(draft.annual) || 0
            const quarterTotal = draft.q.reduce((sum, value) => sum + (Number(value) || 0), 0)
            const mismatch = Math.abs(quarterTotal - annual) > 0.0001
            return <React.Fragment key={owner}>
              <tr>
                <th scope="row">{label === owner ? displayRole(owner, store.config) : label}</th>
                <td><input type="number" min="0" step="0.1" aria-label={`${owner} annual target (₹ lakh)`} value={draft.annual} onChange={event => update(owner, 'annual', event.target.value)} /></td>
                {draft.q.map((value, index) => <td key={index}><input type="number" min="0" step="0.1" aria-label={`${owner} Q${index + 1} target (₹ lakh)`} value={value} onChange={event => update(owner, 'q', event.target.value, index)} /></td>)}
                <td className="target-manager-actions"><button type="button" onClick={() => split(owner)}>Split evenly</button><button type="button" onClick={() => save(owner)} disabled={mismatch}>Confirm target</button>{confirmed ? <span role="status">Confirmed</span> : ownerPlan.pendingCount > 0 ? <span role="status">Needs confirmation</span> : null}</td>
              </tr>
              {errors[owner] && <tr className="target-manager-error"><td colSpan="7" role="alert">{errors[owner]}</td></tr>}
            </React.Fragment>
          })}</tbody>
        </table>
      </div>
      <footer className="target-manager-footer"><span>Changing the company target spreads it across owners in proportion to their current targets. Confirm each row or all targets to update Global Performance.</span><div><button type="button" onClick={saveAll} disabled={!owners.length}>Confirm all</button><button type="button" onClick={onClose}>Done</button></div></footer>
    </section>
  </div>
}

export default TargetManagerDialog
