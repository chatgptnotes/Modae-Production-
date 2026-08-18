// Persistent store for the actual bytes of files attached to a lead.
//
// The main store persists to localStorage, which cannot hold blobs, so the lead
// record keeps only metadata (name, size, pages, extracted text). IndexedDB can
// hold the blob itself — that is what makes an attachment viewable after a
// reload, and what keeps the registration upload working across one.
//
// Every function degrades to a safe empty value when IndexedDB is unavailable
// (private mode, blocked storage): the feature falls back to the old
// in-memory-only behaviour instead of breaking the page.
const DB_NAME = 'modae-lead-files'
const STORE = 'files'
const VERSION = 1

const keyOf = (leadId, name) => leadId + '::' + name

let dbPromise = null

function openDb() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise(resolve => {
    if (typeof indexedDB === 'undefined') { resolve(null); return }
    let req
    try {
      req = indexedDB.open(DB_NAME, VERSION)
    } catch (e) {
      resolve(null); return
    }
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE).createIndex('leadId', 'leadId', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
    req.onblocked = () => resolve(null)
  })
  return dbPromise
}

// One transaction, resolved from its completion rather than each request, so a
// multi-file put either lands whole or not at all.
function tx(mode, run, fallback) {
  return openDb().then(db => {
    if (!db) return fallback
    return new Promise(resolve => {
      let out = fallback
      let t
      try {
        t = db.transaction(STORE, mode)
      } catch (e) {
        resolve(fallback); return
      }
      const store = t.objectStore(STORE)
      try {
        run(store, v => { out = v })
      } catch (e) {
        resolve(fallback); return
      }
      t.oncomplete = () => resolve(out)
      t.onerror = () => resolve(fallback)
      t.onabort = () => resolve(fallback)
    })
  }).catch(() => fallback)
}

export function putFiles(leadId, files) {
  const real = (files || []).filter(Boolean)
  if (!real.length) return Promise.resolve()
  return tx('readwrite', store => {
    for (const file of real) {
      store.put({ leadId, name: file.name, type: file.type || '', blob: file }, keyOf(leadId, file.name))
    }
  })
}

// Returns a File/Blob, or null when this lead never had the bytes stored.
export function getFile(leadId, name) {
  return tx('readonly', (store, set) => {
    const req = store.get(keyOf(leadId, name))
    req.onsuccess = () => set(req.result ? req.result.blob : null)
  }, null)
}

export function listFiles(leadId) {
  return tx('readonly', (store, set) => {
    const req = store.index('leadId').getAll(leadId)
    req.onsuccess = () => set((req.result || []).map(r => r.blob).filter(Boolean))
  }, [])
}

export function deleteLead(leadId) {
  return tx('readwrite', store => {
    const req = store.index('leadId').getAllKeys(leadId)
    req.onsuccess = () => { for (const k of req.result || []) store.delete(k) }
  })
}

export function clearAll() {
  return tx('readwrite', store => { store.clear() })
}
