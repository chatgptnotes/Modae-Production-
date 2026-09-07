import React, { useEffect, useState } from 'react'
import { Routes, Route, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useStore } from './store.jsx'
import { PORTAL_ENABLED, ROLES } from './seed.js'
import { isAdminRole, isSalesOwner, canSeePage, displayRole } from './utils.js'
import { DrawerHost } from './drawer.jsx'
import { Icon, ModaeLogo } from './icons.jsx'
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

// Landing for a session that is still on the customer persona/account after the
// portal was parked (seed.js PORTAL_ENABLED). Internal staff can step back to a
// workspace persona; a real customer account can only sign out.
function PortalParked() {
  const store = useStore()
  const custAccount = store.auth?.user?.role === 'CUST'
  return (
    <div className="shell">
      <div className="main-col">
        <div className="page" style={{ maxWidth: 520, margin: '80px auto' }}>
          <h2><Icon name="lock" size={18} /> Customer portal unavailable</h2>
          <p className="hint">
            The customer-facing portal is switched off for now. The internal workspace is unaffected.
          </p>
          <div className="lead-decision-actions" style={{ marginTop: 14 }}>
            {custAccount
              ? <button className="primary" onClick={store.logout}><Icon name="logout" size={13} /> Sign out</button>
              : <button className="primary" onClick={() => store.setRole('SUPER')}>Back to the workspace</button>}
          </div>
        </div>
      </div>
    </div>
  )
}

// Left-sidebar navigation. `page` is the PERMS matrix key — visibility follows
// the acting role's permission set (seed.js PERMS).
const NAV = [
  { to: '/my-dashboard', label: 'My Dashboard', icon: 'chartBar', page: 'mydashboard' },
  { to: '/inbox', label: 'Lead inbox', icon: 'inbox', page: 'inbox', badge: c => c.newLeads, badgeHint: 'new leads requiring qualification' },
  { to: '/opportunities', label: 'Opportunities', icon: 'cards', page: 'tracker' },
  { to: '/approvals', label: 'Approvals', icon: 'checkCircle', page: 'approvals', badge: c => c.forMe + c.myPending, badgeHint: 'gates waiting on you, plus your own requests' },
  { to: '/po', label: 'Purchase Orders', icon: 'clipboardCheck', page: 'po' },
  { to: '/folders', label: 'SharePoint folders', icon: 'folder', page: 'folders' },
  { to: '/pricelists', label: 'Price Lists', icon: 'tag', page: 'pricelists' },
  { to: '/customers', label: 'Customers', icon: 'users', page: 'customers' },
  { to: '/admin', label: 'Admin', icon: 'gear', page: 'admin' },
  { to: '/audit', label: 'Audit Trail', icon: 'list', page: 'audit' },
  { to: '/users', label: 'Users and roles', icon: 'shield', page: 'users' },
  { to: '/launcher', label: 'Demo launcher', icon: 'play', page: 'launcher', show: role => isAdminRole(role) },
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
  const signedInName = store.auth?.user
    ? store.auth.user.name === (ROLES[store.auth.user.role]?.name || '')
      ? displayRole(store.auth.user.role)
      : store.auth.user.name
    : ''
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

  // The portal is parked (seed.js PORTAL_ENABLED). A customer session saved
  // before it was switched off still has role CUST, so it gets a plain notice
  // and a way out rather than an app with every page denied. Ahead of the
  // tablet branch, so both shells are covered by the one guard.
  if (!PORTAL_ENABLED && (role === 'CUST' || custAccount)) return <PortalParked />

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
      {PORTAL_ENABLED && <Route path="/portal" element={<PageGate page="portal"><Portal /></PageGate>} />}
      <Route path="/voice" element={<PageGate page="voice"><VoiceUpdate /></PageGate>} />
    </Routes>
  )

  // Workspace navigation stays focused on destinations; role selection belongs
  // to authentication and the demo launcher.
  const c = counts(store, role)
  const shell = (
    <div className={`shell ${sidebarCompact ? 'sidebar-compact' : ''}`}>
      <BrandWatermark variant="shell" />
      <a className="skip-link" href="#main-content">Skip to workspace</a>
      <div className={`nav-backdrop ${navOpen ? 'open' : ''}`} onClick={() => setNavOpen(false)} />
      <aside className={`sidenav ${navOpen ? 'open' : ''}`}>
        <div className="brand" onClick={() => nav('/opportunities')}>
          <ModaeLogo size={28} />
          <button className="sidebar-toggle" onClick={e => { e.stopPropagation(); toggleSidebar() }}
            title={sidebarCompact ? 'Expand sidebar' : 'Collapse sidebar'} aria-label={sidebarCompact ? 'Expand sidebar' : 'Collapse sidebar'}>
            <Icon name={sidebarCompact ? 'chevronRight' : 'chevronLeft'} size={15} />
          </button>
        </div>
        <nav className="side-nav" aria-label="Workspace navigation">
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
          <button className="reset sidebar-mode-switch" onClick={() => { store.setViewMode('tablet'); nav('/home') }}>
            <Icon name="tablet" size={14} /> <span className="side-label">Switch to tablet view</span>
          </button>
          {store.auth?.user && (
            <button className="reset" onClick={store.logout} title={store.auth.user.email}>
              <Icon name="logout" size={14} /> <span className="side-label">Sign out ({signedInName})</span>
            </button>
          )}
        </div>
      </aside>

      <div className="main-col">
        <button className="shell-nav-burger" onClick={() => setNavOpen(true)} title="Menu" aria-label="Open navigation">
          <Icon name="menu" size={20} />
        </button>
        {/* The shell is viewport-locked, so this is the app's single scroll
            region — pages that want their own internal scroller (the pipeline
            sheet, the mailbox list) size themselves to 100% of it. */}
        <main id="main-content" className="main-scroll">{routes}</main>
      </div>
      <DrawerHost />
    </div>
  )

  return <RequireAuth>{shell}</RequireAuth>
}
