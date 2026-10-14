import React, { useState } from 'react'
import { blankCondition, opsFor } from '../trackerFilters.js'

export default function ColumnCondition({ type, label, value, onApply }) {
  const options = opsFor(type).filter(option => option.op !== 'period')
  const [draft, setDraft] = useState(value || { ...blankCondition(type), op: options[0]?.op || '' })
  const [error, setError] = useState('')
  if (!options.length) return null
  const selected = options.find(option => option.op === draft.op) || options[0]
  const inputType = type === 'date' ? 'date' : ['currency', 'percent', 'number'].includes(type) ? 'number' : 'text'
  const update = patch => { setDraft(current => ({ ...current, ...patch })); setError('') }
  return <form className="tracker-column-condition" onSubmit={event => {
    event.preventDefault()
    if (selected.arity === 2 && draft.a !== '' && draft.b !== '' && (inputType === 'number' ? Number(draft.a) > Number(draft.b) : draft.a > draft.b)) {
      setError('The lower bound must not exceed the upper bound.'); return
    }
    onApply(draft)
  }}>
    <label>Filter {label}<select value={draft.op} onChange={event => update({ op: event.target.value })} name="column-condition-op">{options.map(option => <option key={option.op} value={option.op}>{option.label}</option>)}</select></label>
    {selected.arity > 0 && <input aria-label={`${label} filter value`} type={inputType} step={inputType === 'number' ? 'any' : undefined} value={draft.a} onChange={event => update({ a: event.target.value })} placeholder={type === 'multi-enum' ? 'Separate values with commas' : 'Enter value'} name="column-condition-a" />}
    {selected.arity === 2 && <input aria-label={`${label} upper bound`} type={inputType} step={inputType === 'number' ? 'any' : undefined} value={draft.b} onChange={event => update({ b: event.target.value })} name="column-condition-b" />}
    {error && <p role="alert">{error}</p>}
    <button type="submit">Apply condition</button>
  </form>
}
