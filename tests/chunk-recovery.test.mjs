import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

test('route lazy imports use guarded chunk recovery', () => {
  const app = read('src/App.jsx')
  assert.match(app, /import \{ lazyWithRecovery \} from ['"]\.\/lazyImport\.js['"]/
  )
  assert.equal((app.match(/lazyWithRecovery\(\(\) => import\(/g) || []).length, 25)
  assert.doesNotMatch(app, /const Workbench = lazy\(/)
})

test('chunk recovery clears app caches and reloads only once per session', () => {
  const source = read('src/lazyImport.js')
  assert.match(source, /sessionStorage\.getItem\(RECOVERY_KEY\)/)
  assert.match(source, /sessionStorage\.setItem\(RECOVERY_KEY/)
  assert.match(source, /caches\.delete\(name\)/)
  assert.match(source, /registration\.unregister\(\)/)
  assert.match(source, /window\.location\.reload\(\)/)
  assert.match(source, /return new Promise\(\(\) => \{\}\)/)
})

test('service worker revalidates assets while retaining offline fallback', () => {
  const sw = read('public/sw.js')
  assert.match(sw, /const CACHE = 'wintrack-v8'/)
  assert.match(sw, /const fresh = await fetch\(req\)/)
  assert.match(sw, /await cache\.match\(req\)/)
  assert.doesNotMatch(sw, /const revalidate = fetch\(req\)/)
})

test('Express owns the SPA fallback while the service worker handles cache revalidation', () => {
  const app = read('src/server/app.ts')
  assert.match(app, /express\.static\(staticDir\)/)
  assert.match(app, /app\.use\('\/api'/)
  assert.match(app, /sendFile\(path\.join\(staticDir, 'index\.html'\)\)/)
})
