import React, { Suspense, useEffect, useRef, useState } from 'react'
import { Routes, Route, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useStore } from './store.jsx'
import { PORTAL_ENABLED, selectableRoles, ROLES } from './seed.js'
import { isSalesOwner, canSeePage, dashboardDefaultScope, displayRole, isApprover, isAdminRole, canManagePriceLists } from './utils.js'
import { DrawerHost } from './drawer.jsx'
import { Icon, ModaeImageLogo, ModaeLogo } from './icons.jsx'
import { counts } from './kpi.js'
import BrandWatermark from './branding/BrandWatermark.jsx'
import { startAutoTitle } from './autoTitle.js'
import { testConnection } from './ai.js'
import { WorkspaceViewProvider, useWorkspaceView } from './ui/WorkspaceViewContext.jsx'
import WorkspaceViewToggle from './ui/WorkspaceViewToggle.jsx'
import { ThemeProvider, useWorkspaceTheme, WorkspaceThemeButton } from './ui/WorkspaceThemeContext.jsx'
import HoverExplanationLayer from './ui/HoverExplanationLayer.jsx'
import { RequireAuth } from './pages/Login.jsx'
import { topbarTitleFor } from './ui/workspaceTitles.js'
import { lazyWithRecovery } from './lazyImport.js'

const Opportunities = lazyWithRecovery(() => import('./pages/Opportunities.jsx'))
const IntakeForm = lazyWithRecovery(() => import('./pages/IntakeForm.jsx'))
const Folders = lazyWithRecovery(() => import('./pages/Folders.jsx'))
const Proposal = lazyWithRecovery(() => import('./pages/Proposal.jsx'))
const PriceLists = lazyWithRecovery(() => import('./pages/PriceLists.jsx'))
const MyDashboard = lazyWithRecovery(() => import('./pages/MyDashboard.jsx'))
const Analytics = lazyWithRecovery(() => import('./pages/Analytics.jsx'))
const Customers = lazyWithRecovery(() => import('./pages/Customers.jsx'))
const Users = lazyWithRecovery(() => import('./pages/Users.jsx'))
const TenderIntake = lazyWithRecovery(() => import('./pages/TenderIntake.jsx'))
const MyOpps = lazyWithRecovery(() => import('./pages/MyOpps.jsx'))
const Inbox = lazyWithRecovery(() => import('./pages/Inbox.jsx'))
const Approvals = lazyWithRecovery(() => import('./pages/Approvals.jsx'))
const Audit = lazyWithRecovery(() => import('./pages/Audit.jsx'))
const VoiceUpdate = lazyWithRecovery(() => import('./pages/VoiceUpdate.jsx'))
const AiMap = lazyWithRecovery(() => import('./pages/AiMap.jsx'))
const Admin = lazyWithRecovery(() => import('./pages/Admin.jsx'))
const WorkflowAdmin = lazyWithRecovery(() => import('./pages/WorkflowAdmin.jsx'))
const Register = lazyWithRecovery(() => import('./pages/Register.jsx'))
const Workbench = lazyWithRecovery(() => import('./pages/Workbench.jsx'))
const ProposalSent = lazyWithRecovery(() => import('./pages/ProposalSent.jsx'))
const PurchaseOrders = lazyWithRecovery(() => import('./pages/PurchaseOrders.jsx'))
const Portal = lazyWithRecovery(() => import('./pages/Portal.jsx'))
const ShowcaseLanding = lazyWithRecovery(() => import('./pages/ShowcaseLanding.jsx'))
const TabletApp = lazyWithRecovery(() => import('./tablet/TabletApp.jsx'))
// import TabletApp from './tablet/TabletApp.jsx'

const LoadingScreen = ({ label = 'Loading workspace…' }) => (
  <div className="login-bg auth-loading" role="status" aria-live="polite">
    <div className="auth-loading__content">
      <ModaeImageLogo height={42} className="auth-loading__logo" />
      <span className="auth-loading__spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  </div>
)

function PageGate({ page, children }) {
  const store = useStore()
  if (!canSeePage(store.roles || store.role, page)) return <Navigate to="/opportunities" replace />
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
        <div className="page page-narrow page-portal-parked">
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
  { section: 'Operate', to: '/my-dashboard', label: 'My Dashboard', icon: 'chartBar', page: 'mydashboard' },
  { section: 'Operate', to: '/inbox', label: 'Lead inbox', icon: 'inbox', page: 'inbox', badge: c => c.newLeads, badgeHint: 'new leads requiring qualification' },
  { section: 'Operate', to: '/opportunities', label: 'Opportunities', icon: 'cards', page: 'tracker' },
  { section: 'Govern', to: '/approvals', label: 'Approvals', icon: 'checkCircle', page: 'approvals', badge: c => c.forMe + c.myPending, badgeHint: 'gates waiting on you, plus your own requests' },
  { section: 'Govern', to: '/proposal-sent', label: 'Proposal Sent', icon: 'send', page: 'proposalSent' },
  { section: 'Govern', to: '/order', label: 'Purchase Orders', icon: 'clipboardCheck', page: 'po' },
  { section: 'Records', to: '/folders', label: 'Documents', icon: 'folder', page: 'folders' },
  { section: 'Records', to: '/customers', label: 'Customers', icon: 'users', page: 'customers' },
  { section: 'Records', to: '/pricelists', label: 'Price Lists', icon: 'tag', page: 'pricelists' },
  { section: 'Admin', to: '/admin', label: 'Admin', icon: 'gear', page: 'admin' },
  { section: 'Admin', to: '/audit', label: 'Audit Trail', icon: 'list', page: 'audit' },
  { section: 'Admin', to: '/users', label: 'Users and roles', icon: 'shield', page: 'users' },
]

const NAV_ACCESS = {
  'My Dashboard': 'VIEW', 'Lead inbox': 'VIEW', Opportunities: 'VIEW', Approvals: 'VIEW',
  'Proposal Sent': 'VIEW', Documents: 'VIEW', Customers: 'VIEW', 'Price Lists': 'VIEW',
  Admin: 'ADMIN', 'Audit Trail': 'VIEW', 'Users and roles': 'ADMIN',
}


function accessForItem(item, role, store) {
  if (item.page === 'admin' || item.page === 'users') return isAdminRole(role) ? 'ADMIN' : 'VIEW'
  if (item.page === 'approvals') return isApprover(role) || store?.approvals?.some(a => (a.needed?.length ? a.needed : [a.approver]).includes(role)) ? 'APPROVE' : 'VIEW'
  if (['inbox', 'tracker'].includes(item.page) && (isSalesOwner(role) || ['LJS', 'AH'].includes(role))) return 'EDIT'
  if (item.page === 'pricelists' && canManagePriceLists(role)) return 'ADMIN'
  return NAV_ACCESS[item.label] || 'VIEW'
}

function WorkspaceTopbar({ store, role, location, nav }) {
  const workspaceView = useWorkspaceView()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const [lastSync, setLastSync] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    if (store.liveSyncStatus === 'live') setLastSync(new Date())
  }, [store.liveSyncStatus])

  const pageItem = NAV.filter(item => location.pathname.startsWith(item.to)).sort((a, b) => b.to.length - a.to.length)[0]
  const isDashboardRoute = pageItem?.page === 'mydashboard'
  const topbarTitle = topbarTitleFor(location.pathname, role)
  const hasLocalSearch = ['/inbox', '/opportunities', '/approvals', '/proposal-sent', '/audit', '/pricelists']
    .some(path => location.pathname.startsWith(path))
  const canManageDashboardScope = isApprover(role)
  const roleDescriptor = String(ROLES[role]?.label || '').split('—').slice(1).join('—').trim() || displayRole(role)
  const roleLine = `${role} · ${roleDescriptor} · access: ${pageItem ? accessForItem(pageItem, role, store).toLowerCase() : 'view'}`
  const term = query.trim().toLowerCase()
  const canSearchLeads = canSeePage(store.roles || role, 'inbox')
  const canSearchOpps = canSeePage(store.roles || role, 'tracker')
  const canSearchCustomers = canSeePage(store.roles || role, 'customers')
  const myCustomerNames = new Set((store.opportunities || []).filter(item => item.owner === role).map(item => item.sellTo).filter(Boolean))
  const leadRows = canSearchLeads ? (store.leads || []).filter(item => workspaceView.scope === 'my'
    ? item.assignedOwner === role || item.suggestedOwner === role
    : true) : []
  const searchResults = term ? [
    ...leadRows.filter(item => `${item.subject} ${item.sender || ''} ${item.from || ''} ${item.ref || ''}`.toLowerCase().includes(term))
      .map(item => ({ type: 'Lead', title: item.subject || 'Untitled enquiry', detail: `${item.id} · ${item.sender || item.from || 'Sender not recorded'}`, path: `/inbox/${item.id}` })),
    ...(canSearchOpps ? (store.opportunities || []).filter(item => workspaceView.scope !== 'my' || item.owner === role)
      .filter(item => `${item.id} ${item.oppName || ''} ${item.sellTo || ''}`.toLowerCase().includes(term))
      .map(item => ({ type: 'Opportunity', title: item.oppName || 'Untitled opportunity', detail: `${item.id} · ${item.sellTo || 'Customer not recorded'}`, path: `/opp/${item.id}` })) : []),
    ...(canSearchCustomers ? (store.customers || []).filter(item => (workspaceView.scope !== 'my' || myCustomerNames.has(item.name || item.customerName))
      && `${item.name || item.customerName || ''} ${item.id || ''}`.toLowerCase().includes(term))
      .map(item => ({ type: 'Customer', title: item.name || item.customerName || 'Customer', detail: item.id || 'Customer master', path: '/customers' })) : []),
  ].flat().slice(0, 7) : []
  const refresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      const ok = await store.refreshSharedData()
      if (ok) setLastSync(new Date())
    } finally { setRefreshing(false) }
  }
  const clock = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(now)
  const synced = lastSync ? new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(lastSync) : '—'
  const dashboardOwners = [...new Set([...(store.opportunities || []).map(item => item.owner), ...Object.keys(store.sales?.targets || {})])].filter(Boolean).sort()
  return <header className={`workspace-topbar${hasLocalSearch ? ' has-local-search' : ''}${topbarTitle ? ' has-page-title' : ''}`}>
    {topbarTitle && <h1 className="workspace-topbar-title"><Icon name={topbarTitle.icon} size={16} /> {topbarTitle.label}</h1>}
    {!hasLocalSearch && <div className="workspace-topbar-search">
      <Icon name="search" size={15} />
      <input aria-label="Search leads, opportunities and customers" placeholder="Search leads, opportunities, customers…" value={query}
        onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onChange={event => { setQuery(event.target.value); setOpen(true) }}
        onKeyDown={event => { if (event.key === 'Escape') { setOpen(false); setQuery('') } if (event.key === 'Enter' && searchResults[0]) { nav(searchResults[0].path); setOpen(false); setQuery('') } }} />
      {open && term && <div className="workspace-search-results" role="listbox" aria-label="Search results">
        {searchResults.map((result, index) => <button key={`${result.type}-${result.path}-${index}`} type="button" role="option" onMouseDown={event => event.preventDefault()} onClick={() => { nav(result.path); setQuery(''); setOpen(false) }}>
          <span className="workspace-search-type">{result.type}</span><span><b>{result.title}</b><small>{result.detail}</small></span>
        </button>)}
        {!searchResults.length && <p>No matching records you can access.</p>}
      </div>}
    </div>}
    <div className="workspace-topbar__controls">
      {!isDashboardRoute && <span className="workspace-role-access" title={roleLine}>{roleLine}</span>}
    {isDashboardRoute && canManageDashboardScope && workspaceView.scope === 'global' && <label className="workspace-company-selector"><span className="visually-hidden">Dashboard company view</span><select aria-label="Dashboard company view" value={workspaceView.owner} onChange={event => workspaceView.setOwner(event.target.value)}><option value="all">Global · Company</option>{dashboardOwners.map(owner => <option key={owner} value={owner}>{displayRole(owner)}</option>)}</select></label>}
      <button type="button" className="workspace-mobile-mode" onClick={() => store.setViewMode('tablet')} aria-label="Switch to Phone mode"><Icon name="tablet" size={14} /> Phone mode</button>
      <WorkspaceViewToggle />
    </div>
    <div className="workspace-topbar__utilities">
      <button type="button" className="workspace-refresh" onClick={refresh} disabled={refreshing} title="Refresh shared workspace data"><Icon name="refresh" size={14} />{refreshing ? 'Refreshing…' : `Synced ${synced}`}</button>
      <span className={`workspace-live ${store.liveSyncStatus === 'live' ? 'is-live' : ''}`}><i />LIVE · IST <b>{clock}</b></span>
      <div className="workspace-guide">
        <button type="button" className="workspace-guide-button" onClick={() => setGuideOpen(value => !value)} aria-expanded={guideOpen}>Guide</button>
        {guideOpen && <div className="workspace-guide-popover" role="status">Search records from any screen, select My or Global view, then refresh when you need the latest shared data.</div>}
      </div>
      <WorkspaceThemeButton className="workspace-theme-toggle" />
    </div>
  </header>
}

function AppShell() {
  const store = useStore()
  const nav = useNavigate()
  const loc = useLocation()
  const mainRef = useRef(null)
  const [sidebarCompact, setSidebarCompact] = useState(() => {
    try { return window.localStorage.getItem('modae_sidebar_compact') === '1' } catch { return false }
  })
  const { theme } = useWorkspaceTheme()
  const [lastSync, setLastSync] = useState(null)
  const [aiHealth, setAiHealth] = useState(null)
  const tablet = store.viewMode === 'tablet'
  const custAccount = store.auth?.user?.role === 'CUST'
  const role = store.role
  const hasTopbarPageTitle = Boolean(topbarTitleFor(loc.pathname, role))
  const publicShowcase = loc.pathname === '/showcase'
  const signedInName = store.auth?.user
    ? store.auth.user.name === displayRole(store.auth.user.role)
      ? displayRole(store.auth.user.role)
      : store.auth.user.name
    : ''
  const userInitials = signedInName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('')
  const items = NAV
    .filter(t => canSeePage(store.roles || role, t.page) && (typeof t.show !== 'function' || t.show(role)))
    .map(t => t.to === '/order' && isSalesOwner(role) ? { ...t, label: 'My Purchase Orders' } : t)
  const withConnectivity = content => content

  useEffect(() => startAutoTitle(mainRef.current), [])

  useEffect(() => {
    if (store.liveSyncStatus === 'live') setLastSync(new Date())
  }, [store.liveSyncStatus])

  useEffect(() => {
    let active = true
    void testConnection(store.config?.aiModel).then(result => {
      if (active) setAiHealth({ ok: result.ok })
    }).catch(() => {
      if (active) setAiHealth({ ok: false })
    })
    return () => { active = false }
  }, [store.config?.aiModel])

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

  // The product showcase is deliberately public: prospective customers should
  // not need an internal sales-workspace account to see it.
  if (publicShowcase) return <Suspense fallback={<LoadingScreen label="Loading showcase…" />}><ShowcaseLanding /></Suspense>

  // The portal is parked (seed.js PORTAL_ENABLED). A customer session saved
  // before it was switched off still has role CUST, so it gets a plain notice
  // and a way out rather than an app with every page denied. Ahead of the
  // tablet branch, so both shells are covered by the one guard.
  if (!PORTAL_ENABLED && (role === 'CUST' || custAccount)) return withConnectivity(<PortalParked />)

  if (tablet) return withConnectivity(<RequireAuth><Suspense fallback={<LoadingScreen />}><TabletApp /></Suspense></RequireAuth>) // if (tablet) return <RequireAuth><TabletApp /></RequireAuth>

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
      <Route path="/" element={<PageGate page="tracker"><Opportunities /></PageGate>} />
      <Route path="/opportunities" element={<PageGate page="tracker"><Opportunities /></PageGate>} />
      <Route path="/home" element={<Navigate to="/opportunities" replace />} />
      <Route path="/my" element={<PageGate page="my"><MyOpps /></PageGate>} />
      <Route path="/inbox" element={<PageGate page="inbox"><Inbox /></PageGate>} />
      <Route path="/inbox/:leadId" element={<PageGate page="inbox"><Inbox /></PageGate>} />
      <Route path="/register/:leadId" element={<PageGate page="inbox"><Register /></PageGate>} />
      <Route path="/opp/:oppId" element={<PageGate page="tracker"><Workbench /></PageGate>} />
      <Route path="/opp/:oppId/:tab" element={<PageGate page="tracker"><Workbench /></PageGate>} />
      <Route path="/approvals" element={<PageGate page="approvals"><Approvals /></PageGate>} />
      <Route path="/proposal-sent" element={<PageGate page="proposalSent"><ProposalSent /></PageGate>} />
      <Route path="/order" element={<PageGate page="po"><PurchaseOrders /></PageGate>} />
      <Route path="/po" element={<Navigate to="/order" replace />} />
      <Route path="/audit" element={<PageGate page="audit"><Audit /></PageGate>} />
      <Route path="/new" element={<PageGate page="new"><IntakeForm /></PageGate>} />
      <Route path="/tender" element={<PageGate page="tender"><TenderIntake /></PageGate>} />
      <Route path="/folders" element={<PageGate page="folders"><Folders /></PageGate>} />
      <Route path="/folders/:oppId" element={<PageGate page="folders"><Folders /></PageGate>} />
      <Route path="/folders/:oppId/:sub" element={<PageGate page="folders"><Folders /></PageGate>} />
      <Route path="/proposal/:oppId" element={<PageGate page="proposal"><Proposal /></PageGate>} />
      <Route path="/pricelists" element={<PageGate page="pricelists"><PriceLists /></PageGate>} />
      <Route path="/dashboard" element={<Navigate to="/my-dashboard" replace />} />
      <Route path="/my-dashboard" element={<PageGate page="mydashboard"><MyDashboard /></PageGate>} />
      <Route path="/analytics" element={<PageGate page="analytics"><Analytics /></PageGate>} />
      <Route path="/customers" element={<PageGate page="customers"><Customers /></PageGate>} />
      <Route path="/users" element={<PageGate page="users"><Users /></PageGate>} />
      <Route path="/aimap" element={<PageGate page="aimap"><AiMap /></PageGate>} />
      <Route path="/admin" element={<PageGate page="admin"><Admin /></PageGate>} />
      <Route path="/admin/workflow" element={<PageGate page="admin"><WorkflowAdmin /></PageGate>} />
      {PORTAL_ENABLED && <Route path="/portal" element={<PageGate page="portal"><Portal /></PageGate>} />}
      <Route path="/voice" element={<PageGate page="voice"><VoiceUpdate /></PageGate>} />
    </Routes>
  )

  // Workspace navigation stays focused on destinations; role selection belongs
  // to authentication and the demo launcher.
  const c = counts(store, role)
  const shell = (
    <div className={`shell ${sidebarCompact ? 'sidebar-compact' : ''}${hasTopbarPageTitle ? ' has-topbar-page-title' : ''}`} data-theme={theme}>
      <BrandWatermark variant="shell" />
      <a className="skip-link" href="#main-content">Skip to workspace</a>
      <aside className="sidenav">
        <div className="brand" onClick={() => nav('/opportunities')}>
          <ModaeLogo size={28} />
          <button className="sidebar-toggle" onClick={e => { e.stopPropagation(); toggleSidebar() }}
            title={sidebarCompact ? 'Expand sidebar' : 'Collapse sidebar'} aria-label={sidebarCompact ? 'Expand sidebar' : 'Collapse sidebar'}>
            <Icon name={sidebarCompact ? 'chevronRight' : 'chevronLeft'} size={15} />
          </button>
        </div>
        <nav className="side-nav" aria-label="Workspace navigation">
          {['Operate', 'Govern', 'Records', 'Admin'].map(section => {
            const sectionItems = items.filter(t => t.section === section)
            if (!sectionItems.length) return null
            return <div className="side-nav-group" key={section}>
              <div className="side-nav-heading">{section}</div>
              {sectionItems.map(t => {
                // Same badges the tablet bar carries — the desktop sidebar had none,
                // so an approver saw no sign that a gate was waiting on them.
                const badge = t.badge ? t.badge(c) : 0
                const label = t.page === 'mydashboard' ? 'Dashboard' : t.label
                return (
                  <NavLink key={t.to} to={t.to} end={t.to === '/'}
                    className={({ isActive }) => `side-item ${isActive ? 'active' : ''}`} title={sidebarCompact ? label : undefined}>
                    <Icon name={t.icon} size={17} /> <span className="side-label">{label}</span>
                    {badge > 0 && <span className="side-badge" title={t.badgeHint}>{badge}</span>}
                    <span className="side-access-badge" title={`${accessForItem(t, role, store)} access`}>{accessForItem(t, role, store)}</span>
                  </NavLink>
                )
              })}
            </div>
          })}
        </nav>
        <div className="side-foot">
          <div className="workspace-system-status">
            {aiHealth && <span className={`workspace-ai-health ${aiHealth.ok ? 'is-online' : 'is-unreachable'}`}><i />AI extraction · {aiHealth.ok ? 'online' : 'unreachable'}</span>}
            <span>Last sync {lastSync ? new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(lastSync) : '—'}</span>
          </div>
          {signedInName && <div className="side-user-chip"><span className="side-user-avatar">{userInitials}</span><span className="side-label"><b>{signedInName}</b><small>{displayRole(role)}</small></span></div>}
          <button className="reset sidebar-mode-switch" onClick={() => { store.setViewMode('tablet') }}>
            <Icon name="tablet" size={14} /> <span className="side-label">Phone mode</span>
          </button>
          {store.auth?.user && (
            <button className="reset" onClick={store.logout} title={store.auth.user.email}>
              <Icon name="logout" size={14} /> <span className="side-label">Sign out ({signedInName})</span>
            </button>
          )}
        </div>
      </aside>

      <div className="main-col">
        <WorkspaceTopbar store={store} role={role} location={loc} nav={nav} />
        {/* The shell is viewport-locked, so this is the app's single scroll
            region — pages that want their own internal scroller (the pipeline
            sheet, the mailbox list) size themselves to 100% of it. */}
        <main id="main-content" className="main-scroll" ref={mainRef}>
          <Suspense fallback={<LoadingScreen />}>{routes}</Suspense>
        </main>
      </div>
      <DrawerHost />
      <HoverExplanationLayer />
    </div>
  )

  return withConnectivity(<RequireAuth>{shell}</RequireAuth>)
}

export default function App() {
  const store = useStore()
  const location = useLocation()
  return <ThemeProvider active={Boolean(store.auth?.user) && location.pathname !== '/showcase'}>
    <WorkspaceViewProvider initialScope={dashboardDefaultScope(store.role)}><AppShell /></WorkspaceViewProvider>
  </ThemeProvider>
}
// selectableRoles().map(([id, label]) => ({ id, label }))
