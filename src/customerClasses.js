// Customer-class rules (Green / Blue / Amber / Red) as data instead of code.
//
// Every value here was transcribed from the behaviour that used to be hardcoded
// across leadVerification.js, gates.js, proposalDoc.js and insights.js, so
// seeding these defaults changes nothing — it only makes the rules editable.
//
// This module must stay importable by `node --test`: no store, no JSX, and no
// import of seed.js (seed.js imports *this*, so the dependency runs one way).
// Milestone names are plain strings for the same reason.

export const DEFAULT_DOC_CHECKLISTS = {
  // The lead-stage list. The opportunity/customer master uses config.kycItems,
  // which is a superset — see the note on checklistFor below.
  leadKyc: ['GST certificate', 'PAN certificate', 'Cancelled cheque', 'EFT / bank mandate'],
}

export const LEGACY_CUSTOMER_CLASSES = {
  Green: {
    defaultAction: 'OK to Quote',
    order: 1,
    verification: { required: false, requires: 'none', deadlineDays: 0 },
    gate: null,
    advisory: null,
    paymentTerms: '30–45 days',
    probabilityBias: 'Medium',
  },
  Blue: {
    defaultAction: 'Pending validation',
    order: 2,
    verification: {
      required: true,
      requires: 'documents',
      checklist: 'leadKyc',
      deadlineDays: 7,
      deadlineType: 'kyc',
      itemBlockerText: '{item} verification is required',
      snapshot: { type: 'KYC', status: 'Verified' },
    },
    gate: {
      key: 'kyc',
      milestone: 'Customer/KYC',
      severity: 'block',
      text: 'Blue customer KYC must be fully verified by AH',
      approvers: ['AH'],
      anyOf: false,
      approvalType: '',
      evidence: 'customerKycChecklist',
      overrideField: 'kycOverride',
      exceptionRequestable: false,
      exceptionWaivable: true,
      readiness: {
        key: 'kyc-block',
        severity: 'block',
        kyc: true,
        text: 'KYC verification pending (AH) — or override with reason',
      },
    },
    advisory: {
      key: 'kyc',
      severity: 'info',
      text: 'New (Blue) customer — KYC verification pending with admin.',
      approvalType: '',
      approvers: [],
    },
    paymentTerms: '',
    probabilityBias: '',
  },
  Amber: {
    defaultAction: 'Quote fee required',
    order: 3,
    verification: {
      required: true,
      requires: 'fee',
      deadlineDays: 7,
      deadlineType: 'amberFee',
      blockerText: 'Yellow processing-fee payment confirmation is required',
      snapshot: { type: 'Payment', status: 'Confirmed' },
    },
    gate: {
      key: 'amber-fee',
      milestone: 'Registration',
      severity: 'block',
      text: 'Yellow customer pre-quote fee must be received',
      approvers: ['AH'],
      anyOf: false,
      approvalType: '',
      evidence: 'amberFeePaid',
      overrideField: '',
      exceptionRequestable: true,
      exceptionWaivable: true,
      readiness: {
        key: 'amber-fee',
        severity: 'block',
        text: 'Yellow pre-quote processing fee not received',
      },
    },
    advisory: {
      key: 'amber',
      severity: 'info',
      text: 'Yellow customer — credit terms are subject to AH approval.',
      approvalType: 'Amber credit terms',
      approvers: ['AH'],
    },
    paymentTerms: '30 days',
    probabilityBias: '',
  },
  Red: {
    defaultAction: 'No Bid',
    order: 4,
    verification: {
      required: true,
      requires: 'jointApproval',
      // Red has no lead-stage countdown today: its clearance is an approval
      // record, not a document the salesperson is chasing.
      deadlineDays: 0,
      approvalType: 'Red customer clearance',
      approvers: ['LJS', 'AH'],
      anyOf: false,
      approvedStatuses: ['Approved', 'Approved with conditions'],
      blockerText: 'Red continuation approval (joint LJS + AH) not granted',
      snapshot: { type: 'Red continuation', status: 'Cleared', failStatus: 'Not cleared' },
    },
    gate: {
      key: 'red-clearance',
      milestone: 'Registration',
      severity: 'block',
      text: 'No Bid — Red customer continuation requires joint LJS/AH approval',
      waitText: 'Red customer clearance is awaiting LJS/AH approval',
      approvers: ['LJS', 'AH'],
      anyOf: false,
      approvalType: 'Red customer clearance',
      evidence: 'approval',
      overrideField: '',
      exceptionRequestable: false,
      // The one non-waivable gate: this is what puts it in NO_EXCEPTION.
      exceptionWaivable: false,
      // Red is raised by oppBlockers, not by readiness.
      readiness: null,
    },
    advisory: {
      key: 'red',
      severity: 'block',
      text: 'Red customer — high risk / unpaid record. Joint LJS + AH clearance required before any proposal goes out.',
      approvalType: 'Red customer clearance',
      approvers: ['LJS', 'AH'],
      waitKey: 'red-wait',
      waitSeverity: 'wait',
      waitText: 'Red customer clearance awaiting joint LJS + AH decision.',
    },
    paymentTerms: 'Advance',
    probabilityBias: 'Low',
  },
}

// Classification labels and historical business controls are separate. A former
// Blue account must never acquire the former Red no-bid rule through renaming.
export const CUSTOMER_CLASS_VERSION = 2
export const CUSTOMER_CLASSIFICATIONS = ['Unclassified', 'Green', 'Yellow', 'Red']
export const normalizeCustomerClass = value => ({ Blue: 'Red', Amber: 'Yellow' }[value]
  || (CUSTOMER_CLASSIFICATIONS.includes(value) ? value : 'Unclassified'))
const optionalRule = { defaultAction: 'Pending validation', order: 4,
  verification: { required: false, requires: 'none', deadlineDays: 0 },
  gate: null, advisory: null, paymentTerms: '', probabilityBias: '' }
export const DEFAULT_CUSTOMER_CLASSES = {
  Unclassified: { ...optionalRule },
  Green: { ...LEGACY_CUSTOMER_CLASSES.Green },
  Yellow: { ...LEGACY_CUSTOMER_CLASSES.Amber, order: 2 },
  Red: { ...optionalRule, order: 3 },
}
function optionalKyc(rule) {
  if (!rule) return null
  const documentGate = rule.gate?.evidence === 'customerKycChecklist' || rule.gate?.key === 'kyc'
  return { ...rule,
    verification: rule.verification?.requires === 'documents'
      ? { ...rule.verification, required: false, deadlineDays: 0 } : rule.verification,
    gate: documentGate ? null : rule.gate,
    advisory: documentGate ? null : rule.advisory }
}
export function classRule(config, cls, record = null) {
  const legacy = record?.legacyCustomerClass || (['Blue', 'Amber'].includes(cls) ? cls : '')
    || (cls === 'Red' && record && record.customerClassificationVersion !== CUSTOMER_CLASS_VERSION ? 'Red' : '')
  if (legacy) return optionalKyc(config?.legacyCustomerClasses?.[legacy]
    || (config?.customerPolicyVersion !== CUSTOMER_CLASS_VERSION ? config?.customerClasses?.[legacy] : null)
    || LEGACY_CUSTOMER_CLASSES[legacy])
  const normalized = normalizeCustomerClass(cls)
  // Pre-migration Red configuration describes the old no-bid category only.
  if (normalized === 'Red' && config?.customerPolicyVersion !== CUSTOMER_CLASS_VERSION)
    return DEFAULT_CUSTOMER_CLASSES.Red
  return optionalKyc(config?.customerClasses?.[normalized] || DEFAULT_CUSTOMER_CLASSES[normalized])
}
export const classOrder = () => ['Green', 'Yellow', 'Red', 'Unclassified']
export function migrateCustomerClassification(record, field = 'customerStatus') {
  if (!record || record.customerClassificationVersion === CUSTOMER_CLASS_VERSION) return record
  const old = record[field]
  return { ...record, [field]: normalizeCustomerClass(old),
    ...(['Blue', 'Amber', 'Red'].includes(old) && !record.legacyCustomerClass ? { legacyCustomerClass: old } : {}),
    customerClassificationVersion: CUSTOMER_CLASS_VERSION }
}

// The legacy fallback chain lives here and nowhere else. Admin used to edit
// amberFee.days while the gates read leadDeadlines.amberFeeDays, so a value the
// user had set was silently ignored; both are honoured on the way through.
export function classDeadlineDays(config, cls) {
  // An explicit per-class value wins — including 0, which means "no deadline".
  const explicit = Number(config?.customerClasses?.[cls]?.verification?.deadlineDays)
  if (Number.isFinite(explicit)) return explicit
  // Then the legacy keys, so a value the user had already set still counts.
  if (cls === 'Blue' && config?.leadDeadlines?.kycDays != null) {
    return Number(config.leadDeadlines.kycDays)
  }
  if (cls === 'Amber' || cls === 'Yellow') {
    if (config?.amberFee?.days != null) return Number(config.amberFee.days)
    if (config?.leadDeadlines?.amberFeeDays != null) return Number(config.leadDeadlines.amberFeeDays)
  }
  return Number(classRule(config, cls)?.verification?.deadlineDays ?? 0)
}

// One place authors document lists. 'kycItems' aliases the existing master key
// so the 6-item checklist is never duplicated.
export function checklistFor(config, cls) {
  const name = classRule(config, cls)?.verification?.checklist || 'leadKyc'
  if (!name) return []
  if (name === 'kycItems') return config?.kycItems || []
  return config?.documentChecklists?.[name] || DEFAULT_DOC_CHECKLISTS[name] || []
}

// Approval gates and the release gate are never waivable by a milestone
// exception; a class gate joins them when it declares exceptionWaivable: false.
export const noExceptionKeys = (config = null) => [
  'tech-approval', 'comm-approval', 'release', 'red-clearance',
  ...Object.values(config?.legacyCustomerClasses || {}).filter(rule => rule?.gate?.exceptionWaivable === false).map(rule => rule.gate.key),
  ...classOrder(config)
    .map(cls => classRule(config, cls)?.gate)
    .filter(gate => gate?.key && gate.exceptionWaivable === false)
    .map(gate => gate.key),
]

// Upgrade only old shipped defaults. Customer-specific terms and custom rules survive.
export function upgradeCustomerRules(config = {}) {
  if (config.customerPolicyVersion === CUSTOMER_CLASS_VERSION) return config
  const previous = config.customerClasses || {}
  const yellow = previous.Yellow || previous.Amber || DEFAULT_CUSTOMER_CLASSES.Yellow
  const mergedYellow = { ...DEFAULT_CUSTOMER_CLASSES.Yellow, ...yellow, verification: { ...DEFAULT_CUSTOMER_CLASSES.Yellow.verification, ...yellow.verification, deadlineDays: (previous.Yellow || previous.Amber)?.verification?.deadlineDays ?? config.amberFee?.days ?? config.leadDeadlines?.amberFeeDays ?? 7 }, paymentTerms: (previous.Yellow || previous.Amber)?.paymentTerms ?? config.classRules?.Amber ?? DEFAULT_CUSTOMER_CLASSES.Yellow.paymentTerms }
  const legacyCustomerClasses = { ...LEGACY_CUSTOMER_CLASSES, ...previous, ...(config.legacyCustomerClasses || {}) }
  return { ...config, legacyCustomerClasses,
    customerClasses: {
      Unclassified: { ...DEFAULT_CUSTOMER_CLASSES.Unclassified },
      Green: optionalKyc({ ...DEFAULT_CUSTOMER_CLASSES.Green, ...previous.Green, paymentTerms: previous.Green?.paymentTerms ?? config.classRules?.Green ?? DEFAULT_CUSTOMER_CLASSES.Green.paymentTerms }),
      Yellow: optionalKyc(mergedYellow),
      Red: { ...DEFAULT_CUSTOMER_CLASSES.Red },
    },
    classRules: { Unclassified: '', Green: config.classRules?.Green ?? DEFAULT_CUSTOMER_CLASSES.Green.paymentTerms,
      Yellow: config.classRules?.Yellow ?? config.classRules?.Amber ?? DEFAULT_CUSTOMER_CLASSES.Yellow.paymentTerms, Red: '' },
    customerPolicyVersion: CUSTOMER_CLASS_VERSION }
}

export const CUSTOMER_CRITERIA = [
  'Customer Legacy (Years)', 'ModAE Association', 'KYC Completed', 'GST Registered', 'CIN Data',
  'Regd Address Verified', 'Business Address Verified', 'Active Relationship', 'Annual Order/Sales Potential',
  'Avg PO Ticket Size', "Past RFQ's Recd", "Qty of RFQ's Recd In 18 Months", "Past PO's Recd", 'Avg RFQ Per PO',
  'Acceptance To ModAE Standard T&C', 'ModAE Acceptance To Customer T&C', 'Payment Terms',
  'Payment/Credit History', 'Good Cultural Fit?', 'Good Technical Fit', 'Good Strategic Fit',
]
