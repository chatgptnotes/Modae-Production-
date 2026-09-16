import React, { useEffect, useRef, useState } from 'react'
import { Routes, Route, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useStore } from './store.jsx'
import { PORTAL_ENABLED, ROLES } from './seed.js'
import { isAdminRole, isSalesOwner, canSeePage, displayRole, canPriceProposal, ddMmmYY } from './utils.js'
import { DrawerHost } from './drawer.jsx'
import { Icon, ModaeLogo } from './icons.jsx'
import { DemoDataControls } from './ui.jsx'
import { counts } from './kpi.js'
import BrandWatermark from './branding/BrandWatermark.jsx'
import { startAutoTitle } from './autoTitle.js'
import { computeAlerts } from './monitoring.js'
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
import Approvals, { COMMERCIAL_RX } from './pages/Approvals.jsx'
import Audit from './pages/Audit.jsx'
import VoiceUpdate from './pages/VoiceUpdate.jsx'
import AiMap from './pages/AiMap.jsx'
import Admin from './pages/Admin.jsx'
import WorkflowAdmin from './pages/WorkflowAdmin.jsx'
import Login, { RequireAuth } from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import Workbench from './pages/Workbench.jsx'
import PurchaseOrders from './pages/PurchaseOrders.jsx'
import Portal from './pages/Portal.jsx'
import Opportunities from './pages/Opportunities.jsx'
import TabletApp from './tablet/TabletApp.jsx'

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
  // detail can quote pricing. The approvals page hides that from roles that may
  // not see commercial figures; a notification must not be the way around it.
  const safeText = value => (COMMERCIAL_RX.test(value || '') && !canPriceProposal(role) ? 'Restricted' : value)
  const notifications = [
    ...(store.approvals || []).filter(a => uniqueApproval(a, store.approvals || []) && a.status === 'Pending' && ([...(a.needed || []), a.approver, a.requestedBy].filter(Boolean).includes(role))).map(a => ({
      id: `approval-${a.id}`, icon: 'checkCircle', title: 'Approval waiting', text: safeText([approvalSubject(a), a.detail].filter(Boolean).join(' — ')), to: approvalNotificationPath(a), date: a.ts,
    })),
    ...(store.approvals || []).filter(a => uniqueApproval(a, store.approvals || []) && ['Approved', 'Approved with conditions', 'Returned', 'Rejected'].includes(a.status) && approvalAudience(a, store).includes(role)).map(a => ({
      // Lead with what it was about. a.detail is frozen at request time, so a
      // resolved row built from it reads "Approval approved / … is required".
      id: `approval-result-${a.id}`, icon: 'checkCircle', title: `Approval ${a.status.toLowerCase()}`, text: safeText([approvalSubject(a), meaningfulNote(a.decisionNote)].filter(Boolean).join(' — ')), to: approvalNotificationPath(a), date: a.decisionTs || a.ts,
    })),
    ...(store.opportunities || []).filter(o => o.status === 'Open' && o.owner === role && o.lastUpdated && ((Date.now() - new Date(o.lastUpdated).getTime()) / 86400000) >= 7).map(o => ({
      id: `stale-${o.id}`, icon: 'clock', title: 'Follow-up overdue', text: `${o.id} has not been updated for 7 days`, to: `/opp/${o.id}`, date: o.lastUpdated,
    })),
    // stale-opportunity and pending-approval both restate a source above.
    ...computeAlerts(store).filter(alert => !['stale-opportunity', 'pending-approval'].includes(alert.type)).map(alert => ({
      id: alert.id, icon: 'alert', title: sentenceCase(alert.type), text: alert.message, to: `/opp/${alert.objectId}`, date: alert.createdAt,
    })),
  ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
  const unseenNotifications = notifications.filter(item => !seenIds.includes(item.id))
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
  // What was new at the moment the panel opened. Marking seen on open instead
  // meant the header always said "All seen" and nothing was ever highlighted.
  const [unseenOnOpen, setUnseenOnOpen] = useState([])
  const closeNotifications = () => {
    setOpen(false)
    markSeen(notifications)
  }
  const toggleNotifications = () => {
    if (open) { closeNotifications(); return }
    setUnseenOnOpen(unseenNotifications.map(item => item.id))
    setOpen(true)
  }
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
          <div id="notification-popover" className="notification-popover" role="dialog" aria-label="Notifications">
            <div className="notification-heading"><b>Notifications</b><span>{unseenOnOpen.length ? `${unseenOnOpen.length} new` : 'All seen'}</span></div>
            {notifications.length ? notifications.map(item => (
              <button key={item.id} className={`notification-item${unseenOnOpen.includes(item.id) ? ' unseen' : ''}`} type="button" onClick={() => { markSeen([item]); setOpen(false); nav(item.to) }}>
                <Icon name={item.icon} size={15} />
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
  { section: 'Workspace', to: '/my-dashboard', label: 'My Dashboard', icon: 'chartBar', page: 'mydashboard' },
  { section: 'Workspace', to: '/inbox', label: 'Lead inbox', icon: 'inbox', page: 'inbox', badge: c => c.newLeads, badgeHint: 'new leads requiring qualification' },
  { section: 'Workspace', to: '/opportunities', label: 'Opportunities', icon: 'cards', page: 'tracker' },
  { section: 'Workspace', to: '/approvals', label: 'Approvals', icon: 'checkCircle', page: 'approvals', badge: c => c.forMe + c.myPending, badgeHint: 'gates waiting on you, plus your own requests' },
  { section: 'Workspace', to: '/po', label: 'Purchase Orders', icon: 'clipboardCheck', page: 'po' },
  { section: 'Workspace', to: '/folders', label: 'Documents', icon: 'folder', page: 'folders' },
  { section: 'Workspace', to: '/customers', label: 'Customers', icon: 'users', page: 'customers' },
  { section: 'Workspace', to: '/pricelists', label: 'Price Lists', icon: 'tag', page: 'pricelists' },
  { section: 'Admin & more', to: '/admin', label: 'Admin', icon: 'gear', page: 'admin' },
  { section: 'Admin & more', to: '/audit', label: 'Audit Trail', icon: 'list', page: 'audit' },
  { section: 'Admin & more', to: '/users', label: 'Users and roles', icon: 'shield', page: 'users' },
]

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
        {/* The shell is viewport-locked, so this is the app's single scroll
            region — pages that want their own internal scroller (the pipeline
            sheet, the mailbox list) size themselves to 100% of it. */}
        <main id="main-content" className="main-scroll" ref={mainRef}>{routes}</main>
      </div>
      <DrawerHost />
    </div>
  )

  return <RequireAuth>{shell}</RequireAuth>
}
