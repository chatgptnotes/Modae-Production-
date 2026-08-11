import React, { useEffect, useState } from 'react'
import { Routes, Route, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useStore } from './store.jsx'
import { ROLES } from './seed.js'
import { isAdminRole } from './utils.js'
import { FormulaBar } from './formulabar.jsx'
import { DrawerHost } from './drawer.jsx'
import { Icon } from './icons.jsx'
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

// Left-sidebar navigation (modern shell, mirrors the WinTrack Ver 1.1 wireframe).
const NAV = [
  { to: '/home', label: 'Home', icon: 'home' },
  { to: '/inbox', label: 'Lead Inbox', icon: 'inbox' },
  { to: '/', label: 'Opportunity Tracker', icon: 'sheet' },
  { to: '/my', label: 'My Opportunities', icon: 'cards' },
  { to: '/new', label: 'New Opportunity', icon: 'plus' },
  { to: '/tender', label: 'Tender → Proposal', icon: 'bot' },
  // Visible to everyone: approvers decide here; sales owners track their own requests.
  { to: '/approvals', label: 'Approvals', icon: 'checkCircle' },
  { to: '/folders', label: 'Folders', icon: 'folder' },
  { to: '/pricelists', label: 'Price Lists', icon: 'tag' },
  { to: '/dashboard', label: 'Dashboard', icon: 'chartBar' },
  { to: '/analytics', label: 'Analytics', icon: 'chartLine' },
  { to: '/customers', label: 'Customers', icon: 'users' },
  { to: '/audit', label: 'Audit Trail', icon: 'list', adminOnly: true },
  { to: '/users', label: 'Users & Roles', icon: 'shield', adminOnly: true },
]

export default function App() {
  const store = useStore()
  const nav = useNavigate()
  const loc = useLocation()
  const [navOpen, setNavOpen] = useState(false)
  const approver = store.role === 'LJS' || store.role === 'AH' || isAdminRole(store.role)
  const items = NAV.filter(t =>
    (!t.adminOnly || isAdminRole(store.role)) && (!t.approverOnly || approver))

  // Off-canvas nav closes on navigation (tablet).
  useEffect(() => { setNavOpen(false) }, [loc.pathname])

  // On tablets the tile Home is the landing page; desktop keeps the tracker.
  useEffect(() => {
    const hash = window.location.hash
    if (window.innerWidth <= 1024 && (hash === '' || hash === '#/')) nav('/home', { replace: true })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="shell">
      <div className={`nav-backdrop ${navOpen ? 'open' : ''}`} onClick={() => setNavOpen(false)} />
      <aside className={`sidenav ${navOpen ? 'open' : ''}`}>
        <div className="brand" onClick={() => nav('/home')}>
          WinTrack <span>by ModAE</span>
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
          <label title="Acting-as persona — commercial data is visible to approvers/admins only">
            Acting as
            <select value={store.role} onChange={e => store.setRole(e.target.value)}>
              {Object.entries(ROLES).map(([id, r]) => <option key={id} value={id}>{r.label}</option>)}
            </select>
          </label>
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
        </header>
        <FormulaBar />
        <Routes>
          <Route path="/" element={<Tracker />} />
          <Route path="/home" element={<Home />} />
          <Route path="/my" element={<MyOpps />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/inbox/:leadId" element={<Inbox />} />
          <Route path="/approvals" element={<Approvals />} />
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
        </Routes>
      </div>
      <DrawerHost />
    </div>
  )
}
