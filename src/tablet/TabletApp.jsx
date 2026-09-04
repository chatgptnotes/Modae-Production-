import React, { useEffect } from 'react'
import { Routes, Route, NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { PORTAL_ENABLED } from '../seed.js'
import { canSeePage } from '../utils.js'
import { DrawerHost } from '../drawer.jsx'
import { Icon, ModaeLogo } from '../icons.jsx'
import { InstallButton } from '../install.jsx'
import { counts } from '../kpi.js'
import BrandWatermark from '../branding/BrandWatermark.jsx'
import { activeBackend } from '../filestore.js'
import IntakeForm from '../pages/IntakeForm.jsx'
import Folders from '../pages/Folders.jsx'
import Proposal from '../pages/Proposal.jsx'
import PriceLists from '../pages/PriceLists.jsx'
import Dashboard from '../pages/Dashboard.jsx'
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

function TabletGate({ page, children }) {
  const store = useStore()
  if (!canSeePage(store.role, page)) return <Navigate to="/home" replace />
  return children
}

const BOTTOM = [
  { to: '/my-dashboard', label: 'Dashboard', icon: 'chartBar', page: 'mydashboard' },
  { to: '/inbox', label: 'Inbox', icon: 'inbox', page: 'inbox', badge: s => counts(s).newLeads },
  { to: '/approvals', label: 'Approvals', icon: 'checkCircle', page: 'approvals', badge: s => counts(s).forMe },
]

export default function TabletApp() {
  const store = useStore()
  const nav = useNavigate()
  const loc = useLocation()
  const role = store.role
  const custAccount = store.auth?.user?.role === 'CUST'
  const c = counts(store, role)
  const theme = store.tabletTheme === 'light' ? 'light' : 'dark'
  const backend = activeBackend()
  const online = backend === 'sharepoint'
    ? { label: 'SharePoint', tone: 'ok' }
    : backend === 'supabase' ? { label: 'Cloud', tone: 'ok' } : { label: 'Local demo', tone: 'idle' }

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
      <Route path="/dashboard" element={<Navigate to="/my-dashboard#forecast-details" replace />} />
      <Route path="/my-dashboard" element={<TabletGate page="mydashboard"><MyDashboard /></TabletGate>} />
      <Route path="/analytics" element={<Navigate to="/my-dashboard#detailed-analytics" replace />} />
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
    <div className={`shell tablet-mode theme-${theme}`} style={{ display: 'block' }}>
      <BrandWatermark variant="tablet" />
      <header className="tablet-bar">
        <ModaeLogo className="tb-brand" size={24} onClick={() => nav('/home')} />
        <span className="spacer" />
        <button className="tb-bell" onClick={() => nav('/inbox')} title={`${c.newLeads} new leads`}>
          <Icon name="bell" size={15} />
          {c.newLeads > 0 && <span className="tb-dot amber">{c.newLeads}</span>}
        </button>
        <button className="tb-bell" onClick={() => nav('/approvals')} title={`${c.forMe} approvals waiting on you`}>
          <Icon name="checkCircle" size={15} />
          {c.forMe > 0 && <span className="tb-dot red">{c.forMe}</span>}
        </button>
        <span className={`tb-online ${online.tone}`} title={`File storage: ${online.label}`}>
          <Icon name="wifi" size={13} /> <span className="tb-label">{online.label}</span>
        </span>
        <InstallButton />
        <button className="tb-icon" title={theme === 'dark' ? 'Switch to light dashboard' : 'Switch to dark dashboard'}
          onClick={() => store.setTabletTheme(theme === 'dark' ? 'light' : 'dark')}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={15} />
        </button>
        <button onClick={() => { store.setViewMode('full'); nav('/opportunities') }} title="Switch to the full desktop site">
          <Icon name="monitor" size={14} /> <span className="tb-label">Full site</span>
        </button>
        {store.auth?.user && (
          <button onClick={store.logout} title={`Sign out ${store.auth.user.email}`}>
            <Icon name="logout" size={14} /> <span className="tb-label">Exit</span>
          </button>
        )}
      </header>
      {routes}
      <nav className="tab-bottom">
        {BOTTOM.filter(t => canSeePage(role, t.page)).map((t, i) => {
          const badge = t.badge ? t.badge(store) : 0
          return (
            <React.Fragment key={t.to}>
              {i === 2 && <span className="tab-fab-slot" />}
              <NavLink to={t.to} className={({ isActive }) => (isActive ? 'active' : '')}>
                {badge > 0 && <span className="tb-badge">{badge}</span>}
                <Icon name={t.icon} size={20} />{t.label}
              </NavLink>
            </React.Fragment>
          )
        })}
        {canSeePage(role, 'voice') && (
          <button className="tab-fab" title="Voice update — speak a lead or status change"
            onClick={() => nav('/voice')}>
            <Icon name="mic" size={22} />
          </button>
        )}
      </nav>
      <DrawerHost />
    </div>
  )
}
