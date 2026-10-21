// Build the transient multimodal payload used by document-aware AI tasks.
// File bytes are never persisted in lead/opportunity state or sent to the
// browser-visible AI configuration; they go only to the authenticated server
// proxy for the duration of a request.

// Keep the JSON request below the server proxy limit after base64 expansion and
// prompt overhead. Larger source files still remain attached locally/cloud-side
// and are reported as requiring a smaller visual copy or text extraction.
export const AI_FILE_BYTES = 900 * 1024
export const AI_TOTAL_BYTES = 1800 * 1024
export const AI_MAX_FILES = 8
const GEMINI_IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'])
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'heic', 'heif'])
const IMAGE_LIKE_EXTENSIONS = new Set(['avif', 'bmp', 'gif', 'svg', 'tif', 'tiff'])

const isUnsupportedImage = (file, type = String(file?.type || '')) => type.startsWith('image/')
  || IMAGE_LIKE_EXTENSIONS.has(String(file?.name || '').match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase())

export const visualMimeType = file => {
  const name = String(file?.name || '')
  const type = String(file?.type || '')
  if (type === 'application/pdf' || /\.pdf$/i.test(name)) return 'application/pdf'
  const normalizedImageType = type.toLowerCase() === 'image/jpg' ? 'image/jpeg' : type.toLowerCase()
  if (GEMINI_IMAGE_MIMES.has(normalizedImageType)) return normalizedImageType
  if (/\.doc$/i.test(name) || type === 'application/msword') return 'application/msword'
  if (/\.ppt$/i.test(name) || type === 'application/vnd.ms-powerpoint') return 'application/vnd.ms-powerpoint'
  const officeMimeTypes = {
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    odt: 'application/vnd.oasis.opendocument.text',
    ods: 'application/vnd.oasis.opendocument.spreadsheet',
    odp: 'application/vnd.oasis.opendocument.presentation',
    rtf: 'application/rtf',
  }
  const officeExtension = name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase()
  if (officeMimeTypes[officeExtension]) return officeMimeTypes[officeExtension]
  const imageExtension = name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase()
  if (IMAGE_EXTENSIONS.has(imageExtension)) return `image/${imageExtension === 'jpg' ? 'jpeg' : imageExtension}`
  return ''
}

export const supportsVisualAi = file => Boolean(visualMimeType(file))

// File/Blob bytes are immutable. Reuse encoding during intake without retaining files.
const encodedFiles = new WeakMap()

export async function aiAttachmentPayload(files = [], { maxFileBytes = AI_FILE_BYTES, maxTotalBytes = AI_TOTAL_BYTES, maxFiles = AI_MAX_FILES } = {}) {
  let total = 0
  let included = 0
  const out = []
  for (const entry of files || []) {
    const file = entry?.file || entry
    const mimeType = visualMimeType(file)
    if (!file || typeof file.arrayBuffer !== 'function') continue
    if (!mimeType) {
      if (isUnsupportedImage(file)) out.push({ name: file.name, skippedReason: 'unsupported-image-format' })
      continue
    }
    const size = Number(file.size) || 0
    if (size > maxFileBytes) {
      out.push({ name: file.name, skippedReason: 'file-too-large' })
      continue
    }
    if (total + size > maxTotalBytes) {
      out.push({ name: file.name, skippedReason: 'scan-too-large' })
      continue
    }
    if (included >= maxFiles) {
      out.push({ name: file.name, skippedReason: 'too-many-files' })
      continue
    }
    let dataBase64 = encodedFiles.get(file)
    if (dataBase64 === undefined) {
      const bytes = new Uint8Array(await file.arrayBuffer())
      let binary = ''
      const chunk = 0x8000
      for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
      dataBase64 = btoa(binary)
      if (typeof Blob !== 'undefined' && file instanceof Blob) encodedFiles.set(file, dataBase64)
    }
    out.push({ name: file.name, mimeType, dataBase64 })
    total += size
    included += 1
  }
  return out
}

// A re-run starts from compact lead metadata, then rehydrates original files
// into attachment records. Rebuild their visual payloads and merge any
// transient payload supplied by the current upload action.
export async function completeAiAttachmentPayload(attachments = [], supplied = []) {
  const hydrated = await aiAttachmentPayload(attachments)
  const merged = new Map()
  for (const file of [...(supplied || []), ...hydrated]) {
    if (file?.name) merged.set(file.name, file)
  }
  let total = 0
  let included = 0
  return [...merged.values()].map(file => {
    if (!file?.dataBase64) return file
    const encoded = file.dataBase64
    const size = Math.max(0, Math.floor(encoded.length * 3 / 4) - (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0))
    let skippedReason = ''
    if (size > AI_FILE_BYTES) skippedReason = 'file-too-large'
    else if (total + size > AI_TOTAL_BYTES) skippedReason = 'scan-too-large'
    else if (included >= AI_MAX_FILES) skippedReason = 'too-many-files'
    if (skippedReason) return { name: file.name, skippedReason }
    total += size
    included += 1
    return file
  })
}
