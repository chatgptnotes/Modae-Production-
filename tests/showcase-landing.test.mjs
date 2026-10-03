import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

test('public showcase route provides a complete product landing experience', () => {
  const app = read('src/App.jsx')
  const landing = read('src/pages/ShowcaseLanding.jsx')
  const styles = read('src/styles.css')

  assert.match(app, /const publicShowcase = loc\.pathname === '\/showcase'/)
  assert.match(app, /if \(publicShowcase\) return <Suspense[\s\S]*?<ShowcaseLanding \/>/)
  assert.match(landing, /className="showcase-landing\b/)
  assert.match(landing, /Explore systems/)
  assert.match(landing, /Talk to an engineer/)
  assert.match(landing, /Systems that keep/)
  assert.match(landing, /className="showcase-gallery\b/)
  assert.match(landing, /className="showcase-proof\b/)
  assert.match(styles, /Showcase landing page/)
  assert.match(styles, /\.showcase-card:hover\s*\{[\s\S]*transform: translateY\(-8px\)/)
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.showcase-landing \*/)
})
