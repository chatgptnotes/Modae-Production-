import React, { useLayoutEffect, useRef, useState } from 'react'
import { OPPORTUNITY_DATE_FIELDS, OPPORTUNITY_PERIODS, opportunityDateRange, toISTISOString } from '../utils.js'
import { calendarDate, calendarDays, calendarKey, calendarSelection, dateFilterSummary, readableCalendarDate, shiftCalendarMonth, validCalendarDate } from '../opportunityCalendar.js'

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const months = Array.from({ length: 12 }, (_, index) => new Date(Date.UTC(2026, index, 1)).toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' }))
const presets = OPPORTUNITY_PERIODS.filter(period => !['specific', 'custom'].includes(period.key))

export default function OpportunityDateCalendar({ value, onChange, onComplete }) {
  const today = toISTISOString().slice(0, 10)
  const selected = value.period === 'specific' ? value.date : value.period === 'custom' ? value.from || value.to : opportunityDateRange(value.period).range?.[0]
  const initial = validCalendarDate(selected) ? selected : today
  const [month, setMonth] = useState(initial.slice(0, 7))
  const [yearInput, setYearInput] = useState(initial.slice(0, 4))
  const [mode, setMode] = useState(value.period === 'custom' ? 'range' : 'single')
  const [start, setStart] = useState('')
  const [hover, setHover] = useState('')
  const [focusDay, setFocusDay] = useState(initial)
  const [changeField, setChangeField] = useState(false)
  const rootRef = useRef(null)
  const fieldTriggerRef = useRef(null)
  const moveFocus = useRef(false)
  const days = calendarDays(month)
  const appliedRange = opportunityDateRange(value.period, value).range
  const range = start ? [start, hover || start].sort() : appliedRange
  const fieldLabel = OPPORTUNITY_DATE_FIELDS.find(field => field.key === value.field)?.label || value.field
  const visibleFocus = days.includes(focusDay) ? focusDay : days.find(Boolean)
  useLayoutEffect(() => {
    if (moveFocus.current) {
      rootRef.current?.querySelector(`[data-date="${visibleFocus}"]`)?.focus({ preventScroll: true })
      moveFocus.current = false
    }
  }, [visibleFocus, month])
  const showMonth = next => { setMonth(next); setYearInput(next.slice(0, 4)) }
  const commitYear = () => {
    const year = Number(yearInput)
    if (/^\d{1,4}$/.test(yearInput) && year >= 1 && year <= 9999) showMonth(`${String(year).padStart(4, '0')}${month.slice(4)}`)
    else setYearInput(month.slice(0, 4))
  }
  const pick = day => {
    const result = calendarSelection(mode, start, day)
    if (!result) { setStart(day); setHover(''); return }
    onChange(result)
    onComplete()
  }
  const navigate = (event, day) => {
    const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
    const date = calendarDate(day)
    let next
    if (Object.hasOwn(offsets, event.key)) { date.setUTCDate(date.getUTCDate() + offsets[event.key]); next = calendarKey(date) }
    else if (event.key === 'Home' || event.key === 'End') { const weekday = (date.getUTCDay() + 6) % 7; date.setUTCDate(date.getUTCDate() + (event.key === 'Home' ? -weekday : 6 - weekday)); next = calendarKey(date) }
    else if (event.key === 'PageUp' || event.key === 'PageDown') {
      const target = shiftCalendarMonth(day.slice(0, 7), (event.key === 'PageUp' ? -1 : 1) * (event.shiftKey ? 12 : 1))
      const last = calendarDays(target).filter(Boolean).at(-1)
      next = `${target}-${String(Math.min(Number(day.slice(-2)), Number(last.slice(-2)))).padStart(2, '0')}`
    } else return
    event.preventDefault()
    if (!validCalendarDate(next)) return
    moveFocus.current = true
    showMonth(next.slice(0, 7))
    setFocusDay(next)
    if (start) setHover(next)
  }
  return <div className="opportunity-date-calendar" ref={rootRef}>
    <div className="opportunity-calendar-mode" role="group" aria-label="Date selection mode">
      <button type="button" aria-pressed={mode === 'single'} onClick={() => { setMode('single'); setStart(''); setHover('') }}>Single day</button>
      <button type="button" aria-pressed={mode === 'range'} onClick={() => { setMode('range'); setStart(''); setHover('') }}>Date range</button>
    </div>
    <div className="opportunity-calendar-navigation">
      <button type="button" aria-label="Previous month" disabled={month === '0001-01'} onClick={() => showMonth(shiftCalendarMonth(month, -1))}>‹</button>
      <select aria-label="Calendar month" name="opportunity-calendar-month" value={month.slice(5)} onChange={event => showMonth(`${month.slice(0, 4)}-${event.target.value}`)}>{months.map((label, index) => <option key={label} value={String(index + 1).padStart(2, '0')}>{label}</option>)}</select>
      <input type="number" aria-label="Calendar year" name="opportunity-calendar-year" min="1" max="9999" value={yearInput} onChange={event => setYearInput(event.target.value)} onBlur={commitYear} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commitYear() } }} />
      <button type="button" aria-label="Next month" disabled={month === '9999-12'} onClick={() => showMonth(shiftCalendarMonth(month, 1))}>›</button>
    </div>
    <div className="opportunity-calendar-grid" role="grid" aria-label={`${months[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`} aria-multiselectable={mode === 'range'}>
      <div role="row">{weekdays.map(day => <span role="columnheader" key={day}>{day}</span>)}</div>
      {Array.from({ length: days.length / 7 }, (_, week) => <div role="row" key={week}>{days.slice(week * 7, week * 7 + 7).map((day, index) => {
        const inRange = Boolean(day && range && (range[0] || range[1]) && (!range[0] || day >= range[0]) && (!range[1] || day <= range[1]))
        const endpoint = Boolean(day && range && (day === range[0] || day === range[1]))
        return <div role="gridcell" key={day || `blank-${index}`} aria-selected={inRange}>{day && <button type="button" data-date={day} data-range={inRange} data-endpoint={endpoint} aria-label={readableCalendarDate(day)} aria-current={day === today ? 'date' : undefined} tabIndex={day === visibleFocus ? 0 : -1} onFocus={() => setFocusDay(day)} onMouseEnter={() => { if (start) setHover(day) }} onKeyDown={event => navigate(event, day)} onClick={() => pick(day)}>{Number(day.slice(-2))}</button>}</div>
      })}</div>)}
    </div>
    <p className="opportunity-calendar-status" role="status" aria-live="polite">{start ? `Start: ${readableCalendarDate(start)} · Choose end date` : mode === 'range' ? `Choose start date · ${dateFilterSummary(value)}` : `Choose a day · ${dateFilterSummary(value)}`}</p>
    <div className="opportunity-calendar-presets" role="group" aria-label="Quick date periods">{presets.map(period => <button type="button" key={period.key} aria-pressed={value.period === period.key && !start} onClick={() => { onChange({ period: period.key, date: '', from: '', to: '' }); onComplete() }}>{period.key === 'all' ? 'Any time' : period.label}</button>)}</div>
    <div className="opportunity-calendar-field">
      <button type="button" ref={fieldTriggerRef} aria-expanded={changeField} onClick={() => setChangeField(current => !current)}>Change date field <span>{fieldLabel} ⌄</span></button>
      {changeField && <label>Date field<select name="opportunity-filters-field" value={value.field} onChange={event => { onChange({ field: event.target.value }); setStart(''); setHover(''); fieldTriggerRef.current?.focus(); setChangeField(false) }}>{OPPORTUNITY_DATE_FIELDS.map(field => <option key={field.key} value={field.key}>{field.label}</option>)}</select></label>}
    </div>
  </div>
}
