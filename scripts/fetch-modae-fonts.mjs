// Refresh the self-hosted ModAE web fonts in public/fonts/.
//
//   node scripts/fetch-modae-fonts.mjs
//
// The app is an offline-capable PWA, so the fonts ship with it rather than
// being linked from Google — a <link> to fonts.googleapis.com leaves the UI in
// the system font on a tablet with no signal.
//
// Two things worth knowing before you change this:
//
//   * Both families are served as VARIABLE fonts. Asking the css2 API for
//     `wght@500;600;700` returns three @font-face rules pointing at the same
//     file, so we keep one file per family+subset and declare a weight *range*.
//     Downloading per weight would triple the payload for nothing.
//   * latin-ext is not optional. The rupee sign (U+20B9) lives in that subset,
//     and this app prints ₹ on nearly every screen. Dropping it renders every
//     price with a fallback-font rupee.
//
// After running, check the @font-face block near the top of src/styles.css
// still matches the filenames printed below.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const OUT = path.join(root, 'public', 'fonts')

// A browser UA is required: the css2 API serves TTF to unknown clients.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const SRC = 'https://fonts.googleapis.com/css2?family=Rubik:wght@500;600;700&family=Roboto:wght@400;500&display=swap'
const WANT = new Set(['latin', 'latin-ext'])

const css = await (await fetch(SRC, { headers: { 'User-Agent': UA } })).text()

// Each @font-face is preceded by a /* subset */ comment naming its coverage.
const seen = new Map()
for (const [, subset, body] of css.matchAll(/\/\* ([a-z-]+) \*\/\s*@font-face \{([\s\S]*?)\}/g)) {
  if (!WANT.has(subset)) continue
  const family = /font-family: '([^']+)'/.exec(body)?.[1]
  const url = /src: url\(([^)]+)\)/.exec(body)?.[1]
  if (!family || !url) continue
  const key = `${family.toLowerCase()}-${subset}`
  if (seen.has(key)) continue          // same variable file, other weight
  seen.set(key, url)
}

if (seen.size !== 4) {
  console.error(`expected 4 files (2 families x 2 subsets), resolved ${seen.size} — has the API changed?`)
  process.exit(1)
}

fs.mkdirSync(OUT, { recursive: true })
let total = 0
for (const [key, url] of seen) {
  const buf = Buffer.from(await (await fetch(url, { headers: { 'User-Agent': UA } })).arrayBuffer())
  // A challenge page or a TTF would otherwise be written as a corrupt .woff2.
  if (buf.subarray(0, 4).toString('latin1') !== 'wOF2') {
    console.error(`refusing to write ${key}: not a woff2 (got ${buf.subarray(0, 4).toString('latin1')})`)
    process.exit(1)
  }
  fs.writeFileSync(path.join(OUT, `${key}.woff2`), buf)
  total += buf.length
  console.log(`  ${key}.woff2  ${(buf.length / 1024).toFixed(1)} KB`)
}
console.log(`\n${(total / 1024).toFixed(1)} KB total. These are precached by public/sw.js —`)
console.log('bump CACHE there if the filenames change, or returning tablets keep the old ones.')
