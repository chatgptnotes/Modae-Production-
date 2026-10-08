import React, { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { canSeePage } from '../utils.js'
import { Icon } from '../icons.jsx'
import { InstallButton } from '../install.jsx'
import { activeBackend } from '../filestore.js'
import { WorkspaceThemeButton } from '../ui/WorkspaceThemeContext.jsx'

export const MOBILE_DESTINATIONS = [
  ['Dashboard', '/my-dashboard', 'mydashboard', 'chartBar'],
  ['Lead inbox', '/inbox', 'inbox', 'inbox'],
  ['Opportunities', '/opportunities', 'tracker', 'cards'],
  ['Approvals', '/approvals', 'approvals', 'checkCircle'],
  ['Proposal Sent', '/proposal-sent', 'proposalSent', 'send'],
  ['Purchase Orders', '/po', 'po', 'clipboardCheck'],
  ['Update opportunity status', '/my', 'my', 'clock'],
  ['New opportunity', '/new', 'new', 'plus'],
  ['Tender intake', '/tender', 'tender', 'folder'],
  ['Documents', '/folders', 'folders', 'folder'],
  ['Customers', '/customers', 'customers', 'users'],
  ['Price Lists', '/pricelists', 'pricelists', 'tag'],
  ['Analytics', '/analytics', 'analytics', 'chartBar'],
  ['Voice update', '/voice', 'voice', 'mic'],
  ['AI and automation', '/aimap', 'aimap', 'sparkles'],
  ['Admin configuration', '/admin', 'admin', 'gear'],
  ['Workflow configuration', '/admin/workflow', 'admin', 'gear'],
  ['Audit Trail', '/audit', 'audit', 'list'],
  ['Users and roles', '/users', 'users', 'shield'],
  ['Demo launcher', '/launcher', 'launcher', 'play'],
  ['Workspace home', '/home', 'tracker', 'cards'],
]

export default function MobileMore() {
  const store = useStore()
  const nav = useNavigate()
  const location = useLocation()
  const [query, setQuery] = useState('')
  const destinations = MOBILE_DESTINATIONS.filter(([label, , page]) => canSeePage(store.roles || store.role, page) && label.toLowerCase().includes(query.trim().toLowerCase()))
  return <div className="page mobile-more">
    <label className="mobile-menu-search">Find a page<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search pages and tools" /></label>
    <nav className="mobile-destinations" aria-label="All workspace pages">
      {['Sales', 'Records', 'Administration'].map(group => {
        const records = ['/folders', '/customers', '/pricelists', '/audit']
        const admin = ['/admin', '/admin/workflow', '/users', '/aimap', '/launcher', '/home']
        const primary = ['/my-dashboard', '/inbox', '/opportunities', '/approvals']
        const items = destinations.filter(([, to]) => (query || !primary.includes(to)) && (records.includes(to) ? 'Records' : admin.includes(to) ? 'Administration' : 'Sales') === group)
        return items.length ? <section className="mobile-destination-group" key={group}><h2>{group}</h2>{items.map(([label, to, , icon]) => <Link key={to} to={to}><Icon name={icon} size={20} /><span>{label}</span><Icon name="chevronRight" size={16} /></Link>)}</section> : null
      })}
      {!destinations.length && <p>No matching pages available.</p>}
    </nav>
    <section className="mobile-settings" aria-label="Workspace settings">
      <div><span>Appearance</span><WorkspaceThemeButton /></div>
      <p>File storage: {activeBackend()}</p>
      <InstallButton />
      <button type="button" onClick={() => { store.setViewMode('full'); nav(location.state?.from || '/my-dashboard', { replace: true }) }}><Icon name="monitor" size={18} />Full site</button>
      {store.auth?.user && <button type="button" onClick={store.logout}><Icon name="logout" size={18} />Sign out</button>}
    </section>
  </div>
}
