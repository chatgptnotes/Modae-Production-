import React, { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useStore, WorkspacePageStoreProvider } from '../store.jsx'
import { dbEnabled } from '../datastore.js'
import { workspaceViewForPath, workspaceNeedsCatalogue } from '../workspaceViews.js'

// Gate page content, keeping navigation mounted. Cached read models are for
// display only; editor actions always use the canonical store and revisions.
export default function WorkspaceDataBoundary({ children }) {
  const store = useStore(), ref = useRef(store)
  ref.current = store
  const { pathname } = useLocation()
  const actor = store.auth?.user?.id
  const view = workspaceViewForPath(pathname)
  const key = JSON.stringify([actor, view])
  const needsCatalogue = workspaceNeedsCatalogue(pathname, view)
  const [status, setStatus] = useState({ key: '', value: 'loading' })
  const [retry, setRetry] = useState(0)
  const enabled = dbEnabled() && !!actor && store.authReady
  const cached = enabled ? store.peekWorkspaceView(view) : null
  useEffect(() => {
    if (!enabled) return
    let active = true, activationTimer
    const load = async (force = false) => {
      if (active) setStatus({ key, value: 'loading' })
      try {
        let ok = await ref.current.ensureWorkspaceView(view, { force })
        // Catalogue bytes load only for a screen that actually uses them.
        if (ok && needsCatalogue) ok = await ref.current.ensurePriceLists({ force }) !== false
        if (active) setStatus({ key, value: ok ? 'ready' : 'error' })
      } catch { if (active) setStatus({ key, value: 'error' }) }
    }
    void load(retry > 0)
    // Focus/visibility/online often arrive together. Coalesce them without a
    // timer that repeats while idle. A fresh activation reads the cache only.
    const refresh = () => {
      clearTimeout(activationTimer)
      if (document.visibilityState !== 'visible' || navigator.onLine === false) return
      activationTimer = setTimeout(() => { void load() }, 100)
    }
    window.addEventListener('focus', refresh)
    window.addEventListener('online', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => { active = false; clearTimeout(activationTimer); window.removeEventListener('focus', refresh); window.removeEventListener('online', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [enabled, key, pathname, retry])
  if (!enabled) return children
  if (!cached && (status.key !== key || status.value === 'loading')) return <div className="page" role="status">Loading this page…</div>
  const failed = status.key === key && status.value === 'error'
  if (needsCatalogue && !store.priceListsLoaded) return <div className="page" role={failed ? 'alert' : 'status'}>{failed ? <>Catalogue data could not be loaded. <button onClick={() => setRetry(n => n + 1)}>Retry</button></> : 'Loading catalogue data…'}</div>
  if (!cached && failed) return <div className="page" role="alert"><p>{store.syncDiagnostics?.lastLoadError?.message || 'This page could not be loaded.'}</p><button onClick={() => setRetry(n => n + 1)}>Retry</button></div>
  return <WorkspacePageStoreProvider result={cached?.value}>
    {failed && <div className="workspace-page-refresh-status" role="status">Could not update this page. Showing the last loaded data. <button onClick={() => setRetry(n => n + 1)}>Retry</button></div>}
    {!failed && cached && !cached.fresh && status.key === key && status.value === 'loading' && <div className="workspace-page-refresh-status" role="status">Updating this page…</div>}
    {children}
  </WorkspacePageStoreProvider>
}

// Workbench stages also change via ?step= without changing the route's record
// scope. Gate the stages that use a catalogue at the point they mount.
export function WorkspaceCatalogueBoundary({ children }) {
  const store = useStore(), ref = useRef(store)
  ref.current = store
  const [error, setError] = useState(false), [retry, setRetry] = useState(0)
  const actor = store.auth?.user?.id
  useEffect(() => {
    if (!dbEnabled() || !actor) return
    let active = true
    const unregister = ref.current.registerCatalogueUse?.()
    void ref.current.ensurePriceLists({ force: retry > 0 }).then(ok => { if (active) setError(ok === false) })
      .catch(() => { if (active) setError(true) })
    return () => { active = false; unregister?.() }
  }, [actor, retry])
  if (dbEnabled() && actor && !store.priceListsLoaded) return <div role={error ? 'alert' : 'status'}>{error ? <>Catalogue data could not be loaded. <button onClick={() => setRetry(n => n + 1)}>Retry</button></> : 'Loading catalogue data…'}</div>
  return children
}
