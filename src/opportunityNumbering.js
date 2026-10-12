export const DEFAULT_OPPORTUNITY_NUMBERING = Object.freeze({ version: 1, prefix: '', dateFormat: 'YYMM', separator: '', sequenceWidth: 3, reset: 'monthly' })

export function validateOpportunityNumbering(value = DEFAULT_OPPORTUNITY_NUMBERING) {
  const c = { ...DEFAULT_OPPORTUNITY_NUMBERING, ...value }
  if (!value || typeof value !== 'object' || Array.isArray(value) || c.version !== 1 || !/^[A-Z0-9]{0,12}$/.test(c.prefix) || typeof c.prefix !== 'string' || !['YYMM', 'YYYYMM', 'YYYY', 'none'].includes(c.dateFormat) || !['', '-'].includes(c.separator) || !Number.isInteger(c.sequenceWidth) || c.sequenceWidth < 3 || c.sequenceWidth > 8 || !['monthly', 'yearly', 'continuous'].includes(c.reset)) throw new Error('Invalid opportunity numbering settings.')
  if (c.reset === 'monthly' && !['YYMM', 'YYYYMM'].includes(c.dateFormat)) throw new Error('Monthly reset requires a date format containing the month.')
  if (c.reset === 'yearly' && c.dateFormat === 'none') throw new Error('Yearly reset requires a date format containing the year.')
  return c
}

export function opportunityNumberParts(value, now = new Date()) {
  const config = validateOpportunityNumbering(value)
  const ist = new Date(new Date(now).getTime() + 330 * 60 * 1000)
  const year = String(ist.getUTCFullYear()), month = String(ist.getUTCMonth() + 1).padStart(2, '0')
  const date = { YYMM: year.slice(-2) + month, YYYYMM: year + month, YYYY: year, none: '' }[config.dateFormat]
  const stem = [config.prefix, date].filter(Boolean).join(config.separator)
  return { config, stem: stem ? stem + config.separator : '', period: config.reset === 'monthly' ? year + month : config.reset === 'yearly' ? year : 'all' }
}

export function formatOpportunityNumber(sequence, value, now = new Date()) {
  const { config, stem } = opportunityNumberParts(value, now)
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error('Invalid opportunity sequence.')
  return stem + String(sequence).padStart(config.sequenceWidth, '0')
}

// A display estimate only. Shared workspaces always reserve the final ID on the server.
export function previewOpportunityNumber(opportunities = [], value, now = new Date()) {
  const { stem } = opportunityNumberParts(value, now)
  const numbers = opportunities.map(o => String(o.id || '')).filter(id => id.startsWith(stem)).map(id => id.slice(stem.length)).filter(tail => /^\d+(?:-?[A-Z]+)?$/.test(tail)).map(tail => Number.parseInt(tail, 10))
  return formatOpportunityNumber(Math.max(0, ...numbers) + 1, value, now)
}
