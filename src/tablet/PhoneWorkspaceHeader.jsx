import React, { useState } from 'react'
import { Icon, ModaeLogo } from '../icons.jsx'
import WorkspaceViewToggle from '../ui/WorkspaceViewToggle.jsx'
import { WorkspaceThemeButton } from '../ui/WorkspaceThemeContext.jsx'
import { useWorkspaceView } from '../ui/WorkspaceViewContext.jsx'
import PhoneAccountMenu from './PhoneAccountMenu.jsx'
import './phoneWorkspaceHeader.css'

const syncLabels = { live: 'Live', connecting: 'Connecting', syncing: 'Syncing', offline: 'Offline', 'local-only': 'Local only', degraded: 'Sync incomplete', error: 'Sync unavailable', 'auth-error': 'Sign in required', 'config-error': 'Sync configuration required' }
export default function PhoneWorkspaceHeader({ store = {}, onRefresh, compact = false }) {
  const { scope } = useWorkspaceView()
  const [refreshing, setRefreshing] = useState(false)
  const [message, setMessage] = useState('')
  const localOnly = store.liveSyncStatus === 'local-only'
  async function refresh() {
    if (refreshing) return
    setRefreshing(true)
    try { setMessage(await (onRefresh || store.refreshSharedData)?.() ? 'Workspace updated' : 'Refresh failed. Please try again.') }
    catch { setMessage('Refresh failed. Please try again.') }
    finally { setRefreshing(false) }
  }
  return <div className="phone-workspace-header">
    <header className="mobile-dashboard-header">
      <ModaeLogo size={25} />
      <WorkspaceViewToggle />
      <WorkspaceThemeButton className="mobile-theme-toggle" />
      <PhoneAccountMenu store={store} />
    </header>
    {!compact && <div className="mobile-sync-row"><span className="mobile-sync" data-status={store.liveSyncStatus || 'offline'} role="status"><i />{syncLabels[store.liveSyncStatus] || 'Sync unavailable'}<span>• {localOnly ? 'This device' : scope === 'global' ? 'Shared workspace' : 'Your workspace'}</span></span>
      {!localOnly && <button type="button" className="mobile-refresh-button" aria-label="Refresh workspace" onClick={refresh} disabled={refreshing || store.liveSyncStatus === 'config-error'}><Icon name="refresh" size={16} /></button>}
    </div>}
    {message && <p className="mobile-refresh-message" role="status">{message}</p>}
  </div>
}
