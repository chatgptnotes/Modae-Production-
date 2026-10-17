import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const normalized = value => String(value || '').trim().toLowerCase()

export function customerPickerPosition(anchor, viewportWidth, viewportHeight, contentHeight = 300) {
  const margin = 8
  const gap = 4
  const width = Math.min(Math.max(anchor.width, 300), Math.max(0, viewportWidth - margin * 2))
  const below = Math.max(0, viewportHeight - margin - anchor.bottom - gap)
  const above = Math.max(0, anchor.top - margin - gap)
  const opensAbove = below < 160 && above > below
  const maxHeight = Math.min(300, opensAbove ? above : below)
  const visibleHeight = Math.min(contentHeight, maxHeight)
  return {
    left: Math.max(margin, Math.min(anchor.left, viewportWidth - margin - width)),
    top: opensAbove ? Math.max(margin, anchor.top - gap - visibleHeight) : Math.max(margin, anchor.bottom + gap),
    width,
    maxHeight,
  }
}

export default function CustomerPicker({ customers = [], value = '', onChange, onCreate, allowCreate = true, disabled = false, label = 'Sell-to Customer', ariaLabel }) {
  const [query, setQuery] = useState(value || '')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [position, setPosition] = useState(null)
  const input = useRef(null)
  const menu = useRef(null)
  const id = useId()
  const listId = `${id}-matches`
  useEffect(() => { setQuery(value || '') }, [value])
  const search = query.trim().toLowerCase()
  const matches = useMemo(() => {
    if (!search) return customers.slice(0, 12)
    return customers.filter(customer => [customer.name, customer.category, customer.location]
      .some(field => normalized(field).includes(search))).slice(0, 12)
  }, [customers, search])
  const exact = customers.find(customer => normalized(customer.name) === normalized(query))
  const canCreate = allowCreate && typeof onCreate === 'function' && !exact && Boolean(query.trim())
  const optionCount = matches.length + (canCreate ? 1 : 0)
  const expanded = open && !disabled

  useEffect(() => { setActiveIndex(-1) }, [query])
  useEffect(() => {
    if (!expanded) return
    const dismiss = event => {
      if (!input.current?.contains(event.target) && !menu.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('focusin', dismiss)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('focusin', dismiss)
    }
  }, [expanded])

  useLayoutEffect(() => {
    if (!expanded) return
    const place = () => {
      if (!input.current) return
      const anchor = input.current.getBoundingClientRect()
      if (anchor.bottom < 0 || anchor.top > window.innerHeight) { setOpen(false); return }
      setPosition(customerPickerPosition(anchor, window.innerWidth, window.innerHeight, menu.current?.scrollHeight || 300))
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [expanded, query, optionCount])

  useEffect(() => {
    if (expanded && activeIndex >= 0) menu.current?.querySelector(`[data-option-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [expanded, activeIndex])

  const choose = customer => {
    setQuery(customer.name)
    setOpen(false)
    setActiveIndex(-1)
    onChange?.(customer.name, customer)
  }

  const create = () => {
    if (!canCreate) return
    const customer = onCreate(query.trim())
    if (customer) choose(customer)
    else setOpen(false)
  }

  const navigate = event => {
    if (event.key === 'Escape' || event.key === 'Tab') {
      if (event.key === 'Escape' && expanded) { event.preventDefault(); event.stopPropagation() }
      setOpen(false)
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      if (optionCount) setActiveIndex(current => event.key === 'ArrowDown'
        ? (current + 1) % optionCount : current <= 0 ? optionCount - 1 : current - 1)
    } else if (event.key === 'Enter' && expanded && activeIndex >= 0 && activeIndex < optionCount) {
      event.preventDefault()
      if (activeIndex < matches.length) choose(matches[activeIndex])
      else create()
    }
  }

  return (
    <div className="customer-picker">
      {label && <label htmlFor={id}>{label}</label>}
      <input
        ref={input}
        id={id}
        type="search"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={expanded ? listId : undefined}
        aria-activedescendant={expanded && activeIndex >= 0 && activeIndex < optionCount ? `${listId}-${activeIndex}` : undefined}
        value={query}
        disabled={disabled}
        placeholder="Search customer master"
        onFocus={() => { setActiveIndex(-1); setOpen(true) }}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(true)}
        onKeyDown={navigate}
        onChange={event => { setQuery(event.target.value); setActiveIndex(-1); setOpen(true); onChange?.(event.target.value, null) }}
        aria-label={ariaLabel || label || 'Customer'} name="customer-picker-query"
      />
      {expanded && typeof document !== 'undefined' && createPortal(
        <div data-customer-picker-portal="true" onClick={event => event.stopPropagation()}>
          <div ref={menu} id={listId} className="customer-picker-menu customer-picker-popup" role="listbox" aria-label="Customer matches"
            style={position || { visibility: 'hidden', width: 300 }}
            onMouseDown={event => event.preventDefault()}>
            {matches.map((customer, index) => (
              <button type="button" role="option" tabIndex={-1} id={`${listId}-${index}`} data-option-index={index}
                aria-selected={normalized(customer.name) === normalized(query)}
                className={index === activeIndex ? 'is-active' : undefined}
                key={customer.id || customer.name} onClick={() => choose(customer)}>
                <strong>{customer.name}</strong>
                <span>{[customer.category, customer.status].filter(Boolean).join(' · ')}</span>
              </button>
            ))}
            {!matches.length && <div className="customer-picker-empty" role="status">No existing customer found.</div>}
            {canCreate && (
              <button type="button" role="option" tabIndex={-1} id={`${listId}-${matches.length}`} data-option-index={matches.length}
                aria-selected={false} className={`customer-picker-create${activeIndex === matches.length ? ' is-active' : ''}`} onClick={create}>
                Create new customer “{query.trim()}”
              </button>
            )}
          </div>
        </div>, document.body,
      )}
    </div>
  )
}
