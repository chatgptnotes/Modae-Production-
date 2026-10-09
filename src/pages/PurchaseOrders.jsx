import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { displayOpportunityId } from '../seed.js'
import { canViewCommercial, isApprover, fmtLakh, ddMmmYY, displayRole } from '../utils.js'
import { Chip, WarnBox } from '../ui.jsx'
import { Icon } from '../icons.jsx'
import { useWorkspaceView } from '../ui/WorkspaceViewContext.jsx'
import { usePagedRows } from '../ui/Pagination.jsx'
import usePhoneLayout from '../tablet/usePhoneLayout.js'
import './purchaseOrders.css'

// Customer purchase orders: proposal-vs-PO validation queue plus the booked
// order book. Sales owners see their own opportunities; approvers/admins see
// the whole book (joint LJS+AH acceptance happens on the workbench PO tab).

const PO_TONE = { 'In review': 'state-Review', Accepted: 'state-Accepted', Rejected: 'state-Rejected' }
const ORDER_TONE = { Delivered: 'state-Accepted', Invoiced: 'state-Accepted' }

function OrderStat({ label, value, detail }) {
  return <div className="proposal-sent-stat">
    <strong className="proposal-sent-stat-value">{value}</strong>
    <span className="proposal-sent-stat-label">{label}</span>
    <span className="proposal-sent-stat-detail">{detail}</span>
  </div>
}

export default function PurchaseOrders() {
  const store = useStore()
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
  // Closed opportunities are the source of truth for the order book. Keep the
  // legacy sales.orders rows as a compatibility fallback for older workspaces.
  const closedOpportunities = (store.opportunities || [])
    .filter(o => o.status === 'Closed' && (scope === 'global' ? (approver || o.owner === role) : o.owner === role))
    .map(o => ({
      id: o.id, owner: o.owner, customer: o.sellTo, title: o.oppName,
      valueK: o.valueK, po: o.stage === 'Won' ? 'Recorded on opportunity' : 'Closed opportunity',
      status: o.stage, booked: o.orderDate || o.lastUpdated || o.createDate,
    }))
  const legacyOrders = (store.sales?.orders || []).filter(o =>
    (scope === 'global' ? (approver || o.owner === role) : o.owner === role) && !closedOpportunities.some(closed => closed.id === o.id))
  const orders = [...closedOpportunities, ...legacyOrders]
  const { pagedRows: pageValidating, pagination: validatingPagination } = usePagedRows(validating, JSON.stringify([scope, role]))
  const { pagedRows: pageOrders, pagination: ordersPagination } = usePagedRows(orders, JSON.stringify([scope, role]))
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
          detail={comm ? 'Sum of booked order values' : 'Restricted — commercial data'} />
        <OrderStat label="POs in validation" value={validating.length} detail="Proposal-vs-PO comparisons in progress" />
      </div>

      {needsMe.length > 0 && (
        <WarnBox>
          {needsMe.length} PO{needsMe.length > 1 ? 's' : ''} waiting on your acceptance as {displayRole(role)} — joint LJS + AH sign-off required.
        </WarnBox>
      )}

      <section className="proposal-sent-register" aria-labelledby="order-validation-title">
        <div className="proposal-sent-section-head">
          <div><h3 id="order-validation-title">PO validation in progress</h3><p className="hint">Review customer PO deviations and complete joint acceptance.</p></div>
          <span className="proposal-sent-count">{validating.length} in validation</span>
        </div>
        {validating.length === 0 && (
          <div className="hint purchase-orders-note">No purchase orders are in validation right now. Simulate PO receipt from an opportunity workbench.</div>
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
              <tbody>
                {pageValidating.map(pc => {
                  const o = store.opportunities.find(x => x.id === pc.oppId)
                  const blocking = pc.lines.filter(l => l.state === 'Blocking deviation' && !l.resolved).length
                  const review = pc.lines.filter(l => l.state === 'Review required' && !l.resolved).length
                  return (
                    <tr key={pc.oppId} style={{ cursor: 'pointer' }} onClick={() => nav(`/opp/${pc.oppId}/po`)}>
                      <td><b>{pc.poNo}</b></td>
                      <td><span className="oppid-link">{pc.oppId}</span> <span className="hint">{o?.oppName?.slice(0, 40)}</span></td>
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

      <section className="proposal-sent-register" aria-labelledby="booked-orders-title">
        <div className="proposal-sent-section-head">
          <div><h3 id="booked-orders-title">Booked orders</h3><p className="hint">Customer purchase orders and closed opportunities visible in your current scope.</p></div>
          <span className="proposal-sent-count">{orders.length} orders</span>
        </div>
        {phone ? <section aria-label="Booked orders">{pageOrders.map(o => <button className="phone-record" key={o.id} onClick={() => nav(`/opp/${o.id}/po`)}><strong>{o.customer}</strong><span>{o.title}</span><small>{displayOpportunityId(o.id)} · {o.status} · {ddMmmYY(o.booked)}{comm ? ` · ${fmtLakh(o.valueK)}` : ''}</small></button>)}{!orders.length && <p>No purchase orders booked yet.</p>}</section> : <div className="sheet-wrap">
          <table className="sheet proposal-sent-table">
            <thead>
              <tr>
                <th>Order</th>{approver && <th>Owner</th>}<th>Customer</th><th>Description</th>
                <th>Value (₹)</th><th>Customer PO</th><th>Status</th><th>Booked</th>
              </tr>
            </thead>
            <tbody>
              {pageOrders.map(o => (
                <tr key={o.id}>
                  <td><b>{displayOpportunityId(o.id)}</b></td>
                  {approver && <td>{displayRole(o.owner)}</td>}
                  <td>{o.customer}</td>
                  <td>{o.title}</td>
                  <td className="num">{comm ? fmtLakh(o.valueK) : '—'}</td>
                  <td>{o.po}</td>
                  <td><Chip tone={ORDER_TONE[o.status] || 'grey'}>{o.status}</Chip></td>
                  <td>{ddMmmYY(o.booked)}</td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr><td colSpan={approver ? 9 : 8}><span className="hint">No purchase orders booked yet.</span></td></tr>
              )}
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
