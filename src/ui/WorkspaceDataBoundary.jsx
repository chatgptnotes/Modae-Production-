import React, { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { dbEnabled } from '../datastore.js'
import { workspaceViewForPath } from '../workspaceViews.js'

// Both desktop and phone pass through this gate. Never mount an editor with
// missing data disguised as an empty record.
export default function WorkspaceDataBoundary({ children }) {
  const store = useStore(), ref = useRef(store)
  ref.current = store
  const { pathname } = useLocation()
  const actor = store.auth?.user?.id
  const view = workspaceViewForPath(pathname)
  const key = JSON.stringify([actor, view])
  const [status, setStatus] = useState({ key: '', value: 'loading' })
  const [retry, setRetry] = useState(0)
  const enabled = dbEnabled() && !!actor && store.authReady
  useEffect(() => {
    if (!enabled) return
    let active = true
    setStatus({ key, value: 'loading' })
    void ref.current.ensureWorkspaceView(view, { force: retry > 0 }).then(async ok => {
      if (ok && (view.kind === 'detail' || view.kind === 'full')) {
        await ref.current.ensurePriceLists()
      }
      if (active) setStatus({ key, value: ok ? 'ready' : 'error' })
    }).catch(() => { if (active) setStatus({ key, value: 'error' }) })
    const refresh = () => {
      if (document.visibilityState === 'visible') void ref.current.ensureWorkspaceView(view)
    }
    window.addEventListener('focus', refresh)
    window.addEventListener('online', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => { active = false; window.removeEventListener('focus', refresh); window.removeEventListener('online', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [enabled, key, retry])
  if (!enabled) return children
  if (status.key !== key || status.value === 'loading') return <main className="page" role="status">Loading workspace…</main>
  if (status.value === 'error') return <main className="page" role="alert"><p>{store.syncDiagnostics?.lastLoadError?.message || 'Workspace data could not be loaded.'}</p><button onClick={() => setRetry(n => n + 1)}>Retry</button></main>
  return children
}
