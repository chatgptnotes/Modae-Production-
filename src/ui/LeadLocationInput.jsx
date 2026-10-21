import React, { useEffect, useId, useRef, useState } from 'react'
import AutosizeTextarea from './AutosizeTextarea.jsx'
import { localLocationSearch, normalizeLocationValue, searchAiLocations } from '../locations.js'

export default function LeadLocationInput({ value, onChange, disabled, status, name }) {
  const id = useId()
  const root = useRef(null)
  const request = useRef(0)
  const [open, setOpen] = useState(false)
  const [remote, setRemote] = useState([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const matches = remote.length ? remote : localLocationSearch(value, 6)
  const close = () => { setOpen(false); request.current++; setBusy(false) }

  useEffect(() => {
    request.current++
    setRemote([]); setBusy(false); setMessage('')
  }, [value])
  useEffect(() => () => { request.current++ }, [])

  const search = async () => {
    const token = ++request.current
    setBusy(true); setMessage('Searching locations…'); setOpen(false)
    try {
      const found = await searchAiLocations(String(value || '').replace(/\s+/g, ' ').trim(), 6)
      if (token !== request.current) return
      setRemote(found); setOpen(found.length > 0)
      setMessage(found.length ? '' : 'No suggestions. You can save your custom address.')
    } catch {
      if (token === request.current) setMessage('Search unavailable. You can save your custom address.')
    } finally {
      if (token === request.current) setBusy(false)
    }
  }

  return <div ref={root} className="euc-location-search"
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) close() }}
    onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); close() } }}>
    <div className="decision-value-row">
      <AutosizeTextarea className="lead-location-input" value={value || ''} disabled={disabled}
        name={name} placeholder="Enter an address or search for a city" aria-label="EUC location or custom address"
        aria-expanded={open && matches.length > 0} aria-controls={open && matches.length ? id : undefined}
        onChange={event => { request.current++; setRemote([]); setBusy(false); setMessage(''); setOpen(true); onChange(event.target.value) }} />
      {status}
    </div>
    {open && matches.length > 0 && <div id={id} className="location-suggestions euc-location-suggestions" role="listbox" aria-label="EUC location suggestions">
      {matches.map(item => <button type="button" role="option" aria-selected={false} key={item.value || `${item.city}|${item.state}`} className="location-suggestion" disabled={disabled}
        onClick={() => { onChange(normalizeLocationValue([item.city,item.state,item.country].filter(Boolean).join(', '))); close(); setMessage('') }}>
        <strong>{item.city}</strong><span>{[item.state,item.country].filter(Boolean).join(' · ')}</span>
      </button>)}
    </div>}
    <div className="lead-location-tools">
      <button type="button" disabled={disabled || busy || String(value || '').trim().length < 2} onClick={search}>Find with AI</button>
      {open && <button type="button" disabled={disabled} onClick={() => { close(); setMessage('Custom address kept. Use Save changes to save the lead.') }}>Use this address</button>}
      {message && <span role="status">{message}</span>}
    </div>
  </div>
}
