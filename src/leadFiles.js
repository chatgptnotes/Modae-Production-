// Files attached to a lead in the inbox, held until the lead is registered and
// they can be uploaded into the opportunity's Customer Specs folder.
//
// Deliberately in-memory: the store persists to localStorage, which cannot hold
// blobs. The lead keeps the file METADATA (name, size, pages, extracted text) —
// that survives a reload; only the upload-on-registration step is lost.
const held = new Map()

export function hold(leadId, files) {
  const real = (files || []).filter(Boolean)
  if (real.length) held.set(leadId, real)
}

export function peek(leadId) {
  return held.get(leadId) || []
}

// Read once — the files are consumed by the upload at registration.
export function take(leadId) {
  const files = held.get(leadId) || []
  held.delete(leadId)
  return files
}
