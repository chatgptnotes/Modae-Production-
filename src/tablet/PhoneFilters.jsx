import React, { useState } from 'react'
import { Modal } from '../ui.jsx'

// Closing discards the draft; Apply updates the existing page filters.
export default function PhoneFilters({ title = 'Filters', fields, onApply, onClose }) {
  const [draft, setDraft] = useState(() => Object.fromEntries(fields.map(field => [field.key, field.value || ''])))
  return <Modal title={title} onClose={onClose} className="phone-filter-sheet">
    <div className="phone-filter-fields">{fields.map(field => <label key={field.key}>{field.label}<select value={draft[field.key]} onChange={event => setDraft(current => ({ ...current, [field.key]: event.target.value }))}>{field.options.map(option => {
      const [value, label] = Array.isArray(option) ? option : [option, option]
      return <option key={value} value={value}>{label}</option>
    })}</select></label>)}</div>
    <footer className="phone-filter-actions"><button type="button" onClick={() => setDraft(Object.fromEntries(fields.map(field => [field.key, field.clearValue || ''])))}>Clear all</button><button type="button" className="primary" onClick={() => { onApply(draft); onClose() }}>Apply filters</button></footer>
  </Modal>
}
