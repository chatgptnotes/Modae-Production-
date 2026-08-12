import React, { useEffect, useState } from 'react'
import { Routes, Route, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useStore } from './store.jsx'
import { ROLES } from './seed.js'
import { isAdminRole, isApprover, canSeePage } from './utils.js'
import { FormulaBar } from './formulabar.jsx'
import { DrawerHost } from './drawer.jsx'
import { Icon, ModaeLogo } from './icons.jsx'
import { InstallButton } from './install.jsx'
import { counts } from './kpi.js'
import { activeBackend } from './filestore.js'
import Tracker from './pages/Tracker.jsx'
import IntakeForm from './pages/IntakeForm.jsx'
import Folders from './pages/Folders.jsx'
import Proposal from './pages/Proposal.jsx'
import PriceLists from './pages/PriceLists.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Customers from './pages/Customers.jsx'
import Analytics from './pages/Analytics.jsx'
import Users from './pages/Users.jsx'
import TenderIntake from './pages/TenderIntake.jsx'
import Home from './pages/Home.jsx'
import MyOpps from './pages/MyOpps.jsx'
import Inbox from './pages/Inbox.jsx'
import Approvals from './pages/Approvals.jsx'
import Audit from './pages/Audit.jsx'
import TabletHome from './pages/TabletHome.jsx'
import Notes from './pages/Notes.jsx'
import VoiceUpdate from './pages/VoiceUpdate.jsx'
import AiMap from './pages/AiMap.jsx'
import Admin from './pages/Admin.jsx'
import Login, { RequireAuth } from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import Workbench from './pages/Workbench.jsx'
import PurchaseOrders from './pages/PurchaseOrders.jsx'
import Launcher from './pages/Launcher.jsx'
import Portal from './pages/Portal.jsx'

// Left-sidebar navigation. `page` is the PERMS matrix key — visibility follows
// the acting role's permission set (seed.js PERMS).
const NAV = [
  { to: '/home', label: 'Home', icon: 'home', page: 'home' },
  { to: '/inbox', label: 'Lead Inbox', icon: 'inbox', page: 'inbox' },
  { to: '/', label: 'Opportunity Tracker', icon: 'sheet', page: 'tracker' },
  { to: '/my', label: 'My Opportunities', icon: 'cards', page: 'my' },
  { to: '/new', label: 'New Opportunity', icon: 'plus', page: 'new' },
  { to: '/tender', label: 'Tender → Proposal', icon: 'bot', page: 'tender' },
  { to: '/approvals', label: 'Approvals', icon: 'checkCircle', page: 'approvals' },
  { to: '/po', label: 'Purchase Orders', icon: 'clipboardCheck', page: 'po' },
  { to: '/folders', label: 'Folders', icon: 'folder', page: 'folders' },
  { to: '/notes', label: 'Marketing Notes', icon: 'note', page: 'notes' },
  { to: '/pricelists', label: 'Price Lists', icon: 'tag', page: 'pricelists' },
  { to: '/dashboard', label: 'Dashboard', icon: 'chartBar', page: 'dashboard' },
  { to: '/analytics', label: 'Analytics', icon: 'chartLine', page: 'analytics' },
  { to: '/customers', label: 'Customers', icon: 'users', page: 'customers' },
  { to: '/aimap', label: 'AI & Automation', icon: 'sparkles', page: 'aimap' },
  { to: '/admin', label: 'Admin', icon: 'gear', page: 'admin' },
  { to: '/audit', label: 'Audit Trail', icon: 'list', page: 'audit' },
  { to: '/users', label: 'Users & Roles', icon: 'shield', page: 'users' },
  { to: '/launcher', label: 'Demo Launcher', icon: 'play', page: 'launcher' },
]

// App-like bottom tab bar shown in tablet mode — four tabs around a raised
// centre action (voice update), like a native app.
const BOTTOM = [
  { to: '/home', label: 'Home', icon: 'home', page: 'home' },
  { to: '/inbox', label: 'Inbox', icon: 'inbox', page: 'inbox', badge: s => counts(s).newLeads },
  { to: '/approvals', label: 'Approvals', icon: 'checkCircle', page: 'approvals', badge: s => counts(s).pending },
  { to: '/notes', label: 'Notes', icon: 'note', page: 'notes' },
]

export default function App() {
  const store = useStore()
  const nav = useNavigate()
  const loc = useLocation()
  const [navOpen, setNavOpen] = useState(false)
  const tablet = store.viewMode === 'tablet'
  const role = store.role
  const items = NAV.filter(t => canSeePage(role, t.page))

  // Off-canvas nav closes on navigation (tablet).
  useEffect(() => { setNavOpen(false) }, [loc.pathname])

  // Tablet mode lands on the task tiles once per mount.
  useEffect(() => {
    const hash = window.location.hash
    if (tablet && (hash === '' || hash === '#/')) nav('/home', { replace: true })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Customer accounts/persona only ever see the portal. Route-level, not a
  // post-render effect — internal pages must never mount for a customer.
  const custAccount = store.auth?.user?.role === 'CUST'

  const routes = (role === 'CUST' || custAccount) ? (
    <Routes>
      <Route path="/portal" element={<Portal />} />
      <Route path="*" element={<Navigate to="/portal" replace />} />
    </Routes>
  ) : (
    <Routes>
      <Route path="/" element={<Tracker />} />
      <Route path="/home" element={tablet ? <TabletHome /> : <Home />} />
      <Route path="/my" element={<MyOpps />} />
      <Route path="/inbox" element={<Inbox />} />
      <Route path="/inbox/:leadId" element={<Inbox />} />
      <Route path="/register/:leadId" element={<Register />} />
      <Route path="/opp/:oppId" element={<Workbench />} />
      <Route path="/opp/:oppId/:tab" element={<Workbench />} />
      <Route path="/approvals" element={<Approvals />} />
      <Route path="/po" element={<PurchaseOrders />} />
      <Route path="/audit" element={<Audit />} />
      <Route path="/new" element={<IntakeForm />} />
      <Route path="/tender" element={<TenderIntake />} />
      <Route path="/folders" element={<Folders />} />
      <Route path="/folders/:oppId" element={<Folders />} />
      <Route path="/folders/:oppId/:sub" element={<Folders />} />
      <Route path="/proposal/:oppId" element={<Proposal />} />
      <Route path="/pricelists" element={<PriceLists />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/analytics" element={<Analytics />} />
      <Route path="/customers" element={<Customers />} />
      <Route path="/users" element={<Users />} />
      <Route path="/aimap" element={<AiMap />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="/launcher" element={<Launcher />} />
      <Route path="/portal" element={<Portal />} />
      <Route path="/notes" element={<Notes />} />
      <Route path="/voice" element={<VoiceUpdate />} />
    </Routes>
  )

  // Customer accounts never get the persona switcher (store.setRole also
  // refuses the escalation — this just removes the dead control). Rendered in
  // the tablet bar, the full-site topbar AND the sidebar footer.
  const RoleSwitcher = () => custAccount ? null : (
    <select value={store.role} onChange={e => store.setRole(e.target.value)} title="Acting-as persona">
      {Object.entries(ROLES).map(([id, r]) => <option key={id} value={id}>{r.label}</option>)}
    </select>
  )

  const c = counts(store, role)
  const theme = store.tabletTheme === 'light' ? 'light' : 'dark'
  const backend = activeBackend()
  const online = backend === 'sharepoint'
    ? { label: 'SharePoint', tone: 'ok' }
    : backend === 'supabase' ? { label: 'Cloud', tone: 'ok' } : { label: 'Local demo', tone: 'idle' }

  const shell = tablet ? (
    <div className={`shell tablet-mode theme-${theme}`} style={{ display: 'block' }}>
      <header className="tablet-bar">
        <ModaeLogo className="tb-brand" size={24} sub="WinTrack" onClick={() => nav('/home')} />
        <span className="spacer" />
        <button className="tb-bell" onClick={() => nav('/inbox')} title={`${c.newLeads} new leads`}>
          <Icon name="bell" size={15} />
          {c.newLeads > 0 && <span className="tb-dot amber">{c.newLeads}</span>}
        </button>
        <button className="tb-bell" onClick={() => nav('/approvals')} title={`${c.pending} approvals pending`}>
          <Icon name="checkCircle" size={15} />
          {c.pending > 0 && <span className="tb-dot red">{c.pending}</span>}
        </button>
        <span className={`tb-online ${online.tone}`} title={`File storage: ${online.label}`}>
          <Icon name="wifi" size={13} /> {online.label}
        </span>
        <InstallButton />
        <button className="tb-icon" title={theme === 'dark' ? 'Switch to light dashboard' : 'Switch to dark dashboard'}
          onClick={() => store.setTabletTheme(theme === 'dark' ? 'light' : 'dark')}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={15} />
        </button>
        <RoleSwitcher />
        <button onClick={() => { store.setViewMode('full') }} title="Switch to the full desktop site">
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
  ) : (
    <div className="shell">
      <div className={`nav-backdrop ${navOpen ? 'open' : ''}`} onClick={() => setNavOpen(false)} />
      <aside className={`sidenav ${navOpen ? 'open' : ''}`}>
        <div className="brand" onClick={() => nav('/home')}>
          <ModaeLogo size={28} sub="WinTrack" />
        </div>
        <nav className="side-nav">
          {items.map(t => (
            <NavLink key={t.to} to={t.to} end={t.to === '/'}
              className={({ isActive }) => `side-item ${isActive ? 'active' : ''}`}>
              <Icon name={t.icon} size={17} /> {t.label}
            </NavLink>
          ))}
        </nav>
        <div className="side-foot">
          {!custAccount && (
            <label title="Acting-as persona — commercial data is visible to approvers/admins only">
              Acting as
              <RoleSwitcher />
            </label>
          )}
          {store.auth?.user && (
            <button className="reset" onClick={store.logout} title={store.auth.user.email}>
              Sign out ({store.auth.user.name})
            </button>
          )}
          <button className="reset" onClick={store.resetDemo} title="Clear local changes and reload seed data">
            Reset demo data
          </button>
        </div>
      </aside>

      <div className="main-col">
        <header className="topbar">
          <button className="nav-burger" onClick={() => setNavOpen(true)} title="Menu">
            <Icon name="menu" size={20} />
          </button>
          <span className="topbar-title">Modae — sales opportunity &amp; proposal workspace</span>
          <span className="spacer" style={{ flex: 1 }} />
          {!custAccount && (
            <label className="topbar-user" title="Acting-as persona — commercial data is visible to approvers/admins only">
              Acting as
              <RoleSwitcher />
            </label>
          )}
          <InstallButton />
          <button className="mode-switch" onClick={() => { store.setViewMode('tablet'); nav('/home') }}>
            <Icon name="tablet" size={15} /> Switch to tablet view
          </button>
        </header>
        <FormulaBar />
        {routes}
      </div>
      <DrawerHost />
    </div>
  )

  return <RequireAuth>{shell}</RequireAuth>
}
