import { seedSales } from './seed.js'
import { isAdminRole } from './utils.js'

export const bookingReviewer = role => ['LJS', 'AH'].includes(role) || isAdminRole(role)
export const businessDate = (now = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(now)

export function validBookingDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

const validValue = value => value !== '' && value != null && Number.isFinite(Number(value)) && Number(value) >= 0
const cancelled = order => ['Cancelled', 'Rejected', 'Lost', 'No Bid', 'Abandoned'].includes(order.status)
const keyFor = order => order.oppId ? `opportunity:${order.oppId}` : `legacy:${order.id}`
const customerPO = order => `${String(order.customer || '').trim().toLowerCase()}|${String(order.po || '').trim().toLowerCase()}`
export const historicalWin = opp => opp.status === 'Closed' && opp.stage === 'Won'
  && /^Excel workbook\s*\//.test(String(opp.importedFrom || '')) && !opp.bookingRequiresPO

// A booking is a recorded customer commitment, never an inferred close date.
// Opportunity snapshots use the existing revision-aware persistence path.
export function bookingRegister(store, { owner = null, now = new Date() } = {}) {
  const today = businessDate(now)
  const opportunities = store.opportunities || []
  const snapshots = opportunities.filter(o => o.booking).map(o => ({ ...o.booking, oppId: o.id }))
  const orders = []
  const invalid = []
  const seen = new Set()
  const references = new Set()
  for (const order of [...snapshots, ...(store.sales?.orders || [])]) {
    const key = keyFor(order)
    const reference = order.customer && order.po ? customerPO(order) : null
    if (seen.has(key) || (reference && references.has(reference))) continue
    seen.add(key)
    if (reference) references.add(reference)
    if (cancelled(order)) continue
    if (!order.id || !order.owner || !String(order.po || '').trim() || !validBookingDate(order.booked) || !validValue(order.valueK)) {
      invalid.push(order)
      continue
    }
    if (order.booked > today) { invalid.push(order); continue }
    orders.push({ ...order, valueK: Number(order.valueK) })
  }
  const linked = new Set(orders.map(o => o.oppId || o.id))
  const pending = opportunities.filter(o => (!owner || o.owner === owner)
    && !o.booking && !linked.has(o.id)
    && ((o.status === 'Closed' && o.stage === 'Won') || store.poCompare?.[o.id]?.status === 'Accepted'))
  const scopedOrders = orders.filter(o => !owner || o.owner === owner)
  const scopedInvalid = invalid.filter(o => !owner || o.owner === owner)
  return { orders: scopedOrders, pending, invalid: scopedInvalid, complete: !pending.length && !scopedInvalid.length
    && (Array.isArray(store.sales?.orders) || snapshots.length > 0) }
}

export function recordBooking(store, oppId, details, now = new Date()) {
  if (!bookingReviewer(store.role)) throw new Error('Only LJS, AH or Admin may confirm a booking.')
  const opp = (store.opportunities || []).find(o => o.id === oppId)
  if (!opp) throw new Error('Opportunity no longer exists.')
  if (opp.booking) return store
  const po = store.poCompare?.[oppId]
  const historical = historicalWin(opp)
  const accepted = po?.status === 'Accepted' && !po.simulated && po.bookingDetails && po.acceptance?.LJS && po.acceptance?.AH
    && (po.lines || []).every(line => line.resolved)
  if (!historical && !accepted) throw new Error('Complete joint PO acceptance before booking this opportunity.')
  if (opp.status === 'Closed' && opp.stage !== 'Won') throw new Error('Lost and other closed outcomes cannot be booked.')
  if (!String(details.po || '').trim() || !String(details.evidence || '').trim()) throw new Error('Enter the customer PO/contract reference and supporting evidence.')
  if (!validBookingDate(details.booked) || details.booked > businessDate(now)) throw new Error('Enter a valid actual booking date, no later than today.')
  if (!validValue(details.valueK)) throw new Error('Enter a non-negative accepted order value in K₹, excluding GST.')
  if (!historical && ['po', 'booked', 'valueK', 'evidence'].some(key => String(details[key]).trim() !== String(po.bookingDetails[key]).trim())) {
    throw new Error('Booking details must match the jointly accepted customer PO.')
  }
  if (!opp.owner) throw new Error('Assign a salesperson before confirming the booking.')
  const duplicate = bookingRegister(store, { now }).orders.some(o => (o.oppId || o.id) === oppId
    || customerPO(o) === customerPO({ customer: opp.sellTo, po: details.po }))
  if (duplicate) throw new Error('This opportunity or customer PO already has a booking. Reconcile the existing record first.')
  const booking = { id: `BOOK-${oppId}`, oppId, owner: opp.owner, customer: opp.sellTo || '', title: opp.oppName || '',
    po: String(details.po).trim(), booked: details.booked, valueK: Number(details.valueK), status: 'Booked',
    evidence: String(details.evidence).trim(), confirmedBy: store.role, confirmedAt: now.toISOString(),
    source: historical ? 'reviewed-history' : 'accepted-po' }
  return { ...store, opportunities: store.opportunities.map(o => o.id === oppId ? { ...o, booking } : o) }
}

export function approvePurchaseOrder(store, oppId, now = new Date()) {
  const po = store.poCompare?.[oppId]
  if (!po || !['LJS', 'AH'].includes(store.role) || po.status === 'Rejected'
    || !(po.lines || []).every(line => line.resolved) || po.acceptance?.[store.role]) return store
  const acceptance = { ...po.acceptance, [store.role]: now.toISOString() }
  const both = acceptance.LJS && acceptance.AH
  let next = { ...store, poCompare: { ...store.poCompare, [oppId]: { ...po, acceptance, status: both ? 'Accepted' : po.status } } }
  if (both && po.bookingDetails && !po.simulated) next = recordBooking(next, oppId, po.bookingDetails, now)
  return next
}

export function stagePODetails(store, oppId, details, now = new Date()) {
  if (!bookingReviewer(store.role)) throw new Error('Only LJS, AH or Admin may verify customer PO details.')
  const opp = store.opportunities.find(o => o.id === oppId)
  const po = store.poCompare?.[oppId]
  if (!opp || !po || opp.booking) throw new Error('This PO cannot be changed after booking.')
  if (opp.status === 'Closed' && opp.stage !== 'Won') throw new Error('Lost and other closed outcomes cannot be booked.')
  if (!String(details.po || '').trim() || !String(details.evidence || '').trim()
    || !validBookingDate(details.booked) || details.booked > businessDate(now) || !validValue(details.valueK)) {
    throw new Error('Enter the real PO reference, actual booking date, net value and supporting evidence.')
  }
  const bookingDetails = { ...details, po: String(details.po).trim(), evidence: String(details.evidence).trim(), valueK: Number(details.valueK) }
  return { ...store, poCompare: { ...store.poCompare, [oppId]: { ...po, poNo: bookingDetails.po,
    bookingDetails, simulated: false, acceptance: { LJS: null, AH: null }, status: 'In review' } } }
}

// Preserve old custom targets; require review of untouched demo defaults.
export function targetPlan(store, owner = null) {
  const sales = store.sales || {}
  const targets = Object.entries(sales.targets || {}).filter(([key]) => !owner || key === owner)
  const plan = { annual: 0, q: [0, 0, 0, 0], needsConfirmation: false, configured: false, configuredCount: 0, ownerCount: 0, pendingCount: 0 }
  for (const [key, target] of targets) {
    plan.ownerCount += 1
    const seeded = seedSales.targets[key]
    const defaultValue = seeded && Number(target.annual) === seeded.annual
      && seeded.q.every((v, i) => Number(target.q?.[i]) === v)
    if ((target.confirmedFy && target.confirmedFy !== sales.fy) || (!store.demoData && defaultValue && target.confirmedFy !== sales.fy)) {
      plan.needsConfirmation = true
      plan.pendingCount += 1
      continue
    }
    if (!validValue(target.annual) || !Array.isArray(target.q) || target.q.length !== 4 || !target.q.every(validValue)) continue
    plan.configured = true
    plan.configuredCount += 1
    plan.annual += Number(target.annual)
    plan.q = plan.q.map((v, i) => v + Number(target.q[i]))
  }
  return plan
}

export function confirmSalesTarget(store, owner, { annual, q }, now = new Date()) {
  if (!bookingReviewer(store.role)) throw new Error('Only LJS, AH or Admin may confirm targets.')
  if (!owner || !store.sales?.fy || !validValue(annual) || !Array.isArray(q) || q.length !== 4 || !q.every(validValue)
    || Math.abs(q.reduce((sum, v) => sum + Number(v), 0) - Number(annual)) > 0.01) {
    throw new Error('Enter a valid FY target; all four quarters must add up to the annual target.')
  }
  return { ...store, sales: { ...store.sales, targets: { ...(store.sales?.targets || {}), [owner]: {
    annual: Number(annual), q: q.map(Number), confirmedFy: store.sales.fy, confirmedBy: store.role, confirmedAt: now.toISOString(),
  } } } }
}

// Deleting a workflow record must not silently reverse its confirmed sale.
export function retainBookingOnDelete(store, oppId) {
  const booking = store.opportunities.find(o => o.id === oppId)?.booking
  if (!booking || (store.sales?.orders || []).some(o => o.id === booking.id)) return store
  return { ...store, sales: { ...store.sales, orders: [...(store.sales?.orders || []), booking] } }
}

export function mergeSalesBookings(current = {}, incoming = {}) {
  const immutable = (current.orders || []).filter(o => o.confirmedAt && ['accepted-po', 'reviewed-history'].includes(o.source))
  const ids = new Set(immutable.map(o => o.id))
  return { ...incoming, orders: [...(incoming.orders || []).filter(o => !ids.has(o.id)), ...immutable] }
}
