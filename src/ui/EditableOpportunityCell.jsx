import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const EditingContext = createContext(null)
const RowContext = createContext(null)
export function OpportunityCellEditingProvider({ children }) {
  const active = useRef(null)
  return <EditingContext.Provider value={active}>{children}</EditingContext.Provider>
}

export function EditableOpportunityRow({ children, ...props }) {
  const coordinator = useContext(EditingContext)
  const fields = useRef(new Set())
  const element = useRef(null)
  const handle = useRef({ finish: () => true })
  const [editing, setEditing] = useState(false)
  const register = useCallback(field => { fields.current.add(field); return () => fields.current.delete(field) }, [])
  const finish = () => {
    if (![...fields.current].every(field => field.validate())) return false
    for (const field of fields.current) if (!field.commit()) return false
    setEditing(false)
    if (coordinator?.current === handle.current) coordinator.current = null
    return true
  }
  handle.current.finish = finish
  const begin = () => {
    if (coordinator?.current && coordinator.current !== handle.current && !coordinator.current.finish()) return
    if (coordinator) coordinator.current = handle.current
    setEditing(true)
  }
  useLayoutEffect(() => {
    if (editing) element.current?.querySelector('textarea,input,select')?.focus()
  }, [editing])
  useEffect(() => () => { if (coordinator?.current === handle.current) coordinator.current = null }, [coordinator])
  return <RowContext.Provider value={{ editing, register, begin, finish }}>
    <tr {...props} ref={element} data-editing={editing || undefined}>{children}</tr>
  </RowContext.Provider>
}

// Keep workflow actions out of view-only rows, including keyboard navigation.
export function OpportunityRowEditOnly({ children }) {
  const row = useContext(RowContext)
  return row?.editing ? children : null
}

export function OpportunityRowEditButton({ disabled, label }) {
  const row = useContext(RowContext)
  if (disabled || !row) return null
  return <button type="button" className="opportunity-row-pencil" title={row.editing ? 'Done editing row' : 'Edit row'} aria-label={`${row.editing ? 'Done editing' : 'Edit'} opportunity ${label}`} aria-pressed={row.editing}
    onClick={e => { e.stopPropagation(); row.editing ? row.finish() : row.begin() }}>
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      {row.editing ? <path d="m4 12 5 5L20 6" /> : <path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15z" />}
    </svg>
  </button>
}

function selectedLabel(children, value) {
  for (const child of React.Children.toArray(children)) {
    if (!React.isValidElement(child)) continue
    if (child.type === 'option' && String(child.props.value ?? child.props.children) === String(value)) return child.props.children
    const nested = selectedLabel(child.props.children, value)
    if (nested != null) return nested
  }
  return null
}
const equal = (a, b) => JSON.stringify(a ?? '') === JSON.stringify(b ?? '') || String(a ?? '') === String(b ?? '')

// A row's pencil reveals all permitted editors. Blur/Enter commits a field;
// Done validates remaining drafts and returns the whole row to readable text.
export default function EditableOpportunityCell({ value, checked, onChange, as: Component, type = 'text', children, displayValue, label, options = [], disabled, ...props }) {
  const row = useContext(RowContext)
  const editing = !!row?.editing && !disabled
  const current = type === 'checkbox' ? !!checked : value ?? ''
  const wrapper = useRef(null)
  const original = useRef(current)
  const field = useRef({ validate: () => true, commit: () => true })
  const [draft, setDraft] = useState(current)
  const [error, setError] = useState('')
  const [productsOpen, setProductsOpen] = useState(false)
  const [position, setPosition] = useState({ left: 0, top: 0 })
  const select = Component === 'select'
  const multi = type === 'multi'
  const name = label || props['aria-label'] || 'cell'
  useEffect(() => row?.register(field.current), [row?.register])
  useLayoutEffect(() => {
    if (editing) { original.current = current; setDraft(current); setError('') }
    else setProductsOpen(false)
  }, [editing])
  const validate = () => {
    if (!editing || equal(draft, original.current)) return true
    const input = wrapper.current?.querySelector('input,textarea,select')
    if (!equal(current, original.current) && !equal(current, draft)) {
      setError('Changed elsewhere. Press Escape to reload this field.'); input?.focus(); return false
    }
    if (input && !input.checkValidity()) { input.reportValidity(); input.focus(); return false }
    return true
  }
  const commit = () => {
    if (!validate()) return false
    if (!editing || equal(draft, original.current)) return true
    try {
      onChange({ target: { type, value: draft, checked: draft } })
      original.current = draft
      setError('')
      return true
    } catch (err) { setError(err.message); return false }
  }
  field.current.validate = validate
  field.current.commit = commit
  useLayoutEffect(() => {
    const input = wrapper.current?.querySelector('textarea')
    if (!input) return
    const fit = () => { input.style.height = 'auto'; input.style.height = `${input.scrollHeight}px` }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(wrapper.current)
    return () => observer.disconnect()
  }, [editing, draft])
  const immediate = next => {
    try {
      onChange({ target: { type, value: next, checked: next } })
      original.current = next; setDraft(next); setError('')
    } catch (err) { setError(err.message) }
  }
  const keyDown = e => {
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation(); setDraft(current); original.current = current; setError(''); setProductsOpen(false)
    } else if (e.key === 'Enter' && !multi) { e.preventDefault(); commit() }
  }
  const shown = displayValue ?? (select ? selectedLabel(children, value) ?? value : type === 'checkbox' ? checked ? 'Yes' : 'No' : value)
  const Input = Component || (type === 'text' ? 'textarea' : 'input')
  return <div ref={wrapper} className={`opportunity-cell ${editing ? 'is-editing' : ''}`} onKeyDown={keyDown}>
    {!editing ? <span className="opportunity-cell-value">{shown === '' || shown == null ? '—' : shown}</span>
      : multi ? <button type="button" className="cell-pick" aria-label={`Choose ${name}`} aria-expanded={productsOpen} onClick={e => {
        const rect = e.currentTarget.getBoundingClientRect()
        setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 288)), top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 280)) })
        setProductsOpen(open => !open)
      }}>{shown || 'Select products'} ▾</button>
      : <Input {...props} {...(Input === 'input' ? { type } : {})} {...(Input === 'textarea' ? { rows: 1 } : {})}
        label={label} aria-label={name} value={type === 'checkbox' ? undefined : draft} checked={type === 'checkbox' ? draft : undefined}
        onChange={e => {
          if (select || type === 'checkbox') immediate(type === 'checkbox' ? e.target.checked : e.target.value)
          else { setDraft(e.target.value); setError('') }
        }} onBlur={commit}>{children}</Input>}
    {error && <span className="opportunity-cell-error" role="alert">{error}</span>}
    {editing && productsOpen && createPortal(<>
      <div className="filter-overlay" onClick={() => setProductsOpen(false)} />
      <div className="filter-pop opportunity-cell-products" role="dialog" aria-label={`Choose ${name}`} style={{ position: 'fixed', ...position }} onKeyDown={keyDown}>
        {options.map(option => <label className="fitem" key={option.value}><input autoFocus={option === options[0]} type="checkbox" checked={(draft || []).includes(option.value)} onChange={() => immediate((draft || []).includes(option.value) ? draft.filter(item => item !== option.value) : [...(draft || []), option.value])} name="editable-opportunity-cell-checkbox" />{option.label}</label>)}
        <button type="button" onClick={() => setProductsOpen(false)}>Done</button>
      </div>
    </>, document.body)}
  </div>
}
