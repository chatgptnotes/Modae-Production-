import React, { useMemo, useState } from 'react'
import { fmt } from '../utils.js'

// Searchable replacement for the native part dropdown. Values retain the
// existing addBomLine contract: source:<index> for buyer rows and a numeric
// index for catalogue rows.
export default function PartPicker({ extractedItems = [], allParts = [], bom = [], onSelect }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const existing = useMemo(() => new Set(
    bom.map(line => (line.custRef || line.pn || '').trim().toLowerCase()).filter(Boolean)
  ), [bom])
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = text => !q || text.toLowerCase().includes(q)
    const buyer = extractedItems.map((item, index) => {
      const key = item.partNumber || item.customerRef || item.description || ''
      return {
        value: `source:${index}`,
        label: key || item.description || 'Buyer item',
        detail: item.description || 'Buyer requested item',
        exists: existing.has(key.trim().toLowerCase()),
        search: `${key} ${item.description || ''} ${item.customerRef || ''}`,
      }
    }).filter(item => matches(item.search))
    const catalogue = allParts.map((part, index) => ({
      value: String(index),
      label: `${part.list} · ${part.pn}`,
      detail: `${part.desc || 'Catalogue item'}${part.price != null ? ` (${part.currency} ${fmt(part.price)})` : ''}`,
      exists: existing.has(String(part.pn || '').trim().toLowerCase()),
      search: `${part.list} ${part.pn} ${part.desc || ''}`,
    })).filter(item => matches(item.search))
    return [{ label: 'Buyer PDF items', items: buyer }, { label: 'Price-list items', items: catalogue }]
  }, [allParts, bom, existing, extractedItems, query])
  const items = groups.flatMap(group => group.items)

  const choose = item => {
    if (!item || item.exists) return
    onSelect(item.value)
    setQuery('')
    setOpen(false)
    setActive(0)
  }

  const onKeyDown = event => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive(index => Math.min(items.length - 1, index + 1)); setOpen(true) }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActive(index => Math.max(0, index - 1)); setOpen(true) }
    if (event.key === 'Enter') { event.preventDefault(); choose(items[active]) }
    if (event.key === 'Escape') { setOpen(false) }
  }

  return (
    <div className="part-picker" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setTimeout(() => setOpen(false), 100) }}>
      <label>Add part from buyer PDF or price list:
        <input
          value={query}
          placeholder="Search part number or description"
          role="combobox"
          aria-expanded={open}
          aria-controls="proposal-part-results"
          onFocus={() => setOpen(true)}
          onChange={event => { setQuery(event.target.value); setActive(0); setOpen(true) }}
          onKeyDown={onKeyDown}
        />
      </label>
      {open && (
        <div id="proposal-part-results" className="part-picker-results" role="listbox">
          {!items.length && <div className="part-picker-empty">No matching buyer or price-list parts.</div>}
          {groups.map(group => group.items.length > 0 && (
            <div key={group.label}>
              <div className="part-picker-group-label">{group.label}</div>
              {group.items.map(item => {
                const index = items.indexOf(item)
                return <button type="button" role="option" aria-selected={index === active} key={item.value} disabled={item.exists}
                  className={index === active ? 'active' : ''} onMouseDown={event => event.preventDefault()} onClick={() => choose(item)}>
                  <b>{item.label}</b><span>{item.detail}{item.exists ? ' (already added)' : ''}</span>
                </button>
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
