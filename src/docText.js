// Text extraction for lead attachments, one entry point per file type.
//
// The AI can only use what we can read. PDFs already had a path (tenderParse);
// this adds .docx and plain-text formats, so an enquiry sent as a Word document
// reaches the model as contents rather than as a bare filename. Everything is
// client-side and dependency-free — a .docx is just a ZIP, and the platform
// supplies the inflate.

// ------------------------------------------------------------------ zip

const sigAt = (view, pos, sig) => pos >= 0 && pos + 4 <= view.byteLength && view.getUint32(pos, true) === sig

// Locate the End Of Central Directory record. It sits at the very end unless
// there is a trailing comment, so scan back over the max comment size (64 KB).
function findEocd(view) {
  const min = Math.max(0, view.byteLength - 65557)
  for (let pos = view.byteLength - 22; pos >= min; pos--) {
    if (sigAt(view, pos, 0x06054b50)) return pos
  }
  return -1
}

// Central directory → { name: {method, offset} } for the entries we may want.
function readCentralDirectory(view, bytes) {
  const eocd = findEocd(view)
  if (eocd < 0) throw new Error('not a zip archive')
  const count = view.getUint16(eocd + 10, true)
  let pos = view.getUint32(eocd + 16, true)
  const entries = new Map()
  for (let i = 0; i < count; i++) {
    if (!sigAt(view, pos, 0x02014b50)) break
    const method = view.getUint16(pos + 10, true)
    const compSize = view.getUint32(pos + 20, true)
    const nameLen = view.getUint16(pos + 28, true)
    const extraLen = view.getUint16(pos + 30, true)
    const commentLen = view.getUint16(pos + 32, true)
    const offset = view.getUint32(pos + 42, true)
    const name = new TextDecoder().decode(bytes.subarray(pos + 46, pos + 46 + nameLen))
    entries.set(name, { method, compSize, offset })
    pos += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

// Raw bytes of one entry, following its LOCAL header (the central directory's
// name/extra lengths are not necessarily the local ones).
async function readEntry(view, bytes, entry) {
  const pos = entry.offset
  if (!sigAt(view, pos, 0x04034b50)) throw new Error('bad local header')
  const nameLen = view.getUint16(pos + 26, true)
  const extraLen = view.getUint16(pos + 28, true)
  const start = pos + 30 + nameLen + extraLen
  // Slice to the exact compressed length from the CENTRAL directory — the local
  // header may defer its sizes to a data descriptor, and inflate rejects any
  // trailing bytes. A zip64 sentinel (or 0) means "unknown", so take the rest.
  const size = entry.compSize && entry.compSize !== 0xffffffff ? entry.compSize : bytes.byteLength - start
  const compressed = bytes.subarray(start, start + size)
  if (entry.method === 0) return compressed
  if (entry.method !== 8) throw new Error('unsupported compression method ' + entry.method)
  if (typeof DecompressionStream === 'undefined') throw new Error('no inflate available')
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

// ----------------------------------------------------------------- docx

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

const decodeEntities = s => s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body) => {
  if (body[0] === '#') {
    const code = body[1] === 'x' || body[1] === 'X'
      ? parseInt(body.slice(2), 16)
      : parseInt(body.slice(1), 10)
    return Number.isFinite(code) ? String.fromCodePoint(code) : whole
  }
  return ENTITIES[body] ?? whole
})

// WordprocessingML → plain text. Paragraph and row ends become newlines, tabs
// and breaks are kept, every other tag is dropped. Exported for the tests.
export function docxXmlToText(xml) {
  return decodeEntities(
    xml
      .replace(/<w:tab\b[^>]*\/?>/g, '\t')
      .replace(/<w:br\b[^>]*\/?>/g, '\n')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<\/w:tr>/g, '\n')
      .replace(/<\/w:tc>/g, '\t')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function extractDocxText(buffer) {
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  const entries = readCentralDirectory(view, bytes)
  const entry = entries.get('word/document.xml')
  if (!entry) throw new Error('no word/document.xml — not a Word document')
  const xml = new TextDecoder().decode(await readEntry(view, bytes, entry))
  return docxXmlToText(xml)
}

// ------------------------------------------------------------- dispatch

const extOf = name => (String(name).match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase()

const TEXT_EXT = ['txt', 'csv', 'md', 'eml', 'json', 'log']

const NO_TEXT = 'No text layer in this file type — the name is attached, not the contents.'

// One picked file → { text?, pages?, err? }. Never throws: a file we cannot read
// still attaches by name, which is what the old PDF-only path did.
export async function extractDocText(file) {
  const ext = extOf(file.name)
  const type = file.type || ''

  if (ext === 'pdf' || type === 'application/pdf') {
    try {
      const { extractPdfText } = await import('./tenderParse.js')
      const { struct, fullText, charCount } = await extractPdfText(file)
      if (!charCount) return { pages: struct.length, err: 'Scanned — no text layer; the name is attached, not the contents.' }
      return { pages: struct.length, text: fullText }
    } catch (e) {
      return { err: 'Could not read this PDF (' + (e?.message || e?.code || 'unknown') + ') — the name is attached, not the contents.' }
    }
  }

  if (ext === 'docx' || type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    try {
      const text = await extractDocxText(await file.arrayBuffer())
      if (!text) return { err: 'This Word document has no readable text — the name is attached, not the contents.' }
      return { text }
    } catch (e) {
      return { err: 'Could not read this Word document (' + (e?.message || 'unknown') + ') — the name is attached, not the contents.' }
    }
  }

  if (TEXT_EXT.includes(ext) || type.startsWith('text/')) {
    try {
      const text = (await file.text()).trim()
      return text ? { text } : { err: 'This file is empty — the name is attached, not the contents.' }
    } catch (e) {
      return { err: 'Could not read this file (' + (e?.message || 'unknown') + ') — the name is attached, not the contents.' }
    }
  }

  return { err: NO_TEXT }
}
