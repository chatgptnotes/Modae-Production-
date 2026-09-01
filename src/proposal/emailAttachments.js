import { proposalWorkbookBase64, pricedBoqWorkbookBase64 } from './excelExport.js'
import { ENCLOSURES, enclosuresFor } from '../proposalDoc.js'

export const STANDARD_TERMS_URL = new URL('../../branding/Further Inputs/Further Inputs/Proposals and T&Cs/ModAE Standard Terms-Sales.pdf', import.meta.url).href
export const SERVICE_RATE_SCHEDULE_URL = new URL('../../branding/Further Inputs/Further Inputs/Proposals and T&Cs/ModAE Services Rate Schedule FY2025-26.pdf', import.meta.url).href

const ENCLOSURE_URLS = {
  [ENCLOSURES.gtc.filename]: STANDARD_TERMS_URL,
  [ENCLOSURES.serviceRates.filename]: SERVICE_RATE_SCHEDULE_URL,
}

export async function blobAttachment(blob, filename, mimeType) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return { filename, mimeType, contentBase64: btoa(binary) }
}

// The route decides the standard enclosures (proposalDoc.enclosuresFor): the
// GTC with everything, the rate schedule with services only. Both send paths
// call this, so what goes out can never drift from the rule.
export function enclosureAttachments(route) {
  return Promise.all(enclosuresFor(route).map(async enclosure => {
    const response = await fetch(ENCLOSURE_URLS[enclosure.filename])
    if (!response.ok) throw new Error(`${enclosure.label} PDF could not be loaded`)
    return blobAttachment(await response.blob(), enclosure.filename, 'application/pdf')
  }))
}

export function proposalWorkbookAttachment(args) {
  return {
    filename: `${args.opp.id}_Proposal_Rev_${args.p.revision}.xlsx`,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    contentBase64: proposalWorkbookBase64(args),
  }
}

export function pricedBoqAttachment(args) {
  return {
    filename: `${args.opp.id}_Priced_BoQ_Rev_${args.p.revision}.xlsx`,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    contentBase64: pricedBoqWorkbookBase64(args),
  }
}
