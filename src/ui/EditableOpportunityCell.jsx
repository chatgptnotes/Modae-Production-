import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const EditingContext = createContext(null)
export function OpportunityCellEditingProvider({ children }) {
  const active = useRef(null)
  return <EditingContext.Provider value={active}>{children}</EditingContext.Provider>
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

// Display first; only the pencil opens an editor. The table coordinates one edit.
export default function EditableOpportunityCell({ value, checked, onChange, as: Component, type = 'text', children, displayValue, label, options = [], disabled, ...props }) {
  const coordinator = useContext(EditingContext)
  const wrapper = useRef(null)
  const pencil = useRef(null)
  const original = useRef(value ?? '')
  const currentEdit = useRef({ finish: () => true })
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const [error, setError] = useState('')
  const [position, setPosition] = useState({ left: 0, top: 0 })
  const select = Component === 'select'
  const immediate = select || type === 'checkbox'
  const multi = type === 'multi'
  const name = label || props['aria-label'] || 'cell'
  const finish = (cancel = false, restoreFocus = false) => {
    const input = wrapper.current?.querySelector('input,textarea,select')
    if (!cancel && !immediate && !multi && String(draft) !== String(original.current)) {
      if (String(value ?? '') !== String(original.current) && String(value ?? '') !== String(draft)) {
        setError('Changed elsewhere. Press Escape to reload this cell.'); input?.focus(); return false
      }
      if (input && !input.checkValidity()) { input.reportValidity(); input.focus(); return false }
      try { onChange({ target: { type, value: draft } }) } catch (err) { setError(err.message); input?.focus(); return false }
    }
    setEditing(false); setError('')
    if (coordinator?.current === currentEdit.current) coordinator.current = null
    if (restoreFocus) requestAnimationFrame(() => pencil.current?.focus())
    return true
  }
  currentEdit.current.finish = () => finish()
  useEffect(() => () => { if (coordinator?.current === currentEdit.current) coordinator.current = null }, [coordinator])
  useEffect(() => { if (disabled && editing) finish(true) }, [disabled])
  useLayoutEffect(() => {
    if (!editing) return
    const input = wrapper.current?.querySelector('input,textarea,select')
    input?.focus()
  }, [editing])
  useLayoutEffect(() => {
    const input = wrapper.current?.querySelector('textarea')
    if (!input) return
    const fit = () => { input.style.height = 'auto'; input.style.height = `${input.scrollHeight}px` }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(wrapper.current)
    return () => observer.disconnect()
  }, [editing, draft])
  const begin = e => {
    e.stopPropagation()
    if (coordinator?.current && coordinator.current !== currentEdit.current && !coordinator.current.finish()) return
    if (coordinator) coordinator.current = currentEdit.current
    original.current = value ?? ''; setDraft(value ?? ''); setError('')
    const rect = e.currentTarget.getBoundingClientRect()
    setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 288)), top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 280)) })
    setEditing(true)
  }
  const keyDown = e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(true, true) }
    else if (e.key === 'Enter' && !multi) { e.preventDefault(); finish(false, true) }
  }
  const shown = displayValue ?? (select ? selectedLabel(children, value) ?? value : type === 'checkbox' ? checked ? 'Yes' : 'No' : value)
  const Input = Component || (type === 'text' ? 'textarea' : 'input')
  return <div ref={wrapper} className={`opportunity-cell ${editing ? 'is-editing' : ''}`} onKeyDown={keyDown}>
    {!editing || multi ? <>
      <span className="opportunity-cell-value">{shown === '' || shown == null ? '—' : shown}</span>
      {!disabled && <button ref={pencil} type="button" className="opportunity-cell-pencil" title={`Edit ${name}`} aria-label={`Edit ${name}`} onClick={begin}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15z" /></svg>
      </button>}
    </> : <Input {...props} {...(Input === 'input' ? { type } : {})} {...(Input === 'textarea' ? { rows: 1 } : {})}
      label={label} aria-label={name} value={type === 'checkbox' ? undefined : draft} checked={type === 'checkbox' ? checked : undefined}
      onChange={e => {
        if (immediate) { onChange(e); finish(true, true) }
        else { setDraft(e.target.value); setError('') }
      }} onBlur={() => finish()}>{children}</Input>}
    {error && <span className="opportunity-cell-error" role="alert">{error}</span>}
    {editing && multi && createPortal(<>
      <div className="filter-overlay" onClick={() => finish()} />
      <div className="filter-pop opportunity-cell-products" role="dialog" aria-label={`Edit ${name}`} style={{ position: 'fixed', ...position }} onKeyDown={keyDown}>
        {options.map(option => <label className="fitem" key={option.value}><input autoFocus={option === options[0]} type="checkbox" checked={(value || []).includes(option.value)} onChange={() => {
          const next = (value || []).includes(option.value) ? value.filter(item => item !== option.value) : [...(value || []), option.value]
          onChange({ target: { value: next } })
        }} />{option.label}</label>)}
        <button type="button" onClick={() => finish(false, true)}>Done</button>
      </div>
    </>, document.body)}
  </div>
}
