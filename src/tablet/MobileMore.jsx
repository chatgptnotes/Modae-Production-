import React, { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { mobileDestinations } from './mobileDestinations.js'
import { Icon } from '../icons.jsx'
import { InstallButton } from '../install.jsx'
import { activeBackend } from '../filestore.js'

export { MOBILE_DESTINATIONS } from './mobileDestinations.js'

export default function MobileMore() {
  const store = useStore()
  const nav = useNavigate()
  const location = useLocation()
  const [query, setQuery] = useState('')
  const destinations = mobileDestinations(store, query)
  return <div className="page mobile-more">
    <label className="mobile-menu-search"><span>Find a page</span><span className="mobile-menu-search-field"><Icon name="search" size={20} /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search pages and tools" /></span></label>
    <nav className="mobile-destinations" aria-label="All workspace pages">
      {['Sales', 'Records', 'Administration'].map(group => {
        const records = ['/folders', '/customers', '/pricelists', '/audit']
        const admin = ['/admin', '/admin/workflow', '/users', '/aimap', '/launcher', '/home']
        const primary = ['/my-dashboard', '/inbox', '/opportunities', '/approvals']
        const items = destinations.filter(([, to]) => (query || !primary.includes(to)) && (records.includes(to) ? 'Records' : admin.includes(to) ? 'Administration' : 'Sales') === group)
        return items.length ? <section className="mobile-destination-group" key={group}><h2>{group}</h2>{items.map(([label, to, , icon]) => <Link key={to} to={to}><Icon name={icon} size={20} /><span>{label}{to === '/aimap' && <small>Live features and roadmap previews</small>}</span><Icon name="chevronRight" size={16} /></Link>)}</section> : null
      })}
      {!destinations.length && <p>No matching pages available.</p>}
    </nav>
    <section className="mobile-settings" aria-label="Workspace settings">
      <p>File storage: {activeBackend()}</p>
      <InstallButton />
      <button type="button" onClick={() => { store.setViewMode('full'); nav(location.state?.from || '/my-dashboard', { replace: true }) }}><Icon name="monitor" size={18} />Full site</button>
      {store.auth?.user && <button type="button" onClick={store.logout}><Icon name="logout" size={18} />Sign out</button>}
    </section>
  </div>
}
