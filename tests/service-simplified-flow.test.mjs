import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const service = fs.readFileSync('src/workbench/WbService.jsx', 'utf8')
const store = fs.readFileSync('src/store.jsx', 'utf8')

test('Service flow uses one AI suggestion and one human confirmation', () => {
  assert.match(service, /AI service identification/)
  assert.match(service, /Suggested offer path/)
  assert.match(service, /Confirm scope and offer path/)
  assert.match(service, /Standard Rate Sheet/)
  assert.match(service, /Customized Proposal/)
})

test('Service flow combines internal review and records one customer decision', () => {
  assert.match(service, /type: 'Service offer review'/)
  assert.match(service, /Request one Service Review/)
  const decision = fs.readFileSync('src/workbench/ServiceDecisionPanel.jsx', 'utf8')
  assert.match(decision, /Customer decision/)
  assert.match(decision, /Changes requested/)
  assert.match(decision, /revision: \(est\.revision \|\| 0\) \+ 1/)
  assert.match(store, /updateServiceFlow\(oppId, patch\)/)
})

test('Service review still requires scope, travel, and required survey evidence', () => {
  assert.match(service, /!scopeConfirmed \|\| !est\.travelConfirmed/)
  assert.match(service, /est\.surveyRequired && !\(\(store\.surveys \|\| \[\]\)\.find/)
  // The single review only gates the opportunities still carrying one.
  assert.match(service, /onLegacyReview && reviewApproval\?\.status !== 'Approved'/)
})

// Reversed on 22 Sep: Service now runs the same layered approval as a project.
// The single review survives only for opportunities that already had one.
test('Service runs the three-part matrix, with the legacy review as the exception', () => {
  const gates = fs.readFileSync('src/gates.js', 'utf8')
  const builder = fs.readFileSync('src/workbench/PropBuilder.jsx', 'utf8')
  assert.match(gates, /export function serviceMatrixExempt/)
  assert.match(gates, /export const legacyServiceReview/)
  assert.match(gates, /export function serviceOfferCleared/)
  // The blanket Service branch that skipped the matrix is gone.
  assert.doesNotMatch(gates, /const gates = configuredGates\.length \? configuredGates : \(opp\?\.route === 'Service'/)
  // The builder decides on the legacy record, not on the route.
  assert.match(builder, /const onLegacyReview = !!legacyServiceReview\(opp, store\.approvals\)/)
  assert.doesNotMatch(builder, /opp\.route === 'Service' \? serviceApprovalSet/)
})

test('Service progress follows intake through execution and invoice', () => {
  const workbench = fs.readFileSync('src/pages/Workbench.jsx', 'utf8')
  assert.match(workbench, /const SERVICE_WORKFLOW_STEPS = \[/)
  for (const label of ['Service Intake', 'Capture Enquiry', 'Scope & Survey', 'Prepare Offer', 'Internal Review', 'Send Offer', 'Customer Decision', 'Execute Service', 'Service Report', 'Invoice']) {
    assert.match(workbench, new RegExp(label.replace(/[&]/g, '\\&')))
  }
  assert.match(workbench, /ServiceDecisionPanel/)
  assert.match(workbench, /ServiceExecutionPanel/)
  assert.match(workbench, /ServiceReportPanel/)
  assert.match(workbench, /ServiceInvoicePanel/)
})

// ---- Path A: the published rate schedule, and billing on actual days -------

test('the standard rate schedule is issued on its own, before the site visit', () => {
  const panel = fs.readFileSync('src/workbench/RateSheetPanel.jsx', 'utf8')
  // The same enclosure a full service proposal carries, sent early and alone.
  assert.match(panel, /SERVICE_RATE_SCHEDULE_URL/)
  assert.match(panel, /ENCLOSURES\.serviceRates/)
  assert.match(panel, /kind: 'rate-sheet'/)
  assert.match(panel, /rateSheetSentOn/)
  // Issuing it is what prepares the Path A offer.
  assert.match(panel, /offerPrepared: true/)
  // Re-issued rather than re-created when the customer negotiates.
  assert.match(panel, /Re-issue rate schedule/)
  assert.match(service, /offerMode === 'Standard Rate Sheet' && <RateSheetPanel/)
})

test('a sent rate schedule satisfies the service send step', () => {
  const workbench = fs.readFileSync('src/pages/Workbench.jsx', 'utf8')
  assert.match(workbench, /\['submission', 'rate-sheet'\]\.includes\(c\.kind\) && c\.status === 'sent'/)
})

test('the engineer logs weekday, weekend and overtime actuals', () => {
  const execution = fs.readFileSync('src/workbench/ServiceExecutionPanel.jsx', 'utf8')
  for (const field of ['actualWeekdayDays', 'actualWeekendDays', 'actualOtHours', 'actualTravelDays']) {
    assert.match(execution, new RegExp(field))
  }
  // actualEngineerDays stays derived: the workbench blockers are written against it.
  assert.match(execution, /actualEngineerDays: engineerDaysFrom\(actualQuantities\(next\)\)/)
})

test('a site finding can escalate Path A onto the customised path', () => {
  const report = fs.readFileSync('src/workbench/ServiceReportPanel.jsx', 'utf8')
  assert.match(report, /surveyRequired: true/)
  assert.match(report, /offerMode: 'Customized Proposal'/)
  assert.match(report, /store\.requestSurvey\(opp\.id/)
  assert.match(report, /Detailed BOQ \/ SoW required/)
})

test('the invoice bills the accepted rates against the actual deployment', async () => {
  const { serviceCost, actualQuantities, estimateQuantities, engineerDaysFrom, hasActuals } =
    await import('../src/serviceRates.js')
  const sheets = {
    India: {
      currency: 'INR', gst: 18,
      rates: { engineerDay: 45, seniorDay: 65, travelDay: 20, otHour: 6, weekendPct: 50, standbyDay: 25, minCallout: 90, flight: 18, hotelNight: 6, transportDay: 4, perDiem: 3, tools: 12 },
    },
  }
  const quoted = { workDays: 3, travelDays: 2, otHours: 0, weekendDays: 0, standbyDays: 0 }

  // No field log yet: the invoice prices what the customer accepted.
  assert.equal(hasActuals(quoted), false)
  assert.deepEqual(actualQuantities(quoted), estimateQuantities(quoted))

  // The engineer ran over — four weekday days, a weekend day and six OT hours.
  const est = { ...quoted, actualWeekdayDays: 4, actualWeekendDays: 1, actualOtHours: 6 }
  assert.equal(hasActuals(est), true)
  const actual = actualQuantities(est)
  assert.equal(engineerDaysFrom(actual), 5)
  // Travel was never logged, so it falls back to the quoted two days.
  assert.equal(actual.travelDays, 2)

  const quotedCost = serviceCost(sheets, 'India', estimateQuantities(quoted))
  const billed = serviceCost(sheets, 'India', actual)
  assert.ok(billed.total > quotedCost.total, 'extra days must raise the bill')

  const line = label => billed.rows.find(([l]) => l.startsWith(label))[1]
  assert.equal(line('Engineer days'), 4 * 45)
  assert.equal(line('Overtime hours'), 6 * 6)
  // Weekend days carry the rate sheet's premium over the senior day rate.
  assert.equal(line('Weekend premium'), 1 * 65 * 50 / 100)
  assert.equal(billed.gst, Math.round(billed.subtotal * 18) / 100)
})

test('the estimate and the invoice share one build-up', () => {
  const rates = fs.readFileSync('src/serviceRates.js', 'utf8')
  const invoice = fs.readFileSync('src/workbench/ServiceInvoicePanel.jsx', 'utf8')
  // The formula lives in one place; neither panel recomputes it.
  assert.match(rates, /export function serviceCost/)
  assert.match(service, /serviceCost\(store\.rateSheets, sheet, estimateQuantities\(est\)\)/)
  assert.match(invoice, /serviceCost\(store\.rateSheets, sheet, q\)/)
  assert.doesNotMatch(invoice, /engineerDay \*/)
})

// ---- The §5 approval matrix for Service (decision, 22 Sep) -----------------

const gatesFor = async () => import('../src/gates.js')

const serviceOpp = (over = {}) => ({
  id: 'SVC-1', route: 'Service', owner: 'RS', milestone: 'Proposal', status: 'Open',
  sellTo: 'ACME', eucName: 'ACME', eucLocation: 'Chennai', oppName: 'Pump inspection',
  contactPerson: 'A Buyer', contactPhone: '900000000', ...over,
})

const stateWith = (est, over = {}) => ({
  svcEstimates: [{ oppId: 'SVC-1', ...est }],
  approvals: [], surveys: [], config: {}, opportunities: [], ...over,
})

test('a Path A offer at published rates carries no §5 approval', async () => {
  const { serviceMatrixExempt, transitionBlockers } = await gatesFor()
  const state = stateWith({ offerMode: 'Standard Rate Sheet' })
  assert.equal(serviceMatrixExempt(serviceOpp(), state), true)

  const blockers = transitionBlockers(serviceOpp(), 'Submitted', { revision: '00', bom: [], terms: [] }, state)
  for (const key of ['tech-approval', 'comm-approval', 'release', 'service-review']) {
    assert.equal(blockers.some(b => b.key === key), false, `${key} must not gate a published-rate offer`)
  }
})

test('discounting a Path A offer pulls in the full matrix', async () => {
  const { serviceMatrixExempt, transitionBlockers, pricingThresholdExceptions } = await gatesFor()
  const est = { offerMode: 'Standard Rate Sheet', rateDiscountPct: 20 }
  const state = stateWith(est)
  assert.equal(serviceMatrixExempt(serviceOpp(), state), false)

  // Spec Scenario 2: 20% is past the configured salesperson limit.
  const { rows } = pricingThresholdExceptions(serviceOpp(), null, state)
  assert.ok(rows.some(r => r.label === 'Service rate sheet' && r.discount === 20))

  const blockers = transitionBlockers(serviceOpp(), 'Submitted', { revision: '00', bom: [], terms: [] }, state)
  assert.ok(blockers.some(b => b.key === 'tech-approval'), 'technical approval must apply')
  assert.ok(blockers.some(b => b.key === 'release'), 'release must apply')
  assert.ok(blockers.some(b => b.key === 'pricing-threshold'), 'the discount must route for sign-off')
})

test('a customised proposal always runs the full matrix', async () => {
  const { serviceMatrixExempt, transitionBlockers } = await gatesFor()
  const state = stateWith({ offerMode: 'Customized Proposal' })
  assert.equal(serviceMatrixExempt(serviceOpp(), state), false)
  const blockers = transitionBlockers(serviceOpp(), 'Submitted', { revision: '00', bom: [], terms: [] }, state)
  assert.ok(blockers.some(b => b.key === 'tech-approval'))
  assert.ok(blockers.some(b => b.key === 'release'))
})

test('an opportunity already on the single review keeps running on it', async () => {
  const { legacyServiceReview, transitionBlockers, serviceOfferCleared } = await gatesFor()
  const review = { oppId: 'SVC-1', type: 'Service offer review', status: 'Pending' }
  const state = stateWith({ offerMode: 'Customized Proposal' }, { approvals: [review] })
  assert.ok(legacyServiceReview(serviceOpp(), state.approvals))

  const blockers = transitionBlockers(serviceOpp(), 'Submitted', { revision: '00', bom: [], terms: [] }, state)
  assert.ok(blockers.some(b => b.key === 'service-review'), 'the in-flight review still gates')
  assert.equal(blockers.some(b => b.key === 'tech-approval'), false, 'it must not also acquire §5')

  const approved = stateWith({ offerMode: 'Customized Proposal' },
    { approvals: [{ ...review, status: 'Approved' }] })
  assert.equal(serviceOfferCleared(serviceOpp(), null, approved), true)
})

test('the margin matrix routes Service by value and margin', async () => {
  const { commercialGate } = await gatesFor()
  const opp = serviceOpp()
  const proposal = (value, cogs) => ({
    revision: '00', bom: [{ quoted: value, qtyPerUnit: 1, common: 1, spares: 0, cogs }], terms: [],
  })
  // The matrix reads computeProposalTotals, so drive it through commercialGate's
  // own output rather than asserting on the bom shape.
  const small = commercialGate(opp, proposal(500000, 100000), {})
  assert.ok(small.valueBreak === 1000000 && small.marginBreak === 50)
})
