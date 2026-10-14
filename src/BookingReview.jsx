import React, { useState } from 'react'
import { bookingReviewer, businessDate } from './orderBookings.js'

export function WonValueNotice({ won, perf, period }) {
  return <div role="status" className="hint">
    {won.estimatedCount > 0 && <p>{won.estimatedCount} unverified Won {won.estimatedCount === 1 ? 'value uses an opportunity estimate' : 'values use opportunity estimates'}. Review in Purchase Orders.</p>}
    {period !== 'all' && (perf.targetNeedsConfirmation
      ? <p>Target requires confirmation. Review and save the FY targets in More reports &amp; settings.</p>
      : !perf.targetConfigured && <p>Target not configured for this financial year.</p>)}
  </div>
}

export default function BookingReview({ store, opp, mode = 'history' }) {
  const [draft, setDraft] = useState({ po: '', booked: '', valueK: '', evidence: '' })
  const [error, setError] = useState('')
  if (opp.booking) return <p className="hint">Booking confirmed: {opp.booking.po} · {opp.booking.booked}. The accepted value is recorded separately from the opportunity estimate.</p>
  if (!bookingReviewer(store.role)) return <p className="hint">Booking pending — LJS, AH or Admin must verify the customer commitment, actual booking date and accepted value.</p>
  const field = key => event => setDraft({ ...draft, [key]: event.target.value })
  const submit = event => {
    event.preventDefault()
    try {
      if (mode === 'po') store.setPOBookingDetails(opp.id, draft)
      else store.confirmOrderBooking(opp.id, draft)
      setError('')
    } catch (err) { setError(err.message) }
  }
  return <form onSubmit={submit} className="form-card">
    <h3>{mode === 'po' ? 'Verify customer PO booking details' : 'Confirm historical order booking'}</h3>
    <p className="hint">Verify the signed customer PO or contract. For historical Won opportunities, this is a review of an existing commitment. Enter the accepted net value excluding GST; convert foreign-currency orders to INR and record the exchange rate in the evidence note.</p>
    <div className="booking-review-fields" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
      <label>Customer PO / contract reference<input required value={draft.po} onChange={field('po')} name="booking-review-po" /></label>
      <label>Actual booking date<input required type="date" max={businessDate()} value={draft.booked} onChange={field('booked')} name="booking-review-booked" /></label>
      <label>Accepted net value (K₹)<input required type="number" min="0" step="any" value={draft.valueK} onChange={field('valueK')} name="booking-review-value-k" /></label>
      <label className="booking-review-evidence">Supporting document / evidence<input required value={draft.evidence} onChange={field('evidence')} placeholder="Document reference and verification notes" name="booking-review-evidence" /></label>
      <button className="primary" type="submit">{mode === 'po' ? 'Save PO details for joint acceptance' : 'Confirm booking'}</button>
    </div>
    {error && <p role="alert">{error}</p>}
    {mode === 'po' && <p className="hint">Saving these details resets both acceptance signatures. LJS and AH must accept the verified reference, date and value before an order is booked.</p>}
  </form>
}
