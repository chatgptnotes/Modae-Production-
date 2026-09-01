// Diagram 02's workflow objects (B-01..B-05, the §4 site survey, typed
// revisions, §8 competitor and loss capture) all existed in the store and the
// gates before this suite, but nothing rendered them — which left every
// Brownfield opportunity blocked on a sign-off no screen could give. These
// tests pin the screens to the store actions so that cannot silently recur.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { readiness } from '../src/gates.js'
import { B_STEPS, REVISION_TYPES, routeForType, contextForType } from '../src/seed.js'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

// ---------------------------------------------------------------------------
// §3 — the Brownfield B-step chain must be signable, or it is a deadlock.
// ---------------------------------------------------------------------------

const brownfieldOpp = {
  id: 'X-1', sellTo: 'ACME', oppName: 'Retrofit', owner: 'RS', customerStatus: 'Green',
  oppType: 'Spares', route: routeForType('Spares'), context: contextForType('Spares'),
  milestone: 'Proposal',
}
const pricedProposal = { bom: [{ qtyPerUnit: 1, listPrice: 100, quoted: '' }], terms: [], revision: '00' }
const allSigned = Object.fromEntries(B_STEPS.map(s => [s.id, { state: 'Signed', by: 'RS', at: '2026-08-19' }]))

test('signing every B-step clears the Brownfield readiness block', () => {
  const blocked = readiness(brownfieldOpp, pricedProposal, { approvals: [], bSteps: {} })
  assert.ok(blocked.find(b => b.key === 'b-steps'), 'an unsigned chain must block')

  const clear = readiness(brownfieldOpp, pricedProposal, { approvals: [], bSteps: { 'X-1': allSigned } })
  assert.equal(clear.find(b => b.key === 'b-steps'), undefined,
    'a fully signed chain must clear — otherwise the block has no exit')
})

test('a partially signed chain names the next step owed', () => {
  const partial = { 'X-1': { 'B-01': { state: 'Signed', by: 'RS' } } }
  const b = readiness(brownfieldOpp, pricedProposal, { approvals: [], bSteps: partial })
    .find(x => x.key === 'b-steps')
  assert.match(b.text, /B-02/, 'the blocker must point at the next unsigned step')
})

test('the B-step panel is reachable and wired to the store', () => {
  const panel = read('src/workbench/BSteps.jsx')
  assert.match(panel, /store\.signBStep\(/, 'the panel must sign steps')
  assert.match(panel, /store\.unsignBStep\(/, 'and be able to reopen one')
  // "All above activities are approved only by Assigned Salesperson".
  assert.match(panel, /store\.role === opp\.owner/, 'sign-off belongs to the assigned salesperson')

  const workbench = read('src/pages/Workbench.jsx')
  assert.match(workbench, /import BSteps from '\.\.\/workbench\/BSteps\.jsx'/)
  assert.match(workbench, /opp\.context === 'Brownfield' \? \[\['steps'/,
    'the B-step tab must show on the Brownfield lane only')
  assert.match(workbench, /sub === 'steps' && <BSteps/)

  const builder = read('src/workbench/PropBuilder.jsx')
  assert.match(builder, /bl\.key === 'b-steps' && openSteps/,
    'the readiness blocker must offer a route to the panel that clears it')
})

test('spares confirmation workbench is reachable before Sourcing advances', () => {
  const workbench = read('src/pages/Workbench.jsx')
  assert.match(workbench, /opp\.route === 'Spares' && \(\s*<div className="ana-card c-12 sourcing-spares-workbench">\s*<WbSpares opp=\{opp\}/s,
    'Spares opportunities must expose line confirmations on the Sourcing tab')
  const spares = read('src/workbench/WbSpares.jsx')
  assert.match(spares, /Request price update/, 'expired price blockers must have a visible recovery action')
  const styles = read('src/styles.css')
  assert.match(styles, /\.sourcing-spares-workbench \.sheet th:last-child/, 'the recovery Actions column must stay visible on wide sheets')
})

// ---------------------------------------------------------------------------
// §4 — the service site-survey branch.
// ---------------------------------------------------------------------------

test('the service workbench can set surveyRequired and run the survey chain', () => {
  const panel = read('src/workbench/SurveyPanel.jsx')
  assert.match(panel, /surveyRequired: e\.target\.checked/,
    'the "Site Survey Required?" decision must be settable — gates.js reads this flag')
  assert.match(panel, /store\.requestSurvey\(/)
  assert.match(panel, /store\.updateSurvey\(/)
  assert.match(panel, /sow:/, 'the Statement of Work is part of the chain')
  assert.match(read('src/workbench/WbService.jsx'), /<SurveyPanel opp={opp} est={est} \/>/)
})

test('the survey gates only bite once a survey is actually required', () => {
  const svcOpp = { ...brownfieldOpp, oppType: 'Service', route: 'Service', context: 'Service' }
  const state = est => ({ approvals: [], bSteps: {}, surveys: [], svcEstimates: [{ oppId: 'X-1', travelConfirmed: true, ...est }] })
  assert.equal(readiness(svcOpp, pricedProposal, state({})).find(b => b.key === 'survey'), undefined,
    'a standard service prices off the rate sheet with no survey')
  assert.ok(readiness(svcOpp, pricedProposal, state({ surveyRequired: true })).find(b => b.key === 'survey'),
    'a survey-led service must be blocked until the survey is raised')
})

// ---------------------------------------------------------------------------
// §7 — "Identify Type of Revision" routes the rework back to a B-step.
// ---------------------------------------------------------------------------

test('the revision dialog picks a type and passes it through', () => {
  const builder = read('src/workbench/PropBuilder.jsx')
  assert.match(builder, /store\.reviseProposal\(opp\.id, reviseReason\.trim\(\), reviseType\)/,
    'the revision type must reach the store — without it every revision routes to B-05')
  assert.match(builder, /REVISION_TYPES\.map/, 'the type must be chosen, not assumed')
  for (const t of REVISION_TYPES) {
    assert.ok(B_STEPS.some(s => s.id === t.step), `${t.id} must route back to a real B-step`)
  }
})

// ---------------------------------------------------------------------------
// §7/§8 — loss reason and competitor tracking.
// ---------------------------------------------------------------------------

test('losing an opportunity goes through closeLost, which demands a reason', () => {
  const workbench = read('src/pages/Workbench.jsx')
  assert.match(workbench, /store\.closeLost\(opp\.id, lossReason/)
  assert.match(workbench, /store\.addCompetitor\(opp\.id/)
  assert.match(workbench, /store\.removeCompetitor\(c\.id\)/)

  // The drawer used to let a Lost stage save with an empty reason.
  const drawer = read('src/opppanel.jsx')
  assert.match(drawer, /patch\.stage === 'Lost' && !opp\.closedReason/,
    'the drawer must not save a Lost stage without a reason')
  assert.match(drawer, /store\.closeLost\(oppId/)
})

test('the lane an opportunity runs in is visible, not just derived', () => {
  const workbench = read('src/pages/Workbench.jsx')
  assert.match(workbench, /\{opp\.context && <Chip/, 'the header must show the Greenfield / Brownfield / Service lane')
  assert.match(workbench, /\['Lane', `\$\{opp\.context/)
})

// The first revision of a dispatched quote is V2 (the dispatch itself is V1).
// The counter used to include the builder's 'Submitted' timeline entries, so a
// quote's first revision came out labelled V3.
test('revision versions count revisions, not timeline entries', () => {
  const store = read('src/store.jsx')
  assert.match(store, /revisions\.filter\(r => r\.status === 'Revised'\)\.length \+ 2/,
    'only entries marked Revised are versions of the quote')
})
