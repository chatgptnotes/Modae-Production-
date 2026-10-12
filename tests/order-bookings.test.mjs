import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { bookingRegister, recordBooking, approvePurchaseOrder, targetPlan, confirmSalesTarget, stagePODetails, retainBookingOnDelete, mergeSalesBookings } from '../src/orderBookings.js'
import { mergeOpportunityRow } from '../src/workflowTransitions.js'
import { dashboardModel } from '../src/pages/myDashboard/model.js'
import { salesPerformance } from '../src/kpi.js'
import { seedSales } from '../src/seed.js'

const now = new Date('2026-10-12T06:00:00Z')
const opportunity = { id: 'A', owner: 'PP', sellTo: 'Customer', valueK: 999, status: 'Closed', stage: 'Won', orderDate: '2026-10-01', importedFrom: 'Excel workbook / Current Opps' }
const state = () => ({ role: 'LJS', opportunities: [opportunity], sales: { fy: 'FY 2026-27', targets: {}, orders: [] }, poCompare: {} })
const details = { po: 'CUSTOMER-1', booked: '2026-10-10', valueK: 120, evidence: 'Reviewed signed PO in customer documents' }

test('closed outcomes never become bookings; Won without evidence awaits reconciliation', () => {
  const s = state()
  s.opportunities.push({ ...opportunity, id: 'B', stage: 'Lost' }, { ...opportunity, id: 'C', stage: 'No Bid' })
  assert.deepEqual(bookingRegister(s, { now }).orders, [])
  assert.deepEqual(bookingRegister(s, { now }).pending.map(o => o.id), ['A'])
  assert.equal(bookingRegister(s, { now }).complete, false)
})

test('reviewed historical booking uses verified date/value and remains unchanged on retry', () => {
  const booked = recordBooking(state(), 'A', details, now)
  assert.equal(bookingRegister(booked, { now }).orders[0].valueK, 120)
  assert.equal(bookingRegister(booked, { now }).orders[0].booked, '2026-10-10')
  assert.equal(bookingRegister(booked, { now }).complete, true)
  assert.equal(recordBooking(booked, 'A', { ...details, valueK: 300 }, now), booked)
  assert.equal(bookingRegister(booked, { owner: 'RS', now }).orders.length, 0)
})

test('booking rejects missing evidence, invalid dates/values, future dates and unauthorized actors', () => {
  for (const invalid of [{ po: '' }, { booked: '2026-02-30' }, { booked: '2026-10-13' }, { valueK: '' }, { valueK: -1 }, { valueK: Infinity }, { evidence: '' }]) {
    assert.throws(() => recordBooking(state(), 'A', { ...details, ...invalid }, now))
  }
  assert.throws(() => recordBooking({ ...state(), role: 'PP' }, 'A', details, now))
  assert.throws(() => recordBooking({ ...state(), opportunities: [{ ...opportunity, stage: 'Lost' }] }, 'A', details, now))
})

test('PO acceptance enforces both roles and resolution; simulation never books itself', () => {
  const s = { ...state(), opportunities: [{ ...opportunity, status: 'Open', stage: 'Negotiate' }], poCompare: { A: { oppId: 'A', simulated: true, acceptance: {}, lines: [{ resolved: true }], status: 'In review' } } }
  const unauthorized = { ...s, role: 'PP' }
  assert.equal(approvePurchaseOrder(unauthorized, 'A', now), unauthorized)
  const unresolved = { ...s, poCompare: { A: { ...s.poCompare.A, lines: [{ resolved: false }] } } }
  assert.equal(approvePurchaseOrder(unresolved, 'A', now), unresolved)
  const first = approvePurchaseOrder(s, 'A', now)
  assert.equal(first.poCompare.A.status, 'In review')
  const second = approvePurchaseOrder({ ...first, role: 'AH' }, 'A', now)
  assert.equal(second.poCompare.A.status, 'Accepted')
  assert.equal(bookingRegister(second, { now }).orders.length, 0)
  assert.throws(() => recordBooking(second, 'A', details, now))
  const staged = stagePODetails(second, 'A', details, now)
  assert.equal(staged.poCompare.A.acceptance.LJS, null)
  const booked = approvePurchaseOrder({ ...approvePurchaseOrder({ ...staged, role: 'LJS' }, 'A', now), role: 'AH' }, 'A', now)
  assert.equal(bookingRegister(booked, { now }).orders.length, 1)
  const withDetails = { ...s, poCompare: { A: { ...s.poCompare.A, simulated: false, bookingDetails: details } } }
  const accepted = approvePurchaseOrder({ ...approvePurchaseOrder(withDetails, 'A', now), role: 'AH' }, 'A', now)
  assert.equal(bookingRegister(accepted, { now }).orders[0].valueK, 120)
})

test('default targets require review while custom and explicitly confirmed targets survive', () => {
  const s = state()
  s.sales.targets = seedSales.targets
  assert.equal(targetPlan(s).needsConfirmation, true)
  assert.equal(targetPlan(s).annual, 0)
  s.sales.targets = { PP: { annual: 400, q: [100, 100, 100, 100] } }
  assert.equal(targetPlan(s).annual, 400)
  s.sales.targets = { PP: { ...seedSales.targets.PP, confirmedFy: s.sales.fy } }
  assert.equal(targetPlan(s, 'PP').annual, 36000)
  s.sales.fy = 'FY 2027-28'
  assert.equal(targetPlan(s, 'PP').annual, 0)
})

test('one booking feeds PO register, scoped performance and period filters without using estimated values', () => {
  const s = recordBooking({ ...state(), config: {}, approvals: [], proposals: {}, clarifications: [] }, 'A', details, now)
  s.sales.orders = [{ id: 'legacy-copy', oppId: 'A', customer: 'Customer', po: 'CUSTOMER-1', owner: 'PP', booked: details.booked, valueK: 120 }]
  assert.equal(bookingRegister(s, { now }).orders.length, 1)
  assert.equal(salesPerformance(s, 'PP', { now }).achieved, 120)
  assert.equal(dashboardModel(s, { period: 'q3', now }).perf.achieved, 120)
  assert.equal(dashboardModel(s, { period: 'q2', now }).perf.achieved, 0)
  assert.equal(dashboardModel(s, { owner: 'RS', period: 'q3', now }).perf.achieved, 0)
  s.sales.orders[0].oppId = undefined
  assert.equal(bookingRegister(s, { now }).orders.length, 1)
})

test('targets require authorized confirmation, matching quarter totals and an FY stamp', () => {
  const s = state()
  const confirmed = confirmSalesTarget(s, 'PP', { annual: 400, q: [100, 100, 100, 100] }, now)
  assert.equal(confirmed.sales.targets.PP.confirmedBy, 'LJS')
  assert.equal(confirmed.sales.targets.PP.confirmedFy, 'FY 2026-27')
  assert.throws(() => confirmSalesTarget(s, 'PP', { annual: 400, q: [100, 0, 0, 0] }, now))
  assert.throws(() => confirmSalesTarget({ ...s, role: 'PP' }, 'PP', { annual: 400, q: [100, 100, 100, 100] }, now))
})

test('newly Won opportunities require joint PO acceptance, including former open imports', () => {
  assert.throws(() => recordBooking({ ...state(), opportunities: [{ ...opportunity, importedFrom: undefined }] }, 'A', details, now))
  assert.throws(() => recordBooking({ ...state(), opportunities: [{ ...opportunity, bookingRequiresPO: true }] }, 'A', details, now))
})

test('global canonicalization precedes owner scope so duplicate copies do not inflate personal totals', () => {
  const s = { ...state(), opportunities: [], sales: { orders: [
    { ...details, id: 'B1', customer: 'Customer', owner: 'PP' },
    { ...details, id: 'B2', customer: 'Customer', owner: 'RS' },
  ] } }
  const total = owner => bookingRegister(s, { owner, now }).orders.reduce((sum, o) => sum + o.valueK, 0)
  assert.equal(total(), 120)
  assert.equal(total('PP') + total('RS'), total())
})

test('concurrent unrelated opportunity edits cannot erase or overwrite confirmed bookings', () => {
  const booked = recordBooking(state(), 'A', details, now).opportunities[0]
  assert.deepEqual(mergeOpportunityRow(booked, { ...opportunity, oppName: 'Edited title' }).booking, booked.booking)
  assert.deepEqual(mergeOpportunityRow(booked, { ...opportunity, booking: { valueK: 0 } }).booking, booked.booking)
})

test('deleting an opportunity retains its confirmed sale without duplicating the booking', () => {
  const booked = recordBooking(state(), 'A', details, now)
  const retained = retainBookingOnDelete(booked, 'A')
  assert.equal(bookingRegister(retained, { now }).orders.length, 1)
  assert.equal(retainBookingOnDelete(retained, 'A'), retained)
  assert.equal(bookingRegister({ ...retained, opportunities: [] }, { now }).orders[0].valueK, 120)
})

test('simulated handover cannot reclassify an open Excel import as historical booked business', () => {
  const source = readFileSync(new URL('../src/store.jsx', import.meta.url), 'utf8')
  const action = source.slice(source.indexOf('    approveHandover(oppId)'), source.indexOf('    setMilestone(oppId'))
  let s = { ...state(), opportunities: [{ ...opportunity, status: 'Open', stage: 'Negotiate' }],
    handover: { A: { approved: false } }, poCompare: { A: { status: 'Accepted', simulated: true,
      acceptance: { LJS: now.toISOString(), AH: now.toISOString() }, lines: [{ resolved: true }] } } }
  const api = new Function('setState', 'nowIST', 'withAudit', 'workflowTransition', `return ({${action}})`)(
    update => { s = update(s) }, () => now.toISOString(), next => next, (from, to, reason) => ({ from, to, reason }))
  api.approveHandover('A')
  assert.equal(s.opportunities[0].stage, 'Won')
  assert.equal(s.opportunities[0].bookingRequiresPO, true)
  assert.throws(() => recordBooking(s, 'A', details, now))
  assert.equal(bookingRegister(s, { now }).orders.length, 0)
})

test('a stale target save preserves archived confirmed bookings while keeping its target edit', () => {
  const confirmed = recordBooking(state(), 'A', details, now)
  const archived = retainBookingOnDelete(confirmed, 'A').sales
  const stale = { ...state().sales, targets: { PP: { annual: 400, q: [100, 100, 100, 100] } } }
  const rebased = mergeSalesBookings(archived, stale)
  assert.equal(rebased.orders[0].valueK, 120)
  assert.equal(rebased.targets.PP.annual, 400)
  const retry = mergeSalesBookings(archived, rebased)
  assert.equal(retry.orders.length, 1)
})
