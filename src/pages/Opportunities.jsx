import React, { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Tracker from './Tracker.jsx'
import CreateOpportunity from './CreateOpportunity.jsx'
import { Icon } from '../icons.jsx'
import { useStore } from '../store.jsx'
import { canSeePage } from '../utils.js'
import { Modal } from '../ui.jsx'

// One workspace for the related sales actions. The underlying pages stay
// separate so their existing filters, forms, and proposal handoff behavior do
// not drift; this component owns only navigation between them.
export default function Opportunities() {
  const store = useStore()
  const [params] = useSearchParams()
  const requested = params.get('tab')
  const requestedView = params.get('view')
  const canCreate = canSeePage(store.role, 'new')
  const [createOpen, setCreateOpen] = useState(requested === 'create')
  return (
    <div className="page opportunities-page">
      <div className="opportunities-head">
        <div>
          <div className="eyebrow">Sales workspace</div>
          <h2>Opportunities</h2>
          <p className="hint">Manage your pipeline, register an opportunity, or turn an RFQ into a proposal from one place.</p>
        </div>
        <div className="opportunities-actions">
          {canCreate && <button className="primary" onClick={() => setCreateOpen(true)}><Icon name="plus" size={14} /> Create Opportunity</button>}
        </div>
      </div>

      <Tracker
        initialOwnerFilter={requestedView === 'all' || requested === 'all' ? 'All' : requestedView === 'my' || requested === 'my' ? store.role : undefined}
        onCreateOpportunity={canCreate ? () => setCreateOpen(true) : undefined}
      />
      {createOpen && canCreate && (
        <Modal title="Create Opportunity" onClose={() => setCreateOpen(false)} wide className="opportunity-create-modal">
          <CreateOpportunity />
        </Modal>
      )}
    </div>
  )
}
