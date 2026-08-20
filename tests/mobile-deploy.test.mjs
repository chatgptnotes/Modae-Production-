import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { seedPoCompare } from '../src/seed.js'
import { LOCAL_ONLY } from '../src/datastore.js'

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

test('the tablet bar wraps and sheds labels on a phone', () => {
  assert.match(css, /\.tablet-bar \{ flex-wrap: wrap/)
  assert.match(css, /@media \(max-width: 720px\)[\s\S]{0,400}\.tablet-bar \.tb-label \{ display: none; \}/)
  // Every label the media query hides must actually carry the class.
  const app = read('src/App.jsx')
  const tabletApp = read('src/tablet/TabletApp.jsx')
  const labels = tabletApp.match(/className="tb-label"/g) || []
  assert.ok(labels.length >= 3, `expected the bar's labels to be tb-label, found ${labels.length}`)
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
  assert.match(store, /if \(s\.viewModePinned\) return s/)
  assert.match(store, /viewMode: mode, viewModePinned: true/,
    'an explicit switch must pin the choice')
  const app = read('src/App.jsx')
  assert.match(app, /window\.addEventListener\('resize', onResize\)/)
  assert.match(app, /window\.addEventListener\('orientationchange', onResize\)/)
  assert.match(app, /window\.removeEventListener\('resize', onResize\)/, 'listener must be cleaned up')
})

test('the pin stays on the device rather than syncing to other users', () => {
  assert.ok(LOCAL_ONLY.includes('viewMode'))
  assert.ok(LOCAL_ONLY.includes('viewModePinned'))
})

test('approval cards show request time and highlight new pending requests', () => {
  const approvals = read('src/pages/Approvals.jsx')
  assert.match(approvals, /const stamp = ts =>/)
  assert.match(approvals, /toLocaleTimeString\('en-IN'/)
  assert.match(approvals, /requested \{stamp\(a\.ts\)\}/)
  assert.match(approvals, /requested by \{a\.requestedBy\} · \{stamp\(a\.ts\)\}/)
  assert.match(approvals, /const NEW_APPROVAL_MS = 48 \* 60 \* 60 \* 1000/)
  assert.match(approvals, /approval-card-new/)
  assert.match(approvals, /approval-new-pill/)
  assert.match(css, /\.approval-card-new/)
  assert.match(css, /@keyframes approval-new-pulse/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
})

test('ModAE branding is centralized without changing tablet tile ownership', () => {
  const brand = read('src/branding/modae.js')
  const icons = read('src/icons.jsx')
  const proposal = read('src/proposalDoc.js')
  const tabletTiles = read('src/tablet/tabletTiles.js')
  assert.match(brand, /brand-profile\.json/)
  assert.match(brand, /products\.json/)
  assert.match(brand, /modae-official-logo\.png/)
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
  assert.match(brand, /Your Partners in Achieving Excellence/)
  assert.match(brand, /MODAE INDIA PRIVATE LIMITED/)
  assert.match(brand, /29AARCM8622J1ZQ/)
  assert.match(brand, /U62099KA2024PTC185715/)
  assert.match(proposal, /MODAE_BRAND\.letterhead/)
  assert.match(printDoc, /OfficialLetterheadFooter/)
  assert.match(printDoc, /MODAE_COMPANY\.salesOffice/)
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
  assert.match(css, /\.sidebar-compact \.sidebar-toggle {[^}]*right: 4px/)
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
  assert.match(doc, /wintrack-staging/)
  assert.match(doc, /must not share a Supabase project/)
  assert.match(doc, /GEMINI_API_KEY` is never a `VITE_` variable|GEMINI_API_KEY/)
})

test('the AI key is never exposed to the browser bundle', () => {
  // Anything prefixed VITE_ is compiled into the client bundle.
  assert.doesNotMatch(read('.env.example'), /^VITE_GEMINI/m)
  assert.doesNotMatch(read('src/ai.js'), /GEMINI_API_KEY/)
  assert.match(read('supabase/functions/ai/index.ts'), /Deno\.env\.get\('GEMINI_API_KEY'\)/)
})

test('env files stay out of the repository', () => {
  const ignored = read('.gitignore')
  assert.match(ignored, /^\.env$/m)
  assert.match(ignored, /^\.env\.\*$/m)
  assert.ok(!fs.existsSync(path.join(root, '.env')), 'a real .env must not be committed')
})

test('the SPA rewrite is in place for deep-link refreshes', () => {
  const cfg = JSON.parse(read('vercel.json'))
  assert.equal(cfg.rewrites[0].destination, '/index.html')
})
