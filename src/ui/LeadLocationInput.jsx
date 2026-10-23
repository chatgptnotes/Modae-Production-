import React, { useId } from 'react'
import AutosizeTextarea from './AutosizeTextarea.jsx'

export default function LeadLocationInput({ value, onChange, onCheck, disabled, status, name, ariaLabel = 'EUC location or custom address' }) {
  const hintId = useId()
  return <div className="lead-location-field">
    <div className="decision-value-row">
      <AutosizeTextarea className="lead-location-input" rows={1} value={value || ''} disabled={disabled}
        name={name} placeholder="Enter an address" aria-label={ariaLabel} aria-describedby={hintId}
        onChange={event => onChange(event.target.value)}
        onKeyDown={event => {
          if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey
            || event.isComposing || event.nativeEvent?.isComposing || event.keyCode === 229) return
          event.preventDefault(); event.stopPropagation()
          if (!disabled && !event.repeat && String(value || '').trim()) onCheck?.()
        }} />
      {status}
    </div>
    <span id={hintId} className="lead-address-shortcut">Enter to check · Shift+Enter for a new line</span>
  </div>
}
