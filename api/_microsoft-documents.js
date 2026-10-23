import { projectWorkspace } from '../src/workspaceAccess.js'
import { canAccessPage } from '../src/accessPolicy.js'

const statuses = ['Open', 'WON', 'Closed', 'Not In Opp List']
const enc = encodeURIComponent
const fail = (message, status = 403) => { throw Object.assign(new Error(message), { status }) }
const folderName = value => String(value || '').trim().slice(0, 120)

export function createMicrosoftDocuments(graph) {
  const { config, request, pages } = graph
  const drive = `/drives/${enc(config.driveId)}`
  const children = id => pages(`${drive}/items/${enc(id)}/children?$select=id,name,folder,file,size,lastModifiedDateTime,webUrl,parentReference`, 10)
  const child = async (parentId, name) => (await children(parentId)).find(item => item.name === name)
  const createFolder = async (parentId, name) => request(`${drive}/items/${enc(parentId)}/children`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: { name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' } })
  const folder = async (parentId, name, create = false) => {
    const existing = await child(parentId, name)
    if (existing) { if (!existing.folder) fail('A file occupies the document folder name.', 409); return existing }
    if (!create) return null
    try { return await createFolder(parentId, name) }
    catch (error) { if (error.graphStatus === 409) return child(parentId, name); throw error }
  }
  const ensureConfigured = () => {
    if (!config.siteId || !config.driveId || !config.rootId) fail('SharePoint is not configured on the server.', 503)
  }
  const browseParent = async (profile, state, path = '') => {
    ensureConfigured()
    if (!canAccessPage(profile, 'folders', state.config || {})) fail('Documents access is required.')
    if (typeof path !== 'string' || path.length > 600) fail('Invalid document path.', 400)
    const parts = path ? path.split('/') : []
    if (parts[0] !== 'Opportunities' || parts.length > 8 || parts.some(part => !part || part === '.' || part === '..' || /[\\\r\n\0]/.test(part))) fail('Invalid document path.', 400)
    let parentId = config.rootId
    for (const part of parts) {
      const next = (await children(parentId)).find(item => item.name === part && item.folder)
      if (!next) fail('SharePoint folder not found.', 404)
      parentId = next.id
    }
    return parentId
  }
  const browse = async (profile, state, path = '') => {
    const parentId = await browseParent(profile, state, path)
    return { path, items: (await children(parentId)).filter(item => item.folder || item.file).map(item => ({
      id: item.id, name: item.name, folder: Boolean(item.folder), size: item.size || 0,
      date: item.lastModifiedDateTime?.slice(0, 10) || '',
    })) }
  }
  const browseDownload = async (profile, state, path, itemId) => {
    const parentId = await browseParent(profile, state, path)
    const item = (await children(parentId)).find(row => row.id === itemId && row.file)
    if (!item) fail('Document not found in this SharePoint folder.', 404)
    const response = await request(`${drive}/items/${enc(item.id)}/content`, { raw: true })
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length > 20 * 1024 * 1024) fail('This document exceeds the preview limit.', 413)
    return { name: item.name, bytes, mimeType: response.headers.get('content-type') || 'application/octet-stream' }
  }
  const opportunity = (profile, state, id) => {
    ensureConfigured()
    if (!canAccessPage(profile, 'folders', state.config || {})) fail('Documents access is required.')
    const row = projectWorkspace(state, profile).opportunities?.find(item => item.id === id)
    if (!row) fail('Opportunity not found.', 404)
    return row
  }
  const status = row => row.stage === 'Won' ? 'WON' : row.stage === 'Lost' || row.status === 'Closed' ? 'Closed' : 'Open'
  const locate = async (id, create = false, desiredStatus = '') => {
    const root = config.rootId
    // The current library stores opportunity folders under Opportunities/<ID>.
    // Keep reading the older status-folder layout for existing installations.
    const opportunities = await folder(root, 'Opportunities', create)
    if (opportunities) {
      const direct = await folder(opportunities.id, id)
      if (direct) return { item: direct, status: desiredStatus || 'Open', parentId: opportunities.id, layout: 'opportunities' }
      const parked = await folder(opportunities.id, 'Not In Opp List')
      const parkedItem = parked && await folder(parked.id, id)
      if (parkedItem) return { item: parkedItem, status: 'Not In Opp List', parentId: parked.id, layout: 'opportunities' }
      if (create && desiredStatus) {
        const parent = desiredStatus === 'Not In Opp List'
          ? await folder(opportunities.id, 'Not In Opp List', true)
          : opportunities
        return { item: await folder(parent.id, id, true), status: desiredStatus, parentId: parent.id, layout: 'opportunities' }
      }
    }
    for (const name of statuses) {
      if (create && desiredStatus && name === desiredStatus) continue
      const parent = await folder(root, name)
      if (!parent) continue
      const found = await folder(parent.id, id)
      if (found) return { item: found, status: name, parentId: parent.id, layout: 'status-folders' }
    }
    if (!create || !desiredStatus) return null
    for (const name of [desiredStatus]) {
      const parent = await folder(root, name, create && !!desiredStatus)
      if (!parent) continue
      const found = await folder(parent.id, id, create && !!desiredStatus)
      if (found) return { item: found, status: name, parentId: parent.id, layout: 'status-folders' }
    }
    return null
  }
  const subfolder = async (oppId, name, create = false, desiredStatus = '') => {
    const safe = folderName(name)
    if (!safe || safe === '.' || safe === '..' || /[\\/]/.test(safe)) fail('Invalid document folder.', 400)
    const located = await locate(oppId, create, desiredStatus)
    if (!located) return null
    return folder(located.item.id, safe, create)
  }
  const requireItem = async (oppId, sub, itemId) => {
    const parent = await subfolder(oppId, sub)
    if (!parent) fail('Document folder not found.', 404)
    const item = (await children(parent.id)).find(row => row.id === itemId && row.file)
    if (!item) fail('Document not found in this opportunity.', 404)
    return item
  }
  const list = async (profile, state, oppId) => {
    opportunity(profile, state, oppId)
    const located = await locate(oppId)
    if (!located) return {}
    const folders = await children(located.item.id)
    const out = {}
    for (const folder of folders.filter(item => item.folder)) {
      out[folder.name] = (await children(folder.id)).filter(item => item.file).map(item => ({
        name: item.name, itemId: item.id, backend: 'microsoft', date: item.lastModifiedDateTime?.slice(0, 10) || '', size: item.size,
      }))
    }
    return out
  }
  const upload = async (profile, state, oppId, sub, filename, bytes, mimeType) => {
    const row = opportunity(profile, state, oppId)
    if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 10 * 1024 * 1024) fail('Upload a file of 10 MB or less.', 413)
    const name = folderName(filename)
    if (!name || /[\\/]/.test(name)) fail('Invalid file name.', 400)
    const parent = await subfolder(oppId, sub, true, status(row))
    const item = await request(`${drive}/items/${enc(parent.id)}:/${enc(name)}:/content`, { method: 'PUT', raw: true,
      headers: { 'Content-Type': mimeType || 'application/octet-stream' }, body: bytes })
    const result = await item.json()
    return { name: result.name, itemId: result.id, backend: 'microsoft', size: result.size, date: result.lastModifiedDateTime?.slice(0, 10) || '' }
  }
  const remove = async (profile, state, oppId, sub, itemId) => {
    opportunity(profile, state, oppId)
    const item = await requireItem(oppId, sub, itemId)
    await request(`${drive}/items/${enc(item.id)}`, { method: 'DELETE' })
  }
  const download = async (profile, state, oppId, sub, itemId) => {
    opportunity(profile, state, oppId)
    const item = await requireItem(oppId, sub, itemId)
    const response = await request(`${drive}/items/${enc(item.id)}/content`, { raw: true })
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length > 20 * 1024 * 1024) fail('This document exceeds the preview limit.', 413)
    return { name: item.name, bytes, mimeType: response.headers.get('content-type') || 'application/octet-stream' }
  }
  const move = async (profile, state, oppId, to) => {
    opportunity(profile, state, oppId)
    if (!statuses.includes(to)) fail('Invalid destination folder.', 400)
    const located = await locate(oppId)
    if (!located || located.status === to) return
    if (located.layout === 'opportunities') {
      const parent = to === 'Not In Opp List'
        ? await folder(folder(config.rootId, 'Opportunities').id, 'Not In Opp List', true)
        : await folder(config.rootId, 'Opportunities')
      if (parent && parent.id !== located.parentId) {
        await request(`${drive}/items/${enc(located.item.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: { parentReference: { id: parent.id } } })
      }
      return
    }
    const parent = await folder(config.rootId, to, true)
    await request(`${drive}/items/${enc(located.item.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: { parentReference: { id: parent.id } } })
  }
  return { list, upload, remove, download, move, browse, browseDownload, ensure: async (profile, state, oppId) => {
    const row = opportunity(profile, state, oppId)
    return locate(oppId, true, status(row))
  } }
}
