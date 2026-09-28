import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { MODAE_COLORS, MODAE_TYPE, MODAE_DOCUMENT_STANDARDS } from '../src/branding/modae.js'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const exists = file => fs.existsSync(path.join(root, file))
const css = read('src/styles.css')

// 20 Aug review: "The UI must adopt ModAE's full brand identity (colors,
// buttons) from their website, not just the logo and font from the provided
// document." The app was Tailwind sky-on-navy, which was nobody's brand.
// Source of truth for the values: mod-ae.com's own theme stylesheet
// (wp-content/themes/Qfactum/assets/css/style.css).

test('the brand palette is declared once, in the branding module', () => {
  assert.equal(MODAE_COLORS.primary, '#ED3F2F', "the website's .btn__primary")
  assert.equal(MODAE_COLORS.ink, '#282828')
  assert.equal(MODAE_TYPE.heading.includes('Inter'), true)
  assert.equal(MODAE_TYPE.body.includes('Inter'), true)
})

test('styles.css mirrors the brand tokens', () => {
  const root_ = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')))
  assert.match(root_, /--primary-accent: #ed3f2f/i)
  assert.match(root_, /--bg-sidebar: #282828/i)
  assert.match(root_, /--text-main: #282828/i)
  assert.match(root_, /--font-heading: 'Inter'/)
  assert.match(root_, /--font-body: 'Inter'/)
})

// The 18 Aug guideline standardises DOCUMENT templates on Candara 11pt/12pt.
// The app UI uses Inter; only printed/customer-facing proposal documents keep
// the Candara face, on screen and in print alike.
test('printed documents use the Candara document face', () => {
  assert.equal(MODAE_TYPE.document.includes('Candara'), true)
  const root_ = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')))
  assert.match(root_, /--font-document: 'Candara'/)
  const propdocRules = [...css.matchAll(/^\s*\.propdoc \{[^}]*\}/gm)].map(m => m[0])
  assert.ok(propdocRules.length >= 2, 'screen and print .propdoc rules')
  for (const rule of propdocRules) {
    assert.match(rule, /font-family: var\(--font-document\)/)
    assert.match(rule, /font-size: 11pt/)
  }
  assert.match(css, /\.doc-h \{[^}]*font-size: 12pt/, 'guideline heading size')
  assert.match(css, /--font-body: 'Inter'/, 'the website UI uses Inter')
})

test('document standards carry the exact approved furniture', () => {
  assert.equal(MODAE_DOCUMENT_STANDARDS.bodySizePt, 11)
  assert.equal(MODAE_DOCUMENT_STANDARDS.headingSizePt, 12)
  assert.equal(MODAE_DOCUMENT_STANDARDS.header.tagline, 'Your Partners In Achieving Excellence')
  assert.deepEqual(MODAE_DOCUMENT_STANDARDS.footerLines, [
    'ModAE India Private Limited',
    '7th Floor, Commerce Mantri, 12, 1 & 2, Bannerghatta Road, BTM Layout, 2nd Stage, BTM Layout, Bangalore, Karnataka – 560076',
    'CIN: U62099KA2024PTC185715 | GST: 29AARCM8622J1ZQ',
  ])
})

test('the sky-and-navy theme is gone, not merely overridden', () => {
  // Overriding :root while leaving the old literals scattered through the file
  // is how a half-rebranded app happens.
  for (const literal of ['#0ea5e9', '#0f172a', '#0284c7', '#075985', '#38bdf8', '#7dd3fc', '#14b8a6']) {
    assert.equal(css.includes(literal), false, `${literal} must not survive in styles.css`)
  }
  assert.equal(read('index.html').includes('#0f172a'), false, 'the PWA theme-color too')
  assert.match(read('index.html'), /theme-color" content="#282828"/)

  // This guard originally scanned styles.css and index.html only, and missed
  // the manifest — which paints the Android splash screen, so the first frame
  // of the installed app was still navy. Scan every shipped text file instead
  // of a hand-kept list.
  const shipped = ['public/manifest.webmanifest', 'public/sw.js', 'src/branding/modae.js']
  for (const file of shipped) {
    for (const literal of ['#0ea5e9', '#0f172a', '#0284c7', '#38bdf8', '#14b8a6']) {
      assert.equal(read(file).includes(literal), false, `${literal} survives in ${file}`)
    }
  }
  const manifest = JSON.parse(read('public/manifest.webmanifest'))
  assert.equal(manifest.theme_color, '#282828')
  assert.equal(manifest.background_color, '#282828')
})

test('no orphan font stylesheet ships alongside the real one', () => {
  // The font-fetch script left a public/font-face.css naming ten per-weight
  // files that do not exist — the fonts are variable, so there are four. It was
  // inert (nothing links it) but Vite copies public/ verbatim, and it looked
  // authoritative enough to mislead the next person to touch fonts.
  assert.equal(exists('public/font-face.css'), false)
  const files = fs.readdirSync(path.join(root, 'public/fonts'))
  assert.deepEqual(files.sort(), [
    'inter-latin-ext.woff2', 'inter-latin.woff2',
  ], 'two variable faces, one per subset')
})

test('status colour is not brand colour', () => {
  // The brand is a red and so is "lost". If they were the same token, a
  // destructive state would read as a primary button.
  assert.notEqual(MODAE_COLORS.status.bad, MODAE_COLORS.primary)
  // #D64545 was the website-adjacent tone but only 4.38:1 under white text;
  // one step darker clears AA without moving the hue.
  assert.match(css, /--status-bad: #c93838/i)
  assert.match(css, /--status-good: #37a64a/i)
  assert.match(css, /--status-warn: #d99200/i)
  // And the danger button uses the status hue, not the brand one.
  assert.match(css, /button\.danger, \.btn\.danger \{[^}]*background: var\(--status-bad\)/)
})

test('buttons carry the website treatment at enterprise metrics', () => {
  assert.match(css, /button, \.btn \{[^}]*border-radius: var\(--r-ctl\)/)
  assert.match(css, /--r-ctl: 7px/)
  assert.match(css, /button, \.btn \{[^}]*letter-spacing: \.3px/)
  assert.match(css, /button\.primary, \.btn\.primary \{[^}]*background: var\(--primary-fill\)[^}]*font-weight: 700/s)
  // The 2px Excel-ish radius is gone.
  assert.doesNotMatch(css, /button, \.btn \{[^}]*border-radius: 2px/)
  // The website's 60px hero height is NOT imported — the tablet touch target is.
  assert.equal(css.includes('height: 60px;\n  padding: 0 15px'), false)
  assert.match(css, /min-height: 42px/)
  // Disabled and focus states exist, which the old single rule had neither of.
  assert.match(css, /button:disabled, \.btn:disabled/)
  assert.match(css, /button:focus-visible, \.btn:focus-visible/)
})

test('the web fonts are self-hosted and offline-cached', () => {
  // A Google Fonts <link> would leave this PWA unstyled on a tablet with no
  // signal, so the files ship with the app.
  for (const f of ['inter-latin.woff2', 'inter-latin-ext.woff2']) {
    assert.ok(exists(`public/fonts/${f}`), `public/fonts/${f} must be committed`)
  }
  assert.doesNotMatch(read('index.html'), /fonts\.googleapis\.com|fonts\.gstatic\.com/)
  assert.doesNotMatch(css, /fonts\.googleapis\.com|fonts\.gstatic\.com/)

  // latin-ext is not optional: the rupee sign lives there and this app prints ₹
  // on nearly every screen.
  assert.match(css, /U\+20AD-20C0/, 'latin-ext must cover U+20B9')
  assert.match(css, /font-display: swap/)

  const sw = read('public/sw.js')
  assert.match(sw, /'\/fonts\/inter-latin\.woff2'/)
  assert.match(sw, /url\.pathname\.startsWith\('\/fonts\/'\)/)
  // A stale cache would keep serving the old shell in the system font.
  assert.match(sw, /const CACHE = 'wintrack-v6'/)
  assert.doesNotMatch(sw, /wintrack-v[1-5]/)
})

test('nothing renders a hardcoded sky hex any more', () => {
  for (const file of ['src/pages/Analytics.jsx', 'src/pages/Approvals.jsx',
    'src/pages/Folders.jsx', 'src/pages/Inbox.jsx', 'src/pages/MyDashboard.jsx']) {
    const source = read(file)
    const hexes = (source.match(/#[0-9a-fA-F]{6}\b/g) || []).filter(h => h.toLowerCase() !== '#ffffff')
    assert.deepEqual(hexes, [], `${file} must colour through tokens, not literals`)
  }
})

test('the funnel ramp is a validated sequential ramp, not the website ramp', () => {
  // Checked with the dataviz validator in ordinal mode: monotone lightness,
  // every adjacent gap >= 0.06, 1 degree of hue spread, light end 2.05:1 on
  // white. The website's own chShade ramp fails all four — it runs
  // light -> lighter and then drops to a chroma-free charcoal.
  assert.equal(MODAE_COLORS.ramp.length, 6)
  assert.equal(MODAE_COLORS.ramp[2], MODAE_COLORS.primary, 'brand red sits mid-ramp')
  assert.equal(MODAE_COLORS.ramp.includes('#3A3A3A'), false, 'the charcoal step breaks monotonicity')
  assert.match(read('src/pages/Analytics.jsx'), /const FUNNEL_RAMP = MODAE_COLORS\.ramp/)
})

test('dark mode gets its own steps, not a flipped light palette', () => {
  const dark = css.slice(css.indexOf('.tablet-mode.theme-dark {'))
    .slice(0, css.slice(css.indexOf('.tablet-mode.theme-dark {')).indexOf('}'))
  assert.match(dark, /--dash-accent: #ef7765/i, 'one step up the brand ramp for a dark surface')
  assert.match(dark, /--dash-bad: #f07070/i)
  assert.doesNotMatch(dark, /#38bdf8|#2dd4bf|#0b1220/, 'the slate/sky dark theme must be gone')
})

test('the branding sources no longer say the opposite', () => {
  // Both files recorded "website colors were intentionally not copied". The
  // client reversed that; leaving it would have the next person undo this work.
  const profile = read('assets/brand/modae/data/brand-profile.json')
  assert.equal(/intentionally not copied/.test(profile), false)
  assert.match(profile, /Superseded 20 Aug 2026/)
  JSON.parse(profile)  // and it must still parse

})

test('the misleading placeholder mark is gone', () => {
  const icons = read('src/icons.jsx')
  assert.equal(/export function ModaeMark/.test(icons), false)
  // Every render site uses the real lockup.
  assert.match(icons, /export function ModaeLogo/)
})

// Contrast is computable, so compute it. #ED3F2F is only 3.92:1 against white:
// the website gets away with white-on-brand because its buttons are 60px hero
// controls (large text, 3:1 floor), but these are 12.5px, which is normal text
// and needs 4.5:1. Hence --primary-fill and --primary-ink.
const relLum = hex => {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const contrast = (a, b) => {
  const [hi, lo] = [relLum(a), relLum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
const tokenOf = name => {
  const m = new RegExp(`${name}:[ \\t]*(#[0-9a-f]{3,8})`, 'i').exec(css)
  assert.ok(m, `${name} must be defined as a literal in :root`)
  return m[1]
}

test('every text-on-colour pair clears WCAG AA', () => {
  const pairs = [
    ['white on the primary button', '#ffffff', tokenOf('--primary-fill'), 4.5],
    ['white on the danger button', '#ffffff', tokenOf('--status-bad'), 4.5],
    ['accent text on a card', tokenOf('--primary-ink'), '#ffffff', 4.5],
    ['accent text on its own tint', tokenOf('--primary-ink'), tokenOf('--primary-soft'), 4.5],
    ['won text on won fill', tokenOf('--won-text'), tokenOf('--won-fill'), 4.5],
    ['lost text on lost fill', tokenOf('--lost-text'), tokenOf('--lost-fill'), 4.5],
    ['amber text on amber fill', tokenOf('--amber-text'), tokenOf('--amber-fill'), 4.5],
    ['body text on the canvas', tokenOf('--text-main'), tokenOf('--bg-app'), 4.5],
    ['muted text on a card', tokenOf('--text-muted'), tokenOf('--card-bg'), 4.5],
    ['white on the sidebar', '#ffffff', tokenOf('--bg-sidebar'), 4.5],
    // Non-text: borders and strokes only need 3:1, which is why the raw brand
    // red is still fine there.
    ['the brand accent as a border', tokenOf('--primary-accent'), '#ffffff', 3],
  ]
  for (const [label, fg, bg, floor] of pairs) {
    const ratio = contrast(fg, bg)
    assert.ok(ratio >= floor, `${label}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1, needs ${floor}:1`)
  }
})

test('white text never sits directly on the raw brand red', () => {
  // The identity colour is for borders, strokes and tints. Anything with white
  // text on it must use --primary-fill.
  assert.match(css, /button\.primary, \.btn\.primary \{[^}]*background: var\(--primary-fill\)/)
  assert.doesNotMatch(css, /background: var\(--xl-green\); color: #fff/)
})
