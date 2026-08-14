import React, { useState } from 'react'
import { useStore } from '../store.jsx'
import { canPriceProposal, fmt } from '../utils.js'
import { Chip } from '../ui.jsx'
import { Icon } from '../icons.jsx'

const DEFAULT_EST = {
  sheet: 'India', workDays: 1, travelDays: 1, dailyHours: 8, otHours: 0,
  weekendDays: 0, standbyDays: 0, engineer: '', mobilisation: '', toolsCerts: '',
  travelConfirmed: false,
}

const NUM_FIELDS = [
  ['workDays', 'Working days'], ['travelDays', 'Travel days'], ['dailyHours', 'Daily hours'],
  ['otHours', 'Overtime hours'], ['weekendDays', 'Weekend days'], ['standbyDays', 'Standby days'],
]

// Reactive-service workbench: rate-sheet driven cost build-up with the manual
// travel-estimate confirmation gate.
export default function WbService({ opp, openBuilder }) {
  const store = useStore()
  const comm = canPriceProposal(store.role)
  const est = store.svcEstimates.find(e => e.oppId === opp.id) || { oppId: opp.id, ...DEFAULT_EST }
  const sheet = est.sheet === 'International' ? 'International' : 'India'
  const rs = store.rateSheets[sheet]
  const r = rs.rates
  const [sent, setSent] = useState(false)
  const [requested, setRequested] = useState(false)

  const upd = patch => store.updateSvcEstimate(opp.id, patch)

  // India rates are K INR / day; International are USD.
  const nights = (est.workDays || 0) + (est.travelDays || 0) + (est.standbyDays || 0)
  const rows = [
    ['Engineer days', (est.workDays || 0) * r.engineerDay],
    ['Travel days', (est.travelDays || 0) * r.travelDay],
    ['Overtime hours', (est.otHours || 0) * r.otHour],
    [`Weekend premium (${r.weekendPct}%)`, (est.weekendDays || 0) * r.seniorDay * r.weekendPct / 100],
    ['Standby days', (est.standbyDays || 0) * r.standbyDay],
    ['Flights (return)', 2 * r.flight],
    ['Hotel', nights * r.hotelNight],
    ['Local transport', ((est.workDays || 0) + (est.travelDays || 0)) * r.transportDay],
    ['Per diem', nights * r.perDiem],
    ['Tools & consumables', r.tools],
  ]
  const subtotal = rows.reduce((s, x) => s + x[1], 0)
  const gst = Math.round(subtotal * rs.gst) / 100
  const total = subtotal + gst
  const money = v => (sheet === 'India' ? `₹ ${fmt(v)}K` : `$ ${fmt(v)}`)

  const requestResources = () => {
    store.requestApproval({
      oppId: opp.id, type: 'Resource feasibility', approver: 'AH', needed: ['AH'],
      detail: `${opp.oppName} — ${est.workDays || 0} work days + ${est.travelDays || 0} travel days on the ${sheet} rate sheet; engineer ${est.engineer || 'TBC'}.`,
    })
    setRequested(true)
  }

  const sendToProposal = () => {
    const p = store.getProposal(opp.id)
    const listPrice = sheet === 'India' ? Math.round(total * 1000) : Math.round(total)
    store.saveProposal(opp.id, {
      ...p,
      bom: [...(p.bom || []), {
        itemCategory: 'Service', pn: 'SVC-REACTIVE',
        desc: `Reactive service — ${est.workDays || 0} days on site`,
        listPrice, adders: [], qtyPerUnit: 0, common: 1, spares: 0, quoted: '',
        list: 'Ad-hoc', currency: rs.currency,
      }],
    })
    setSent(true)
  }

  return (
    <div className="ana-grid">
      <div className="ana-card c-6">
        <div className="ana-title">Service estimate — inputs</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10 }}>
          <span className="hint">Rate sheet</span>
          {['India', 'International'].map(m => (
            <button key={m} className={sheet === m ? 'primary' : ''} onClick={() => upd({ sheet: m })}>{m}</button>
          ))}
          <span className="hint">currency {rs.currency}, GST {rs.gst}%</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {NUM_FIELDS.map(([k, label]) => (
            <label key={k} style={{ fontSize: 12 }}>
              {label}
              <input type="number" min="0" value={est[k] ?? 0} style={{ width: '100%' }}
                onChange={e => upd({ [k]: Math.max(0, +e.target.value || 0) })} />
            </label>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
          <label style={{ fontSize: 12 }}>
            Engineer
            <input value={est.engineer || ''} style={{ width: '100%' }} placeholder="Name / availability"
              onChange={e => upd({ engineer: e.target.value })} />
          </label>
          <label style={{ fontSize: 12 }}>
            Mobilisation date
            <input type="date" value={est.mobilisation || ''} style={{ width: '100%' }}
              onChange={e => upd({ mobilisation: e.target.value })} />
          </label>
        </div>
        <label style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
          Tools / certifications
          <input value={est.toolsCerts || ''} style={{ width: '100%' }} placeholder="e.g. balancing kit, permits"
            onChange={e => upd({ toolsCerts: e.target.value })} />
        </label>
        <div className="check-row" style={{ marginTop: 10 }}>
          <input type="checkbox" checked={!!est.travelConfirmed}
            onChange={e => upd({ travelConfirmed: e.target.checked })} />
          <span>Confirm manual travel estimate</span>
          {est.travelConfirmed
            ? <Chip tone="state-Accepted">Confirmed</Chip>
            : <Chip tone="state-Blocks">Blocks readiness</Chip>}
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={requestResources}>
            <Icon name="users" size={13} /> Request AH approval for resources
          </button>
        </div>
        {requested && <div className="okbox">Resource feasibility request sent to AH — track it on the Approvals tab.</div>}
      </div>

      <div className="ana-card c-6">
        <div className="ana-title">Cost build-up ({rs.currency})</div>
        {comm ? (
          <table className="cost-table" style={{ width: '100%' }}>
            <tbody>
              {rows.map(([label, v]) => (
                <tr key={label}><td>{label}</td><td className="num">{money(v)}</td></tr>
              ))}
              <tr><td><b>Subtotal</b></td><td className="num"><b>{money(subtotal)}</b></td></tr>
              <tr><td>GST {sheet === 'India' ? '(18%)' : '(0% — export of services)'}</td><td className="num">{money(gst)}</td></tr>
              <tr className="total"><td>Customer-facing total</td><td className="num">{money(total)}</td></tr>
            </tbody>
          </table>
        ) : (
          <div className="restricted"><Icon name="lock" size={12} /> Cost build-up and rates restricted — sales owners, approvers and admin only</div>
        )}
        <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="primary" onClick={sendToProposal}>
            <Icon name="arrowRight" size={13} /> Send scope to proposal
          </button>
          <span className="hint">Adds one service line to the workbook BoM.</span>
        </div>
        {sent && (
          <div className="okbox">
            Service scope added to the proposal BoM.{' '}
            <a style={{ cursor: 'pointer' }} onClick={openBuilder}>Open the proposal builder</a>
          </div>
        )}
      </div>
    </div>
  )
}
