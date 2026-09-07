import XLSX from 'xlsx-js-style'
import { MODAE_COMPANY } from '../proposalDoc.js'
import { MODAE_DOCUMENT_STANDARDS } from '../branding/modae.js'
import { generateProposalWorkbook, customerSafe } from './templateExcelExport.js'

const routeSheetName = (route, revision) => route === 'Services'
  ? `BoQ & Price-${revision}`
  : route === 'Project'
    ? `Priced BoQ Rev-${revision}`
    : `Firm Offer Rev-${revision}`

const clean = value => value == null ? '' : value

export function proposalWorkbookRows({ p, opp, doc, priced, totalQty, lineQuoted, route }) {
  const cover = [
    ['', MODAE_COMPANY.tagline],
    ['', MODAE_COMPANY.name],
    ['', MODAE_COMPANY.officialAddress],
    ['', `${MODAE_COMPANY.phone} · ${MODAE_COMPANY.email}`],
    [],
    ['Date:', p.revisionDate],
    ['Our Ref:', p.ourRef || opp.id],
    ['Bid Stage:', p.bidStage],
    ['Bid Type:', p.bidType],
    ['Revision', p.revision],
    [],
    ['', customerSafe(p.addressee) || (customerSafe(opp.sellTo) && `M/s. ${customerSafe(opp.sellTo)}`)],
    ['', opp.eucLocation || opp.location || ''],
    [],
    ['Kind Attn:', customerSafe(p.kindAttn) || customerSafe(opp.contactPerson)],
    ['Subject:', [p.rfqNumber && `RFQ ${p.rfqNumber}`, customerSafe(p.subject) || customerSafe(opp.oppName)
      || `${route || 'Techno-Commercial'} Proposal`].filter(Boolean).join(' — ')],
    ...(customerSafe(p.project) ? [['Project:', customerSafe(p.project)]] : []),
    [],
    ['', doc.letterSalutation || 'Dear Sir,'],
    ['', doc.letterBody || ''],
    [],
    ['', doc.letterClose || 'Best Regards,'],
    ['', doc.preparedBy?.name || ''],
    ['', doc.preparedBy?.title || ''],
    ['', doc.preparedBy?.division || ''],
  ]

  const priceHeader = route === 'Spares' ? ['Part number', 'Description', 'Total quantity'] : ['Sl.', 'Item Description', 'Model / Part Number', 'Total Qty', 'UOM']
  if (priced) priceHeader.push('Unit Price ₹', 'Total Price ₹')
  const rows = (p.bom || []).map((line, i) => {
    const qty = totalQty(line)
    const row = route === 'Spares' ? [line.pn || '', line.desc || line.itemCategory || '', qty] : [i + 1, line.desc || line.itemCategory || '', line.pn || '', qty, line.uom || '']
    if (priced) row.push(lineQuoted(line), lineQuoted(line) * qty)
    return row
  })
  const total = rows.reduce((sum, row) => sum + (priced ? Number(row.at(-1)) || 0 : 0), 0)
  const pricing = [
    [routeSheetName(route, p.revision)],
    [],
    priceHeader,
    ...rows,
    ...(priced ? [['', '', '', '', 'Total', '', total]] : []),
    [],
    [doc.docTermsHeading || 'Terms & Conditions:'],
    ...(doc.docTerms || []).map((term, i) => [`${i + 1}. ${term.label || ''}`, term.text || '']),
  ]
  return { cover, pricing }
}

const rowHeight = (row, widths) => {
  const lines = row.reduce((max, value, i) => {
    const text = String(clean(value))
    return Math.max(max, ...text.split('\n').map(line => Math.ceil(line.length / ((widths[i] || 12) * 1.2))))
  }, 1)
  return Math.min(180, Math.max(20, lines * 15))
}

const styleSheet = (sheet, rows, widths, headerRows = []) => {
  sheet['!cols'] = widths.map(wch => ({ wch }))
  sheet['!rows'] = rows.map(row => ({ hpt: rowHeight(row, widths) }))
  sheet['!margins'] = MODAE_DOCUMENT_STANDARDS.marginsInches
  sheet['!pageSetup'] = {
    orientation: widths.length >= 7 ? 'landscape' : 'portrait',
    fitToWidth: 1,
    fitToHeight: 0,
  }
  for (const ref of Object.keys(sheet).filter(key => !key.startsWith('!'))) {
    const cell = sheet[ref]
    const row = Number(ref.match(/\d+/)?.[0]) - 1
    // 18 Aug branding guideline: Candara, body 11pt, headings 12pt.
    cell.s = {
      alignment: { vertical: 'top', wrapText: typeof cell.v === 'string' },
      ...(headerRows.includes(row)
        ? { font: { name: 'Candara', sz: MODAE_DOCUMENT_STANDARDS.headingSizePt, bold: true }, fill: { fgColor: { rgb: 'E8EEF6' } } }
        : { font: { name: 'Candara', sz: MODAE_DOCUMENT_STANDARDS.bodySizePt } }),
    }
  }
}

// A generic one-sheet report — the tracker's "Extract to Excel". Column widths
// follow the content so short columns stay tight while long text (opportunity
// names, remarks) wraps inside a capped column instead of sprawling across the
// sheet in one endless row.
const contentWidths = (headers, rows) => headers.map((h, i) => {
  const longest = [headers, ...rows].reduce((max, row) =>
    Math.max(max, ...String(clean(row[i])).split('\n').map(line => line.length)), 0)
  return Math.max(10, Math.min(42, longest + 2))
})

export function buildTableWorkbook(sheetName, headers, rows) {
  const all = [headers, ...rows]
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet(all)
  styleSheet(sheet, all, contentWidths(headers, rows), [0])
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName)
  return workbook
}

export function downloadTableXlsx(filename, sheetName, headers, rows) {
  XLSX.writeFile(buildTableWorkbook(sheetName, headers, rows), filename)
}

export function buildProposalWorkbook(args) {
  const { cover, pricing } = proposalWorkbookRows(args)
  const workbook = XLSX.utils.book_new()
  const coverSheet = XLSX.utils.aoa_to_sheet(cover)
  const pricingSheet = XLSX.utils.aoa_to_sheet(pricing)
  styleSheet(coverSheet, cover, [24, 100])
  styleSheet(pricingSheet, pricing, [8, 52, 28, 12, 12, 16, 18], [2])
  XLSX.utils.book_append_sheet(workbook, coverSheet, 'Cover Letter')
  XLSX.utils.book_append_sheet(workbook, pricingSheet, routeSheetName(args.route, args.p.revision))
  return workbook
}

export async function downloadProposalXlsx(args) {
  const bytes = await generateProposalWorkbook(args)
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${args.opp.id}_Proposal_Rev_${args.p.revision}.xlsx`
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function proposalWorkbookBase64(args) {
  return XLSX.write(buildProposalWorkbook(args), { bookType: 'xlsx', type: 'base64' })
}

// The email action sends only the customer-facing priced BoQ by default. The
// covering letter and optional documents can still be shared explicitly, but
// no standard terms or internal workbook sheets are sent without a choice.
export function buildPricedBoqWorkbook({ p, opp, priced, totalQty, lineQuoted, route }) {
  const headers = route === 'Spares' ? ['Part number', 'Description', 'Total quantity'] : ['Sl.', 'Item Description', 'Model / Part Number', 'Total Qty', 'UOM']
  if (priced) headers.push('Unit Price ₹', 'Total Price ₹')
  const rows = (p.bom || []).map((line, i) => {
    const qty = totalQty(line)
    const row = route === 'Spares' ? [line.pn || '', line.desc || line.itemCategory || '', qty] : [i + 1, line.desc || line.itemCategory || '', line.pn || '', qty, line.uom || '']
    if (priced) row.push(lineQuoted(line), lineQuoted(line) * qty)
    return row
  })
  if (priced) rows.push(['', '', '', '', 'Total', '', rows.reduce((sum, row) => sum + (Number(row.at(-1)) || 0), 0)])
  return buildTableWorkbook(routeSheetName(route, p.revision), headers, rows)
}

export function pricedBoqWorkbookBase64(args) {
  return XLSX.write(buildPricedBoqWorkbook(args), { bookType: 'xlsx', type: 'base64' })
}
