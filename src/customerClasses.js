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

export const DEFAULT_CUSTOMER_CLASSES = {
  Green: {
    order: 1,
    verification: { required: false, requires: 'none', deadlineDays: 0 },
    gate: null,
    advisory: null,
    paymentTerms: '30 days credit from invoice',
    probabilityBias: 'Medium',
  },
  Blue: {
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
    paymentTerms: '50% advance, balance on delivery',
    probabilityBias: '',
  },
  Amber: {
    order: 3,
    verification: {
      required: true,
      requires: 'fee',
      deadlineDays: 7,
      deadlineType: 'amberFee',
      blockerText: 'Amber processing-fee payment confirmation is required',
      snapshot: { type: 'Payment', status: 'Confirmed' },
    },
    gate: {
      key: 'amber-fee',
      milestone: 'Registration',
      severity: 'block',
      text: 'Amber customer pre-quote fee must be received',
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
        text: 'Amber pre-quote processing fee not received',
      },
    },
    advisory: {
      key: 'amber',
      severity: 'info',
      text: 'Amber customer — credit terms are subject to AH approval.',
      approvalType: 'Amber credit terms',
      approvers: ['AH'],
    },
    paymentTerms: '100% advance before dispatch',
    probabilityBias: '',
  },
  Red: {
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
      text: 'Red customer clearance from LJS/AH is required',
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
    paymentTerms: '100% prepayment only',
    probabilityBias: 'Low',
  },
}

// Falling back to the defaults (never to `{}`) is what keeps this refactor
// behaviour-neutral for every caller that passes a bare state/config object.
export const classRule = (config, cls) =>
  config?.customerClasses?.[cls] || DEFAULT_CUSTOMER_CLASSES[cls] || null

export const classOrder = config =>
  Object.entries({ ...DEFAULT_CUSTOMER_CLASSES, ...(config?.customerClasses || {}) })
    .sort((a, b) => (a[1]?.order || 99) - (b[1]?.order || 99))
    .map(([cls]) => cls)

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
  if (cls === 'Amber') {
    if (config?.amberFee?.days != null) return Number(config.amberFee.days)
    if (config?.leadDeadlines?.amberFeeDays != null) return Number(config.leadDeadlines.amberFeeDays)
  }
  return Number(DEFAULT_CUSTOMER_CLASSES[cls]?.verification?.deadlineDays ?? 0)
}

// One place authors document lists. 'kycItems' aliases the existing master key
// so the 6-item checklist is never duplicated.
export function checklistFor(config, cls) {
  const name = classRule(config, cls)?.verification?.checklist
  if (!name) return []
  if (name === 'kycItems') return config?.kycItems || []
  return config?.documentChecklists?.[name] || DEFAULT_DOC_CHECKLISTS[name] || []
}

// Approval gates and the release gate are never waivable by a milestone
// exception; a class gate joins them when it declares exceptionWaivable: false.
export const noExceptionKeys = (config = null) => [
  'tech-approval', 'comm-approval', 'release',
  ...classOrder(config)
    .map(cls => classRule(config, cls)?.gate)
    .filter(gate => gate?.key && gate.exceptionWaivable === false)
    .map(gate => gate.key),
]
