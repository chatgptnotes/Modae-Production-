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
import { REVISION_TYPES, routeForType, contextForType, canSignBStep } from '../src/seed.js'

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

test('Spares skips the Brownfield sign-off UI', () => {
  const workbench = read('src/pages/Workbench.jsx')
  assert.match(workbench, /opp\.context === 'Brownfield' && opp\.oppType !== 'Spares'/)
  assert.match(workbench, /<BSteps opp=\{opp\}/)
  const builder = read('src/workbench/PropBuilder.jsx')
  assert.doesNotMatch(builder, /b-steps|openSteps|B-01.*B-05/)
})

test('legacy Brownfield records remain loadable without active sign-off behavior', () => {
  const state = read('src/appState.js')
  assert.match(state, /if \(!s\.bSteps \|\| typeof s\.bSteps !== 'object' \|\| Array\.isArray\(s\.bSteps\)\) s\.bSteps = \{\}/)
  assert.match(state, /if \(!s\.bStepOwners \|\| typeof s\.bStepOwners !== 'object' \|\| Array\.isArray\(s\.bStepOwners\)\) s\.bStepOwners = \{\}/)
  const store = read('src/store.jsx')
  assert.match(store, /assignBStep\(/)
  assert.match(store, /signBStep\(/)
  assert.doesNotMatch(store, /delete steps\[spec\.step\]/)
})

test('Brownfield sign-off belongs to the opportunity salesperson or LJS', () => {
  assert.equal(canSignBStep('RS', brownfieldOpp), true)
  assert.equal(canSignBStep('LJS', brownfieldOpp), true)
  for (const role of ['AH', 'TECH', 'PP', 'SUPER', 'ADMIN']) {
    assert.equal(canSignBStep(role, brownfieldOpp), false, `${role} must not sign for RS`)
  }
  assert.equal(canSignBStep('LJS', { ...brownfieldOpp, owner: 'LJS' }), true)
})

test('Brownfield sign-off UI identifies the opportunity salesperson, not step owners', () => {
  const panel = read('src/workbench/BSteps.jsx')
  assert.match(panel, /canSignBStep\(store\.role, opp\)/)
  assert.match(panel, /Opportunity Owner: \{displayRole\(opp\.owner\)\}/)
  assert.doesNotMatch(panel, /Responsible person/)
  assert.doesNotMatch(panel, /assignBStep\(/)
})

test('revision categories no longer route to Brownfield sign-off steps', () => {
  const seed = read('src/seed.js')
  assert.doesNotMatch(seed, /REVISION_TYPES[\\s\\S]*step:/)
  const store = read('src/store.jsx')
  assert.doesNotMatch(store, /back to \$\{spec\.step\}|delete steps\[spec\.step\]/)
})

test('follow-up communications keep message bodies inside expandable rows', () => {
  const workbench = read('src/pages/Workbench.jsx')
  assert.match(workbench, /<details key=\{c\.id \|\| `\$\{c\.ts\}-\$\{i\}`\} className="communication-disclosure">/)
  assert.match(workbench, /<summary className="communication-summary">/)
  assert.match(workbench, /className="communication-expanded-body">\{c\.body\}/)
  assert.doesNotMatch(workbench, /<div className="hint">\{c\.body\}<\/div>/)
})

test('completed workflow stages can be moved back with a recorded reason', () => {
  const workbench = read('src/pages/Workbench.jsx')
  assert.match(workbench, /onBack=\{step => \{/)
  assert.match(workbench, /openBackwardTransition\(activeStepConfig\)/)
  assert.match(workbench, /Move back to \{activeStepConfig\?\.label \|\| 'this stage'\} to edit/)
  assert.match(workbench, /targetIndex >= currentIndex\) return/)
  assert.match(workbench, /targetStep: step, reason: ''/)
  assert.match(workbench, /moveBackwardToStep\(transition\.targetStep/)
  assert.match(workbench, /Returning from \{opp\.milestone\} to \{transition\.target\} is allowed for corrections/)
  assert.match(workbench, /!reason\?\.trim\(\)/)
  assert.match(workbench, /disabled=\{!transition\.reason\?\.trim\(\)\}/)
})

test('Workbench waits for sync before showing not-found and keeps loaded hooks stable', () => {
  const workbench = read('src/pages/Workbench.jsx')
  assert.match(workbench, /function OpportunityLoading\(\)/)
  assert.match(workbench, /store\.liveSyncStatus === 'connecting'/)
  assert.match(workbench, /return <WorkbenchWorkspace oppId=\{oppId\}/)
  assert.match(workbench, /function WorkbenchWorkspace\(\{ oppId, tab = 'overview', store, searchParams, opp \}\)/)
})

test('Service backward movement restores the selected service phase', () => {
  const workbench = read('src/pages/Workbench.jsx')
  assert.match(workbench, /if \(opp\.route === 'Service' && step\.servicePhase != null\)/)
  assert.match(workbench, /store\.updateServiceFlow\(opp\.id, \{ servicePhase: step\.servicePhase \}\)/)
})

test('communication log rows wrap long subjects and metadata inside the card', () => {
  const workbench = read('src/pages/Workbench.jsx')
  const styles = read('src/styles.css')
  assert.match(workbench, /className="communication-row-copy"/)
  assert.match(workbench, /className="communication-row-actions"/)
  assert.match(styles, /\.communication-row-copy \{[\s\S]*min-width: 0;[\s\S]*overflow-wrap: anywhere;/)
  assert.match(styles, /\.communication-row-actions \{[\s\S]*flex-wrap: wrap;/)
})

test('follow-up panels use a compact aligned responsive grid', () => {
  const workbench = read('src/pages/Workbench.jsx')
  const styles = read('src/styles.css')
  assert.match(workbench, /<div className="ana-grid follow-up-grid">/)
  assert.equal((workbench.match(/follow-up-panel/g) || []).length, 5)
  assert.doesNotMatch(workbench, /<SubmissionPanel opp=\{opp\} \/>\s*<\/div>\s*<div className="ana-card c-6 follow-up-panel">\s*<div className="ana-title">Customer communications<\/div>/s)
  assert.match(workbench, /className="follow-up-control-row revision-control-row"/)
  assert.match(workbench, /className="follow-up-control-row competitor-control-row"/)
  assert.match(workbench, /className="follow-up-form-stack"/)
  assert.match(styles, /\.follow-up-grid \{ align-items: stretch;/)
  assert.match(styles, /\.follow-up-panel \{ display: flex; min-width: 0; flex-direction: column;/)
  assert.match(styles, /@media \(max-width: 760px\) \{[\s\S]*\.follow-up-panel \{ grid-column: span 12;/)
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

test('sourcing row actions stay compact and accessible', () => {
  const spares = read('src/workbench/WbSpares.jsx')
  const styles = read('src/styles.css')
  assert.match(spares, /className="sourcing-row-actions"/, 'row actions should use the shared compact action group')
  assert.match(spares, /className="sourcing-remove-row sourcing-row-action"/, 'remove should remain an icon action')
  assert.match(spares, /title="Confirm sourcing line" aria-label=/, 'confirm should retain an accessible name')
  assert.match(spares, />OK<\/button>/, 'confirm should use the compact OK control')
  assert.match(spares, /title="Sourcing line confirmed">OK<\/Chip>/, 'confirmed rows should use a compact OK badge')
  assert.match(spares, /title="Compare sourcing alternatives" aria-label=/, 'compare should retain an accessible name')
  assert.match(spares, /className="sourcing-row-action sourcing-row-action--compare"/, 'compare should use the compact action styling')
  assert.match(spares, /<Icon name="gitCompare" size=\{14\} \/>/, 'compare should use the compare icon')
  assert.doesNotMatch(spares, /sourcing-row-action--compare[^}]+> Compare<\/button>/, 'compare should not render a visible text label')
  assert.doesNotMatch(spares, /sourcing-row-actions" style=\{\{ display: 'flex', flexDirection: 'column'/,
    'row actions must not force a tall vertical stack')
  assert.match(styles, /\.sourcing-row-actions \{ display: flex; align-items: center;[^}]*flex-wrap: wrap;/,
    'row actions should wrap only when the available table width requires it')
  assert.match(styles, /\.sourcing-row-actions \.sourcing-row-action \{ min-height: 28px;/,
    'row actions should use compact control sizing')
})

test('sourcing alternatives explain AI suggestions and zero-value confirmation is blocked', () => {
  const spares = read('src/workbench/WbSpares.jsx')
  assert.match(spares, /AiBadge label="AI suggested"/)
  assert.match(spares, /Why AI suggested this:/)
  assert.match(spares, /a\.suggestedBy === 'AI'/, 'only records with explicit AI provenance should receive the AI badge')
  assert.match(spares, /isConfirmableSparesLine\(line\)/)
  assert.match(spares, /Enter a positive list price/)
})

test('Compare loads AI-ranked candidates without auto-applying them', () => {
  const spares = read('src/workbench/WbSpares.jsx')
  const api = read('api/ai.js')
  assert.match(spares, /runJson\('spares\.match'/)
  assert.match(spares, /onClick=\{\(\) => openCompare\(line\)\}/)
  assert.match(spares, /suggestedBy: 'AI'/)
  assert.match(spares, /byPartNumber\.set\(line\.pn, result\)/)
  assert.match(spares, /onClick=\{\(\) => useAlternative\(line, a\)\}/)
  assert.match(api, /'spares\.match'/)
  assert.match(api, /function sparesMatchPrompt/)
  assert.match(api, /never invent, complete, or alter a part/)
})

test('invalid sourcing rows show a disabled pricing state instead of an action', () => {
  const spares = read('src/workbench/WbSpares.jsx')
  const styles = read('src/styles.css')
  assert.match(spares, /const confirmable = isConfirmableSparesLine\(line\)/)
  assert.match(spares, /const invalidState = row\.qty <= 0 \? 'Cannot confirm' : 'Needs pricing'/)
  assert.match(spares, /sourcing-row-action--disabled.*disabled/)
  assert.match(styles, /\.sourcing-row-action--disabled[\s\S]*pointer-events: none/)
})

test('sourcing prices are editable and sourcing edits are audited', () => {
  const spares = read('src/workbench/WbSpares.jsx')
  const store = read('src/store.jsx')
  assert.match(spares, /label=\{`List price for \$\{line\.pn \|\| line\.id\} in \$\{displayCurrency\}`\}/,
    'authorized users need a row-level price editor')
  assert.match(spares, /type="text" inputMode=\{step === '1' \? 'numeric' : 'decimal'\}/,
    'numeric sourcing edits must remain visible while typing without a native spinner')
  assert.match(spares, /priceList: 'Manual pricing'/, 'manual prices must identify their source')
  assert.match(spares, /currency: 'INR'/, 'manual prices must be stored in INR')
  assert.match(spares, /patch\.addedByName = addedBy/, 'manual price overrides must record who entered them')
  assert.match(spares, /patch\.addedAt = addedAt/, 'manual price overrides must record when they were entered')
  assert.match(spares, /manualAttribution = line =>/, 'legacy manual rows must use audit attribution when available')
  assert.match(spares, /entry\.action === 'Spares line updated'/, 'legacy attribution must inspect sourcing edits')
  assert.match(spares, /evidence\.addedBy \|\| 'Existing manual entry'/, 'price evidence must show the recorded actor')
  assert.match(store, /withAudit\(next, 'Spares line updated', current\.oppId/,
    'sourcing row edits must be written to the audit trail')
  assert.match(store, /changed\.map\(key => `\$\{key\}:.*->/,
    'audit details must include before and after values')
  assert.match(store, /mintId\('SL', \[\.\.\.s\.sparesLines, \.\.\.additions\]\)/,
    'each imported sourcing row must receive a distinct id')
})

test('manual sourcing lines are entered through a popup form', () => {
  const spares = read('src/workbench/WbSpares.jsx')
  const styles = read('src/styles.css')
  assert.match(spares, /onClick=\{openManualLine\}/)
  assert.match(spares, /<Modal title="Add manual part"/)
  assert.match(spares, /className="sourcing-manual-form" onSubmit=/)
  assert.match(spares, /aria-label="Manual part number"/)
  assert.match(spares, /aria-label="Manual description"/)
  assert.match(spares, /aria-label="Manual list price"/)
  assert.match(spares, /type="button" onClick=\{\(\) => \{ setShowAddPart\(false\)/)
  assert.match(spares, />Done<\/button>/, 'the multi-entry modal needs an explicit finish action')
  const addManualBody = spares.slice(spares.indexOf('const addManual'), spares.indexOf('const openManualLine'))
  assert.doesNotMatch(addManualBody, /setShowAddPart\(false\)/, 'adding a valid line must not close the modal')
  assert.doesNotMatch(spares, /sourcing-manual-row/)
  assert.match(styles, /\.sourcing-manual-modal/)
})

test('sourcing separates part identity and keeps support charges last', () => {
  const spares = read('src/workbench/WbSpares.jsx')
  const styles = read('src/styles.css')
  assert.match(spares, /<th>Part number \/ customer reference<\/th><th>Description<\/th><th>Price source<\/th><th>Quantity<\/th>/)
  assert.match(spares, /orderSparesLines\(lineItems, item => item\.sourceLine\)/)
  assert.match(spares, /isLegacyAutoSparesSupportRow\(l\)/)
  assert.match(spares, /const sourcingPartReference = line =>/)
  assert.match(spares, /const partReference = sourcingPartReference\(line\)/)
  assert.match(spares, /className="sourcing-cell-part-number/)
  assert.match(spares, /className="sourcing-cell-description/)
  assert.match(styles, /table-layout: auto/)
  assert.match(styles, /th:nth-child\(12\)/)
})

test('sourcing lets the opportunity owner complete customer references', () => {
  const spares = read('src/workbench/WbSpares.jsx')
  assert.match(spares, /Customer reference for \$\{line\.pn \|\| line\.id\}/)
  assert.match(spares, /updateLine\(line, 'custRef'/)
})

test('confirmed spares sourcing replaces stale proposal rows instead of appending duplicates', () => {
  const store = read('src/store.jsx')
  const spares = read('src/workbench/WbSpares.jsx')
  assert.match(store, /const lines = s\.sparesLines\.filter\(l => l\.oppId === oppId && l\.confirmed\)/)
  assert.match(store, /orderedSparesProposalBom\(orderedSourceLines, s\.priceLists, costing\)/)
  assert.match(store, /const orderedSourceLines = sourceLines\.filter\(l => l\.origin !== 'proposal-support'\)/)
  assert.match(read('src/proposal/sparesBoq.js'), /export function sparesProposalBom\(lines = \[\], priceLists = \{\}\)/)
  assert.match(store, /proposals: \{ \.\.\.s\.proposals, \[oppId\]: \{ \.\.\.base, bom \} \}/)
  assert.doesNotMatch(store, /const mergedBom = \[\.\.\.bom, \.\.\.added\]/)
  assert.match(spares, /Proposal workbook BoM synchronized from the confirmed sourcing lines/)
})

test('spares financial preview totals include priced rows before confirmation', () => {
  const spares = read('src/workbench/WbSpares.jsx')
  assert.match(spares, /const pricedItems = calculatedItems\.filter\(item => item\.qty > 0 && item\.listUnitPrice > 0\)/,
    'financial preview should include rows with quantity and a positive price')
  assert.match(spares, /const activeItems = calculatedItems\.filter\(item => item\.qty > 0 && item\.confirmed\)/,
    'proposal handoff should still be gated by confirmed rows')
  assert.match(spares, /const totals = useMemo\(\(\) => pricedItems\.reduce/,
    'summary totals should calculate from priced rows, not confirmed-only rows')
  assert.match(spares, /disabled=\{!canContinueToProposal\}/,
    'continuing to the proposal should still require confirmed rows')
  assert.doesNotMatch(spares, /Preview includes \{pendingConfirmationCount\} priced line/,
    'the financial summary should not display the pending-confirmation preview note')
})

test('opening a Spares proposal repairs stale lead rows from confirmed sourcing data', () => {
  const proposal = read('src/pages/Proposal.jsx')
  assert.match(proposal, /import \{ useStore, sparesProposalBom, snapshotProposal \} from '\.\.\/store\.jsx'/)
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

test('closed opportunity close-out exposes the shared mark-won control', () => {
  const workbench = read('src/pages/Workbench.jsx')
  const ui = read('src/ui.jsx')
  assert.match(workbench, /MarkWonControl opp=\{opp\} store=\{store\}/)
  assert.match(ui, /store\.markWon\(opp\.id, value\)/)
  assert.match(ui, /Won reason/)
})

test('open close-out chooses the outcome before showing its reason', () => {
  const workbench = read('src/pages/Workbench.jsx')
  assert.match(workbench, /role="radiogroup" aria-label="Close opportunity outcome"/)
  assert.match(workbench, /value="Lost" checked=\{closeOutcome === 'Lost'\}/)
  assert.match(workbench, /value="Won" checked=\{closeOutcome === 'Won'\}/)
  assert.match(workbench, /closeOutcome === 'Lost'/)
  assert.match(workbench, /closeOutcome === 'Won'/)
  assert.match(workbench, /WON_REASONS\.map/)
  assert.match(workbench, /store\.closeLost\(opp\.id, lossReason/)
  assert.match(workbench, /store\.markWon\(opp\.id, reason\)/)
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
