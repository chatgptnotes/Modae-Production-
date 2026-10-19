import React, { useState } from 'react'
import { Modal } from '../../ui.jsx'
import { usePagedRows } from '../../ui/Pagination.jsx'
import { canSeePage, displayRole } from '../../utils.js'
import { displayOpportunityId } from '../../seed.js'
import { FY_QUARTERS } from '../../kpi.js'
import { dashboardDrilldown, drilldownMoney } from './drilldown.js'
import './drilldown.css'
import { DrilldownContext, drillClick, useDashboardDrilldown } from './drillInteraction.js'

export function PipelineCounts({ model }) {
  const open = useDashboardDrilldown()
  if (!open) return model.opportunitySummary
  return <>{[['all', 'total'], ['Open', 'open'], ['Closed', 'closed']].map(([status, key], index) => <React.Fragment key={key}>
    {index > 0 && ' · '}<span {...drillClick(open && (() => open({ kind: 'pipeline', status })), `View ${key} pipeline opportunities`)}>{model.opportunityCounts[key]} {key}</span>
  </React.Fragment>)}</>
}

export function DashboardDrilldownProvider({ model, showMoney, period, scope, owner, store, nav, children }) {
  const [selection, setSelection] = useState(null)
  return <DrilldownContext.Provider value={setSelection}>
    {children}
    {selection && <DrilldownDialog {...{ model, selection, showMoney, period, scope, owner, store, nav }} onClose={() => setSelection(null)} />}
  </DrilldownContext.Provider>
}

function DrilldownDialog({ model, selection, showMoney, period, scope, owner, store, nav, onClose }) {
  const result = dashboardDrilldown(model, selection, { showMoney, period })
  const resetKey = JSON.stringify([selection, scope, owner, period, result.rows])
  const { pagedRows, pagination } = usePagedRows(result.rows, resetKey)
  const roles = store.roles || store.role
  const canOpen = canSeePage(roles, 'tracker', store.config)
  const openOpp = opp => { onClose(); nav(`/opp/${opp.id}`) }
  const valueVisible = showMoney && result.type !== 'approvals'
  const context = `${scope === 'my' ? 'My View' : 'Global View'}${scope !== 'my' && owner && owner !== 'all' ? ` · ${owner}` : ''}`
  return <Modal title={result.title} onClose={onClose} wide className="dashboard-drilldown">
    <p className="dashboard-drilldown-context">{context}{['actual', 'target', 'gap'].includes(selection.kind) && ` · ${period === 'all' ? 'All history' : period === 'fy' ? 'YTD' : period.toUpperCase()} · ${store.sales?.fy || 'Current FY'}`}</p>
    {result.description && <p className="dashboard-drilldown-description">{result.description}</p>}
    <div className="dashboard-drilldown-summary"><strong>{result.rows.length} {result.type === 'approvals' ? 'requests' : result.type === 'calculation' ? 'owners' : 'opportunities'}</strong>
      {result.totalValueK !== null && <span>{result.type === 'calculation' ? 'Target' : 'Total'}: <strong>{drilldownMoney(result.totalValueK)}</strong></span>}</div>
    {result.type === 'calculation' ? <div className="dashboard-drilldown-table-wrap"><table className="dashboard-drilldown-table"><thead><tr><th>Owner</th>{FY_QUARTERS.map(label => <th key={label}>{label}</th>)}<th>Total</th><th>Status</th></tr></thead>
      <tbody>{pagedRows.map(row => <tr key={row.key}><td>{displayRole(row.owner)}</td>{row.quarters.map((value, index) => <td key={index}>{drilldownMoney(value)}</td>)}<td>{drilldownMoney(row.valueK)}</td><td>{row.detail}</td></tr>)}</tbody></table></div>
      : <div className="dashboard-drilldown-table-wrap"><table className={`dashboard-drilldown-table dashboard-drilldown-records${valueVisible ? ' has-value' : ''}`}><thead><tr><th>Opportunity</th><th>Customer / Name</th><th>Owner</th><th>Stage</th>{valueVisible && <th>{selection.kind === 'actual' ? 'Contribution' : 'Value'}</th>}<th>Details</th><th>Action</th></tr></thead>
        <tbody>{pagedRows.map(row => <tr key={row.key}>
          <td data-label="Opportunity">{row.opp ? displayOpportunityId(row.opp.id) : 'Unlinked request'}</td>
          <td data-label="Customer / Name">{row.opp ? <>{row.opp.sellTo || row.opp.oppName || 'Untitled opportunity'}{row.opp.sellTo && row.opp.oppName && <small>{row.opp.oppName}</small>}</> : 'Workspace approval'}</td>
          <td data-label="Owner">{displayRole(row.opp?.owner || row.owner) || 'Unassigned'}</td><td data-label="Stage">{row.opp?.stage || '—'}</td>
          {valueVisible && <td data-label={selection.kind === 'actual' ? 'Contribution' : 'Value'}>{drilldownMoney(row.valueK)}</td>}
          <td data-label="Details">{row.detail || '—'}</td><td data-label="Action">{row.opp && canOpen ? <button type="button" className="dashboard-text-action" onClick={() => openOpp(row.opp)}>Open opportunity</button>
            : row.approval && canSeePage(roles, 'approvals', store.config) ? <button type="button" className="dashboard-text-action" onClick={() => { onClose(); nav('/approvals') }}>View approvals</button> : '—'}</td>
        </tr>)}</tbody></table></div>}
    {!result.rows.length && <p className="dashboard-drilldown-empty">{result.type === 'calculation' ? 'No target breakdown available for this view.' : 'No matching records in this view.'}</p>}
    {pagination}
  </Modal>
}
