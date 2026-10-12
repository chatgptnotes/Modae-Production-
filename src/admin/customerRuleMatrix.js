import { CUSTOMER_COLOURS, WORKBOOK_CRITERIA, workbookDefaults, ruleForAction, validateWorkbookConfig } from '../workbookGovernance.js'

const clone = value => JSON.parse(JSON.stringify(value))
const ACTION_CELLS = { Blue: 'TBD', Red: 'No Bid', Amber: '₹25K pr Quote Fees', Green: 'OK to Quote' }
const ACCOUNT_CELLS = {
  Blue: 'All New Leads\nKYC Reqd\nLead Validation Reqd.',
  Red: 'Unknown Leads\nTraders\nResellers\nFrequent RFQ’s\nNo Orders\nOutside Region\nOutside Focused Markets\nOutside Focused Domains\nOutside Focused Aplications\nDon’t Provide EUC',
  Amber: 'Frequent RFQ’s\nNo Orders\nTraders\nResellers\nFrequent RFQ’s\nNo Orders\nOutside Region\nOutside Focused Markets\nOutside Focused Domains\nOutside Focused Aplications\nSmall EPC/OEM/MAC’s',
  Green: 'Past Business\nLarge OEM’s\nLarge EUC/EPC’s\nKey Accounts\nFocused Markets\nFocused Domains\nFocused Aplications\n>90% Win Probability\nUsers Of Promoted Products',
}

export function matrixDraft(config) {
  const defaults = workbookDefaults()
  const saved = config.customerMatrixVersion === 1
  return { ...defaults, ...clone(config),
    classificationCriteria: clone(saved ? config.classificationCriteria : WORKBOOK_CRITERIA).map(row => ({ ...row, label: saved ? row.label : row.label.replace(' (INR)', ''), cells: row.cells || clone(row.workbook || {}), remarks: row.remarks || '' })),
    customerActionCells: clone(saved ? config.customerActionCells : ACTION_CELLS),
    customerActionLabel: config.customerActionLabel || 'Proposed Opp/Lead Actions',
    customerActionRemarks: config.customerActionRemarks || '',
    customerAccountCells: clone(config.customerAccountCells || ACCOUNT_CELLS),
    customerAccountLabel: config.customerAccountLabel || 'Typical Accounts',
    customerAccountRemarks: config.customerAccountRemarks || '',
  }
}

export function parseMatrixCell(raw, type) {
  const text = String(raw ?? '').trim()
  const ignore = { condition: { op: 'ignore', value: '' } }
  if (!text || /^(NA|N\/A|New Customers)$/i.test(text)) return ignore
  if (type !== 'number') {
    if (type === 'boolean' && !/^(Yes|No)$/i.test(text)) return { ...ignore, needsDefinition: true }
    return { condition: { op: 'eq', value: text } }
  }
  if (text.startsWith('~') || text === '<5>') return { ...ignore, needsDefinition: true }
  const match = text.replace(/,/g, '').match(/^(<=|>=|<|>|=)?\s*(\d+(?:\.\d+)?)\s*(?:-\s*(\d+(?:\.\d+)?))?\s*(Years?|Days?|Lacs?|Lakhs?|K|INR|₹)?$/i)
  if (!match) return { ...ignore, error: 'Use an exact number, comparison or range, for example >10 Years or 5-10 Lacs.' }
  const unit = match[4]?.toLowerCase()
  const scale = /^la/.test(unit || '') ? 100000 : unit === 'k' ? 1000 : 1
  const value = Number(match[2]) * scale
  if (match[3]) {
    const max = Number(match[3]) * scale
    if (match[1] || max < value) return { ...ignore, error: 'Enter a valid increasing range.' }
    return { condition: { op: 'between', value, max } }
  }
  return { condition: { op: ({ '<': 'lt', '<=': 'lte', '>': 'gt', '>=': 'gte', '=': 'eq' })[match[1]] || 'eq', value } }
}

export function compileMatrix(draft) {
  const config = clone(draft)
  const errors = []
  if (!config.customerActionLabel?.trim()) errors.push('The action criterion name is required.')
  config.classificationCriteria = config.classificationCriteria.map(row => {
    let needsDefinition = false
    const conditions = Object.fromEntries(CUSTOMER_COLOURS.map(colour => {
      const result = parseMatrixCell(row.cells[colour], row.type)
      if (result.error) errors.push(`${row.label} / ${colour}: ${result.error}`)
      needsDefinition ||= !!result.needsDefinition
      return [colour, result.condition]
    }))
    return { ...row, enabled: true, conditions, needsDefinition }
  })
  for (const colour of CUSTOMER_COLOURS) {
    const text = String(config.customerActionCells[colour] || '').trim()
    const aliases = { tbd: 'Pending validation', 'pending validation': 'Pending validation', 'no bid': 'No Bid', 'ok to quote': 'OK to Quote', 'approval required': 'Approval required' }
    const fee = text.replace(/,/g, '').match(/^(?:₹|INR\s*)?(\d+(?:\.\d+)?)\s*(K|Lacs?|Lakhs?)?\s*(?:per|pr|\/)\s*Quote\s*Fees?$/i)
    const action = fee ? 'Quote fee required' : aliases[text.toLowerCase()]
    if (!action || (fee && colour !== 'Amber')) { errors.push(`${colour}: enter TBD, No Bid, OK to Quote, Approval required${colour === 'Amber' ? ' or ₹25K per Quote Fees' : ''}.`); continue }
    config.customerClasses[colour] = ruleForAction(config.customerClasses[colour], action)
    if (action === 'No Bid') {
      config.customerClasses[colour].verification.requires = 'noBid'
      config.customerClasses[colour].gate.text = 'No Bid — customer policy does not allow quoting'
    }
    if (fee) config.amberFee.amount = Number(fee[1]) * (fee[2]?.toLowerCase() === 'k' ? 1000 : fee[2] ? 100000 : 1)
    const terms = config.classificationCriteria.find(row => row.id === 'paymentTerms')?.cells[colour]
    if (terms != null) config.customerClasses[colour].paymentTerms = /^NA$/i.test(terms.trim()) ? '' : terms.trim()
  }
  config.classRules = Object.fromEntries(CUSTOMER_COLOURS.map(colour => [colour, config.customerClasses[colour].paymentTerms]))
  config.customerMatrixVersion = 1
  errors.push(...validateWorkbookConfig(config))
  return { config, errors: [...new Set(errors)] }
}
