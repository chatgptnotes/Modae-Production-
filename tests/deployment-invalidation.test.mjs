import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

test('deployment invalidation has a no-cache version endpoint and unique build identity', () => {
  const api = read('api/app-version.js')
  const vite = read('vite.config.js')
  assert.match(api, /Cache-Control.*no-store/)
  assert.match(api, /VERCEL_DEPLOYMENT_ID/)
  assert.match(vite, /__APP_DEPLOYMENT_ID__/)
  assert.match(vite, /VERCEL_DEPLOYMENT_ID/)
})

test('deployment invalidation clears local browser state without remote file deletion', () => {
  const deployment = read('src/deployment.js')
  const blobs = read('src/leadBlobs.js')
  const main = read('src/main.jsx')
  assert.match(deployment, /clearSupabaseSession/)
  assert.match(deployment, /localStorage\.clear\(\)/)
  assert.match(deployment, /sessionStorage\.clear\(\)/)
  assert.match(deployment, /document\.cookie/)
  assert.match(deployment, /caches\.keys\(\)/)
  assert.match(deployment, /getRegistrations\(\)/)
  assert.match(deployment, /clearLocalLeadBlobs/)
  assert.match(blobs, /export function clearLocalAll\(\)/)
  assert.match(main, /deploymentNeedsReset/)
  assert.match(main, /watchDeployment/)
})

test('shared refresh does not protect empty server slices with stale browser data', () => {
  const store = read('src/store.jsx')
  const datastore = read('src/datastore.js')
  assert.doesNotMatch(store, /unexpectedEmptyBusinessSlice/)
  assert.match(store, /deletedLeadIds: \[\]/)
  assert.match(store, /deletedOpportunityIds: \[\]/)
  assert.doesNotMatch(datastore, /readPriceListsCache/)
  assert.doesNotMatch(datastore, /degraded: true/)
})
