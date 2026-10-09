import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { seedPoCompare } from '../src/seed.js'
import { LOCAL_ONLY } from '../src/datastore.js'
import { stateFromSaved, VIEW_MODE_PREFERENCE_REV } from '../src/appState.js'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const css = read('src/styles.css')

// The plan requires no horizontal page scroll at 390px. The tablet bar was a
// nowrap flex row carrying brand + 2 bells + chip + install + theme + a 150px
// role select + 2 labelled buttons, and nothing stopped it dragging the page.
test('the page itself never scrolls sideways', () => {
  assert.match(css, /html, body \{ overflow-x: hidden; max-width: 100%; \}/)
  // Wide content still scrolls inside its own container.
  assert.match(css, /\.sheet-wrap[^}]*overflow-x: auto/)
})

test('the phone shell moves secondary utilities into searchable More', () => {
  assert.match(css, /\.tablet-bar \{ flex-wrap: wrap/)
  assert.match(css, /@media \(max-width: 720px\)[\s\S]{0,400}\.tablet-bar \.tb-label \{ display: none; \}/)
  // Every label the media query hides must actually carry the class.
  const app = read('src/App.jsx')
  const tabletApp = read('src/tablet/TabletApp.jsx')
  assert.match(tabletApp, /<MobileMore \/>/)
  assert.match(read('src/tablet/MobileMore.jsx'), /Search pages and tools/)
  assert.match(tabletApp, /aria-label="Main navigation"/)
})

test('tablet shell is isolated from the full-site app shell', () => {
  const app = read('src/App.jsx')
  const tabletApp = read('src/tablet/TabletApp.jsx')
  const tabletHome = read('src/tablet/TabletHome.jsx')
  assert.match(app, /import TabletApp from '\.\/tablet\/TabletApp\.jsx'/)
  assert.doesNotMatch(app, /TabletHome/)
  assert.match(app, /if \(tablet\) return <RequireAuth><TabletApp \/><\/RequireAuth>/)
  assert.match(tabletHome, /from '\.\/tabletTiles\.js'/)
  assert.doesNotMatch(tabletHome, /from '\.\.\/tiles\.js'/)
  assert.match(tabletApp, /<Route path="\/home" element=\{<TabletGate page="tracker"><TabletHome \/><\/TabletGate>\}/)
})

// View mode was read from the viewport once on first visit and never again, so
// rotating a tablet or widening a window left the wrong shell in place.
test('view mode follows the viewport until the user pins it', () => {
  const store = read('src/store.jsx')
  assert.match(store, /syncViewMode\(\) \{/)
  assert.match(store, /followViewportMode\(s\)/)
  assert.match(store, /viewMode: mode, viewModePinned: true, viewModePinnedAt: defaultViewMode\(\)/,
    'an explicit switch must pin the choice')
  const app = read('src/App.jsx')
  assert.match(app, /window\.addEventListener\('resize', onResize\)/)
  assert.match(app, /window\.addEventListener\('orientationchange', onResize\)/)
  assert.match(app, /window\.removeEventListener\('resize', onResize\)/, 'listener must be cleaned up')
})

test('the pin stays on the device rather than syncing to other users', () => {
  assert.ok(LOCAL_ONLY.includes('viewMode'))
  assert.ok(LOCAL_ONLY.includes('viewModePinned'))
  assert.ok(LOCAL_ONLY.includes('viewModePinnedAt'))
})

test('a legacy full-site pin recovers to mobile mode on a phone', () => {
  const previousWindow = globalThis.window
  globalThis.window = { innerWidth: 440 }
  try {
    const restored = stateFromSaved(JSON.stringify({
      opportunities: [],
      viewMode: 'full',
      viewModePinned: true,
    }))
    assert.equal(restored.viewMode, 'tablet')
    assert.equal(restored.viewModePinned, false)
    assert.equal(restored.viewModePreferenceRev, VIEW_MODE_PREFERENCE_REV)
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  }
})

test('the full-site shell exposes a mobile mode recovery action', () => {
  const app = read('src/App.jsx')
  assert.match(app, /className="workspace-mobile-mode"/)
  assert.match(app, /store\.setViewMode\('tablet'\)/)
})

test('approval cards show request time and highlight new pending requests', () => {
  const approvals = read('src/pages/Approvals.jsx')
  assert.match(approvals, /const stamp = ts =>/)
  assert.match(approvals, /toLocaleTimeString\('en-IN'/)
  assert.match(approvals, /requested \{stamp\(a\.ts\)\}/)
  assert.match(approvals, /raised by \{displayRole\(a\.requestedBy\)\} on \{shortDate\(a\.ts\)\}/)
  assert.match(approvals, /const NEW_APPROVAL_MS = 48 \* 60 \* 60 \* 1000/)
  assert.match(approvals, /approval-card-new/)
  assert.match(approvals, /approval-new-pill/)
  assert.match(css, /\.approval-card-new/)
  assert.match(css, /@keyframes approval-new-pulse/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
})

test('approval opportunity facts stay aligned on one desktop row', () => {
  const css = read('src/styles.css')
  assert.match(css, /\.approval-context-facts \{ display: flex; align-items: baseline;[\s\S]*flex-wrap: nowrap;/)
  assert.match(css, /\.approval-context-facts span \{ display: inline-flex; align-items: baseline;[\s\S]*white-space: nowrap;/)
})

test('approval BOQ opens a read-only details popup without navigation', () => {
  const approvals = read('src/pages/Approvals.jsx')
  assert.match(approvals, /function ApprovalBoqModal\(/)
  assert.match(approvals, /onClick=\{\(\) => setBoqOppId\(opp\.id\)\}/)
  assert.match(approvals, /<Modal title=\{`BOQ \/ COMMERCIAL REVIEW — \$\{displayOpportunityId\(opp\.id\)\}`\}/)
  assert.match(approvals, /<table className="approval-boq-table" aria-readonly="true">/)
  assert.match(approvals, /className="approval-boq-group-row"/)
  assert.match(approvals, /<th colSpan=\{5\}>Specification<\/th>/)
  assert.match(approvals, /<th scope="col" className="num">COGS \(₹\)<\/th>/)
  assert.match(approvals, /<th scope="col" className="num">GM \(₹\)<\/th>/)
  assert.match(approvals, /<th scope="col">Price source<\/th>/)
  assert.match(approvals, /No BOQ lines are available for this opportunity\./)
  assert.match(approvals, /onClose=\{\(\) => setBoqOppId\('\'\)\}/)
  assert.doesNotMatch(approvals, /approval-boq-link" onClick=\{\(\) => nav\('\/proposal\//)
  assert.match(css, /\.approval-boq-modal \{[\s\S]*width: min\(1280px, 96vw\)/)
  assert.match(css, /\.approval-boq-table-wrap \{[\s\S]*overflow-x: auto;/)
  assert.match(css, /\.approval-boq-table thead \.approval-boq-group-row th/)
  assert.match(css, /\.approval-boq-table td:nth-child\(4\), \.approval-boq-table td:nth-child\(5\) \{ white-space: nowrap;/)
})

test('approval queue copy explains the decision required', () => {
  const approvals = read('src/pages/Approvals.jsx')
  assert.match(approvals, /\{forMe\.length\} approvals waiting on you/)
  assert.match(approvals, /Oldest has been waiting since \$\{shortDate\(oldestForMe\.ts\)\}/)
  assert.doesNotMatch(approvals, /ACTION REQUIRED.*Needs your decision/)
  assert.match(approvals, /What you're approving/)
  assert.match(approvals, /Customer asked/)
  assert.match(approvals, /ModAE standard/)
  assert.match(approvals, /Requested response/)
  assert.match(approvals, /You are the only approver/)
  assert.match(approvals, /approval-card-top-redesigned/)
  assert.match(approvals, /approval-wait-chip/)
  assert.doesNotMatch(approvals, /<span className="pill Blue">Pending<\/span>/)
})

test('approval decisions require an explicit choice before showing notes', () => {
  const approvals = read('src/pages/Approvals.jsx')
  assert.match(approvals, /const d = draft\.d \|\| ''/)
  assert.match(approvals, /onDraftChange\(\{ d: v \}\)/)
  assert.match(approvals, /function PendingCard\(\{[\s\S]*?\n\}\n\nexport default function Approvals/)
  assert.doesNotMatch(approvals, /export default function Approvals[\s\S]*const PendingCard/)
  assert.match(approvals, /if \(!d\) \{ setErr\('Choose a decision before continuing\.'/)
  assert.match(approvals, /\{d && <textarea/)
  assert.match(approvals, /A note is required for every decision/)
})

test('proposal review remembers matching approved deviations', () => {
  const proposal = read('src/pages/Proposal.jsx')
  assert.match(proposal, /const approvalTermMatches = \(term, value\) =>/)
  assert.match(proposal, /approval\.type !== 'Commercial deviation'/)
  assert.match(proposal, /rememberApprovedFindings\(\[\.\.\.logicalIssues, \.\.\.aiIssues\]/)
  assert.match(proposal, /severity: 'info'/)
  assert.match(proposal, /Already approved/)
  assert.match(proposal, /displayRole\(approval\.approver\)/)
})

test('proposal review banner reflects the validation state', () => {
  const proposal = read('src/pages/Proposal.jsx')
  const css = read('src/styles.css')
  assert.match(proposal, /const reviewBanner = reviewStatus === 'Needs attention'/)
  assert.match(proposal, /Validation needs attention/)
  assert.match(proposal, /Review complete/)
  assert.match(proposal, /Review override accepted/)
  assert.match(proposal, /proposal-review-strip-\$\{reviewBanner\.tone\}/)
  assert.match(css, /\.proposal-review-strip-warning/)
  assert.match(css, /\.proposal-review-strip-success/)
})

test('approval cards fill the approvals workspace and stay compact', () => {
  assert.match(css, /\.approvals-page \.approval-card \{[\s\S]*width: 100%;[\s\S]*max-width: 1100px;[\s\S]*box-sizing: border-box;[\s\S]*row-gap: 12px;/)
  assert.match(css, /\.approvals-page \.approval-opportunity-context \{ margin-block: 6px; padding: 8px 10px; \}/)
  assert.match(css, /\.approvals-page \.approval-context-deviations > div \{ gap: 6px; padding-top: 3px; \}/)
  assert.match(css, /\.approvals-page \.approval-meta \{ margin-top: 8px; padding-top: 6px; \}/)
})

test('ModAE branding is centralized without changing tablet tile ownership', () => {
  const brand = read('src/branding/modae.js')
  const icons = read('src/icons.jsx')
  const proposal = read('src/proposalDoc.js')
  const tabletTiles = read('src/tablet/tabletTiles.js')
  assert.match(brand, /brand-profile\.json/)
  assert.match(brand, /products\.json/)
  assert.match(brand, /official-logo\.png/)
  assert.match(brand, /letterheadUrl/)
  assert.match(icons, /MODAE_BRAND\.logoUrl/)
  assert.match(proposal, /MODAE_BRAND\.letterhead\.legalName/)
  assert.match(proposal, /MODAE_BRAND\.letterhead\.gstin/)
  assert.doesNotMatch(proposal, /29AAAAA0000A1Z5|U29309KA2019PTC000000/)
  assert.doesNotMatch(tabletTiles, /modae\.js|products\.json|red-logo/)
})

test('customer documents use the original ModAE letterhead template identity', () => {
  const brand = read('src/branding/modae.js')
  const proposal = read('src/proposalDoc.js')
  const printDoc = read('src/proposal/PrintDoc.jsx')
  const css = read('src/styles.css')
  // Capital "In" per the 18 Aug branding-guideline email.
  assert.match(brand, /Your Partners In Achieving Excellence/)
  assert.match(brand, /MODAE INDIA PRIVATE LIMITED/)
  assert.match(brand, /29AARCM8622J1ZQ/)
  assert.match(brand, /U62099KA2024PTC185715/)
  assert.match(proposal, /MODAE_BRAND\.letterhead/)
  assert.match(printDoc, /OfficialLetterheadFooter/)
  // The guideline footer is centralized so HTML/PDF and Excel exports cannot drift.
  assert.match(printDoc, /MODAE_DOCUMENT_STANDARDS\.footerLines/)
  assert.match(brand, /ModAE India Private Limited/)
  assert.match(brand, /CIN: U62099KA2024PTC185715 \| GST: 29AARCM8622J1ZQ/)
  assert.match(css, /\.doc-official-footer/)
})

test('the transparent ModAE watermark is attached to the app shells and login', () => {
  const app = read('src/App.jsx')
  const tabletApp = read('src/tablet/TabletApp.jsx')
  const login = read('src/pages/Login.jsx')
  const watermark = read('src/branding/BrandWatermark.jsx')
  assert.match(app, /import BrandWatermark from '\.\/branding\/BrandWatermark\.jsx'/)
  assert.match(app, /<BrandWatermark variant="shell" \/>/)
  assert.match(tabletApp, /import BrandWatermark from '\.\.\/branding\/BrandWatermark\.jsx'/)
  assert.match(tabletApp, /<BrandWatermark variant="tablet" \/>/)
  assert.match(login, /import BrandWatermark from '\.\.\/branding\/BrandWatermark\.jsx'/)
  assert.match(login, /<BrandWatermark variant="login" \/>/)
  assert.match(watermark, /MODAE_BRAND\.logoUrl/)
  assert.match(css, /\.brand-watermark \{[\s\S]*position: fixed;/)
  assert.match(css, /mix-blend-mode: soft-light/)
  assert.match(css, /@keyframes modae-watermark-drift/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.brand-watermark__mark \{ animation: none; \}/)
  assert.match(css, /@media print \{[\s\S]*\.brand-watermark \{ display: none !important; \}/)
})

test('all visible product branding is ModAE', () => {
  const visibleFiles = [
    'index.html', 'public/manifest.webmanifest', 'src/App.jsx', 'src/tablet/TabletApp.jsx',
    'src/install.jsx', 'src/pages/Portal.jsx', 'src/pages/Register.jsx', 'src/pages/Folders.jsx',
    'src/pages/Proposal.jsx', 'src/pages/Workbench.jsx', 'src/proposal/DocEditor.jsx',
  ]
  for (const file of visibleFiles) assert.doesNotMatch(read(file), /WinTrack|wintrack-pipeline/)
  assert.match(read('src/appState.js'), /wintrack-modae-v4/, 'compatibility storage key must remain stable')
  assert.match(read('src/sharepoint.js'), /wintrack-sharepoint-v1/, 'backend config key must remain stable')
})

test('compact sidebar keeps the official logo and expand control visible', () => {
  const css = read('src/styles.css')
  assert.match(css, /\.sidebar-compact \.brand {[^}]*min-height: 64px/)
  assert.match(css, /\.sidebar-compact \.brand \.modae-logo {[^}]*width: 36px/)
  assert.match(css, /\.sidebar-compact \.sidebar-toggle {[^}]*position: absolute/)
  assert.match(css, /\.shell\.sidebar-compact:not\(\.tablet-mode\) > \.sidenav \.sidebar-toggle \{[\s\S]*right: -1\.45rem/)
})

// Scenario 6 opened on "no PO received" and needed a Simulate click first.
test('the PO validation scenario opens on a PO already in review', () => {
  const po = seedPoCompare['2601122LJS']
  assert.ok(po, 'the launcher target must have a seeded PO')
  assert.equal(po.status, 'In review')
  assert.ok(po.received, 'it must carry a received date')
  assert.ok(po.lines.length > 0, 'and lines to compare')
  assert.ok(po.lines.some(l => l.state === 'Review required'),
    'the demo needs at least one mismatch to talk about')
})

test('the seeded PO is backfilled into saved state without clobbering work', () => {
  // migrate() moved to appState.js so the demo-data gating could be run by the
  // tests rather than regex-matched — see tests/demo-data.test.mjs.
  const state = read('src/appState.js')
  assert.match(state, /for \(const \[oppId, po\] of Object\.entries\(seedPoCompare\)\)/)
  assert.match(state, /if \(!s\.poCompare\[oppId\]\)/,
    'an existing PO must never be overwritten')
})

// --------------------------------------------------------------- deployment
test('deployment is documented with staging and production separated', () => {
  const doc = read('DEPLOYMENT.md')
  assert.match(doc, /Railway staging and production environments/)
  assert.match(doc, /must not share a Supabase project/)
  assert.match(doc, /GEMINI_API_KEY` is never a `VITE_` variable|GEMINI_API_KEY/)
})

test('the AI key is never exposed to the browser bundle', () => {
  // Anything prefixed VITE_ is compiled into the client bundle.
  assert.doesNotMatch(read('.env.example'), /^VITE_GEMINI/m)
  assert.doesNotMatch(read('src/ai.js'), /GEMINI_API_KEY/)
  assert.match(read('api/ai.js'), /process\.env\.GEMINI_API_KEY/)
})

test('env files stay out of the repository', () => {
  const ignored = read('.gitignore')
  assert.match(ignored, /^\.env$/m)
  assert.match(ignored, /^\.env\.\*$/m)
  const tracked = spawnSync('git', ['ls-files', '--error-unmatch', '.env'], { cwd: root, encoding: 'utf8' })
  assert.notEqual(tracked.status, 0, 'a real .env must not be tracked; local ignored files are allowed')
})

test('Express serves the SPA shell for deep-link refreshes', () => {
  const app = read('src/server/app.ts')
  assert.match(app, /sendFile\(path\.join\(staticDir, 'index\.html'\)\)/)
})
