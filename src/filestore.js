// Backend-agnostic facade over opportunity file storage.
// Picks SharePoint (configured + signed in) → Supabase (env configured) → mock.
import { supabase } from './supabase.js'
import { replaceUserFile, listUserFiles, getUserFile, deleteUserFile, deleteUserFiles } from './userFiles.js'
import * as sp from './sharepoint.js'
import { putLocalDocumentFile, getLocalDocumentFile, deleteLocalDocumentFile } from './localDocumentFiles.js'
import { microsoftRequest, fileBase64 } from './microsoftApi.js'

const today = () => new Date().toISOString().slice(0, 10)

export function fmtSize(bytes) {
  const n = Number(bytes) || 0
  if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB'
  return Math.max(1, Math.round(n / 1024)) + ' KB'
}

export function activeBackend() {
  if (import.meta.env?.VITE_MICROSOFT_GRAPH_ENABLED === 'true') return 'microsoft'
  if (sp.isConfigured() && sp.getAccount()) return 'sharepoint'
  return supabase ? 'supabase' : 'mock'
}

export async function uploadAdminTemplate(lane, file) {
  if (!supabase) throw new Error('Supabase storage is not configured. Connect Supabase before uploading templates.')
  const safeName = String(file.name || 'template.xlsx').replace(/[^a-z0-9._-]+/gi, '-')
  const rec = await replaceUserFile({ recordType: 'admin-template', recordId: lane, folder: 'templates', file: new File([file], safeName, { type: file.type }) })
  return { path: `${lane}/${safeName}`, ...rec }
}

export async function uploadOppFile(opp, subfolder, file) {
  const backend = activeBackend()
  try {
    if (backend === 'microsoft') {
      const result = await microsoftRequest('upload', { oppId: opp.id, folder: subfolder, name: file.name, mimeType: file.type,
        base64: await fileBase64(file) }, { method: 'POST' })
      return { ...result.file, size: fmtSize(result.file.size), date: result.file.date || today() }
    }
    if (backend === 'sharepoint') {
      // ensureOppFolder returns the folder's ACTUAL status location — upload
      // there so listFiles (which prefers the real location) sees the file.
      const status = await sp.ensureOppFolder(opp)
      const item = await sp.uploadFile(opp.id, status || sp.statusFolderFor(opp), subfolder, file)
      // An explicit replacement supersedes a restored database copy only after
      // SharePoint has accepted the new bytes. Otherwise reopening prefers old data.
      if (supabase) {
        const restored = await listUserFiles({ recordType: 'opportunity', recordId: opp.id, folder: subfolder })
        if (restored.some(row => row.name === (item.name || file.name))) {
          await deleteUserFile({ recordType: 'opportunity', recordId: opp.id, folder: subfolder, fileName: item.name || file.name })
        }
      }
      return { name: item.name, date: today(), size: fmtSize(file.size), webUrl: item.webUrl, itemId: item.itemId }
    }
    if (backend === 'supabase') {
      const rec = await replaceUserFile({ recordType: 'opportunity', recordId: opp.id, folder: subfolder, file })
      return { ...rec, name: file.name, date: today(), size: fmtSize(file.size) }
    }
    await putLocalDocumentFile({ recordType: 'opportunity', recordId: opp.id, folder: subfolder, name: file.name, type: file.type || '', blob: file })
    return { name: file.name, date: today(), size: fmtSize(file.size) }
  } catch (e) {
    throw new Error('Upload of ' + file.name + ' failed: ' + ((e && e.message) || e))
  }
}

// SharePoint is the source of truth for its files; other backends return null
// so callers keep using the store's own file records.
export async function listOppFiles(opp) {
  if (activeBackend() === 'microsoft') {
    const result = await microsoftRequest('documents', { oppId: opp.id })
    return Object.fromEntries(Object.entries(result.folders || {}).map(([folder, files]) => [folder,
      files.map(file => ({ ...file, size: fmtSize(file.size) }))]))
  }
  if (activeBackend() === 'supabase') {
    const rows = await listUserFiles({ recordType: 'opportunity', recordId: opp.id, folder: null })
    return rows.reduce((out, row) => {
      const folder = row.folder || 'Customer Specs'
      ;(out[folder] ||= []).push({ ...row, size: fmtSize(row.size) })
      return out
    }, {})
  }
  if (activeBackend() !== 'sharepoint') return null
  // A full restore stages SharePoint originals in the transactional database
  // backend. Prefer these durable copies until SharePoint is reconnected.
  let recovered = []
  if (supabase) recovered = await listUserFiles({ recordType: 'opportunity', recordId: opp.id, folder: null })
  try {
    const folders = await sp.listFiles(opp)
    for (const row of recovered) {
      const folder = row.folder || 'Customer Specs'
      folders[folder] = [...(folders[folder] || []).filter(file => file.name !== row.name), { ...row, backend: 'supabase', size: fmtSize(row.size) }]
    }
    return folders
  } catch (e) {
    if (recovered.length) return recovered.reduce((out, row) => { (out[row.folder || 'Customer Specs'] ||= []).push({ ...row, backend: 'supabase', size: fmtSize(row.size) }); return out }, {})
    throw new Error('Could not list SharePoint files: ' + ((e && e.message) || e))
  }
}

export async function getOppFile(opp, subfolder, name) {
  if (activeBackend() === 'microsoft') {
    const record = typeof name === 'object' ? name : (await listOppFiles(opp))[subfolder]?.find(file => file.name === name)
    if (!record?.itemId) throw new Error('The SharePoint document was not found.')
    const response = await microsoftRequest('document', { oppId: opp.id, folder: subfolder, itemId: record.itemId }, { raw: true })
    return { name: record.name, blob: await response.blob() }
  }
  if (activeBackend() === 'mock') return getLocalDocumentFile({ recordType: 'opportunity', recordId: opp.id, folder: subfolder, name })
  return getUserFile({ recordType: 'opportunity', recordId: opp.id, folder: subfolder, fileName: name })
}

export async function deleteOppFile(opp, subfolder, fileRec) {
  const backend = activeBackend()
  try {
    if (backend === 'microsoft') {
      await microsoftRequest('delete', { oppId: opp.id, folder: subfolder, itemId: fileRec.itemId }, { method: 'POST' })
      return
    }
    if (backend === 'sharepoint') {
      if (fileRec?.backend === 'supabase') await deleteUserFile({ recordType: 'opportunity', recordId: opp.id, folder: subfolder, fileName: fileRec.name })
      else if (fileRec && fileRec.itemId) await sp.deleteItem(fileRec.itemId)
    } else if (backend === 'supabase') {
      await deleteUserFile({ recordType: 'opportunity', recordId: opp.id, folder: subfolder, fileName: fileRec.name })
    } else {
      await deleteLocalDocumentFile({ recordType: 'opportunity', recordId: opp.id, folder: subfolder, name: fileRec.name })
    }
    // mock → nothing to do
  } catch (e) {
    throw new Error('Delete of ' + ((fileRec && fileRec.name) || 'file') + ' failed: ' + ((e && e.message) || e))
  }
}

export async function removeOppPrefix(oppId, subfolder = null) {
  if (activeBackend() !== 'supabase') return
  await deleteUserFiles({ recordType: 'opportunity', recordId: oppId, folder: subfolder })
}

export async function ensureOppFolder(opp) {
  if (activeBackend() === 'microsoft') return microsoftRequest('ensure', { oppId: opp.id }, { method: 'POST' })
  if (activeBackend() !== 'sharepoint') return
  try {
    await sp.ensureOppFolder(opp)
  } catch (e) {
    throw new Error('SharePoint folder setup for ' + opp.id + ' failed: ' + ((e && e.message) || e))
  }
}

export async function moveOppFolder(opp, from, to) {
  if (activeBackend() === 'microsoft') return microsoftRequest('move', { oppId: opp.id, to }, { method: 'POST' })
  if (activeBackend() !== 'sharepoint') return
  try {
    await sp.moveOppFolder(opp, from, to)
  } catch (e) {
    throw new Error('SharePoint folder move for ' + opp.id + ' failed: ' + ((e && e.message) || e))
  }
}

// Removing an opp NEVER deletes SharePoint files — the folder is parked under
// 'Not In Opp List'. Supabase storage objects are removed outright.
export async function removeOpp(opp) {
  const backend = activeBackend()
  try {
    if (backend === 'microsoft') return microsoftRequest('move', { oppId: opp.id, to: 'Not In Opp List' }, { method: 'POST' })
    if (backend === 'sharepoint') {
      await sp.moveOppFolder(opp, sp.statusFolderFor(opp), 'Not In Opp List')
    } else if (backend === 'supabase') {
      await deleteUserFiles({ recordType: 'opportunity', recordId: opp.id, folder: undefined })
    }
    // mock → nothing to do
  } catch (e) {
    throw new Error('Cleanup for ' + opp.id + ' failed: ' + ((e && e.message) || e))
  }
}
