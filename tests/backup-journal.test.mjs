import test from 'node:test'
import assert from 'node:assert/strict'
import { restoreLocalBackupWithJournal, recoverLocalBackupRestore } from '../src/localBackupJournal.js'
import { replaceLocalLeadFiles, backupLocalLeadFiles } from '../src/leadBlobs.js'
import { replaceLocalDocumentFiles, listLocalDocumentFiles } from '../src/localDocumentFiles.js'

// Minimal deterministic IndexedDB test double. Real Blob structured-cloning is
// retained so rollback assertions inspect original bytes, not just metadata.
function memoryIndexedDb() {
  const databases = new Map()
  return { open(name) {
    const req = {}, fresh = !databases.has(name)
    if (fresh) databases.set(name, new Map())
    const stores = databases.get(name)
    const db = { objectStoreNames: { contains: key => stores.has(key) }, close() {}, createObjectStore(key) { stores.set(key, new Map()); return { createIndex() {} } }, transaction(key) {
      const tx = {}, values = stores.get(key); let timer
      const schedule = operation => {
        const request = {}
        clearTimeout(timer)
        setTimeout(() => { request.result = operation(); request.onsuccess?.(); clearTimeout(timer); timer = setTimeout(() => tx.oncomplete?.(), 0) }, 0)
        return request
      }
      tx.objectStore = () => ({ get: id => schedule(() => structuredClone(values.get(id))), getAll: () => schedule(() => structuredClone([...values.values()])), put: (value,id) => schedule(() => { values.set(id,structuredClone(value)); return id }), delete: id => schedule(() => values.delete(id)), clear: () => schedule(() => values.clear()) })
      return tx
    } }
    setTimeout(() => { req.result = db; if (fresh) req.onupgradeneeded?.(); req.onsuccess?.() },0)
    return req
  } }
}
test('local restore journal recovers files and state on failure and tolerates postcommit cleanup failure', async () => {
  globalThis.indexedDB = memoryIndexedDb()
  let lock = Promise.resolve()
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: { request: (_name,_options,operation) => { const next = lock.then(operation); lock = next.catch(() => {}); return next } } } })
  const items = new Map(), storage = { getItem: key => items.get(key) ?? null, setItem: (key,value) => items.set(key,String(value)), removeItem: key => items.delete(key) }
  globalThis.localStorage = storage
  const stateKey = 'test-state', before = JSON.stringify({ opportunities: [], retained: true })
  storage.setItem(stateKey,before)
  await replaceLocalLeadFiles([{leadId:'L-OLD',name:'old.pdf',type:'application/pdf',blob:new Blob(['old bytes'])}])
  await replaceLocalDocumentFiles([{recordType:'opportunity',recordId:'O-OLD',folder:'Specs',name:'spec.pdf',blob:new Blob(['original spec'])}])
  const backup = {payload:{state:{opportunities:[{id:'O-NEW'}]}},files:[{meta:{backend:'indexeddb',leadId:'L-NEW',name:'new.pdf'},bytes:new TextEncoder().encode('new bytes')}]}
  await assert.rejects(restoreLocalBackupWithJournal(backup,{stateKey,restoreLocal:async () => { throw new Error('synthetic quota error') }}),/quota/)
  assert.equal(storage.getItem(stateKey),before)
  assert.equal(await (await backupLocalLeadFiles())[0].blob.text(),'old bytes')
  assert.equal(await (await listLocalDocumentFiles())[0].blob.text(),'original spec')
  assert.equal(await recoverLocalBackupRestore(stateKey),false)
  const originalRemove = storage.removeItem
  storage.removeItem = key => { if (key==='wintrack-backup-restore-pending') throw new Error('synthetic cleanup error'); originalRemove(key) }
  await restoreLocalBackupWithJournal(backup,{stateKey,restoreLocal:async state => { storage.setItem(stateKey,JSON.stringify(state)); return async () => storage.setItem(stateKey,before) }})
  assert.deepEqual(JSON.parse(storage.getItem(stateKey)),backup.payload.state)
  storage.removeItem = originalRemove
  assert.equal(await recoverLocalBackupRestore(stateKey),true)
  assert.deepEqual(JSON.parse(storage.getItem(stateKey)),backup.payload.state)
  assert.equal(await (await backupLocalLeadFiles())[0].blob.text(),'new bytes')
  assert.equal(await recoverLocalBackupRestore(stateKey),false)
  let finish, entered
  const hasEntered = new Promise(resolve => { entered = resolve })
  const blocked = new Promise(resolve => { finish = resolve })
  const activeRestore = restoreLocalBackupWithJournal(backup,{stateKey,restoreLocal:async state => { entered(); await blocked; storage.setItem(stateKey,JSON.stringify(state)) }})
  await hasEntered
  let recovered = false
  const concurrentRecovery = recoverLocalBackupRestore(stateKey).then(value => { recovered = true; return value })
  await new Promise(resolve => setTimeout(resolve,5))
  assert.equal(recovered,false,'another tab cannot recover a restore still holding the exclusive lock')
  finish(); await activeRestore
  assert.equal(await concurrentRecovery,false)
  delete globalThis.indexedDB; delete globalThis.localStorage
  delete globalThis.navigator
})
