import { supabase } from './supabase.js'

export const MAX_FILE_BYTES = 10 * 1024 * 1024

const requireClient = () => {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

async function currentUserId() {
  const client = requireClient()
  const { data, error } = await client.auth.getUser()
  if (error) throw error
  if (!data?.user?.id) throw new Error('Sign in with Supabase Auth before saving files.')
  return data.user.id
}

export function assertFileSize(file) {
  if (!file) throw new Error('No file selected.')
  if (Number(file.size) > MAX_FILE_BYTES) {
    throw new Error(`${file.name || 'This file'} is larger than the 10 MB limit.`)
  }
}

async function toBytea(file) {
  assertFileSize(file)
  const bytes = new Uint8Array(await file.arrayBuffer())
  // PostgreSQL accepts the hex bytea input form: \\x followed by two hex
  // characters per byte. It is deterministic and avoids Base64 expansion.
  let hex = ''
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0')
  return `\\x${hex}`
}

function fromBytea(value) {
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  const raw = String(value || '')
  const hex = raw.startsWith('\\x') ? raw.slice(2) : raw
  if (!/^[0-9a-f]*$/i.test(hex) || hex.length % 2) throw new Error('Invalid BYTEA payload returned by Supabase.')
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

const meta = row => ({
  id: row.id,
  name: row.file_name,
  type: row.file_type || 'application/octet-stream',
  size: row.file_size,
  date: row.created_at ? String(row.created_at).slice(0, 10) : '',
  recordType: row.record_type,
  recordId: row.record_id,
  folder: row.folder || '',
})

export async function insertUserFile({ recordType, recordId, folder = '', file }) {
  const client = requireClient()
  assertFileSize(file)
  const userId = await currentUserId()
  const fileData = await toBytea(file)
  const row = {
    user_id: userId,
    record_type: String(recordType || 'record'),
    record_id: String(recordId || ''),
    folder: String(folder || ''),
    file_name: String(file.name || 'file').slice(0, 255),
    file_type: file.type || 'application/octet-stream',
    file_size: Number(file.size) || 0,
    file_data: fileData,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await client.from('user_files').insert(row).select('id, record_type, record_id, folder, file_name, file_type, file_size, created_at').single()
  if (error) throw error
  return meta(data)
}

export async function replaceUserFile(scope) {
  const client = requireClient()
  const userId = await currentUserId()
  const { error: deleteError } = await client.from('user_files').delete()
    .eq('user_id', userId)
    .eq('record_type', String(scope.recordType || 'record'))
    .eq('record_id', String(scope.recordId || ''))
    .eq('folder', String(scope.folder || ''))
    .eq('file_name', String(scope.file?.name || ''))
  if (deleteError) throw deleteError
  return insertUserFile(scope)
}

export async function listUserFiles({ recordType, recordId, folder = '' }) {
  const client = requireClient()
  let query = client.from('user_files')
    .select('id, record_type, record_id, folder, file_name, file_type, file_size, created_at')
    .eq('record_type', String(recordType || 'record'))
    .eq('record_id', String(recordId || ''))
  if (folder !== null) query = query.eq('folder', String(folder || ''))
  const { data, error } = await query.order('created_at', { ascending: true })
  if (error) throw error
  return (data || []).map(meta)
}

export async function getUserFile({ recordType, recordId, folder = '', fileName }) {
  const client = requireClient()
  const { data, error } = await client.from('user_files')
    .select('id, record_type, record_id, folder, file_name, file_type, file_size, created_at, file_data')
    .eq('record_type', String(recordType || 'record'))
    .eq('record_id', String(recordId || ''))
    .eq('folder', String(folder || ''))
    .eq('file_name', String(fileName || ''))
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const bytes = fromBytea(data.file_data)
  const blob = new Blob([bytes], { type: data.file_type || 'application/octet-stream' })
  return { ...meta(data), blob }
}

export async function deleteUserFile({ recordType, recordId, folder = '', fileName }) {
  const client = requireClient()
  const userId = await currentUserId()
  const { error } = await client.from('user_files').delete()
    .eq('user_id', userId)
    .eq('record_type', String(recordType || 'record'))
    .eq('record_id', String(recordId || ''))
    .eq('folder', String(folder || ''))
    .eq('file_name', String(fileName || ''))
  if (error) throw error
}

export async function deleteUserFiles({ recordType, recordId, folder = null } = {}) {
  const client = requireClient()
  const userId = await currentUserId()
  let query = client.from('user_files').delete().eq('user_id', userId)
    .eq('record_type', String(recordType || 'record'))
    .eq('record_id', String(recordId || ''))
  if (folder !== null) query = query.eq('folder', String(folder || ''))
  const { error } = await query
  if (error) throw error
}
