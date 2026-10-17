import test from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { createHmac } from 'node:crypto'
import { createBackupArchive, readBackupArchive, cleanBackupValue, isEmptyBackupWorkspace, localBackupState, backupSummary, backupFileReferences, missingBackupFiles } from '../src/workspaceBackup.js'

const source = { kind: 'local' }
test('full backup restores long text, Unicode, nested booking evidence and original document bytes', async () => {
  const state = { opportunities: [{ id: 'O-1', sellTo: 'Test', note: 'a'.repeat(23910) + '😀'.repeat(100) + '\nEnd\uFFFE\u0000', booking: { signatures: [{ actor: 'u', amount: 123456789.123 }] } }], customers: [{ id: 'c' }], config: { accessPolicy: { version: 1 } }, users: [{ id: 'u', name: 'Person', pw: 'do-not-export' }], auth: { session: 'never-export' } }
  const bytes = new Uint8Array([0, 1, 127, 255, 45])
  const exported = await createBackupArchive({ payload: { state }, files: [{ meta: { name: 'document.pdf', leadId: 'L-1', backend: 'indexeddb' }, bytes }], source })
  const backup = await readBackupArchive(exported.bytes)
  assert.deepEqual(backup.payload, cleanBackupValue({ state }))
  assert.deepEqual(backup.files[0].bytes, bytes)
  assert.equal(backup.payload.state.opportunities[0].note, state.opportunities[0].note)
  assert.equal(backup.payload.state.users[0].pw, undefined)
  assert.equal(backupSummary(backup).files, 1)
})
test('secret fields never survive recursive sanitation and browser state is excluded', () => {
  const value = localBackupState({ auth: { token: 'x' }, role: 'ADMIN', oneTimeCleanups: ['x'], users: [{ pw: 'x', name: 'A' }], config: { apiKey: 'x', smtp: { password: 'x' }, credentials: { key: 'x' }, model: 'test' } })
  assert.deepEqual(value, { users: [{ name: 'A' }], config: { smtp: {}, model: 'test' } })
  assert.deepEqual(localBackupState({ leadDeadlines: [{ leadId: 'L', status: 'Expired' }] }), { leadDeadlines: [{ leadId: 'L', status: 'Expired' }] })
  assert.deepEqual(cleanBackupValue({ accessToken:'hidden', refresh_token:'hidden', token:'hidden', smtpPassword:'hidden', password_digest:'hidden', tokenCount:12 }),{tokenCount:12})
})
test('converted lead attachments resolve against moved originals and inline attachments remain discoverable', () => {
  const references = backupFileReferences({ leads:[{id:'L',oppId:'O',attachments:[{name:'spec.pdf'}]},{id:'INLINE',attachments:[{name:'inline.pdf',dataUrl:'data:application/pdf;base64,AA=='}]}],files:{O:{'Customer Specs':[{name:'spec.pdf'}]}} })
  const missing = missingBackupFiles(references,[{record_type:'opportunity',record_id:'O',folder:'Customer Specs',file_name:'spec.pdf'}])
  assert.equal(missing.length,1)
  assert.equal(missing[0].record_id,'INLINE')
  assert.equal(missing[0].inline,'data:application/pdf;base64,AA==')
  assert.equal(backupFileReferences({leads:[{id:'DELETED',deletedAt:'now',attachments:[{name:'gone'}]}]}).length,0)
})
test('full backup requires workbook and document integrity', async () => {
  const result = await createBackupArchive({ payload: { state: {} }, files: [{ meta: { name: 'A', backend: 'indexeddb', leadId: 'L' }, bytes: new Uint8Array([1]) }], source })
  const zip = await JSZip.loadAsync(result.bytes)
  zip.file('documents/0.bin', new Uint8Array([2]))
  await assert.rejects(readBackupArchive(await zip.generateAsync({ type: 'uint8array' })), /integrity/)
  zip.remove('documents/0.bin')
  await assert.rejects(readBackupArchive(await zip.generateAsync({ type: 'uint8array' })), /Missing or incomplete/)
})
test('connected restore rejects local, wrong workspace and tampered signatures', async () => {
  const sign = async text => createHmac('sha256', 'test-signing-key').update(text).digest('hex')
  const verify = async (text, value) => await sign(text) === value
  const local = await createBackupArchive({ payload: { state: {} }, source })
  await assert.rejects(readBackupArchive(local.bytes, { connected: true, workspaceId: 'w', verify }), /signed backup/)
  const shared = await createBackupArchive({ payload: { database: {} }, source: { kind: 'connected', workspaceId: 'w' }, sign })
  await readBackupArchive(shared.bytes, { connected: true, workspaceId: 'w', verify })
  await assert.rejects(readBackupArchive(shared.bytes, { connected: true, workspaceId: 'other', verify }), /signed backup/)
  const zip = await JSZip.loadAsync(shared.bytes), manifest = JSON.parse(await zip.file('manifest.json').async('string'))
  manifest.createdAt = 'tampered'; zip.file('manifest.json', JSON.stringify(manifest))
  await assert.rejects(readBackupArchive(await zip.generateAsync({ type: 'uint8array' }), { connected: true, workspaceId: 'w', verify }), /signature/)
})
test('empty workspace validation permits catalogs but rejects business records and orders', () => {
  assert.equal(isEmptyBackupWorkspace({ leads: [], opportunities: [], priceLists: { catalog: {} }, config: {} }), true)
  assert.equal(isEmptyBackupWorkspace({ leads: [{ id: 'L' }] }), false)
  assert.equal(isEmptyBackupWorkspace({ sales: { orders: [{ id: 'PO' }] } }), false)
  assert.equal(isEmptyBackupWorkspace({ files: { O: { Specs: [] } } }), false)
})
