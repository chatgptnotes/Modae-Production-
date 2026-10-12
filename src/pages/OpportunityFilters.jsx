import React, { useLayoutEffect, useState } from 'react'
import { Modal } from '../ui.jsx'
import { displayRole, OPPORTUNITY_DATE_FIELDS, OPPORTUNITY_PERIODS } from '../utils.js'
import { colType, conditionSummary, isConditionActive } from '../trackerFilters.js'
import { DEFAULT_OPPORTUNITY_DATE_FILTER, opportunityFilterDateState } from '../opportunityFilters.js'
import './opportunityFilters.css'

const fields = [['owner', 'Owner', true], ['status', 'Status', true], ['stage', 'Stage'], ['oppType', 'Opportunity type'], ['prob', 'Probability']]
const basicKeys = new Set(fields.map(([key]) => key))
const valueLabel = (key, value, labelFor) => !value ? 'Not set' : key === 'owner' ? displayRole(value) : labelFor?.(key, value) || value

function Choices({ field, label, single, values, selected, onChange, labelFor }) {
  const [query, setQuery] = useState('')
  const chosen = selected || new Set()
  const visible = values.filter(value => valueLabel(field, value, labelFor).toLowerCase().includes(query.trim().toLowerCase()))
  return <details className="opportunity-filter-choice">
    <summary><span>{label}</span><strong>{chosen.size ? [...chosen].map(value => valueLabel(field, value, labelFor)).join(', ') : 'All'}</strong><span aria-hidden="true">⌄</span></summary>
    <div className="opportunity-filter-options">
      {['owner', 'stage'].includes(field) && <input type="search" aria-label={`Search ${label.toLowerCase()} options`} placeholder={`Search ${label.toLowerCase()}…`} value={query} onChange={event => setQuery(event.target.value)} />}
      <button type="button" onClick={() => onChange(undefined)}>Clear selection</button>
      <div role="group" aria-label={label}>{visible.map(value => <label key={value}>
        <input type={single ? 'radio' : 'checkbox'} name={`opportunity-filter-${field}`} checked={chosen.has(value)} onChange={() => {
          const next = single ? new Set([value]) : new Set(chosen)
          if (!single) chosen.has(value) ? next.delete(value) : next.add(value)
          onChange(next.size ? next : undefined)
        }} />{valueLabel(field, value, labelFor)}
      </label>)}</div>
      {!visible.length && <p>No matching choices.</p>}
    </div>
  </details>
}

export default function OpportunityFilters({ criteria, sort, options, columns, scope, phone, anchor, countMatches, onApply, onClose, labelFor }) {
  const [draft, setDraft] = useState(() => ({ ...criteria, filters: { ...criteria.filters }, conditions: { ...criteria.conditions }, date: { ...criteria.date }, sort }))
  const [position, setPosition] = useState(null)
  useLayoutEffect(() => {
    if (phone) return
    const place = () => {
      const rect = anchor?.getBoundingClientRect()
      setPosition({ left: Math.max(12, Math.min(rect?.left || 12, innerWidth - Math.min(480, innerWidth - 24) - 12)), top: Math.max(12, Math.min((rect?.bottom || 60) + 8, innerHeight - 320)) })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [phone, anchor])
  const updateFilter = (key, value) => setDraft(current => ({ ...current, filters: { ...current.filters, [key]: value } }))
  const dateState = opportunityFilterDateState(draft.date)
  const count = dateState.error ? null : countMatches(draft)
  const updateDate = patch => setDraft(current => ({ ...current, date: { ...current.date, ...patch } }))
  const advanced = [
    ...Object.entries(draft.filters).filter(([key, values]) => !basicKeys.has(key) && values?.size).map(([key, values]) => ({ id: `values-${key}`, label: `${columns.find(col => col.key === key)?.label || key}: ${[...values].map(value => value || 'Not set').join(', ')}`, remove: () => updateFilter(key, undefined) })),
    ...Object.entries(draft.conditions).filter(([key, condition]) => (scope !== 'my' || key !== 'owner') && isConditionActive(condition, colType(key))).map(([key, condition]) => ({ id: `condition-${key}`, label: `${columns.find(col => col.key === key)?.label || key}: ${conditionSummary(condition, colType(key))}`, remove: () => setDraft(current => ({ ...current, conditions: { ...current.conditions, [key]: undefined } })) })),
  ]
  return <Modal title="Filter opportunities" onClose={onClose} className={`opportunity-filter-dialog${phone ? ' is-phone' : ''}`}>
    {!phone && position && <style>{`.opportunity-filter-dialog:not(.is-phone){left:${position.left}px!important;top:${position.top}px!important;max-height:calc(100dvh - ${position.top + 12}px)!important;transform:none!important}`}</style>}
    <div className="opportunity-filter-body">
      <p className="opportunity-filter-hint">Match all fields. Multiple selections within a field match any selected value.</p>
      <div className="opportunity-filter-grid">{fields.filter(([key]) => scope === 'global' || key !== 'owner').map(([key, label, single]) => <Choices key={key} field={key} label={label} single={single} selected={draft.filters[key]} values={[...new Set([...(options[key] || []), ...(draft.filters[key] || [])])]} onChange={value => updateFilter(key, value)} labelFor={labelFor} />)}</div>
      <fieldset className="opportunity-filter-date"><legend>Date</legend><div className="opportunity-filter-grid">
        <label>Date field<select value={draft.date.field} onChange={event => updateDate({ field: event.target.value })}>{OPPORTUNITY_DATE_FIELDS.map(field => <option key={field.key} value={field.key}>{field.label}</option>)}</select></label>
        <label>Period<select value={draft.date.period} onChange={event => updateDate({ period: event.target.value })}>{OPPORTUNITY_PERIODS.map(period => <option key={period.key} value={period.key}>{period.label}</option>)}</select></label>
        {draft.date.period === 'specific' && <label>Specific date<input type="date" value={draft.date.date} onChange={event => updateDate({ date: event.target.value })} /></label>}
        {draft.date.period === 'custom' && <><label>From<input type="date" value={draft.date.from} onChange={event => updateDate({ from: event.target.value })} /></label><label>To<input type="date" value={draft.date.to} onChange={event => updateDate({ to: event.target.value })} /></label></>}
      </div>{dateState.error && <p role="alert">{dateState.error}</p>}</fieldset>
      {advanced.length > 0 && <section className="opportunity-filter-advanced"><h3>Column filters also applied</h3>{advanced.map(item => <button type="button" key={item.id} onClick={item.remove} aria-label={`Remove ${item.label}`}>{item.label} ×</button>)}</section>}
      <label className="opportunity-filter-sort">Sort<select value={draft.sort ? `${draft.sort.key}:${draft.sort.dir}` : ''} onChange={event => setDraft(current => ({ ...current, sort: event.target.value ? { key: event.target.value.split(':')[0], dir: Number(event.target.value.split(':')[1]) } : null }))}>
        <option value="">Default order</option><option value="lastUpdated:-1">Recently updated</option><option value="orderDate:1">Expected order date</option><option value="sellTo:1">Customer A–Z</option>
        {draft.sort && !['lastUpdated:-1', 'orderDate:1', 'sellTo:1'].includes(`${draft.sort.key}:${draft.sort.dir}`) && <option value={`${draft.sort.key}:${draft.sort.dir}`}>{columns.find(col => col.key === draft.sort.key)?.label || draft.sort.key} · {draft.sort.dir === 1 ? 'ascending' : 'descending'}</option>}
      </select></label>
    </div>
    <footer className="opportunity-filter-footer"><p role="status" aria-live="polite">{count == null ? 'Check the date range' : `${count} matching opportunit${count === 1 ? 'y' : 'ies'}`}</p><div>
      <button type="button" onClick={() => setDraft(current => ({ ...current, filters: {}, conditions: {}, date: { ...DEFAULT_OPPORTUNITY_DATE_FILTER } }))}>Reset</button>
      <button type="button" onClick={onClose}>Cancel</button>
      <button type="button" className="primary" disabled={Boolean(dateState.error)} onClick={() => { onApply(draft); onClose() }}>Apply</button>
    </div></footer>
  </Modal>
}
