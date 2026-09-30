// Build the transient multimodal payload used by document-aware AI tasks.
// File bytes are never persisted in lead/opportunity state or sent to the
// browser-visible AI configuration; they go only to the authenticated server
// proxy for the duration of a request.

// Keep the JSON request below the server proxy limit after base64 expansion and
// prompt overhead. Larger source files still remain attached locally/cloud-side
// and are reported as requiring a smaller visual copy or text extraction.
export const AI_FILE_BYTES = 900 * 1024
export const AI_TOTAL_BYTES = 1800 * 1024

export const visualMimeType = file => {
  const name = String(file?.name || '')
  const type = String(file?.type || '')
  if (type === 'application/pdf' || /\.pdf$/i.test(name)) return 'application/pdf'
  if (/^image\//i.test(type)) return type
  if (/\.(png|jpe?g|gif|webp)$/i.test(name)) {
    const ext = name.match(/\.(png|jpe?g|gif|webp)$/i)[1].toLowerCase().replace('jpg', 'jpeg')
    return `image/${ext}`
  }
  return ''
}

export const supportsVisualAi = file => Boolean(visualMimeType(file))

export async function aiAttachmentPayload(files = [], { maxFileBytes = AI_FILE_BYTES, maxTotalBytes = AI_TOTAL_BYTES } = {}) {
  let total = 0
  const out = []
  for (const entry of files || []) {
    const file = entry?.file || entry
    const mimeType = visualMimeType(file)
    if (!file || !mimeType || typeof file.arrayBuffer !== 'function') continue
    const size = Number(file.size) || 0
    if (size > maxFileBytes || total + size > maxTotalBytes) continue
    const bytes = new Uint8Array(await file.arrayBuffer())
    let binary = ''
    const chunk = 0x8000
    for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
    out.push({ name: file.name, mimeType, dataBase64: btoa(binary) })
    total += size
  }
  return out
}
