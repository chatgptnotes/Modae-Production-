// Files attached to a lead in the inbox, held until the lead is registered and
// they can be uploaded into the opportunity's Customer Specs folder.
//
// The in-memory Map is the fast path; every write also goes to IndexedDB
// (leadBlobs.js) because the store persists to localStorage, which cannot hold
// blobs. That is what lets an attachment still be previewed — and still be
// uploaded at registration — after a page reload.
import * as blobs from './leadBlobs.js'

const held = new Map()

export function hold(leadId, files) {
  const real = (files || []).filter(Boolean)
  if (!real.length) return
  held.set(leadId, real)
  blobs.putFiles(leadId, real)
}

// Append to what a lead already holds — documents added on the lead detail
// screen join the ones that arrived with the mail.
export function add(leadId, files) {
  const real = (files || []).filter(Boolean)
  if (!real.length) return
  held.set(leadId, [...(held.get(leadId) || []), ...real])
  blobs.putFiles(leadId, real)
}

export function peek(leadId) {
  return held.get(leadId) || []
}

// Remove one held document without touching the lead's other attachments.
export async function remove(leadId, name) {
  if (!leadId || !name) return
  held.set(leadId, (held.get(leadId) || []).filter(file => file.name !== name))
  await blobs.deleteFile(leadId, name)
}

// Read once — the files are consumed by the upload at registration. Falls back
// to IndexedDB when memory is empty, which is the post-reload case.
export async function take(leadId) {
  const memory = held.get(leadId)
  held.delete(leadId)
  const files = memory && memory.length ? memory : await blobs.listFiles(leadId)
  await blobs.deleteLead(leadId)
  return files
}
