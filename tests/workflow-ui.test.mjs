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

import { readiness, transitionBlockers } from '../src/gates.js'
import { REVISION_TYPES, routeForType, contextForType } from '../src/seed.js'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

const brownfieldOpp = {
  id: 'X-1', sellTo: 'ACME', oppName: 'Retrofit', owner: 'RS', customerStatus: 'Green',
  oppType: 'Spares', route: routeForType('Spares'), context: contextForType('Spares'), milestone: 'Proposal',
}
const pricedProposal = { bom: [{ qtyPerUnit: 1, listPrice: 100, quoted: '' }], terms: [], revision: '00' }

// ---------------------------------------------------------------------------
// Brownfield opportunities use the standard readiness and approval gates; the
// legacy B-step ledger is retained only for loading older saved records.
test('Brownfield readiness ignores legacy sign-off records', () => {
  const state = { approvals: [], bSteps: {} }
  assert.equal(readiness(brownfieldOpp, pricedProposal, state).some(b => b.key === 'b-steps'), false)
  assert.equal(readiness({ ...brownfieldOpp, milestone: 'Sourcing' }, pricedProposal, state).some(b => b.key === 'b-steps'), false)
  assert.equal(readiness({ ...brownfieldOpp, milestone: 'Proposal' }, pricedProposal, state).some(b => b.key === 'b-steps'), false)
})

test('Brownfield milestone movement is not blocked by B-step sign-off', () => {
  const sourcingOpp = { ...brownfieldOpp, milestone: 'Sourcing' }
  const blockers = transitionBlockers(sourcingOpp, 'Proposal', pricedProposal, { approvals: [], bSteps: {} })
  assert.equal(blockers.some(b => b.key === 'b-steps'), false)
})

test('Brownfield sign-off UI is no longer reachable', () => {
  const workbench = read('src/pages/Workbench.jsx')
  assert.doesNotMatch(workbench, /BSteps/)
  assert.doesNotMatch(workbench, /B-05 Proposal sign-off/)
  assert.doesNotMatch(workbench, /sourcing sign-off - B-01 to B-04/)
  const builder = read('src/workbench/PropBuilder.jsx')
  assert.doesNotMatch(builder, /b-steps|openSteps|B-01.*B-05/)
})

test('legacy Brownfield records remain loadable without active sign-off behavior', () => {
  const state = read('src/appState.js')
  assert.match(state, /if \(!s\.bSteps\) s\.bSteps = \{\}/)
  assert.match(state, /if \(!s\.bStepOwners\) s\.bStepOwners = \{\}/)
  const store = read('src/store.jsx')
  assert.match(store, /assignBStep\(/)
  assert.match(store, /signBStep\(/)
  assert.doesNotMatch(store, /delete steps\[spec\.step\]/)
})

test('revision categories no longer route to Brownfield sign-off steps', () => {
  const seed = read('src/seed.js')
  assert.doesNotMatch(seed, /REVISION_TYPES[\\s\\S]*step:/)
  const store = read('src/store.jsx')
  assert.doesNotMatch(store, /back to \$\{spec\.step\}|delete steps\[spec\.step\]/)
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

test('sourcing prices are editable and sourcing edits are audited', () => {
  const spares = read('src/workbench/WbSpares.jsx')
  const store = read('src/store.jsx')
  assert.match(spares, /aria-label=\{`List price for \$\{l\.pn \|\| l\.custRef \|\| l\.id\}`\}/,
    'authorized users need a row-level price editor')
  assert.match(spares, /priceList: 'Manual entry'/, 'manual prices must identify their source')
  assert.match(spares, /currency: 'INR'/, 'manual prices must be stored in INR')
  assert.match(store, /withAudit\(next, 'Spares line updated', current\.oppId/,
    'sourcing row edits must be written to the audit trail')
  assert.match(store, /changed\.map\(key => `\$\{key\}:.*->/,
    'audit details must include before and after values')
  assert.match(store, /mintId\('SL', \[\.\.\.s\.sparesLines, \.\.\.additions\]\)/,
    'each imported sourcing row must receive a distinct id')
})

test('confirmed spares sourcing replaces stale proposal rows instead of appending duplicates', () => {
  const store = read('src/store.jsx')
  const spares = read('src/workbench/WbSpares.jsx')
  assert.match(store, /const lines = s\.sparesLines\.filter\(l => l\.oppId === oppId && l\.confirmed\)/)
  assert.match(store, /export function sparesProposalBom\(lines = \[\]\)/)
  assert.match(store, /return lines\.filter\(line => line\?\.confirmed\)\.map\(line => \(\{/)
  assert.match(store, /proposals: \{ \.\.\.s\.proposals, \[oppId\]: \{ \.\.\.base, bom \} \}/)
  assert.doesNotMatch(store, /const mergedBom = \[\.\.\.bom, \.\.\.added\]/)
  assert.match(spares, /Proposal workbook BoM synchronized from the confirmed sourcing lines/)
})

test('opening a Spares proposal repairs stale lead rows from confirmed sourcing data', () => {
  const proposal = read('src/pages/Proposal.jsx')
  assert.match(proposal, /import \{ useStore, sparesProposalBom \} from '\.\.\/store\.jsx'/)
  assert.match(proposal, /routeForType\(opp\.oppType\) !== 'Spares'/)
  assert.match(proposal, /store\.sendLinesToProposal\(oppId\)/)
  assert.match(proposal, /setP\(normalize\(next, opp\)\)/)
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

test('the revision dialog keeps typed categories without sign-off routing', () => {
  const builder = read('src/workbench/PropBuilder.jsx')
  assert.match(builder, /store\.reviseProposal\(opp\.id, reviseReason\.trim\(\), reviseType\)/,
    'the revision category must reach the store')
  assert.match(builder, /REVISION_TYPES\.map/, 'the type must be chosen, not assumed')
  assert.ok(REVISION_TYPES.every(t => !t.step), 'revision categories must not route to sign-off steps')
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

test('the opportunity navigation keeps Proposal, Approval and Submitted in the primary row', () => {
  const workbench = read('src/pages/Workbench.jsx')
  const detailTabs = read('src/DetailTabs.jsx')
  assert.match(workbench, /\['approval', 'Approval'\], \['submitted', 'Submitted'\]/)
  assert.match(workbench, /<DetailTabs ariaLabel="Opportunity views" primaryCount=\{8\} showOverflow=\{false\}/)
  assert.match(detailTabs, /primaryCount = 5, showOverflow = true/)
  assert.match(detailTabs, /visible\.slice\(0, primaryCount\)/)
  assert.match(detailTabs, /visible\.slice\(primaryCount\)/)
  assert.match(detailTabs, /showOverflow && !!overflowItems\.length/)
})

// The first revision of a dispatched quote is V2 (the dispatch itself is V1).
// The counter used to include the builder's 'Submitted' timeline entries, so a
// quote's first revision came out labelled V3.
test('revision versions count revisions, not timeline entries', () => {
  const store = read('src/store.jsx')
  assert.match(store, /revisions\.filter\(r => r\.status === 'Revised'\)\.length \+ 2/,
    'only entries marked Revised are versions of the quote')
})
