import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

test('the shared workspace subscribes to the rows that can resolve a release', () => {
  const datastore = read('src/datastore.js')
  assert.match(datastore, /subscribeBusinessChanges/)
  assert.match(datastore, /table: 'approvals'/)
  assert.match(datastore, /table: 'opportunities'/)
  assert.match(datastore, /filter: 'entity=eq\.proposals'/)

  const store = read('src/store.jsx')
  assert.match(store, /datastore\.subscribeBusinessChanges\(reload/)
  assert.match(store, /datastore\.loadAll\(\)\.then/)
  assert.match(store, /setTimeout\(flushSaves, 0\)/,
    'approval decisions must bypass the ordinary draft-save debounce')
})

test('the live-sync migration publishes only shared business tables', () => {
  const migration = read('supabase/007_live_workspace_sync.sql')
  for (const table of ['approvals', 'opportunities', 'records']) {
    assert.match(migration, new RegExp(`'${table}'`))
  }
  assert.match(migration, /alter publication supabase_realtime add table public\.%I/)
  assert.match(migration, /existing RLS policies/)
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
