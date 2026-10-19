import React, { useEffect, useMemo, useState } from 'react'
import { fieldValues } from '../../workbookGovernance.js'
import { displayRole, fmtCroreFromK } from '../../utils.js'
import { targetPlan } from '../../orderBookings.js'

import { targetRupees as toRupees, targetThousands as toK, targetTotal, targetAmountsEqual, allocateTarget as allocate } from './targetAllocation.js'

const emptyTarget = { annual: 0, q: [0, 0, 0, 0] }

function TargetManagerDialog({ store, onClose }) {
  const targets = store.sales?.targets || {}
  const owners = useMemo(() => fieldValues(store.config, 'owner', [
    ...(store.opportunities || []).map(row => row.owner), ...Object.keys(targets),
  ]), [store.config, store.opportunities, targets])
  const [drafts, setDrafts] = useState(() => Object.fromEntries(owners.map(owner => {
    const target = targets[owner] || emptyTarget
    return [owner, { annual: String(toRupees(target.annual)), q: (target.q || emptyTarget.q).map(value => String(toRupees(value))) }]
  })))
  const [companyTargetDraft, setCompanyTargetDraft] = useState(() => String(toRupees(
    targetTotal(owners.map(owner => toK(drafts[owner]?.annual))),
  )))
  const [errors, setErrors] = useState({})
  const [saved, setSaved] = useState({})
  const [globalError, setGlobalError] = useState('')
  const confirmedPlan = targetPlan(store)
  const draftAnnual = targetTotal(owners.map(owner => toK(drafts[owner]?.annual)))
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
    setCompanyTargetDraft(String(toRupees(targetTotal(owners.map(key => toK(nextDrafts[key]?.annual))))))
    setErrors(current => ({ ...current, [owner]: '' }))
    setSaved(current => ({ ...current, [owner]: false }))
  }

  const applyCompanyTarget = () => {
    const companyK = toK(companyTargetDraft)
    const annuals = allocate(companyK, owners.map(owner => toK(drafts[owner]?.annual)), owners.length)
    const nextDrafts = Object.fromEntries(owners.map((owner, index) => {
      const draft = drafts[owner] || { annual: '0', q: ['0', '0', '0', '0'] }
      const quarters = allocate(annuals[index], draft.q.map(toK), 4)
      return [owner, { annual: String(toRupees(annuals[index])), q: quarters.map(value => String(toRupees(value))) }]
    }))
    setDrafts(nextDrafts)
    setCompanyTargetDraft(String(toRupees(companyK)))
    setErrors({})
    setSaved({})
    setGlobalError('')
  }

  const split = owner => setDrafts(current => {
    const total = toK(current[owner].annual)
    return { ...current, [owner]: { ...current[owner], q: allocate(total, [1, 1, 1, 1]).map(value => String(toRupees(value))) } }
  })

  const save = owner => {
    const draft = drafts[owner]
    const annual = toK(draft.annual)
    const q = draft.q.map(toK)
    if (!targetAmountsEqual(targetTotal(q), annual)) {
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
    if (!targetAmountsEqual(toK(companyTargetDraft), draftAnnual)) {
      setGlobalError('Apply the company target first so it matches the owner total.')
      return
    }
    const nextErrors = {}
    for (const owner of owners) {
      const draft = drafts[owner] || { annual: '0', q: ['0', '0', '0', '0'] }
      const annual = toK(draft.annual)
      if (!targetAmountsEqual(targetTotal(draft.q.map(toK)), annual)) {
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
        <div><h2 id="target-manager-title">Manage sales targets</h2><p>Set annual and quarterly targets for each owner · INR · {store.sales?.fy || 'Current FY'}</p></div>
        <button type="button" aria-label="Close target editor" onClick={onClose}>×</button>
      </header>
      <div className="target-manager-summary" aria-live="polite">
        <div className="target-manager-company-edit"><label htmlFor="company-target-draft">Company target · INR</label><div><input id="company-target-draft" type="number" min="0" step="0.01" value={companyTargetDraft} onChange={event => { setCompanyTargetDraft(event.target.value); setGlobalError('') }} /><button type="button" onClick={applyCompanyTarget} disabled={!owners.length}>Apply</button></div></div>
        <div><span>Confirmed company target</span><strong>{fmtCroreFromK(confirmedPlan.annual)}</strong></div>
        <div><span>Draft total</span><strong>{fmtCroreFromK(draftAnnual)}</strong></div>
        <div><span>Targets confirmed</span><strong>{confirmedOwners} of {owners.length} owners</strong></div>
      </div>
      {globalError && <p className="target-manager-global-message" role="status">{globalError}</p>}
      <div className="target-manager-scroll">
        <table className="target-manager-table">
          <thead><tr><th>Owner</th><th>Annual</th><th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th><th /></tr></thead>
          <tbody>{owners.map(owner => {
            const draft = drafts[owner] || { annual: '0', q: ['0', '0', '0', '0'] }
            const label = displayRole(owner, store.config)
            const ownerPlan = targetPlan(store, owner)
            const stored = targets[owner]
            const matchesStored = stored && targetAmountsEqual(toK(draft.annual), stored.annual)
              && draft.q.every((value, index) => targetAmountsEqual(toK(value), stored.q?.[index]))
            const confirmed = saved[owner] || (ownerPlan.configuredCount > 0 && matchesStored)
            const mismatch = !targetAmountsEqual(targetTotal(draft.q.map(toK)), toK(draft.annual))
            return <React.Fragment key={owner}>
              <tr>
                <th scope="row">{label}</th>
                <td><input type="number" min="0" step="0.01" aria-label={`${owner} annual target (INR)`} value={draft.annual} onChange={event => update(owner, 'annual', event.target.value)} name={`target-${owner}-annual`} /></td>
                {draft.q.map((value, index) => <td key={index}><input type="number" min="0" step="0.01" aria-label={`${owner} Q${index + 1} target (INR)`} value={value} onChange={event => update(owner, 'q', event.target.value, index)} name={`target-${owner}-q${index + 1}`} /></td>)}
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
