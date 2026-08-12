// The customer-facing proposal document: what sections it has, what each one
// says by default, and the company identity printed on it.
//
// Everything here is a pure function of the saved proposal + opportunity. The
// drafting checklist (PropBuilder) and the printed document (PrintDoc) both
// import PROP_SECTIONS from here so the two can never drift apart.
import { MODAE_STANDARD_TERMS } from './tenderParse.js'

// ⚠ PLACEHOLDER LETTERHEAD. Swap these for ModAE India's registered details
// before anything printed from this app goes to a customer — it is the only
// place they appear.
export const MODAE_COMPANY = {
  name: 'ModAE India Pvt Ltd',
  tagline: 'Your Partners In Achieving Excellence',
  addr: ['#12, 2nd Floor, Industrial Suburb', 'Yeshwanthpur, Bengaluru 560 022', 'Karnataka, India'],
  gstin: '29AAAAA0000A1Z5',
  cin: 'U29309KA2019PTC000000',
  email: 'sales@modae.in',
  phone: '+91 80 4123 4567',
  web: 'www.modae.in',
}

export const PROP_SECTIONS = [
  'Cover', 'Executive summary', 'Scope of supply', 'Line items / BOQ',
  'Commercial summary', 'Delivery', 'Assumptions', 'Exclusions', 'Deviations',
  'Terms', 'Validity', 'Attachments',
]

// Rule-based commercial-term suggestions (AI-labelled in the UI): payment by
// customer class, delivery by route, standard validity and warranty.
export function recommendTerms(opp) {
  const payment = opp.customerStatus === 'Green' ? '30 days credit from invoice'
    : opp.customerStatus === 'Blue' ? '50% advance, balance on delivery'
    : opp.customerStatus === 'Amber' ? '100% advance before dispatch'
    : '100% prepayment only'
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
export function DEFAULT_LETTER_BODY(p, opp) {
  const bom = p.bom || []
  const nos = bom.reduce((s, l) => s + lineQty(l, p.units), 0)
  const cats = [...new Set(bom.map(l => l.itemCategory).filter(Boolean))]
  const devs = (p.terms || []).filter(t => t.status === 'Deviation').length
  const oem = opp?.product && opp.product !== 'Various' ? opp.product : ''
  const days = p.validityDays ?? 30
  return [
    `We thank you for the above enquiry and for the opportunity to quote. We are pleased to enclose our Techno-Commercial Proposal covering the complete scope called for.`,

    `We understand the requirement to be the supply of ${bom.length} item${bom.length === 1 ? '' : 's'}`
      + `${nos ? `, ${nos} nos in total` : ''}${cats.length ? ` — ${cats.join(', ').toLowerCase()}` : ''}`
      + `${oem ? `, to be used with the ${oem} vibration monitoring system already installed at site` : ''}. `
      + `Every item has been offered strictly to the specification stated in your enquiry, and the models we propose are`
      + `${oem ? ` form-, fit- and function-compatible with the installed ${oem} equipment` : ' fully interchangeable with the existing installation'}.`,

    `The enclosed proposal sets out our executive summary, the detailed scope of supply with the technical `
      + `specification of each offered model, the priced bill of quantities, our commercial summary and payment terms, `
      + `the delivery schedule, our assumptions and exclusions, the deviations we have taken, our complete `
      + `clause-by-clause compliance against the terms and conditions of your enquiry, and the validity of this offer.`,

    devs === 0
      ? `Our offer is compliant in full with the terms and conditions of your enquiry, both technical and commercial. `
        + `The offer is valid for ${days} days from the date of this letter.`
      : `Our offer is technically compliant in full. On the commercial side we have taken ${devs} `
        + `deviation${devs === 1 ? '' : 's'}, each of which is set out with our reasoning and a proposed way forward in `
        + `the Deviations section; we would welcome the opportunity to discuss them with you before award. `
        + `The offer is valid for ${days} days from the date of this letter.`,

    `We trust our offer meets your requirement in full and look forward to the favour of your valued order. `
      + `Should you need any clarification, additional documentation or a technical discussion, please do not `
      + `hesitate to contact the undersigned.`,
  ].join('\n\n')
}

export function defaultExecSummary(p, opp) {
  const bom = p.bom || []
  const nos = bom.reduce((s, l) => s + lineQty(l, p.units), 0)
  const cats = [...new Set(bom.map(l => l.itemCategory).filter(Boolean))]
  const devs = (p.terms || []).filter(t => t.status === 'Deviation')
  const oem = opp?.product && opp.product !== 'Various' ? opp.product : ''
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

    `OUR UNDERSTANDING\nThese are replacement and spare sensing elements for an operating machine. What matters `
      + `is not the sensor in isolation but that it drops into the existing signal chain without change to the `
      + `monitor, the cabling or the alarm settings — same sensitivity, same connector, same electrical `
      + `characteristics. We have selected each model on that basis rather than on nearest-equivalent specification.`,

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

// ⚠ PLACEHOLDER COMPANY PROFILE — replace with ModAE India's own copy.
export const MODAE_ABOUT = {
  intro: `${MODAE_COMPANY.name} supplies, engineers and services machinery condition-monitoring systems for the `
    + 'power, process and heavy-engineering industries in India. Our work covers vibration and air-gap monitoring on '
    + 'thermal and hydro generating plant, rotating machinery protection to API 670, and the condition-monitoring '
    + 'software and historian interfaces that sit above them.',
  capabilities: [
    'Authorised channel for the sensing and monitoring product lines quoted in this offer, with direct manufacturer support on selection, interchangeability and obsolescence.',
    'In-house engineering for signal lists, rack configuration, loop schedules and as-built documentation.',
    'Retrofit and upgrade of installed monitoring systems, including like-for-like replacement of sensing elements without change to the existing monitor or cabling.',
    'Commissioning, calibration and periodic health-check services by our own engineers, supported from our regional offices.',
    'Spares support against the installed base, with traceable manufacturer test certification on every item supplied.',
  ],
  closing: 'Our approach on a replacement-spares enquiry such as this one is deliberately conservative: we offer what '
    + 'drops into the existing signal chain unchanged, we say plainly where we differ from the tendered terms, and we '
    + 'put the reasoning in front of you rather than leaving it to be discovered after award.',
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
    letterClose: p.letterClose ?? 'Yours faithfully,',
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
    offerTerms: p.offerTerms ?? recommendTerms(opp || {}),
    validityDays: p.validityDays ?? 30,
    validityNote: p.validityNote ?? DEFAULT_VALIDITY_NOTE,
    attachments,
    about: p.about ?? MODAE_ABOUT,
    preparedBy: p.preparedBy ?? {
      name: '', title: 'Manager — Sales', email: MODAE_COMPANY.email, phone: MODAE_COMPANY.phone,
    },
  }
}

// The numbered sections of the printed body, in order — drives both the table
// of contents and the page sequence, so the two can never disagree. The
// covering letter is front matter and carries no number.
export const DOC_BODY_SECTIONS = [
  'Executive summary',
  'Scope of supply',
  'Bill of quantities',
  'Commercial summary',
  'Delivery schedule',
  'Assumptions',
  'Exclusions',
  'Deviations',
  'Terms & conditions',
  'Validity of offer',
  'Attachments & enclosures',
]

// The keys docModel can auto-draft — used by the editor's "reset to auto-draft".
export const DOC_FIELDS = [
  'letterSalutation', 'letterBody', 'letterClose', 'letterCc',
  'execSummary', 'scopeIncludes', 'scopeNote', 'priceBasis', 'paymentMilestones',
  'commercialNote', 'gstPct', 'deliveryMilestones', 'deliveryNote',
  'assumptions', 'exclusions', 'deviationNotes', 'offerTerms',
  'validityDays', 'validityNote', 'attachments', 'about', 'preparedBy',
]
