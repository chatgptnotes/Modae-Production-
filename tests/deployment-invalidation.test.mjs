import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { DEPLOYMENT_MARKER_KEY, shouldResetForDeployment } from '../src/deploymentMarker.js'
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

function memoryStorage(entries = []) {
  const values = new Map(entries)
  return {
    get length() { return values.size },
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  }
}

test('a clean first visit records the deployment and same-deployment reloads do not reset', () => {
  const local = memoryStorage()
  const session = memoryStorage()

  assert.equal(shouldResetForDeployment('deploy-a', local, session), false)
  assert.equal(local.getItem(DEPLOYMENT_MARKER_KEY), 'deploy-a')

  local.setItem('wintrack-modae-v4', 'saved workspace')
  assert.equal(shouldResetForDeployment('deploy-a', local, session), false)
})

test('legacy state is cleared once, then remains valid for the same deployment', () => {
  const local = memoryStorage([['wintrack-modae-v4', 'old workspace']])
  const session = memoryStorage()

  assert.equal(shouldResetForDeployment('deploy-a', local, session), true)
  local.removeItem('wintrack-modae-v4')
  assert.equal(shouldResetForDeployment('deploy-a', local, session), false)
  assert.equal(local.getItem(DEPLOYMENT_MARKER_KEY), 'deploy-a')
})

test('a changed deployment resets once and accepts the new marker afterward', () => {
  const local = memoryStorage([[DEPLOYMENT_MARKER_KEY, 'deploy-a'], ['wintrack-modae-v4', 'workspace']])
  const session = memoryStorage()

  assert.equal(shouldResetForDeployment('deploy-b', local, session), true)
  local.removeItem('wintrack-modae-v4')
  local.setItem(DEPLOYMENT_MARKER_KEY, 'deploy-b')
  assert.equal(shouldResetForDeployment('deploy-b', local, session), false)
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
