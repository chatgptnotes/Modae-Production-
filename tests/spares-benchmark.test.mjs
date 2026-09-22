import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { seedAiLeads, seedPriceLists, seedConfig, seedUsers, routeForType } from '../src/seed.js'
import { docRoute, defaultDocTerms, docTermsHeading } from '../src/proposalDoc.js'
import { matchParts } from '../src/tenderParse.js'
import { clarificationKindFor, draftClarification } from '../src/leadClarification.js'
import { isFastTrackLead } from '../src/leadRules.js'
import { unitCostINR, unitSellINR, effectiveRate } from '../src/utils.js'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const exists = file => fs.existsSync(path.join(root, file))

// 20 Aug review: complete the spares lead-to-proposal workflow "using the
// provided sample inquiry (Ref: 14716) and proposal as the benchmark for
// success". Both documents are in the repo:
//
//   doc/Further Inputs/Further Inputs/Proposals and T&Cs/Spares Opp-1 (Won almost)/
//     02_7425309-Buyers Speces.pdf           the enquiry — "Ref:14716" on page 1
//     Spares Firm Offer Rev00 2May2026.xlsx  the answer  — "Our Ref: 2511096RS"
//
// The part codes match one-for-one across the pair. That is the thread this
// test walks: enquiry -> classify -> clarify -> price -> printed terms.

// The five items, verbatim from the buyer specification (Items 1-5) with the
// quantities the firm offer priced against them.
const BENCHMARK_ITEMS = [
  { desc: 'B&Kvibro make Non contact sensor with full length thread', pn: 'DS821.DS1001/10/075/012/005/000/0', qty: 10 },
  { desc: 'B&K vibro make Non contact Reverse mount sensor for sensor holder with adjustment spindle', pn: 'DS821.DS1003/62/039/013/005/000/0', qty: 10 },
  { desc: 'B&K make sensor extension cable', pn: 'DS821.EC100/45/0', qty: 15 },
  { desc: 'B&k vibro make sensor Driver electronics for 2mm measuring range', pn: 'DS821.OD110/0', qty: 10 },
  { desc: 'B and K Vibro make Sensor Holder with adjustment spindle uncut', pn: 'AC-3101/1', qty: 10 },
]

const allParts = Object.entries(seedPriceLists)
  .flatMap(([list, v]) => v.parts.map(p => ({ ...p, list, currency: v.currency })))
const lead = seedAiLeads.find(l => l.id === 'LD-208')

test('the benchmark documents are still in the repository', () => {
  const dir = 'doc/Further Inputs/Further Inputs/Proposals and T&Cs/Spares Opp-1 (Won almost)'
  assert.ok(exists(`${dir}/02_7425309-Buyers Speces.pdf`), 'the Ref 14716 enquiry')
  assert.ok(exists(`${dir}/Spares Firm Offer Rev00 2May2026.xlsx`), 'the proposal that answered it')
})

test('the enquiry is seeded and carries its buyer reference', () => {
  assert.ok(lead, 'LD-208 must exist')
  assert.equal(lead.ref, '14716')
  assert.equal(lead.route, 'Spares')
  assert.equal(lead.customerStatus, 'Green')
  assert.equal(lead.status, 'New')
  // The buyer specification is what the five part codes come from.
  assert.ok(lead.attachments.some(a => /Buyers Speces/.test(a.name)))
  const ref = lead.ai.fields.find(f => /buyer reference/i.test(f.k))
  assert.equal(ref.v, '14716')
})

test('a Green enquiry takes the fast track', () => {
  assert.equal(isFastTrackLead(lead, seedConfig), true)
})

test('the two open questions become a clarification the human sends', () => {
  // The buyer specification states neither, so they must be asked for — and
  // asked for by a person, not dispatched by the model.
  assert.deepEqual(lead.ai.missing, ['Delivery location / consignee address', 'Bid submission date'])
  assert.equal(clarificationKindFor(lead, 'Green'), 'clarification')

  const draft = draftClarification(lead, { users: seedUsers, config: seedConfig })
  assert.equal(draft.to, lead.from)
  for (const item of lead.ai.missing) assert.ok(draft.body.includes(item))
  // Unassigned, so it goes out from the common mailbox.
  assert.equal(draft.from, seedConfig.commonMailbox)
})

test('every one of the five part codes prices off the B&K list', () => {
  // Before this benchmark landed, none of these existed in seedPriceLists and
  // every line fell to listPrice: 0.
  const matched = matchParts(BENCHMARK_ITEMS, allParts)
  assert.equal(matched.length, 5)
  for (const row of matched) {
    assert.ok(row.match, `${row.pn} must resolve against a price list`)
    assert.equal(row.match.list, 'BNK')
    assert.ok(row.match.price > 0, `${row.pn} must carry a price`)
  }
})

test('the buyer wording resolves to the right part without a part code', () => {
  // A GeM item description never quotes the ModAE catalogue text, so the
  // keyword tier has to carry it — and carry it to the *correct* part. Item 2
  // is the trap: the buyer writes "Reverse mount sensor FOR sensor holder with
  // adjustment spindle", which contains the holder's own keywords. On a short
  // keyword set it resolved to AC-3101/1 and would have silently priced a
  // €245 accessory where a €560 sensor belongs.
  const byWording = matchParts(
    BENCHMARK_ITEMS.map(({ desc, qty }) => ({ description: desc, qty })), allParts)
  assert.deepEqual(
    byWording.map(r => r.match?.pn ?? null),
    BENCHMARK_ITEMS.map(i => i.pn),
    'every line must resolve to its own part, not merely to something')
})

test('the priced line reproduces the sample costing chain', () => {
  // The sample workbook's own factors: Euro-₹ 113, B&K discount 35%,
  // customs+handling+ERV 15% — giving its stated effective rate of ~84.47.
  const costing = { baseRate: 113, cdErvContPct: 15, bnkDiscPct: 35, inputGMPct: 35 }
  const rate = effectiveRate(costing, 'EUR', true)
  assert.ok(rate >= 84 && rate <= 85, `effective rate ${rate} should sit on the sample's 84.47`)

  const part = allParts.find(p => p.pn === 'DS821.OD110/0')
  const cost = unitCostINR(part.price, costing, 'EUR', true)
  const sell = unitSellINR(part.price, costing, 'EUR', true)
  assert.ok(cost > 0 && sell > cost, 'a priced line must carry a positive margin')
  assert.equal(Math.round((1 - cost / sell) * 100), 35, 'and hit the input GM')
})

test('the opportunity routes to the spares document', () => {
  assert.equal(routeForType('Spares'), 'Spares')
  assert.equal(docRoute({}, { oppType: 'Spares' }), 'Spares')
})

test('the printed terms are the sample\'s eight clauses, in its order', () => {
  const p = { revision: '00', validityDays: 30, fxBasis: 112 }
  const opp = { id: '2511096RS', oppType: 'Spares' }
  const terms = defaultDocTerms(p, opp)

  assert.equal(docTermsHeading(p, opp), 'Terms & Conditions:')
  assert.deepEqual(terms.map(t => t.label), [
    'Proposal Validity',
    'Warranty',
    'Price Basis & Inco Terms',
    'Freight & Insurance',
    'Delivery Period',
    'Site Services',
    'Payment Terms',
    'Other Terms & Conditions',
  ])

  const text = i => terms[i].text
  // 1. Validity is three sentences in the sample: the period, the escalation
  //    warning, and the rate the offer was built on.
  assert.match(text(0), /valid for 30 days/)
  assert.match(text(0), /escalation until delivery of the goods due to exchange rate variations shall be to your account/i)
  assert.match(text(0), /₹112 per Euro/)
  assert.match(text(1), /12 months from the date of supply/)
  // 3. "Ex Works, Bangalore" — the app used to say FCA, which is a different
  //    Incoterm and a different allocation of cost and risk.
  assert.match(text(2), /Ex Works, Bangalore/)
  assert.doesNotMatch(text(2), /FCA/)
  // 4. "In Customer scope" — not "extra at actuals", which bills it back later.
  assert.match(text(3), /to the customer’s account/)
  // 5. Sixteen weeks, and running from the advance as well as the PO.
  assert.match(text(4), /16 weeks after receipt of purchase order and advance payment/i)
  assert.doesNotMatch(text(4), /12-16/)
  // 6. The rate schedule this proposal will enclose.
  assert.match(text(5), /ModAE standard rate schedule/)
  // 7. 50/50 — the app used to demand 100% up front on every spares quote.
  assert.match(text(6), /50% advance along with the purchase order/i)
  assert.match(text(6), /balance 50% plus applicable taxes on material readiness/i)
  assert.doesNotMatch(text(6), /^100% advance/)
  // 8. The standard T&Cs, which the enclosure work will attach.
  assert.match(text(7), /standard terms and conditions of sale/i)
})

test('the project-only clauses stay off a spares offer', () => {
  const terms = defaultDocTerms({}, { oppType: 'Spares' })
  const labels = terms.map(t => t.label)
  for (const absent of ['Performance Bank Guarantee', 'Liquidated Damages', 'Make, Model & Part Numbers']) {
    assert.equal(labels.includes(absent), false, `${absent} is a project clause`)
  }
})

test('the benchmark is reachable from the demo launcher', () => {
  const launcher = read('src/pages/Launcher.jsx')
  assert.match(launcher, /to: '\/inbox\/LD-208'/)
  assert.match(launcher, /enquiry 14716/)
  // Scenario numbers must stay 1..n with no repeats after the insert.
  const ns = [...launcher.matchAll(/\{ n: (\d+), icon:/g)].map(m => +m[1])
  assert.deepEqual(ns, ns.map((_, i) => i + 1))
})

test('the placeholder prices are flagged as placeholders', () => {
  // The sample workbook prices through external links, so its cached figures
  // are zero and the real B&K net list was not in the handover. Whoever quotes
  // this for real has to be told.
  const seed = read('src/seed.js')
  const block = seed.slice(seed.indexOf('DS821 displacement-sensor family'), seed.indexOf("pn: 'DS821.DS1001"))
  assert.match(block, /PLACEHOLDER PRICES/)
  assert.match(block, /02_7425309-Buyers Speces\.pdf/)
  assert.match(block, /Spares Firm Offer Rev00 2May2026\.xlsx/)
})

// The contractual boilerplate is transcribed from ModAE's own sample proposals
// and was signed off in the 20 August client review. It was silently paraphrased
// once by a catch-all "chore" commit — eight strings, of which only two were
// covered — so every clause is pinned here. These are commercial terms: freight
// liability, payment milestones and price escalation. Changing one is a client
// decision, not an editorial one, so a failure here means ask, not rewrite.
test('the contractual boilerplate matches the client-reviewed sample wording', async () => {
  const { DOC_TERM_TEXT } = await import('../src/proposalDoc.js')
  const expected = {
    fxEscalation: 'Any price escalation until delivery of the goods due to exchange rate variations shall be to your account.',
    priceBasis: 'Ex Works, Bangalore. All taxes and duties shall be extra as applicable.',
    freightCustomer: 'Freight and insurance are to the customer’s account.',
    deliverySpares: '16 weeks after receipt of purchase order and advance payment.',
    siteServices: 'Site services, if required, are additional and chargeable as per the ModAE standard rate schedule.',
    paymentSpares: '50% advance along with the purchase order, and the balance 50% plus applicable taxes on material readiness.',
    standardTerms: 'Other terms and conditions: as per ModAE India standard terms and conditions of sale.',
  }
  for (const [key, text] of Object.entries(expected)) {
    assert.equal(DOC_TERM_TEXT[key], text, `${key} must keep its client-reviewed wording`)
  }
})
