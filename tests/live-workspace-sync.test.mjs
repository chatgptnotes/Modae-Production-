import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

test('the shared workspace subscribes to the rows that can resolve a release', () => {
  const datastore = read('src/datastore.js')
  assert.match(datastore, /subscribeBusinessChanges/)
  assert.match(datastore, /table: 'leads'/)
  assert.match(datastore, /table: 'approvals'/)
  assert.match(datastore, /table: 'opportunities'/)
  assert.match(datastore, /filter: 'entity=eq\.proposals'/)

  const store = read('src/store.jsx')
  assert.match(store, /datastore\.subscribeBusinessChanges\(reload/)
  assert.match(store, /datastore\.loadAll\(\{ force: true \}\)\.then/)
  assert.match(store, /async refreshSharedData\(\)/)
  assert.match(store, /setTimeout\(flushSaves, 0\)/,
    'approval decisions must bypass the ordinary draft-save debounce')
})

test('the live-sync migration publishes only shared business tables', () => {
  const migration = read('supabase/007_live_workspace_sync.sql')
  for (const table of ['leads', 'approvals', 'opportunities', 'records']) {
    assert.match(migration, new RegExp(`'${table}'`))
  }
  assert.match(migration, /alter publication supabase_realtime add table public\.%I/)
  assert.match(migration, /existing RLS policies/)
})

test('normalized opportunity writes fail loudly instead of falling back to ignored legacy slices', () => {
  const datastore = read('src/datastore.js')
  assert.match(datastore, /const failed = results\.find\(result => result\.error\)/)
  assert.match(datastore, /if \(failed\) throw failed\.error/)
})

test('opportunity writes use revision-safe latest-save-wins persistence', () => {
  const datastore = read('src/datastore.js')
  assert.match(datastore, /supabase\.rpc\('save_rows'/)
  assert.match(datastore, /p_entity: 'opportunities'/)
  assert.match(datastore, /opportunityRevisions\.get\(row\.id\) \?\? 0/)
  assert.match(datastore, /Latest-save-wins/)
  assert.match(datastore, /serverRow\.rev/)
  assert.match(datastore, /deleted: true/)
  assert.match(datastore, /opportunityRecords\.keys\(\)/)
  assert.doesNotMatch(datastore, /dirty\.opportunities\.map\(row => \(\{ id: row\.id, data: row, rev: 1/)
})

test('opportunity saves are serialized across debounce and pagehide flushes', () => {
  const datastore = read('src/datastore.js')
  assert.match(datastore, /let opportunitySaveQueue = Promise\.resolve\(\)/)
  assert.match(datastore, /opportunitySaveQueue = opportunitySaveQueue[\s\S]*saveOpportunityRowsNow\(rows\)/)
})

test('forced realtime reads wait out an older request before fetching fresh data', () => {
  const datastore = read('src/datastore.js')
  assert.match(datastore, /if \(loadInFlight\) \{[\s\S]*const pending = loadInFlight[\s\S]*return force \? pending\.then\(\(\) => loadAll\(\{ force: true \}\)\)/)
})

test('the store exposes live sync state for dashboard status', () => {
  const store = read('src/store.jsx')
  const dashboard = read('src/pages/MyDashboard.jsx')
  assert.match(store, /useState\(\(\) => datastore\.dbEnabled\(\) \? 'connecting' : 'offline'\)/)
  assert.match(store, /setLiveSyncStatus\('live'\)/)
  assert.match(store, /value=\{\{ \.\.\.api, liveSyncStatus \}\}/)
  assert.match(dashboard, /LiveSyncBadge/)
  assert.match(dashboard, /store\.liveSyncStatus/)
})

test('the second final-release decision uses the normal transition gate before auto-advancing', () => {
  const store = read('src/store.jsx')
  assert.match(store, /transitionBlockers\(releasedOpp, 'Submitted', releasedProposal, next\)/)
  assert.match(store, /milestone: 'Submitted'/)
  assert.match(store, /releasedOpp\.milestone !== 'Submitted'/,
    'duplicate realtime events must not advance an already submitted quote again')
})

test('an already-approved current release is reconciled after boot or live refresh', () => {
  const store = read('src/store.jsx')
  assert.match(store, /function reconcileApprovedSubmissions\(s\)/)
  assert.match(store, /reconcileApprovedSubmissions\(migrate\(/)
  assert.match(store, /opp\.milestone !== 'Approval'/)
})
