import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { ROLES } from '../seed.js'
import { readiness, isBlocked } from '../gates.js'
import { isApprover, canViewCommercial, fmt, ddMmmYY } from '../utils.js'
import { AI_MAP } from '../aimapData.js'
import { Icon } from '../icons.jsx'

const roleLabel = role => ROLES[role]?.label || role

function Metric({ label, value, hint, tone = '' }) {
  return <div className={`stat-card-v2 tone-${tone}`}><span className="sc-value">{value}</span><span className="sc-label">{label}</span>{hint && <span className="hint">{hint}</span>}</div>
}

export default function MyDashboard() {
  const store = useStore()
  const nav = useNavigate()
  const role = store.role
  const isSales = !!ROLES[role] && !isApprover(role) && !ROLES[role].admin && !ROLES[role].commercial
  const opportunities = isSales
    ? store.opportunities.filter(o => o.owner === role)
    : store.opportunities
  const open = opportunities.filter(o => o.status === 'Open')
  const pendingApprovals = store.approvals.filter(a => a.status === 'Pending' && (isSales ? a.requestedBy === role : true))
  const pendingConditions = store.approvals.filter(a => a.status === 'Approved with conditions' && (a.conditions || []).some(c => !c.incorporated))
  const leads = store.leads.filter(l => !isSales || (l.assignedOwner || l.suggestedOwner) === role)
  const newLeads = leads.filter(l => l.status === 'New')
  const blocked = open.map(o => ({ opp: o, blockers: readiness(o, store.getProposal(o.id), store) }))
    .filter(x => isBlocked(x.blockers))
  const unproposed = open.filter(o => !o.proposalDate)
  const liveAi = AI_MAP.flatMap(g => g.items).filter(i => i.live).length
  const allAi = AI_MAP.flatMap(g => g.items).length

  const nextActions = open
    .map(o => {
      const blockers = readiness(o, store.getProposal(o.id), store)
      const blocker = blockers.find(b => b.severity === 'block' || b.severity === 'wait')
      return { opp: o, text: blocker?.text || (o.nextActionOwner ? `Follow up with ${o.nextActionOwner}` : 'Review opportunity and update next action') }
    })
    .sort((a, b) => (b.opp.lastUpdated || '').localeCompare(a.opp.lastUpdated || ''))
    .slice(0, 6)

  return (
    <div className="page">
      <div className="home-head">
        <div>
          <h2>My Dashboard</h2>
          <p className="hint">{roleLabel(role)} · role-specific work queue and next actions</p>
        </div>
        <button onClick={() => nav('/home')}><Icon name="home" size={13} /> Home</button>
      </div>

      <div className="stat-cards">
        <Metric label="Open opportunities" value={open.length} tone="sky" />
        <Metric label={isSales ? 'My pending approvals' : 'Pending approvals'} value={pendingApprovals.length} tone={pendingApprovals.length ? 'amber' : 'green'} />
        <Metric label="Blockers" value={blocked.length} tone={blocked.length ? 'red' : 'green'} />
        <Metric label={isSales ? 'New leads' : 'Open leads'} value={newLeads.length} tone="violet" />
      </div>

      <div className="ana-grid">
        <section className="ana-card c-6">
          <div className="ana-title">Next best actions</div>
          {nextActions.map(({ opp, text }) => (
            <button key={opp.id} className="dashboard-action" onClick={() => nav(`/opp/${opp.id}`)}>
              <span><b>{opp.id}</b> — {opp.oppName}</span>
              <span className="hint">{text}</span>
            </button>
          ))}
          {!nextActions.length && <p className="hint">No open opportunities require action.</p>}
        </section>

        <section className="ana-card c-6">
          <div className="ana-title">Proposal and approval status</div>
          <table className="cost-table" style={{ width: '100%' }}>
            <tbody>
              <tr><td>Without proposal</td><td className="num">{unproposed.length}</td></tr>
              <tr><td>Blocked opportunities</td><td className="num">{blocked.length}</td></tr>
              <tr><td>Conditions awaiting confirmation</td><td className="num">{pendingConditions.length}</td></tr>
              <tr><td>Latest update</td><td className="num">{ddMmmYY(open[0]?.lastUpdated) || '—'}</td></tr>
            </tbody>
          </table>
          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => nav('/approvals')}>Open approvals</button>
            <button onClick={() => nav('/my')}>Open opportunities</button>
          </div>
        </section>

        <section className="ana-card c-6">
          <div className="ana-title">Lead queue</div>
          {newLeads.slice(0, 5).map(l => (
            <button key={l.id} className="dashboard-action" onClick={() => nav(`/inbox/${l.id}`)}>
              <span><b>{l.id}</b> — {l.subject}</span>
              <span className="hint">{l.route || l.parse?.oppType || 'Unclassified'} · {l.suggestedOwner || 'Unassigned'}</span>
            </button>
          ))}
          {!newLeads.length && <p className="hint">No new leads in your queue.</p>}
          {newLeads.length > 5 && <button onClick={() => nav('/inbox')}>View all {newLeads.length} leads</button>}
        </section>

        <section className="ana-card c-6">
          <div className="ana-title">Automation coverage</div>
          <p><b>{liveAi}</b> live AI automations · <b>{allAi}</b> mapped interventions</p>
          <p className="hint">Use the AI &amp; Automation page to open each demonstration and review its status.</p>
          <button onClick={() => nav('/aimap')}>Open AI &amp; Automation</button>
          {canViewCommercial(role) && <p className="hint" style={{ marginTop: 8 }}>Open pipeline value: ₹ {fmt(open.reduce((s, o) => s + (+o.valueK || 0), 0))}K</p>}
        </section>
      </div>
    </div>
  )
}
