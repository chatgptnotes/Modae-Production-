import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

import { docxXmlToText, extractDocxText, extractDocText } from '../src/docText.js'
import { aiAttachmentPayload, completeAiAttachmentPayload, supportsVisualAi, visualMimeType } from '../src/aiAttachments.js'
import XLSX from 'xlsx-js-style'
import JSZip from 'jszip'
import { convertOfficeToPdf } from '../api/_office-convert.js'

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

test('Excel XLSX and XLS workbooks are extracted with sheet names and cell content', async () => {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Item', 'Quantity'], ['Vibration sensor', 6]]), 'RFQ Lines')
  for (const bookType of ['xlsx', 'xls']) {
    const bytes = XLSX.write(workbook, { type: 'array', bookType })
    const out = await extractDocText(fileOf(`bom.${bookType}`, bytes))
    assert.match(out.text, /RFQ Lines/)
    assert.match(out.text, /Vibration sensor\s*\|\s*6/)
    assert.equal(out.err, undefined)
  }
})

test('damaged Excel files report that their contents could not be read', async () => {
  const out = await extractDocText(fileOf('broken.xls', Buffer.from('not a workbook')))
  assert.equal(out.text, undefined)
  assert.match(out.err, /Could not read this spreadsheet/)
})

test('PowerPoint slides are extracted with slide boundaries', async () => {
  const zip = new JSZip()
  zip.file('ppt/slides/slide1.xml', '<p:sld><a:p><a:r><a:t>RFQ for six sensors</a:t></a:r></a:p></p:sld>')
  zip.file('ppt/slides/slide2.xml', '<p:sld><a:p><a:r><a:t>Delivery to Pune</a:t></a:r></a:p></p:sld>')
  const bytes = await zip.generateAsync({ type: 'arraybuffer' })
  const out = await extractDocText(fileOf('enquiry.pptx', bytes))
  assert.match(out.text, /Slide 1/)
  assert.match(out.text, /RFQ for six sensors/)
  assert.match(out.text, /Slide 2/)
  assert.match(out.text, /Delivery to Pune/)
})

test('legacy Office documents are converted to a temporary PDF for AI scanning', async () => {
  let tempDirectory = ''
  const { bytes, filename } = await convertOfficeToPdf(Buffer.from('legacy document'), 'quote.doc', {
    execFileImpl: async (_command, args) => {
      const outDir = args[args.indexOf('--outdir') + 1]
      tempDirectory = outDir
      const inputPath = args.at(-1)
      const pdfName = `${path.basename(inputPath, path.extname(inputPath))}.pdf`
      fs.writeFileSync(path.join(outDir, pdfName), Buffer.from('%PDF-test'))
    },
  })
  assert.equal(filename, 'quote.pdf')
  assert.equal(bytes.toString(), '%PDF-test')
  assert.equal(fs.existsSync(tempDirectory), false, 'conversion inputs and outputs are deleted after the scan')
})

test('modern Office, OpenDocument, and RTF files are converted to temporary PDFs', async () => {
  for (const filename of ['quote.docx', 'parts.xlsx', 'parts.xls', 'slides.pptx', 'request.odt', 'request.ods', 'request.odp', 'request.rtf']) {
    const { bytes, filename: outputName } = await convertOfficeToPdf(Buffer.from('office document'), filename, {
      execFileImpl: async (_command, args) => {
        const directory = args[args.indexOf('--outdir') + 1]
        const inputPath = args.at(-1)
        fs.writeFileSync(path.join(directory, `${path.basename(inputPath, path.extname(inputPath))}.pdf`), Buffer.from('%PDF-test'))
      },
    })
    assert.equal(bytes.toString(), '%PDF-test', filename)
    assert.equal(outputName, `${path.basename(filename, path.extname(filename))}.pdf`)
  }
})

test('unknown legacy conversion formats are rejected with a readable error', async () => {
  await assert.rejects(() => convertOfficeToPdf(Buffer.from('x'), 'drawing.cad'), /not supported for conversion/i)
})

test('missing LibreOffice is reported as an actionable conversion error', async () => {
  await assert.rejects(() => convertOfficeToPdf(Buffer.from('legacy document'), 'quote.doc', {
    execFileImpl: async () => { const error = new Error('missing'); error.code = 'ENOENT'; throw error },
  }), { code: 'OFFICE_CONVERSION_UNAVAILABLE' })
})

test('legacy Office files above the conversion limit are rejected before conversion', async () => {
  await assert.rejects(() => convertOfficeToPdf(Buffer.alloc(900 * 1024 + 1), 'quote.doc'), /too large to convert/i)
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

test('visual uploads produce bounded multimodal AI payloads', async () => {
  const image = fileOf('rfq.png', Buffer.from('image-bytes'), 'image/png')
  assert.equal(supportsVisualAi(image), true)
  assert.equal(visualMimeType({ name: 'scan.jpg', type: '' }), 'image/jpeg')
  const payload = await aiAttachmentPayload([image])
  assert.equal(payload.length, 1)
  assert.equal(payload[0].mimeType, 'image/png')
  assert.equal(typeof payload[0].dataBase64, 'string')
})

test('unsupported image MIME types are reported instead of sent raw to Gemini', async () => {
  const svg = fileOf('diagram.svg', Buffer.from('<svg/>'), 'image/svg+xml')
  assert.equal(supportsVisualAi(svg), false)
  assert.deepEqual(await aiAttachmentPayload([svg]), [{ name: 'diagram.svg', skippedReason: 'unsupported-image-format' }])
})

test('legacy Word and PowerPoint files are sent for server-side PDF conversion', async () => {
  const doc = fileOf('quote.doc', Buffer.from('legacy office bytes'))
  const ppt = fileOf('briefing.ppt', Buffer.from('legacy office bytes'))
  const payload = await aiAttachmentPayload([doc, ppt])
  assert.deepEqual(payload.map(file => file.mimeType), ['application/msword', 'application/vnd.ms-powerpoint'])
  assert.deepEqual(payload.map(file => file.name), ['quote.doc', 'briefing.ppt'])
  assert.ok(payload.every(file => file.dataBase64))
})

test('modern Office, OpenDocument, and RTF files are included for visual AI conversion', async () => {
  const files = ['quote.docx', 'parts.xlsx', 'parts.xls', 'slides.pptx', 'request.odt', 'request.ods', 'request.odp', 'request.rtf']
    .map(name => fileOf(name, Buffer.from('x')))
  const payload = await aiAttachmentPayload(files)
  assert.deepEqual(payload.map(file => file.name), files.map(file => file.name))
  assert.ok(payload.every(file => file.dataBase64 && file.mimeType))
})

test('re-extraction rebuilds visual payloads from hydrated file records and retains supplied files', async () => {
  const stored = fileOf('original.pdf', Buffer.from('original pdf bytes'), 'application/pdf')
  const newlyAdded = fileOf('new-scan.png', Buffer.from('new image bytes'), 'image/png')
  const payload = await completeAiAttachmentPayload(
    [{ name: stored.name, file: stored }],
    await aiAttachmentPayload([newlyAdded]),
  )
  assert.deepEqual(payload.map(file => file.name).sort(), ['new-scan.png', 'original.pdf'])
  assert.ok(payload.every(file => file.dataBase64))
})

test('re-extraction applies the provider file cap after merging old and newly supplied files', async () => {
  const stored = Array.from({ length: 8 }, (_, index) => {
    const file = fileOf(`stored-${index}.png`, Buffer.from('old'), 'image/png')
    return { name: file.name, file }
  })
  const added = await aiAttachmentPayload([fileOf('new.png', Buffer.from('new'), 'image/png')])
  const payload = await completeAiAttachmentPayload(stored, added)
  assert.equal(payload.filter(file => file.dataBase64).length, 8)
  assert.deepEqual(payload.at(-1), { name: 'stored-7.png', skippedReason: 'too-many-files' })
})

test('oversized visual files are named and reported instead of silently skipped', async () => {
  const tooLarge = fileOf('large.pdf', Buffer.alloc(20), 'application/pdf')
  const tooMuch = fileOf('another.pdf', Buffer.alloc(20), 'application/pdf')
  const payload = await aiAttachmentPayload([tooLarge, tooMuch], { maxFileBytes: 20, maxTotalBytes: 20 })
  assert.equal(payload[0].dataBase64.length, 28)
  assert.deepEqual(payload[1], { name: 'another.pdf', skippedReason: 'scan-too-large' })
  const individuallyTooLarge = await aiAttachmentPayload([fileOf('huge.pdf', Buffer.alloc(21), 'application/pdf')], { maxFileBytes: 20 })
  assert.deepEqual(individuallyTooLarge[0], { name: 'huge.pdf', skippedReason: 'file-too-large' })
})

test('visual attachments beyond the provider file-count limit are reported', async () => {
  const files = Array.from({ length: 3 }, (_, index) => fileOf(`scan-${index}.png`, Buffer.from('image'), 'image/png'))
  const payload = await aiAttachmentPayload(files, { maxFiles: 2 })
  assert.equal(payload.filter(file => file.dataBase64).length, 2)
  assert.deepEqual(payload[2], { name: 'scan-2.png', skippedReason: 'too-many-files' })
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
  assert.match(inbox, /completeAiAttachmentPayload\(attachments, aiAttachments\)/, 're-extraction must rebuild visual payloads from hydrated source files')
  assert.match(inbox, /finally\s*\{\s*setReExtracting\(false\)/, 'failed file rehydration must release the extraction busy state')
})

test('the Vercel AI route sends uploaded files as Gemini inline data', () => {
  const ai = read('api/ai.js')
  assert.match(ai, /inlineData/, 'multimodal attachments must be sent to Gemini')
  assert.match(ai, /payload\.aiAttachments/, 'the Vercel route must read the attachment payload')
  assert.match(ai, /convertOfficeParts\(inlineParts\(payload\)\)/, 'Office bytes must be converted before the provider request')
  assert.match(ai, /convertedFiles/, 'successful conversions must be reported in scan details')
  assert.match(read('src/server/app.ts'), /\/api\/ai', express\.json\(\{ limit: '4mb' \}\)/, 'the AI route body cap must fit encoded attachment bytes')
  assert.deepEqual(JSON.parse(read('railpack.json')).deploy.aptPackages, ['libreoffice-writer', 'libreoffice-calc', 'libreoffice-impress'])
  assert.match(ai, /'tender\.extract', 'clarification\.answer'/, 'tender and clarification tasks must receive visual attachments')
})

test('document intake and opportunity clarification pass visual files to AI', () => {
  const intake = read('src/pages/IntakeForm.jsx')
  const tender = read('src/pages/TenderIntake.jsx')
  const workbench = read('src/pages/Workbench.jsx')
  assert.match(intake, /aiAttachmentPayload\(\[file\]\)/)
  assert.match(intake, /image\/\*/)
  assert.match(tender, /aiAttachmentPayload\(\[f\]\)/)
  assert.match(tender, /image\/\*/)
  assert.match(workbench, /aiAttachments\.push\(\.\.\.await aiAttachmentPayload\(replyFiles\)\)/)
  assert.match(workbench, /runTaskResult\('kyc\.extract'/)
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
