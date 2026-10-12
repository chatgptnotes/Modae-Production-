import React from 'react'
import { ddMmmYY } from '../utils.js'
import EditableOpportunityCell from './EditableOpportunityCell.jsx'

export default function TrackerDateCell({ value, onChange, disabled, label, title }) {
  return <EditableOpportunityCell type="date" value={value} displayValue={value ? ddMmmYY(value) : '—'} onChange={onChange} disabled={disabled} label={label} title={title} />
}
