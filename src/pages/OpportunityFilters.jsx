import React, { useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Modal } from '../ui.jsx'
import { displayRole, OPPORTUNITY_DATE_FIELDS } from '../utils.js'
import { colType, conditionSummary, isConditionActive } from '../trackerFilters.js'
import { DEFAULT_OPPORTUNITY_DATE_FILTER, opportunityFilterDateState } from '../opportunityFilters.js'
import OpportunityDateCalendar from './OpportunityDateCalendar.jsx'
import { dateFilterSummary } from '../opportunityCalendar.js'
import './opportunityFilters.css'

const fields = {
  owner: { label: 'Owner', empty: 'Any owner', single: true, search: true },
  status: { label: 'Status', empty: 'All', single: true },
  stage: { label: 'Stage', empty: 'Any stage', search: true },
  oppType: { label: 'Opportunity type', empty: 'Any type' },
  prob: { label: 'Probability', empty: 'Any probability' },
}
const valueLabel = (key, value, labelFor) => !value ? 'Not set' : key === 'owner' ? displayRole(value) : labelFor?.(key, value) || value
const standardSorts = { 'lastUpdated:-1': 'Recently updated', 'orderDate:1': 'Expected order date', 'sellTo:1': 'Customer A–Z' }

export default function OpportunityFilters({ criteria, sort, options, columns, scope, phone, countMatches, onApply, onClose, labelFor }) {
  const [draft, setDraft] = useState(() => ({ ...criteria, filters: { ...criteria.filters }, conditions: { ...criteria.conditions }, date: { ...criteria.date }, sort }))
  const [openChoice, setOpenChoice] = useState(null)
  const [query, setQuery] = useState('')
  const editorId = useId()
  const editorRef = useRef(null)
  const bodyRef = useRef(null)
  const triggerRefs = useRef({})
  const dateState = opportunityFilterDateState(draft.date)
  const count = dateState.error ? null : countMatches(draft)
  const updateFilter = (key, value) => setDraft(current => ({ ...current, filters: { ...current.filters, [key]: value } }))
  const updateDate = patch => setDraft(current => ({ ...current, date: { ...current.date, ...patch } }))
  const closeEditor = () => {
    triggerRefs.current[openChoice]?.focus()
    setOpenChoice(null)
    setQuery('')
  }
  const toggleEditor = key => {
    if (openChoice === key) { closeEditor(); return }
    setQuery('')
    setOpenChoice(key)
  }
  useLayoutEffect(() => {
    if (!openChoice) return
    const editor = editorRef.current
    const trigger = triggerRefs.current[openChoice]
    const dialog = bodyRef.current?.closest('[role="dialog"]')
    if (!editor || !trigger || !dialog) return
    const place = () => {
      const bounds = dialog.getBoundingClientRect()
      const anchor = trigger.getBoundingClientRect()
      // Coordinates are relative to the dialog, keeping the popup inside its
      // focus trap and clear of the scrollable sentence body's clipping edge.
      const scaleX = bounds.width / dialog.offsetWidth || 1
      const scaleY = bounds.height / dialog.offsetHeight || 1
      const inset = 8
      const gap = 5
      const viewport = window.visualViewport
      const viewportLeft = viewport?.offsetLeft || 0
      const viewportRight = viewportLeft + (viewport?.width || innerWidth)
      const width = Math.min(openChoice === 'date' ? 360 : openChoice === 'sort' ? 280 : 250, dialog.clientWidth - inset * 2, (viewportRight - viewportLeft - inset * 2) / scaleX)
      editor.style.width = `${width}px`
      const topLimit = openChoice === 'date' ? ((viewport?.offsetTop || 0) + inset - bounds.top) / scaleY - dialog.clientTop : inset
      const bottomLimit = openChoice === 'date' ? ((viewport?.offsetTop || 0) + (viewport?.height || innerHeight) - inset - bounds.top) / scaleY - dialog.clientTop : dialog.clientHeight - inset
      editor.style.maxHeight = `${bottomLimit - topLimit}px`
      const desiredHeight = editor.getBoundingClientRect().height / scaleY
      // A full calendar belongs beside the dialog when space permits, leaving
      // the sentence and selected date visible. Keep it in the same focus trap.
      if (openChoice === 'date' && !phone) {
        const right = bounds.right + inset
        const left = bounds.left - inset - width * scaleX
        const side = right + width * scaleX <= viewportRight - inset ? right : left >= viewportLeft + inset ? left : null
        if (side !== null) {
          editor.style.left = `${(side - bounds.left) / scaleX - dialog.clientLeft}px`
          editor.style.top = `${Math.max(topLimit, Math.min(0, bottomLimit - desiredHeight))}px`
          return
        }
      }
      const anchorTop = (anchor.top - bounds.top) / scaleY - dialog.clientTop
      const anchorBottom = (anchor.bottom - bounds.top) / scaleY - dialog.clientTop
      const roomBelow = Math.max(0, bottomLimit - anchorBottom - gap)
      const roomAbove = Math.max(0, anchorTop - gap - topLimit)
      const below = desiredHeight <= roomBelow || roomBelow >= roomAbove
      // Limit the menu to the chosen side instead of clamping its top across
      // the anchor. Long lists scroll without covering the clicked phrase.
      editor.style.maxHeight = `${below ? roomBelow : roomAbove}px`
      const height = editor.getBoundingClientRect().height / scaleY
      const top = below ? anchorBottom + gap : anchorTop - gap - height
      const leftLimit = Math.max(inset, (viewportLeft + inset - bounds.left) / scaleX - dialog.clientLeft)
      const rightLimit = Math.min(dialog.clientWidth - inset, (viewportRight - inset - bounds.left) / scaleX - dialog.clientLeft)
      const left = Math.max(leftLimit, Math.min((anchor.left - bounds.left) / scaleX - dialog.clientLeft, rightLimit - width))
      editor.style.left = `${left}px`
      editor.style.top = `${top}px`
    }
    place()
    editor.querySelector(openChoice === 'date' ? '[data-date][tabindex="0"]' : 'input, select')?.focus({ preventScroll: true })
    const outside = event => {
      if (!editor.contains(event.target) && !Object.values(triggerRefs.current).some(node => node?.contains(event.target))) {
        setOpenChoice(null)
        setQuery('')
      }
    }
    const scroll = event => { if (!editor.contains(event.target)) place() }
    const observer = new ResizeObserver(place)
    observer.observe(editor)
    observer.observe(dialog)
    observer.observe(trigger)
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('scroll', scroll, true)
    window.addEventListener('resize', place)
    window.visualViewport?.addEventListener('resize', place)
    window.visualViewport?.addEventListener('scroll', place)
    return () => {
      observer.disconnect()
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('scroll', scroll, true)
      window.removeEventListener('resize', place)
      window.visualViewport?.removeEventListener('resize', place)
      window.visualViewport?.removeEventListener('scroll', place)
    }
  }, [openChoice, phone])

  const selectedLabels = key => [...(draft.filters[key] || [])].map(value => valueLabel(key, value, labelFor))
  const selectionText = key => {
    const labels = selectedLabels(key)
    if (!labels.length) return fields[key].empty
    const summary = labels.length > 1 ? `${labels[0]} +${labels.length - 1}` : labels[0]
    return key === 'prob' ? (labels.length === 1 && draft.filters.prob.has('') ? 'Probability not set' : `${summary} probability`) : summary
  }
  const token = key => <button type="button" className="opportunity-filter-token" data-active={Boolean(draft.filters[key]?.size)} ref={node => { triggerRefs.current[key] = node }}
    aria-label={`${fields[key].label}: ${selectedLabels(key).join(', ') || fields[key].empty}`} aria-expanded={openChoice === key} aria-controls={openChoice === key ? editorId : undefined}
    onClick={() => toggleEditor(key)} title={selectedLabels(key).join(', ')}>
    <span>{selectionText(key)}</span><span aria-hidden="true">⌄</span>
  </button>

  const sortKey = draft.sort ? `${draft.sort.key}:${draft.sort.dir}` : ''
  const sortSummary = !draft.sort ? 'Default order' : standardSorts[sortKey] || `${columns.find(col => col.key === draft.sort.key)?.label || draft.sort.key} · ${draft.sort.dir === 1 ? 'ascending' : 'descending'}`
  const dateField = OPPORTUNITY_DATE_FIELDS.find(field => field.key === draft.date.field)?.label || draft.date.field
  const dateSummary = dateFilterSummary(draft.date)
  const field = fields[openChoice]
  const values = field ? [...new Set([...(openChoice === 'prob' ? ['High', 'Medium', 'Low', ''] : []), ...(options[openChoice] || []), ...(draft.filters[openChoice] || [])])] : []
  const visibleValues = values.filter(value => valueLabel(openChoice, value, labelFor).toLowerCase().includes(query.trim().toLowerCase()))
  const advanced = [
    ...Object.entries(draft.filters).filter(([key, values]) => !Object.hasOwn(fields, key) && values?.size).map(([key, values]) => ({ id: `values-${key}`, label: `${columns.find(col => col.key === key)?.label || key}: ${[...values].map(value => value || 'Not set').join(', ')}`, remove: () => updateFilter(key, undefined) })),
    ...Object.entries(draft.conditions).filter(([key, condition]) => (scope !== 'my' || key !== 'owner') && isConditionActive(condition, colType(key))).map(([key, condition]) => ({ id: `condition-${key}`, label: `${columns.find(col => col.key === key)?.label || key}: ${conditionSummary(condition, colType(key))}`, remove: () => setDraft(current => ({ ...current, conditions: { ...current.conditions, [key]: undefined } })) })),
  ]
  return <Modal title="Find opportunities" onClose={onClose} className={`opportunity-filter-dialog${phone ? ' is-phone' : ''}${openChoice === 'date' ? ' has-calendar' : ''}`}>
    <div className="opportunity-filter-body" ref={bodyRef} onKeyDown={event => {
      if (event.key === 'Escape' && openChoice) { event.preventDefault(); event.stopPropagation(); closeEditor() }
    }}>
      <p className="opportunity-filter-hint">Choose the highlighted words to narrow your list.</p>
      <div className="opportunity-filter-sentence" aria-label="Opportunity filters">
        <div className="opportunity-filter-clause"><span>Show</span>{token('status')}<span>opportunities</span></div>
        <div className="opportunity-filter-clause">{scope === 'global' ? <span className="opportunity-filter-phrase"><span>owned by</span>{token('owner')}</span> : <span>in My View</span>}<span className="opportunity-filter-phrase"><span>at</span>{token('stage')}</span></div>
        <div className="opportunity-filter-clause"><span className="opportunity-filter-phrase"><span>with</span>{token('prob')}</span><span className="opportunity-filter-phrase"><span>for</span>{token('oppType')}</span></div>
      </div>
      <div className="opportunity-filter-refinements">
        <div className="opportunity-filter-date-phrase"><span>{dateField}</span><button type="button" className="opportunity-filter-token" data-active={draft.date.period !== 'all'}
          ref={node => { triggerRefs.current.date = node }} aria-label={`Date: ${dateField}, ${dateSummary}`} aria-expanded={openChoice === 'date'} aria-controls={openChoice === 'date' ? editorId : undefined} onClick={() => toggleEditor('date')}>
          <span>{dateSummary}</span><span aria-hidden="true">⌄</span>
        </button></div>
        <button type="button" className="opportunity-filter-sort-trigger" ref={node => { triggerRefs.current.sort = node }} aria-expanded={openChoice === 'sort'} aria-controls={openChoice === 'sort' ? editorId : undefined} onClick={() => toggleEditor('sort')}>
          <span>Sort: {sortSummary}</span><span aria-hidden="true">⌄</span>
        </button>
      </div>
      {openChoice && createPortal(<section className={`opportunity-filter-editor${openChoice === 'date' ? ' is-calendar' : ''}`} id={editorId} ref={editorRef} aria-label={field?.label || (openChoice === 'date' ? 'Date' : 'Sort')}>
        <div className="opportunity-filter-editor-heading"><h3>{field?.label || (openChoice === 'date' ? 'Date' : 'Sort')}</h3>
          <button type="button" onClick={closeEditor}>Done</button>
        </div>
        {field ? <>
          {field.search && <input type="search" aria-label={`Search ${field.label.toLowerCase()} options`} placeholder={`Search ${field.label.toLowerCase()}…`} value={query} onChange={event => setQuery(event.target.value)} name="opportunity-filters-query" />}
          <div className="opportunity-filter-selection-tools"><button type="button" onClick={() => { updateFilter(openChoice, undefined); if (field.single) closeEditor() }}>Clear selection</button></div>
          <div className="opportunity-filter-options" role="group" aria-label={field.label}>{visibleValues.map(value => <label key={value} data-selected={Boolean(draft.filters[openChoice]?.has(value))}>
            <input type={field.single ? 'radio' : 'checkbox'} name={`opportunity-filter-${openChoice}`} checked={Boolean(draft.filters[openChoice]?.has(value))} onChange={() => {
              const next = field.single ? new Set([value]) : new Set(draft.filters[openChoice])
              if (!field.single) next.has(value) ? next.delete(value) : next.add(value)
              updateFilter(openChoice, next.size ? next : undefined)
              if (field.single) closeEditor()
            }} />{valueLabel(openChoice, value, labelFor)}
          </label>)}</div>
          {!visibleValues.length && <p className="opportunity-filter-hint">No matching choices.</p>}
        </> : openChoice === 'date' ? <OpportunityDateCalendar value={draft.date} onChange={updateDate} onComplete={closeEditor} /> : <label className="opportunity-filter-sort">Order results by<select value={sortKey} onChange={event => setDraft(current => ({ ...current, sort: event.target.value ? { key: event.target.value.split(':')[0], dir: Number(event.target.value.split(':')[1]) } : null }))} name="opportunity-filters-select">
          <option value="">Default order</option>{Object.entries(standardSorts).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          {draft.sort && !standardSorts[sortKey] && <option value={sortKey}>{sortSummary}</option>}
        </select></label>}
      </section>, bodyRef.current.closest('[role="dialog"]'))}
      {dateState.error && <div className="opportunity-filter-error" role="alert">{dateState.error}{openChoice !== 'date' && <button type="button" onClick={() => toggleEditor('date')}>Edit dates</button>}</div>}
      {advanced.length > 0 && <section className="opportunity-filter-advanced"><h3>Column filters also applied</h3>{advanced.map(item => <button type="button" key={item.id} onClick={item.remove} aria-label={`Remove ${item.label}`}>{item.label} ×</button>)}</section>}
    </div>
    <footer className="opportunity-filter-footer"><p role="status" aria-live="polite">{count == null ? 'Check the date range' : <><strong>{count}</strong> matching opportunit{count === 1 ? 'y' : 'ies'}</>}</p><div>
      <button type="button" onClick={() => { setDraft(current => ({ ...current, filters: {}, conditions: {}, date: { ...DEFAULT_OPPORTUNITY_DATE_FILTER } })); setQuery(''); setOpenChoice(null) }}>Reset</button>
      <button type="button" onClick={onClose}>Cancel</button>
      <button type="button" className="primary" disabled={Boolean(dateState.error)} onClick={() => { onApply(draft); onClose() }}>Show opportunities</button>
    </div></footer>
  </Modal>
}
