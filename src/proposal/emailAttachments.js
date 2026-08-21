import { proposalWorkbookBase64 } from './excelExport.js'

export const STANDARD_TERMS_URL = new URL('../../branding/Further Inputs/Further Inputs/Proposals and T&Cs/ModAE Standard Terms-Sales.pdf', import.meta.url).href

export async function blobAttachment(blob, filename, mimeType) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return { filename, mimeType, contentBase64: btoa(binary) }
}

export async function standardTermsAttachment() {
  const response = await fetch(STANDARD_TERMS_URL)
  if (!response.ok) throw new Error('Standard Terms PDF could not be loaded')
  return blobAttachment(await response.blob(), 'ModAE Standard Terms-Sales.pdf', 'application/pdf')
}

export const SERVICE_RATE_SCHEDULE_URL = new URL('../../branding/Further Inputs/Further Inputs/Proposals and T&Cs/ModAE Services Rate Schedule FY2025-26.pdf', import.meta.url).href

// Services proposals only — Biji, 20 Aug review: the rate schedule goes with
// every services job, domestic or international; spares and project proposals
// carry the Standard Terms alone.
export async function serviceRateScheduleAttachment() {
  const response = await fetch(SERVICE_RATE_SCHEDULE_URL)
  if (!response.ok) throw new Error('Services Rate Schedule PDF could not be loaded')
  return blobAttachment(await response.blob(), 'ModAE Services Rate Schedule FY2025-26.pdf', 'application/pdf')
}

export function proposalWorkbookAttachment(args) {
  return {
    filename: `${args.opp.id}_Proposal_Rev_${args.p.revision}.xlsx`,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    contentBase64: proposalWorkbookBase64(args),
  }
}
