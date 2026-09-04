// The customer-facing proposal document: what sections it has, what each one
// says by default, and the company identity printed on it.
//
// Everything here is a pure function of the saved proposal + opportunity. The
// drafting checklist (PropBuilder) and the printed document (PrintDoc) both
// import PROP_SECTIONS from here so the two can never drift apart.
import { productLabel } from './utils.js'
import { routeForType } from './seed.js'
import { MODAE_STANDARD_TERMS } from './tenderParse.js'
import { MODAE_BRAND } from './branding/modae.js'

export const MODAE_COMPANY = {
  name: MODAE_BRAND.letterhead.legalName,
  tagline: MODAE_BRAND.letterhead.tagline,
  officialAddress: MODAE_BRAND.letterhead.officialAddress,
  salesOffice: MODAE_BRAND.letterhead.salesOffice,
  registeredOffice: MODAE_BRAND.letterhead.registeredOffice,
  addr: [MODAE_BRAND.letterhead.officialAddress],
  gstin: MODAE_BRAND.letterhead.gstin,
  cin: MODAE_BRAND.letterhead.cin,
  email: MODAE_BRAND.contact.email,
  phone: MODAE_BRAND.contact.phone_display,
  web: 'mod-ae.com',
  footer: `${MODAE_BRAND.letterhead.legalName} | ${MODAE_BRAND.letterhead.officialAddress} | CIN: ${MODAE_BRAND.letterhead.cin} | GST: ${MODAE_BRAND.letterhead.gstin}`,
}

export const PROP_SECTIONS = [
  'Cover', 'Executive summary', 'Scope of supply', 'Line items / BOQ',
  'Commercial summary', 'Delivery', 'Assumptions', 'Exclusions', 'Deviations',
  'Terms', 'Validity', 'Attachments',
]

// Rule-based commercial-term suggestions (AI-labelled in the UI): payment by
// customer class, delivery by route, standard validity and warranty.
export function recommendTerms(opp, config = {}) {
  const payment = config.classRules?.[opp.customerStatus]
    || (opp.customerStatus === 'Green' ? '30 days credit from invoice'
    : opp.customerStatus === 'Blue' ? '50% advance, balance on delivery'
    : opp.customerStatus === 'Amber' ? '100% advance before dispatch'
    : '100% prepayment only')
  const delivery = opp.route === 'Spares' ? '6-8 weeks ex-works'
    : opp.route === 'Service' ? 'Engineer mobilisation within 2 weeks of PO'
    : '16-20 weeks per milestone schedule'
  return [
    { term: 'Payment', ourResponse: payment },
    { term: 'Delivery', ourResponse: delivery },
    { term: 'Validity', ourResponse: '30 days from proposal date' },
    { term: 'Warranty', ourResponse: '18 months from supply' },
  ]
}

// The numbered Terms & Conditions block every sample proposal carries at the
// foot of its pricing sheet — "1. Proposal Validity: …" through "10. Other
// Terms & Conditions: As Per ModAE India Standard Terms & Conditions Of Sale".
//
// Deliberately NOT the same thing as `recommendTerms` above. That one seeds
// `p.terms`, the clause-by-clause compliance grid whose `status` field drives
// the deviation approvals in gates.js; this one is prose we print. The samples
// keep the two apart and so do we — a PBG clause is something we state, not
// something an approver has to mark Comply or Deviation.
const DOC_TERM_TEXT = {
  validity: p => `Our proposal is valid for ${p.validityDays ?? 30} days from the date of issue.`,
  fxProject: 'Exchange rate variations beyond 1% shall be to the customer’s account.',
  // Clause 1 of the spares sample runs three sentences: the validity, the
  // escalation warning, and the rate the offer was built on.
  fxEscalation: 'Any price escalation before delivery due to exchange-rate variations will be charged to your account.',
  fxSpares: p => p.fxBasis
    ? `Proposal considered @ ₹${p.fxBasis} per Euro as on the date of this offer.`
    : 'Prices are based on the exchange rate prevailing on the date of this offer.',
  warrantyProject: '36 months from the date of supply or 24 months from the date of commissioning, whichever is earlier.',
  warrantySpares: '12 months from the date of supply.',
  warrantyServices: '3 months from the date of completion of the services.',
  priceBasis: 'Ex Works, Bangalore. Applicable taxes and duties are extra.',
  freightCustomer: 'Freight and insurance are at the customer’s cost.',
  deliveryProject: '30-32 weeks from the date of purchase order and after receipt of manufacturing clearance or drawing/document approval, whichever is later.',
  deliverySpares: '16 weeks from receipt of the purchase order and advance payment.',
  deliveryServices: 'Engineer mobilisation within 2 weeks of the purchase order, subject to site readiness.',
  siteServices: 'Site services, if required, are additional and charged at the ModAE standard rate schedule.',
  paymentProject: '50% advance along with the purchase order and the balance 50% on material readiness.',
  paymentSpares: '50% advance with the purchase order; balance 50% plus applicable taxes on material readiness.',
  paymentServices: '100% within 45 days from the date of completion of the services.',
  pbg: 'A performance bank guarantee equivalent to 10% of the purchase order value, valid for 36 months.',
  ld: 'Liquidated damages at 0.5% per week of delay, up to a maximum of 5% of the undelivered portion.',
  makeModel: 'Make, model and part numbers will be confirmed during detail engineering.',
  standardTerms: 'Other terms and conditions are as per ModAE India’s standard terms and conditions of sale.',
  // The services samples carry five clauses the goods proposals do not.
  deputation: 'Advance intimation of one month is required for site deputation.',
  standby: 'The rates quoted cover standby and work hours on site.',
  hseHours: 'Maximum work and travel hours shall not exceed 12 hours in any day, for health and safety reasons.',
  hseWithdraw: 'ModAE reserves the right to withdraw its personnel in case of unsafe working conditions, without notice.',
  gstExclusive: 'Quoted prices are exclusive of GST.',
}

const T = (label, text) => ({ label, text })
const resolve = (v, p) => (typeof v === 'function' ? v(p) : v)

// Order follows the samples: validity, warranty, price basis, freight,
// delivery, site services, payment, then the route-specific tail.
export function defaultDocTerms(p, opp) {
  const route = docRoute(p, opp)
  const D = DOC_TERM_TEXT
  const rows = route === 'Project' ? [
    T('Proposal Validity', `${resolve(D.validity, p)} ${D.fxProject}`),
    T('Warranty', D.warrantyProject),
     T('Price Basis & Incoterms', D.priceBasis),
    T('Freight & Insurance', D.freightCustomer),
    T('Delivery Period', D.deliveryProject),
    T('Payment Terms', D.paymentProject),
    T('Performance Bank Guarantee', D.pbg),
    T('Liquidated Damages', D.ld),
    T('Other Terms & Conditions', D.standardTerms),
    T('Make, Model & Part Numbers', D.makeModel),
  ] : route === 'Services' ? [
    T('Proposal Validity', resolve(D.validity, p)),
    T('Warranty', D.warrantyServices),
    T('Price Basis', D.gstExclusive),
    T('Delivery Period', D.deliveryServices),
    T('Site Deputation', D.deputation),
    T('Working Hours', `${D.standby} ${D.hseHours}`),
    T('Health & Safety', D.hseWithdraw),
    T('Payment Terms', D.paymentServices),
    T('Other Terms & Conditions', D.standardTerms),
  ] : [
    T('Proposal Validity', `${resolve(D.validity, p)} ${D.fxEscalation} ${resolve(D.fxSpares, p)}`),
    T('Warranty', D.warrantySpares),
     T('Price Basis & Incoterms', D.priceBasis),
    T('Freight & Insurance', D.freightCustomer),
    T('Delivery Period', D.deliverySpares),
    T('Site Services', D.siteServices),
    T('Payment Terms', D.paymentSpares),
    T('Other Terms & Conditions', D.standardTerms),
  ]
  return rows
}

// The heading the samples put above that block.
export const docTermsHeading = (p, opp) =>
  (docRoute(p, opp) === 'Project'
    ? 'Project Specific Special Commercial Terms & Conditions:'
    : 'Terms & Conditions:')

// ------------------------------------------------------------------ helpers

// Same quantity rule as the Priced BoQ sheet.
export const lineQty = (l, units) => (l.qtyPerUnit || 0) * (units || 1) + (l.common || 0) + (l.spares || 0)

const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

const under1000 = n => {
  if (n < 20) return ONES[n]
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '')
  return ONES[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' ' + under1000(n % 100) : '')
}

// Indian numbering — crore / lakh / thousand, as Indian invoices are read.
export function amountInWords(n) {
  const v = Math.round(Math.abs(+n || 0))
  if (!v) return 'Rupees zero only'
  const parts = []
  const push = (count, label) => { if (count) parts.push(`${under1000(count)} ${label}`) }
  push(Math.floor(v / 10000000), 'crore')
  push(Math.floor((v % 10000000) / 100000), 'lakh')
  push(Math.floor((v % 100000) / 1000), 'thousand')
  const rest = v % 1000
  if (rest) parts.push(under1000(rest))
  const s = parts.join(' ')
  return 'Rupees ' + s.charAt(0).toUpperCase() + s.slice(1) + ' only'
}

export function addDays(isoDate, days) {
  const d = new Date((isoDate || new Date().toISOString().slice(0, 10)) + 'T00:00:00')
  d.setDate(d.getDate() + (+days || 0))
  return d.toISOString().slice(0, 10)
}

// The ModAE standard position behind a compliance row, for the terms table.
export const standardFor = key => MODAE_STANDARD_TERMS.find(s => s.key === key)?.standard || ''

// The compliance verdicts in MODAE_STANDARD_TERMS are written for the internal
// reviewer — "needs approval", "confirm stock with supplier", "to be confirmed
// by engineering before submission" are notes to ourselves, not things to say
// to a customer. The workbench keeps that raw text so approvers still see the
// flag; the printed document substitutes the wording below.
export const CUSTOMER_RESPONSE = {
  payment: 'We offer 30 days net from the date of invoice.',
  delivery: 'We will confirm the manufacturer’s stock position on receipt of your intimation and commit to the earliest achievable date in writing.',
  ld: 'We offer liquidated damages at 0.5% per week of delay, capped at 5% of the order value.',
  compat: 'The offered models are confirmed by our engineering as form-, fit- and function-compatible with the installed system, and are supplied with manufacturer test certificates.',
}

// `pointer` adds the cross-reference for the compliance table; the Deviations
// section itself passes false, since pointing at itself reads as a loop.
export function customerResponse(text, key, pointer = false) {
  const base = CUSTOMER_RESPONSE[key] || String(text || '')
  return pointer ? `${base} Our reasoning and the alternative we propose are set out in the Deviations section.` : base
}

// ------------------------------------------------------- default section text

// A covering letter, not a summary: what we received, what we understand, what
// is enclosed, the commercial headline, and how we stand on the terms.
// Worded from the client's own sample cover letters (doc/Further Inputs). The
// previous draft narrated an eleven-section document — executive summary, scope
// of supply, assumptions, exclusions, deviations, clause-by-clause compliance —
// which no real proposal contains, so it promised the customer pages that were
// never going to arrive.
export function DEFAULT_LETTER_BODY(p, opp) {
  const route = docRoute(p, opp)
  const rfq = (p.rfqNumber || '').trim()
  const ref = rfq ? `your RFQ ${rfq}` : 'your RFQ'
  const what = route === 'Services' ? 'offer for the services called for'
    : route === 'Spares' ? 'techno-commercial offer for the spares called for'
      : 'techno-commercial offer'
  return [
    `With reference to ${ref}, we are pleased to submit our ${what} for your perusal & approval. `
      + `We trust that it aligns with your specifications and requirements.`,

    `We request for your kind consideration to our enclosed offer & are open for you to provide us `
      + `with any feedback that would help us serve you better.`,

    `It is our endeavour to work very closely with an esteemed organization like yours and we look `
      + `forward to a long & mutually rewarding relationship.`,

    `Please let us know in case you need any other information or details.`,
  ].join('\n\n')
}

// How we describe the customer's situation back to them, per route.
const UNDERSTANDING = {
  Spares: oem =>
    `OUR UNDERSTANDING\nThese are replacement and spare sensing elements for an operating machine. What matters `
    + `is not the sensor in isolation but that it drops into the existing signal chain without change to the `
    + `monitor, the cabling or the alarm settings — same sensitivity, same connector, same electrical `
    + `characteristics. We have selected each model on that basis rather than on nearest-equivalent specification.`,

  Services: () =>
    `OUR UNDERSTANDING\nThis is work to be carried out on plant that is in service, so the constraint is the `
    + `outage window rather than the task itself. We have scoped the visit around a single mobilisation — `
    + `measurement, diagnosis and the written finding — so that the machine is released once and not held `
    + `pending a second trip. Site access, permits and the availability of the machine remain with the purchaser.`,

  Project: oem =>
    `OUR UNDERSTANDING\nThis is a system supply, not a parts list: the value is in the instrumentation, the `
    + `monitoring rack and the signal routing working as one chain against the tendered tag schedule. `
    + `We have engineered the offer from the signal list upwards${oem ? `, on ${oem} hardware,` : ','} so that `
    + `channel counts, rack capacity and spare provision are consistent with each other and with the specification.`,
}

export function defaultExecSummary(p, opp) {
  const bom = p.bom || []
  const nos = bom.reduce((s, l) => s + lineQty(l, p.units), 0)
  const cats = [...new Set(bom.map(l => l.itemCategory).filter(Boolean))]
  const devs = (p.terms || []).filter(t => t.status === 'Deviation')
  const oem = productLabel(opp?.product) === 'Various' ? '' : productLabel(opp?.product)
  const buyer = opp?.sellTo || 'The customer'
  const project = p.project || opp?.oppName || 'the referenced scope'
  // buildProposal already appends the station to `project` — don't say it twice.
  const siteRaw = [opp?.eucName, opp?.eucLocation].filter(Boolean).join(', ')
  const site = siteRaw && !project.includes(opp?.eucName) ? siteRaw : ''
  const days = p.validityDays ?? 30
  return [
    `THE REQUIREMENT\n${buyer} has invited offers vide ${p.rfqNumber || 'the referenced enquiry'} for `
      + `${project}${site ? ` at ${site}` : ''}. The enquiry covers `
      + `${bom.length} line item${bom.length === 1 ? '' : 's'} of vibration measurement hardware`
      + `${oem ? ` to be used with the ${oem} monitoring system already in service` : ''}.`,

    // "Our understanding" is the one paragraph that cannot be route-neutral: a
    // spares refill, a site service call and a greenfield package are understood
    // in completely different terms. It used to describe spares on every
    // proposal, including projects.
    UNDERSTANDING[docRoute(p, opp)](oem),

    `WHAT WE OFFER\n${MODAE_COMPANY.name} offers ${bom.length} item${bom.length === 1 ? '' : 's'}`
      + `${nos ? `, ${nos} nos in total` : ''}${cats.length ? ` — ${cats.join(', ').toLowerCase()}` : ''}. `
      + `Each item is quoted against the specification tendered, supplied with manufacturer test certificates, and `
      + `packed for transport to the consignee named in your enquiry. The detailed scope, with the technical `
      + `specification of each model, follows in the Scope of Supply.`,

    `COMMERCIAL POSITION\nPrices are quoted firm in Indian Rupees, on the basis set out in the Commercial Summary, `
      + `and hold for ${days} days from the date of this offer. Packing, forwarding and transit insurance to the `
      + `named consignee are included; GST is extra at actuals.`,

    devs.length === 0
      ? `COMPLIANCE\nWe confirm full compliance with the technical specification and with every commercial term of `
        + `your enquiry. No deviations are taken.`
      : `COMPLIANCE\nOur offer is technically compliant in full. ${devs.length} commercial `
        + `deviation${devs.length === 1 ? ' is' : 's are'} declared — ${devs.map(d => d.term).join(', ')} — each `
        + `explained, with its impact and our proposed alternative, in the Deviations section. All remaining clauses `
        + `of your enquiry are accepted as written.`,
  ].join('\n\n')
}

// Pull the specification out of a tender line description. Tenders write specs
// as comma-separated "key = value" fragments ("Sensitivity =100 mV/g ± 5%,
// Output = top exit MIL-C-5015-style connector, ..."), so split on commas and
// keep the fragments that actually carry a value.
export function specBullets(desc) {
  const text = String(desc || '').replace(/\s*P\/N\s*[:.]?\s*[^,]*$/i, '').trim()
  const head = text.split(/[=,(]/)[0].trim()
  return text
    .split(/,(?![^(]*\))/)
    .map(s => s.replace(/^[\s.;-]+|[\s.;-]+$/g, ''))
    // The first fragment usually repeats the item name before the first spec
    // ("Accelerometer(general purpose) = Sensitivity =100 mV/g") — drop it.
    .map(s => {
      const eq = s.indexOf('=')
      if (eq < 0 || !head) return s
      const lhs = s.slice(0, eq).trim()
      return lhs.toLowerCase().startsWith(head.toLowerCase()) ? s.slice(eq + 1).trim() : s
    })
    .filter(s => s && s.toLowerCase() !== head.toLowerCase() && /\d|=/.test(s))
    .map(s => s.replace(/\s*=\s*/g, ': ').replace(/\s{2,}/g, ' '))
}

// Scope of supply — one block per BoQ line, in tender order, each carrying the
// offered model, the customer's own item code, and the tendered specification
// broken out so a reviewer can tick it off line by line.
export function defaultScope(p) {
  return (p.bom || []).map(l => ({
    category: l.itemCategory || 'Item',
    pn: l.pn,
    custRef: l.custRef,
    qty: lineQty(l, p.units),
    uom: l.uom || 'EA',
    desc: l.desc,
    specs: specBullets(l.desc),
  }))
}

export const DEFAULT_SCOPE_INCLUDES = [
  'Manufacturer’s test / calibration certificate for every item supplied',
  'Technical datasheet and installation instruction for each offered model',
  'Individual protective packing suitable for road transport, marked with the purchase order and item number',
  'Packing list and delivery challan with an e-way bill as required under GST rules',
  'Transit insurance up to the consignee’s stores',
]

// Delivery milestones, reckoned from a technically and commercially clear PO
// (T0). Timings come from the delivery compliance row where the tender states
// them; otherwise the ModAE standard import lead time applies.
export function defaultDeliveryMilestones(p) {
  const d = (p.terms || []).find(t => t.key === 'delivery' || t.term === 'Delivery Period')
  const ask = d ? `${d.customerAsk} ${d.ourResponse}` : ''
  const days = [...ask.matchAll(/(\d{1,3})\s*days/gi)].map(m => parseInt(m[1], 10))
  const sample = days[0] || 0
  const bulk = days[1] || days[0] || 0
  const hasSample = /sample/i.test(ask)
  return [
    { milestone: 'Receipt of technically and commercially clear purchase order', timeline: 'T0' },
    ...(hasSample ? [
      { milestone: 'Submission of sample for approval', timeline: sample ? `T0 + ${sample} days` : 'T0 + 30 days' },
      { milestone: 'Sample approval by the purchaser', timeline: 'To purchaser’s account' },
      { milestone: 'Despatch of bulk quantity ex-works', timeline: bulk ? `Approval + ${bulk} days` : 'Approval + 30 days' },
    ] : [
      { milestone: 'Despatch ex-works', timeline: 'T0 + 10 to 12 weeks' },
    ]),
    { milestone: 'Delivery at the consignee’s stores, freight paid', timeline: 'Despatch + 7 to 10 days' },
  ]
}

export const DEFAULT_DELIVERY_NOTE =
  'Delivery is ex-works, on freight-paid basis to the consignee named in the order, and is reckoned from the date '
  + 'of a technically and commercially clear purchase order. Where the enquiry calls for sample approval before '
  + 'bulk supply, the bulk lead time runs from the date of written approval and not from the order date. '
  + 'Part despatches are offered where they help the site, and are invoiced pro rata.'

export const PRICE_BASIS = [
  ['Basis of supply', 'Ex-works, freight paid to the consignee named in the enquiry'],
  ['Packing & forwarding', 'Included in the quoted prices'],
  ['Freight', 'Included — despatched on freight-paid basis'],
  ['Transit insurance', 'Included — arranged by ModAE up to the consignee’s stores'],
  ['Currency', 'Indian Rupees (₹)'],
  ['Price firmness', 'Firm for the validity period of this offer'],
  ['Statutory levies', 'GST extra at actuals, as applicable on the date of invoice'],
]

export function defaultPaymentMilestones(p) {
  const t = (p.terms || []).find(x => x.key === 'payment')
  return [
    { stage: 'Along with purchase order', pct: 'As per the payment term accepted at award' },
    { stage: 'On despatch, against invoice and despatch documents', pct: 'Balance' },
    { stage: 'Credit period offered', pct: t?.ourResponse || '30 days from date of invoice' },
  ]
}

export const DEFAULT_COMMERCIAL_NOTE =
  'Prices are firm in Indian Rupees for the validity period of this offer, on the basis stated above. '
  + 'Packing and forwarding, and transit insurance to the named consignee, are included. '
  + 'Any statutory variation in duties, levies or taxes between the date of this offer and the date of despatch is to the buyer’s account. '
  + 'Prices are quoted for the quantities tendered; a material change in quantity may alter the unit price and would be re-quoted on request.'

export const DEFAULT_ASSUMPTIONS = [
  'Prices are based on the specifications and quantities stated in the enquiry; any change in specification, quantity or delivery location will require re-quotation.',
  'The offered models are dimensionally, functionally and electrically interchangeable with the installed OEM system; final compatibility is confirmed by ModAE engineering against the site tag list before despatch.',
  'The existing cabling, junction boxes, monitors and monitor configuration remain unchanged and are in serviceable condition; no re-ranging or re-configuration of the monitoring system is envisaged.',
  'Import duty, exchange rate and freight are as prevailing on the date of this offer; statutory variations are to the buyer’s account.',
  'The offered items are catalogue products of the manufacturer and are quoted subject to being unsold and available at the time of order.',
  'Manufacturer test certificates are supplied with each consignment; no third-party inspection or witness testing is included unless separately agreed.',
  'Order placement, sample approval and stores acceptance proceed without interruption from the buyer’s side; any hold on these stages extends the delivery schedule correspondingly.',
  'Site access, gate passes and security clearance for delivery vehicles are arranged by the purchaser.',
]

export const DEFAULT_EXCLUSIONS = [
  'GST and any other statutory levies — extra at actuals, as applicable on the date of invoice.',
  'Site installation, removal of existing sensors, cable routing, glanding, termination and loop checking.',
  'Civil, mechanical and electrical work, scaffolding, cranage and hot-work permits.',
  'Site commissioning, calibration against the installed monitoring system, and operator training.',
  'Third-party inspection, witness testing, and any inspection charges of an external agency.',
  'Any spares, consumables or special tools beyond those explicitly listed in the Scope of Supply.',
  'Machine shutdown, isolation, de-isolation and any production loss arising from the replacement work.',
  'Any item, service or documentation not explicitly listed in the Scope of Supply.',
]

export const DEFAULT_ATTACHMENTS = [
  'Manufacturer technical datasheets for each offered model',
  'Statement of technical compliance against the tendered specification',
  'GST registration certificate and PAN',
  'Any self-declarations called for by the enquiry',
]

export const DEFAULT_VALIDITY_NOTE =
  'Prices, delivery and commercial terms quoted above hold good for the validity period stated. Beyond that date the '
  + 'offer lapses and is open to revalidation on written request — revalidation is normally granted on the same terms, '
  + 'subject to exchange rate and manufacturer price movement at that time. This offer supersedes all previous '
  + 'quotations issued by us against the same enquiry. To place an order, kindly issue your purchase order in the name '
  + 'of ' + MODAE_COMPANY.name + ', quoting our reference above, together with a copy of this offer.'

// Why each deviation is taken, what it costs the buyer to insist, and what we
// propose instead. Keyed by the MODAE_STANDARD_TERMS key; anything without an
// entry falls back to a generic line rather than printing nothing.
export const DEVIATION_RATIONALE = {
  payment: {
    why: 'The offered items are imported against an irrevocable order placed on the manufacturer and paid for before they ship. Payment reckoned from receipt and installation at site, rather than from invoice, leaves that outlay outstanding for the whole of the shipping, inspection and installation cycle.',
    impact: 'Carrying the cost over that period has to be priced in, which raises the landed cost to you for no benefit on either side.',
    proposal: '30 days net from the date of invoice, or the tendered term against a bank guarantee for the payment amount — whichever suits your commercial process better.',
  },
  delivery: {
    why: 'These are imported sensing elements manufactured to order, not stock items. The standard cycle — order on the manufacturer, production, export clearance, sea or air freight, customs clearance — runs to 10 to 12 weeks.',
    impact: 'Committing to a shorter period without stock confirmation would put both of us at risk of a liquidated-damages claim on a date that was never achievable.',
    proposal: 'We will confirm the manufacturer’s stock position within one week of your intimation and commit to the shortest achievable date in writing; where stock exists we will meet the tendered schedule.',
  },
  ld: {
    why: 'The tendered cap sits above the level we can absorb on an imported supply order where the critical path — manufacture and shipping — is outside our control.',
    impact: 'A cap at the tendered level has to be provided for in the price, so you pay for a risk that rarely materialises.',
    proposal: '0.5% per week of delay on the delayed portion, capped at 5% of the order value, which is the accepted norm for imported instrumentation supply.',
  },
  sd: {
    why: 'A security deposit above the standard level ties up bank limits for the whole contract period on a supply-only order.',
    impact: 'The bank charges on the excess are a direct cost that ends up in the price.',
    proposal: 'A bank guarantee for 10% of the order value from a nationalised bank, valid for 12 months, in your prescribed format.',
  },
  warranty: {
    why: 'The manufacturer’s own warranty on these items runs to 18 months from supply; anything beyond that is uncovered by the OEM and would have to be self-insured.',
    impact: 'The excess period has to be provided for in the price without any corresponding OEM backing.',
    proposal: '12 months from installation or 18 months from receipt at your stores, whichever is earlier — the manufacturer’s full warranty, passed through to you.',
  },
}

export const GENERIC_RATIONALE = {
  why: 'This term sits outside the position ModAE is able to offer as standard on an imported supply order.',
  impact: 'Accepting it as written would have to be provided for in the quoted price.',
  proposal: 'We would welcome the opportunity to discuss a mutually workable alternative before award.',
}

export const MODAE_ABOUT = {
  intro: MODAE_BRAND.overview,
  capabilities: [
    `Solutions for ${MODAE_BRAND.sectors.join(', ')} and ${MODAE_BRAND.energy_segments.join(', ')} applications.`,
    'Turbine control, antisurge, overspeed protection and machinery monitoring systems for safety-critical operations.',
    'Asset health management, machinery diagnostics and industrial sensing for rotating equipment.',
    'Project engineering, installation, commissioning, lifecycle support and remote monitoring.',
  ],
  closing: MODAE_BRAND.vision,
}

// --------------------------------------------------------------- doc model

// Every section resolved for rendering. `??` throughout: nothing is written
// into a stored proposal until the user actually edits that field, so the
// auto-drafted text stays live as the BoQ changes and every proposal saved
// before this module existed still renders a complete document.
export function docModel(p, opp, ctx = {}) {
  const files = ctx.files || []
  const attachments = p.attachments ?? [...DEFAULT_ATTACHMENTS, ...files]
  const deviations = (p.terms || []).filter(t => t.status === 'Deviation').map(t => ({
    ...t,
    // Per-deviation reasoning: the stored override wins, else the standard
    // rationale for that term, else the generic line.
    rationale: { ...(DEVIATION_RATIONALE[t.key] || GENERIC_RATIONALE), ...((p.deviationNotes || {})[t.key] || {}) },
  }))
  return {
    // covering letter
    letterSalutation: p.letterSalutation ?? 'Dear Sir,',
    letterBody: p.letterBody ?? DEFAULT_LETTER_BODY(p, opp),
    // Every sample letter closes "Best Regards" over the signer's own block —
    // none of them carries the "Yours faithfully / For <company>" formula.
    letterClose: p.letterClose ?? 'Best Regards',
    letterCc: p.letterCc ?? '',
    // numbered sections
    execSummary: p.execSummary ?? defaultExecSummary(p, opp),
    scope: defaultScope(p),
    scopeIncludes: p.scopeIncludes ?? DEFAULT_SCOPE_INCLUDES,
    scopeNote: p.scopeNote ?? '',
    priceBasis: p.priceBasis ?? PRICE_BASIS,
    paymentMilestones: p.paymentMilestones ?? defaultPaymentMilestones(p),
    commercialNote: p.commercialNote ?? DEFAULT_COMMERCIAL_NOTE,
    gstPct: p.gstPct ?? 18,
    deliveryMilestones: p.deliveryMilestones ?? defaultDeliveryMilestones(p),
    deliveryNote: p.deliveryNote ?? DEFAULT_DELIVERY_NOTE,
    assumptions: p.assumptions ?? DEFAULT_ASSUMPTIONS,
    exclusions: p.exclusions ?? DEFAULT_EXCLUSIONS,
    deviations,
    offerTerms: p.offerTerms ?? recommendTerms(opp || {}, ctx.config),
    // The numbered T&C block the samples print under the pricing sheet.
    docTerms: p.docTerms ?? defaultDocTerms(p, opp),
    docTermsHeading: p.docTermsHeading ?? docTermsHeading(p, opp),
    // --- annexe content ---
    // The compliance grid projected into the sample's seven columns. `status`
    // is left alone: it is the binary field gates.js reads to raise deviation
    // approvals, so the customer-facing verdict gets its own key.
    compliance: (p.terms || []).map(t => ({
      section: t.section || '',
      clauseRef: t.clauseRef || '',
      clause: t.customerAsk || t.term || '',
      compliance: t.compliance || (t.status === 'Deviation' ? 'Deviate' : 'Comply'),
      comments: customerResponse(t.ourResponse, t.key, false),
      workflowStatus: t.workflowStatus || 'Open',
    })),
    clarifications: (p.terms || []).filter(t =>
      (t.compliance || t.status) === 'Clarification' || t.status === 'Deviation'),
    sensorCompare: p.sensorCompare ?? null,
    sow: p.sow ?? null,
    issues: p.issues ?? [],
    billingMilestones: p.billingMilestones ?? [],
    validityDays: p.validityDays ?? 30,
    validityNote: p.validityNote ?? DEFAULT_VALIDITY_NOTE,
    attachments,
    about: p.about ?? MODAE_ABOUT,
    // `division` is the business-line row the samples carry between the
    // designation and the company name.
    preparedBy: p.preparedBy ?? {
      name: '', title: 'Solutions & Services Engineer', division: 'VMS & CMS Solutions',
      email: MODAE_COMPANY.email, phone: MODAE_COMPANY.phone,
    },
  }
}

// ---------------------------------------------------------------------------
// Route-driven document layout
//
// 13 Aug client review: the project proposal was "perfect… If it is not a
// project, then we have to have another template, simple template, because this
// is very complicated." The section sets written then were marked PROVISIONAL,
// pending the client's own sample proposals.
//
// Those samples arrived (doc/Further Inputs — five workbooks) and settled it
// differently than expected: the documents are not long-or-short runs of
// numbered sections at all. Every one of them, the big project included, is a
// Cover Letter plus ONE commercial sheet, with technical annexes beside it.
// There is no contents page, no company page and no executive summary in any
// real proposal. So the layout is a list of SHEETS, not a list of sections; the
// eleven-section `DOC_BODY_SECTIONS` array that used to live here is gone.
// (`PROP_SECTIONS` at the top of this file is a different, older list that
// still drives the drafting checklist in PropBuilder.)
//
// `annexes` are the sheets the workbooks ship hidden. Hidden meant prepared but
// not issued, so they stay off until a proposal opts in through `printAnnexes`
// — in a workbook you can hide a sheet, in a PDF you cannot.
export const DOC_SHEET_KINDS = [
  'cover', 'signalList', 'rackLayout', 'boq', 'compliance',
  'clarifications', 'sensorComparison', 'sow', 'issues',
]

export const DOC_ROUTES = {
  Project: {
    sheets: ['cover', 'signalList', 'rackLayout', 'boq'],
    annexes: ['compliance'],
    boqVariant: () => 'project',
    boqTitle: () => 'Priced BoQ',
  },
  Spares: {
    sheets: ['cover', 'boq'],
    annexes: ['clarifications', 'sensorComparison'],
    // Spares-2 quotes two makes side by side; Spares-1 quotes one. Same route,
    // and the group count is what tells them apart.
    boqVariant: p => ((p?.itemGroups || []).length > 1 ? 'options' : 'firm'),
    boqTitle: p => `Rev-${p?.revision ?? '00'}`,
  },
  Services: {
    sheets: ['cover', 'boq'],
    annexes: ['sow', 'issues'],
    // Two structurally different services samples: a man-day rate card, and a
    // scope-of-work sheet with billing milestones.
    boqVariant: p => (p?.serviceKind === 'scope' ? 'scope' : 'rate'),
    boqTitle: p => `BoQ & Price-${p?.revision ?? '00'}`,
  },
}

// The sheets a given proposal actually prints: the route's own list, plus any
// annexe the salesperson has ticked on, always in the route's declared order.
export function docSheets(p, opp) {
  const layout = docLayout(p, opp)
  const opted = p?.printAnnexes || []
  const annexes = (layout.annexes || []).filter(a => opted.includes(a))
  return [...layout.sheets, ...annexes]
}

// Columns per pricing-sheet variant, straight off the sample headers. `cell`
// takes the line and a context carrying the quantity/price helpers, so the same
// spec drives every variant and no variant can invent a column of its own.
export const BOQ_COLUMNS = {
  project: [
    { key: 'sl', label: 'Sl.', cls: 'sl' },
    { key: 'itemCategory', label: 'Item Category' },
    { key: 'desc', label: 'Item/Scope Description' },
    { key: 'pn', label: 'Proposed Model & Part Number' },
    { key: 'qtyPerUnit', label: 'Qty Per Unit', num: true },
    { key: 'common', label: 'Common', num: true },
    { key: 'spares', label: 'Spares', num: true },
    { key: 'qty', label: 'Total Qty', num: true },
    { key: 'unit', label: 'Unit Price ₹', num: true, priced: true },
    { key: 'total', label: 'Total Price ₹', num: true, priced: true },
  ],
  firm: [
    { key: 'sl', label: 'Sl.', cls: 'sl' },
    { key: 'pn', label: 'Part number' },
    { key: 'desc', label: 'Description' },
    { key: 'qty', label: 'Total quantity', num: true },
    { key: 'unit', label: 'Unit Price ₹', num: true, priced: true },
    { key: 'total', label: 'Total Price ₹', num: true, priced: true },
  ],
  // The Meggitt sheet prints the customer's own obsolete part alongside ours —
  // the whole point of that offer is the substitution, so the existing part
  // number is published rather than suppressed.
  options: [
    { key: 'sl', label: 'Sl.', cls: 'sl' },
    { key: 'rfqItem', label: 'RFQ Item' },
    { key: 'custRef', label: 'Existing Part Number' },
    { key: 'custDesc', label: 'Existing Item/Part Description' },
    { key: 'pn', label: 'Proposed Part Number' },
    { key: 'desc', label: 'Proposed Item/Part Description' },
    { key: 'qty', label: 'Qty', num: true },
    { key: 'unit', label: 'Unit Price ₹', num: true, priced: true },
    { key: 'total', label: 'Total Price ₹', num: true, priced: true },
  ],
  rate: [
    { key: 'sl', label: 'Sl.', cls: 'sl' },
    { key: 'desc', label: 'Item Description' },
    { key: 'qty', label: 'Total Qty', num: true },
    { key: 'unit', label: 'Unit Price ₹', num: true, priced: true },
    { key: 'total', label: 'Total Price ₹', num: true, priced: true },
  ],
  scope: [
    { key: 'sl', label: 'Sl.', cls: 'sl' },
    { key: 'itemCategory', label: 'Item Category' },
    { key: 'desc', label: 'Scope Of Work & Activities' },
    { key: 'qty', label: 'Qty', num: true },
    { key: 'unit', label: 'Unit Price ₹', num: true, priced: true },
    { key: 'total', label: 'Total Price ₹', num: true, priced: true },
  ],
}

// Ten columns of goods, or nine with four text columns, do not fit portrait A4.
export const BOQ_LANDSCAPE = ['project', 'options']

// Fold the BoQ into the sample's `Item-10` / `Item-20` groups, each with its own
// header, `Total For` line and notes. A line whose group has been deleted falls
// into the first group rather than vanishing off the priced document.
export function boqGroups(p, { lineQuoted, units }) {
  const groups = (p.itemGroups || []).length
    ? p.itemGroups
    : [{ id: 'g1', no: 'Item-10', title: p.subject || p.project || 'Scope of supply', notes: [] }]
  const known = new Set(groups.map(g => g.id))
  const u = units ?? p.units ?? 7
  let sl = 0
  return groups.map((g, gi) => {
    const lines = (p.bom || []).filter(l =>
      (known.has(l.groupId) ? l.groupId : groups[0].id) === g.id)
    const rows = lines.map(l => {
      const qty = lineQty(l, u)
      const unit = lineQuoted ? lineQuoted(l) : 0
      return { line: l, sl: ++sl, qty, unit, total: unit * qty }
    })
    return {
      ...g,
      no: g.no || `Item-${(gi + 1) * 10}`,
      rows,
      total: rows.reduce((s, r) => s + r.total, 0),
      notes: g.notes || [],
    }
  })
}

// One canonical route for the document. The opportunity's own route is the
// source of truth (it is what the workbench already branches on at
// Workbench.jsx), and the proposal's Proposal type selector is the explicit
// override. Opportunity types the seed maps off the project route — Service,
// and Retrofit alongside Spares — must not fall through to it.
export function docRoute(p, opp) {
  const raw = p?.proposalType || routeForType(opp?.oppType) || opp?.route
  if (raw === 'Spares') return 'Spares'
  if (raw === 'Service' || raw === 'Services') return 'Services'
  return 'Project'
}

export const docLayout = (p, opp) => DOC_ROUTES[docRoute(p, opp)] || DOC_ROUTES.Project

// The standard documents that accompany every outgoing proposal — enclosures,
// never "annexes" (annexes are the opt-in technical sheets inside the
// document). The GTC goes with everything; the rate schedule with services
// only, domestic or international (Biji, 20 Aug review). Both email send
// paths derive their attachment lists from here so the rule cannot drift.
// The samples show no printed Encl: list, so the letter itself names nothing.
export const ENCLOSURES = Object.freeze({
  gtc: Object.freeze({
    filename: 'ModAE Standard Terms-Sales.pdf',
    label: 'General Terms & Conditions for Supply of Goods and Services',
  }),
  serviceRates: Object.freeze({
    filename: 'ModAE Services Rate Schedule FY2025-26.pdf',
    label: 'Engineering Services Rate Schedule FY2025-26',
  }),
})

export const enclosuresFor = route =>
  route === 'Services' ? [ENCLOSURES.gtc, ENCLOSURES.serviceRates] : [ENCLOSURES.gtc]

// The keys docModel can auto-draft — used by the editor's "reset to auto-draft".
export const DOC_FIELDS = [
  'letterSalutation', 'letterBody', 'letterClose', 'letterCc',
  'execSummary', 'scopeIncludes', 'scopeNote', 'priceBasis', 'paymentMilestones',
  'commercialNote', 'gstPct', 'deliveryMilestones', 'deliveryNote',
  'assumptions', 'exclusions', 'deviationNotes', 'offerTerms',
  'docTerms', 'docTermsHeading',
  'validityDays', 'validityNote', 'attachments', 'about', 'preparedBy',
]
