import React, { useState } from 'react'
import { useStore } from '../store.jsx'
import { displayOpportunityId } from '../seed.js'
import { Icon } from '../icons.jsx'
import IntakeForm from './IntakeForm.jsx'
import TenderIntake from './TenderIntake.jsx'

// Single entry point for opportunity creation. The destination choice is
// rendered immediately below the upload area by the selected intake flow.
export default function CreateOpportunity() {
  const store = useStore()
  const openOpps = store.opportunities.filter(o => o.status === 'Open')
  const [destination, setDestination] = useState('new')
  const [targetId, setTargetId] = useState(openOpps[0]?.id || '')
  const [targetSearch, setTargetSearch] = useState('')

  const choose = value => {
    setDestination(value)
    if (value === 'existing' && !targetId) setTargetId(openOpps[0]?.id || '')
  }

  const target = openOpps.find(o => o.id === targetId)
  const visibleOpenOpps = openOpps.filter(o => {
    const query = targetSearch.trim().toLowerCase()
    if (!query) return true
    return [o.id, o.sellTo, o.oppName].some(value => String(value || '').toLowerCase().includes(query))
  })

  const destinationPicker = (
    <div className="destination-picker">
      <div className="section-title"><Icon name="folder" size={14} /> Where should this enquiry go?</div>
      <div className="destination-options">
        <label className={`destination-option ${destination === 'new' ? 'selected' : ''}`}>
          <input type="radio" name="opportunity-destination" checked={destination === 'new'} onChange={() => choose('new')} />
          <span><b>Create a new opportunity</b><small>Register a new pipeline row and folder.</small></span>
        </label>
        <label className={`destination-option ${destination === 'existing' ? 'selected' : ''}`}>
          <input type="radio" name="opportunity-destination" checked={destination === 'existing'} onChange={() => choose('existing')} />
          <span><b>Attach to an existing open opportunity</b><small>Keep the existing ID, customer, and owner.</small></span>
        </label>
      </div>
      {destination === 'existing' && (
        openOpps.length ? (
          <div className="destination-target">
            <label htmlFor="existing-opportunity-search">Search existing opportunities</label>
            <input
              id="existing-opportunity-search"
              type="search"
              value={targetSearch}
              onChange={e => setTargetSearch(e.target.value)}
              placeholder="Search ID, customer, or opportunity"
            />
            <label htmlFor="existing-opportunity">Existing opportunity</label>
            <select id="existing-opportunity" value={targetId} onChange={e => setTargetId(e.target.value)}>
              {visibleOpenOpps.length ? visibleOpenOpps.map(o => (
                <option key={o.id} value={o.id}>{displayOpportunityId(o.id)} — {o.sellTo} — {o.oppName}</option>
              )) : <option value="" disabled>No matching opportunities</option>}
            </select>
            {target && <span className="hint">New extracted tender lines will be saved to this opportunity.</span>}
          </div>
        ) : (
          <div className="warnbox">There are no open opportunities available to attach this enquiry to.</div>
        )
      )}
    </div>
  )

  return (
    <div className="create-opportunity-workspace">
      {destination === 'new' && <IntakeForm destinationPicker={destinationPicker} />}
      {destination === 'existing' && targetId && <TenderIntake key={targetId} fixedTarget={targetId} destinationPicker={destinationPicker} />}
    </div>
  )
}
