import XLSX from 'xlsx-js-style'
import { MODAE_COMPANY } from '../proposalDoc.js'

const routeSheetName = (route, revision) => route === 'Services'
  ? `BoQ & Price-${revision}`
  : route === 'Project'
    ? `Priced BoQ Rev-${revision}`
    : `Firm Offer Rev-${revision}`

const clean = value => value == null ? '' : value

export function proposalWorkbookRows({ p, opp, doc, priced, totalQty, lineQuoted, route }) {
  const cover = [
    ['', 'Your Partners In Achieving Excellence'],
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
    ['', p.addressee || `M/s. ${opp.sellTo}`],
    ['', opp.eucLocation || opp.location || ''],
    [],
    ['Kind Attn:', p.kindAttn || opp.contactPerson || ''],
    ['Subject:', [p.rfqNumber && `RFQ ${p.rfqNumber}`, p.subject || opp.oppName].filter(Boolean).join(' — ')],
    ...(p.project ? [['Project:', p.project]] : []),
    [],
    ['', doc.letterSalutation || 'Dear Sir,'],
    ['', doc.letterBody || ''],
    [],
    ['', doc.letterClose || 'Best Regards,'],
    ['', doc.preparedBy?.name || ''],
    ['', doc.preparedBy?.title || ''],
    ['', doc.preparedBy?.division || ''],
  ]

  const priceHeader = ['Sl.', 'Item Description', 'Model / Part Number', 'Total Qty', 'UOM']
  if (priced) priceHeader.push('Unit Price ₹', 'Total Price ₹')
  const rows = (p.bom || []).map((line, i) => {
    const qty = totalQty(line)
    const row = [i + 1, line.desc || line.itemCategory || '', line.pn || '', qty, line.uom || '']
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
  for (const ref of Object.keys(sheet).filter(key => !key.startsWith('!'))) {
    const cell = sheet[ref]
    const row = Number(ref.match(/\d+/)?.[0]) - 1
    cell.s = {
      alignment: { vertical: 'top', wrapText: typeof cell.v === 'string' },
      ...(headerRows.includes(row) ? { font: { bold: true }, fill: { fgColor: { rgb: 'E8EEF6' } } } : {}),
    }
  }
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

export function downloadProposalXlsx(args) {
  XLSX.writeFile(buildProposalWorkbook(args), `${args.opp.id}_Proposal_Rev_${args.p.revision}.xlsx`)
}

export function proposalWorkbookBase64(args) {
  return XLSX.write(buildProposalWorkbook(args), { bookType: 'xlsx', type: 'base64' })
}
