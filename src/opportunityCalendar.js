import { OPPORTUNITY_PERIODS } from './utils.js'

export const calendarDate = key => new Date(`${key}T00:00:00Z`)
export const calendarKey = date => date.toISOString().slice(0, 10)
export const validCalendarDate = key => /^\d{4}-\d{2}-\d{2}$/.test(key || '') && key >= '0001-01-01' && key <= '9999-12-31' && Number.isFinite(calendarDate(key).getTime()) && calendarKey(calendarDate(key)) === key

export function calendarDays(month) {
  const first = calendarDate(`${month}-01`)
  const year = first.getUTCFullYear()
  const monthIndex = first.getUTCMonth()
  const days = Array((first.getUTCDay() + 6) % 7).fill(null)
  for (let date = new Date(first); date.getUTCFullYear() === year && date.getUTCMonth() === monthIndex; date.setUTCDate(date.getUTCDate() + 1)) days.push(calendarKey(date))
  while (days.length % 7) days.push(null)
  return days
}

export function shiftCalendarMonth(month, offset) {
  const date = calendarDate(`${month}-01`)
  date.setUTCMonth(date.getUTCMonth() + offset)
  if (date.getUTCFullYear() < 1) return '0001-01'
  if (date.getUTCFullYear() > 9999) return '9999-12'
  return calendarKey(date).slice(0, 7)
}

export function calendarSelection(mode, start, day) {
  if (mode === 'single') return { period: 'specific', date: day, from: '', to: '' }
  if (!start) return null
  const [from, to] = [start, day].sort()
  return { period: 'custom', date: '', from, to }
}

export function readableCalendarDate(key) {
  if (!validCalendarDate(key)) return 'Choose date'
  return calendarDate(key).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

export function dateFilterSummary(date) {
  if (date.period === 'all') return 'Any time'
  if (date.period === 'specific') return readableCalendarDate(date.date)
  if (date.period === 'custom') {
    if (!date.from && !date.to) return 'Choose dates'
    if (!date.from) return `Until ${readableCalendarDate(date.to)}`
    if (!date.to) return `From ${readableCalendarDate(date.from)}`
    if (date.from === date.to) return readableCalendarDate(date.from)
    if (date.from.slice(0, 7) === date.to.slice(0, 7) && validCalendarDate(date.from) && validCalendarDate(date.to)) return `${Number(date.from.slice(-2))}–${readableCalendarDate(date.to)}`
    return `${readableCalendarDate(date.from)} – ${readableCalendarDate(date.to)}`
  }
  return OPPORTUNITY_PERIODS.find(period => period.key === date.period)?.label || 'Any time'
}
