import React, { useEffect, useRef, useState } from 'react'
import { Routes, Route, NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { PORTAL_ENABLED } from '../seed.js'
// selectableRoles().map(([id, label]) => ({ id, label }))
import { canSeePage } from '../utils.js'
import { DrawerHost } from '../drawer.jsx'
import { Icon } from '../icons.jsx'
import { counts } from '../kpi.js'
import BrandWatermark from '../branding/BrandWatermark.jsx'
import WorkspaceViewToggle from '../ui/WorkspaceViewToggle.jsx'
import { useWorkspaceTheme } from '../ui/WorkspaceThemeContext.jsx'
import IntakeForm from '../pages/IntakeForm.jsx'
import Folders from '../pages/Folders.jsx'
import Proposal from '../pages/Proposal.jsx'
import PriceLists from '../pages/PriceLists.jsx'
import ProposalSent from '../pages/ProposalSent.jsx'
import WorkflowAdmin from '../pages/WorkflowAdmin.jsx'
import { topbarTitleFor } from '../ui/workspaceTitles.js'
import MobileMore from './MobileMore.jsx'
import MobileContent from './MobileContent.jsx'
import MyDashboard from '../pages/MyDashboard.jsx'
import Customers from '../pages/Customers.jsx'
import Analytics from '../pages/Analytics.jsx'
import Users from '../pages/Users.jsx'
import TenderIntake from '../pages/TenderIntake.jsx'
import MyOpps from '../pages/MyOpps.jsx'
import Inbox from '../pages/Inbox.jsx'
import Approvals from '../pages/Approvals.jsx'
import Audit from '../pages/Audit.jsx'
import VoiceUpdate from '../pages/VoiceUpdate.jsx'
import AiMap from '../pages/AiMap.jsx'
import Admin from '../pages/Admin.jsx'
import Register from '../pages/Register.jsx'
import Workbench from '../pages/Workbench.jsx'
import PurchaseOrders from '../pages/PurchaseOrders.jsx'
import Launcher from '../pages/Launcher.jsx'
import Portal from '../pages/Portal.jsx'
import Opportunities from '../pages/Opportunities.jsx'
import TabletHome from './TabletHome.jsx'
import './tablet.css'
import './phone.css'

function TabletGate({ page, children }) {
  const store = useStore()
  if (!canSeePage(store.roles || store.role, page)) return <Navigate to="/more" replace />
  return children
}

const BOTTOM = [
  { to: '/my-dashboard', label: 'Dashboard', icon: 'chartBar', page: 'mydashboard' },
  { to: '/inbox', label: 'Inbox', icon: 'inbox', page: 'inbox', badge: s => counts(s).newLeads },
  { to: '/opportunities', label: 'Opportunities', icon: 'cards', page: 'tracker' },
  { to: '/approvals', label: 'Approvals', icon: 'checkCircle', page: 'approvals', badge: s => counts(s).forMe },
]

export default function TabletApp() {
  const store = useStore()
  const nav = useNavigate()
  const loc = useLocation()
  const role = store.role
  const custAccount = store.auth?.user?.role === 'CUST'
  const { theme } = useWorkspaceTheme()
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMessage, setRefreshMessage] = useState('')
  const refreshLock = useRef(false)
  const title = topbarTitleFor(loc.pathname, role)
  const recordId = decodeURIComponent(loc.pathname.split('/')[2] || '')
  const detailLabel = loc.pathname.startsWith('/inbox/') ? store.leads?.find(lead => String(lead.id) === recordId)?.subject || 'Lead detail'
    : loc.pathname.startsWith('/opp/') ? store.opportunities?.find(opp => String(opp.id) === recordId)?.sellTo || 'Opportunity'
    : ({ '/new': 'New opportunity', '/tender': 'Tender intake', '/po': 'Purchase orders', '/analytics': 'Analytics', '/my': 'Update opportunity', '/admin/workflow': 'Workflow configuration', '/voice': 'Voice update', '/aimap': 'AI and automation' }[loc.pathname] || (loc.pathname.startsWith('/proposal/') ? 'Proposal' : loc.pathname.startsWith('/register/') ? 'Register lead' : 'Workspace'))
  const refresh = async () => {
    if (refreshLock.current) return
    refreshLock.current = true
    setRefreshing(true)
    setRefreshMessage('')
    try {
      const ok = await store.refreshSharedData()
      setRefreshMessage(ok ? 'Workspace updated' : 'Refresh failed. Please try again.')
    } catch { setRefreshMessage('Refresh failed. Please try again.') }
    finally { refreshLock.current = false; setRefreshing(false) }
  }

  useEffect(() => {
    if (loc.pathname === '/') nav('/home', { replace: true })
  }, [loc.pathname, nav])

  const routes = (role === 'CUST' || custAccount) ? (
    <Routes>
      <Route path="/portal" element={<Portal />} />
      <Route path="*" element={<Navigate to="/portal" replace />} />
    </Routes>
  ) : (
    <Routes>
      <Route path="/" element={<TabletGate page="tracker"><TabletHome /></TabletGate>} />
      <Route path="/home" element={<TabletGate page="tracker"><TabletHome /></TabletGate>} />
      <Route path="/opportunities" element={<TabletGate page="tracker"><Opportunities /></TabletGate>} />
      <Route path="/my" element={<TabletGate page="my"><MyOpps /></TabletGate>} />
      <Route path="/inbox" element={<TabletGate page="inbox"><Inbox /></TabletGate>} />
      <Route path="/inbox/:leadId" element={<TabletGate page="inbox"><Inbox /></TabletGate>} />
      <Route path="/register/:leadId" element={<TabletGate page="inbox"><Register /></TabletGate>} />
      <Route path="/opp/:oppId" element={<TabletGate page="tracker"><Workbench /></TabletGate>} />
      <Route path="/opp/:oppId/:tab" element={<TabletGate page="tracker"><Workbench /></TabletGate>} />
      <Route path="/proposal-sent" element={<TabletGate page="proposalSent"><ProposalSent /></TabletGate>} />
      <Route path="/admin/workflow" element={<TabletGate page="admin"><WorkflowAdmin /></TabletGate>} />
      <Route path="/more" element={<MobileMore />} />
      <Route path="*" element={<Navigate to="/more" replace />} />
      <Route path="/approvals" element={<TabletGate page="approvals"><Approvals /></TabletGate>} />
      <Route path="/po" element={<TabletGate page="po"><PurchaseOrders /></TabletGate>} />
      <Route path="/audit" element={<TabletGate page="audit"><Audit /></TabletGate>} />
      <Route path="/new" element={<TabletGate page="new"><IntakeForm /></TabletGate>} />
      <Route path="/tender" element={<TabletGate page="tender"><TenderIntake /></TabletGate>} />
      <Route path="/folders" element={<TabletGate page="folders"><Folders /></TabletGate>} />
      <Route path="/folders/:oppId" element={<TabletGate page="folders"><Folders /></TabletGate>} />
      <Route path="/folders/:oppId/:sub" element={<TabletGate page="folders"><Folders /></TabletGate>} />
      <Route path="/proposal/:oppId" element={<TabletGate page="proposal"><Proposal /></TabletGate>} />
      <Route path="/pricelists" element={<TabletGate page="pricelists"><PriceLists /></TabletGate>} />
      <Route path="/dashboard" element={<Navigate to="/my-dashboard" replace />} />
      <Route path="/my-dashboard" element={<TabletGate page="mydashboard"><MyDashboard /></TabletGate>} />
      <Route path="/analytics" element={<TabletGate page="analytics"><Analytics /></TabletGate>} />
      <Route path="/customers" element={<TabletGate page="customers"><Customers /></TabletGate>} />
      <Route path="/users" element={<TabletGate page="users"><Users /></TabletGate>} />
      <Route path="/aimap" element={<TabletGate page="aimap"><AiMap /></TabletGate>} />
      <Route path="/admin" element={<TabletGate page="admin"><Admin /></TabletGate>} />
      <Route path="/launcher" element={<TabletGate page="launcher"><Launcher /></TabletGate>} />
      {PORTAL_ENABLED && <Route path="/portal" element={<TabletGate page="portal"><Portal /></TabletGate>} />}
      <Route path="/voice" element={<TabletGate page="voice"><VoiceUpdate /></TabletGate>} />
    </Routes>
  )

  return (
    <div className="shell tablet-mode" data-theme={theme} style={{ display: 'block' }}>
      <BrandWatermark variant="tablet" />
      <header className="tablet-bar">
        <div className="mobile-heading">
          {!title && loc.pathname !== '/home' && loc.pathname !== '/more' && <button type="button" aria-label="Go back" onClick={() => window.history.state?.idx > 0 ? nav(-1) : nav('/more')}><Icon name="chevronLeft" size={18} /></button>}
          <h1>{title && <Icon name={title.icon} size={18} />}{title?.label || (loc.pathname === '/more' ? 'More' : detailLabel)}</h1>
        </div>
        <div className="tb-utilities" aria-label="Workspace utilities">
          {['/my-dashboard', '/inbox', '/opportunities', '/approvals', '/analytics', '/po', '/proposal-sent'].includes(loc.pathname) && <WorkspaceViewToggle />}
          <details className="mobile-overflow"><summary aria-label="Workspace actions">•••</summary><div>
            <button type="button" onClick={refresh} disabled={refreshing} title="Refresh workspace data"><Icon name="refresh" size={18} />{refreshing ? 'Refreshing…' : 'Refresh workspace'}</button>
          </div></details>
        </div>
        {refreshMessage && <p className="mobile-refresh-status" role="status">{refreshMessage}</p>}
      </header>
      <MobileContent hasTitle={Boolean(title)} routeKey={`${store.auth?.user?.id || role}:${role}:${loc.pathname}`}>{routes}</MobileContent>
      <nav className="tab-bottom" aria-label="Main navigation">
        {BOTTOM.filter(t => canSeePage(store.roles || role, t.page)).map(t => {
          const badge = t.badge ? t.badge(store) : 0
          return <NavLink key={t.to} to={t.to} className={({ isActive }) => isActive ? 'active' : ''}>
            {badge > 0 && <span className="tb-badge">{badge}</span>}
            <Icon name={t.icon} size={20} />{t.label}
          </NavLink>
        })}
        <NavLink to="/more" state={{ from: loc.pathname === '/more' ? loc.state?.from : `${loc.pathname}${loc.search}${loc.hash}` }}><Icon name="list" size={20} />More</NavLink>
      </nav>
      <DrawerHost />
    </div>
  )
}
