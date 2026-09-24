import React, { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Routes, Route, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useStore } from './store.jsx'
import { PORTAL_ENABLED } from './seed.js'
import { isSalesOwner, canSeePage, displayRole, canPriceProposal, ddMmmYY } from './utils.js'
import { DrawerHost } from './drawer.jsx'
import { Icon, ModaeImageLogo, ModaeLogo } from './icons.jsx'
import { DemoDataControls } from './ui.jsx'
import { counts } from './kpi.js'
import BrandWatermark from './branding/BrandWatermark.jsx'
import { startAutoTitle } from './autoTitle.js'
import { computeAlerts } from './monitoring.js'
import { RequireAuth } from './pages/Login.jsx'
import { supabaseProjectRef } from './supabase.js'

const Opportunities = lazy(() => import('./pages/Opportunities.jsx'))
const IntakeForm = lazy(() => import('./pages/IntakeForm.jsx'))
const Folders = lazy(() => import('./pages/Folders.jsx'))
const Proposal = lazy(() => import('./pages/Proposal.jsx'))
const PriceLists = lazy(() => import('./pages/PriceLists.jsx'))
const MyDashboard = lazy(() => import('./pages/MyDashboard.jsx'))
const Customers = lazy(() => import('./pages/Customers.jsx'))
const Users = lazy(() => import('./pages/Users.jsx'))
const TenderIntake = lazy(() => import('./pages/TenderIntake.jsx'))
const MyOpps = lazy(() => import('./pages/MyOpps.jsx'))
const Inbox = lazy(() => import('./pages/Inbox.jsx'))
const Approvals = lazy(() => import('./pages/Approvals.jsx'))
const Audit = lazy(() => import('./pages/Audit.jsx'))
const VoiceUpdate = lazy(() => import('./pages/VoiceUpdate.jsx'))
const AiMap = lazy(() => import('./pages/AiMap.jsx'))
const Admin = lazy(() => import('./pages/Admin.jsx'))
const WorkflowAdmin = lazy(() => import('./pages/WorkflowAdmin.jsx'))
const Register = lazy(() => import('./pages/Register.jsx'))
const Workbench = lazy(() => import('./pages/Workbench.jsx'))
const ProposalSent = lazy(() => import('./pages/ProposalSent.jsx'))
const Portal = lazy(() => import('./pages/Portal.jsx'))
const TabletApp = lazy(() => import('./tablet/TabletApp.jsx'))

const COMMERCIAL_RX = /GM\s*%|\bGM\b|discount|₹|\bvalue\b|\bmargin\b/i

const LoadingScreen = ({ label = 'Loading workspace…' }) => (
  <div className="login-bg auth-loading" role="status" aria-live="polite">
    <div className="auth-loading__content">
      <ModaeImageLogo height={42} className="auth-loading__logo" />
      <span className="auth-loading__spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  </div>
)

function ConnectivityNotice() {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine)
  const [reconnected, setReconnected] = useState(false)

  useEffect(() => {
    let reconnectTimer = null
    const onOffline = () => {
      if (reconnectTimer) clearTimeout(reconnectTimer)
      setReconnected(false)
      setOnline(false)
    }
    const onOnline = () => {
      setOnline(true)
      setReconnected(true)
      reconnectTimer = setTimeout(() => setReconnected(false), 4500)
    }
    window.addEventListener('offline', onOffline)
    window.addEventListener('online', onOnline)
    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online', onOnline)
    }
  }, [])

  if (online && !reconnected) return null
  const restored = online && reconnected
  return (
    <div className={`connectivity-notice ${restored ? 'connectivity-notice-online' : 'connectivity-notice-offline'}`} role="status" aria-live="polite" aria-atomic="true">
      <ModaeImageLogo height={20} className="connectivity-notice__logo" />
      <span className="connectivity-notice__status-icon" aria-hidden="true"><Icon name="wifi" size={14} /></span>
      <div className="connectivity-notice__copy">
        <strong>{restored ? 'Back online' : 'Offline mode'}</strong>
        <span>{restored
          ? 'Reconnecting to the shared workspace…'
          : 'Changes are saved locally and will sync when you’re back online.'}</span>
      </div>
    </div>
  )
}

function PageGate({ page, children }) {
  const store = useStore()
  if (!canSeePage(store.role, page)) return <Navigate to="/opportunities" replace />
  return children
}

// Approval notifications always open the central decision workspace. Some
// approvals are raised before an opportunity ID exists, so routing through one
// stable page also avoids invalid or overly-specific deep links.
export const approvalNotificationPath = () => '/approvals'

const approvalOwner = (approval, store) => {
  if (approval?.oppId) return store.opportunities.find(o => o.id === approval.oppId)?.owner || approval.requestedBy
  if (approval?.leadId) {
    const lead = store.leads.find(l => l.id === approval.leadId)
    return lead?.assignedOwner || lead?.suggestedOwner || approval.requestedBy
  }
  return approval?.requestedBy
}

// Everyone who should hear how an approval ended: the person who owns the record,
// plus whoever decided it or was asked to. Older records predate `decidedBy`, so
// the people who were asked stand in for it.
const approvalAudience = (approval, store) => [
  approvalOwner(approval, store),
  approval.decidedBy, approval.approver,
  ...(approval.needed || []),
  ...Object.keys(approval.decisions || {}),
].filter(Boolean)

// What the approval is about, so one row can be told from the next.
const approvalSubject = approval => [approval.oppId || approval.leadId, approval.type].filter(Boolean).join(' · ')

// Decision notes are mandatory, so most of them just restate the outcome. Those
// add nothing next to a title that already says "Approval approved".
const meaningfulNote = note => {
  const text = String(note || '').trim()
  return /^(approve[ds]?|ok|okay|yes|done|fine|reject(ed)?|no)\.?$/i.test(text) ? '' : text
}

// 'missing-follow-up' -> 'Missing follow up'
const sentenceCase = type => {
  const words = String(type || '').replaceAll('-', ' ').trim()
  return words ? words[0].toUpperCase() + words.slice(1) : ''
}

const uniqueApproval = (approval, all) => all.findIndex(item =>
  item.oppId === approval.oppId && item.type === approval.type && item.status === approval.status
  && (item.requestedBy || item.approver) === (approval.requestedBy || approval.approver)) === all.indexOf(approval)

const alertPriority = alert => {
  const typeRank = {
    'overdue-kyc': 50,
    'amber-fee-expiry': 45,
    'proposal-expiry': 40,
    'rate-sheet-expiry': 35,
    'missing-follow-up': 25,
    'stale-opportunity': 20,
    'rate-sheet-idle': 15,
  }
  return (alert.severity === 'high' ? 100 : 0) + (typeRank[alert.type] || 0)
}

function NotificationBell({ store, nav }) {
  const [open, setOpen] = useState(false)
  const role = store.role
  const seenStorageKey = `wintrack-notifications-seen-${role}`
  const [seenIds, setSeenIds] = useState(() => {
    if (typeof window === 'undefined') return []
    try {
      const saved = JSON.parse(window.localStorage.getItem(seenStorageKey) || '[]')
      return Array.isArray(saved) ? saved : []
    } catch { return [] }
  })
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const saved = JSON.parse(window.localStorage.getItem(seenStorageKey) || '[]')
      setSeenIds(Array.isArray(saved) ? saved : [])
    } catch {
      setSeenIds([])
    }
    setOpen(false)
  }, [seenStorageKey])
  // detail can quote pricing. The approvals page hides that from roles that may
  // not see commercial figures; a notification must not be the way around it.
  const safeText = value => (COMMERCIAL_RX.test(value || '') && !canPriceProposal(role) ? 'Restricted' : value)
  const monitoringAlerts = computeAlerts(store)
    .filter(alert => alert.type !== 'pending-approval')
    .reduce((selected, alert) => {
      const previous = selected.get(alert.objectId)
      if (!previous || alertPriority(alert) > alertPriority(previous)) selected.set(alert.objectId, alert)
      return selected
    }, new Map())
  const notifications = [
    ...(store.approvals || []).filter(a => uniqueApproval(a, store.approvals || []) && a.status === 'Pending' && ([...(a.needed || []), a.approver, a.requestedBy].filter(Boolean).includes(role))).map(a => ({
      id: `approval-${a.id}`, tone: 'critical', icon: 'checkCircle', title: 'Approval waiting', text: safeText([approvalSubject(a), a.detail].filter(Boolean).join(' — ')), to: approvalNotificationPath(a), date: a.ts,
    })),
    ...(store.approvals || []).filter(a => uniqueApproval(a, store.approvals || []) && ['Approved', 'Approved with conditions', 'Returned', 'Rejected'].includes(a.status) && approvalAudience(a, store).includes(role)).map(a => ({
      // Lead with what it was about. a.detail is frozen at request time, so a
      // resolved row built from it reads "Approval approved / … is required".
      id: `approval-result-${a.id}-${a.status}-${a.decisionTs || a.ts || ''}`, tone: a.status === 'Rejected' || a.status === 'Returned' ? 'critical' : 'success', icon: 'checkCircle', title: `Approval ${a.status.toLowerCase()}`, text: safeText([approvalSubject(a), meaningfulNote(a.decisionNote)].filter(Boolean).join(' — ')), to: approvalNotificationPath(a), date: a.decisionTs || a.ts,
    })),
    ...[...monitoringAlerts.values()].map(alert => ({
      id: `${alert.id}-${alert.createdAt || ''}`, tone: alert.severity === 'high' ? 'critical' : 'warning', icon: alert.type === 'stale-opportunity' ? 'clock' : 'alert', title: sentenceCase(alert.type), text: alert.message, to: `/opp/${alert.objectId}`, date: alert.createdAt,
    })),
  ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
  const unseenNotifications = notifications.filter(item => !seenIds.includes(item.id))
  const liveNotificationKey = notifications.map(item => item.id).join('|')
  useEffect(() => {
    setSeenIds(previous => {
      const live = new Set(notifications.map(item => item.id))
      const next = previous.filter(id => live.has(id))
      if (next.length === previous.length) return previous
      try { window.localStorage.setItem(seenStorageKey, JSON.stringify(next)) } catch { /* best effort */ }
      return next
    })
  }, [liveNotificationKey, seenStorageKey])
  const markSeen = items => {
    const ids = items.map(item => item.id)
    if (!ids.length) return
    setSeenIds(previous => {
      // Only keep ids that still correspond to a live notification, otherwise
      // this list grows for the lifetime of the browser profile.
      const live = new Set(notifications.map(item => item.id))
      const next = [...new Set([...previous, ...ids])].filter(id => live.has(id))
      try { window.localStorage.setItem(seenStorageKey, JSON.stringify(next)) } catch { /* best effort */ }
      return next
    })
  }
  const closeNotifications = () => setOpen(false)
  const toggleNotifications = () => {
    if (open) { closeNotifications(); return }
    setOpen(true)
  }
  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = event => {
      if (event.key === 'Escape') closeNotifications()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, notifications.length])
  return (
    <div className="notification-wrap">
      <button
        className={`notification-button${open ? ' is-open' : ''}`}
        type="button"
        aria-label={`Notifications${unseenNotifications.length ? ` (${unseenNotifications.length} unseen)` : ''}`}
        aria-expanded={open}
        aria-controls="notification-popover"
        onClick={toggleNotifications}
      >
        <Icon name="bell" size={24} />
        {unseenNotifications.length > 0 && <span className="notification-count">{unseenNotifications.length > 99 ? '99+' : unseenNotifications.length}</span>}
      </button>
      {open && (
        <>
          <div className="notification-overlay" onClick={closeNotifications} />
          <div id="notification-popover" className="notification-popover" role="dialog" aria-modal="false" aria-label="Notifications" tabIndex="-1">
            <div className="notification-heading">
              <div><b>Notifications</b><span>{unseenNotifications.length} unread · {notifications.length} active</span></div>
              {unseenNotifications.length > 0 && <button type="button" className="notification-mark-read" onClick={() => markSeen(notifications)}>Mark all read</button>}
            </div>
            {notifications.length ? notifications.map(item => (
              <button key={item.id} className={`notification-item tone-${item.tone || 'warning'}${!seenIds.includes(item.id) ? ' unseen' : ''}`} type="button" onClick={() => { markSeen([item]); setOpen(false); nav(item.to) }}>
                <span className="notification-signal"><Icon name={item.icon} size={15} /><i aria-hidden="true" /></span>
                <span><b>{item.title}</b><small>{item.text}</small></span>
                {item.date && <time className="notification-date">{ddMmmYY(String(item.date).slice(0, 10))}</time>}
              </button>
            )) : <p className="hint notification-empty">You are all caught up.</p>}
          </div>
        </>
      )}
    </div>
  )
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
  { section: 'Workspace', to: '/my-dashboard', label: 'My Dashboard', icon: 'chartBar', page: 'mydashboard' },
  { section: 'Workspace', to: '/inbox', label: 'Lead inbox', icon: 'inbox', page: 'inbox', badge: c => c.newLeads, badgeHint: 'new leads requiring qualification' },
  { section: 'Workspace', to: '/opportunities', label: 'Opportunities', icon: 'cards', page: 'tracker' },
  { section: 'Workspace', to: '/approvals', label: 'Approvals', icon: 'checkCircle', page: 'approvals', badge: c => c.forMe + c.myPending, badgeHint: 'gates waiting on you, plus your own requests' },
  { section: 'Workspace', to: '/proposal-sent', label: 'Proposal Sent', icon: 'send', page: 'proposalSent' },
  { section: 'Workspace', to: '/folders', label: 'Documents', icon: 'folder', page: 'folders' },
  { section: 'Workspace', to: '/customers', label: 'Customers', icon: 'users', page: 'customers' },
  { section: 'Workspace', to: '/pricelists', label: 'Price Lists', icon: 'tag', page: 'pricelists' },
  { section: 'Admin & more', to: '/admin', label: 'Admin', icon: 'gear', page: 'admin' },
  { section: 'Admin & more', to: '/audit', label: 'Audit Trail', icon: 'list', page: 'audit' },
  { section: 'Admin & more', to: '/users', label: 'Users and roles', icon: 'shield', page: 'users' },
]

function SyncNotice({ status, diagnostics }) {
  if (!['config-error', 'error', 'live', 'connecting', 'reconnecting'].includes(status)) return null
  // Keep sync failures available through the store and console diagnostics,
  // but do not cover the production workspace with a persistent red banner.
  if (['config-error', 'error', 'reconnecting'].includes(status)) return null
  const config = status === 'config-error'
  const legacyOnly = status === 'live' && diagnostics?.normalizedOpportunityCount === 0 && diagnostics?.legacyOpportunityCount > 0
  const emptyWorkspace = status === 'live' && diagnostics?.normalizedOpportunityCount === 0 && diagnostics?.legacyOpportunityCount === 0
  const healthy = status === 'live' && !legacyOnly && !emptyWorkspace
  if (healthy) return null
  const stateLabel = healthy ? 'Shared workspace' : legacyOnly ? 'Migration required' : emptyWorkspace ? 'Shared workspace is empty' : status === 'connecting' ? 'Connecting to shared workspace' : status === 'reconnecting' ? 'Reconnecting to shared workspace' : config ? 'Supabase configuration mismatch' : 'Supabase sync unavailable'
  return (
    <div className={`workspace-sync-notice workspace-sync-notice-${healthy ? 'live' : 'warning'}`} role={healthy ? 'status' : 'alert'} title={supabaseProjectRef ? `Supabase project: ${supabaseProjectRef}` : undefined}>
      <strong>{stateLabel}</strong>
      <span>{healthy
        ? `Project ${supabaseProjectRef || 'not configured'} · active rows are loaded from Supabase.`
        : legacyOnly
          ? `Project ${supabaseProjectRef} · ${diagnostics.legacyOpportunityCount} legacy opportunity rows exist in app_state, but normalized opportunities are empty. Run the business-table migration.`
          : emptyWorkspace
            ? `Project ${supabaseProjectRef} · Supabase returned no active opportunities.`
            : config
              ? 'The URL and anon key point to different projects. This browser is showing local data only.'
              : status === 'connecting' || status === 'reconnecting'
                ? `Project ${supabaseProjectRef || 'not configured'} · waiting for the shared data connection.`
                : 'The shared workspace could not be loaded. This browser may be showing local data only.'}</span>
    </div>
  )
}

export default function App() {
  const store = useStore()
  const nav = useNavigate()
  const loc = useLocation()
  const mainRef = useRef(null)
  const [navOpen, setNavOpen] = useState(false)
  const [sidebarCompact, setSidebarCompact] = useState(() => {
    try { return window.localStorage.getItem('modae_sidebar_compact') === '1' } catch { return false }
  })
  const tablet = store.viewMode === 'tablet'
  const custAccount = store.auth?.user?.role === 'CUST'
  const role = store.role
  const signedInName = store.auth?.user
    ? store.auth.user.name === displayRole(store.auth.user.role)
      ? displayRole(store.auth.user.role)
      : store.auth.user.name
    : ''
  const items = NAV
    .filter(t => canSeePage(role, t.page) && (typeof t.show !== 'function' || t.show(role)))
    .map(t => t.to === '/po' && isSalesOwner(role) ? { ...t, label: 'My Purchase Orders' } : t)
  const withConnectivity = content => <><ConnectivityNotice />{content}</>

  // Off-canvas nav closes on navigation in the responsive desktop shell.
  useEffect(() => { setNavOpen(false) }, [loc.pathname])

  useEffect(() => startAutoTitle(mainRef.current), [])

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
  if (!PORTAL_ENABLED && (role === 'CUST' || custAccount)) return withConnectivity(<PortalParked />)

  if (tablet) return withConnectivity(<RequireAuth><Suspense fallback={<LoadingScreen />}><TabletApp /></Suspense></RequireAuth>)

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
      <Route path="/po" element={<Navigate to="/proposal-sent" replace />} />
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
      <Route path="/admin/workflow" element={<PageGate page="admin"><WorkflowAdmin /></PageGate>} />
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
          {['Workspace', 'Admin & more'].map(section => {
            const sectionItems = items.filter(t => t.section === section)
            if (!sectionItems.length) return null
            return <div className="side-nav-group" key={section}>
              <div className="side-nav-heading">{section}</div>
              {sectionItems.map(t => {
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
            </div>
          })}
        </nav>
        <div className="side-foot">
          <DemoDataControls className="reset" label={x => <span className="side-label">{x}</span>} />
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
        <NotificationBell store={store} nav={nav} />
        <SyncNotice status={store.liveSyncStatus} diagnostics={store.syncDiagnostics} />
        {/* The shell is viewport-locked, so this is the app's single scroll
            region — pages that want their own internal scroller (the pipeline
            sheet, the mailbox list) size themselves to 100% of it. */}
        <main id="main-content" className="main-scroll" ref={mainRef}>
          <Suspense fallback={<LoadingScreen />}>{routes}</Suspense>
        </main>
      </div>
      <DrawerHost />
    </div>
  )

  return withConnectivity(<RequireAuth>{shell}</RequireAuth>)
}
