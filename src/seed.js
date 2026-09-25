// Reference data and dummy rows cloned from Modae's actual workflow
// (Sales Pipeline Report FY26 Excel + New Sales Opportunity Intake form,
// as shown in the Aug 10 meeting screenshots).
import { STATES, STATE_REGION } from './indiaLocations.js'
import { DEFAULT_CUSTOMER_CLASSES, DEFAULT_DOC_CHECKLISTS } from './customerClasses.js'
import { DEFAULT_CURRENCY_RATES } from './currency.js'
import { DEFAULT_KYC_VALIDATION } from './kycValidation.js'
import { DEFAULT_CLAUSES } from './clauses.js'
import { BNK_IMPORTED_PARTS } from './priceListData/bnk.js'
import { METRIX_IMPORTED_PARTS } from './priceListData/metrix.js'

// Fx-1..Fx-5 are the client's own reserved slots — they appear on Category,
// Segment, Product and Solution in the Field List sheet, so a pipeline export
// can legitimately contain them and our lists have to accept them.
export const FLEX_SLOTS = ['Fx-1', 'Fx-2', 'Fx-3', 'Fx-4', 'Fx-5']

export const CATEGORIES = ['EUC', 'OEM', 'EPC', 'MAC', 'SI', 'ACP', 'RE/TR', ...FLEX_SLOTS]
// Active sales owners from the client field list. Historical rows and new
// enquiries use the same catalogue so ownership remains assignable.
export const OWNERS = ['LJS', 'PP', 'RS', 'SS', 'PJS', 'RJS', 'SR']
// Exactly the client's Field List (Pipeline Explanation workbook, Apr 2026).
// AMC and Training were ours, not theirs — both are Service opportunities and
// were collapsed into it; `store.migrate` remaps any saved rows.
export const OPP_TYPES = ['Project', 'Spares', 'Service', 'Upgrade', 'Retrofit', 'Flow']
export const BUS = ['Aero', 'Energy', 'Services']
export const SEGMENTS = ['Thermal', 'Nuclear', 'Hydro', 'Industrial', 'O&G-US', 'O&G-MS',
  'O&G-DS', 'Petrochem', 'Test Bed', 'Others', ...FLEX_SLOTS]
// On the Field List but not (yet) a Sales Pipeline column, so it is captured on
// the opportunity rather than shown on the sheet.
export const SOLUTIONS = ['Automation', 'SSS', 'VMS/CMS', ...FLEX_SLOTS]
// Product options exactly as on the intake form (Wilcoxon/ABB fell in a scroll
// gap on the recording — kept, to be confirmed).
export const PRODUCTS = [
  'ModAE', 'B&K', 'Metrix', 'Beran', 'Bently', 'CTC', 'Meggitt', 'MC Monitoring',
  'Monitran', 'Shinkawa', 'Sensonics', 'Senstec', 'Wilcoxon', 'Others', 'ABB', 'BHEL',
  'Emerson', 'Honeywell', 'Hima', 'Rockwell', 'Siemens', 'Yokogawa', 'Valmat', 'Various',
  ...FLEX_SLOTS,
]
export const PROB_LEVELS = ['Low', 'Medium', 'High']
export const STAGES = ['Lead', 'RFI', 'Budgetary', 'RFQ', 'Firm Bid', 'Negotiate', 'Won', 'Lost']
export const CLOSE_REASONS = [
  'Relationship', 'Unique Product', 'Pedigree', 'Best Price', 'Trade Compliance',
  'Technical Compliance', 'Commercial Compliance', 'Capability', 'Lead Time',
  'No Bid', 'Abandoned/Delayed', 'Duplicate Opportunity', 'Validity Expired', 'Others',
]
export const WON_REASONS = [
  'Customer acceptance', 'Purchase order received', 'Commercial confirmation',
  'Written customer confirmation', 'Other',
]
// Blue = new customer pending admin verification (per the meeting's
// green/amber/red/blue qualification rules).
export const CUSTOMER_STATUSES = ['Green', 'Amber', 'Red', 'Blue']

// Section 1 of the Official Lead Management Workflow (22 Jul 2026). This is
// where the enquiry *originated*, which is a different question from how it
// reached us: every lead still enters the AI through the common mailbox, and
// the drawing calls that mailbox "the single source of truth for all leads
// entering the AI ecosystem". `channel` records the arrival, `source` the
// origin, and only the latter answers "where does our work come from".
export const LEAD_SOURCES = [
  'Website enquiry',
  'Email',
  'OEM referral',
  'WhatsApp',
  'Phone call',
  'GeM / tender portal',
  'Networking & relationship',
  'Existing Green customer',
]

// The demo launcher needs a small, deterministic opportunity set. These are
// local fixtures only; production boot converts demo state to an empty
// workspace and Supabase remains authoritative for real records.
export const seedOpportunities = [
  {
    sl: 82, id: '2608222RS', sellTo: 'Andritz Hydro', category: 'OEM', location: 'Mandideep',
    customerStatus: 'Green', eucName: 'Adani (Gandikota)', eucLocation: 'Kadappa',
    oppName: 'Gandikota PSP — Vibration & Air Gap Monitoring, 7 Units (5×300MW)+(2×150MW)', owner: 'RS',
    oppType: 'Project', bu: 'Energy', segment: 'Hydro', product: 'B&K', prob: 'Medium',
    valueK: 100, cogsK: 50, createDate: '2026-08-09', proposalDate: '2026-08-09', orderDate: '2026-08-30',
    invoiceDate: '', status: 'Open', stage: 'Firm Bid', closedReason: '', contactPerson: 'Gautam Chaurasiya',
    contactPhone: '+91 09649679', contactEmail: 'gautam.chaurasiya@example.in', lastUpdated: '2026-08-09',
    forecast: true, remarks: 'RFQ recd. on 7 Aug, Bid Due on 11 Aug', route: 'Project', milestone: 'Proposal',
  },
  {
    sl: 71, id: '2601122LJS', sellTo: 'Andritz Hydro', category: 'OEM', location: 'Mandideep',
    customerStatus: 'Green', eucName: 'Limak', eucLocation: 'Turkey',
    oppName: 'VMS for LiMAK Project Turkey — shipped 30 Jul', owner: 'LJS',
    oppType: 'Project', bu: 'Energy', segment: 'Hydro', product: 'B&K', prob: 'Low',
    valueK: 7500, cogsK: 4200, createDate: '2026-01-20', proposalDate: '2026-02-10', orderDate: '2026-04-12',
    invoiceDate: '2026-07-30', status: 'Closed', stage: 'Won', closedReason: 'Relationship',
    contactPerson: 'Gautam Chaurasiya', contactPhone: '+91 09649679', contactEmail: 'gautam.chaurasiya@example.in',
    lastUpdated: '2026-07-30', forecast: false, remarks: 'Milestone order — first Turkey delivery', route: 'Project',
    milestone: 'Submitted',
  },
]
export const ROLES = {
  SUPER: { name: 'System Owner', label: 'Super Admin — Platform Owner', commercial: true, admin: true },
  ADMIN: { name: 'Admin', label: 'Admin — System Administrator', commercial: true, admin: true },
  LJS: { name: 'L. J. Swaminathan', label: 'LJS — Strategic Approver / Application Administrator', commercial: true, admin: true },
  AH: { name: 'Ashwath Hegde', label: 'AH — Commercial & Ops Approver', commercial: true },
  RS: { name: 'R. Sundaram', label: 'RS — Sales Owner', commercial: false, sales: true },
  PP: { name: 'P. Prakash', label: 'PP — Sales Owner', commercial: false, sales: true },
  SS: { name: 'S. Service Owner', label: 'SS — Service Sales Owner', commercial: false, sales: true },
  PJS: { name: 'P. J. Sales', label: 'PJS — Parts Sales Owner', commercial: false, sales: true },
  RJS: { name: 'R. J. Sales', label: 'RJS — Flow Sales Owner', commercial: false, sales: true },
  SR: { name: 'S. R. Sales', label: 'SR — Service Sales Owner', commercial: false, sales: true },
  AN: { name: 'A. Natarajan', label: 'AN — Technical Approver', commercial: false },
  TECH: { name: 'T. Rao', label: 'TECH — Technical Reviewer', commercial: false },
  CUST: { name: 'Customer contact', label: 'Customer — External portal', commercial: false, external: true },
}

// The customer-facing portal is parked for now. The page, its routes and the
// CUST persona all stay in the code — this single flag is what takes them out
// of the app and what puts them back. Flipping it to true restores the persona
// in the switcher, the /portal route, the 'portal' page permission and the
// customer account's sign-in, with nothing else to remember.
export const PORTAL_ENABLED = false

// Personas offered in the "acting as" switcher and on the Users page. CUST
// exists only to demo the portal, so it is hidden alongside it.
export const selectableRoles = () =>
  Object.entries(ROLES).filter(([id]) => PORTAL_ENABLED || id !== 'CUST')

// Page-permission matrix (from the BT prototype's PERMS). ADMIN and LJS are
// co-equal application authorities; sales owners all get the same set; CUST
// sees the external portal only.
const pages = list => (PORTAL_ENABLED ? list : list.filter(p => p !== 'portal'))
const SALES_PAGES = ['mydashboard', 'inbox', 'tracker', 'my', 'new', 'tender', 'approvals', 'folders',
  'proposal', 'proposalSent', 'pricelists', 'analytics', 'customers', 'po', 'aimap', 'launcher', 'voice']
export const PERMS = {
  SUPER: pages(['mydashboard', 'inbox', 'tracker', 'my', 'new', 'tender', 'approvals', 'folders', 'proposal', 'proposalSent', 'pricelists',
    'analytics', 'customers', 'audit', 'users', 'aimap', 'admin', 'po', 'launcher', 'voice', 'portal']),
  ADMIN: ['mydashboard', 'inbox', 'tracker', 'my', 'new', 'tender', 'approvals', 'folders', 'proposal', 'proposalSent', 'pricelists',
    'analytics', 'customers', 'audit', 'users', 'aimap', 'admin', 'po', 'launcher', 'voice'],
  LJS: ['mydashboard', 'inbox', 'tracker', 'my', 'new', 'tender', 'approvals', 'folders', 'proposal', 'proposalSent', 'pricelists',
    'analytics', 'customers', 'audit', 'users', 'aimap', 'admin', 'po', 'launcher', 'voice'],
  AH: ['mydashboard', 'tracker', 'my', 'approvals', 'folders', 'proposal', 'pricelists', 'proposalSent',
    'analytics', 'customers', 'audit', 'aimap', 'po', 'launcher'],
  RS: SALES_PAGES, PP: SALES_PAGES, SS: SALES_PAGES, PJS: SALES_PAGES, RJS: SALES_PAGES, SR: SALES_PAGES,
  AN: ['mydashboard', 'inbox', 'tracker', 'my', 'proposal', 'proposalSent', 'pricelists', 'analytics', 'approvals', 'folders', 'aimap', 'launcher'],
  TECH: ['mydashboard', 'inbox', 'tracker', 'my', 'proposal', 'proposalSent', 'pricelists', 'analytics', 'approvals', 'aimap', 'launcher'],
  CUST: pages(['portal']),
}

// Opportunity lifecycle milestones (BT prototype stepper).
export const MILESTONES = ['Intake', 'Qualification', 'Customer/KYC', 'Registration', 'Screening',
  'Clarification', 'Sourcing', 'Proposal', 'Approval', 'Submitted', 'Follow-up', 'PO Validation', 'Handover']

// Stable IDs let Admin change labels and ordering without breaking existing
// opportunities that store the canonical milestone value.
export const DEFAULT_WORKFLOW = MILESTONES.map((label, order) => ({
  id: label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
  milestone: label,
  label,
  order,
  enabled: !['Submitted', 'PO Validation', 'Handover'].includes(label),
}))

// Map the pipeline stage onto a lifecycle milestone for rows that predate the workbench.
export function milestoneForStage(stage, status) {
  if (status === 'Closed' && stage === 'Lost') return 'Follow-up'
  switch (stage) {
    case 'Lead': return 'Intake'
    case 'RFI': return 'Clarification'
    case 'Budgetary': return 'Proposal'
    case 'RFQ': return 'Sourcing'
    case 'Negotiate': return 'Proposal'
    case 'Firm Bid': return 'Submitted'
    case 'Won': return 'Handover'
    case 'Lost': return 'Follow-up'
    default: return 'Screening'
  }
}

// Route (workbench flavour) from the opp type. Only Spares and Service have
// active workflows today; Retrofit retains its historical Spares route for
// saved-record compatibility while its own workflow is parked separately.
export function routeForType(oppType) {
  if (oppType === 'Spares' || oppType === 'Retrofit') return 'Spares'
  if (oppType === 'Service') return 'Service'
  return 'Project'
}

export const ACTIVE_WORKFLOW_TYPES = ['Spares', 'Service']
export const isWorkflowAvailable = oppType => ACTIVE_WORKFLOW_TYPES.includes(oppType)

// Diagram 02 §1 forks the lifecycle at "Opportunity Type Identified". This is
// a separate axis from routeForType: `context` decides which lane the
// opportunity runs in, `route` only decides which workbench renders.
//
// Three lanes, not two. Service is its own world (§4): it carries neither the
// Greenfield Phase-1 pricing embargo nor the Brownfield B-01..B-05 chain — it
// runs the site-survey sub-flow instead, so it must not resolve to Brownfield.
export const CONTEXTS = ['Greenfield', 'Brownfield', 'Service']

export function contextForType(oppType) {
  if (oppType === 'Service') return 'Service'
  return oppType === 'Project' || oppType === 'Upgrade' || oppType === 'Flow'
    ? 'Greenfield' : 'Brownfield'
}

// Diagram 02 §3 — the Brownfield activity chain. Each step is signed off by
// the assigned salesperson only ("All above activities are approved only by
// Assigned Salesperson"); the sub-points are the diagram's own bullets.
export const B_STEPS = [
  { id: 'B-01', label: 'Requirement Validation',
    points: ['Scope understanding', 'Document review', 'Clarifications'] },
  { id: 'B-02', label: 'Technical Evaluation',
    points: ['Part number review', 'Compatibility check', 'Replacement identified', 'Technical feasibility'] },
  { id: 'B-03', label: 'Commercial Applicability',
    points: ['Standard T&Cs', 'Offer validity', 'Delivery & shipping terms', 'FOR / Ex Works / taxes', 'Customer specific terms'] },
  { id: 'B-04', label: 'Pricing Validation',
    points: ['Price sheet lookup', 'Historical pricing', 'Margin calculation', 'Discount check'] },
  { id: 'B-05', label: 'Proposal Generation',
    points: ['Cover letter', 'BoQ / price summary', 'Commercial terms', 'Compliance / SoW (if any)'] },
]

// Legacy per-step responsibility data retained for migration and old records.
// Current sign-off authority is the opportunity owner plus LJS.
export function defaultBStepOwners(opp = {}) {
  return {
    'B-01': opp.owner || 'RS',
    'B-02': 'TECH',
    'B-03': 'AH',
    'B-04': 'LJS',
    'B-05': opp.owner || 'RS',
  }
}

// Brownfield sign-off authority belongs to the opportunity's assigned
// salesperson, with LJS as the explicit strategic exception. Legacy
// bStepOwners records remain readable, but do not grant signing authority.
export function canSignBStep(role, opp = {}) {
  return !!role && (role === opp.owner || role === 'LJS')
}

// Diagram 02 §7 — "Identify Type of Revision" routes the rework back to the
// B-step that owns it, and the proposal is regenerated from there.
export const REVISION_TYPES = [
  { id: 'Technical', label: 'Technical change (part / spec / scope)' },
  { id: 'Commercial', label: 'Commercial change (terms / validity / delivery)' },
  { id: 'Pricing', label: 'Pricing change (discount / price / margin)' },
  { id: 'Other', label: 'Other changes (documents / SoW / compliance)' },
]

// Ownership is driven by the opportunity type, while routeForType controls
// which document workbench is shown. These are intentionally separate rules.
// The mapping is editable from Admin (config.ownerRules); this is only the
// seed default and the safety-net fallback if config is missing a row.
const DEFAULT_OWNER_FOR_OPP_TYPE = {
  Project: 'LJS', Upgrade: 'PP', Retrofit: 'RS', Service: 'SS',
  Spares: 'PJS', Flow: 'RJS',
}
export function ownerForOppType(oppType, config) {
  const found = (config?.ownerRules || []).find(r => r.oppType === oppType)
  return found?.owner || DEFAULT_OWNER_FOR_OPP_TYPE[oppType] || 'LJS'
}

// Proposal template flavour, derived from the same route the workbench uses.
// Deriving it here rather than re-testing oppType keeps Service, Spares and
// Retrofit off the heavy project template — they used to fall through to it.
export function proposalTypeForOpp(opp) {
  const route = routeForType(opp?.oppType)
  return route === 'Spares' ? 'Spares' : route === 'Service' ? 'Services' : 'Project'
}

// Demo accounts — password is plaintext in localStorage on purpose (demo only,
// clearly disclaimed on the login screen).
export const DEMO_PASSWORD = 'Demo@1234'
export const seedUsers = [
  { id: 'U-001', name: 'System Owner', email: 'admin@modae.demo', role: 'SUPER', status: 'Active', created: '2026-04-01', pw: DEMO_PASSWORD },
  { id: 'U-002', name: 'L. J. Swaminathan', email: 'ljs@modae.demo', role: 'LJS', status: 'Active', created: '2026-04-01', pw: DEMO_PASSWORD },
  { id: 'U-003', name: 'Ashwath Hegde', email: 'ah@modae.demo', role: 'AH', status: 'Active', created: '2026-04-01', pw: DEMO_PASSWORD },
  { id: 'U-004', name: 'R. Sundaram', email: 'rs@modae.demo', role: 'RS', status: 'Active', created: '2026-04-15', pw: DEMO_PASSWORD },
  { id: 'U-005', name: 'P. Prakash', email: 'pp@modae.demo', role: 'PP', status: 'Active', created: '2026-04-15', pw: DEMO_PASSWORD },
  { id: 'U-009', name: 'S. Service Owner', email: 'ss@modae.demo', role: 'SS', status: 'Active', created: '2026-08-17', pw: DEMO_PASSWORD },
  { id: 'U-010', name: 'P. J. Sales', email: 'pjs@modae.demo', role: 'PJS', status: 'Active', created: '2026-08-17', pw: DEMO_PASSWORD },
  { id: 'U-011', name: 'R. J. Sales', email: 'rjs@modae.demo', role: 'RJS', status: 'Active', created: '2026-08-17', pw: DEMO_PASSWORD },
  { id: 'U-012', name: 'S. R. Sales', email: 'sr@modae.demo', role: 'SR', status: 'Active', created: '2026-08-17', pw: DEMO_PASSWORD },
  { id: 'U-007', name: 'T. Rao', email: 'tech@modae.demo', role: 'TECH', status: 'Active', created: '2026-08-01', pw: DEMO_PASSWORD },
  { id: 'U-008', name: 'Customer contact', email: 'customer@portal.demo', role: 'CUST', status: 'Active', created: '2026-08-01', pw: DEMO_PASSWORD },
]

export const SUBFOLDERS = ['Customer Specs', 'Partner Docs', 'Proposal', 'KYC']

export const seedFiles = {
  '2608222RS': {
    'Customer Specs': [
      { name: 'RFQ_6001099682_Gandikota.pdf', date: '2026-08-07', size: '3.1 MB' },
      { name: 'Signal_List_7_Units.xlsx', date: '2026-08-07', size: '210 KB' },
    ],
    'Partner Docs': [],
    Proposal: [
      { name: '2608222RS Andritz Adani Gandikota PSP Project Re.xlsx', date: '2026-08-09', size: '840 KB' },
    ],
  },
  '2601122LJS': {
    'Customer Specs': [{ name: 'Andritz_LiMAK_TechSpec.pdf', date: '2026-01-22', size: '4.2 MB' }],
    'Partner Docs': [{ name: 'BNK_discount_approval_50pct.pdf', date: '2026-02-02', size: '180 KB' }],
    Proposal: [{ name: 'Proposal_2601122_Rev02.pdf', date: '2026-03-21', size: '2.9 MB' }],
  },
}

// Bump whenever parts/rates/ad-hoc rows are added to the seed catalogue below.
// migrate() compares this against the saved state's `catalogRev` and folds in
// the new rows once, so an existing browser session picks up catalogue
// additions without a full "Reset demo data" wipe.
export const seedCatalogRev = 3

// B&K (BNK) price list — base parts plus configurable adders (EUR).
// Catalogue rows converted from the supplier workbooks by
// scripts/convert-price-lists.mjs. They are appended to the hand-written rows
// below, never replacing them: the curated part numbers are referenced by the
// interchangeability matrix and the simulated leads.
const withImported = (curated, imported) => {
  const seen = new Set(curated.map(part => String(part.pn).trim().toUpperCase()))
  return [...curated, ...imported.filter(part => {
    const key = String(part.pn).trim().toUpperCase()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })]
}

export const seedPriceLists = {
  BNK: {
    currency: 'EUR', version: 'Imported-2026-09', uploaded: '2026-09-24',
    parts: withImported([
      { pn: 'RK16-BASE', desc: '16-slot base rack chassis', price: 2000, adders: [
        { code: 'CE', desc: 'CE mark', price: 110 },
        { code: 'FMK', desc: 'Flush mount kit', price: 65 },
      ]},
      { pn: 'IN081-3-110-50', desc: 'Vibration sensor IN-081, 110mm', price: 954, adders: [
        { code: 'L-EXT', desc: 'Extended length >110mm', price: 98 },
      ]},
      { pn: 'AGSC-51-4-CAB', desc: 'Air gap sensor w/ cable', price: 1300, adders: [] },
      { pn: 'EC-10', desc: 'Extension cable 10m', price: 148, adders: [] },
      { pn: 'VC-8000/RCK', desc: 'VC-8000 rack', price: 2175, adders: [] },
      { pn: 'VC-8000/RCM', desc: 'VC-8000 rack condition monitor', price: 950, adders: [] },
      { pn: 'VC-8000/eSAM', desc: 'VC-8000 eSAM module', price: 4100, adders: [] },
      { pn: 'VC-8000/UMM', desc: 'VC-8000 universal monitoring module', price: 4800, adders: [] },
      { pn: 'SETPOINT-XC-CMS', desc: 'SETPOINT XC CMS software', price: 49000, adders: [] },
      { pn: 'CMS-TAG-4000', desc: 'CMS software license — 4000 tags', price: 26800, adders: [] },
      { pn: 'CMS-TAG-5000', desc: 'CMS software license — 5000 tags', price: 31900, adders: [] },
      { pn: 'CMS-PI-IF', desc: 'AVEVA PI interface', price: 3300, adders: [] },
      { pn: 'CMS-VIS', desc: 'Visualization license (per seat)', price: 1100, adders: [] },
      { pn: 'RK16-DR', desc: '16-slot rack door w/ viewing window', price: 620, adders: [] },
      { pn: 'AGSC-51-8-CAB', desc: 'Air gap sensor w/ cable, 8m', price: 1520, adders: [] },
      { pn: 'MMS-6210', desc: 'Dual-channel axial displacement monitor', price: 2340, adders: [] },
      { pn: 'MMS-6350', desc: 'Shaft speed / key phasor monitor module', price: 1980, adders: [] },
      { pn: 'EC-25', desc: 'Extension cable 25m', price: 315, adders: [] },
      { pn: 'JB-8CH-IP66', desc: 'Field junction box, 8-channel, IP66', price: 880, adders: [
        { code: 'SS316', desc: 'Stainless 316 enclosure', price: 410 },
      ]},
      { pn: 'CMS-TAG-10000', desc: 'CMS software license — 10000 tags', price: 48500, adders: [] },
      { pn: 'CMS-OPC-UA', desc: 'OPC UA server interface', price: 2900, adders: [] },
      { pn: 'CMS-MOD-IF', desc: 'Modbus TCP interface', price: 1750, adders: [] },
      { pn: 'CMS-RPT', desc: 'Automated reporting module', price: 4200, adders: [] },
      { pn: 'SVC-COMM-DAY', desc: 'Commissioning engineer (per day, ex-works)', price: 780, adders: [] },
      { pn: 'SVC-AMC-YR', desc: 'Annual maintenance contract — per rack, per year', price: 3600, adders: [] },

      // ---- DS821 displacement-sensor family -------------------------------
      // The five line items of the Ref 14716 GeM enquiry and the firm offer
      // that answered it (2511096RS). Part numbers and descriptions are taken
      // verbatim from those two documents:
      //   doc/Further Inputs/.../Spares Opp-1 (Won almost)/
      //     02_7425309-Buyers Speces.pdf          — the enquiry, "Ref:14716"
      //     Spares Firm Offer Rev00 2May2026.xlsx — the proposal
      // Keywords carry the buyer's own wording so matchParts resolves a GeM
      // item description that never quotes the ModAE catalogue name.
      //
      // ⚠ PLACEHOLDER PRICES. The sample workbook prices through external
      // links, so its cached figures are zero and the real B&K net list was not
      // in the handover. These are plausible figures that make the benchmark
      // price coherently; replace every `price` below from the B&K Vibro
      // distributor price file before any of this reaches a customer.
      { pn: 'DS821.DS1001/10/075/012/005/000/0', price: 520, adders: [],
        desc: 'Non-contact Displacement Sensor with full length thread, Measuring Range 2mm, With 0.5m Integral Cable',
        keywords: ['non-contact sensor', 'non contact sensor', 'displacement sensor',
          'full length thread', 'non-contact vibration sensor'] },
      // The buyer writes this one as "Reverse mount sensor FOR sensor holder
      // with adjustment spindle" — which contains the holder's keywords too.
      // Scored on the short set it lost to AC-3101/1 and would have priced a
      // €245 holder where a €560 sensor belongs, so the phrases below are the
      // buyer's own, long enough to outscore the accessory it names.
      { pn: 'DS821.DS1003/62/039/013/005/000/0', price: 560, adders: [],
        desc: 'Non-contact Displacement Sensor, Reverse Mount Sensor for Sensor Holder with Adjustment Spindle, With 0.5m integral cable',
        keywords: ['reverse mount sensor for sensor holder', 'reverse mount sensor', 'reverse mount',
          'non contact reverse mount', 'displacement sensor'] },
      { pn: 'DS821.EC100/45/0', price: 135, adders: [
        // The sample quotes five extra cables beyond the sensor count.
        { code: 'ADDL', desc: 'Additional extension cable, 4.5m', price: 135 },
      ],
        desc: 'Sensor Extension Cable Extension Cable without protection, 4.5m length',
        keywords: ['sensor extension cable', 'extension cable'] },
      { pn: 'DS821.OD110/0', price: 610, adders: [],
        desc: 'Sensor Driver Electronics for 2mm Measuring Range (oscillator/de-modulator), supports all nominal system lengths (5 m and 10 m)',
        keywords: ['sensor driver', 'driver electronics', 'oscillator', 'de-modulator', 'demodulator'] },
      // A bare 'holder' matched anything that merely mentioned one, including
      // the sensor above; these are specific to the accessory itself.
      { pn: 'AC-3101/1', price: 245, adders: [],
        desc: 'Sensor Holder, With Adjustment Spindle Uncut, Without Sensor Thread, FKM O-ring',
        keywords: ['sensor holder', 'adjustment spindle', 'spindle uncut', 'without sensor thread'] },
    ], BNK_IMPORTED_PARTS),
  },
  // Metrix Instrument Co. machinery-protection range (USD list, ex-Houston).
  // ⚠ PLACEHOLDER PRICES — demo data only; confirm against the current
  // Metrix distributor price file before quoting.
  Metrix: {
    currency: 'USD', version: 'Imported-2026-09', uploaded: '2026-09-24',
    parts: withImported([
      { pn: 'MX-2110', price: 640, adders: [
        { code: 'API', desc: 'API 670 certification pack', price: 95 },
      ],
        desc: 'Proximity transducer system, 5mm tip, 5m integral cable',
        keywords: ['proximity transducer', 'proximity probe', '5mm'] },
      { pn: 'MX-2111', price: 705, adders: [], desc: 'Proximity transducer system, 8mm tip, 5m integral cable',
        keywords: ['proximity transducer', '8mm'] },
      { pn: 'MX-2033', price: 385, adders: [], desc: 'Proximity probe driver, −24 VDC, 200 mV/mil',
        keywords: ['driver', 'oscillator', 'demodulator'] },
      { pn: 'MX-8030', price: 410, adders: [], desc: 'Velocity sensor, 100 mV/in/s, top exit',
        keywords: ['velocity sensor', 'seismic'] },
      { pn: 'MX-8032', price: 465, adders: [], desc: 'Velocity sensor, side exit, high-temperature 121 °C',
        keywords: ['velocity sensor', 'high temperature'] },
      { pn: 'MX-ST5484E', price: 520, adders: [], desc: 'Velocity transmitter, 4-20 mA loop powered, ATEX/IECEx',
        keywords: ['transmitter', '4-20ma', 'atex'] },
      { pn: 'MX-SW5580', price: 690, adders: [], desc: 'Electronic vibration switch, DPDT relay, IP66',
        keywords: ['vibration switch', 'relay'] },
      { pn: 'MX-440DR', price: 1150, adders: [], desc: '440DR dual-channel vibration monitor, DIN-rail',
        keywords: ['monitor', 'din rail'] },
      { pn: 'MX-5580C', price: 1480, adders: [], desc: 'Digital vibration transmitter w/ display, panel mount',
        keywords: ['transmitter', 'display'] },
      { pn: 'MX-EXT-5M', price: 145, adders: [], desc: 'Extension cable, 5m, armoured w/ MS connector',
        keywords: ['extension cable', '5m'] },
      { pn: 'MX-EXT-9M', price: 210, adders: [], desc: 'Extension cable, 9m, armoured w/ MS connector',
        keywords: ['extension cable', '9m'] },
      { pn: 'MX-MTG-STD', price: 65, adders: [], desc: 'Stud mounting kit, 1/4-28 stainless',
        keywords: ['mounting', 'stud'] },
      { pn: 'MX-JB-4CH', price: 340, adders: [], desc: 'Field junction box, 4-channel, IP65 GRP',
        keywords: ['junction box'] },
      { pn: 'MX-CAL-CERT', price: 120, adders: [], desc: 'NIST-traceable calibration certificate (per channel)',
        keywords: ['calibration', 'certificate', 'nist'] },
    ], METRIX_IMPORTED_PARTS),
  },
  // Meggitt remains available for opportunities whose installed system is
  // explicitly Meggitt. It is not an active replacement source for B&K lines;
  // the supplied B&K and Metrix workbooks are the active imported catalogues.
  Meggitt: {
    currency: 'EUR', version: '2026-02', uploaded: '2026-02-14',
    parts: [
      { pn: '786A', price: 210, adders: [], desc: 'Wilcoxon 786A general-purpose accelerometer, 100 mV/g ±5%, top-exit MIL-C-5015 connector, 100 Ω, −50…+150 °C', keywords: ['accelerometer', '100 mv/g', 'mil-c-5015'] },
      { pn: 'J9T2A-A2A-050', price: 78, adders: [], desc: 'Armoured cable assembly, 5 m, moisture-resistant MIL-C-5015 socket to blunt cut', keywords: ['armoured', 'cable', '5015', 'moisture'] },
      { pn: 'XPR04-5.0-U-S-1-0-0-0-70', price: 430, adders: [], desc: 'Vibro-Meter XPR04 key phasor / proximity probe, 8 mm tip, 5 m integral cable, standard version', keywords: ['key phasor', 'keyphasor', 'proximity probe', 'xpr04'] },
      { pn: 'XED04-U-0-0', price: 360, adders: [], desc: 'Vibro-Meter XED04 driver / signal conditioner, 7.87 mV/µm, 5 m system, standard version', keywords: ['driver', 'signal conditioner', 'xed04'] },
      { pn: '786A-M12', price: 235, adders: [], desc: 'Wilcoxon 786A accelerometer, 100 mV/g, M12 side-exit connector variant', keywords: ['accelerometer', 'm12', '100 mv/g'] },
      { pn: '793L-3', price: 340, adders: [], desc: 'Wilcoxon 793L low-frequency accelerometer, 500 mV/g, hydro / slow-speed machines', keywords: ['accelerometer', 'low frequency', '500 mV/g', 'hydro'] },
      { pn: 'PC420VP-10', price: 395, adders: [], desc: 'Wilcoxon PC420 loop-powered vibration transmitter, 4-20 mA, 0-1 in/s RMS', keywords: ['transmitter', '4-20ma', 'loop powered'] },
      { pn: 'J9T2A-A2A-100', price: 124, adders: [], desc: 'Armoured cable assembly, 10 m, moisture-resistant MIL-C-5015 socket to blunt cut', keywords: ['armoured', 'cable', '10m', '5015'] },
      { pn: 'J9T2A-A2A-200', price: 196, adders: [], desc: 'Armoured cable assembly, 20 m, moisture-resistant MIL-C-5015 socket to blunt cut', keywords: ['armoured', 'cable', '20m'] },
      { pn: 'CA134', price: 88, adders: [], desc: 'Vibro-Meter CA134 extension cable, 5 m, for XPR/XED probe systems', keywords: ['extension cable', 'ca134'] },
      { pn: 'XPR04-1.0-U-S-1-0-0-0-70', price: 385, adders: [], desc: 'Vibro-Meter XPR04 proximity probe, 8 mm tip, 1 m integral cable, standard version', keywords: ['proximity probe', 'xpr04', '1m'] },
      { pn: 'TQ402-A', price: 620, adders: [], aliases: ['TQ402'], desc: 'Vibro-Meter TQ402 signal conditioner for piezo accelerometers, DIN-rail', keywords: ['signal conditioner', 'tq402', 'charge amplifier'] },
      { pn: 'CE680-A-0-0', price: 1450, adders: [], desc: 'Vibro-Meter CE680 charge amplifier, high-temperature turbine service', keywords: ['charge amplifier', 'ce680', 'high temperature'] },
      { pn: 'VM600-MPC4', price: 4750, adders: [{ code: 'IOC', desc: 'IOC4T I/O card', price: 980 }], aliases: ['MPC4', 'MPC 4'], desc: 'VM600 MPC4 machinery protection card, 4-channel, API 670', keywords: ['vm600', 'mpc4', 'protection card'] },
      { pn: 'VM600-CPUM', price: 3900, adders: [], desc: 'VM600 CPUM communication / CPU card for ABE04x rack', keywords: ['vm600', 'cpum', 'cpu card'] },
      { pn: 'VM600-ABE042', price: 2650, adders: [], desc: 'VM600 ABE042 19" rack, 6U, w/ backplane and power supply', keywords: ['vm600', 'rack', 'abe042'] },
      { pn: 'VSIGHT-VIBRO-STD', price: 12800, adders: [], desc: 'VibroSight condition monitoring software — standard analysis package, single server', keywords: ['vibrosight', 'software', 'condition monitoring'] },
      { pn: 'VSIGHT-CLIENT', price: 1850, adders: [], desc: 'VibroSight client seat license', keywords: ['vibrosight', 'client', 'seat license'] },
      { pn: 'MSS-MTG-KIT', price: 72, adders: [], desc: 'Sensor mounting kit — stud, adhesive pad and swivel base', keywords: ['mounting kit', 'stud'] },
    ],
  },
}

export const seedAdhocParts = [
  { pn: '330103-00-05-10-02-00', supplier: 'Royal Traders', price: 100, currency: 'USD', date: '2026-08-10', note: 'Bentley probe — trader quote' },
  { pn: 'PANEL-IP54-2000', supplier: 'JVB Engineering', price: 85000, currency: 'INR', date: '2026-06-20', note: 'Panel fabrication' },
  // Older captures for the same Bently probe — shows the "last referred price
  // grows over time" behaviour; the most recent date is the reference price.
  { pn: '330103-00-05-10-02-00', supplier: 'Royal Traders', price: 92, currency: 'USD', date: '2026-02-18', note: 'Bently probe — previous quote (superseded)' },
  { pn: '330130-080-01-00', supplier: 'Royal Traders', price: 145, currency: 'USD', date: '2026-07-28', note: 'Bently 3300 XL extension cable 8m' },
  { pn: '330180-51-00', supplier: 'Sunrise Instruments', price: 21500, currency: 'INR', date: '2026-07-14', note: 'Bently 3300 XL proximitor — grey market, verify origin' },
  { pn: 'ABB-AI810', supplier: 'Navitus Controls', price: 63000, currency: 'INR', date: '2026-06-30', note: 'ABB AI810 analog input module for DCS interface' },
  { pn: 'SIE-6DD1607', supplier: 'Elektro Traders', price: 410, currency: 'EUR', date: '2026-06-11', note: 'Siemens SIMADYN interface card — refurbished' },
  { pn: 'CBL-ARM-4C-1.5', supplier: 'Polycab (via Shah Cables)', price: 182, currency: 'INR', date: '2026-05-22', note: 'Armoured instrument cable 4C x 1.5 sqmm — per metre' },
  { pn: 'MCC-19IN-42U', supplier: 'JVB Engineering', price: 128000, currency: 'INR', date: '2026-05-09', note: '19" 42U floor-standing cabinet w/ cooling fans' },
  { pn: 'UPS-3KVA-ONLINE', supplier: 'Powertech Systems', price: 74500, currency: 'INR', date: '2026-04-27', note: '3 kVA online UPS, 30 min backup — panel accessory' },
  { pn: 'HMI-15IN-IND', supplier: 'Navitus Controls', price: 96000, currency: 'INR', date: '2026-04-15', note: '15" industrial HMI panel PC for CMS workstation' },
  { pn: 'CAL-RIG-ACC', supplier: 'Metrolab Calibration', price: 18500, currency: 'INR', date: '2026-03-30', note: 'Accelerometer calibration — per batch of 10, NABL' },
  { pn: 'FRT-AIR-EU-IN', supplier: 'DHL Global Forwarding', price: 2350, currency: 'EUR', date: '2026-03-19', note: 'Air freight EU → Mumbai, ~180 kg incl. customs handling' },
]

// The named roles quoted off a service rate sheet. Where a role is one the
// service calculator also prices, it points at that rate with `rateKey` instead
// of carrying its own copy — these used to be two separate tables that agreed
// only by coincidence.
const INDIA_ROLES = [
  { role: 'Service Engineer', rateKey: 'engineerDay' },
  { role: 'Senior Engineer / Commissioning', rateKey: 'seniorDay' },
  { role: 'Training (per day, classroom)', ratePerDayK: 55 },
  { role: 'Training (per day, on-site)', ratePerDayK: 72 },
  { role: 'Site Supervisor / Installation', ratePerDayK: 38 },
  { role: 'Vibration Analyst (CAT-III)', ratePerDayK: 85 },
  { role: 'Application Engineer (remote/offline)', ratePerDayK: 32 },
  { role: 'Project Manager (part allocation)', ratePerDayK: 58 },
  { role: 'Emergency callout (within 48 hrs)', ratePerDayK: 95 },
]

// Only the two roles the international sheet actually publishes a rate for.
const INTERNATIONAL_ROLES = [
  { role: 'Service Engineer', rateKey: 'engineerDay' },
  { role: 'Senior Engineer / Commissioning', rateKey: 'seniorDay' },
]

const CUSTOMER_ROWS = [
  { name: 'Andritz Hydro', category: 'EUC/OEM', status: 'Green', kyc: 'Valid', payment: 'On time' },
  { name: 'Prime Engineering/PECO', category: 'ACP', status: 'Green', kyc: 'Valid', payment: 'On time' },
  { name: 'BHEL Bhopal', category: 'OEM', status: 'Amber', kyc: 'Renewal due', payment: 'Avg 60 days' },
  { name: 'BHEL Noida', category: 'OEM', status: 'Amber', kyc: 'Valid', payment: 'Avg 90 days' },
  { name: 'CAPSA Dubai / Realix', category: 'RE/TR', status: 'Red', kyc: 'Pending', payment: '>180 days overdue' },
  { name: 'KSB Limited', category: 'OEM', status: 'Green', kyc: 'Valid', payment: 'On time' },
  { name: 'APGENCO', category: 'EUC', status: 'Amber', kyc: 'Valid', payment: 'Avg 75 days' },
  { name: 'GE Vernova', category: 'OEM', status: 'Green', kyc: 'Valid', payment: 'On time' },
  { name: "Jost's Engineering", category: 'SI', status: 'Green', kyc: 'Valid', payment: 'On time' },
  { name: 'Navitus Controls', category: 'SI', status: 'Amber', kyc: 'Valid', payment: 'Avg 60 days' },
  { name: 'BMMS', category: 'EUC', status: 'Amber', kyc: 'Renewal due', payment: 'Avg 60 days' },
  { name: 'Pare Hydro Project (NEEPCO)', category: 'EUC', status: 'Amber', kyc: 'Renewal due', payment: 'Avg 90 days' },
  { name: 'New customer (auto-flagged)', category: '—', status: 'Blue', kyc: '—', payment: '—' },
  // Accounts behind the FY26 history and the FY27 pipeline.
  { name: 'Reliance Industries (Jamnagar)', category: 'EUC', status: 'Green', kyc: 'Valid', payment: 'On time' },
  { name: 'NTPC Simhadri', category: 'EUC', status: 'Amber', kyc: 'Valid', payment: 'Avg 75 days' },
  { name: 'BHEL Haridwar', category: 'OEM', status: 'Amber', kyc: 'Renewal due', payment: 'Avg 90 days' },
  { name: 'Hindustan Aeronautics Ltd', category: 'OEM', status: 'Green', kyc: 'Valid', payment: 'On time' },
  { name: 'Torrent Power', category: 'EUC', status: 'Amber', kyc: 'Valid', payment: 'Avg 60 days' },
  { name: 'Voith Hydro India', category: 'OEM', status: 'Green', kyc: 'Valid', payment: 'On time' },
  { name: 'Vedanta (Lanjigarh)', category: 'EUC', status: 'Red', kyc: 'Renewal due', payment: '>120 days overdue' },
  { name: 'MSPGCL', category: 'EUC', status: 'Amber', kyc: 'Valid', payment: 'Avg 90 days' },
  { name: 'IOCL Panipat', category: 'EUC', status: 'Green', kyc: 'Valid', payment: 'On time' },
  { name: 'NPCIL Kudankulam', category: 'EUC', status: 'Amber', kyc: 'Valid', payment: 'Avg 75 days' },
  { name: 'GTRE', category: 'EUC', status: 'Blue', kyc: 'Pending', payment: '—' },
  { name: 'Thermax Ltd', category: 'OEM', status: 'Green', kyc: 'Valid', payment: 'On time' },
  { name: 'JSW Energy', category: 'EUC', status: 'Amber', kyc: 'Valid', payment: 'Avg 60 days' },
  { name: 'HPCL Visakh', category: 'EUC', status: 'Green', kyc: 'Valid', payment: 'On time' },
  { name: 'Siemens Energy India', category: 'OEM', status: 'Green', kyc: 'Valid', payment: 'On time' },
  { name: 'THDC India', category: 'EUC', status: 'Amber', kyc: 'Valid', payment: 'Avg 75 days' },
  { name: 'Cummins India', category: 'OEM', status: 'Green', kyc: 'Valid', payment: 'On time' },
  { name: 'Adani Power (Mundra)', category: 'EUC', status: 'Amber', kyc: 'Valid', payment: 'Avg 60 days' },
  { name: 'ONGC Uran', category: 'EUC', status: 'Green', kyc: 'Valid', payment: 'Avg 45 days' },
  { name: 'GAIL India', category: 'EUC', status: 'Amber', kyc: 'Valid', payment: 'Avg 60 days' },
  { name: 'ISRO Propulsion Complex', category: 'EUC', status: 'Blue', kyc: 'Pending', payment: '—' },
]

// Every customer carries a purchase-desk address so the Email Proposal dialog
// resolves a recipient without anyone retyping it. The real recipient is the
// sender of the original enquiry (carried onto the opportunity as contactEmail);
// this is the fallback when an opportunity was raised without a lead.
// Demo addresses use .example.in, which cannot receive mail.
const purchaseAddress = name => 'purchase@' + String(name)
  .toLowerCase()
  .replace(/\(.*?\)/g, ' ')            // drop parenthetical sites
  .replace(/[^a-z0-9]+/g, ' ')
  .trim().split(/\s+/).slice(0, 2).join('') + '.example.in'

export const seedCustomers = CUSTOMER_ROWS.map(c => ({ ...c, email: c.email || purchaseAddress(c.name) }))

// Lead inbox — inquiries land here (common mailbox intake); most never become
// opportunities and that history is kept minimally, per the Aug 10 meeting.
export const seedLeads = [
  {
    id: 'LD-101', ts: '2026-08-10T09:12:00Z', channel: 'Email',
    from: 'purchase.simhadri@ntpc.example.in',
    subject: 'RFQ — Bently 3300 XL proximity probe spares for Unit 2',
    body: 'Dear ModAE team,\n\nWe require 8 nos Bently 3300 XL 8mm proximity probes (P/N 330101-00-08-10-02-00) with 5m extension cables for Simhadri STPP Unit 2 TG condition monitoring. Kindly quote your best price with delivery to Visakhapatnam within 8 weeks.\n\nRegards,\nPurchase Cell, NTPC Simhadri',
    status: 'New',
    parse: {
      sellTo: 'NTPC Simhadri', category: 'EUC', location: 'Visakhapatnam',
      eucName: 'NTPC Simhadri', eucLocation: 'Visakhapatnam',
      oppName: 'Bently 3300 XL proximity probe spares — Unit 2',
      oppType: 'Spares', bu: 'Energy', segment: 'Thermal', product: 'Bently',
      contactPerson: 'Purchase Cell', contactPhone: '',
      items: [{ desc: 'Bently 3300 XL 8mm proximity probe + 5m ext. cable', pn: '330101-00-08-10-02-00', qty: 8 }],
      confidence: 0.92,
      note: 'Bently part number recognised — no Bently price list; ad-hoc trader quote will be needed.',
    },
  },
  {
    id: 'LD-102', ts: '2026-08-11T06:40:00Z', channel: 'Email',
    from: 'maintenance@bmms.example.in',
    subject: 'Field balancing visit — BFP-2A high vibration',
    body: 'Hi,\n\nOur BFP-2A is showing high 1x vibration after overhaul. Need a ModAE engineer for field balancing, likely 2-3 days on site in Bangalore next week. Please send your service offer.\n\nR. Iyer, BMMS',
    status: 'New',
    parse: {
      sellTo: 'BMMS', category: 'EUC', location: 'Bangalore',
      eucName: 'BMMS', eucLocation: 'Bangalore',
      oppName: 'Field balancing — BFP-2A, 2-3 days on site',
      oppType: 'Service', bu: 'Services', segment: 'Industrial', product: 'ModAE',
      contactPerson: 'R. Iyer', contactPhone: '+91 98450 22222',
      items: [{ desc: 'Service Engineer — field balancing, on site', pn: '', qty: 3 }],
      confidence: 0.85,
      note: 'Existing Amber customer — service rate sheet applies (Service Engineer 45 K₹/day).',
    },
  },
  {
    id: 'LD-103', ts: '2026-08-09T14:05:00Z', channel: 'Email',
    from: 'info@greenfieldwind.example.com',
    subject: 'Wind turbine installation partner required',
    body: 'Hello, we are looking for an installation partner for 12 wind turbines in Karnataka. Can you handle turbine erection and grid connection?\n\nGreenfield Wind LLP',
    status: 'New',
    parse: {
      sellTo: 'Greenfield Wind LLP', category: 'EPC', location: 'Karnataka',
      eucName: '', eucLocation: '', oppName: 'Wind turbine installation (12 units)',
      oppType: 'Project', bu: 'Energy', segment: 'Others', product: 'Various',
      contactPerson: '', contactPhone: '', items: [], confidence: 0.4,
      note: 'Outside current business scope (turbine erection) — suggest Drop, keep for future analytics.',
    },
  },
]

// Approval requests routed to LJS / AH; "Approved with conditions" must have
// every condition confirmed incorporated before the proposal can go out.
export const seedApprovals = [
  {
    id: 'AP-101', oppId: '2606213RS', type: 'Commercial deviation',
    detail: 'Customer asks 90-day credit on Upgr. of VC-4000-Koyna; proposal quotes 30 days from invoice (deviation).',
    requestedBy: 'RS', ts: '2026-08-08T10:30:00Z', approver: 'AH', status: 'Pending',
    conditions: [], decisionTs: '', decisionNote: '',
  },
  {
    id: 'AP-102', oppId: '2607215RS', type: 'Amber credit terms',
    detail: 'BHEL Bhopal is Amber (avg 60-day payment). Credit terms for ARUN-3 AGMS proposal need clearance.',
    requestedBy: 'RS', ts: '2026-08-06T08:00:00Z', approver: 'AH', status: 'Approved with conditions',
    conditions: [{ text: '100% advance payment — add "100% advance along with PO" to the payment term', incorporated: false, note: '' }],
    decisionTs: '2026-08-07T09:15:00Z', decisionNote: 'Approved based on prior unpaid-invoice history — prepay only.',
  },
]

// Imported Items Pricing & Costing Factors — as on the Priced BoQ sheet.
export const defaultCosting = {
  baseRate: 112.0,      // Euro-₹ Base (spot + ₹1 buffer, rounded up)
  usdBase: 90.0,        // USD-₹ Base — imports come in both € and $
  cdErvContPct: 16.0,   // Legacy alias retained for older proposal snapshots
  bnkDiscPct: 50.0,     // B&K Disc% (applies to the B&K list only)
  inputGMPct: 35.0,     // Input GM%
  financeCostK: 0,      // Finance Cost (K₹) — deducted before Net GM, as on the real sheet
}

export function newProposal(oppId, opp, options = {}) {
  const route = routeForType(opp?.oppType)
  const artifactSheets = route === 'Project'
    ? ['Cover Letter', 'Signal List', 'Rack Layout', 'Priced BoQ', 'Compliance Table']
    : route === 'Service'
      ? ['Cover Letter', 'Scope of Work', 'Issues List', 'Proposal', 'Service Rate Schedule']
      : ['Cover Letter', 'Firm Offer', 'Clarifications', 'Sensor Comparison', 'Priced BoQ']
  return {
    oppId,
    proposalType: proposalTypeForOpp(opp),
    route,
    artifactSheets,
    templateSource: route === 'Project' ? 'Project proposal workbook' : route === 'Service' ? 'Service proposal and SOW' : 'Spares firm offer and comparison',
    ourRef: oppId,
    bidStage: 'Biding',
    bidType: 'Priced',
    revision: '00',
    revisionDate: opp?.rfqDate || new Date().toISOString().slice(0, 10),
    validityDays: Math.max(1, Number(options.validityDays) || 30),
    units: 7,           // № of machines/units — Total Qty = Qty/Unit × units + Common + Spares
    addressee: opp ? `M/s. ${opp.sellTo}` : '',
    kindAttn: opp ? opp.contactPerson : '',
    attnPhone: opp ? opp.contactPhone : '',
    rfqNumber: opp?.rfqNumber || '',
    subject: opp ? `Proposal For ${opp.oppName}` : '',
    project: opp ? opp.oppName : '',
    bom: [],
    pricingMode: 'none',
    discountPct: 0,
    markupPct: 0,
    pricingHistory: [],
    approvedPricing: null,
    costing: { ...defaultCosting, ...(options.costingDefaults || {}), currencyRates: options.currencyRates || undefined },
    sourceCurrency: 'INR', sourceRate: 1, sourceRateDate: new Date().toISOString().slice(0, 10),
    clauseIds: DEFAULT_CLAUSES.filter(c => c.routes.includes(route === 'Service' ? 'Services' : route) && c.required).map(c => c.id),
    clauses: [],
    signals: [
      { signal: 'Radial Vibration X/Y', perUnit: 8, units: 7 },
      { signal: 'Axial Position', perUnit: 2, units: 7 },
      { signal: 'Air Gap', perUnit: 12, units: 7 },
      { signal: 'Keyphasor', perUnit: 1, units: 7 },
    ],
    terms: [
      { term: 'Payment', customerAsk: '90 days credit', standardTerm: '30 days from invoice', proposedTerm: '30 days from invoice', ourResponse: '30 days from invoice', decision: 'Decision pending', customerConfirmationStatus: 'Not required', status: 'Deviation' },
      { term: 'Delivery', customerAsk: '8 weeks', standardTerm: '10–12 weeks ex-works', proposedTerm: '10–12 weeks ex-works', ourResponse: '10–12 weeks ex-works', decision: 'Decision pending', customerConfirmationStatus: 'Not required', status: 'Deviation' },
      { term: 'Warranty', customerAsk: '18 months', ourResponse: '18 months from supply', status: 'Comply' },
    ],
  }
}

// ---------------------------------------------------------------------------
// BT-prototype port, phase 2 — config, KYC, workbench, PO/handover, sales
// targets, notes. Everything below is backfilled into saved state by
// store.migrate() without a reseed.
// ---------------------------------------------------------------------------

export const AI_PROVIDERS = {
  'Built-in fallback': [],
  Anthropic: ['claude-fable-5', 'claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5', 'Other (enter below)'],
  OpenAI: ['gpt-5-flagship', 'gpt-5-mini', 'gpt-4o', 'Other (enter below)'],
  // Google IDs verified against the credential's own /v1beta/models listing.
  // The *-latest aliases track Google's current pick without a redeploy.
  Google: ['gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3.6-flash',
    'gemini-flash-latest', 'gemini-pro-latest', 'gemini-2.5-pro', 'Other (enter below)'],
  'Mistral AI': ['mistral-large', 'mistral-small', 'Other (enter below)'],
  'Meta (Llama)': ['llama-4-maverick', 'llama-4-scout', 'Other (enter below)'],
  'Azure OpenAI': ['(deployment name — enter below)'],
  'Custom / self-hosted': ['(model id — enter below)'],
}

// Runtime configuration — every value editable on the Admin page.
export const seedConfig = {
  // Display labels are configurable; role IDs remain canonical in all records.
  roleNames: Object.fromEntries(Object.entries(ROLES).map(([id, role]) => [id, role.name])),
  currencyRates: { ...DEFAULT_CURRENCY_RATES },
  costingDefaults: { customsDutyPct: 8.5, ervPct: 2.5, handlingPct: 5, cdErvHandlingMinPct: 15, cdErvHandlingMaxPct: 20 },
  // L-05-AI, Official Lead Management Workflow (22 Jul 2026) — six rules, kept
  // one-per-row so the Admin page reads like the drawing. The AI only suggests
  // from these; LJS or AH may override, and only with a reason.
  // `unclassified` is the drawing's last row ("Unclassified Leads - LJS,
  // approval needed"): it is the catch-all, so it never pattern-matches.
  ownershipRules: [
    { region: 'North & West India', owner: 'RS' },
    { region: 'South & East India', owner: 'PP' },
    { region: 'Big & miscellaneous opportunities', owner: 'LJS' },
    { region: 'International opportunities', owner: 'LJS' },
    { region: 'Aerospace / DCS / automation opportunities', owner: 'LJS' },
    { region: 'Unclassified leads', owner: 'LJS', unclassified: true, approvalNeeded: true },
  ],
  // Fallback owner by opportunity type, used when no regional rule above
  // applies (e.g. Spares leads route to PJS by default).
  ownerRules: OPP_TYPES.map(t => ({ oppType: t, owner: DEFAULT_OWNER_FOR_OPP_TYPE[t] })),
  leadDeadlines: { kycDays: 7, amberFeeDays: 7, clarificationDays: 7 },
  proposalValidityDays: 30,
  // How long a published service rate schedule stands before it is re-validated.
  rateSheetValidityDays: 30,
  // The mailbox every enquiry lands in. Clarification mail goes out from here
  // until a lead is assigned, and from the assigned salesperson after that.
  commonMailbox: 'sales@modae.demo',
  fastTrack: { enabled: true, customerStatus: 'Green' },
  aiThresholds: { high: 90, med: 75 },
  // Diagram 02 §5C margin matrix: order value against ₹10 Lakh, margin against 50%.
  approvalThresholds: { valueBreak: 1000000, marginBreak: 50, discountPct: 5, markupPct: 10, pricingApprovers: ['AH', 'LJS'] },
  amberFee: { amount: 25000, cur: 'INR', days: 7 },
  classRules: {
    Green: '30 days credit from invoice',
    Blue: '50% advance, balance on delivery',
    Amber: '100% advance before dispatch',
    Red: '100% prepayment only',
  },
  // The Green/Blue/Amber/Red rules themselves — what each class must verify,
  // who approves it, where it gates. See customerClasses.js.
  customerClasses: DEFAULT_CUSTOMER_CLASSES,
  documentChecklists: DEFAULT_DOC_CHECKLISTS,
  // Which region (and thus which owner, via ownershipRules) each Indian
  // state/UT routes to. Defaults mirror indiaLocations.js's STATE_REGION.
  stateRegions: Object.entries(STATES)
    .map(([code, name]) => ({ code, name, region: STATE_REGION[code] || 'Unclassified leads' }))
    .sort((a, b) => a.name.localeCompare(b.name)),
  workflow: DEFAULT_WORKFLOW,
  kycItems: ['GST certificate', 'PAN certificate', 'Cancelled cheque', 'EFT / bank mandate', 'CIN reference', 'Registered & business address'],
  kycValidation: DEFAULT_KYC_VALIDATION,
  templates: ['Spares quotation', 'Reactive service offer', 'Project techno-commercial proposal'],
  reminders: [
    { id: 'validity', label: 'Proposal validity 7-day warning', on: true },
    { id: 'amberFee', label: 'Amber fee daily reminder', on: true },
    { id: 'slaNudge', label: 'Approval SLA 48h nudge', on: true },
  ],
  connectors: [
    { id: 'outlook', label: 'Outlook (common mailbox)', state: 'Healthy' },
    { id: 'teams', label: 'Microsoft Teams', state: 'Healthy' },
    { id: 'sharepoint', label: 'SharePoint', state: 'Not connected' },
    { id: 'crm', label: 'CRM', state: 'Healthy' },
    { id: 'erp', label: 'ERP', state: 'Degraded (read-only)' },
    { id: 'payment', label: 'Payment gateway', state: 'Unavailable' },
    { id: 'bi', label: 'BI', state: 'Healthy' },
  ],
  // No key here by design: it lives in Vercel's server-side environment.
  aiModel: { provider: 'Google', model: 'gemini-3.1-flash-lite', customModel: '', endpoint: '', updatedBy: '', updatedOn: '' },
  // Admin document uploads (metadata only — content stays with the file's home).
  uploads: {
    priceLists: [
      { supplier: 'B&K Vibro', name: 'B&K Vibro Dummy Price List (1).xlsx', version: 'Imported-2026-09', uploaded: '2026-09-24', status: 'Current', dummy: true },
      { supplier: 'Metrix', name: 'Metrix Dummy Price List - Copy (2).xlsx', version: 'Imported-2026-09', uploaded: '2026-09-24', status: 'Current', dummy: true },
    ],
    interchangeability: null,
    customerClassification: null,
    datasheets: [],
    proposalTemplates: [],
    kycTemplates: {},
  },
}

// KYC checklist state per customer, derived from the master's kyc field.
export function kycFromCustomer(c, items) {
  const state = c.kyc === 'Valid' ? 'Verified' : c.kyc === 'Renewal due' ? 'Expired' : 'Missing'
  return items.map((name, i) => ({
    name,
    state: c.kyc === 'Renewal due' && i > 0 ? 'Verified' : state,
    when: state === 'Verified' ? '2026-04-10' : '',
  }))
}
export const seedKyc = Object.fromEntries(
  seedCustomers.filter(c => c.name !== 'New customer (auto-flagged)')
    .map(c => [c.name, kycFromCustomer(c, seedConfig.kycItems)]))

// FY 2026-27 sales targets (K₹) and booked orders.
export const seedSales = {
  fy: 'FY 2026-27', currentQ: 2, monthsElapsed: 5,
  targets: {
    LJS: { annual: 60000, q: [15000, 15000, 15000, 15000] },
    PP: { annual: 36000, q: [9000, 9000, 9000, 9000] },
    RS: { annual: 36000, q: [9000, 9000, 9000, 9000] },
    SS: { annual: 24000, q: [6000, 6000, 6000, 6000] },
    PJS: { annual: 20000, q: [5000, 5000, 5000, 5000] },
    RJS: { annual: 20000, q: [5000, 5000, 5000, 5000] },
    SR: { annual: 16000, q: [4000, 4000, 4000, 4000] },
  },
  orders: [
    { id: 'ORD-001', owner: 'LJS', customer: 'Andritz Hydro', title: 'VMS for LiMAK Project Turkey', valueK: 7500, po: 'PO-46112', status: 'Delivered', booked: '2026-04-12' },
    { id: 'ORD-002', owner: 'RS', customer: 'Prime Engineering/PECO', title: 'Koyna spares batch 1', valueK: 1850, po: 'PO-46388', status: 'In execution', booked: '2026-05-20' },
    { id: 'ORD-003', owner: 'PP', customer: 'GE Vernova', title: 'Sensor cables — Chennai', valueK: 640, po: 'PO-46501', status: 'In execution', booked: '2026-06-18' },
    { id: 'ORD-004', owner: 'SR', customer: 'BMMS', title: 'Operator training (3 weeks)', valueK: 950, po: 'PO-46550', status: 'Scheduled', booked: '2026-07-29' },
    // Q1 Apr-Jun — the quarter closed at ~103% of the summed owner targets.
    { id: 'ORD-005', owner: 'RS', customer: 'Andritz Hydro', title: 'Koyna spares batch 2', valueK: 2100, po: 'PO-46201', status: 'Delivered', booked: '2026-04-24' },
    { id: 'ORD-006', owner: 'SS', customer: 'Reliance Industries (Jamnagar)', title: 'Jamnagar CDU/VDU accelerometer refill', valueK: 4600, po: 'PO-46310', status: 'Delivered', booked: '2026-05-08' },
    { id: 'ORD-007', owner: 'PJS', customer: 'NTPC Simhadri', title: 'Simhadri U-3 rack retrofit — phase 2', valueK: 6250, po: 'PO-46344', status: 'In execution', booked: '2026-05-15' },
    { id: 'ORD-008', owner: 'RJS', customer: 'Hindustan Aeronautics Ltd', title: 'Test bed chain — phase 1 balance', valueK: 5200, po: 'PO-46420', status: 'In execution', booked: '2026-06-05' },
    { id: 'ORD-009', owner: 'SR', customer: 'BHEL Bhopal', title: 'ARUN-3 site commissioning services', valueK: 1450, po: 'PO-46466', status: 'Delivered', booked: '2026-06-29' },
    { id: 'ORD-015', owner: 'LJS', customer: 'Andritz Hydro', title: 'VMS supply — Parbati-II, 4 units', valueK: 18600, po: 'PO-46432', status: 'In execution', booked: '2026-06-16' },
    { id: 'ORD-016', owner: 'PP', customer: 'Thermax Ltd', title: 'AMC renewal — captive boilers, 2 sites', valueK: 1980, po: 'PO-46448', status: 'In execution', booked: '2026-06-24' },
    { id: 'ORD-019', owner: 'RS', customer: 'Prime Engineering/PECO', title: 'Koyna loop-powered transmitters', valueK: 4200, po: 'PO-46409', status: 'In execution', booked: '2026-06-11' },
    // Q2 Jul-Sep — in progress, ~61% of the quarter's target with 7 weeks left.
    { id: 'ORD-010', owner: 'SS', customer: 'IOCL Panipat', title: 'Panipat pilot train — advance batch', valueK: 3900, po: 'PO-46588', status: 'In execution', booked: '2026-07-08' },
    { id: 'ORD-011', owner: 'RJS', customer: 'Cummins India', title: 'Test cell sensor refresh — tranche 1', valueK: 1750, po: 'PO-46612', status: 'Scheduled', booked: '2026-07-24' },
    { id: 'ORD-017', owner: 'LJS', customer: 'Siemens Energy India', title: 'Retrofit VMS — Hazira gas terminal', valueK: 12400, po: 'PO-46605', status: 'In execution', booked: '2026-07-21' },
    { id: 'ORD-018', owner: 'PP', customer: 'Adani Power (Mundra)', title: 'Annual calibration & health check — 5 units', valueK: 2760, po: 'PO-46597', status: 'Scheduled', booked: '2026-07-14' },
    { id: 'ORD-020', owner: 'PP', customer: 'GE Vernova', title: 'Sensor cables — tranche 2', valueK: 3800, po: 'PO-46571', status: 'In execution', booked: '2026-07-02' },
    { id: 'ORD-012', owner: 'PJS', customer: 'THDC India', title: 'Tehri PSP — instrumentation advance', valueK: 2800, po: 'PO-46648', status: 'Scheduled', booked: '2026-08-05' },
    { id: 'ORD-014', owner: 'RS', customer: 'MSPGCL', title: 'Bhusawal U-4 — enabling works', valueK: 1900, po: 'PO-46655', status: 'Scheduled', booked: '2026-08-08' },
    { id: 'ORD-021', owner: 'SR', customer: 'BMMS', title: 'Diagnostics retainer — advance', valueK: 2100, po: 'PO-46641', status: 'Scheduled', booked: '2026-08-03' },
  ],
}

// Spares workbench lines (seeded on the Koyna loop-powered-transmitter opp) —
// customer references vs interpreted parts with match confidence.
export const seedSparesLines = [
  {
    id: 'SL-1', oppId: '2607217RS', custRef: 'Loop powered velocity transmitter, 4-20mA, top exit',
    pn: 'IN081-3-110-50', desc: 'Vibration sensor IN-081, 110mm', oem: 'B&K', match: 'Exact', conf: 96,
    confirmed: true, qty: 50, leadTime: '6-8 weeks', priceList: 'BNK 2026-01', priceState: 'Current',
    listPrice: 954, currency: 'EUR',
  },
  {
    id: 'SL-2', oppId: '2607217RS', custRef: 'Extension cable 5 m with connector',
    pn: 'EC-05', desc: 'Extension cable 5m', oem: 'B&K', match: 'Exact', conf: 92,
    confirmed: true, qty: 50, leadTime: '4 weeks', priceList: 'BNK 2026-01', priceState: 'Current',
    listPrice: 105, currency: 'EUR',
  },
  {
    id: 'SL-3', oppId: '2607217RS', custRef: 'Vibrotest 60 portable analyser',
    pn: 'VST-100', desc: 'VST-100 portable vibration tester (Vibrotest 60 superseded)', oem: 'B&K',
    match: 'Fuzzy — superseded', conf: 78, confirmed: false, qty: 1, leadTime: '10 weeks',
    priceList: 'BNK 2025-Q4', priceState: 'Expired', listPrice: 8400, currency: 'EUR',
  },
]
export const seedSparesAlternatives = [
  { forPn: 'VST-100', pn: 'VST-100', desc: 'Direct successor — VST-100', conf: 90, note: 'Obsolescence bulletin SB-112: Vibrotest 60 → VST-100', priceState: 'Expired' },
  { forPn: 'VST-100', pn: 'MX-2110', desc: 'Metrix proximity system (third-party equivalent)', conf: 62, note: 'Interchangeability matrix row 41', priceState: 'Current' },
]

// Reactive-service rate sheets (day rates in K₹ / USD).
export const seedRateSheets = {
  India: {
    currency: 'INR', gst: 18,
    rates: { engineerDay: 45, seniorDay: 65, travelDay: 20, otHour: 6, weekendPct: 50, standbyDay: 25, minCallout: 90, flight: 18, hotelNight: 6, transportDay: 4, perDiem: 3, tools: 12 },
    roles: INDIA_ROLES,
  },
  International: {
    currency: 'USD', gst: 0,
    rates: { engineerDay: 900, seniorDay: 1300, travelDay: 450, otHour: 120, weekendPct: 50, standbyDay: 500, minCallout: 1800, flight: 1400, hotelNight: 180, transportDay: 90, perDiem: 80, tools: 250 },
    roles: INTERNATIONAL_ROLES,
  },
}
export const seedSvcEstimates = [
  {
    oppId: '2607214RS', sheet: 'India', workDays: 3, travelDays: 2, dailyHours: 8, otHours: 4,
    weekendDays: 1, standbyDays: 0, engineer: 'K. Prasad (available)', mobilisation: '2026-08-18',
    toolsCerts: 'Balancing kit, ladder permit', travelConfirmed: false,
  },
]

// Clarification tracker rows.
export const seedClarifications = [
  {
    id: 'CL-1', oppId: '2608219PP', category: 'Technical', gap: 'Signal list vs contractual sensor count mismatch',
    q: 'Measurement "D" (bracket absolute axial displacement) — accelerometer per signal list or 3 proximity probes per contract clause iii?',
    owner: 'PP', audience: 'Customer', due: '2026-08-18', status: 'Open', response: '',
    evidence: 'RFQ Annexure-I p.4 vs Signal List (33 sensors/unit)',
  },
  {
    id: 'CL-2', oppId: '2608219PP', category: 'Site data', gap: 'Cable routing distances missing',
    q: 'Distance machine→rack, JBs per machine, rack→DCS (MODBUS TCP/IP), rack→workstation?',
    owner: 'PP', audience: 'Customer', due: '2026-08-18', status: 'Draft', response: '',
    evidence: 'Purchasing spec section 6',
  },
]

// Proposal-vs-PO comparison, seeded on the Won LiMAK order (the meeting's
// 3310-vs-3300 part-number example included).
// Demo Launcher scenario 6 ("PO validation & handover") opens straight on this
// opportunity, so a PO has to already be in review — otherwise the scenario
// landed on an empty "no PO received" state and the demo had to click Simulate
// first. Every other opportunity still starts with no PO, as it should.
export const seedPoCompare = {
  '2601122LJS': {
    ...buildPoCompare('2601122LJS'),
    received: '2026-08-06',
    status: 'In review',
  },
}
export function buildPoCompare(oppId) {
  return {
    oppId, poNo: 'PO-46990', received: '', status: 'Not received',
    acceptance: { LJS: null, AH: null },
    lines: [
      { aspect: 'Customer identity & billing', prop: 'Andritz Hydro, Mandideep GSTIN 23AA…', po: 'Andritz Hydro, Mandideep GSTIN 23AA…', state: 'Match' },
      { aspect: 'Line 1 — VC-8000 rack', prop: 'VC-8000/RCK ×2', po: 'VC-8000/RCK ×2', state: 'Match' },
      { aspect: 'Line 2 — sensor part number', prop: 'BKD-3310 (current)', po: 'BKD-3300 (legacy number)', state: 'Review required', note: 'Customer PO cites the superseded number — likely same item.' },
      { aspect: 'Currency & tax', prop: 'INR, GST 18% extra', po: 'INR, GST 18% extra', state: 'Match' },
      { aspect: 'Delivery', prop: '6 weeks ex-works', po: '5 weeks door delivery', state: 'Blocking deviation', note: 'PO shortens delivery and shifts Incoterms.' },
      { aspect: 'Payment terms', prop: '30 days from invoice', po: '45 days from receipt', state: 'Review required' },
      { aspect: 'Warranty', prop: '18 months from supply', po: '18 months from supply', state: 'Match' },
      { aspect: 'Total value', prop: '₹ 7,500 K + GST', po: '₹ 7,500 K + GST', state: 'Match' },
    ].map(l => ({ ...l, resolved: l.state === 'Match' })),
  }
}

// Handover checklist template (12 items, 9 groups).
export function buildHandover() {
  return {
    approved: false, approvedBy: '', approvedOn: '',
    groups: [
      { g: 'Order documents', items: [{ n: 'Approved PO + released proposal filed', done: false, owner: 'Sales' }] },
      { g: 'Technical package', items: [{ n: 'Final BOQ locked', done: false, owner: 'Sales' }, { n: 'Signal list & rack layout frozen', done: false, owner: 'TECH' }] },
      { g: 'KYC & commercial controls', items: [{ n: 'KYC verified & payment terms recorded', done: false, owner: 'AH' }] },
      { g: 'Procurement package', items: [{ n: 'Vendor POs / price confirmations attached', done: false, owner: 'AH' }] },
      { g: 'Resources & execution plan', items: [{ n: 'Engineer allocation confirmed', done: false, owner: 'Ops' }] },
      { g: 'Delivery milestones', items: [{ n: 'Milestone dates agreed with customer', done: false, owner: 'Sales' }, { n: 'Penalty / LD clauses flagged', done: false, owner: 'AH' }] },
      { g: 'Finance & invoicing', items: [{ n: 'Invoice schedule set up', done: false, owner: 'Finance' }] },
      { g: 'Risks & commitments', items: [{ n: 'Risks, assumptions, special commitments logged', done: false, owner: 'Sales' }] },
      { g: 'Receiving owners', items: [{ n: 'Execution owner briefed', done: false, owner: 'Ops' }, { n: 'Finance owner briefed', done: false, owner: 'Finance' }] },
    ],
  }
}
export const seedHandover = {}

// ---------------------------------------------------------------------------
// AI-parsed leads modeled on the client's REAL sample emails (.local/documents/modae-doc/modae doc/*.eml,
// 8 Aug 2026): retrofit RFQ w/ Meggitt BOM, project RFQ (VAMS), green customer
// after site visit, product obsoletion, GeM bid clarification, plus one
// Red-class lead to drive the AP-1 joint-approval demo.
// Field shape: { group, k, v, conf (0-100), ev, state: 'pending'|'accepted'|'rejected', note? }
// ---------------------------------------------------------------------------
export const seedAiLeads = [
  {
    id: 'LD-201', ts: '2026-08-10T10:15:00Z', channel: 'Email', source: 'Networking & relationship',
    from: 'akhil.umesh@tatapower.example.in', sender: 'Akhil Umesh — Tata Power',
    subject: 'Request for quotation — Meggitt VMS spares (retrofit)',
    ref: 'RFQ/TP/2026/0814', route: 'Spares', urgency: 'Normal', duplicateRisk: 'Medium',
    completeness: 96, suggestedOwner: 'RS', status: 'New',
    body: 'Dear sir,\n\nPlease provide your quotation for the following items:\n1. TQ 902, 8mm Standard Mount Proximity Probe, 1m integral cable, body 72mm — 111-902-000-01XA1-B1-C72-D2-E1000-F0-G0-H10\n2. EA902 Series Extension Cable, 9m — 913-902-000-01XA1-E9000-F0-G0\n3. IQS 900 Signal Conditioner, 4 mV/um, 10m system — 204-900-000-01XA1-B23-C1-H10-I0\n4. VE210 Low Frequency Velocity Sensor — 410-210-000-01XA1-B2-C0\n5. EC440 with L5000mm, 3-wire cable assembly — 922-440-000-10XP5000\n6. Work station\n7. Vibration Analysis Package for VibroSight software or equivalent\n\nVM600 rack installed: CPU MK2 (slot 0), MPC4 UGB/LGB/TGB (slots 3/4/6), MPC4 thrust pad axial (slot 7).\n\nBest regards\nAkhil Umesh\nLead Engineer — Instrumentation Maintenance, Tata Power',
    attachments: [{ name: 'Meggitt_BOM_Unit2.xlsx', pages: 3 }, { name: 'VM600_rack_config.pdf', pages: 2 }],
    ai: {
      summary: 'Retrofit spares RFQ from Tata Power (existing VM600/Meggitt install base). 7 line items incl. probes, cables, conditioner and a VibroSight analysis package. Two lines (workstation, software) need scope clarification before pricing.',
      fields: [
        { group: 'Customer', k: 'Sell-to customer', v: 'The Tata Power Company Ltd', conf: 97, ev: 'Sender domain + signature block', state: 'pending' },
        { group: 'Customer', k: 'Category', v: 'EUC', conf: 93, ev: 'End user operating the plant', state: 'pending' },
        { group: 'Customer', k: 'Contact', v: 'Akhil Umesh, Lead Engineer — Instrumentation, +91 7703850096', conf: 96, ev: 'Signature block', state: 'pending' },
        { group: 'RFQ', k: 'Opp type', v: 'Spares (retrofit)', conf: 95, ev: 'Part-number list against installed VM600 rack', state: 'pending' },
        { group: 'RFQ', k: 'Line items', v: '7 items — 5 with full Meggitt part numbers, 2 scope items', conf: 92, ev: 'Email body lines 1-7', state: 'pending' },
        { group: 'RFQ', k: 'BU / Segment', v: 'Energy / Thermal', conf: 88, ev: 'Tata Power thermal fleet + VM600 TG monitoring', state: 'pending' },
        { group: 'Known Project', k: 'Install base', v: 'VM600 rack, CPU MK2 + 4× MPC4 (UGB/LGB/TGB/thrust)', conf: 90, ev: 'Rack configuration in email', state: 'pending' },
      ],
      missing: ['Delivery location and required delivery period', 'Workstation spec (line 6) — hardware only or with OS licences?', 'VibroSight package: number of channels/licences'],
      duplicates: [{ leadId: 'LD-201D', note: 'Same subject "Request for quotation" received twice on 8 Aug (forwarded copy) — 92% body similarity.' }],
      next: ['Accept extracted fields', 'Send clarification for lines 6-7 scope', 'Route to spares workbench for part matching'],
    },
  },
  {
    id: 'LD-202', ts: '2026-08-09T16:40:00Z', channel: 'Email', source: 'OEM referral',
    from: 'scm@epc-major.example.com', sender: 'Supply Chain — (large EPC)',
    subject: 'Provide offer price for VAMS system for Tarali PSP project',
    ref: 'EPC/TARALI/VAMS/26-118', route: 'Project', urgency: 'Urgent', duplicateRisk: 'Low',
    completeness: 81, suggestedOwner: 'LJS', status: 'New',
    body: 'Dear Sir,\n\nPlease provide offer price as per attached specification for supply of VAMS (Vibration & Air Gap Monitoring System) for Tarali PSP.\n\n3 VAMS panels for the complete installation; 33 sensors per unit per signal list. Interface to plant DCS/SCADA over MODBUS TCP/IP.\n\nKind Regards,\nSupply Chain Management',
    attachments: [{ name: '01_Purchasing_Specification_VAMS.pdf', pages: 42 }, { name: '02_Annexure-I_II.pdf', pages: 18 }, { name: 'Signal_List.xlsx', pages: 4 }],
    ai: {
      summary: 'Full project RFQ from a large EPC for a pumped-storage VAMS package (multi-unit, 3 panels, DCS interface). Signal list conflicts with the contractual sensor requirement — clarification needed before BOQ.',
      fields: [
        { group: 'Customer', k: 'Sell-to customer', v: 'Large EPC (name withheld in demo data)', conf: 84, ev: 'Sender domain', state: 'pending' },
        { group: 'Customer', k: 'Category', v: 'EPC', conf: 95, ev: 'Supply-chain sender, project procurement', state: 'pending' },
        { group: 'RFQ', k: 'Opp type', v: 'Project', conf: 96, ev: '42-page purchasing spec + annexures', state: 'pending' },
        { group: 'RFQ', k: 'Scope', v: 'VAMS, 3 panels, 33 sensors/unit, MODBUS TCP/IP to DCS', conf: 87, ev: 'Spec section 3 + signal list', state: 'pending' },
        { group: 'RFQ', k: 'BU / Segment', v: 'Energy / Hydro (PSP)', conf: 94, ev: 'Tarali pumped storage project', state: 'pending' },
        { group: 'Known Project', k: 'Conflict detected', v: 'Signal list "D" = accelerometer vs contract clause iii = 3 proximity probes', conf: 68, ev: 'Annexure-I p.4 vs signal list', state: 'pending', note: 'Below medium threshold — human review required' },
      ],
      missing: ['Referenced drawing no. (cited in spec, not attached)', 'Panel locations + distances (cabling estimate)', 'Hardwired DCS interface requirements (4-20mA / relays)'],
      duplicates: [],
      next: ['Assign to LJS (large project rule)', 'Draft clarification with the 4 site-data questions', 'Open project workbench'],
    },
  },
  {
    id: 'LD-203', ts: '2026-08-08T13:05:00Z', channel: 'Email', source: 'Existing Green customer',
    from: 'agm.koyna@mahagenco.example.in', sender: 'AGM (E&M) — MAHAGENCO Koyna',
    subject: 'Koyna Hydroelectric Project — offer for Stage 3 upgrade as discussed during visit',
    ref: 'KOYNA/ST3/2026', route: 'Project', urgency: 'Normal', duplicateRisk: 'Low',
    completeness: 88, suggestedOwner: 'RS', status: 'New', fastTrack: true,
    body: 'Dear Sir,\n\nPlease send your best offer for Koyna Stage 3 plant as discussed during the joint site visit on 19 Jan.\n\nScope as discussed: upgrade of existing B&K system per machine for stages 1, 2 & 3; condition monitoring addition for stage 4 VMS (all 4 machines); common CMS software per stage; optional spares, display and field cables.\n\nAlso find attached Meggitt BoM details for the stage 4 upgradation carried out earlier.\n\nThanks & Regards',
    attachments: [{ name: 'Meggitt_BOM_Stage4.xlsx', pages: 2 }],
    ai: {
      summary: 'Green customer (existing relationship, post-site-visit) explicitly inviting an offer — fast-track candidate. Scope already agreed verbally during the 19 Jan joint visit; two proposals expected (calibration kit + upgrade scope).',
      fields: [
        { group: 'Customer', k: 'Sell-to customer', v: 'MAHAGENCO (Koyna HEP)', conf: 96, ev: 'Domain + install-base CRM row 12', state: 'pending' },
        { group: 'Customer', k: 'Classification', v: 'Green — past business, on-time payer', conf: 94, ev: 'Customer master + payment history', state: 'pending' },
        { group: 'RFQ', k: 'Opp type', v: 'Upgrade (project route)', conf: 91, ev: '"Upgrade of existing B&K system" in body', state: 'pending' },
        { group: 'RFQ', k: 'Scope', v: 'Stages 1-3 upgrade + stage 4 CMS + common software', conf: 86, ev: 'Body scope list, matches visit notes', state: 'pending' },
        { group: 'Known Project', k: 'Site visit', v: 'Joint visit 19 Jan 2026 — scope pre-agreed', conf: 93, ev: 'Email reference + CRM activity log', state: 'pending' },
      ],
      missing: ['RFQ document (verbal scope only — request written RFQ or proceed on visit notes)'],
      duplicates: [],
      next: ['Fast-track: Green customer, OK to quote', 'Prepare 2 proposals (calibration kit / upgrade scope)'],
    },
  },
  {
    id: 'LD-204', ts: '2026-08-07T10:58:00Z', channel: 'Email', source: 'Website enquiry',
    from: 'npd.sourcing@oem-customer.example.com', sender: 'NPD Sourcing',
    subject: 'Inquiry for Vibration Sensor Specifications & Pricing — VIBROTEST 60 or VST-100',
    ref: '', route: 'Spares', urgency: 'Normal', duplicateRisk: 'Low',
    completeness: 72, suggestedOwner: 'PP', status: 'New',
    body: 'Hi Team,\n\nI am reaching out to get details on your Vibration Sensor for specific model "VIBROTEST 60 or VST-100".\n\n- Technical specifications\n- Lead time, warranty, and service support\n\nRegards,\nNPD Sourcing',
    attachments: [],
    ai: {
      summary: 'Product inquiry citing an OBSOLETE model. Vibrotest 60 is discontinued — VST-100 is the active successor. AI suggests the equivalent-product reply with datasheet, and requesting end-user details before quoting.',
      fields: [
        { group: 'Customer', k: 'Sell-to customer', v: 'Unknown — sourcing team, no company profile matched', conf: 58, ev: 'Generic domain, no CRM match', state: 'pending', note: 'Below medium threshold — blocks registration until resolved' },
        { group: 'RFQ', k: 'Product', v: 'Vibrotest 60 → superseded by VST-100 (bulletin SB-112)', conf: 95, ev: 'Obsolescence register row 7', state: 'pending' },
        { group: 'RFQ', k: 'Opp type', v: 'Spares', conf: 82, ev: 'Single-instrument inquiry', state: 'pending' },
      ],
      missing: ['End user name and location', 'Application / machine details', 'Quantity'],
      duplicates: [],
      next: ['Send obsoletion reply: VST-100 datasheet + KYC request', 'Classify customer (likely Blue — new)'],
    },
  },
  {
    id: 'LD-205', ts: '2026-08-06T09:20:00Z', channel: 'Email', source: 'GeM / tender portal',
    from: 'gembuyer@example.gov.in', sender: 'GeM Buyer — Cooling Tower Cell',
    subject: 'Technical Clarifications For GeM Bid — cooling tower fan gearbox vibration monitoring & control panel',
    ref: 'GEM/2026/B/7411347', route: 'Project', urgency: 'Urgent', duplicateRisk: 'Low',
    completeness: 64, suggestedOwner: 'PP', status: 'New',
    body: 'Sir,\n\nWith reference to GeM Bid GEM/2026/B/7411347 (cooling tower fan gear box vibration monitoring and control panel with vibration sensor), please provide technical clarifications on sensor type, panel IP rating and integration with existing DCS before bid submission date.\n\nRegards',
    attachments: [{ name: 'GeM_Bid_7411347_extract.pdf', pages: 6 }],
    ai: {
      summary: 'GeM bid clarification request with LOW completeness — bid document extract only, no signal list, quantities or commercial terms. Multiple fields below confidence threshold; registration blocked until reviewed.',
      fields: [
        { group: 'Customer', k: 'Sell-to customer', v: 'Government buyer via GeM portal', conf: 71, ev: 'GeM bid number format', state: 'pending', note: 'Below medium threshold' },
        { group: 'RFQ', k: 'Opp type', v: 'Project (panel + sensors + integration)', conf: 74, ev: 'Bid title', state: 'pending', note: 'Below medium threshold' },
        { group: 'RFQ', k: 'Bid deadline', v: 'Not stated in extract', conf: 40, ev: 'GeM extract p.1', state: 'pending', note: 'Below medium threshold' },
      ],
      missing: ['Full bid document (only extract attached)', 'Signal list / sensor count', 'Bid submission date', 'EMD and eligibility terms'],
      duplicates: [],
      next: ['Pull full bid from GeM portal (GeM_Opportunity_Radar)', 'Resolve low-confidence fields before qualification'],
    },
  },
  {
    id: 'LD-206', ts: '2026-08-11T05:30:00Z', channel: 'Email', source: 'Phone call',
    from: 'procurement@capsa-realix.example.ae', sender: 'CAPSA Dubai / Realix',
    subject: 'Provide offer for VMS system and accessories',
    ref: 'CAPSA/VMS/2026-31', route: 'Spares', urgency: 'Normal', duplicateRisk: 'Low',
    completeness: 78, suggestedOwner: 'LJS', status: 'New', redFlag: true,
    body: 'Dear Sir,\n\nPlease provide your best offer for VMS system and accessories as per the attached list. Delivery to Dubai.\n\nRegards,\nProcurement — CAPSA / Realix',
    attachments: [{ name: 'VMS_accessories_list.pdf', pages: 2 }],
    ai: {
      summary: 'RED-CLASS customer (>180 days overdue on previous invoices). Continuation requires joint LJS + AH approval (AP-1). No opportunity ID is generated until approved; AI recommends prepayment-only terms if cleared.',
      fields: [
        { group: 'Customer', k: 'Sell-to customer', v: 'CAPSA Dubai / Realix', conf: 95, ev: 'Sender domain + customer master (Red)', state: 'pending' },
        { group: 'Customer', k: 'Classification', v: 'Red — unpaid record, >180 days overdue', conf: 97, ev: 'Accounting export row 23', state: 'pending' },
        { group: 'RFQ', k: 'Opp type', v: 'Spares (international)', conf: 85, ev: 'Accessories list + Dubai delivery', state: 'pending' },
        { group: 'RFQ', k: 'Suggested owner', v: 'LJS (international rule)', conf: 90, ev: 'Ownership routing table', state: 'pending' },
      ],
      missing: ['End-user disclosure (trader — who operates the equipment?)'],
      duplicates: [],
      next: ['AP-1: request joint LJS + AH continuation approval', 'If approved: 100% prepayment terms only'],
    },
  },
  // A genuine duplicate of LD-201: the customer chased the same RFQ two days
  // later and a second person forwarded it to the common mailbox. Same buyer
  // reference, same sender domain — exactly what duplicate detection is for, and
  // the reason the detector has something real to find in the demo.
  {
    id: 'LD-207', ts: '2026-08-12T04:40:00Z', channel: 'Email', source: 'Networking & relationship',
    from: 'akhil.umesh@tatapower.example.in', sender: 'Akhil Umesh — Tata Power',
    subject: 'Reminder: Request for quotation — Meggitt VMS spares (retrofit)',
    ref: 'RFQ/TP/2026/0814', route: 'Spares', urgency: 'Normal', duplicateRisk: 'High',
    completeness: 94, suggestedOwner: 'RS', status: 'New',
    body: 'Dear sir,\n\nKindly refer our RFQ/TP/2026/0814 sent on 10.08.2026 for Meggitt VMS retrofit spares. We have not received your offer. Request you to expedite as our shutdown window is fixed.\n\nItem list is unchanged (7 lines, as per our earlier mail).\n\nBest regards\nAkhil Umesh\nLead Engineer — Instrumentation Maintenance, Tata Power',
    attachments: [{ name: 'Meggitt_BOM_Unit2.xlsx', pages: 3 }],
    ai: {
      summary: 'Chaser on RFQ/TP/2026/0814 — the same Tata Power retrofit spares enquiry already in the inbox as LD-201. No new scope; the customer is asking for the offer.',
      fields: [
        { group: 'Customer', k: 'Sell-to customer', v: 'The Tata Power Company Ltd', conf: 97, ev: 'Sender domain + signature block', state: 'pending' },
        { group: 'RFQ', k: 'Buyer reference', v: 'RFQ/TP/2026/0814', conf: 99, ev: 'Quoted in the first line', state: 'pending' },
        { group: 'RFQ', k: 'Opp type', v: 'Spares (retrofit)', conf: 95, ev: 'Refers to the original item list', state: 'pending' },
      ],
      missing: [],
      duplicates: [],
      next: ['Confirm against LD-201 and drop this one', 'Reply on the existing opportunity, not a new one'],
    },
  },
  // ---- The 20 Aug benchmark ------------------------------------------------
  // The client named one enquiry and one proposal as the yardstick for the
  // spares lead-to-proposal flow. Both are in the repo:
  //   doc/Further Inputs/.../Spares Opp-1 (Won almost)/
  //     02_7425309-Buyers Speces.pdf          — this enquiry, "Ref:14716"
  //     Spares Firm Offer Rev00 2May2026.xlsx — the answer, Our Ref 2511096RS
  // Five B&K Vibro line items whose part codes match one-for-one across the two
  // documents; the price list carries all five (see seedPriceLists.BNK).
  // Green so the flow exercises the existing fast track end to end.
  {
    id: 'LD-208', ts: '2026-08-19T06:15:00Z', channel: 'Email', source: 'GeM / tender portal',
    from: 'purchase@ntpc-vindhyachal.example.gov.in', sender: 'Purchase — NTPC Vindhyachal',
    subject: 'Enquiry Ref 14716 — B&K Vibro spare sensors & accessories (GeM two-part bid)',
    ref: '14716', route: 'Spares', urgency: 'Normal', duplicateRisk: 'Low',
    completeness: 88, suggestedOwner: 'RS', status: 'New', customerStatus: 'Green',
    body: 'Dear Sir,\n\nPlease refer our enquiry Ref:14716 for supply of B&K Vibro make spare sensors and accessories '
      + 'against the attached buyer specification (five items, part codes as listed).\n\n'
      + 'Bidder must be the original manufacturer or an authorized dealer/distributor — a bid-specific valid '
      + 'authorization certificate is to be enclosed with the offer. Material must be delivered in OEM packing only.\n\n'
      + 'Kindly submit your priced offer along with the technical compliance sheet.\n\n'
      + 'Regards,\nPurchase Department',
    attachments: [{ name: '02_7425309-Buyers Speces.pdf', pages: 11 }],
    ai: {
      summary: 'GeM two-part spares enquiry, Ref 14716, for five B&K Vibro items with explicit part codes. '
        + 'All five resolve against the B&K price list. Buyer requires an authorization certificate and OEM '
        + 'packing; delivery location and the bid submission date are not stated in the specification.',
      fields: [
        { group: 'Customer', k: 'Sell-to customer', v: 'NTPC Vindhyachal', conf: 94, ev: 'Sender domain + buyer specification header', state: 'pending' },
        { group: 'Customer', k: 'Category', v: 'EUC', conf: 88, ev: 'Government generating station', state: 'pending' },
        { group: 'RFQ', k: 'Buyer reference', v: '14716', conf: 99, ev: 'Ref:14716, page 1 of the specification', state: 'pending' },
        { group: 'RFQ', k: 'Opp type', v: 'Spares', conf: 96, ev: 'Five spare sensor / accessory line items', state: 'pending' },
        { group: 'RFQ', k: 'Line items', v: '5 items — DS1001 ×10, DS1003 ×10, EC100 ×15, OD110 ×10, AC-3101/1 ×10', conf: 93, ev: 'Buyer specification, Items 1-5', state: 'pending' },
        { group: 'RFQ', k: 'Suggested owner', v: 'RS', conf: 90, ev: 'Ownership routing table — North & West India', state: 'pending' },
      ],
      missing: ['Delivery location / consignee address', 'Bid submission date'],
      duplicates: [],
      next: [
        'Draft the clarification for the delivery address and bid date',
        'Register and price against the B&K list — all five part codes are on it',
        'Enclose the authorization certificate the buyer specification asks for',
      ],
    },
  },
]

// Red-class continuation gate for LD-206 — joint LJS + AH decision (AP-1 demo).
export const seedJointApprovals = [
  {
    id: 'AP-1', oppId: '', leadId: 'LD-206', type: 'Red customer clearance',
    detail: 'CAPSA Dubai / Realix (Red — >180 days overdue) asked for a VMS offer. Continuation needs joint LJS + AH clearance; AI recommends 100% prepayment and end-user disclosure if cleared.',
    requestedBy: 'RS', ts: '2026-08-11T05:35:00Z', approver: 'LJS', status: 'Pending',
    needed: ['LJS', 'AH'], decisions: {},
    conditions: [], decisionTs: '', decisionNote: '',
  },
]
