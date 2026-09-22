// SharePoint / Microsoft Graph integration for opportunity document folders.
// Config lives in localStorage (NOT the store) so credentials survive resetDemo().
// Folder layout: <rootFolder>/<statusFolder>/<oppId>/<subfolder>/<files>
// where statusFolder is one of Open | WON | Closed | Not In Opp List.
import { PublicClientApplication } from '@azure/msal-browser'
import { SUBFOLDERS } from './seed.js'

const CFG_KEY = 'wintrack-sharepoint-v1'
const GRAPH = 'https://graph.microsoft.com/v1.0'
const SCOPES = ['User.Read', 'Files.ReadWrite.All', 'Sites.ReadWrite.All']
const STATUS_FOLDERS = ['Open', 'WON', 'Closed', 'Not In Opp List']
// Fields that identify the connection — changing any of them invalidates the
// cached site/drive/folder ids resolved against the old connection.
const CONNECTION_FIELDS = ['clientId', 'tenantId', 'siteHostname', 'sitePath', 'library']

const DEFAULTS = {
  clientId: '',
  tenantId: '',
  siteHostname: '',
  sitePath: '/sites/Sales',
  library: 'Documents',
  rootFolder: 'Opportunities',
  siteId: '',
  driveId: '',
  folderIds: {}
}

// ---------- config ----------

export function getConfig() {
  let stored = {}
  try { stored = JSON.parse(localStorage.getItem(CFG_KEY) || '{}') || {} } catch { /* corrupt json → defaults */ }
  return { ...DEFAULTS, ...stored, folderIds: { ...(stored.folderIds || {}) } }
}

export function configure(patch) {
  const prev = getConfig()
  const next = { ...prev, ...patch }
  const connChanged = CONNECTION_FIELDS.some(k => k in patch && patch[k] !== prev[k])
  if (connChanged) {
    next.siteId = ''
    next.driveId = ''
    next.folderIds = {}
  } else if ('rootFolder' in patch && patch.rootFolder !== prev.rootFolder) {
    next.folderIds = {}
  }
  localStorage.setItem(CFG_KEY, JSON.stringify(next))
  return next
}

export function isConfigured() {
  const c = getConfig()
  return !!(c.clientId && c.siteHostname && c.sitePath)
}

function requireConfigured() {
  if (!isConfigured()) throw new Error('SharePoint not configured')
}

// ---------- MSAL auth ----------

let msalApp = null
let msalKey = ''
let msalReady = null
let msalInitialized = false
let currentAccount = null

// msal v3 requires an async initialize() before any other API call, so keep a
// lazy singleton keyed on clientId|tenantId (recreated when either changes).
async function ensureMsal() {
  requireConfigured()
  const cfg = getConfig()
  const key = cfg.clientId + '|' + cfg.tenantId
  if (!msalApp || msalKey !== key) {
    msalApp = new PublicClientApplication({
      auth: {
        clientId: cfg.clientId,
        authority: 'https://login.microsoftonline.com/' + (cfg.tenantId || 'organizations'),
        redirectUri: window.location.origin
      },
      cache: { cacheLocation: 'localStorage' }
    })
    msalKey = key
    msalInitialized = false
    msalReady = msalApp.initialize().then(() => { msalInitialized = true })
  }
  await msalReady
  return msalApp
}

export function getAccount() {
  if (currentAccount) return currentAccount
  if (!isConfigured()) return null
  try {
    if (msalApp && msalInitialized) {
      currentAccount = msalApp.getAllAccounts()[0] || null
    } else {
      // Kick off init in the background so later sync calls can answer.
      ensureMsal().then(app => {
        if (!currentAccount) currentAccount = app.getAllAccounts()[0] || null
      }).catch(() => {})
    }
  } catch { /* not initialized yet */ }
  return currentAccount
}

// Popup flow — redirect auth must preserve the browser-router URL.
export async function signIn() {
  const app = await ensureMsal()
  const res = await app.loginPopup({ scopes: SCOPES })
  currentAccount = res.account || app.getAllAccounts()[0] || null
  if (currentAccount) app.setActiveAccount(currentAccount)
  return currentAccount
}

export async function signOut() {
  const account = currentAccount
  currentAccount = null
  try {
    const app = await ensureMsal()
    await app.logoutPopup(account ? { account } : undefined)
  } catch { /* best-effort — local state is already cleared */ }
}

async function getToken() {
  const app = await ensureMsal()
  const account = currentAccount || app.getAllAccounts()[0]
  if (!account) throw new Error('Not signed in to SharePoint')
  try {
    const res = await app.acquireTokenSilent({ scopes: SCOPES, account })
    return res.accessToken
  } catch {
    const res = await app.acquireTokenPopup({ scopes: SCOPES })
    if (res.account) currentAccount = res.account
    return res.accessToken
  }
}

// ---------- Graph plumbing ----------

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function graphError(res) {
  const err = new Error('Graph request failed (' + res.status + ')')
  err.status = res.status
  try {
    const body = await res.json()
    if (body && body.error) {
      err.code = body.error.code || ''
      if (body.error.message) err.message = body.error.message
    }
  } catch { /* non-JSON error body */ }
  return err
}

async function graphFetch(path, opts = {}) {
  requireConfigured()
  const token = await getToken()
  let delay = 2000
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(GRAPH + path, {
      ...opts,
      headers: { Authorization: 'Bearer ' + token, ...(opts.headers || {}) }
    })
    if ((res.status === 429 || res.status === 503) && attempt < 3) {
      const ra = parseFloat(res.headers.get('Retry-After'))
      await sleep(isNaN(ra) ? delay : ra * 1000)
      delay *= 2
      continue
    }
    if (!res.ok) throw await graphError(res)
    if (res.status === 204) return null
    const ct = res.headers.get('content-type') || ''
    return ct.includes('json') ? res.json() : res
  }
}

export function encodePath(...segments) {
  return segments.map(s => encodeURIComponent(s)).join('/')
}

// ---------- site / drive resolution ----------

export async function resolveSite() {
  requireConfigured()
  const cfg = getConfig()
  if (cfg.siteId) return cfg.siteId
  const site = await graphFetch('/sites/' + cfg.siteHostname + ':' + cfg.sitePath)
  configure({ siteId: site.id })
  return site.id
}

export async function resolveDrive() {
  requireConfigured()
  const cfg = getConfig()
  if (cfg.driveId) return cfg.driveId
  const siteId = await resolveSite()
  let driveId = ''
  try {
    const drives = await graphFetch('/sites/' + siteId + '/drives')
    const match = (drives.value || []).find(d => d.name === cfg.library || d.displayName === cfg.library)
    driveId = (match && match.id) || ''
  } catch { /* fall through to default drive */ }
  if (!driveId) {
    const drive = await graphFetch('/sites/' + siteId + '/drive')
    driveId = drive.id
  }
  configure({ driveId })
  return driveId
}

// ---------- folders ----------

export function statusFolderFor(opp) {
  // Deleted opps → 'Not In Opp List' is handled by the caller (removeOpp).
  // Must agree with Folders.jsx grouping: a row closed directly via the Status
  // dropdown (status 'Closed', stage still e.g. RFQ) belongs in Closed.
  const stage = String((opp && opp.stage) || '')
  const status = String((opp && opp.status) || '')
  if (stage === 'Won' || status === 'Won') return 'WON'
  if (stage === 'Lost' || status === 'Lost' || status === 'Closed') return 'Closed'
  return 'Open'
}

async function createFolder(parentSegments, name) {
  const driveId = await resolveDrive()
  const path = parentSegments.length
    ? '/drives/' + driveId + '/root:/' + encodePath(...parentSegments) + ':/children'
    : '/drives/' + driveId + '/root/children'
  try {
    await graphFetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' })
    })
  } catch (e) {
    if (e.status === 409 || e.code === 'nameAlreadyExists') return
    throw e
  }
}

export async function ensurePath(segments) {
  for (let i = 0; i < segments.length; i++) {
    await createFolder(segments.slice(0, i), segments[i])
  }
}

export async function ensureFolder(path) {
  requireConfigured()
  const segments = Array.isArray(path) ? path : String(path).split('/').filter(Boolean)
  await ensurePath(segments)
}

// Per-opp promise chains so ensure/move for the same opportunity never race.
const oppQueues = {}
function serialized(oppId, fn) {
  const prev = oppQueues[oppId] || Promise.resolve()
  const next = prev.catch(() => {}).then(fn)
  oppQueues[oppId] = next
  return next
}

export function ensureOppFolder(opp) {
  requireConfigured()
  return serialized(opp.id, async () => {
    const cfg = getConfig()
    // Prefer the folder's ACTUAL location (a failed/racing move may have left
    // it elsewhere) — creating a second tree at the computed status would
    // split the files and 409 the eventual move.
    const found = await findOppFolder(opp.id).catch(() => null)
    const status = (found && found.status) || statusFolderFor(opp)
    const base = [cfg.rootFolder, status, opp.id]
    await ensurePath(base)
    for (const sub of SUBFOLDERS) {
      await createFolder(base, sub)
    }
    return status
  })
}

export async function findOppFolder(oppId) {
  requireConfigured()
  const cached = getConfig().folderIds[oppId]
  if (cached && cached.itemId) return cached
  const driveId = await resolveDrive()
  const root = getConfig().rootFolder
  for (const status of STATUS_FOLDERS) {
    try {
      const item = await graphFetch('/drives/' + driveId + '/root:/' + encodePath(root, status, oppId))
      const rec = { itemId: item.id, status }
      configure({ folderIds: { ...getConfig().folderIds, [oppId]: rec } })
      return rec
    } catch (e) {
      if (e.status === 404) continue
      throw e
    }
  }
  return null
}

export function moveOppFolder(opp, fromStatus, toStatus) {
  requireConfigured()
  return serialized(opp.id, async () => {
    const cfg = getConfig()
    const driveId = await resolveDrive()
    const found = await findOppFolder(opp.id)
    if (!found) {
      // Nothing to move — create the folder tree at the destination instead.
      const base = [cfg.rootFolder, toStatus, opp.id]
      await ensurePath(base)
      for (const sub of SUBFOLDERS) await createFolder(base, sub)
      return
    }
    if (found.status === toStatus) return
    await ensurePath([cfg.rootFolder, toStatus])
    const dest = await graphFetch('/drives/' + driveId + '/root:/' + encodePath(cfg.rootFolder, toStatus))
    await graphFetch('/drives/' + driveId + '/items/' + found.itemId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentReference: { id: dest.id } })
    })
    configure({ folderIds: { ...getConfig().folderIds, [opp.id]: { itemId: found.itemId, status: toStatus } } })
  })
}

// ---------- files ----------

function fmtSize(bytes) {
  const n = Number(bytes) || 0
  if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB'
  return Math.max(1, Math.round(n / 1024)) + ' KB'
}

// Upload session chunks must be a multiple of 320 KiB — 16 x 320 KiB = 5 MiB.
const SMALL_FILE_LIMIT = 4 * 1024 * 1024
const CHUNK_SIZE = 320 * 1024 * 16

export async function uploadFile(oppId, statusFolder, subfolder, file) {
  requireConfigured()
  const cfg = getConfig()
  const driveId = await resolveDrive()
  const filePath = encodePath(cfg.rootFolder, statusFolder, oppId, subfolder, file.name)
  let item
  if (file.size < SMALL_FILE_LIMIT) {
    item = await graphFetch(
      '/drives/' + driveId + '/root:/' + filePath + ':/content?@microsoft.graph.conflictBehavior=replace',
      { method: 'PUT', body: file }
    )
  } else {
    const session = await graphFetch(
      '/drives/' + driveId + '/root:/' + filePath + ':/createUploadSession',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'replace', name: file.name } })
      }
    )
    for (let start = 0; start < file.size; start += CHUNK_SIZE) {
      const end = Math.min(start + CHUNK_SIZE, file.size)
      const res = await fetch(session.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Range': 'bytes ' + start + '-' + (end - 1) + '/' + file.size },
        body: file.slice(start, end)
      })
      if (!res.ok) throw await graphError(res)
      if (res.status === 200 || res.status === 201) item = await res.json()
    }
  }
  return {
    name: (item && item.name) || file.name,
    size: file.size,
    webUrl: item && item.webUrl,
    itemId: item && item.id,
    lastModified: item && item.lastModifiedDateTime
  }
}

export async function listFiles(opp) {
  requireConfigured()
  const cfg = getConfig()
  const driveId = await resolveDrive()
  // Prefer the actual folder location — the opp may not have been moved yet.
  const found = await findOppFolder(opp.id).catch(() => null)
  const status = (found && found.status) || statusFolderFor(opp)
  const out = {}
  for (const sub of SUBFOLDERS) {
    try {
      const res = await graphFetch(
        '/drives/' + driveId + '/root:/' + encodePath(cfg.rootFolder, status, opp.id, sub) +
        ':/children?$select=id,name,size,lastModifiedDateTime,webUrl,file'
      )
      out[sub] = (res.value || []).filter(it => it.file).map(it => ({
        name: it.name,
        size: fmtSize(it.size),
        date: String(it.lastModifiedDateTime || '').slice(0, 10),
        webUrl: it.webUrl,
        itemId: it.id
      }))
    } catch (e) {
      if (e.status === 404) out[sub] = []
      else throw e
    }
  }
  return out
}

export async function deleteItem(itemId) {
  requireConfigured()
  await graphFetch('/drives/' + await resolveDrive() + '/items/' + itemId, { method: 'DELETE' })
}

// ---------- diagnostics ----------

export async function testConnection() {
  try {
    requireConfigured()
    const siteId = await resolveSite()
    const driveId = await resolveDrive()
    const site = await graphFetch('/sites/' + siteId + '?$select=displayName,webUrl')
    const drive = await graphFetch('/drives/' + driveId + '?$select=name,webUrl')
    const root = getConfig().rootFolder
    try {
      await graphFetch('/drives/' + driveId + '/root:/' + encodePath(root))
    } catch (e) {
      if (e.status === 404) {
        return {
          ok: true,
          siteName: site.displayName,
          driveName: drive.name,
          webUrl: drive.webUrl,
          message: 'Connected — root folder ' + root + ' missing; it will be created on first sync'
        }
      }
      throw e
    }
    return { ok: true, siteName: site.displayName, driveName: drive.name, webUrl: drive.webUrl }
  } catch (e) {
    return { ok: false, message: (e && e.message) || String(e) }
  }
}

// Eager init at module load: an already-signed-in session should be visible to
// the very first filestore.activeBackend() check, not only after a UI action
// happens to touch MSAL.
if (isConfigured()) {
  ensureMsal().then(app => {
    if (!currentAccount) currentAccount = app.getAllAccounts()[0] || null
  }).catch(() => {})
}
