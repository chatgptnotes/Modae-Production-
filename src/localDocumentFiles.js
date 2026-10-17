const DB = 'wintrack-local-documents', STORE = 'files'
const identity = row => JSON.stringify([row.recordType, row.recordId, row.folder || '', row.name])
async function run(mode, callback) {
  if (!globalThis.indexedDB) throw new Error('Local document storage is unavailable.')
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = request.onblocked = () => reject(new Error('Local document storage is unavailable.'))
  })
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, mode)
      let value
      callback(transaction.objectStore(STORE), v => { value = v })
      transaction.oncomplete = () => resolve(value)
      transaction.onabort = transaction.onerror = () => reject(new Error('Local document storage request failed.'))
    })
  } finally { db.close() }
}
export const listLocalDocumentFiles = () => run('readonly', (store, set) => { const req = store.getAll(); req.onsuccess = () => set(req.result || []) })
export const putLocalDocumentFile = row => run('readwrite', store => store.put(row, identity(row)))
export const getLocalDocumentFile = row => run('readonly', (store, set) => { const req = store.get(identity(row)); req.onsuccess = () => set(req.result || null) })
export const deleteLocalDocumentFile = row => run('readwrite', store => store.delete(identity(row)))
export const replaceLocalDocumentFiles = rows => run('readwrite', store => { store.clear(); for (const row of rows) store.put(row, identity(row)) })
export const clearLocalDocumentFiles = () => replaceLocalDocumentFiles([])
