import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const service = fs.readFileSync('src/workbench/WbService.jsx', 'utf8')
const store = fs.readFileSync('src/store.jsx', 'utf8')

test('Service flow uses the Standard Rate Sheet path', () => {
  assert.match(service, /Standard Rate Sheet/)
  assert.doesNotMatch(service, /Customized Proposal/)
})

test('Scope Confirmation owns the single site-visit decision', () => {
  const workbench = fs.readFileSync('src/pages/Workbench.jsx', 'utf8')
  const request = fs.readFileSync('src/workbench/ServiceRequestPanel.jsx', 'utf8')
  const scope = fs.readFileSync('src/workbench/ServiceScopePanel.jsx', 'utf8')
  assert.match(workbench, /function RequirementTab\(\{ opp, onContinueToScope, onContinueToRate \}\)/)
  assert.match(workbench, /<ServiceRequestPanel opp=\{opp\} onContinue=\{onContinueToScope\} \/>/)
  assert.match(workbench, /<ServiceScopePanel opp=\{opp\} onContinue=\{onConfirmScope\} \/>/)
  assert.doesNotMatch(request, /Site visit/)
  assert.match(scope, /Site visit/)
  assert.match(scope, /scopeConfirmed: true/)
  assert.match(scope, /updateServiceFlow\(opp\.id/)
  assert.match(request, /updateServiceFlow\(opp\.id/)
  assert.doesNotMatch(service, /service-requirement-option/)
})

test('Service Request advances once into Scope Confirmation', () => {
  const request = fs.readFileSync('src/workbench/ServiceRequestPanel.jsx', 'utf8')
  assert.match(request, /requestConfirmed: true/)
  assert.match(request, /Continue to Scope Confirmation/)
})

test('the survey panel reports the request without duplicating the decision control', () => {
  const survey = fs.readFileSync('src/workbench/SurveyPanel.jsx', 'utf8')
  const scope = fs.readFileSync('src/workbench/ServiceScopePanel.jsx', 'utf8')
  const workbench = fs.readFileSync('src/pages/Workbench.jsx', 'utf8')
  assert.match(survey, /Site survey requirement is locked from Scope Confirmation/)
  assert.doesNotMatch(survey, /type="checkbox"/)
  assert.doesNotMatch(survey, /Carry the SoW into the proposal scope/)
  assert.doesNotMatch(workbench, /onOpenOffer=/)
  assert.match(scope, /import SurveyPanel from '\.\/SurveyPanel\.jsx'/)
  assert.match(scope, /<SurveyPanel opp=\{opp\} est=\{est\} \/>/)
  assert.match(scope, /surveyReady = !siteVisitSelected \|\| !!survey\?\.report/)
  assert.match(scope, /disabled=\{!surveyReady\}/)
  assert.match(scope, /Complete the site survey before preparing the rate schedule/)
  assert.match(service, /Confirm entered travel days/)
  assert.match(service, /rate schedule is published independently/)
  assert.doesNotMatch(service, /<SurveyPanel opp=\{opp\} est=\{est\} \/>/)
  assert.doesNotMatch(service, /Next action required:/)
  assert.doesNotMatch(service, /Confirmed Service Request/)
  assert.doesNotMatch(service, /No site visit selected/)
  assert.doesNotMatch(service, /Scope confirmed\. Complete the estimate below/)
  assert.doesNotMatch(service, /service-flow-summary service-status-strip/)
  assert.doesNotMatch(service, /site-visit requirement was recorded in Service Request/)
  assert.match(service, /<div className="ana-card c-6 service-estimate-panel">[\s\S]*Confirm entered travel days/)
  assert.doesNotMatch(service, /service-travel-confirmation/)
  assert.match(workbench, /servicePhaseBlockers\(step\)/)
  assert.match(workbench, /step\.servicePhaseStart >= 7[\s\S]*est\.travelConfirmed/)
})

test('Scope Confirmation gates the rate schedule on a required survey', () => {
  const scope = fs.readFileSync('src/workbench/ServiceScopePanel.jsx', 'utf8')
  const workbench = fs.readFileSync('src/pages/Workbench.jsx', 'utf8')
  assert.match(scope, /const survey = \(store\.surveys \|\| \[\]\)\.find\(v => v\.oppId === opp\.id\)/)
  assert.match(scope, /const surveyReady = !siteVisitSelected \|\| !!survey\?\.report/)
  assert.match(scope, /surveyRequired: siteVisitSelected/)
  assert.match(workbench, /est\.surveyRequired && !survey\?\.report/)
  assert.match(workbench, /Complete the site survey report before preparing the Standard Rate Schedule/)
  assert.doesNotMatch(workbench, /!enteringStandardRate && step\.servicePhaseStart >= 3/)
})

test('Service flow combines internal review and records one customer decision', () => {
  assert.match(service, /type: 'Service offer review'/)
  assert.match(service, /Request one Service Review/)
  const decision = fs.readFileSync('src/workbench/ServiceDecisionPanel.jsx', 'utf8')
  assert.match(decision, /Customer acceptance/)
  assert.match(decision, /Changes requested/)
  assert.match(decision, /onChangesRequested/)
  assert.match(decision, /Discount requested by customer/)
  assert.match(decision, /revision: \(est\.revision \|\| 0\) \+ 1/)
  assert.match(store, /updateServiceFlow\(oppId, patch\)/)
})

test('Service review still requires the request, travel, and required survey evidence', () => {
  assert.match(service, /!est\.travelConfirmed/)
  assert.match(service, /est\.surveyRequired && !\(\(store\.surveys \|\| \[\]\)\.find/)
  // The single review only gates the opportunities still carrying one.
  assert.match(service, /!!reviewApproval/)
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

test('Service progress uses grouped industrial stages while retaining detailed panels', () => {
  const workbench = fs.readFileSync('src/pages/Workbench.jsx', 'utf8')
  assert.match(workbench, /const SERVICE_WORKFLOW_STEPS = \[/)
  for (const label of ['Service Request', 'Scope Confirmation', 'Standard Rate Schedule', 'Customer Acceptance', 'Service Execution & Close']) {
    assert.match(workbench, new RegExp(label.replace(/[&]/g, '\\&')))
  }
  assert.match(workbench, /servicePhaseStart/)
  assert.match(workbench, /servicePhaseEnd/)
  assert.match(workbench, /ServiceDecisionPanel/)
  assert.match(workbench, /ServiceExecutionPanel/)
  assert.match(workbench, /ServiceReportPanel/)
  assert.match(workbench, /ServiceInvoicePanel/)
})

test('Service grouped stages use explicit operational handoffs', () => {
  const workbench = fs.readFileSync('src/pages/Workbench.jsx', 'utf8')
  assert.doesNotMatch(workbench, /serviceAutoAdvance/)
  assert.match(workbench, /servicePhaseStart/)
  assert.match(workbench, /servicePhase: step\.servicePhaseStart/)
  assert.match(workbench, /onContinueToScope/)
  assert.match(workbench, /onContinueToRate/)
})

// ---- Path A: the published rate schedule, and billing on actual days -------

test('the standard rate schedule is issued after scope and before execution', () => {
  const panel = fs.readFileSync('src/workbench/RateSheetPanel.jsx', 'utf8')
  // The same enclosure a full service proposal carries, sent early and alone.
  assert.match(panel, /SERVICE_RATE_SCHEDULE_URL/)
  assert.match(panel, /ENCLOSURES\.serviceRates/)
  assert.match(panel, /kind: 'rate-sheet'/)
  assert.match(panel, /rateSheetSentOn/)
  assert.match(panel, /emailCc/)
  assert.match(panel, /emailBody/)
  assert.match(panel, /Confirm sent/)
  assert.match(panel, /onConfirmSent/)
  assert.match(panel, /service-rate-composer/)
  assert.match(panel, /service-rate-layout/)
  assert.match(panel, /service-rate-details/)
  assert.match(panel, /service-rate-email/)
  // Issuing it is what prepares the Path A offer.
  assert.match(panel, /offerPrepared: true/)
  // Re-issued rather than re-created when the customer negotiates.
  assert.match(panel, /Re-issue rate schedule/)
  assert.match(service, /offerMode === 'Standard Rate Sheet' && <RateSheetPanel/)
  assert.doesNotMatch(service, /Confirm scope and survey/)
})

test('Service forms use wide bordered controls and avoid leading-zero numeric entry', () => {
  const service = fs.readFileSync('src/workbench/WbService.jsx', 'utf8')
  const survey = fs.readFileSync('src/workbench/SurveyPanel.jsx', 'utf8')
  const decision = fs.readFileSync('src/workbench/ServiceDecisionPanel.jsx', 'utf8')
  assert.match(service, /service-number-input/)
  assert.match(service, /value=\{est\[k\] \?\? ''\}/)
  assert.match(survey, /service-form-control/)
  assert.match(decision, /service-form-control/)
})

test('customer changes return to the Standard Rate Schedule stage', () => {
  const workbench = fs.readFileSync('src/pages/Workbench.jsx', 'utf8')
  assert.match(workbench, /onChangesRequested=\{\(\) => advanceStep\('service-rate'\)\}/)
})

test('Service execution offers engineer suggestions without removing free text entry', () => {
  const execution = fs.readFileSync('src/workbench/ServiceExecutionPanel.jsx', 'utf8')
  assert.match(execution, /datalist/)
  assert.match(execution, /engineerSuggestions/)
  assert.match(execution, /Assigned service engineer/)
})

test('discount approval defaults to fifteen percent while remaining admin configurable', () => {
  const seed = fs.readFileSync('src/seed.js', 'utf8')
  const gates = fs.readFileSync('src/gates.js', 'utf8')
  const admin = fs.readFileSync('src/pages/Admin.jsx', 'utf8')
  assert.match(seed, /discountPct: 15/)
  assert.match(gates, /: 15/)
  assert.match(admin, /discountPct \?\? 15/)
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

test('Service report stays on the Standard Rate Sheet path', () => {
  const report = fs.readFileSync('src/workbench/ServiceReportPanel.jsx', 'utf8')
  assert.match(report, /accepted rate sheet/)
  assert.doesNotMatch(report, /Customized Proposal/)
  assert.doesNotMatch(report, /Detailed BOQ \/ SoW required/)
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

test('a closed historical customised proposal keeps the full matrix', async () => {
  const { serviceMatrixExempt, transitionBlockers } = await gatesFor()
  const state = stateWith({ offerMode: 'Customized Proposal' })
  const opp = serviceOpp({ status: 'Closed', stage: 'Won' })
  assert.equal(serviceMatrixExempt(opp, state), false)
  const blockers = transitionBlockers(opp, 'Submitted', { revision: '00', bom: [], terms: [] }, state)
  assert.ok(blockers.some(b => b.key === 'tech-approval'))
  assert.ok(blockers.some(b => b.key === 'release'))
})

test('an opportunity already on the single review keeps running on it', async () => {
  const { legacyServiceReview, transitionBlockers, serviceOfferCleared } = await gatesFor()
  const review = { oppId: 'SVC-1', type: 'Service offer review', status: 'Pending' }
  const opp = serviceOpp({ status: 'Closed', stage: 'Won' })
  const state = stateWith({ offerMode: 'Customized Proposal' }, { approvals: [review] })
  assert.ok(legacyServiceReview(opp, state.approvals))

  const blockers = transitionBlockers(opp, 'Submitted', { revision: '00', bom: [], terms: [] }, state)
  assert.ok(blockers.some(b => b.key === 'service-review'), 'the in-flight review still gates')
  assert.equal(blockers.some(b => b.key === 'tech-approval'), false, 'it must not also acquire §5')

  const approved = stateWith({ offerMode: 'Customized Proposal' },
    { approvals: [{ ...review, status: 'Approved' }] })
  assert.equal(serviceOfferCleared(opp, null, approved), true)
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

// ---- One rate dataset, editable in Admin -----------------------------------

test('the published role table and the billed rates are one dataset', async () => {
  const { seedRateSheets } = await import('../src/seed.js')
  const { roleRates } = await import('../src/serviceRates.js')

  // The engineer and senior-engineer rows are not copies — they read the same
  // numbers the invoice bills from, so the two can no longer drift apart.
  const india = roleRates(seedRateSheets.India)
  const engineer = india.find(r => r.role === 'Service Engineer')
  const senior = india.find(r => r.role === 'Senior Engineer / Commissioning')
  assert.equal(engineer.derived, true)
  assert.equal(engineer.ratePerDay, seedRateSheets.India.rates.engineerDay)
  assert.equal(senior.ratePerDay, seedRateSheets.India.rates.seniorDay)

  // Roles the sheet prices on their own still carry their own rate.
  const training = india.find(r => r.role === 'Training (per day, classroom)')
  assert.equal(training.derived, false)
  assert.ok(training.ratePerDay > 0)

  assert.ok(roleRates(seedRateSheets.International).every(r => r.ratePerDay > 0))
})

test('service rates are editable and the edit is audited', () => {
  const store = fs.readFileSync('src/store.jsx', 'utf8')
  const admin = fs.readFileSync('src/pages/Admin.jsx', 'utf8')
  assert.match(store, /updateRateSheets\(sheet, patch\)/)
  assert.match(store, /'Service rate sheet updated'/)
  assert.match(admin, /function ServiceRateSheetEditor/)
  assert.match(admin, /store\.updateRateSheets\(sheet, \{ rates: \{ \[key\]: Math\.max\(0, v\) \} \}\)/)
  // The old claim that rates were editable on Price Lists is gone.
  assert.doesNotMatch(admin, /Rates are editable on the Price Lists page/)
})

test('an admin rate revision survives a demo wipe', async () => {
  const { emptyState } = await import('../src/appState.js')
  const edited = { India: { currency: 'INR', gst: 18, rates: { engineerDay: 999 }, roles: [] } }
  assert.equal(emptyState({ rateSheets: edited, config: {} }).rateSheets.India.rates.engineerDay, 999)
})

// ---- Tier 3: classification, region and follow-up --------------------------

test('the Standard Rate Sheet lane is fixed for new Service scope', async () => {
  const wb = fs.readFileSync('src/workbench/WbService.jsx', 'utf8')
  const scope = fs.readFileSync('src/workbench/ServiceScopePanel.jsx', 'utf8')
  assert.match(scope, /offerMode: 'Standard Rate Sheet'/)
  assert.match(scope, /surveyRequired: siteVisitSelected/)
  assert.doesNotMatch(wb, /SoW \/ Proposal/)
  assert.doesNotMatch(wb, /AMC/)
})

test('Service no longer derives a customised lane from enquiry language', () => {
  const wb = fs.readFileSync('src/workbench/WbService.jsx', 'utf8')
  assert.match(wb, /serviceUsesStandardRates\(opp, store\)/)
  assert.doesNotMatch(wb, /aiSourcesFor/)
  assert.doesNotMatch(wb, /suggestedOfferFor/)
})

test('the site location picks the rate sheet', async () => {
  const { sheetForLocation, sheetFor } = await import('../src/serviceRates.js')
  assert.equal(sheetForLocation('Chennai, Tamil Nadu'), 'India')
  assert.equal(sheetForLocation('Pune, Maharashtra - 411001'), 'India')
  assert.equal(sheetForLocation('Jubail, Saudi Arabia'), 'International')
  assert.equal(sheetForLocation('Dubai, UAE'), 'International')
  // ModAE is an Indian company: a blank or unreadable address stays domestic.
  assert.equal(sheetForLocation(''), 'India')
  assert.equal(sheetForLocation('Plot 7, Phase II'), 'India')

  const opp = { eucLocation: 'Muscat, Oman' }
  assert.equal(sheetFor(opp, {}), 'International')
  // An explicit choice still wins over the address.
  assert.equal(sheetFor(opp, { sheet: 'India' }), 'India')
})

test('a quiet customer and an expired schedule both raise an alert', async () => {
  const { computeAlerts } = await import('../src/monitoring.js')
  const day = 86400000
  const ago = n => new Date(Date.now() - n * day).toISOString().slice(0, 10)
  const opp = { id: 'SVC-9', status: 'Open', owner: 'RS', lastUpdated: ago(1) }
  const run = est => computeAlerts({
    role: 'RS', opportunities: [opp], approvals: [], svcEstimates: [est], config: {},
  }).filter(a => a.type.startsWith('rate-sheet'))

  assert.equal(run({ oppId: 'SVC-9', rateSheetSentOn: ago(2) }).length, 0, 'a fresh schedule is not chased')

  const idle = run({ oppId: 'SVC-9', rateSheetSentOn: ago(10) })
  assert.equal(idle[0].type, 'rate-sheet-idle')

  const expired = run({ oppId: 'SVC-9', rateSheetSentOn: ago(45) })
  assert.equal(expired[0].type, 'rate-sheet-expiry')
  assert.match(expired[0].nextAction, /Re-validate/)

  // Once the customer has answered there is nothing to chase.
  assert.equal(run({ oppId: 'SVC-9', rateSheetSentOn: ago(45), customerDecision: 'Accepted' }).length, 0)
})

test('new Service scope exposes only the Standard Rate Sheet path', () => {
  const wb = fs.readFileSync('src/workbench/WbService.jsx', 'utf8')
  const scope = fs.readFileSync('src/workbench/ServiceScopePanel.jsx', 'utf8')
  assert.match(wb, /Standard Rate Sheet/)
  assert.match(scope, /Site visit/)
  assert.doesNotMatch(wb, /<option>Customized Proposal<\/option>/)
  assert.doesNotMatch(wb, /<span>SoW \/ Proposal<\/span>/)
  assert.doesNotMatch(wb, /<span>AMC<\/span>/)
  assert.doesNotMatch(wb, /Send scope to proposal/)
})

test('standard Service scope confirms a rate-sheet offer without proposal sources', () => {
  const scope = fs.readFileSync('src/workbench/ServiceScopePanel.jsx', 'utf8')
  assert.match(scope, /offerMode: 'Standard Rate Sheet'/)
  assert.match(scope, /surveyRequired: siteVisitSelected/)
  assert.doesNotMatch(scope, /offerMode: 'Customized Proposal'/)
})

test('active Service records use the Standard Rate Sheet lane in Send Offer', () => {
  const workbench = fs.readFileSync('src/pages/Workbench.jsx', 'utf8')
  const rateSheet = fs.readFileSync('src/workbench/RateSheetPanel.jsx', 'utf8')
  assert.match(workbench, /opp\.route === 'Service'/)
  assert.match(workbench, /<RateSheetPanel opp=\{opp\}/)
  assert.match(rateSheet, /Preview rate schedule/)
  assert.match(rateSheet, /kind: 'rate-sheet'/)
})

test('active legacy Service records are treated as published-rate offers unless discounted', async () => {
  const { serviceMatrixExempt } = await gatesFor()
  assert.equal(serviceMatrixExempt(serviceOpp({ status: 'Open' }), stateWith({ offerMode: 'Customized Proposal' })), true)
  assert.equal(serviceMatrixExempt(serviceOpp({ status: 'Open' }), stateWith({ offerMode: 'Customized Proposal', rateDiscountPct: 10 })), false)
  assert.equal(serviceMatrixExempt(serviceOpp({ status: 'Closed', stage: 'Won' }), stateWith({ offerMode: 'Customized Proposal' })), false)
})

test('standard Customer Decision does not show an approval warning', () => {
  const decision = fs.readFileSync('src/workbench/ServiceDecisionPanel.jsx', 'utf8')
  assert.match(decision, /standardRateOffer/)
  assert.match(decision, /!standardRateOffer && !review/)
  assert.match(decision, /no additional approval is required/)
})
