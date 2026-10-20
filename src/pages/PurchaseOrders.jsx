import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { displayOpportunityId } from '../seed.js'
import { canViewCommercial, isApprover, fmtLakh, ddMmmYY, displayRole } from '../utils.js'
import { Chip, WarnBox } from '../ui.jsx'
import { Icon } from '../icons.jsx'
import { useWorkspaceView } from '../ui/WorkspaceViewContext.jsx'
import { usePagedRows } from '../ui/Pagination.jsx'
import { useViewportPageSize } from '../ui/useViewportPageSize.js'
import usePhoneLayout from '../tablet/usePhoneLayout.js'
import './purchaseOrders.css'
import { bookingRegister, businessDate, historicalWin } from '../orderBookings.js'
import BookingReview from '../BookingReview.jsx'
import { WorkspaceRecordBoundary } from '../ui/WorkspaceSync.jsx'

// Customer purchase orders: proposal-vs-PO validation queue plus the booked
// order book. Sales owners see their own opportunities; approvers/admins see
// the whole book (joint LJS+AH acceptance happens on the workbench PO tab).

const PO_TONE = { 'In review': 'state-Review', Accepted: 'state-Accepted', Rejected: 'state-Rejected' }
const ORDER_TONE = { Delivered: 'state-Accepted', Invoiced: 'state-Accepted' }

function OrderStat({ label, value, detail }) {
  return <div className="purchase-order-stat">
    <strong className="proposal-sent-stat-value">{value}</strong>
    <span className="proposal-sent-stat-label">{label}</span>
    <span className="proposal-sent-stat-detail">{detail}</span>
  </div>
}

function LoadedBookingReview({ id }) {
  const store = useStore(), ref = useRef(store)
  ref.current = store
  const [status, setStatus] = useState('loading')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    void ref.current.loadOpportunityDetails(id).then(ok => { if (active) setStatus(ok ? 'ready' : 'error') })
      .catch(() => { if (active) setStatus('error') })
    return () => { active = false }
  }, [id, retry])
  const opp = store.loadedOpportunity(id)
  if (status === 'error') return <p role="alert">Could not load booking details. <button onClick={() => setRetry(n => n + 1)}>Retry</button></p>
  if (status !== 'ready') return <p role="status">Loading booking details…</p>
  if (!opp) return <p role="alert">This opportunity is unavailable.</p>
  return <WorkspaceRecordBoundary records={[{ entity: 'opportunities', id }]}><BookingReview store={store} opp={opp} /></WorkspaceRecordBoundary>
}

export default function PurchaseOrders() {
  const store = useStore()
  const [openedReviews, setOpenedReviews] = useState(new Set())
  const narrow = usePhoneLayout()
  const phone = narrow && store.viewMode === 'tablet'
  const nav = useNavigate()
  const { scope } = useWorkspaceView()
  const role = store.role
  const comm = canViewCommercial(role)
  const approver = isApprover(role)

  const validating = Object.values(store.poCompare || {}).filter(pc => {
    if (approver && scope === 'global') return true
    const o = store.opportunities.find(x => x.id === pc.oppId)
    return !!o && o.owner === role
  })
  const register = bookingRegister(store, { owner: scope === 'global' && approver ? null : role })
  const today = businessDate()
  const year = Number(String(store.sales?.fy || '').match(/20\d{2}/)?.[0]) || (Number(today.slice(5, 7)) >= 4 ? Number(today.slice(0, 4)) : Number(today.slice(0, 4)) - 1)
  const orders = register.orders.filter(o => o.booked >= `${year}-04-01` && o.booked < `${year + 1}-04-01`)
  const validationRef = useRef(null)
  const ordersRef = useRef(null)
  const validationFit = useViewportPageSize(validating.length, { enabled: !phone && validating.length > 0, rootRef: validationRef })
  const ordersFit = useViewportPageSize(orders.length, { enabled: !phone, rootRef: ordersRef })
  const { pagedRows: pageValidating, pagination: validatingPagination } = usePagedRows(validating, JSON.stringify([scope, role]), phone ? 10 : validationFit.pageSize, validationFit.pagerRef)
  const { pagedRows: pageOrders, pagination: ordersPagination } = usePagedRows(orders, JSON.stringify([scope, role]), phone ? 10 : ordersFit.pageSize, ordersFit.pagerRef)
  const totalK = orders.reduce((s, o) => s + (+o.valueK || 0), 0)

  const needsMe = (role === 'LJS' || role === 'AH')
    ? validating.filter(pc => pc.status !== 'Accepted' && pc.status !== 'Rejected' && !pc.acceptance?.[role])
    : []

  return (
    <div className="page purchase-orders-page">
      <div className="proposal-sent-head">
        <div>
          <h2 className="workspace-page-title workspace-page-title--topbar-duplicate"><Icon name="clipboardCheck" size={18} /> Purchase Orders</h2>
          <p className="hint">
            {approver && scope === 'global'
              ? 'Customer purchase orders across the book — validation, deviations and joint acceptance.'
              : 'Customer purchase orders for your own opportunities, plus your booked orders.'}
          </p>
        </div>
        <div className="proposal-sent-head-actions">
          <span className="proposal-sent-scope">{approver && scope === 'global' ? 'Company purchase orders' : 'My purchase orders'}</span>
          <button type="button" className="primary" onClick={() => nav('/opportunities')}><Icon name="cards" size={13} /> Open opportunities</button>
        </div>
      </div>

      <div className="proposal-sent-stats purchase-orders-stats" aria-label="Purchase order summary">
        <OrderStat label={`Orders booked ${store.sales?.fy || ''}`} value={orders.length} detail="Booked orders visible to you" />
        <OrderStat label="Total booked value (₹)" value={comm ? fmtLakh(totalK) : '—'}
          detail={comm ? 'Confirmed bookings in the configured FY' : 'Restricted — commercial data'} />
        <OrderStat label="POs in validation" value={validating.length} detail="Proposal-vs-PO comparisons in progress" />
      </div>

      {!register.complete && <div className="purchase-orders-alert" role="status">
        <Icon name="clipboardCheck" size={18} />
        <div><strong>Booking verification needed</strong><p>{register.pending.length} opportunities await verification{register.invalid.length > 0 ? ` · ${register.invalid.length} existing booking records need correction` : ''}. Totals include verified bookings only.</p></div>
      </div>}
      {register.pending.length > 0 && <section className="proposal-sent-register purchase-orders-verification" aria-labelledby="booking-verification-title">
        <div className="proposal-sent-section-head">
          <div><h3 id="booking-verification-title">Awaiting booking verification</h3><p className="hint">Verify the customer commitment before it counts as a booked order.</p></div>
          <span className="proposal-sent-count">{register.pending.length} pending</span>
        </div>
        {register.pending.map(opp => <details className="purchase-order-review" key={opp.id} onToggle={event => { if (event.currentTarget.open) setOpenedReviews(previous => new Set([...previous, opp.id])) }}>
          <summary>
            <span className="purchase-order-chevron" aria-hidden="true">›</span>
            <span className="purchase-order-customer"><strong>{opp.sellTo || opp.oppName || 'Customer not recorded'}</strong><span>{displayOpportunityId(opp.id)}{opp.sellTo && opp.oppName && opp.sellTo !== opp.oppName ? ` · ${opp.oppName}` : ''}</span></span>
            <span className="purchase-order-pending">Pending verification</span>
          </summary>
          <div className="purchase-order-review-body">{historicalWin(opp) ? (openedReviews.has(opp.id) ? <LoadedBookingReview id={opp.id} /> : null) : <button type="button" onClick={() => nav(`/opp/${opp.id}/po`)}>Review customer PO and joint acceptance</button>}</div>
        </details>)}
      </section>}

      {needsMe.length > 0 && (
        <WarnBox>
          {needsMe.length} PO{needsMe.length > 1 ? 's' : ''} waiting on your acceptance as {displayRole(role)} — joint LJS + AH sign-off required.
        </WarnBox>
      )}

      <section className="proposal-sent-register" ref={validationRef} aria-labelledby="order-validation-title">
        <div className="proposal-sent-section-head">
          <div><h3 id="order-validation-title">PO validation in progress</h3><p className="hint">Review customer PO deviations and complete joint acceptance.</p></div>
          <span className="proposal-sent-count">{validating.length} in validation</span>
        </div>
        {validating.length === 0 && (
          <div className="hint purchase-orders-note">No purchase orders currently need validation.</div>
        )}
        {validating.length > 0 && (
          <>
          {phone ? <section aria-label="Orders in validation">{pageValidating.map(pc => { const opp = store.opportunities.find(o => o.id === pc.oppId); return <button className="phone-record" key={pc.oppId} onClick={() => nav(`/opp/${pc.oppId}/po`)}><strong>{opp?.sellTo || pc.poNo}</strong><span>{pc.poNo} · {pc.status}</span><small>{pc.lines.filter(line => !line.resolved && ['Blocking deviation', 'Review required'].includes(line.state)).length} unresolved issues · {displayRole(opp?.owner)}</small></button> })}</section> : <div className="sheet-wrap">
            <table className="sheet proposal-sent-table">
              <thead>
                <tr>
                  <th>PO No.</th><th>Opportunity</th><th>Customer</th><th>Owner</th>
                  <th>Open issues</th><th>Status</th><th>Received</th>
                </tr>
              </thead>
              <tbody ref={validationFit.listRef}>
                {pageValidating.map(pc => {
                  const o = store.opportunities.find(x => x.id === pc.oppId)
                  const blocking = pc.lines.filter(l => l.state === 'Blocking deviation' && !l.resolved).length
                  const review = pc.lines.filter(l => l.state === 'Review required' && !l.resolved).length
                  return (
                    <tr key={pc.oppId} style={{ cursor: 'pointer' }} onClick={() => nav(`/opp/${pc.oppId}/po`)}>
                      <td><b>{pc.poNo}</b></td>
                      <td><span className="oppid-link">{displayOpportunityId(pc.oppId)}</span> <span className="hint">{o?.oppName?.slice(0, 40)}</span></td>
                      <td>{o?.sellTo || '—'}</td>
                      <td>{displayRole(o?.owner) || '—'}</td>
                      <td>
                        {blocking > 0 && <span style={{ color: 'var(--lost-text)', fontWeight: 700 }}>{blocking} blocking</span>}
                        {blocking > 0 && review > 0 && ' · '}
                        {review > 0 && <span>{review} to review</span>}
                        {blocking === 0 && review === 0 && <span className="hint">All lines resolved</span>}
                      </td>
                      <td><Chip tone={PO_TONE[pc.status] || 'grey'}>{pc.status}</Chip></td>
                      <td>{pc.received ? ddMmmYY(pc.received) : 'Not received'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          }
          {validatingPagination}
          </>
        )}
      </section>

      <section className="proposal-sent-register" ref={ordersRef} aria-labelledby="booked-orders-title">
        <div className="proposal-sent-section-head">
          <div><h3 id="booked-orders-title">Booked orders</h3><p className="hint">Confirmed customer commitments in {store.sales?.fy || 'the current FY'}; Lost, No Bid and other closed outcomes are excluded.</p></div>
          <span className="proposal-sent-count">{orders.length} orders</span>
        </div>
        {orders.length === 0 ? <div className="hint purchase-orders-note">No confirmed bookings in this financial year. Verified orders will appear here.</div> : phone ? <section aria-label="Booked orders">{pageOrders.map(o => <button className="phone-record" key={o.id} onClick={() => o.oppId && nav(`/opp/${o.oppId}/po`)}><strong>{o.customer}</strong><span>{o.title}</span><small>{displayOpportunityId(o.oppId || o.id)} · {o.status} · {ddMmmYY(o.booked)}{comm ? ` · ${fmtLakh(o.valueK)}` : ''}</small></button>)}</section> : <div className="sheet-wrap">
          <table className="sheet proposal-sent-table">
            <thead>
              <tr>
                <th>Order</th>{approver && <th>Owner</th>}<th>Customer</th><th>Description</th>
                <th>Value (₹)</th><th>Customer PO</th><th>Status</th><th>Booked</th>
              </tr>
            </thead>
            <tbody ref={ordersFit.listRef}>
              {pageOrders.map(o => (
                <tr key={o.id}>
                  <td><b>{displayOpportunityId(o.oppId || o.id)}</b></td>
                  {approver && <td>{displayRole(o.owner)}</td>}
                  <td>{o.customer}</td>
                  <td>{o.title}</td>
                  <td className="num">{comm ? fmtLakh(o.valueK) : '—'}</td>
                  <td>{o.po}</td>
                  <td><Chip tone={ORDER_TONE[o.status] || 'grey'}>{o.status}</Chip></td>
                  <td>{ddMmmYY(o.booked)}</td>
                </tr>
              ))}

            </tbody>
          </table>
        </div>
        }
        {ordersPagination}
        {!comm && <div className="hint purchase-orders-note">Order values are restricted — commercial data (approvers/admin only).</div>}
      </section>
    </div>
  )
}
