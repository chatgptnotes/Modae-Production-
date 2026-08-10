import React from 'react'
import { Routes, Route, NavLink } from 'react-router-dom'
import { useStore } from './store.jsx'
import { FormulaBar } from './formulabar.jsx'
import Tracker from './pages/Tracker.jsx'
import IntakeForm from './pages/IntakeForm.jsx'
import Folders from './pages/Folders.jsx'
import Proposal from './pages/Proposal.jsx'
import PriceLists from './pages/PriceLists.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Customers from './pages/Customers.jsx'

const TABS = [
  { to: '/', label: 'Opportunity Tracker' },
  { to: '/new', label: '+ New Opportunity' },
  { to: '/folders', label: 'Folders' },
  { to: '/pricelists', label: 'Price Lists' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/customers', label: 'Customers' },
]

export default function App() {
  const store = useStore()
  return (
    <>
      <div className="ribbon">
        <div className="title-row">
          <span className="logo">WinTrack</span>
          <span className="subtitle">Modae — sales opportunity &amp; proposal workspace (prototype)</span>
          <span className="spacer" />
          <button className="reset" onClick={store.resetDemo} title="Clear local changes and reload seed data">
            Reset demo data
          </button>
        </div>
        <nav className="nav-tabs">
          {TABS.map(t => (
            <NavLink key={t.to} to={t.to} end={t.to === '/'}
              className={({ isActive }) => (isActive ? 'active' : '')}>
              {t.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <FormulaBar />
      <Routes>
        <Route path="/" element={<Tracker />} />
        <Route path="/new" element={<IntakeForm />} />
        <Route path="/folders" element={<Folders />} />
        <Route path="/folders/:oppId" element={<Folders />} />
        <Route path="/folders/:oppId/:sub" element={<Folders />} />
        <Route path="/proposal/:oppId" element={<Proposal />} />
        <Route path="/pricelists" element={<PriceLists />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/customers" element={<Customers />} />
      </Routes>
    </>
  )
}
