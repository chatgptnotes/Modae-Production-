import React, { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Tracker from './Tracker.jsx'
import MyOpps from './MyOpps.jsx'
import CreateOpportunity from './CreateOpportunity.jsx'
import { Icon } from '../icons.jsx'
import { useStore } from '../store.jsx'
import { canSeePage } from '../utils.js'

const TABS = [
  { key: 'my', label: 'My Opportunities', icon: 'cards' },
  { key: 'all', label: 'All Opportunities', icon: 'sheet' },
  { key: 'create', label: 'Create Opportunity', icon: 'plus' },
]

// One workspace for the related sales actions. The underlying pages stay
// separate so their existing filters, forms, and proposal handoff behavior do
// not drift; this component owns only navigation between them.
export default function Opportunities() {
  const store = useStore()
  const [params] = useSearchParams()
  const requested = params.get('tab')
  const visibleTabs = TABS.filter(item => item.key !== 'create' || canSeePage(store.role, 'new'))
  const [tab, setTab] = useState(visibleTabs.some(t => t.key === requested) ? requested : 'my')
  const currentTab = visibleTabs.some(item => item.key === tab) ? tab : 'my'

  return (
    <div className="page opportunities-page">
      <div className="opportunities-head">
        <div>
          <div className="eyebrow">Sales workspace</div>
          <h2>Opportunities</h2>
          <p className="hint">Manage your pipeline, register an opportunity, or turn an RFQ into a proposal from one place.</p>
        </div>
        <div className="opportunities-actions">
          {visibleTabs.some(t => t.key === 'create') && <button className="primary" onClick={() => setTab('create')}><Icon name="plus" size={14} /> Create Opportunity</button>}
        </div>
      </div>

      <nav className="opportunities-tabs" aria-label="Opportunity workspace">
        {visibleTabs.map(item => (
          <button key={item.key} className={currentTab === item.key ? 'active' : ''} onClick={() => setTab(item.key)}>
            <Icon name={item.icon} size={14} /> {item.label}
          </button>
        ))}
      </nav>

      {currentTab === 'my' && <MyOpps />}
      {currentTab === 'all' && <Tracker />}
      {currentTab === 'create' && <CreateOpportunity />}
    </div>
  )
}
