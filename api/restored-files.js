import { getAdminSupabaseClient } from './_supabase-client.js'
import { activeProfile } from './_user-roster.js'
import { canAccessPage, canPerform, effectiveAccess } from '../src/accessPolicy.js'
import { canReadPricing } from '../src/workspaceAccess.js'

const fail = (message, status = 403) => { throw Object.assign(new Error(message), { status }) }
const read = async query => { const { data, error } = await query; if (error) throw error; return data }
const metadata = row => ({ id: row.id, name: row.file_name, type: row.file_type, size: row.file_size,
  folder: row.folder || '', recordType: row.record_type, recordId: row.record_id,
  date: String(row.created_at || '').slice(0, 10), backend: 'supabase', restored: true })

// Only server-owned restoration receipts grant this access. Ordinary uploads
// retain their existing uploader-only RLS policies and browser helpers.
export function createRestoredFilesHandler(getClient = getAdminSupabaseClient) {
  return async (req, res) => {
    res.setHeader?.('Cache-Control', 'no-store')
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
    const client = getClient()
    if (!client) return res.status(503).json({ error: 'The connected workspace is unavailable.' })
    try {
      const token = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '').trim()
      if (!token) fail('Sign in to access restored documents.', 401)
      const auth = await client.auth.getUser(token)
      if (auth.error || !auth.data?.user) fail('Your session expired.', 401)
      const profile = await activeProfile(client, auth.data.user)
      if (!profile) fail('This account no longer has workspace access.')
      const { operation, recordType, recordId, folder, name } = req.body || {}
      if (!['list','get','retire'].includes(operation) || !['opportunity','attachment','admin-template'].includes(recordType)
        || typeof recordId !== 'string' || !recordId || recordId.length > 200
        || folder !== undefined && folder !== null && (typeof folder !== 'string' || folder.length > 400)
        || name !== undefined && (typeof name !== 'string' || !name || name.length > 255)
        || operation === 'get' && !name) fail('Invalid restored document request.', 400)
      const config = (await read(client.from('settings').select('data').eq('id','config').is('deleted_at',null).maybeSingle()))?.data || {}
      const admin = effectiveAccess(profile, config).isAdmin
      const lead = recordType === 'attachment'
      if (recordType === 'admin-template') {
        if (!admin && (operation === 'retire' || !canAccessPage(profile,'proposal',config))) fail('You cannot access these restored templates.')
      } else {
        const readable = lead ? canAccessPage(profile,'inbox',config) : canAccessPage(profile,'folders',config) || canAccessPage(profile,'proposal',config)
        if (!admin && !readable) fail('You cannot access these restored documents.')
        if (operation === 'retire' && !canPerform(profile,lead ? 'leads.edit' : 'opportunities.edit',config)) fail('You cannot replace these restored documents.')
      }
      const scope = { recordType, recordId, ...(typeof folder === 'string' ? { folder } : {}), ...(name ? { name } : {}) }
      const receipts = await read(client.from('audit').select('data').like('id','BACKUP-RESTORE:%').is('deleted_at',null).contains('data',{ kind:'backup_restore_command', restoredFiles:[scope] }))
      const ids = [...new Set((receipts || []).flatMap(row => row.data?.restoredFiles || [])
        .filter(file => file.recordType === recordType && file.recordId === recordId && (typeof folder !== 'string' || file.folder === folder) && (!name || file.name === name))
        .map(file => file.id).filter(id => /^[a-f0-9-]{36}$/i.test(id)))]
      if (ids.length > 10000) fail('Restored document scope is too large.', 400)
      // New ordinary uploads have no restoration receipt. Do not require their
      // parent row to have finished saving merely to confirm there is no old copy.
      if (!ids.length) return res.status(200).json(operation === 'list' ? { files:[] } : operation === 'get' ? { file:null } : { retired:0 })
      if (recordType !== 'admin-template') {
        const row = await read(client.from(lead ? 'leads' : 'opportunities').select('data').eq('id',recordId).is('deleted_at',null).maybeSingle())
        if (!row?.data) fail('The related record is unavailable.',404)
        if (!admin && (lead ? row.data.assignedOwner !== profile.role && !canPerform(profile,'commercial.view',config)
          : !canReadPricing(profile,{ ...row.data,id:recordId },config,{ opportunities:[{ ...row.data,id:recordId }] }))) fail('You cannot access these restored documents.')
      }
      const rows = []
      for (let offset = 0; offset < ids.length; offset += 100) {
        let query = client.from('user_files').select('id,record_type,record_id,folder,file_name,file_type,file_size,created_at' + (operation === 'get' ? ',file_data' : '')).in('id',ids.slice(offset,offset+100)).eq('record_type',recordType).eq('record_id',recordId)
        if (typeof folder === 'string') query = query.eq('folder',folder)
        if (name) query = query.eq('file_name',name)
        rows.push(...await read(query))
      }
      if (operation === 'retire') {
        for (let offset = 0; offset < rows.length; offset += 100) await read(client.from('user_files').delete().in('id',rows.slice(offset,offset+100).map(row => row.id)))
        return res.status(200).json({ retired: rows.length })
      }
      if (operation === 'get') {
        if (rows.length > 1) fail('Multiple restored originals match this filename. Ask an administrator to review them.',409)
        const row = rows[0]
        if (!row) return res.status(200).json({ file: null })
        if (!/^\\x(?:[a-f0-9]{2})*$/i.test(row.file_data || '') || row.file_size > 10485760) throw new Error('Invalid restored file bytes')
        const bytes = Buffer.from(row.file_data.slice(2),'hex')
        if (bytes.length !== Number(row.file_size)) throw new Error('Incomplete restored file bytes')
        return res.status(200).json({ file: { ...metadata(row), base64: bytes.toString('base64') } })
      }
      return res.status(200).json({ files: rows.map(metadata) })
    } catch (error) { return res.status(error.status || 503).json({ error: error.status ? error.message : 'Restored documents could not be loaded. Retry or contact your administrator.' }) }
  }
}
export default createRestoredFilesHandler()
