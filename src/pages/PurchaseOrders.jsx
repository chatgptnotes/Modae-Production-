import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { canViewCommercial, isApprover, fmtLakh, ddMmmYY } from '../utils.js'
import { Chip, KpiCard, WarnBox } from '../ui.jsx'
import { Icon } from '../icons.jsx'

// Customer purchase orders: proposal-vs-PO validation queue plus the booked
// order book. Sales owners see their own opportunities; approvers/admins see
// the whole book (joint LJS+AH acceptance happens on the workbench PO tab).

const PO_TONE = { 'In review': 'state-Review', Accepted: 'state-Accepted', Rejected: 'state-Rejected' }
const ORDER_TONE = { Delivered: 'state-Accepted', Invoiced: 'state-Accepted' }

export default function PurchaseOrders() {
  const store = useStore()
  const nav = useNavigate()
  const role = store.role
  const comm = canViewCommercial(role)
  const approver = isApprover(role)

  const validating = Object.values(store.poCompare || {}).filter(pc => {
    if (approver) return true
    const o = store.opportunities.find(x => x.id === pc.oppId)
    return !!o && o.owner === role
  })
  const orders = (store.sales?.orders || []).filter(o => approver || o.owner === role)
  const totalK = orders.reduce((s, o) => s + (+o.valueK || 0), 0)

  const needsMe = (role === 'LJS' || role === 'AH')
    ? validating.filter(pc => pc.status !== 'Accepted' && pc.status !== 'Rejected' && !pc.acceptance?.[role])
    : []

  return (
    <div className="page">
      <h2>Purchase Orders</h2>
      <div className="hint" style={{ marginBottom: 10 }}>
        {approver
          ? 'Customer purchase orders across the book — validation, deviations and joint acceptance.'
          : 'Customer purchase orders for your own opportunities, plus your booked orders.'}
      </div>

      <div className="kpi-row">
        <KpiCard label={`Orders booked ${store.sales?.fy || ''}`} value={orders.length} hint="Booked orders visible to you" />
        <KpiCard label="Total booked value" value={comm ? fmtLakh(totalK) : <Icon name="lock" size={14} />}
          hint={comm ? 'Sum of booked order values' : 'Restricted — commercial data'} />
        <KpiCard label="POs in validation" value={validating.length} hint="Proposal-vs-PO comparisons in progress" />
      </div>

      {needsMe.length > 0 && (
        <WarnBox>
          {needsMe.length} PO{needsMe.length > 1 ? 's' : ''} waiting on your acceptance as {role} — joint LJS + AH sign-off required.
        </WarnBox>
      )}

      <div className="form-card" style={{ marginBottom: 14 }}>
        <div className="section-title">PO validation in progress</div>
        {validating.length === 0 && (
          <div className="hint">No purchase orders are in validation right now. Simulate PO receipt from an opportunity workbench.</div>
        )}
        {validating.length > 0 && (
          <div className="sheet-wrap">
            <table className="sheet">
              <thead>
                <tr>
                  <th>PO No.</th><th>Opportunity</th><th>Customer</th><th>Owner</th>
                  <th>Open issues</th><th>Status</th><th>Received</th>
                </tr>
              </thead>
              <tbody>
                {validating.map(pc => {
                  const o = store.opportunities.find(x => x.id === pc.oppId)
                  const blocking = pc.lines.filter(l => l.state === 'Blocking deviation' && !l.resolved).length
                  const review = pc.lines.filter(l => l.state === 'Review required' && !l.resolved).length
                  return (
                    <tr key={pc.oppId} style={{ cursor: 'pointer' }} onClick={() => nav(`/opp/${pc.oppId}/po`)}>
                      <td><b>{pc.poNo}</b></td>
                      <td><span className="oppid-link">{pc.oppId}</span> <span className="hint">{o?.oppName?.slice(0, 40)}</span></td>
                      <td>{o?.sellTo || '—'}</td>
                      <td>{o?.owner || '—'}</td>
                      <td>
                        {blocking > 0 && <span style={{ color: '#9c0006', fontWeight: 700 }}>{blocking} blocking</span>}
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
        )}
      </div>

      <div className="form-card">
        <div className="section-title">Booked orders</div>
        <div className="sheet-wrap">
          <table className="sheet">
            <thead>
              <tr>
                <th>Order</th>{approver && <th>Owner</th>}<th>Customer</th><th>Description</th>
                <th>Value</th><th>Customer PO</th><th>Status</th><th>Booked</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(o => (
                <tr key={o.id}>
                  <td><b>{o.id}</b></td>
                  {approver && <td>{o.owner}</td>}
                  <td>{o.customer}</td>
                  <td>{o.title}</td>
                  <td className="num">{comm ? fmtLakh(o.valueK) : <Icon name="lock" size={11} />}</td>
                  <td>{o.po}</td>
                  <td><Chip tone={ORDER_TONE[o.status] || 'grey'}>{o.status}</Chip></td>
                  <td>{ddMmmYY(o.booked)}</td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr><td colSpan={approver ? 8 : 7}><span className="hint">No purchase orders booked yet.</span></td></tr>
              )}
            </tbody>
          </table>
        </div>
        {!comm && <div className="hint" style={{ marginTop: 6 }}>Order values are restricted — commercial data (approvers/admin only).</div>}
      </div>
    </div>
  )
}
