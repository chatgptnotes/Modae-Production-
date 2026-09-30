import { getUserFile } from '../userFiles.js'

export const BUILT_IN_PROPOSAL_TEMPLATES = Object.freeze([
  Object.freeze({
    key: 'Project',
    label: 'Project proposal',
    url: new URL('../../assets/workbooks/proposal-templates/project.xlsx', import.meta.url).href,
    filename: '2608222RS Project Rev-00.xlsx',
    source: 'built-in',
    mapping: Object.freeze({
      method: 'built-in',
      coverSheet: 'Cover Letter',
      commercialSheet: 'Priced BoQ',
      customerLastColumn: 11,
      lineTable: Object.freeze({
        sheet: 'Priced BoQ', headerRow: 9, firstDataRow: 10, lastDataRow: 28,
        totalRow: 29, contentEndRow: 58, termsStartRow: 31,
        columns: Object.freeze({ serial: 1, itemCategory: 2, description: 3, partNumber: 4, quantity: 8, unitPrice: 9, totalPrice: 10 }),
      }),
    }),
  }),
  Object.freeze({
    key: 'Service',
    label: 'Service proposal',
    url: new URL('../../assets/workbooks/proposal-templates/service.xlsx', import.meta.url).href,
    filename: 'Service Proposal 14Apr26 Rev-01.xlsx',
    source: 'built-in',
    mapping: Object.freeze({
      method: 'built-in',
      coverSheet: 'Cover Letter ',
      commercialSheet: 'Proposal',
      customerLastColumn: 7,
      lineTable: Object.freeze({
        sheet: 'Proposal', headerRow: 8, firstDataRow: 9, lastDataRow: 11,
        totalRow: 12, contentEndRow: 18, termsStartRow: 14,
        columns: Object.freeze({ serial: 1, itemCategory: 2, description: 3, quantity: 4, unitPrice: 5, totalPrice: 6 }),
      }),
    }),
  }),
  Object.freeze({
    key: 'Spares',
    label: 'Spares firm offer',
    url: new URL('../../assets/workbooks/proposal-templates/spares.xlsx', import.meta.url).href,
    filename: 'Spares Firm Offer Rev00 2May2026.xlsx',
    source: 'built-in',
  }),
])

export const proposalTemplateLane = route => route === 'Services' || route === 'Service' ? 'Service' : route === 'Spares' ? 'Spares' : 'Project'

export function resolveProposalTemplate(config, route) {
  const lane = proposalTemplateLane(route)
  const uploaded = (config?.uploads?.proposalTemplates || [])
    .find(item => item.lane === lane && item.status === 'Current')
  if (uploaded) {
    return {
      ...uploaded,
      key: lane,
      label: `${lane} proposal`,
      filename: uploaded.name || uploaded.filename || `${lane} Proposal.xlsx`,
      source: 'uploaded',
    }
  }
  return BUILT_IN_PROPOSAL_TEMPLATES.find(item => item.key === lane)
}

export async function loadProposalTemplateBuffer(template) {
  if (!template) throw new Error('No proposal template is configured for this opportunity route')
  if (template.source === 'uploaded') {
    const fileName = String(template.path || '').split('/').filter(Boolean).at(-1)
      || template.name || template.filename
    const stored = await getUserFile({
      recordType: 'admin-template',
      recordId: template.key || template.lane,
      folder: 'templates',
      fileName,
    })
    if (!stored?.blob) throw new Error(`The active ${template.key || template.lane} proposal template could not be loaded`)
    return stored.blob.arrayBuffer()
  }
  // Template URLs are Vite-emitted, hashed assets. Do not allow a stale
  // browser/service-worker response to hide a newly deployed workbook.
  const response = await fetch(template.url, { cache: 'no-store' })
  if (!response.ok) {
    const status = response.status ? ` (HTTP ${response.status})` : ''
    throw new Error(`The built-in ${template.key} proposal template could not be loaded${status}: ${template.url}`)
  }
  return response.arrayBuffer()
}
