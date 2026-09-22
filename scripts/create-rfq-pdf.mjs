import fs from 'node:fs'

const out = new URL('../RFQ-TEST-2026-003-Vedanta-Lanjigarh.pdf', import.meta.url)
const W = 595.28
const H = 841.89
const margin = 42
const colors = {
  ink: [0.09, 0.12, 0.15],
  muted: [0.35, 0.39, 0.43],
  line: [0.83, 0.85, 0.86],
  blue: [0.06, 0.25, 0.42],
  paleBlue: [0.93, 0.96, 0.98],
  red: [0.70, 0.12, 0.10],
  paleRed: [0.99, 0.93, 0.92],
  amber: [0.86, 0.48, 0.08],
  paleAmber: [1.00, 0.96, 0.89],
}

const esc = value => String(value)
  .replaceAll('\\', '\\\\')
  .replaceAll('(', '\\(')
  .replaceAll(')', '\\)')
  .replaceAll('—', '-')
  .replaceAll('–', '-')
  .replaceAll('’', "'")

const rgb = c => `${c.map(v => v.toFixed(3)).join(' ')} rg`
const stroke = c => `${c.map(v => v.toFixed(3)).join(' ')} RG`

function fontSizeFor(text, maxWidth, size, factor = 0.52) {
  return Math.min(size, maxWidth / Math.max(1, String(text).length * factor))
}

function wrap(text, maxChars) {
  const words = String(text).split(/\s+/)
  const lines = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (candidate.length > maxChars && line) {
      lines.push(line)
      line = word
    } else {
      line = candidate
    }
  }
  if (line) lines.push(line)
  return lines
}

function page(content) {
  const ops = []
  const text = (x, y, value, size = 9, color = colors.ink, font = 'F1') => {
    ops.push(`${rgb(color)} BT /${font} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${esc(value)}) Tj ET`)
  }
  const textRight = (x, y, value, size = 9, color = colors.ink, font = 'F1') => {
    const width = String(value).length * size * 0.52
    text(x - width, y, value, size, color, font)
  }
  const rect = (x, y, w, h, fill = null, border = null, lineWidth = 1) => {
    if (fill) ops.push(`${rgb(fill)} ${border ? stroke(border) : ''} ${lineWidth} w ${x} ${y} ${w} ${h} re ${border ? 'B' : 'f'}`)
    else if (border) ops.push(`${stroke(border)} ${lineWidth} w ${x} ${y} ${w} ${h} re S`)
  }
  const rule = (x1, y1, x2, y2, color = colors.line, lineWidth = 0.8) => ops.push(`${stroke(color)} ${lineWidth} w ${x1} ${y1} m ${x2} ${y2} l S`)
  const label = (x, y, value) => text(x, y, String(value).toUpperCase(), 7.5, colors.muted, 'F2')
  const wrapped = (x, y, value, maxChars, size = 9, leading = 13, color = colors.ink, font = 'F1') => {
    let yy = y
    for (const line of wrap(value, maxChars)) {
      text(x, yy, line, size, color, font)
      yy -= leading
    }
    return yy
  }
  content({ ops, text, textRight, rect, rule, label, wrapped })
  return ops.join('\n')
}

const pages = []

pages.push(page(({ ops, text, textRight, rect, rule, label, wrapped }) => {
  rect(0, 0, W, H, [1, 1, 1])
  rect(0, H - 92, W, 92, colors.blue)
  text(margin, H - 37, 'ModAE', 24, [1, 1, 1], 'F2')
  text(margin, H - 62, 'LEAD INTAKE / RFQ RECORD', 8, [0.80, 0.88, 0.94], 'F2')
  textRight(W - margin, H - 39, 'NEW LEAD', 9, [1, 1, 1], 'F2')
  textRight(W - margin, H - 62, 'RFQ-TEST-2026-003', 8.5, [0.80, 0.88, 0.94], 'F1')

  text(margin, H - 127, 'CPP turbine probe replacement', 20, colors.ink, 'F2')
  text(margin, H - 148, 'Vedanta (Lanjigarh) | Spares | Energy / Industrial', 9.5, colors.muted)
  rect(W - margin - 88, H - 145, 88, 24, colors.paleRed, colors.red, 0.8)
  text(W - margin - 76, H - 135, 'RED CUSTOMER', 8, colors.red, 'F2')

  const top = H - 184
  label(margin, top, 'Lead source')
  text(margin, top - 17, 'procurement@vedanta-lanjigarh.example.com', 9.2)
  label(310, top, 'RFQ date')
  text(310, top - 17, '10 September 2026', 9.2)
  rule(margin, top - 31, W - margin, top - 31)

  label(margin, top - 56, 'Customer and end user')
  text(margin, top - 76, 'Sell-to: Vedanta (Lanjigarh)', 9.2)
  text(margin, top - 93, 'End User / EUC: Vedanta', 9.2)
  text(margin, top - 110, 'EUC Location: Lanjigarh, Odisha', 9.2)
  label(310, top - 56, 'Contact')
  text(310, top - 76, 'Rakesh Mishra', 9.2)
  text(310, top - 93, 'Senior Purchase Engineer', 9.2)
  text(310, top - 110, '+91 92345 67890', 9.2)
  text(310, top - 127, 'procurement@vedanta-lanjigarh.example.com', 8.5)

  const tableTop = top - 162
  label(margin, tableTop + 16, 'Required spares - source from current price list')
  rect(margin, tableTop - 8, W - margin * 2, 24, colors.paleBlue)
  text(margin + 10, tableTop, '#', 8, colors.blue, 'F2')
  text(margin + 34, tableTop, 'Description', 8, colors.blue, 'F2')
  text(438, tableTop, 'Qty', 8, colors.blue, 'F2')
  text(486, tableTop, 'UOM', 8, colors.blue, 'F2')
  const rows = [
    ['1', 'Proximity probe, 8 mm', '6', 'EA'],
    ['2', 'Extension cable, 5 m', '6', 'EA'],
    ['3', 'Signal conditioner module', '3', 'EA'],
    ['4', 'MPC4 rack controller', '1', 'EA'],
    ['5', 'Rack CPU spare', '1', 'EA'],
  ]
  let y = tableTop - 29
  for (const [no, desc, qty, uom] of rows) {
    text(margin + 10, y, no, 9, colors.muted)
    text(margin + 34, y, desc, 9.2)
    text(440, y, qty, 9.2)
    text(486, y, uom, 9.2, colors.muted)
    rule(margin, y - 9, W - margin, y - 9)
    y -= 25
  }

  const reqTop = y - 3
  label(margin, reqTop, 'Technical requirements')
  const tech = [
    'Compatible with the existing VM600 vibration monitoring rack',
    'OEM or approved equivalent parts only',
    'Include datasheets and country of origin',
    'Minimum 12-month warranty; delivery within 8 weeks',
  ]
  y = reqTop - 19
  for (const item of tech) { text(margin + 4, y, `- ${item}`, 8.9); y -= 15 }

  rect(margin, 64, W - margin * 2, 42, colors.paleAmber, colors.amber, 0.8)
  text(margin + 12, 91, 'NEXT ACTION', 7.5, colors.amber, 'F2')
  text(margin + 12, 75, 'Confirm exact part numbers and current price-list pricing for every line.', 9.2, colors.ink, 'F2')
  text(margin, 38, 'Prepared for manual lead entry | Page 1 of 2', 7.5, colors.muted)
  textRight(W - margin, 38, 'RFQ-TEST-2026-003', 7.5, colors.muted)
}))

pages.push(page(({ text, textRight, rect, rule, label, wrapped }) => {
  rect(0, 0, W, H, [1, 1, 1])
  rect(0, H - 78, W, 78, colors.blue)
  text(margin, H - 36, 'RFQ-TEST-2026-003', 18, [1, 1, 1], 'F2')
  text(margin, H - 57, 'COMMERCIAL / WORKFLOW CONTROLS', 8, [0.80, 0.88, 0.94], 'F2')
  textRight(W - margin, H - 45, 'Vedanta (Lanjigarh)', 9, [1, 1, 1], 'F1')

  let y = H - 116
  label(margin, y, 'Commercial requirements')
  y -= 22
  const commercial = [
    'Payment terms requested: 60 days from invoice',
    'Quotation validity: 45 days',
    'Include freight, GST, and delivery to Lanjigarh',
    'Mention exclusions and applicable taxes',
  ]
  for (const item of commercial) { text(margin + 4, y, `- ${item}`, 9.2); y -= 18 }

  rect(margin, y - 68, W - margin * 2, 58, colors.paleRed, colors.red, 0.9)
  text(margin + 14, y - 30, 'COMMERCIAL DEVIATION', 8, colors.red, 'F2')
  wrapped(margin + 14, y - 47, 'The requested 60-day payment term is a deviation from standard terms and must create an AH approval requirement after registration.', 82, 8.9, 12, colors.ink)
  y -= 102

  label(margin, y, 'Approval and registration gate')
  y -= 25
  const gateRows = [
    ['Customer classification', 'Red'],
    ['Lead state', 'Blocked - clearance required'],
    ['Approval route', 'Joint LJS + AH clearance'],
    ['Opportunity registration', 'Not permitted until both approvals complete'],
    ['Post-registration control', 'Commercial deviation: 60-day payment term / AH approval'],
  ]
  const labelX = margin + 12
  const valueX = 245
  rect(margin, y - gateRows.length * 25 - 8, W - margin * 2, gateRows.length * 25 + 8, [0.98, 0.98, 0.98], colors.line, 0.7)
  for (const [k, v] of gateRows) {
    text(labelX, y - 14, k, 8.6, colors.muted)
    text(valueX, y - 14, v, 8.9, k === 'Customer classification' ? colors.red : colors.ink, k === 'Customer classification' ? 'F2' : 'F1')
    rule(margin + 8, y - 21, W - margin - 8, y - 21, colors.line, 0.5)
    y -= 25
  }
  y -= 31

  label(margin, y, 'Sourcing instruction')
  y -= 22
  wrapped(margin + 4, y, 'Sourcing must require current pricing for each spares line from the active price list. Confirm exact part number, approved status, availability, lead time, and applicable taxes before quotation.', 91, 9.2, 15)
  y -= 74

  label(margin, y, 'Quotation notes')
  y -= 22
  wrapped(margin + 4, y, 'Please provide the best techno-commercial offer with datasheets, country of origin, warranty confirmation, delivery commitment, freight, GST, exclusions, and applicable taxes.', 91, 9.2, 15)

  rect(margin, 72, W - margin * 2, 42, colors.paleBlue, colors.blue, 0.8)
  text(margin + 12, 98, 'MANUAL ENTRY SUMMARY', 7.5, colors.blue, 'F2')
  text(margin + 12, 82, 'New lead | Spares | Red customer | Joint LJS + AH clearance | Price-list sourcing', 8.9, colors.ink, 'F2')
  text(margin, 44, 'Prepared for manual lead entry | Page 2 of 2', 7.5, colors.muted)
  textRight(W - margin, 44, 'RFQ-TEST-2026-003', 7.5, colors.muted)
}))

const objects = [null, null, null, null]
const add = body => { objects.push(`<< /Length ${Buffer.byteLength(body, 'binary')} >>\nstream\n${body}\nendstream`); return objects.length }
const catalog = 1
const pagesObject = 2
const fontRegular = 3
const fontBold = 4
const pageObjects = []
for (const content of pages) {
  const contentObject = add(content)
  const pageObject = objects.length + 1
  pageObjects.push(pageObject)
  objects.push(`<< /Type /Page /Parent ${pagesObject} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${contentObject} 0 R >>`)
}
objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObject} 0 R >>`
objects[pagesObject - 1] = `<< /Type /Pages /Kids [${pageObjects.map(n => `${n} 0 R`).join(' ')}] /Count ${pageObjects.length} >>`
objects[fontRegular - 1] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
objects[fontBold - 1] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'

let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'
const offsets = [0]
for (let i = 0; i < objects.length; i++) {
  offsets.push(Buffer.byteLength(pdf, 'binary'))
  pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`
}
const xref = Buffer.byteLength(pdf, 'binary')
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
for (let i = 1; i < offsets.length; i++) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info << /Title (RFQ-TEST-2026-003 - Vedanta Lanjigarh) /Author (ModAE) >> >>\nstartxref\n${xref}\n%%EOF\n`
fs.writeFileSync(out, pdf, 'binary')
console.log(`Wrote ${out.pathname}`)
