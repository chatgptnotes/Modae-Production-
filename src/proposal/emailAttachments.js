import { generateProposalWorkbook, MIME_XLSX } from './templateExcelExport.js'
import { ENCLOSURES, enclosuresFor } from '../proposalDoc.js'
import { parseProposalWorkbook } from './workbook.js'

export const STANDARD_TERMS_URL = new URL('../../assets/documents/proposal/standard-terms-sales.pdf', import.meta.url).href
export const SERVICE_RATE_SCHEDULE_URL = new URL('../../assets/documents/proposal/services-rate-schedule-fy2025-26.pdf', import.meta.url).href

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
  return (await customerProposalArtifact(args)).attachment
}

const artifactSignature = bytes => {
  let hash = 2166136261
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619)
  return `${bytes.length}-${(hash >>> 0).toString(16)}`
}

// Build the customer workbook once. The submission preview and the downloaded
// Gmail attachment reuse this object, so the salesperson reviews the same XLSX
// bytes that are sent to the customer.
export async function customerProposalArtifact(args) {
  const bytes = await generateProposalWorkbook({ ...args, redactInternalCosting: true })
  const filename = args.filename || `${args.opp.id}_Proposal_Rev_${args.p.revision}.xlsx`
  return {
    bytes,
    signature: artifactSignature(bytes),
    workbookPreview: parseProposalWorkbook(bytes, filename),
    attachment: {
      filename,
      mimeType: MIME_XLSX,
      contentBase64: bytesBase64(bytes),
    },
  }
}

export async function proposalWorkbookPreview(args) {
  return (await customerProposalArtifact(args)).workbookPreview
}
