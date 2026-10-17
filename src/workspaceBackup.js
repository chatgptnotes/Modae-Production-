import JSZip from 'jszip'
import ExcelJS from 'exceljs'

export const BACKUP_VERSION = 1
export const BACKUP_LIMITS = Object.freeze({ archive: 100 * 1024 * 1024, expanded: 300 * 1024 * 1024, entries: 10000, workbook: 64 * 1024 * 1024 })
export const backupFileKey = file => JSON.stringify([file.record_type, file.record_id, file.folder || '', file.file_name])
export function backupFileReferences({ leads = [], opportunities = [], files = {}, config = {} }) {
  const out = []
  for (const lead of leads.filter(row => !row.deletedAt && !row.deleted_at)) for (const file of lead.attachments || []) if (file?.name) {
    const converted = lead.oppId || opportunities.find(opp => opp.sourceLeadId === lead.id)?.id
    out.push({ record_type: 'attachment', record_id: lead.id, folder: '', file_name: file.name, inline: [file.dataUrl, file.url, file.webUrl].find(value => String(value || '').startsWith('data:')), alternatives: converted ? [{ record_type: 'opportunity', record_id: converted, folder: 'Customer Specs', file_name: file.name }] : [] })
  }
  for (const [id, folders] of Object.entries(files)) for (const [folder, entries] of Object.entries(folders || {})) for (const file of Array.isArray(entries) ? entries : []) if (file.name) out.push({ record_type: 'opportunity', record_id: id, folder, file_name: file.name, inline: [file.dataUrl, file.url, file.webUrl].find(value => String(value || '').startsWith('data:')), itemId: file.itemId, alternatives: [] })
  for (const file of [...(config.uploads?.proposalTemplates || []), ...Object.values(config.uploads?.kycTemplates || {})]) if (file?.name && (file.recordId || file.path)) {
    const parts = String(file.path || '').split('/')
    out.push({ record_type: 'admin-template', record_id: file.recordId || parts[0], folder: file.folder || 'templates', file_name: file.name, alternatives: [] })
  }
  return out
}
export const missingBackupFiles = (references, files) => {
  const known = new Set(files.map(file => backupFileKey(file.meta || file)))
  return references.filter(file => !known.has(backupFileKey(file)) && !(file.alternatives || []).some(alt => known.has(backupFileKey(alt))))
}
const OMIT_KEYS = /^(?:pw|.*password.*|.*api_?key.*|(?:gemini|openai|anthropic|smtp)Key|smtpPass|(?:access|refresh|id|auth|bearer)_?token|token|.*secret.*|.*credential.*|.*private_?key.*|authorization(?:Code)?|auth|.*session.*|.*service_?role_?key.*|.*encryption_?key.*|.*signing_?key.*)$/i
const LOCAL_KEYS = new Set(['role', 'roles', 'viewMode', 'viewModePinned', 'viewModePinnedAt', 'viewModePreferenceRev', 'spSync', 'inboxShowAll', 'leadSyncBaseline', 'clarificationSyncBaseline', 'opportunitySyncBaseline', 'sparesLinesSyncBaseline', 'deletedLeadIds', 'deletedOpportunityIds', 'pendingOpportunitySyncIds', 'oneTimeCleanups', 'catalogRev'])
const enc = new TextEncoder()
const encodeExact = value => {
  const bytes = enc.encode(value); let binary = ''
  for (let i = 0; i < bytes.length; i += 16384) binary += String.fromCharCode(...bytes.subarray(i, i + 16384))
  return btoa(binary)
}
const decodeExact = value => new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(value), char => char.charCodeAt(0)))
const previewCell = value => {
  const text = String(value ?? '').slice(0, 30000).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\uFFFE\uFFFF]/g, '\uFFFD')
  return text.toWellFormed ? text.toWellFormed() : Array.from(text, char => char.length === 1 && /[\uD800-\uDFFF]/.test(char) ? '\uFFFD' : char).join('')
}
export function cleanBackupValue(value, depth = 0) {
  if (depth > 100) throw new Error('Backup data is nested too deeply.')
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value
  if (Array.isArray(value)) return value.map(v => cleanBackupValue(v, depth + 1)).filter(v => v !== undefined)
  if (!value || typeof value !== 'object') return undefined
  const out = {}
  for (const [key, entry] of Object.entries(value)) {
    if (OMIT_KEYS.test(key) || key.startsWith('_') || ['__proto__', 'prototype', 'constructor'].includes(key)) continue
    const cleaned = cleanBackupValue(entry, depth + 1)
    if (cleaned !== undefined) out[key] = cleaned
  }
  return out
}
export function localBackupState(state) {
  return cleanBackupValue(Object.fromEntries(Object.entries(state).filter(([key]) => !LOCAL_KEYS.has(key))))
}
export function isEmptyBackupWorkspace(state) {
  const nonempty = value => Array.isArray(value) ? value.length > 0 : value && typeof value === 'object' ? Object.keys(value).length > 0 : false
  return !['leads', 'opportunities', 'approvals', 'customers', 'proposals', 'sparesLines', 'clarifications', 'files', 'leadArchive', 'vendorQuotes', 'svcEstimates', 'surveys', 'communications', 'kyc', 'poCompare', 'handover', 'bSteps'].some(key => nonempty(state[key]))
    && !nonempty(state.sales?.orders)
}
export async function sha256(value) {
  const bytes = typeof value === 'string' ? enc.encode(value) : value
  return Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes))).map(v => v.toString(16).padStart(2, '0')).join('')
}
function checkPath(path) {
  if (!/^(?:manifest\.json|workspace\.xlsx|documents\/[a-zA-Z0-9_-]+\.bin)$/.test(path)) throw new Error('The backup contains an unsafe or unexpected archive path.')
}
function checkZip(zip, max = BACKUP_LIMITS.expanded) {
  const entries = Object.values(zip.files)
  if (entries.length > BACKUP_LIMITS.entries) throw new Error('The archive contains too many entries.')
  let total = 0
  for (const file of entries) {
    const path = file.unsafeOriginalName || file.name
    if (path !== file.name || path.includes('..') || path.startsWith('/') || path.includes('\\')) throw new Error('Unsafe archive path.')
    total += file._data?.uncompressedSize || 0
    if (total > max) throw new Error('The expanded archive is too large.')
  }
  return total
}
function sheetRows(workbook, name, rows) {
  const sheet = workbook.addWorksheet(name.slice(0, 31))
  const columns = [...new Set(rows.flatMap(([, value]) => value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value) : ['value']))]
  if (columns.length > 16383 || rows.length > 1048575) throw new Error('A backup sheet exceeds Excel row or column limits.')
  sheet.addRow(['ID / key', ...columns.map(previewCell)])
  for (const [id, value] of rows) {
    const object = value && typeof value === 'object' && !Array.isArray(value) ? value : { value }
    sheet.addRow([previewCell(id), ...columns.map(key => { const v = object[key]; return previewCell(typeof v === 'object' ? JSON.stringify(v) : v) })])
  }
  sheet.getRow(1).font = { bold: true }; sheet.getColumn(1).width = 30
  for (let i = 2; i <= columns.length + 1; i++) sheet.getColumn(i).width = 30
}
export async function createBackupArchive({ payload, files = [], source, sign }) {
  if (files.length + 3 > BACKUP_LIMITS.entries) throw new Error('The backup contains too many files.')
  const clean = cleanBackupValue(payload)
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'WinTrack ModAE'; workbook.created = new Date()
  const overview = workbook.addWorksheet('Overview')
  overview.addRows([['WinTrack full backup', `Version ${BACKUP_VERSION}`], ['Created', new Date().toISOString()], ['Source', source.kind], ['Restore', 'Import the complete ZIP in Admin → Backup & restore. Do not edit this workbook.'], ['Excluded', 'Passwords, API keys, tokens, credentials and encryption keys.']])
  if (clean.database) {
    for (const [name, rows] of Object.entries(clean.database)) sheetRows(workbook, name, rows.map(row => [row.entity ? `${row.entity}/${row.id}` : row.id, row.data ?? row]))
    if (clean.modelSettings) sheetRows(workbook, 'AI model reference', Object.entries(clean.modelSettings))
  } else {
    for (const [name, value] of Object.entries(clean.state || {})) {
      const rows = Array.isArray(value) ? value.map((r, i) => [r?.id || String(i + 1), r]) : value && typeof value === 'object' ? Object.entries(value) : [['value', value]]
      sheetRows(workbook, name, rows)
    }
  }
  const exact = workbook.addWorksheet('RestoreData')
  exact.addRow(['Chunk', 'Exact JSON encoded as UTF8 base64; do not edit'])
  const serialized = encodeExact(JSON.stringify(clean))
  for (let i = 0; i < serialized.length; i += 24000) exact.addRow([i / 24000, serialized.slice(i, i + 24000)])
  const workbookBytes = new Uint8Array(await workbook.xlsx.writeBuffer())
  if (workbookBytes.length > BACKUP_LIMITS.workbook) throw new Error('The workbook exceeds the supported backup limit.')
  const zip = new JSZip(); zip.file('workspace.xlsx', workbookBytes)
  const manifest = { format: 'wintrack-full-backup', version: BACKUP_VERSION, dataEncoding: 'base64-utf8-json', createdAt: new Date().toISOString(), source, workbook: { path: 'workspace.xlsx', sha256: await sha256(workbookBytes) }, files: [], exclusions: ['passwords', 'API keys', 'authentication tokens', 'service credentials', 'encryption/signing keys'] }
  let expanded = workbookBytes.length
  for (let i = 0; i < files.length; i++) {
    const file = files[i], bytes = file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(await file.blob.arrayBuffer())
    if (bytes.length > 10 * 1024 * 1024) throw new Error(`The document ${file.meta?.name || file.meta?.file_name || i + 1} exceeds the 10 MB restore limit.`)
    expanded += bytes.length
    if (expanded > BACKUP_LIMITS.expanded) throw new Error('This workspace exceeds the 300 MB expanded backup limit.')
    const path = `documents/${i}.bin`
    zip.file(path, bytes)
    manifest.files.push({ ...cleanBackupValue(file.meta), path, size: bytes.length, sha256: await sha256(bytes) })
  }
  checkZip(await JSZip.loadAsync(workbookBytes), BACKUP_LIMITS.expanded - (expanded - workbookBytes.length))
  if (sign) manifest.signature = await sign(JSON.stringify(manifest))
  zip.file('manifest.json', JSON.stringify(manifest))
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 5 } })
  if (bytes.length > BACKUP_LIMITS.archive) throw new Error('The backup exceeds the 100 MB archive limit.')
  return { bytes, manifest }
}
export async function readBackupArchive(input, { verify, workspaceId, connected = false } = {}) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(await input.arrayBuffer())
  if (bytes.length > BACKUP_LIMITS.archive) throw new Error('The backup exceeds the 100 MB archive limit.')
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: false }); checkZip(zip)
  for (const file of Object.values(zip.files)) if (!file.dir) checkPath(file.name)
  if (!zip.file('manifest.json') || !zip.file('workspace.xlsx')) throw new Error('This is not a full WinTrack backup ZIP.')
  if (zip.file('manifest.json')._data.uncompressedSize > 4 * 1024 * 1024) throw new Error('Backup manifest is too large.')
  const manifest = JSON.parse(await zip.file('manifest.json').async('string'))
  if (manifest.format !== 'wintrack-full-backup' || manifest.version !== BACKUP_VERSION || manifest.dataEncoding !== 'base64-utf8-json' || !Array.isArray(manifest.files) || !['local', 'connected'].includes(manifest.source?.kind)) throw new Error('Unsupported backup format or version.')
  if (connected && (manifest.source.kind !== 'connected' || manifest.source.workspaceId !== workspaceId || !verify)) throw new Error('Connected restore requires a signed backup from this workspace.')
  const { signature, ...unsigned } = manifest
  if (verify && !(await verify(JSON.stringify(unsigned), signature))) throw new Error('Backup signature is invalid. The backup may have been modified.')
  const workbookFile = zip.file('workspace.xlsx')
  if (workbookFile._data.uncompressedSize > BACKUP_LIMITS.workbook) throw new Error('Backup workbook is too large.')
  const workbookBytes = await workbookFile.async('uint8array')
  if (await sha256(workbookBytes) !== manifest.workbook?.sha256) throw new Error('Backup workbook integrity check failed.')
  const documentBytes = manifest.files.reduce((sum, file) => {
    if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > 10 * 1024 * 1024) throw new Error('Invalid backup document size.')
    return sum + file.size
  }, 0)
  checkZip(await JSZip.loadAsync(workbookBytes), BACKUP_LIMITS.expanded - documentBytes)
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(workbookBytes)
  const sheet = workbook.getWorksheet('RestoreData')
  if (!sheet || sheet.rowCount < 2) throw new Error('The backup is missing exact restoration data.')
  const chunks = []
  for (let i = 2; i <= sheet.rowCount; i++) {
    if (sheet.getRow(i).getCell(1).value !== i - 2 || typeof sheet.getRow(i).getCell(2).value !== 'string') throw new Error('Restoration chunks are invalid.')
    chunks.push(sheet.getRow(i).getCell(2).value)
  }
  const payload = JSON.parse(decodeExact(chunks.join('')))
  if (JSON.stringify(cleanBackupValue(payload)) !== JSON.stringify(payload)) throw new Error('The backup contains unsupported or credential fields.')
  const files = [], paths = new Set()
  for (const meta of manifest.files) {
    checkPath(meta.path)
    if (!meta.path.startsWith('documents/')) throw new Error('Invalid document archive path.')
    if (paths.has(meta.path)) throw new Error('Duplicate backup file entry.')
    paths.add(meta.path)
    const file = zip.file(meta.path)
    if (!file || file._data.uncompressedSize !== meta.size) throw new Error(`Missing or incomplete document: ${meta.name || meta.file_name || meta.path}`)
    const data = await file.async('uint8array')
    if (await sha256(data) !== meta.sha256) throw new Error('Document integrity check failed.')
    files.push({ meta, bytes: data })
  }
  for (const file of Object.values(zip.files)) if (!file.dir && file.name.startsWith('documents/') && !paths.has(file.name)) throw new Error('The archive contains an unlisted document.')
  return { manifest, payload, files, digest: await sha256(bytes) }
}
export function backupSummary(backup) {
  const db = backup.payload.database
  const counts = db ? Object.fromEntries(Object.entries(db).map(([key, rows]) => [key, rows.length])) : Object.fromEntries(Object.entries(backup.payload.state || {}).filter(([, v]) => Array.isArray(v)).map(([key, value]) => [key, value.length]))
  return { counts, files: backup.files.length, fileBytes: backup.files.reduce((n, f) => n + f.bytes.length, 0), profiles: backup.payload.profiles || backup.payload.state?.users || [], source: backup.manifest.source, createdAt: backup.manifest.createdAt }
}
