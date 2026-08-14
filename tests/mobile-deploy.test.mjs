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
  const labels = app.match(/className="tb-label"/g) || []
  assert.ok(labels.length >= 3, `expected the bar's labels to be tb-label, found ${labels.length}`)
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
  const store = read('src/store.jsx')
  assert.match(store, /for \(const \[oppId, po\] of Object\.entries\(seedPoCompare\)\)/)
  assert.match(store, /if \(!s\.poCompare\[oppId\]\)/,
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
