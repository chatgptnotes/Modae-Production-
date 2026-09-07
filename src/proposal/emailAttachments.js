import { pricedBoqWorkbookBase64 } from './excelExport.js'
import { generateProposalWorkbook, MIME_XLSX } from './templateExcelExport.js'
import { ENCLOSURES, enclosuresFor } from '../proposalDoc.js'

export const STANDARD_TERMS_URL = new URL('../../branding/Further Inputs/Further Inputs/Proposals and T&Cs/ModAE Standard Terms-Sales.pdf', import.meta.url).href
export const SERVICE_RATE_SCHEDULE_URL = new URL('../../branding/Further Inputs/Further Inputs/Proposals and T&Cs/ModAE Services Rate Schedule FY2025-26.pdf', import.meta.url).href

const ENCLOSURE_URLS = {
  [ENCLOSURES.gtc.filename]: STANDARD_TERMS_URL,
  [ENCLOSURES.serviceRates.filename]: SERVICE_RATE_SCHEDULE_URL,
}

const bytesBase64 = bytes => {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

export async function blobAttachment(blob, filename, mimeType) {
  return { filename, mimeType, contentBase64: bytesBase64(new Uint8Array(await blob.arrayBuffer())) }
}

export function enclosureAttachments(route) {
  return Promise.all(enclosuresFor(route).map(async enclosure => {
    const response = await fetch(ENCLOSURE_URLS[enclosure.filename])
    if (!response.ok) throw new Error(`${enclosure.label} PDF could not be loaded`)
    return blobAttachment(await response.blob(), enclosure.filename, 'application/pdf')
  }))
}

// The customer never sees the internal cost/margin columns — redact them
// unconditionally for the emailed attachment, unlike the internal "Download
// Draft" copy which keeps them for pre-send review.
export async function proposalWorkbookAttachment(args) {
  const bytes = await generateProposalWorkbook({ ...args, redactInternalCosting: true })
  return {
    filename: `${args.opp.id}_Proposal_Rev_${args.p.revision}.xlsx`,
    mimeType: MIME_XLSX,
    contentBase64: bytesBase64(bytes),
  }
}

export function pricedBoqAttachment(args) {
  return {
    filename: `${args.opp.id}_Priced_BoQ_Rev_${args.p.revision}.xlsx`,
    mimeType: MIME_XLSX,
    contentBase64: pricedBoqWorkbookBase64(args),
  }
}
