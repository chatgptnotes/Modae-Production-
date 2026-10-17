import { workspaceSyncState } from './workspaceSyncState.js'
import { clearSupabaseSession } from './supabase.js'
import { clearLocalAll as clearLocalLeadBlobs } from './leadBlobs.js'
import { clearLocalDocumentFiles } from './localDocumentFiles.js'
import { DEPLOYMENT_MARKER_KEY, recordDeploymentMarker, shouldResetForDeployment } from './deploymentMarker.js'

// Vite replaces this at build time. Local development deliberately uses a
// stable identity so the dev server does not invalidate the browser on every
// hot reload.
export const DEPLOYMENT_ID = typeof __APP_DEPLOYMENT_ID__ === 'string'
  ? __APP_DEPLOYMENT_ID__
  : 'local'

const RESET_SIGNAL_KEY = 'wintrack-modae-deployment-reset'
let resetInProgress = false

// The first deployment carrying this feature must also clean browsers that
// predate the marker. A browser with no existing state is already clean.
export function deploymentNeedsReset() {
  if (typeof window === 'undefined' || DEPLOYMENT_ID === 'local') return false
  let local = null
  let session = null
  try { local = window.localStorage } catch { /* storage may be blocked */ }
  try { session = window.sessionStorage } catch { /* storage may be blocked */ }
  return shouldResetForDeployment(DEPLOYMENT_ID, local, session)
}

async function clearOriginCaches() {
  if (typeof caches !== 'undefined') {
    try {
      const names = await caches.keys()
      await Promise.all(names.map(name => caches.delete(name)))
    } catch { /* cache cleanup is best effort */ }
  }
  if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map(registration => registration.unregister()))
    } catch { /* service-worker cleanup is best effort */ }
  }
}

function clearAccessibleCookies() {
  if (typeof document === 'undefined') return
  try {
    for (const cookie of document.cookie.split(';')) {
      const name = cookie.split('=')[0]?.trim()
      if (name) document.cookie = `${name}=; Max-Age=0; path=/`
    }
  } catch { /* HttpOnly or restricted cookies are not script-accessible */ }
}

export async function resetBrowserForDeployment() {
  if (resetInProgress) return
  resetInProgress = true
  try { await clearSupabaseSession() } catch { /* local cleanup must continue */ }
  try { await clearLocalLeadBlobs() } catch { /* local cleanup must continue */ }
  try { await clearLocalDocumentFiles() } catch { /* local cleanup must continue */ }
  // A deployment invalidates any interrupted local restore, including its
  // recovery copy of files and credentials from the previous browser session.
  try {
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase('wintrack-backup-recovery')
      request.onsuccess = resolve
      request.onerror = reject
      request.onblocked = reject
    })
  } catch { /* another tab may still hold the database */ }
  await clearOriginCaches()
  clearAccessibleCookies()
  try { localStorage.clear() } catch { /* storage is optional */ }
  try { sessionStorage.clear() } catch { /* storage is optional */ }
  try {
    recordDeploymentMarker(localStorage, DEPLOYMENT_ID)
    localStorage.setItem(RESET_SIGNAL_KEY, String(Date.now()))
  } catch { /* storage is optional */ }
}

export async function resetAndReload() {
  if (resetInProgress) return
  await resetBrowserForDeployment()
  window.location.replace(window.location.href)
}

async function fetchDeploymentId() {
  try {
    const response = await fetch('/api/app-version', { cache: 'no-store', credentials: 'same-origin' })
    if (!response.ok) return ''
    const payload = await response.json()
    return String(payload?.deploymentId || '')
  } catch { return '' }
}

export function watchDeployment() {
  if (typeof window === 'undefined' || DEPLOYMENT_ID === 'local') return () => {}
  const check = async () => {
    const remote = await fetchDeploymentId()
    if (remote && remote !== DEPLOYMENT_ID) await resetAndReload()
  }
  const onStorage = event => {
    if (event.key === RESET_SIGNAL_KEY && event.newValue) void resetAndReload()
  }
  let scheduled=null
  const onWake = () => {
    if(workspaceSyncState.enabled||document.visibilityState==='hidden'||scheduled!==null)return
    scheduled=window.setTimeout(()=>{scheduled=null;void check()},100)
  }
  window.addEventListener('storage', onStorage)
  window.addEventListener('focus', onWake)
  document.addEventListener('visibilitychange', onWake)
  window.addEventListener('online', onWake)
  void check()
  return () => {
    window.clearTimeout(scheduled)
    window.removeEventListener('storage', onStorage)
    window.removeEventListener('focus', onWake)
    document.removeEventListener('visibilitychange', onWake)
    window.removeEventListener('online', onWake)
  }
}

export const deploymentStorageKeys = { DEPLOYMENT_KEY: DEPLOYMENT_MARKER_KEY, RESET_SIGNAL_KEY }
