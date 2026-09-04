// Backend-agnostic facade over opportunity file storage.
// Picks SharePoint (configured + signed in) → Supabase (env configured) → mock.
import { supabase, uploadFile as sbUpload, uploadAdminTemplate as sbUploadAdminTemplate, removePaths, removePrefix } from './supabase.js'
import * as sp from './sharepoint.js'

const today = () => new Date().toISOString().slice(0, 10)

export function fmtSize(bytes) {
  const n = Number(bytes) || 0
  if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB'
  return Math.max(1, Math.round(n / 1024)) + ' KB'
}

export function activeBackend() {
  if (sp.isConfigured() && sp.getAccount()) return 'sharepoint'
  return supabase ? 'supabase' : 'mock'
}

export async function uploadAdminTemplate(lane, file) {
  if (!supabase) throw new Error('Supabase storage is not configured. Connect Supabase before uploading templates.')
  const safeName = String(file.name || 'template.xlsx').replace(/[^a-z0-9._-]+/gi, '-')
  const path = `admin/templates/${lane}/${Date.now()}-${safeName}`
  const url = await sbUploadAdminTemplate(path, file)
  return { path, url }
}

export async function uploadOppFile(opp, subfolder, file) {
  const backend = activeBackend()
  try {
    if (backend === 'sharepoint') {
      // ensureOppFolder returns the folder's ACTUAL status location — upload
      // there so listFiles (which prefers the real location) sees the file.
      const status = await sp.ensureOppFolder(opp)
      const item = await sp.uploadFile(opp.id, status || sp.statusFolderFor(opp), subfolder, file)
      return { name: item.name, date: today(), size: fmtSize(file.size), webUrl: item.webUrl, itemId: item.itemId }
    }
    if (backend === 'supabase') {
      const url = await sbUpload(opp.id + '/' + subfolder + '/' + file.name, file)
      return { name: file.name, date: today(), size: fmtSize(file.size), url }
    }
    return { name: file.name, date: today(), size: fmtSize(file.size) }
  } catch (e) {
    throw new Error('Upload of ' + file.name + ' failed: ' + ((e && e.message) || e))
  }
}

// SharePoint is the source of truth for its files; other backends return null
// so callers keep using the store's own file records.
export async function listOppFiles(opp) {
  if (activeBackend() !== 'sharepoint') return null
  try {
    return await sp.listFiles(opp)
  } catch (e) {
    throw new Error('Could not list SharePoint files: ' + ((e && e.message) || e))
  }
}

export async function deleteOppFile(opp, subfolder, fileRec) {
  const backend = activeBackend()
  try {
    if (backend === 'sharepoint') {
      if (fileRec && fileRec.itemId) await sp.deleteItem(fileRec.itemId)
    } else if (backend === 'supabase') {
      await removePaths([opp.id + '/' + subfolder + '/' + fileRec.name])
    }
    // mock → nothing to do
  } catch (e) {
    throw new Error('Delete of ' + ((fileRec && fileRec.name) || 'file') + ' failed: ' + ((e && e.message) || e))
  }
}

export async function ensureOppFolder(opp) {
  if (activeBackend() !== 'sharepoint') return
  try {
    await sp.ensureOppFolder(opp)
  } catch (e) {
    throw new Error('SharePoint folder setup for ' + opp.id + ' failed: ' + ((e && e.message) || e))
  }
}

export async function moveOppFolder(opp, from, to) {
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
    if (backend === 'sharepoint') {
      await sp.moveOppFolder(opp, sp.statusFolderFor(opp), 'Not In Opp List')
    } else if (backend === 'supabase') {
      await removePrefix(opp.id)
    }
    // mock → nothing to do
  } catch (e) {
    throw new Error('Cleanup for ' + opp.id + ' failed: ' + ((e && e.message) || e))
  }
}
