import React, { useState } from 'react'
import { backupSummary, createBackupArchive, isEmptyBackupWorkspace, localBackupState, readBackupArchive, sha256, backupFileReferences, missingBackupFiles } from '../workspaceBackup.js'
import { backupLocalLeadFiles } from '../leadBlobs.js'
import { listLocalDocumentFiles } from '../localDocumentFiles.js'
import { restoreLocalBackupWithJournal } from '../localBackupJournal.js'
import { supabase } from '../supabase.js'
import { isLocalDemoSession } from '../authMode.js'
import { KEY } from '../appState.js'
import * as sharepoint from '../sharepoint.js'
import './BackupRestorePanel.css'

const base64 = bytes => { let out = ''; for (let i = 0; i < bytes.length; i += 16384) out += String.fromCharCode(...bytes.subarray(i, i + 16384)); return btoa(out) }
const unbase64 = value => Uint8Array.from(atob(value), c => c.charCodeAt(0))
async function request(operation, payload = {}) {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data?.session?.access_token) throw new Error('Sign in to manage shared backups.')
  const response = await fetch('/api/admin-backups', { method: 'POST', headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ operation, ...payload }) })
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || 'The backup request failed.')
  return body
}
async function localFiles(state) {
  const leads = await backupLocalLeadFiles(), documents = await listLocalDocumentFiles()
  const files = [
    ...leads.map(({ blob, ...meta }) => ({ meta: { ...meta, backend: 'indexeddb' }, blob })),
    ...documents.map(({ blob, ...meta }) => ({ meta: { ...meta, backend: 'local-document' }, blob })),
  ]
  const normalized = () => files.map(({ meta }) => ({ record_type: meta.backend === 'indexeddb' ? 'attachment' : meta.recordType, record_id: meta.leadId || meta.recordId, folder: meta.folder || '', file_name: meta.name }))
  const references = backupFileReferences(state)
  for (const ref of missingBackupFiles(references, normalized())) if (ref.inline) {
    const response = await fetch(ref.inline), blob = await response.blob()
    files.push({ meta: ref.record_type === 'attachment'
      ? { leadId: ref.record_id, name: ref.file_name, type: blob.type, backend: 'indexeddb' }
      : { recordType: ref.record_type, recordId: ref.record_id, folder: ref.folder, name: ref.file_name, type: blob.type, backend: 'local-document' }, blob })
  }
  const missing = missingBackupFiles(references, normalized())
  if (missing.length) throw new Error(`Full backup blocked. Missing document bytes: ${missing.map(file => `${file.record_id}/${file.folder}/${file.file_name}`).join(', ').slice(0, 2500)}. Upload the original files before exporting.`)
  return files
}
async function externalFiles(preparation) {
  const files = [], known = new Set()
  if (preparation.references.some(ref => ref.record_type === 'attachment')) {
    const leads = await backupLocalLeadFiles()
    for (const ref of preparation.references.filter(row => row.record_type === 'attachment')) {
      const row = leads.find(file => file.leadId === ref.record_id && file.name === ref.file_name)
      if (row?.blob) files.push({ meta: { backend: 'indexeddb', record_type: 'attachment', record_id: ref.record_id, folder: '', file_name: ref.file_name, file_type: row.type || 'application/octet-stream' }, base64: base64(new Uint8Array(await row.blob.arrayBuffer())) })
    }
  }
  const add = async (opp, folder, file) => {
    const key = `${opp.id}/${folder}/${file.name}`
    if (known.has(key)) return
    known.add(key)
    const bytes = await sharepoint.downloadBackupFile(file.itemId)
    files.push({ meta: { backend: 'sharepoint', record_type: 'opportunity', record_id: opp.id, folder, file_name: file.name, file_type: file.type || 'application/octet-stream', itemId: file.itemId }, base64: base64(bytes) })
  }
  if (!sharepoint.isConfigured()) return files
  if (!sharepoint.getAccount()) throw new Error('Sign in to the configured SharePoint connection before exporting a full backup.')
  for (const opp of preparation.opportunities) {
    for (const file of await sharepoint.listBackupFiles(opp)) await add(opp, file.folder, file)
  }
  return files
}
function download(bytes) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }))
  const a = document.createElement('a'); a.href = url; a.download = `WinTrack-full-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}
export default function BackupRestorePanel({ store, restoreLocal = store.restoreLocalBackup }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState(''), [review, setReview] = useState(null), [confirmed, setConfirmed] = useState(false)
  const local = !supabase || isLocalDemoSession(store)
  const state = () => localBackupState(store.getLocalBackupState?.() || store)
  async function run(action) {
    setBusy(true); setError(''); setMessage('')
    try { await action() } catch (err) { setError(err.message || 'Backup could not complete.') } finally { setBusy(false) }
  }
  const exportBackup = () => run(async () => {
    setMessage('Preparing records and original documents…')
    if (local) {
      const snapshot = state(), files = await localFiles(snapshot)
      const result = await createBackupArchive({ payload: { state: snapshot }, files, source: { kind: 'local' } })
      download(result.bytes)
    } else {
      const preparation = await request('prepare-export')
      const external = await externalFiles(preparation)
      const result = await request('export', { token: preparation.token, externalFiles: external })
      download(unbase64(result.archive))
    }
    setMessage('Full backup exported. Keep the complete ZIP to restore records and documents together.')
  })
  const preview = file => run(async () => {
    setReview(null); setConfirmed(false)
    if (!file) return
    if (file.size > 100 * 1024 * 1024) throw new Error('Choose a ZIP up to 100 MB.')
    if (local) {
      if (!isEmptyBackupWorkspace(state())) throw new Error('Restore requires an empty business workspace. Export current work first.')
      const backup = await readBackupArchive(file)
      if (backup.manifest.source.kind !== 'local' || !backup.payload.state || backup.payload.database) throw new Error('Use a local backup for this local workspace. Connected backups restore through the shared server.')
      setReview({ backup, summary: backupSummary(backup), stateHash: await sha256(JSON.stringify(state())), persistedState: localStorage.getItem(KEY) })
    } else {
      const response = await request('preview', { archive: base64(new Uint8Array(await file.arrayBuffer())) })
      setReview(response)
    }
  })
  const restore = () => run(async () => {
    if (!confirmed || !review) return
    if (local) {
      if (!isEmptyBackupWorkspace(state()) || await sha256(JSON.stringify(state())) !== review.stateHash) throw new Error('The workspace changed after review. Select the backup again.')
      if (!restoreLocal) throw new Error('Local restore is unavailable. Reload this application version.')
      await restoreLocalBackupWithJournal(review.backup, { stateKey: KEY, restoreLocal, expectedState: review.persistedState })
    } else await request('restore', { token: review.token })
    setReview(null); setConfirmed(false); setMessage('Backup restored. Reload the workspace to open the restored data.')
  })
  return <section className="backup-panel" aria-labelledby="backup-heading">
    <h2 id="backup-heading">Backup &amp; restore</h2>
    <p>Download one ZIP with an Excel workbook and original documents. Passwords, API keys and sign-in credentials are excluded.</p>
    <p className="backup-mode">{local ? 'Local browser workspace · local backups restore only in local mode.' : 'Shared workspace · signed backups restore only to this workspace.'}</p>
    <div className="backup-controls"><button className="btn primary" disabled={busy} onClick={exportBackup}>{busy ? 'Working…' : 'Export full backup'}</button>
      <label className="backup-import">Review a backup ZIP<input name="backup-archive" disabled={busy} type="file" accept=".zip,application/zip" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; preview(file) }} /></label></div>
    <p>Restore requires an empty business workspace. Existing accounts and passwords stay in place. Account metadata is included for matching; missing logins need an invitation or account creation.</p>
    <p>AI model choices are included as reference information. Restoring a backup never changes API keys or activates an AI connection; reconnect and test providers in Integrations.</p>
    {error && <p role="alert" className="backup-error">{error}</p>}{message && <p role="status">{message}</p>}
    {review && <div className="backup-review"><h3>Review restoration</h3><p>Backup created {review.summary.createdAt}. Original files: {review.summary.files} ({(review.summary.fileBytes / 1048576).toFixed(1)} MB).</p>
      <dl>{Object.entries(review.summary.counts).map(([name, count]) => <React.Fragment key={name}><dt>{name}</dt><dd>{count}</dd></React.Fragment>)}</dl>
      {review.summary.accountMappings?.length > 0 && <><h4>Account matching</h4><ul>{review.summary.accountMappings.map((user, i) => <li key={i}>{user.name} — {user.email}: {user.matched ? 'existing account retained' : 'login must be provisioned'}</li>)}</ul></>}
      {review.summary.settingsChanges?.length > 0 && <p>Settings to restore: {review.summary.settingsChanges.join(', ')}. Credentials remain excluded.</p>}
      <label className="backup-confirm"><input name="confirm-backup-restore" type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />I reviewed this backup and want to restore it into the empty workspace.</label>
      <button className="btn primary" disabled={busy || !confirmed} onClick={restore}>Restore reviewed backup</button></div>}
    <p className="backup-mode">Limits: 100 MB ZIP, 300 MB expanded data, 10,000 archive entries. Missing document bytes block a full export.</p>
  </section>
}
