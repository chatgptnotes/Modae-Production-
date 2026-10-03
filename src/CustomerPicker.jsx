import React, { useMemo, useState } from 'react'

const normalized = value => String(value || '').trim().toLowerCase()

export default function CustomerPicker({ customers = [], value = '', onChange, onCreate, disabled = false, label = 'Sell-to Customer' }) {
  const [query, setQuery] = useState(value || '')
  const [open, setOpen] = useState(false)
  const search = query.trim().toLowerCase()
  const matches = useMemo(() => {
    if (!search) return customers.slice(0, 12)
    return customers.filter(customer => [customer.name, customer.category, customer.location]
      .some(field => normalized(field).includes(search))).slice(0, 12)
  }, [customers, search])
  const exact = customers.find(customer => normalized(customer.name) === normalized(query))

  const choose = customer => {
    setQuery(customer.name)
    setOpen(false)
    onChange?.(customer.name, customer)
  }

  const create = () => {
    const name = query.trim()
    if (!name || exact) return
    const customer = onCreate?.(name)
    if (customer) choose(customer)
  }

  return (
    <div className="customer-picker">
      <label>{label}</label>
      <input
        type="search"
        value={query}
        disabled={disabled}
        placeholder="Search customer master"
        onFocus={() => setOpen(true)}
        onChange={event => { setQuery(event.target.value); setOpen(true); onChange?.(event.target.value, null) }}
        aria-label={label}
      />
      {open && !disabled && (
        <div className="customer-picker-menu" role="listbox" aria-label="Customer matches">
          {matches.map(customer => (
            <button type="button" key={customer.id || customer.name} onClick={() => choose(customer)}>
              <strong>{customer.name}</strong>
              <span>{[customer.category, customer.status].filter(Boolean).join(' · ')}</span>
            </button>
          ))}
          {!matches.length && <div className="customer-picker-empty">No existing customer found.</div>}
          {!exact && query.trim() && (
            <button type="button" className="customer-picker-create" onClick={create}>
              Create new customer “{query.trim()}”
            </button>
          )}
        </div>
      )}
    </div>
  )
}
