import React, { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Tracker from './Tracker.jsx'
import CreateOpportunity from './CreateOpportunity.jsx'
import { useStore } from '../store.jsx'
import { canSeePage } from '../utils.js'
import { Modal } from '../ui.jsx'
import { dashboardModel } from './myDashboard/model.js'
import WorkspaceInsights from '../ui/WorkspaceInsights.jsx'
import { useWorkspaceView } from '../ui/WorkspaceViewContext.jsx'

// One workspace for the related sales actions. The underlying pages stay
// separate so their existing filters, forms, and proposal handoff behavior do
// not drift; this component owns only navigation between them.
export default function Opportunities() {
  const store = useStore()
  const [params, setParams] = useSearchParams()
  const requested = params.get('tab')
  const requestedView = params.get('view')
  const canCreate = canSeePage(store.role, 'new')
  const { scope } = useWorkspaceView()
  const insightModel = useMemo(() => dashboardModel(store, { scope, period: 'all' }), [store, scope])
  const insightSignals = [
    { count: insightModel.decisions.length, label: 'decisions are waiting on you', tone: 'warning' },
    { count: insightModel.blocked.length, label: 'opportunities are blocked', tone: 'critical' },
    { count: insightModel.followups.length, label: 'follow-ups are due', tone: 'warning' },
  ]
  const [createOpen, setCreateOpen] = useState(requested === 'create')
  const stageStrip = (
    <section className="opportunity-stage-strip" aria-label="Pipeline stages">
      {insightModel.funnel.map(stage => <button type="button" key={stage.key} onClick={() => setParams({ stage: stage.stages.join(',') })}>
        <span>{stage.label}</span><b>{stage.count}</b>{canSeePage(store.role, 'analytics') && <small>{stage.valueK ? `₹${(stage.valueK / 100).toFixed(1)} L` : '—'}</small>}
      </button>)}
    </section>
  )
  return (
    <div className="page opportunities-page">
      <Tracker
        initialOwnerFilter={requestedView === 'all' || requested === 'all' ? 'All' : requestedView === 'my' || requested === 'my' ? store.role : undefined}
        onCreateOpportunity={canCreate ? () => setCreateOpen(true) : undefined}
        afterTable={<WorkspaceInsights signals={insightSignals} onRefresh={() => store.refreshSharedData()} />}
        topContent={stageStrip}
      />
      {createOpen && canCreate && (
        <Modal title="Create Opportunity" onClose={() => setCreateOpen(false)} wide className="opportunity-create-modal">
          <CreateOpportunity />
        </Modal>
      )}
    </div>
  )
}
