import { validateBusinessRules } from './businessRules.js'
import { DEFAULT_CUSTOMER_CLASSES, LEGACY_CUSTOMER_CLASSES, upgradeCustomerRules } from './customerClasses.js'

export const WORKBOOK_POLICY_VERSION = 3
export const CUSTOMER_COLOURS = ['Green', 'Yellow', 'Red']
export const QUOTE_ACTIONS = ['Pending validation', 'No Bid', 'Quote fee required', 'OK to Quote', 'Approval required']
const flex = []
export const WORKBOOK_FIELDS = {
  owner: { label: 'Owner', values: ['LJS', 'PP', 'RS', 'SS', 'PJS', 'RJS', 'SR'] },
  oppType: { label: 'Opportunity type', values: ['Project', 'Upgrade', 'Retrofit', 'Service', 'Spares', 'Flow'] },
  bu: { label: 'Business unit', values: ['Aero', 'Energy', 'Service'] },
  segment: { label: 'Segment', values: ['Thermal', 'Nuclear', 'Hydro', 'Industrial', 'O&G-US', 'O&G-MS', 'O&G-DS', 'Petrochem', 'Test Bed', 'Others', ...flex] },
  solution: { label: 'Solution', values: ['Automation', 'SSS', 'VMS/CMS', ...flex] },
  product: { label: 'Product', values: ['ModAE', 'B&K', 'Metrix', 'Beran', 'Bently', 'CTC', 'Meggitt', 'MC Monitoring', 'Monitran', 'Shinkawa', 'Sensonics', 'Senstec', 'Wilcoxon', 'Others', 'ABB', 'BHEL', 'Emerson', 'Honeywell', 'Hima', 'Rockwell', 'Siemens', 'Yokogawa', 'Valmat', 'Various', ...flex] },
  stage: { label: 'Pipeline stage', values: ['Lead', 'RFI', 'Budgetary', 'RFQ', 'Firm Bid', 'Negotiate', 'Won', 'Lost'] },
  prob: { label: 'Probability', fixed: true, values: ['Low', 'Medium', 'High'] },
  category: { label: 'Customer category', values: ['EUC', 'OEM', 'EPC', 'MAC', 'SI', 'ACP', 'RE/TR', ...flex] },
  closedReason: { label: 'Close reason', values: ['Relationship', 'Unique Product', 'Pedigreee', 'Best Price', 'Trade Compliance', 'Technical Compliance', 'Commercial Compliance', 'Capability', 'Lead Time', 'No Bid', 'Abandoned/Delayed', 'Duplicate Oppurtunity', 'Validity Expired', 'Others'] },
  customerStatus: { label: 'Customer status', fixed: true, values: ['Unclassified', 'Green', 'Yellow', 'Red'] },
}
const clone = value => JSON.parse(JSON.stringify(value))
export const fieldRows = (config, key) => (key === 'customerStatus' ? WORKBOOK_FIELDS.customerStatus.values.map(value => ({ value, label: value, active: true })) : (config?.fieldLists?.[key] ?? (WORKBOOK_FIELDS[key]?.values || []).map(value => ({ value, label: value, active: true })))).filter(row => !/^fx[ -]?\d+$/i.test(row.value))
export function fieldValues(config, key, current = []) {
  const saved = Array.isArray(current) ? current : [current]
  return [...new Set([...fieldRows(config, key).filter(row => row.active !== false).map(row => row.value), ...saved.filter(value => value && !/^fx[ -]?\d+$/i.test(value))])]
}
export const fieldLabel = (config, key, value) => fieldRows(config, key).find(row => row.value === value)?.label || value
export const fieldBase = (config, key, value) => fieldRows(config, key).find(row => row.value === value)?.base || value
export const probabilityWeight = (config, value) => Number(config?.probabilityWeights?.[value] ?? ({ Low: 25, Medium: 50, High: 75 }[value] ?? 25)) / 100

// Transcribed from Customers B4:F24. Approximate / malformed thresholds remain
// review items, rather than inventing a numerical interpretation.
const criteriaSource = [
  ['legacyYears', 'Customer Legacy (Years)', 'number', ['~10 Years', '<2 Years', '~10 Years', '>10 Years'], true],
  ['associationYears', 'ModAE Association', 'number', ['~2Years', '<1 Years', '~2Years', '>2 Years'], true],
  ['kyc', 'KYC Completed', 'boolean', ['New Customers', 'No', 'Yes', 'Yes']],
  ['gst', 'GST Registered', 'boolean', ['New Customers', 'No', 'Yes', 'Yes']],
  ['cin', 'CIN Data', 'boolean', ['New Customers', 'No', 'Yes', 'Yes']],
  ['registeredAddress', 'Regd Address Verified', 'boolean', ['New Customers', 'No', 'Yes', 'Yes']],
  ['businessAddress', 'Business Address Verified', 'boolean', ['New Customers', 'No', 'Yes', 'Yes']],
  ['relationship', 'Active Relationship', 'text', ['No', 'No', 'Partial', 'Long Terms']],
  ['annualPotential', 'Annual Order/Sales Potential (INR)', 'number', ['~10 Lacs', '<5 Lacs', '~10 Lacs', '>10 Lacs'], true],
  ['poValue', 'Avg PO Ticket Size (INR)', 'number', ['NA', '<5 Lacs', '~10 Lacs', '>10 Lacs'], true],
  ['pastRfqs', "Past RFQ's Recd", 'boolean', ['No', 'Yes', 'Yes', 'Yes']],
  ['rfqCount', "Qty of RFQ's Recd In 18 Months", 'number', ['0', '2', '5', '10']],
  ['pastOrders', "Past PO's Recd", 'boolean', ['No', 'No', 'No', 'Yes']],
  ['rfqsPerOrder', 'Avg RFQ Per PO', 'number', ['0', '>10', '<5>', ''], true],
  ['acceptsModaeTerms', 'Acceptance To ModAE Standard T&C', 'text', ['NA', 'No', 'Partial', 'Yes']],
  ['acceptsCustomerTerms', 'ModAE Acceptance To Customer T&C', 'text', ['NA', 'No', 'Partial', 'Yes']],
  ['paymentTerms', 'Payment Terms', 'text', ['NA', 'Advance', '30 Days', '30-45 Days']],
  ['creditHistory', 'Payment/Credit History', 'text', ['NA', 'None', '30-45 Days', '30-45 Days']],
  ['culturalFit', 'Good Cultural Fit?', 'text', ['NA', 'No', 'Maybe', 'Yes']],
  ['technicalFit', 'Good Technical Fit', 'text', ['NA', 'No', 'Maybe', 'Yes']],
  ['strategicFit', 'Good Strategic Fit', 'text', ['NA', 'No', 'Maybe', 'Yes']],
]
export const WORKBOOK_CRITERIA = criteriaSource.map(([id, label, type, values, needsDefinition = false]) => ({
  id, label, type, enabled: true, needsDefinition,
  workbook: Object.fromEntries(CUSTOMER_COLOURS.map((colour, i) => [colour, values[{ Green: 3, Yellow: 2, Red: 1 }[colour]]])),
  conditions: Object.fromEntries(CUSTOMER_COLOURS.map((colour, i) => [colour,
    needsDefinition || ['NA', 'New Customers', ''].includes(values[{ Green: 3, Yellow: 2, Red: 1 }[colour]]) ? { op: 'ignore', value: '' } : { op: 'eq', value: values[{ Green: 3, Yellow: 2, Red: 1 }[colour]] }])),
}))

export function ruleForAction(rule, action) {
  const next = clone(rule || {})
  next.defaultAction = action
  next.verification = { ...(next.verification || {}), required: action !== 'OK to Quote' }
  const requires = { 'No Bid': 'jointApproval', 'Pending validation': 'documents', 'Quote fee required': 'fee', 'OK to Quote': 'none', 'Approval required': 'jointApproval' }[action]
  next.verification.requires = requires
  if (requires === 'documents') next.verification.checklist ||= 'kycItems'
  if (requires === 'jointApproval') {
    next.verification.approvalType ||= 'Customer quote clearance'
    next.verification.approvers ||= ['LJS', 'AH']
    next.verification.approvedStatuses ||= ['Approved', 'Approved with conditions']
  }
  if (requires === 'none') { next.gate = null; next.advisory = null }
  else {
    const template = requires === 'fee' ? DEFAULT_CUSTOMER_CLASSES.Yellow : requires === 'documents' ? LEGACY_CUSTOMER_CLASSES.Blue : LEGACY_CUSTOMER_CLASSES.Red
    next.gate = { ...clone(template.gate), ...(next.gate || {}), evidence: requires === 'fee' ? 'amberFeePaid' : requires === 'documents' ? 'customerKycChecklist' : 'approval' }
    if (requires !== 'jointApproval') { next.gate.approvalType = ''; next.advisory = null }
    else { next.gate.approvalType = next.verification.approvalType; next.gate.approvers = next.verification.approvers; next.advisory = null }
    if (action === 'No Bid') { next.gate.text = 'No Bid — continuation requires joint LJS/AH approval'; next.gate.exceptionWaivable = false; next.gate.exceptionRequestable = false; next.advisory = clone(LEGACY_CUSTOMER_CLASSES.Red.advisory) }
  }
  return next
}

export function workbookDefaults() {
  return {
    customerPolicyVersion: 2,
    workbookGovernanceVersion: WORKBOOK_POLICY_VERSION,
    fieldLists: Object.fromEntries(Object.entries(WORKBOOK_FIELDS).map(([key, field]) => [key, field.values.map(value => ({ value, label: value, active: true, ...(['oppType', 'stage'].includes(key) ? { base: value } : {}) }))])),
    classificationCriteria: clone(WORKBOOK_CRITERIA),
    probabilityWeights: { Low: 25, Medium: 50, High: 75 },
    amberFee: { amount: 25000, cur: 'INR', days: 7 },
    customerClasses: clone(DEFAULT_CUSTOMER_CLASSES),
    documentChecklists: { leadKyc: ['GST certificate', 'PAN certificate', 'Cancelled cheque', 'EFT / bank mandate'] },
    kycItems: ['GST certificate', 'PAN certificate', 'Cancelled cheque', 'EFT / bank mandate', 'CIN reference', 'Registered & business address'],
  }
}

export function upgradeWorkbookConfig(config = {}) {
  if (config.workbookGovernanceVersion === WORKBOOK_POLICY_VERSION) return upgradeCustomerRules(config)
  const defaults = workbookDefaults()
  const upgraded = upgradeCustomerRules(config)
  return { ...defaults, ...upgraded, workbookGovernanceVersion: WORKBOOK_POLICY_VERSION,
    fieldLists: { ...defaults.fieldLists, ...config.fieldLists }, amberFee: { ...defaults.amberFee, ...config.amberFee },
    workbookPolicyPrevious: { customerClasses: config.customerClasses || {}, amberFee: config.amberFee || {}, fieldLists: config.fieldLists || {} },
    documentChecklists: { ...defaults.documentChecklists, ...config.documentChecklists }, kycItems: config.kycItems?.length ? config.kycItems : defaults.kycItems,
    customerPolicyVersion: upgraded.customerPolicyVersion, classRules: upgraded.classRules }
}

export function suggestCustomerClass(customer, config) {
  const criteria = (config?.classificationCriteria || WORKBOOK_CRITERIA).filter(row => row.enabled && !row.needsDefinition)
  const facts = customer?.classificationCriteria || {}
  const results = CUSTOMER_COLOURS.map(colour => {
    const checks = criteria.filter(row => row.conditions?.[colour]?.op && row.conditions[colour].op !== 'ignore').map(row => {
      const condition = row.conditions[colour]
      const raw = facts[row.id] ?? facts[row.label]
      if (raw == null || String(raw).trim() === '') return { criterion: row.label, state: 'Missing' }
      const actual = row.type === 'number' ? Number(raw) : String(raw).trim().toLowerCase()
      const target = row.type === 'number' ? Number(condition.value) : String(condition.value).trim().toLowerCase()
      if (row.type === 'number' && (!Number.isFinite(actual) || actual < 0 || !Number.isFinite(target))) return { criterion: row.label, state: 'Invalid' }
      const match = ({ eq: () => actual === target, lt: () => actual < target, lte: () => actual <= target, gt: () => actual > target, gte: () => actual >= target, between: () => actual >= target && actual <= Number(condition.max) })[condition.op]?.() || false
      return { criterion: row.label, state: match ? 'Match' : 'Different' }
    })
    return { colour, checks, matches: checks.length > 0 && checks.every(check => check.state === 'Match') }
  })
  const matches = results.filter(row => row.matches)
  return { status: matches.length === 1 ? 'Suggestion' : 'Needs review', suggestedClass: matches.length === 1 ? matches[0].colour : null, results,
    reviewItems: (config?.classificationCriteria || WORKBOOK_CRITERIA).filter(row => row.needsDefinition).map(row => row.label) }
}

export function validateWorkbookConfig(config) {
  const errors = validateBusinessRules(config)
  for (const [key, def] of Object.entries(WORKBOOK_FIELDS)) {
    const rows = fieldRows(config, key)
    if (!rows.length || !rows.some(row => row.active !== false)) errors.push(`${def.label}: at least one active choice is required`)
    if (new Set(rows.map(row => String(row.value).toLowerCase())).size !== rows.length) errors.push(`${def.label}: duplicate IDs`)
    if (rows.some(row => !row.value?.trim() || !row.label?.trim())) errors.push(`${def.label}: ID and label are required`)
    if (def.fixed && (rows.length !== def.values.length || rows.some(row => !def.values.includes(row.value) || row.active === false))) errors.push(`${def.label}: core identities must remain active`)
    if (key === 'owner' && rows.some(row => !WORKBOOK_FIELDS.owner.values.includes(row.value))) errors.push('Owners must use an existing operational owner ID; manage accounts in Users and roles')
    if (['oppType', 'stage'].includes(key) && rows.some(row => !def.values.includes(row.base || row.value))) errors.push(`${def.label}: map each choice to an existing workflow behavior`)
  }
  if (!Number.isFinite(Number(config.amberFee?.amount)) || Number(config.amberFee.amount) < 0) errors.push('Quotation fee must be zero or more')
  for (const [key, weight] of Object.entries(config.probabilityWeights || {})) if (!['Low', 'Medium', 'High'].includes(key) || !Number.isFinite(Number(weight)) || Number(weight) < 0 || Number(weight) > 100) errors.push('Probability weights must be between 0 and 100')
  const criteria = config.classificationCriteria || []
  if (new Set(criteria.map(row => row.id)).size !== criteria.length) errors.push('Criteria IDs must be unique')
  for (const row of criteria) {
    if (!row.id?.trim() || !row.label?.trim() || !['number', 'boolean', 'text'].includes(row.type)) errors.push('Criteria require an ID, label and valid input type')
    for (const c of Object.values(row.conditions || {})) {
      if (!['eq', 'lt', 'lte', 'gt', 'gte', 'between', 'ignore'].includes(c.op)) errors.push(`${row.label}: invalid comparison`)
      if (c.op !== 'ignore' && !row.needsDefinition && (c.value == null || String(c.value).trim() === '')) errors.push(`${row.label}: comparison value is required`)
      if (row.type === 'number' && c.op !== 'ignore' && !row.needsDefinition && (!Number.isFinite(Number(c.value)) || Number(c.value) < 0 || (c.op === 'between' && (!Number.isFinite(Number(c.max)) || Number(c.max) < Number(c.value))))) errors.push(`${row.label}: invalid numeric range`)
    }
  }
  for (const colour of CUSTOMER_COLOURS) {
    const rule = config.customerClasses?.[colour]
    if (!rule || !QUOTE_ACTIONS.includes(rule.defaultAction)) errors.push(`${colour}: choose a quoting action`)
    if (rule?.verification?.required && rule.verification.requires === 'documents' && !(rule.verification.checklist === 'kycItems' ? config.kycItems : config.documentChecklists?.[rule.verification.checklist])?.length) errors.push(`${colour}: document checklist must contain items`)
    if (rule?.defaultAction === 'Approval required' && !rule.verification.approvers?.length) errors.push(`${colour}: select an approver`)
  }
  return [...new Set(errors)]
}

export function workbookComparison(config) {
  const baseline = workbookDefaults()
  const compare = (label, expected, actual) => ({ label, expected, actual, status: JSON.stringify(expected) === JSON.stringify(actual) ? 'Matching' : 'Different' })
  return [
    ...Object.entries(WORKBOOK_FIELDS).map(([key, def]) => compare(def.label, [...def.values].sort(), fieldValues(config, key).map(value => fieldLabel(config, key, value)).sort())),
    ...CUSTOMER_COLOURS.flatMap(colour => [compare(`${colour} quoting action`, baseline.customerClasses[colour].defaultAction, config?.customerClasses?.[colour]?.defaultAction), compare(`${colour} payment terms`, baseline.customerClasses[colour].paymentTerms, config?.customerClasses?.[colour]?.paymentTerms)]),
    compare('Yellow quotation fee (INR)', 25000, Number(config?.amberFee?.amount)),
    ...(config?.classificationCriteria || WORKBOOK_CRITERIA).map(row => ({ label: row.label, expected: row.workbook, actual: row.conditions, status: row.needsDefinition ? 'Needs definition' : JSON.stringify(row.conditions) === JSON.stringify(WORKBOOK_CRITERIA.find(item => item.id === row.id)?.conditions) ? 'Matching' : 'Different' })),
  ]
}
