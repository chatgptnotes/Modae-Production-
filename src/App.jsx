import React, { useEffect, useState } from 'react'
import { Routes, Route, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useStore } from './store.jsx'
import { ROLES } from './seed.js'
import { isAdminRole, isSalesOwner, canSeePage } from './utils.js'
import { DrawerHost } from './drawer.jsx'
import { Icon, ModaeLogo } from './icons.jsx'
import { InstallButton } from './install.jsx'
import { counts } from './kpi.js'
import BrandWatermark from './branding/BrandWatermark.jsx'
import Tracker from './pages/Tracker.jsx'
import IntakeForm from './pages/IntakeForm.jsx'
import Folders from './pages/Folders.jsx'
import Proposal from './pages/Proposal.jsx'
import PriceLists from './pages/PriceLists.jsx'
import Dashboard from './pages/Dashboard.jsx'
import MyDashboard from './pages/MyDashboard.jsx'
import Customers from './pages/Customers.jsx'
import Analytics from './pages/Analytics.jsx'
import Users from './pages/Users.jsx'
import TenderIntake from './pages/TenderIntake.jsx'
import MyOpps from './pages/MyOpps.jsx'
import Inbox from './pages/Inbox.jsx'
import Approvals from './pages/Approvals.jsx'
import Audit from './pages/Audit.jsx'
import VoiceUpdate from './pages/VoiceUpdate.jsx'
import AiMap from './pages/AiMap.jsx'
import Admin from './pages/Admin.jsx'
import Login, { RequireAuth } from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import Workbench from './pages/Workbench.jsx'
import PurchaseOrders from './pages/PurchaseOrders.jsx'
import Launcher from './pages/Launcher.jsx'
import Portal from './pages/Portal.jsx'
import Opportunities from './pages/Opportunities.jsx'
import TabletApp from './tablet/TabletApp.jsx'

function PageGate({ page, children }) {
  const store = useStore()
  if (!canSeePage(store.role, page)) return <Navigate to="/opportunities" replace />
  return children
}

// Left-sidebar navigation. `page` is the PERMS matrix key — visibility follows
// the acting role's permission set (seed.js PERMS).
const NAV = [
  { to: '/my-dashboard', label: 'My Dashboard', icon: 'chartBar', page: 'mydashboard' },
  { to: '/inbox', label: 'Lead Inbox', icon: 'inbox', page: 'inbox', badge: c => c.newLeads, badgeHint: 'new leads to qualify' },
  { to: '/opportunities', label: 'Opportunities', icon: 'cards', page: 'tracker' },
  { to: '/approvals', label: 'Approvals', icon: 'checkCircle', page: 'approvals', badge: c => c.forMe + c.myPending, badgeHint: 'gates waiting on you, plus your own requests' },
  { to: '/po', label: 'Purchase Orders', icon: 'clipboardCheck', page: 'po' },
  { to: '/folders', label: 'SharePoint Folders', icon: 'folder', page: 'folders' },
  { to: '/pricelists', label: 'Price Lists', icon: 'tag', page: 'pricelists' },
  { to: '/customers', label: 'Customers', icon: 'users', page: 'customers' },
  { to: '/aimap', label: 'AI & Automation', icon: 'sparkles', page: 'aimap', show: role => isAdminRole(role) || role === 'AH' || role === 'LJS' },
  { to: '/admin', label: 'Admin', icon: 'gear', page: 'admin' },
  { to: '/audit', label: 'Audit Trail', icon: 'list', page: 'audit' },
  { to: '/users', label: 'Users & Roles', icon: 'shield', page: 'users' },
  { to: '/launcher', label: 'Demo Launcher', icon: 'play', page: 'launcher', show: role => isAdminRole(role) },
]

export default function App() {
  const store = useStore()
  const nav = useNavigate()
  const loc = useLocation()
  const [navOpen, setNavOpen] = useState(false)
  const [sidebarCompact, setSidebarCompact] = useState(() => {
    try { return window.localStorage.getItem('modae_sidebar_compact') === '1' } catch { return false }
  })
  const tablet = store.viewMode === 'tablet'
  const custAccount = store.auth?.user?.role === 'CUST'
  const role = store.role
  const items = NAV
    .filter(t => canSeePage(role, t.page) && (typeof t.show !== 'function' || t.show(role)))
    .map(t => t.to === '/po' && isSalesOwner(role) ? { ...t, label: 'My Purchase Orders' } : t)

  // Off-canvas nav closes on navigation in the responsive desktop shell.
  useEffect(() => { setNavOpen(false) }, [loc.pathname])

  // Follow the viewport until the user picks a mode themselves — a tablet turned
  // to landscape, or a browser window dragged wider, should land in the right
  // shell rather than keeping whatever the first visit happened to measure.
  useEffect(() => {
    const onResize = () => store.syncViewMode()
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  if (tablet) return <RequireAuth><TabletApp /></RequireAuth>

  // Customer accounts/persona only ever see the portal. Route-level, not a
  // post-render effect — internal pages must never mount for a customer.
  const toggleSidebar = () => setSidebarCompact(value => {
    const next = !value
    try { window.localStorage.setItem('modae_sidebar_compact', next ? '1' : '0') } catch { /* storage is optional */ }
    return next
  })

  const routes = (role === 'CUST' || custAccount) ? (
    <Routes>
      <Route path="/portal" element={<Portal />} />
      <Route path="*" element={<Navigate to="/portal" replace />} />
    </Routes>
  ) : (
    <Routes>
      <Route path="/" element={<PageGate page="tracker"><Tracker /></PageGate>} />
      <Route path="/opportunities" element={<PageGate page="tracker"><Opportunities /></PageGate>} />
      <Route path="/home" element={<Navigate to="/opportunities" replace />} />
      <Route path="/my" element={<PageGate page="my"><MyOpps /></PageGate>} />
      <Route path="/inbox" element={<PageGate page="inbox"><Inbox /></PageGate>} />
      <Route path="/inbox/:leadId" element={<PageGate page="inbox"><Inbox /></PageGate>} />
      <Route path="/register/:leadId" element={<PageGate page="inbox"><Register /></PageGate>} />
      <Route path="/opp/:oppId" element={<PageGate page="tracker"><Workbench /></PageGate>} />
      <Route path="/opp/:oppId/:tab" element={<PageGate page="tracker"><Workbench /></PageGate>} />
      <Route path="/approvals" element={<PageGate page="approvals"><Approvals /></PageGate>} />
      <Route path="/po" element={<PageGate page="po"><PurchaseOrders /></PageGate>} />
      <Route path="/audit" element={<PageGate page="audit"><Audit /></PageGate>} />
      <Route path="/new" element={<PageGate page="new"><IntakeForm /></PageGate>} />
      <Route path="/tender" element={<PageGate page="tender"><TenderIntake /></PageGate>} />
      <Route path="/folders" element={<PageGate page="folders"><Folders /></PageGate>} />
      <Route path="/folders/:oppId" element={<PageGate page="folders"><Folders /></PageGate>} />
      <Route path="/folders/:oppId/:sub" element={<PageGate page="folders"><Folders /></PageGate>} />
      <Route path="/proposal/:oppId" element={<PageGate page="proposal"><Proposal /></PageGate>} />
      <Route path="/pricelists" element={<PageGate page="pricelists"><PriceLists /></PageGate>} />
      <Route path="/dashboard" element={<Navigate to="/my-dashboard#forecast-details" replace />} />
      <Route path="/my-dashboard" element={<PageGate page="mydashboard"><MyDashboard /></PageGate>} />
      <Route path="/analytics" element={<Navigate to="/my-dashboard#detailed-analytics" replace />} />
      <Route path="/customers" element={<PageGate page="customers"><Customers /></PageGate>} />
      <Route path="/users" element={<PageGate page="users"><Users /></PageGate>} />
      <Route path="/aimap" element={<PageGate page="aimap"><AiMap /></PageGate>} />
      <Route path="/admin" element={<PageGate page="admin"><Admin /></PageGate>} />
      <Route path="/launcher" element={<PageGate page="launcher"><Launcher /></PageGate>} />
      <Route path="/portal" element={<PageGate page="portal"><Portal /></PageGate>} />
      <Route path="/voice" element={<PageGate page="voice"><VoiceUpdate /></PageGate>} />
    </Routes>
  )

  // Customer accounts never get the persona switcher (store.setRole also
  // refuses the escalation — this just removes the dead control). Rendered in
  // the tablet bar and the sidebar footer.
  const RoleSwitcher = () => custAccount ? null : (
    <select value={store.role} onChange={e => store.setRole(e.target.value)} title="Acting-as persona">
      {Object.entries(ROLES).map(([id, r]) => <option key={id} value={id}>{r.label}</option>)}
    </select>
  )

  const c = counts(store, role)
  const shell = (
    <div className={`shell ${sidebarCompact ? 'sidebar-compact' : ''}`}>
      <BrandWatermark variant="shell" />
      <div className={`nav-backdrop ${navOpen ? 'open' : ''}`} onClick={() => setNavOpen(false)} />
      <aside className={`sidenav ${navOpen ? 'open' : ''}`}>
        <div className="brand" onClick={() => nav('/opportunities')}>
          <ModaeLogo size={28} />
          <button className="sidebar-toggle" onClick={e => { e.stopPropagation(); toggleSidebar() }}
            title={sidebarCompact ? 'Expand sidebar' : 'Collapse sidebar'} aria-label={sidebarCompact ? 'Expand sidebar' : 'Collapse sidebar'}>
            <Icon name={sidebarCompact ? 'chevronRight' : 'chevronLeft'} size={15} />
          </button>
        </div>
        <nav className="side-nav">
          {items.map(t => {
            // Same badges the tablet bar carries — the desktop sidebar had none,
            // so an approver saw no sign that a gate was waiting on them.
            const badge = t.badge ? t.badge(c) : 0
            return (
              <NavLink key={t.to} to={t.to} end={t.to === '/'}
                className={({ isActive }) => `side-item ${isActive ? 'active' : ''}`} title={sidebarCompact ? t.label : undefined}>
                <Icon name={t.icon} size={17} /> <span className="side-label">{t.label}</span>
                {badge > 0 && <span className="side-badge" title={t.badgeHint}>{badge}</span>}
              </NavLink>
            )
          })}
        </nav>
        <div className="side-foot">
          {!custAccount && (
            <label title="Logged-in persona — commercial data is visible to approvers/admins only">
              Logged in as
              <RoleSwitcher />
            </label>
          )}
          {store.auth?.user && (
            <button className="reset" onClick={store.logout} title={store.auth.user.email}>
              <Icon name="logout" size={14} /> <span className="side-label">Sign out ({store.auth.user.name})</span>
            </button>
          )}
          {/* Confirmed, like the Admin and Launcher copies of this button: with
              Supabase configured resetDemo overwrites every server slice with
              seeds, so a stray click here discards the shared dataset for every
              device, not just this browser. */}
          <button className="reset" title="Clear local changes and reload seed data"
            onClick={() => { if (window.confirm('Reset all demo data? Every change is discarded and the app reloads with seed data.')) store.resetDemo() }}>
            <Icon name="refresh" size={14} /> <span className="side-label">Reset demo data</span>
          </button>
        </div>
      </aside>

      <div className="main-col">
        <header className="topbar">
          <button className="nav-burger" onClick={() => setNavOpen(true)} title="Menu">
            <Icon name="menu" size={20} />
          </button>
          <span className="topbar-title">ModAE — sales opportunity &amp; proposal workspace</span>
          <span className="spacer" style={{ flex: 1 }} />
          {!custAccount && (
            <label className="topbar-user" title="Logged-in persona — commercial data is visible to approvers/admins only">
              Logged in as
              <RoleSwitcher />
            </label>
          )}
          <InstallButton />
          <button className="mode-switch" onClick={() => { store.setViewMode('tablet'); nav('/home') }}>
            <Icon name="tablet" size={15} /> Switch to tablet view
          </button>
        </header>
        {/* The shell is viewport-locked, so this is the app's single scroll
            region — pages that want their own internal scroller (the pipeline
            sheet, the mailbox list) size themselves to 100% of it. */}
        <main className="main-scroll">{routes}</main>
      </div>
      <DrawerHost />
    </div>
  )

  return <RequireAuth>{shell}</RequireAuth>
}
