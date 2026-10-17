import { backupLocalLeadFiles, replaceLocalLeadFiles } from './leadBlobs.js'
import { listLocalDocumentFiles, replaceLocalDocumentFiles } from './localDocumentFiles.js'

const NAME = 'wintrack-backup-recovery', STORE = 'journal', MARKER = 'wintrack-backup-restore-pending'
const LOCK = 'wintrack-full-backup-restore'
async function exclusive(operation, allowNoPending = false) {
  if (!globalThis.navigator?.locks?.request) {
    if (allowNoPending && !localStorage.getItem(MARKER)) return false
    throw new Error('This browser must support Web Locks to safely restore or recover a local backup. Use a current Chrome, Edge or Safari version.')
  }
  return navigator.locks.request(LOCK, { mode: 'exclusive' }, operation)
}
async function database() {
  if (!globalThis.indexedDB) throw new Error('IndexedDB is required for recoverable backup restoration.')
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = req.onblocked = () => reject(new Error('Backup recovery storage is unavailable.'))
  })
}
async function journal(operation, value) {
  const db = await database()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, operation === 'get' ? 'readonly' : 'readwrite'), store = tx.objectStore(STORE)
      const request = operation === 'get' ? store.get('restore') : operation === 'delete' ? store.delete('restore') : store.put(value, 'restore')
      let result
      request.onsuccess = () => { result = request.result }
      tx.oncomplete = () => resolve(result)
      tx.onabort = tx.onerror = () => reject(new Error('Could not persist the backup recovery journal.'))
    })
  } finally { db.close() }
}
// Call before boot hydration. A crash either leaves a committed state+file set,
// or rolls both back to the pre-restore snapshot before normal state is read.
async function recoverUnlocked(stateKey) {
  if (!localStorage.getItem(MARKER)) return false
  const pending = await journal('get')
  if (!pending || pending.stateKey !== stateKey) throw new Error('Backup recovery data is missing. Do not clear browser storage.')
  if (!pending.committed) {
    await replaceLocalLeadFiles(pending.beforeFiles)
    await replaceLocalDocumentFiles(pending.beforeDocuments || [])
    if (pending.beforeState === null) localStorage.removeItem(stateKey)
    else localStorage.setItem(stateKey, pending.beforeState)
  }
  localStorage.removeItem(MARKER)
  await journal('delete').catch(() => {})
  return true
}
export async function recoverLocalBackupRestore(stateKey) {
  return exclusive(() => recoverUnlocked(stateKey), true)
}
export async function restoreLocalBackupWithJournal(backup, { stateKey, restoreLocal, expectedState }) {
  return exclusive(async () => {
  await recoverUnlocked(stateKey)
  if (expectedState !== undefined && localStorage.getItem(stateKey) !== expectedState) throw new Error('The workspace changed in another tab. Review the backup again.')
  const beforeFiles = await backupLocalLeadFiles()
  const beforeDocuments = await listLocalDocumentFiles()
  const entry = { stateKey, beforeState: localStorage.getItem(stateKey), beforeFiles, beforeDocuments, committed: false }
  await journal('put', entry)
  localStorage.setItem(MARKER, 'pending')
  let rollback
  try {
    const rows = backup.files.filter(f => f.meta.backend === 'indexeddb').map(({ meta, bytes }) => {
      if (meta.backend !== 'indexeddb' || !meta.leadId || !meta.name) throw new Error('This local backup contains an unsupported file backend.')
      return { leadId: meta.leadId, name: meta.name, type: meta.type || '', blob: new Blob([bytes], { type: meta.type || '' }) }
    })
    const documents = backup.files.filter(f => f.meta.backend === 'local-document').map(({ meta, bytes }) => ({ ...meta, blob: new Blob([bytes], { type: meta.type || '' }) }))
    if (rows.length + documents.length !== backup.files.length) throw new Error('This local backup contains an unsupported file backend.')
    await replaceLocalLeadFiles(rows)
    await replaceLocalDocumentFiles(documents)
    rollback = await restoreLocal(backup.payload.state)
    await journal('put', { ...entry, committed: true })
  } catch (error) {
    if (typeof rollback === 'function') await rollback()
    await recoverUnlocked(stateKey)
    throw error
  }
  // The commit is durable. Cleanup must never turn success into a rollback or
  // leave a marker without its journal. An orphan journal is safe to overwrite.
  try {
    localStorage.removeItem(MARKER)
    await journal('delete').catch(() => {})
  } catch { /* committed journal is cleared during the next boot */ }
  })
}
