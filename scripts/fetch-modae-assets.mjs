#!/usr/bin/env node
// Re-captures the ModAE image archive from mod-ae.com into the ignored
// .local/branding/modae/ workspace and promotes only app-consumed images into
// assets/brand/modae/images/.
//
// The original capture committed only its outputs, no script, so the archive
// silently drifted to 9 of 41 available images and nobody could tell. This
// script exists so the capture is reproducible, and so the three rules that are
// expensive to re-derive live in code rather than in someone's head:
//
//   1. Which uploads are actually ModAE's (see GENUINE_UPLOAD_MONTHS).
//   2. How to pick a web-sized variant (max edge, never a guessed filename).
//   3. How to tell a real JPEG from a Cloudflare challenge page (see isRealImage).
//
// Usage:  node scripts/fetch-modae-assets.mjs [--force]
// Runs for several minutes: it is deliberately throttled (see THROTTLE_MS).

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ARCHIVE = path.join(ROOT, '.local/branding/modae')
const ASSETS = path.join(ARCHIVE, 'assets')
const WEB = path.join(ASSETS, 'web')
const RAW = path.join(ARCHIVE, 'raw')
const MANIFEST = path.join(ARCHIVE, 'data/asset-manifest.json')
const RUNTIME_IMAGES = path.join(ROOT, 'assets/brand/modae/images')

const SITE = 'https://mod-ae.com'
const FORCE = process.argv.includes('--force')

// mod-ae.com runs on the purchased "Qfactum" theme, and the theme's demo content
// was never cleaned out of the media library: ~113 items under 2024/05 are stock
// digital-marketing/contracts imagery plus QFACTUM-PRESENTATION.pdf. ModAE's own
// media was uploaded in 2024/06 and 2024/10. Filtering by upload month is the
// only reliable separator — filenames alone don't distinguish them.
const GENUINE_UPLOAD_MONTHS = ['2024/06', '2024/10']
const EXPECTED_GENUINE = 41

const MAX_WEB_EDGE = 1024
const THROTTLE_MS = [2000, 3500]      // randomised delay between requests
const RETRY_BACKOFF_MS = [5000, 15000, 45000]
const MAX_CONSECUTIVE_CHALLENGES = 2
// Without this a stalled connection blocks the whole run instead of retrying.
const REQUEST_TIMEOUT_MS = 60000

// Titles and types for assets the original hand-written manifest already named.
// Regenerating the manifest must not silently rewrite "Asset Health Management"
// into "Products Centrifugal Compressor", so those choices are preserved here.
const CURATED = {
  'red-logo.png': { title: 'ModAE red logo', type: 'logo' },
  'about-us-pic-2.jpg': { title: 'About page image', type: 'brand' },
  'Antisurge-Control-System.jpg': { title: 'Antisurge Control System', type: 'product' },
  'products-centrifugal-compressor.jpg': { title: 'Asset Health Management', type: 'product' },
  'machinery-diagnostics-1.jpg': { title: 'Machinery Diagnostics', type: 'product' },
  'Monitoring-Systems-1.jpg': { title: 'Monitoring Systems', type: 'product' },
  'OverSpeed-Detection-System.jpg': { title: 'OverSpeed Detection System', type: 'product' },
  'Our-Producs-banner-2.jpg': { title: 'Sensors', type: 'product' },
  'Turbine-Control-System-1.jpg': { title: 'Turbine Control System', type: 'product' },
  'modae-logo-skyblue.png': { title: 'ModAE sky-blue logo', type: 'logo' },
  'singnture2.png': { title: 'Signature', type: 'brand' },
}

// Remote filenames are provenance; tracked runtime filenames are stable,
// descriptive application identifiers. The official logo is supplied artwork,
// not a separate media-library item, so this fetcher deliberately leaves it
// untouched.
const RUNTIME_IMAGE_MAP = new Map([
  ['about-us-pic-2.jpg', 'about.jpg'],
  ['Antisurge-Control-System.jpg', 'products/antisurge-control.jpg'],
  ['products-centrifugal-compressor.jpg', 'products/asset-health-management.jpg'],
  ['machinery-diagnostics-1.jpg', 'products/machinery-diagnostics.jpg'],
  ['Monitoring-Systems-1.jpg', 'products/monitoring-systems.jpg'],
  ['OverSpeed-Detection-System.jpg', 'products/overspeed-detection.jpg'],
  ['Our-Producs-banner-2.jpg', 'products/sensors.jpg'],
  ['Turbine-Control-System-1.jpg', 'products/turbine-control.jpg'],
])

fs.mkdirSync(RAW, { recursive: true })

const sleep = ms => new Promise(r => setTimeout(r, ms))
const jitter = () => THROTTLE_MS[0] + Math.random() * (THROTTLE_MS[1] - THROTTLE_MS[0])
const sha1 = buf => crypto.createHash('sha1').update(buf).digest('hex')
const log = (...a) => console.log(...a)

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  'Accept': 'image/avif,image/webp,image/*,*/*;q=0.8',
  'Referer': `${SITE}/`,
}

// Cloudflare answers a burst of requests with a ~5KB HTML interstitial and a 200
// status. Written to disk under a .jpg name that corrupts the archive invisibly,
// so nothing is saved until it actually looks like an image.
// The magic-byte and marker checks below are what actually catch a challenge
// page, so this floor only needs to reject empty/truncated bodies. Keep it low:
// singnture2.png is a legitimate 1.5KB asset, and a 10KB floor silently drops it.
const MIN_IMAGE_BYTES = 512

function isRealImage(buf, contentType) {
  if (!buf || buf.byteLength < MIN_IMAGE_BYTES) return 'too small'
  if (contentType && !contentType.startsWith('image/')) return `content-type ${contentType}`
  const jpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff
  const png = buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  if (!jpeg && !png) return 'bad magic bytes'
  const head = buf.subarray(0, 2048).toString('latin1')
  for (const marker of ['Just a moment', 'challenge-platform', '<html', '<!DOCTYPE']) {
    if (head.includes(marker)) return `challenge page (${marker})`
  }
  return null
}

let consecutiveChallenges = 0

async function fetchImage(url) {
  for (let attempt = 0; attempt <= RETRY_BACKOFF_MS.length; attempt++) {
    if (attempt) {
      log(`      retry ${attempt} in ${RETRY_BACKOFF_MS[attempt - 1] / 1000}s`)
      await sleep(RETRY_BACKOFF_MS[attempt - 1])
    }
    let res
    try {
      res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
    } catch (err) {
      log(`      network error: ${err.message}`)
      continue
    }
    if (!res.ok) { log(`      HTTP ${res.status}`); continue }
    const buf = Buffer.from(await res.arrayBuffer())
    const bad = isRealImage(buf, res.headers.get('content-type') || '')
    if (!bad) { consecutiveChallenges = 0; return buf }
    log(`      rejected: ${bad}`)
    if (bad.startsWith('challenge')) {
      if (++consecutiveChallenges >= MAX_CONSECUTIVE_CHALLENGES) {
        throw new Error(
          'Cloudflare is challenging us. Aborting with the archive intact — ' +
          'wait a few minutes and re-run; completed files are skipped.')
      }
    }
  }
  return null
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { ...HEADERS, Accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  const text = await res.text()
  if (text.startsWith('<')) throw new Error(`Cloudflare challenge on ${url} — wait and re-run.`)
  return { body: JSON.parse(text), totalPages: Number(res.headers.get('x-wp-totalpages')) || null }
}

// ---------------------------------------------------------------- enumerate

async function enumerateMedia() {
  const all = []
  // A short page does NOT mean the last page: WordPress applies per-item
  // permission filtering after slicing, so page 1 of this library returns 93 of
  // 100 while pages remain. Page until an empty batch, bounded by x-wp-totalpages.
  let lastPage = null
  for (let page = 1; lastPage === null || page <= lastPage; page++) {
    log(`  media page ${page}…`)
    const { body, totalPages } = await fetchJson(
      `${SITE}/wp-json/wp/v2/media?per_page=100&page=${page}&_fields=id,source_url,mime_type,alt_text,media_details`)
    if (totalPages && lastPage === null) lastPage = totalPages
    if (!Array.isArray(body) || !body.length) break
    all.push(...body)
    await sleep(jitter())
  }
  fs.writeFileSync(path.join(RAW, 'wp-media.json'), JSON.stringify(all, null, 2) + '\n')
  log(`  archived ${all.length} media records -> raw/wp-media.json`)

  const genuine = all.filter(m =>
    GENUINE_UPLOAD_MONTHS.some(mo => m.source_url.includes(`/uploads/${mo}/`)))
  if (genuine.length !== EXPECTED_GENUINE) {
    log(`\n  WARNING: expected ${EXPECTED_GENUINE} genuine ModAE uploads, found ${genuine.length}.`)
    log('  The site may have gained or lost media. Review before committing.\n')
  }
  return genuine
}

// WordPress constrains its generated sizes by the LONG edge, so a width-based
// rule picks the wrong tier for portrait images (about-us-pic-2.jpg is 1207x1806
// and its "large" is 684x1024). Enumerate real variants — guessing filenames
// like -1024x576 finds only about half of them.
function pickWebVariant(item) {
  const md = item.media_details || {}
  const sizes = md.sizes || {}
  let best = null
  for (const [name, v] of Object.entries(sizes)) {
    if (name === 'full' || !v.source_url) continue
    const edge = Math.max(v.width || 0, v.height || 0)
    if (edge > MAX_WEB_EDGE) continue
    if (!best || edge > best.edge) best = { edge, name, ...v }
  }
  return best
}

// ---------------------------------------------------------------- download

async function ensureFile(dest, url, label) {
  if (!FORCE && fs.existsSync(dest)) {
    const existing = fs.readFileSync(dest)
    if (!isRealImage(existing, '')) return { buf: existing, skipped: true }
    log(`    ${label}: on disk but invalid, refetching`)
  }
  await sleep(jitter())
  const buf = await fetchImage(url)
  if (!buf) { log(`    ${label}: FAILED ${url}`); return null }
  fs.writeFileSync(dest, buf)
  log(`    ${label}: ${(buf.byteLength / 1024).toFixed(0)} KB`)
  return { buf, skipped: false }
}

function localDownscale(fullPath, webPath) {
  execFileSync('/usr/bin/sips', ['-Z', String(MAX_WEB_EDGE), fullPath, '--out', webPath], { stdio: 'ignore' })
  return fs.readFileSync(webPath)
}

function dimsOf(file) {
  try {
    const out = execFileSync('/usr/bin/sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file], { encoding: 'utf8' })
    return {
      width: Number(out.match(/pixelWidth:\s*(\d+)/)?.[1]) || null,
      height: Number(out.match(/pixelHeight:\s*(\d+)/)?.[1]) || null,
    }
  } catch { return { width: null, height: null } }
}

function titleFor(name) {
  if (CURATED[name]) return CURATED[name].title
  return name.replace(/\.[a-z]+$/i, '').replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase()).trim()
}

// Beyond the curated names, classify by filename so the 32 new arrivals don't
// all land in the archive as an undifferentiated "brand" blob.
function typeFor(name) {
  if (CURATED[name]) return CURATED[name].type
  if (/^services-/i.test(name)) return 'service'
  if (/^Industries-/i.test(name)) return 'industry'
  if (/logo/i.test(name)) return 'logo'
  return 'site'
}

// ---------------------------------------------------------------- main

async function main() {
  fs.mkdirSync(WEB, { recursive: true })
  fs.mkdirSync(path.dirname(MANIFEST), { recursive: true })
  fs.mkdirSync(path.join(RUNTIME_IMAGES, 'products'), { recursive: true })

  log('Enumerating media library…')
  const media = await enumerateMedia()
  log(`  ${media.length} genuine ModAE uploads\n`)

  const fetchedAt = new Date().toISOString()
  const entries = []

  for (const item of media) {
    const name = decodeURIComponent(item.source_url.split('/').pop())
    log(`- ${name}`)

    const fullPath = path.join(ASSETS, name)
    const full = await ensureFile(fullPath, item.source_url, 'full')
    if (!full) continue

    const variant = pickWebVariant(item)
    const webPath = path.join(WEB, name)
    const md = item.media_details || {}
    const fullEdge = Math.max(md.width || 0, md.height || 0)

    let webBuf = null
    let origin
    let webSource = null

    if (fullEdge && fullEdge <= MAX_WEB_EDGE) {
      // Already small enough; a byte-identical duplicate would be pure waste.
      origin = 'same_as_full'
    } else if (variant) {
      const got = await ensureFile(webPath, variant.source_url, `web ${variant.name}`)
      if (got) { webBuf = got.buf; origin = 'wordpress_size'; webSource = variant.source_url }
    }
    if (!webBuf && origin !== 'same_as_full') {
      if (!FORCE && fs.existsSync(webPath)) {
        webBuf = fs.readFileSync(webPath)
      } else {
        log('    web: no <=1024px variant, downscaling locally')
        webBuf = localDownscale(fullPath, webPath)
      }
      origin = 'local_downscale_sips'
    }

    const fullDims = { width: md.width || null, height: md.height || null }
    if (!fullDims.width) Object.assign(fullDims, dimsOf(fullPath))

    const entry = {
      title: titleFor(name),
      type: typeFor(name),
      source_url: item.source_url,
      local_path: `assets/${name}`,
      wp_media_id: item.id,
      provenance: 'wordpress_media',
      fetched_at: fetchedAt,
      full: {
        path: `assets/${name}`,
        ...fullDims,
        bytes: fs.statSync(fullPath).size,
        sha1: sha1(full.buf),
      },
      web: origin === 'same_as_full'
        ? { path: `assets/${name}`, ...fullDims, bytes: fs.statSync(fullPath).size, sha1: sha1(full.buf), origin }
        : { path: `assets/web/${name}`, ...dimsOf(webPath), bytes: fs.statSync(webPath).size, sha1: sha1(webBuf), origin, source_url: webSource },
    }
    if (item.alt_text) entry.alt_text = item.alt_text
    const runtimeName = RUNTIME_IMAGE_MAP.get(name)
    if (runtimeName) {
      const runtimePath = path.join(RUNTIME_IMAGES, runtimeName)
      fs.copyFileSync(fullPath, runtimePath)
      entry.consumed_by_app = true
      entry.runtime_path = path.relative(ROOT, runtimePath)
    }
    entries.push(entry)
  }

  entries.sort((a, b) => a.local_path.localeCompare(b.local_path))
  fs.writeFileSync(MANIFEST, JSON.stringify(entries, null, 2) + '\n')

  const onDisk = fs.readdirSync(ASSETS).filter(f => /\.(jpe?g|png)$/i.test(f)).length
  log(`\nManifest: ${entries.length} entries -> ${path.relative(ROOT, MANIFEST)}`)
  log(`assets/: ${onDisk} files   assets/web/: ${fs.readdirSync(WEB).length} files`)
  if (onDisk !== entries.length) {
    log(`\nWARNING: ${onDisk} files on disk but ${entries.length} manifest entries.`)
    process.exitCode = 1
  }
}

main().catch(err => { console.error(`\n${err.message}`); process.exit(1) })
