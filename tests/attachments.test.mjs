import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

import { docxXmlToText, extractDocxText, extractDocText } from '../src/docText.js'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

// Minimal ZIP writer, so the fixture is a real .docx rather than a mock: local
// header + central directory + EOCD, which is exactly what the reader parses.
function buildZip(entries, { deflate = true } = {}) {
  const parts = []
  const central = []
  let offset = 0
  for (const [name, content] of entries) {
    const nameBytes = Buffer.from(name, 'utf8')
    const raw = Buffer.from(content, 'utf8')
    const data = deflate ? zlib.deflateRawSync(raw) : raw
    const method = deflate ? 8 : 0

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(method, 8)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    parts.push(local, nameBytes, data)

    const cd = Buffer.alloc(46)
    cd.writeUInt32LE(0x02014b50, 0)
    cd.writeUInt16LE(method, 10)
    cd.writeUInt32LE(data.length, 20)
    cd.writeUInt32LE(raw.length, 24)
    cd.writeUInt16LE(nameBytes.length, 28)
    cd.writeUInt32LE(offset, 42)
    central.push(cd, nameBytes)

    offset += 30 + nameBytes.length + data.length
  }
  const body = Buffer.concat(parts)
  const dir = Buffer.concat(central)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(dir.length, 12)
  eocd.writeUInt32LE(body.length, 16)
  const zip = Buffer.concat([body, dir, eocd])
  return zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength)
}

const docx = (xml, opts) => buildZip([
  ['[Content_Types].xml', '<Types/>'],
  ['word/document.xml', xml],
  ['docProps/app.xml', '<Properties/>'],
], opts)

const fileOf = (name, buffer, type = '') => new File([buffer], name, { type })

// ------------------------------------------------------------ docx → text

test('WordprocessingML becomes readable text', () => {
  const text = docxXmlToText(
    '<w:body><w:p><w:r><w:t>Enquiry for Spares</w:t></w:r></w:p>' +
    '<w:p><w:r><w:t>Item</w:t></w:r><w:tab/><w:r><w:t>Qty</w:t></w:r></w:p>' +
    '<w:p><w:r><w:t>VM600 rack &amp; probes &lt;3 off&gt;</w:t></w:r></w:p></w:body>')
  assert.equal(text, 'Enquiry for Spares\nItem\tQty\nVM600 rack & probes <3 off>')
})

test('numeric and named XML entities are decoded', () => {
  assert.equal(docxXmlToText('<w:t>50&#176;C &#x2014; ISO&nbsp;9001</w:t>'), '50°C — ISO 9001')
})

test('table cells and breaks keep their structure', () => {
  const text = docxXmlToText('<w:tr><w:tc><w:t>P/N</w:t></w:tc><w:tc><w:t>330180</w:t></w:tc></w:tr>')
  assert.equal(text, 'P/N\t330180')
})

// ------------------------------------------------------- docx container

test('a deflated .docx is unzipped and read', async () => {
  const text = await extractDocxText(docx('<w:p><w:r><w:t>Please quote 3 x VM600</w:t></w:r></w:p>'))
  assert.equal(text, 'Please quote 3 x VM600')
})

test('a stored (uncompressed) .docx is read too', async () => {
  const text = await extractDocxText(docx('<w:p><w:t>Stored entry</w:t></w:p>', { deflate: false }))
  assert.equal(text, 'Stored entry')
})

test('a file that is not a zip is rejected, not silently empty', async () => {
  await assert.rejects(() => extractDocxText(Buffer.from('plain text, not a docx').buffer))
})

// ------------------------------------------------------------- dispatch

test('extractDocText reads a Word enquiry', async () => {
  const out = await extractDocText(fileOf('enquiry.docx', docx('<w:p><w:t>Qty 5 sensors</w:t></w:p>')))
  assert.equal(out.text, 'Qty 5 sensors')
  assert.equal(out.err, undefined)
})

// The old behaviour for unreadable files must survive: attach by name, say so,
// and never throw — a bad file cannot be allowed to break adding a document.
test('a corrupt .docx attaches by name with an explanation', async () => {
  const out = await extractDocText(fileOf('broken.docx', Buffer.from('not a zip').buffer))
  assert.equal(out.text, undefined)
  assert.match(out.err, /Could not read this Word document/)
})

test('a spreadsheet attaches by name only', async () => {
  const out = await extractDocText(fileOf('bom.xlsx', Buffer.from('anything').buffer))
  assert.equal(out.text, undefined)
  assert.match(out.err, /No text layer/)
})

test('plain text attachments are read directly', async () => {
  const out = await extractDocText(fileOf('rfq.txt', Buffer.from('Need 2 probes')))
  assert.equal(out.text, 'Need 2 probes')
})

test('an empty text file is reported rather than passed on as content', async () => {
  const out = await extractDocText(fileOf('empty.txt', Buffer.from('   ')))
  assert.equal(out.text, undefined)
  assert.match(out.err, /empty/)
})

// ------------------------------------------------------------ the wiring

// Guards the regression this feature exists to fix: a .docx used to reach the
// model as a bare filename, so a lead built from one extracted almost nothing.
test('lead attachments are read through docText, not the PDF-only path', () => {
  const inbox = read('src/pages/Inbox.jsx')
  assert.match(inbox, /extractDocText/, 'readAttachment must use the shared extractor')
  assert.doesNotMatch(inbox, /import \{ extractPdfText \}/, 'the PDF-only import is superseded')
  assert.match(inbox, /attachmentText/, 'fallback extraction must include readable attachment text')
  assert.match(inbox, /attachmentHasSpecs/, 'fallback extraction must recognise document specifications')
  assert.match(inbox, /Required quantities/, 'specification-present documents must isolate missing quantities')
  assert.match(inbox, /aiAttachments/, 'AI extraction must receive temporary file inputs')
})

test('the edge function sends uploaded files as Gemini inline data', () => {
  const ai = read('supabase/functions/ai/index.ts')
  assert.match(ai, /inlineData/, 'multimodal attachments must be sent to Gemini')
  assert.match(ai, /payload\.aiAttachments/, 'the edge function must read the attachment payload')
})

test('the Vercel AI route uses only the server-side Gemini key', () => {
  const ai = read('api/ai.js')
  assert.match(ai, /process\.env\.GEMINI_API_KEY/)
  assert.match(ai, /lead\.extract/)
  assert.match(ai, /inlineData/)
  assert.doesNotMatch(ai, /VITE_GEMINI|VITE_GEMINI_API_KEY/)
})

test('attachments are viewable and lead documents can be added after creation', () => {
  const inbox = read('src/pages/Inbox.jsx')
  assert.match(inbox, /attach-row-open/, 'attachment rows must be a click target')
  assert.match(inbox, /AttachmentViewer/, 'the viewer must be mounted')
  assert.match(inbox, /attachments: nextAttachments/, 'adding a document must patch lead.attachments')
  assert.match(inbox, /failureNote: `\$\{names\} was attached successfully/, 'failed AI re-reads must name the saved document')
  assert.match(inbox, /previous extracted fields are unchanged/, 'failed AI re-reads must preserve prior fields visibly')
  assert.match(inbox, /deleteSelected/, 'the inbox must expose selected-lead deletion')
  assert.match(inbox, /Delete .*selected lead/, 'deletion must require a confirmation message')
})

test('lead deletion removes the lead and its persisted attachment bytes', () => {
  const store = read('src/store.jsx')
  assert.match(store, /deleteLead\(id\)/)
  assert.match(store, /leadBlobs\.deleteLead\(id\)/)
  assert.match(store, /leads: \(s\.leads \|\| \[\]\)\.filter\(l => l\.id !== id\)/)
  assert.match(store, /if \(!lead \|\| lead\.oppId\) return false/)
})

test('blobs are persisted so a reload can still preview and upload them', () => {
  assert.match(read('src/leadFiles.js'), /leadBlobs/, 'holds must write through to IndexedDB')
  assert.match(read('src/pages/Register.jsx'), /await take\(lead\.id\)/, 'take() is async now')
  assert.match(read('src/store.jsx'), /leadBlobs\.clearAll/, 'reset demo data must clear the blob store')
})
