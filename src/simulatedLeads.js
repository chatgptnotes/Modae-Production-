import { findDuplicates } from './insights.js'
import { routeOwner } from './leadRules.js'
import { OPP_TYPES, routeForType } from './seed.js'

// The demo simulator behind "Simulate incoming inquiry".
//
// Every click must produce a plausibly *different* enquiry. A mailbox full of
// byte-identical rows teaches nobody anything, and a generator that only ever
// emits a complete, unambiguous lead never reaches two paths the app actually
// implements: the clarification deadline (leadRules.deadlineForLead) and
// duplicate detection (insights.findDuplicates).
//
// What does NOT vary is what the operator deliberately picked: the customer
// class (the workflow gate that leadVerification/leadWorkflow read) and, when
// chosen, the opportunity type. Those are inputs; everything else is a
// permutation over them.

export const SIMULATED_CUSTOMER_SCENARIOS = [
  { status: 'Green', label: 'Green customer', hint: 'Proceed without KYC or fee' },
  { status: 'Blue', label: 'Blue customer', hint: 'KYC required within 1 week' },
  { status: 'Amber', label: 'Amber customer', hint: 'Processing fee required within 1 week' },
  { status: 'Red', label: 'Red customer', hint: 'Joint LJS / AH approval required' },
]

// Demo accounts, three per class. The "Demo" suffix is deliberate — nobody
// should mistake a simulated row for a live account. `region` is worded to
// match the L-05-AI ownership rules in seedConfig, so routeOwner() resolves a
// real owner from it instead of the generator hard-coding one.
export const SIMULATED_CUSTOMERS = {
  Green: [
    { name: 'Andritz Hydro Demo', contact: 'R. Venkatesh — Plant Maintenance Head', email: 'r.venkatesh', domain: 'andritz-demo.example.in', location: 'Faridabad, Haryana', region: 'North & West India', category: 'OEM' },
    { name: 'NHPC Salal Demo', contact: 'Manish Thakur — Sr. Manager (C&I)', email: 'manish.thakur', domain: 'nhpc-salal-demo.example.in', location: 'Reasi, Jammu & Kashmir', region: 'North & West India', category: 'EUC' },
    { name: 'Tata Steel Kalinganagar Demo', contact: 'S. Mohapatra — Reliability Engineer', email: 's.mohapatra', domain: 'tsk-demo.example.in', location: 'Jajpur, Odisha', region: 'South & East India', category: 'EUC' },
  ],
  Blue: [
    { name: 'Adani Power Godda Demo', contact: 'Vikas Ranjan — Instrumentation Lead', email: 'vikas.ranjan', domain: 'apgodda-demo.example.in', location: 'Godda, Jharkhand', region: 'South & East India', category: 'EUC' },
    { name: 'JSW Hydro Karcham Demo', contact: 'Deepak Negi — Manager (Electrical)', email: 'deepak.negi', domain: 'jswhydro-demo.example.in', location: 'Kinnaur, Himachal Pradesh', region: 'North & West India', category: 'EUC' },
    { name: 'BGR Energy Systems Demo', contact: 'Supply Chain — Projects Desk', email: 'scm.projects', domain: 'bgr-demo.example.in', location: 'Chennai, Tamil Nadu', region: 'South & East India', category: 'EPC' },
  ],
  Amber: [
    { name: 'Meenakshi Energy Demo', contact: 'G. Sudhakar — Maintenance Manager', email: 'g.sudhakar', domain: 'meenakshi-demo.example.in', location: 'Nellore, Andhra Pradesh', region: 'South & East India', category: 'EUC' },
    { name: 'KSK Mahanadi Demo', contact: 'Anil Sahu — C&I Engineer', email: 'anil.sahu', domain: 'kskm-demo.example.in', location: 'Janjgir-Champa, Chhattisgarh', region: 'South & East India', category: 'EUC' },
    { name: 'Shriram EPC Demo', contact: 'Purchase Cell — Rotating Equipment', email: 'purchase.rotating', domain: 'shriram-epc-demo.example.in', location: 'Pune, Maharashtra', region: 'North & West India', category: 'EPC' },
  ],
  Red: [
    { name: 'CAPSA Trading FZE Demo', contact: 'Omar Haddad — Procurement', email: 'omar.haddad', domain: 'capsa-demo.example.ae', location: 'Dubai, UAE', region: 'International opportunities', category: 'Trader' },
    { name: 'Realix Instruments Demo', contact: 'N. Pillai — Sales Desk', email: 'n.pillai', domain: 'realix-demo.example.ae', location: 'Sharjah, UAE', region: 'International opportunities', category: 'Trader' },
    { name: 'Gulf Rotating Equipment Demo', contact: 'Faisal Rahman — Buyer', email: 'faisal.rahman', domain: 'gre-demo.example.qa', location: 'Doha, Qatar', region: 'International opportunities', category: 'Trader' },
  ],
}

// Enquiry shapes, modelled on the real sample mails already captured in seed.js
// (seedAiLeads). Each carries the RFQ-side facts the AI would extract plus a
// pool of clarifications it would have to ask for when the mail is thin.
export const INQUIRY_TEMPLATES = [
  {
    key: 'retrofit-spares',
    subject: 'Request for quotation — VM600 retrofit spares',
    route: 'Spares', oppType: 'Spares', urgency: 'Normal', refPrefix: 'RFQ', source: 'Networking & relationship',
    bu: 'Energy', segment: 'Thermal', product: 'Meggitt', suggestedOwner: 'RS',
    body: 'Dear Sir,\n\nPlease quote for the following retrofit spares against our installed VM600 rack on TG-2:\n\n1. Proximity probe, 8 mm — 12 nos\n2. Extension cable, 5 m — 12 nos\n3. Signal conditioner module — 4 nos\n4. MPC4 monitoring card — 2 nos\n5. Rack CPU spare — 1 no\n\nOur shutdown window is fixed, so an early offer is requested.',
    attachments: [{ name: 'Retrofit_BOM.xlsx', pages: 3 }],
    summary: 'Retrofit spares RFQ against an existing VM600 install base — five line items with part numbers plus a rack CPU spare.',
    fields: [
      { group: 'RFQ', k: 'Opp type', v: 'Spares', conf: 95, ev: 'Retrofit part-number list against the installed VM600 rack' },
      { group: 'RFQ', k: 'Line items', v: '5 items — probes, cables, conditioner, MPC4, rack CPU', conf: 93, ev: 'Email body lines 1-5' },
      { group: 'Known Project', k: 'Install base', v: 'VM600 rack, CPU MK2 + 4x MPC4', conf: 90, ev: 'Rack configuration quoted in the email' },
    ],
    missingPool: [
      'Delivery location and required delivery period',
      'Probe series confirmation — 3300 XL or VM600 native?',
      'Is the rack CPU a hot spare or a like-for-like replacement?',
    ],
    next: ['Accept the extracted fields', 'Route to the spares workbench for part matching'],
  },
  {
    key: 'vams-project',
    subject: 'Provide offer price for VAMS system — pumped storage project',
    route: 'Project', oppType: 'Project', urgency: 'Urgent', refPrefix: 'PRJ', source: 'OEM referral',
    bu: 'Energy', segment: 'Hydro', product: 'ModAE', suggestedOwner: 'LJS',
    body: 'Dear Sir,\n\nPlease provide offer price as per the attached specification for supply of VAMS (Vibration & Air Gap Monitoring System).\n\n3 VAMS panels for the complete installation; 33 sensors per unit per the signal list. Interface to plant DCS/SCADA over MODBUS TCP/IP.\n\nKind Regards,',
    attachments: [{ name: 'Purchasing_Specification_VAMS.pdf', pages: 42 }, { name: 'Signal_List.xlsx', pages: 4 }],
    summary: 'Full project RFQ for a pumped-storage VAMS package — multi-unit, 3 panels, DCS interface over MODBUS TCP/IP.',
    fields: [
      { group: 'RFQ', k: 'Opp type', v: 'Project', conf: 96, ev: '42-page purchasing specification + annexures' },
      { group: 'RFQ', k: 'Scope', v: 'VAMS, 3 panels, 33 sensors/unit, MODBUS TCP/IP to DCS', conf: 87, ev: 'Spec section 3 + signal list' },
      { group: 'Known Project', k: 'Units', v: '3 units, air gap + vibration on each', conf: 88, ev: 'Signal list sheet 1' },
    ],
    missingPool: [
      'Referenced drawing number (cited in the spec, not attached)',
      'Panel locations and cable distances for the cabling estimate',
      'Hardwired DCS interface requirements (4-20 mA / relays)',
    ],
    next: ['Assign per the large-project rule', 'Draft the clarification with the site-data questions', 'Open the project workbench'],
  },
  {
    key: 'obsoletion',
    subject: 'MPC4 obsoletion notice — replacement options required',
    route: 'Project', oppType: 'Upgrade', urgency: 'Normal', refPrefix: 'OBS', source: 'Existing Green customer',
    bu: 'Energy', segment: 'Thermal', product: 'MC Monitoring', suggestedOwner: 'RS',
    body: 'Dear Sir,\n\nWe are informed that the MPC4 card on our monitoring rack is being discontinued. Kindly advise the replacement path and quote for migrating both units before the next overhaul.\n\nPlease also confirm whether the existing field wiring and probes can be retained.',
    attachments: [{ name: 'Existing_Rack_Photos.pdf', pages: 6 }],
    summary: 'Obsoletion-driven migration enquiry — replacement path for a discontinued monitoring card across two units, wiring reuse to be confirmed.',
    fields: [
      { group: 'RFQ', k: 'Opp type', v: 'Upgrade', conf: 91, ev: 'Obsoletion migration — discontinuation of the installed card' },
      { group: 'RFQ', k: 'Scope', v: '2 units — card migration, wiring reuse to be assessed', conf: 84, ev: 'Email body' },
      { group: 'Known Project', k: 'Overhaul window', v: 'Next planned overhaul', conf: 72, ev: 'Email body — no date given' },
    ],
    missingPool: [
      'Planned overhaul dates for both units',
      'Current firmware and rack revision',
      'Are the installed probes within calibration?',
    ],
    next: ['Confirm the migration path against the install base', 'Quote the upgrade with a wiring-reuse assessment'],
  },
  {
    key: 'gem-bid',
    subject: 'GeM bid — pre-bid clarification on vibration monitoring scope',
    route: 'Project', oppType: 'Project', urgency: 'Urgent', refPrefix: 'GEM', source: 'GeM / tender portal',
    bu: 'Energy', segment: 'Thermal', product: 'ModAE', suggestedOwner: 'LJS',
    body: 'Sir,\n\nWith reference to the captioned bid, kindly confirm compliance to the technical specification and submit the pre-bid clarification in the prescribed format before the closing date.\n\nBid documents are available on the portal.',
    attachments: [{ name: 'Bid_Document.pdf', pages: 88 }, { name: 'Prebid_Format.docx', pages: 2 }],
    summary: 'Tender-portal bid with a pre-bid clarification window — compliance statement and the prescribed clarification format are due before the closing date.',
    fields: [
      { group: 'RFQ', k: 'Opp type', v: 'Project', conf: 94, ev: 'Tender bid document on the tender portal' },
      { group: 'RFQ', k: 'Submission mode', v: 'Portal upload, prescribed pre-bid format', conf: 90, ev: 'Bid instructions' },
      { group: 'Known Project', k: 'Bid closing', v: 'Per the portal timetable', conf: 68, ev: 'Not restated in the mail' },
    ],
    missingPool: [
      'Bid closing date and pre-bid cut-off',
      'EMD / bid security requirement',
      'Deviation sheet — is any deviation permitted?',
    ],
    next: ['Confirm the bid calendar from the portal', 'Prepare the compliance statement', 'Decide bid / no-bid'],
  },
  {
    key: 'amc-renewal',
    subject: 'Annual maintenance contract renewal — vibration monitoring system',
    route: 'Service', oppType: 'Service', urgency: 'Normal', refPrefix: 'AMC', source: 'Existing Green customer',
    bu: 'Services', segment: 'Thermal', product: 'ModAE', suggestedOwner: 'RS',
    body: 'Dear Sir,\n\nOur AMC for the vibration monitoring system is due for renewal. Please quote for a two-year comprehensive contract covering preventive visits, calibration and breakdown support.\n\nKindly confirm the response time you can commit for a breakdown call.',
    attachments: [{ name: 'Previous_AMC_Scope.pdf', pages: 5 }],
    summary: 'AMC renewal for an installed vibration monitoring system — two-year comprehensive scope with preventive visits, calibration and breakdown support.',
    fields: [
      { group: 'RFQ', k: 'Opp type', v: 'Service', conf: 95, ev: 'AMC renewal of the existing contract' },
      { group: 'RFQ', k: 'Scope', v: '2-year comprehensive — preventive, calibration, breakdown', conf: 92, ev: 'Email body' },
      { group: 'Known Project', k: 'Previous contract', v: 'Scope attached', conf: 89, ev: 'Attachment' },
    ],
    missingPool: [
      'Number of preventive visits per year expected',
      'Committed breakdown response time',
      'Are spares consumption and travel in scope or at actuals?',
    ],
    next: ['Price the AMC against the previous scope', 'Confirm the response-time commitment'],
  },
  {
    key: 'cms-upgrade',
    subject: 'Condition monitoring upgrade — enquiry for online CMS',
    route: 'Project', oppType: 'Upgrade', urgency: 'Normal', refPrefix: 'CMS', source: 'Website enquiry',
    bu: 'Energy', segment: 'Industrial', product: 'B&K', suggestedOwner: 'RS',
    body: 'Hello,\n\nWe currently do route-based vibration data collection and want to move critical machines to online condition monitoring. Roughly 18 machines — fans, pumps and a compressor train.\n\nPlease share an indicative budgetary offer and a typical architecture.',
    attachments: [],
    summary: 'Move from route-based collection to online condition monitoring on ~18 critical machines — budgetary offer and reference architecture requested.',
    fields: [
      { group: 'RFQ', k: 'Opp type', v: 'Upgrade', conf: 90, ev: 'Online CMS — move from route-based to online monitoring' },
      { group: 'RFQ', k: 'Machine count', v: '~18 machines — fans, pumps, compressor train', conf: 86, ev: 'Email body' },
      { group: 'RFQ', k: 'Offer type', v: 'Budgetary', conf: 93, ev: 'Indicative offer requested' },
    ],
    missingPool: [
      'Machine list with speeds, ratings and bearing types',
      'Preferred sensor mounting — stud, adhesive or magnetic?',
      'Network availability at the machine locations',
    ],
    next: ['Issue a budgetary offer with the reference architecture', 'Request the machine list for a firm proposal'],
  },
  {
    key: 'commissioning-spares',
    subject: 'Commissioning spares and mandatory spares list',
    route: 'Spares', oppType: 'Spares', urgency: 'Urgent', refPrefix: 'CSP', source: 'OEM referral',
    bu: 'Energy', segment: 'Hydro', product: 'ModAE', suggestedOwner: 'RS',
    body: 'Dear Sir,\n\nPlease quote for the commissioning spares and the two-year mandatory spares list for the monitoring system supplied under the ongoing project.\n\nMaterial is required at site before the commissioning window opens.',
    attachments: [{ name: 'Mandatory_Spares_List.xlsx', pages: 2 }],
    summary: 'Commissioning plus two-year mandatory spares for a monitoring system already supplied — site delivery needed before the commissioning window.',
    fields: [
      { group: 'RFQ', k: 'Opp type', v: 'Spares', conf: 94, ev: 'Commissioning + mandatory spares list attached' },
      { group: 'RFQ', k: 'Coverage', v: '2-year mandatory spares', conf: 91, ev: 'Attachment header' },
      { group: 'Known Project', k: 'Linked supply', v: 'Monitoring system supplied under the ongoing project', conf: 87, ev: 'Email body' },
    ],
    missingPool: [
      'Site delivery address and commissioning window dates',
      'Which project order is this spares list against?',
      'Packing and preservation requirement for site storage',
    ],
    next: ['Link the enquiry to the parent project order', 'Quote against the attached spares list'],
  },
  {
    key: 'air-gap-sensors',
    subject: 'Replacement of air gap sensors on generator',
    route: 'Spares', oppType: 'Spares', urgency: 'Normal', refPrefix: 'AGS', source: 'Phone call',
    bu: 'Energy', segment: 'Hydro', product: 'ModAE', suggestedOwner: 'RS',
    body: 'Dear Sir,\n\nTwo of the air gap sensors on Unit 1 are reading erratically after the last outage. Please quote for replacement sensors with cables, and advise whether recalibration can be done in situ.\n\nUnit 1 is currently on bar.',
    attachments: [{ name: 'Trend_Screenshots.pdf', pages: 4 }],
    summary: 'Two air gap sensors reading erratically after an outage — replacement sensors with cables requested, in-situ recalibration to be advised.',
    fields: [
      { group: 'RFQ', k: 'Opp type', v: 'Spares', conf: 93, ev: 'Sensor replacement requested for two air gap sensors' },
      { group: 'RFQ', k: 'Scope', v: '2 air gap sensors + cables, recalibration advice', conf: 90, ev: 'Email body' },
      { group: 'Known Project', k: 'Symptom', v: 'Erratic readings since the last outage', conf: 82, ev: 'Trend screenshots' },
    ],
    missingPool: [
      'Existing sensor part number and installed length',
      'Machine make and rotor diameter for sensor selection',
      'Is site access available while Unit 1 is on bar?',
    ],
    next: ['Identify the installed sensor from the trend data', 'Quote the replacement with a recalibration option'],
  },
]

// Step-1 choices for the simulate dialog: only the opportunity types that have
// at least one enquiry shape, in the client's canonical Field List order.
export const SIMULATED_OPP_TYPES = OPP_TYPES.filter(t => INQUIRY_TEMPLATES.some(tpl => tpl.oppType === t))

// ---------------------------------------------------------------- generation
const QUALITY_WEIGHTS = [['clean', 0.5], ['partial', 0.35], ['duplicate', 0.15]]

// Monotonic within the page session. Two clicks inside the same millisecond
// used to collide on 'LD-' + Date.now(), and the random button makes that easy
// to hit, so the counter — not the clock — guarantees uniqueness.
let idSeq = 0

const at = (list, i) => list[((i % list.length) + list.length) % list.length]
const pick = (list, rng) => at(list, Math.floor(rng() * list.length))
const between = (lo, hi, rng) => lo + Math.floor(rng() * (hi - lo + 1))

// Uniform random over eight templates still repeats a subject roughly every
// third click, which is the exact thing that made the old inbox look broken.
// Keeping a short memory of what was just used costs nothing and removes the
// visible repeat. Only the free-running path uses it — an explicit `variant`
// stays deterministic for the tests. The memory is kept per template pool
// (one per requested opp type, plus 'any'): freshPick caps the memory at
// pool-size − 1, so letting a filtered 1-template pool share the unfiltered
// pool's memory would truncate it to nothing.
const RECENT_CAP = 4
const recentTemplates = {}
const lastCustomer = {}

function freshPick(list, rng, keyOf, recent) {
  // Never remember so much that the pool empties — a 3-entry pool can only
  // exclude 2 before every choice is "recent" and the memory stops helping.
  const cap = Math.max(1, Math.min(RECENT_CAP, list.length - 1))
  const avoid = new Set(recent)
  const fresh = list.filter(item => !avoid.has(keyOf(item)))
  const chosen = pick(fresh.length ? fresh : list, rng)
  recent.push(keyOf(chosen))
  while (recent.length > cap) recent.shift()
  return chosen
}

function pickQuality(rng) {
  let r = rng()
  for (const [name, weight] of QUALITY_WEIGHTS) {
    if (r < weight) return name
    r -= weight
  }
  return 'clean'
}

const fieldValue = (fields, re) => (fields || []).find(f => re.test(String(f.k || '')))?.v || ''

// One simulated inbound enquiry.
//
// `customerStatus` is the gate under test and is never randomised; the same
// goes for `options.oppType` when the operator picked one (null/unknown means
// any). `options` also carries existingLeads (so the duplicate variant can
// chase something real), config (for routeOwner), and variant/quality/rng/seq
// so a test can pin one exact permutation.
export function simulatedLead(customerStatus = 'Green', now = new Date(), options = {}) {
  const {
    existingLeads = [],
    config = {},
    oppType = null,
    variant = null,
    quality: forcedQuality = null,
    rng = Math.random,
    seq = null,
  } = options

  const scenario = SIMULATED_CUSTOMER_SCENARIOS.find(item => item.status === customerStatus)
    || SIMULATED_CUSTOMER_SCENARIOS[0]
  const status = scenario.status
  const ts = new Date(now).toISOString()
  // An opp type with no template (or an unknown value) falls back to the full
  // pool — "any" — rather than crashing on an empty list.
  const typedPool = oppType ? INQUIRY_TEMPLATES.filter(t => t.oppType === oppType) : []
  const templatePool = typedPool.length ? typedPool : INQUIRY_TEMPLATES
  const poolKey = typedPool.length ? oppType : 'any'
  const template = variant == null
    ? freshPick(templatePool, rng, t => t.key, recentTemplates[poolKey] || (recentTemplates[poolKey] = []))
    : at(INQUIRY_TEMPLATES, variant)
  const pool = SIMULATED_CUSTOMERS[status]
  const recentForClass = lastCustomer[status] || (lastCustomer[status] = [])
  const customer = variant == null
    ? freshPick(pool, rng, c => c.name, recentForClass)
    : at(pool, variant)

  // A chaser only makes sense against something already in the mailbox.
  // A chaser is only a duplicate if it can reuse the buyer's reference, which
  // is what findDuplicates keys on. Leads carrying no reference (seed's LD-204
  // has `ref: ''`) used to be chaseable: `ref = chased.ref || … || ref` then
  // fell through to a freshly minted reference, and the result was a lead
  // labelled duplicateRisk:'High' that nothing could match to anything.
  // When an opp type was picked, only chase leads on the same route — a chaser
  // inherits the chased lead's route and facts (below), and a "Spares" click
  // that produced a Project chaser would be the dialog lying to the operator.
  const wantedRoute = typedPool.length ? routeForType(oppType) : null
  const chaseable = (existingLeads || [])
    .filter(l => l && l.id && l.subject && l.status !== 'Dropped' && (l.ref || l.rfqNumber))
    .filter(l => !wantedRoute || l.route === wantedRoute)
  let quality = forcedQuality || pickQuality(rng)
  if (quality === 'duplicate' && !chaseable.length) quality = 'partial'

  const id = `LD-SIM-${new Date(now).getTime().toString(36)}-${seq == null ? ++idSeq : seq}`
  const yy = ts.slice(2, 4)

  let ref = `${template.refPrefix}/${yy}/${between(1000, 9999, rng)}`
  let subject = template.subject
  let from = `${customer.email}@${customer.domain}`
  let sender = `${customer.contact.split(' — ')[0]} — ${customer.name}`
  let sellTo = customer.name
  let contact = customer.contact
  let chased = null

  if (quality === 'duplicate') {
    // Same buyer reference and sender as a lead already in the inbox — exactly
    // what findDuplicates keys on, so the detector has something real to find.
    chased = pick(chaseable, rng)
    ref = chased.ref || chased.rfqNumber || ref
    // The chased lead may itself be a chaser (seedAiLeads has one) — strip its
    // prefix rather than stacking "Fwd: Reminder: …".
    subject = `${rng() < 0.5 ? 'Reminder:' : 'Fwd:'} ${String(chased.subject).replace(/^\s*(re|fwd|fw|reminder)\s*:\s*/i, '')}`
    from = chased.from || from
    sender = chased.sender || sender
    sellTo = fieldValue(chased.ai?.fields, /sell-to|customer/i) || sellTo
    contact = fieldValue(chased.ai?.fields, /contact/i) || contact
  }

  // A chaser carries no new scope (seed's LD-207 is the model), so the route
  // and the extracted RFQ facts come from the lead being chased — quoting a
  // spares chaser as a Project would be the generator contradicting itself.
  const route = chased ? (chased.route || template.route) : template.route
  const urgency = chased ? (chased.urgency || template.urgency) : template.urgency

  const baseFields = [
    { group: 'Customer', k: 'Sell-to customer', v: sellTo, conf: 97, ev: 'Sender domain + signature block' },
    { group: 'Customer', k: 'Category', v: customer.category, conf: 93, ev: 'Account type on record' },
    { group: 'Customer', k: 'Location', v: customer.location, conf: 96, ev: 'Email signature' },
    { group: 'Customer', k: 'Contact person', v: contact, conf: 95, ev: 'Email signature' },
    ...(chased ? [
      { group: 'RFQ', k: 'Buyer reference', v: ref, conf: 99, ev: 'Quoted in the first line' },
      { group: 'RFQ', k: 'Opp type', v: route, conf: 95, ev: 'Refers to the earlier item list' },
    ] : [
      { group: 'Customer', k: 'BU / Segment', v: `${template.bu} / ${template.segment}`, conf: 92, ev: 'Plant type and requested scope' },
      { group: 'Customer', k: 'Product', v: template.product, conf: 94, ev: 'Email body' },
      ...template.fields,
    ]),
  ]

  // A thin mail leaves the tail of the extraction below the accept threshold.
  const pendingCount = quality === 'partial' ? between(2, 3, rng) : 0
  const fields = baseFields.map((f, i) => {
    const pending = i >= baseFields.length - pendingCount
    if (!pending) return { ...f, state: 'accepted' }
    return {
      ...f,
      state: 'pending',
      conf: Math.min(f.conf, between(62, 85, rng)),
      note: 'Below the accept threshold — confirm before registration.',
    }
  })

  const missing = quality === 'partial'
    ? template.missingPool.slice(0, between(1, Math.min(3, template.missingPool.length), rng))
    : []
  const completeness = quality === 'partial'
    ? Math.max(78, 92 - missing.length * 4 - pendingCount * 2)
    // A chaser restates a complete enquiry, so it reads high but not perfect.
    : chased ? 94 : 100

  const duplicates = chased
    ? findDuplicates({ id, ref, from, subject, status: 'New' }, existingLeads)
      .map(d => ({ leadId: d.leadId, confidence: d.confidence, note: d.note }))
    : []
  if (chased && !duplicates.length) {
    duplicates.push({ leadId: chased.id, confidence: 0.9, note: `Chaser on the same enquiry (${chased.subject})` })
  }

  const body = chased
    ? `Dear Sir,\n\nKindly refer our ${ref} sent earlier. We have not received your offer — request you to expedite, as our window is fixed.\n\nThe scope is unchanged from the earlier mail.\n\nBest regards\n${sender}`
    : `${template.body}\n\n${contact}\n${customer.name}\n${customer.location}`

  const owner = routeOwner(customer.region, config, template.suggestedOwner || 'RS')

  return {
    id, ts, channel: 'Email', mailbox: true,
    // A Green customer is the one class that reaches us directly; the rest of
    // the simulated classes arrive through the enquiry channels.
    source: status === 'Green' ? 'Existing Green customer' : template.source,
    from, sender, subject, ref, body,
    attachments: chased ? (chased.attachments || []) : (template.attachments || []),
    status: 'New', customerStatus: status, customerClassifiedAt: ts,
    verification: ['Blue', 'Amber'].includes(status) ? { requestedAt: ts, requestedFor: status } : {},
    redFlag: status === 'Red',
    route,
    oppType: chased ? (chased.oppType || null) : template.oppType,
    urgency,
    duplicateRisk: chased ? 'High' : 'Low',
    region: customer.region,
    suggestedOwner: owner, assignedOwner: owner,
    completeness,
    // Marks the row as generated, so it can be purged without a full
    // "Reset demo data" — see withoutSimulated below.
    simulated: true, simulatedQuality: quality, simulatedTemplate: template.key,
    ai: {
      summary: chased
        ? `Chaser on ${ref} — the same enquiry is already in the inbox as ${chased.id}. No new scope.`
        : template.summary,
      fields,
      missing,
      duplicates,
      next: [
        ...(chased ? [`Confirm against ${chased.id} and drop this one`] : []),
        ...(missing.length ? ['Send the clarification request'] : []),
        ...(chased ? ['Reply on the existing opportunity, not a new one'] : template.next),
        ...(status === 'Green' ? [] : ['Complete the customer-classification gate']),
      ],
      route,
    },
  }
}

// ------------------------------------------------------------------- purging
// Drop generated rows and leave real ones alone. A simulated lead that reached
// 'Converted' is deliberately kept: an opportunity hangs off it, and removing
// the lead would orphan that opportunity.
export const isPurgeableSimulated = lead => lead?.simulated === true && lead.status !== 'Converted'

export function withoutSimulated(leads = []) {
  return (leads || []).filter(l => !isPurgeableSimulated(l))
}

export function simulatedCount(...lists) {
  return lists.reduce((n, list) => n + (list || []).filter(isPurgeableSimulated).length, 0)
}
