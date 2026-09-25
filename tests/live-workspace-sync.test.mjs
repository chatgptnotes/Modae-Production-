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
  assert.match(datastore, /table: 'records'/)
  assert.doesNotMatch(datastore, /filter: 'entity=eq\.proposals'/)
  assert.match(datastore, /loadChangedRows/)
  assert.match(datastore, /select\('id, data, rev, deleted_at'\)/)

  const store = read('src/store.jsx')
  assert.match(store, /datastore\.subscribeBusinessChanges\(reload/)
  assert.match(store, /datastore\.loadChangedRows\(events\)/)
  assert.match(store, /events\.length > 12/)
  assert.match(store, /setTimeout\(.*1000\)/s)
  assert.match(store, /entity === 'state'/)
  assert.match(store, /entity === 'settings' && row\.id === 'config'/)
  assert.match(store, /price_list_versions/)
  assert.match(store, /refreshRequired/)
  assert.match(store, /loadApprovedPriceLists\(\{ force: true \}\)/)
  assert.match(store, /Date\.now\(\) - lastFetch < 45000/)
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
  assert.match(datastore, /function saveNormalizedRowsNow\(entity, rows\)/)
  assert.match(datastore, /supabase\.rpc\('save_rows'/)
  assert.match(datastore, /if \(result\.error\) throw result\.error/)
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
  assert.match(datastore, /let saveSlicesQueue = Promise\.resolve\(\)/)
  assert.match(datastore, /saveSlicesQueue = saveSlicesQueue[\s\S]*saveSlicesNow\(dirty\)/)
})

test('opportunity creation flushes before immediate workbench navigation', () => {
  const store = read('src/store.jsx')
  assert.match(store, /Opportunity creation is immediately followed by navigation/)
  assert.match(store, /setTimeout\(flushSaves, 0\)\n      spTrack\(opp\.id, 'Open'/)
})

test('lead creation flushes before immediate inbox navigation', () => {
  const store = read('src/store.jsx')
  assert.match(store, /A new enquiry is immediately followed by navigation/)
  assert.match(store, /'Lead received',[\s\S]*setTimeout\(flushSaves, 0\)/)
})

test('empty workspace hydration flushes leads created during startup', () => {
  const store = read('src/store.jsx')
  const emptyHydration = store.slice(store.indexOf('if (res.empty) {'), store.indexOf('} else {', store.indexOf('if (res.empty) {')))
  assert.match(emptyHydration, /hydratedRef\.current = true/)
  assert.match(emptyHydration, /setTimeout\(flushSaves, 0\)/,
    'a lead created before hydration must be uploaded after an empty workspace response')
})

test('save failures expose the Supabase error in sync diagnostics', () => {
  const store = read('src/store.jsx')
  const app = read('src/App.jsx')
  assert.match(store, /lastSaveError: saveError/)
  assert.match(store, /message: e\?\.message \|\| 'Supabase save failed'/)
  assert.match(app, /diagnostics\?\.lastLoadError \|\| diagnostics\?\.lastSaveError/)
})

test('focus retries dirty writes before refreshing shared data', () => {
  const store = read('src/store.jsx')
  const focus = store.slice(store.indexOf('const onFocus = () => {'), store.indexOf('const onVisibility = () =>'))
  assert.match(focus, /if \(!hydratedRef\.current\) \{ hydrate\(\); return \}/)
  assert.match(focus, /flushSaves\(\)/)
  assert.match(focus, /datastore\.loadAll\(\{ force: true \}\)/)
})

test('pending opportunity IDs stay local-only and are persisted in the browser snapshot', () => {
  const datastore = read('src/datastore.js')
  const store = read('src/store.jsx')
  const appState = read('src/appState.js')
  assert.match(datastore, /'pendingOpportunitySyncIds'/)
  assert.match(store, /pendingOpportunitySyncIds: state\.pendingOpportunitySyncIds/)
  assert.match(store, /pendingOpportunitySyncIds: \[\.\.\.new Set\(/)
  assert.match(appState, /const pendingOpportunitySyncIds = Array\.isArray\(s\.pendingOpportunitySyncIds\)/)
  assert.match(appState, /s\.pendingOpportunitySyncIds = \[\.\.\.new Set\(/)
})

test('deep-link opportunity recovery reads the normalized opportunity row directly', () => {
  const datastore = read('src/datastore.js')
  const store = read('src/store.jsx')
  const workbench = read('src/pages/Workbench.jsx')
  assert.match(datastore, /export async function loadOpportunity\(id\)/)
  assert.match(datastore, /\.eq\('id', id\)/)
  assert.match(store, /async recoverOpportunity\(id\)/)
  assert.match(store, /datastore\.loadOpportunity\(id\)/)
  assert.match(workbench, /store\.recoverOpportunity\(oppId\)/)
  assert.match(workbench, /Opportunity sync unavailable/)
})

test('row conflicts use bounded latest-save-wins retries', () => {
  const datastore = read('src/datastore.js')
  assert.match(datastore, /const MAX_CONFLICT_RETRIES = 3/)
  assert.match(datastore, /attempt <= MAX_CONFLICT_RETRIES/)
  assert.match(datastore, /serverRow\.rev/)
  assert.match(datastore, /preserving the local row being saved/)
})

test('consolidated state and configuration conflicts use bounded latest-save-wins retries', () => {
  const datastore = read('src/datastore.js')
  assert.match(datastore, /async function saveConsolidatedRows\(entity, rows, label\)/)
  assert.match(datastore, /p_entity: entity/)
  assert.match(datastore, /const conflicts = Array\.isArray\(result\.data\?\.conflicts\)/)
  assert.match(datastore, /data: local\?\.data \?\? serverRow\.data/)
  assert.match(datastore, /Consolidated \$\{label\} save conflict after/)
  assert.match(datastore, /return saveConsolidatedRows\(CONSOLIDATED_STATE_ENTITY, rows, 'state'\)/)
  assert.match(datastore, /saveConsolidatedRows\(CONSOLIDATED_SETTINGS_ENTITY/)
})

test('price-list loading keeps a usable cached catalogue when the shared copy is unavailable', () => {
  const datastore = read('src/datastore.js')
  const store = read('src/store.jsx')
  const priceLists = read('src/pages/PriceLists.jsx')
  assert.match(datastore, /const fallback = readPriceListsCache\(\)/)
  assert.match(datastore, /degraded: true/)
  assert.match(store, /result\.degraded \? 'degraded' : 'ready'/)
  assert.match(priceLists, /showing the last cached copy/)
})

test('forced realtime reads wait out an older request before fetching fresh data', () => {
  const datastore = read('src/datastore.js')
  assert.match(datastore, /if \(loadInFlight\) \{[\s\S]*const pending = loadInFlight[\s\S]*return force \? pending\.then\(\(\) => loadAll\(\{ force: true \}\)\)/)
})

test('the store exposes live sync state for dashboard status', () => {
  const store = read('src/store.jsx')
  const dashboard = read('src/pages/MyDashboard.jsx')
  assert.match(store, /useState\(\(\) => supabaseConfigError \? 'config-error' : datastore\.dbEnabled\(\) \? 'connecting' : 'offline'\)/)
  assert.match(store, /setLiveSyncStatus\('live'\)/)
  assert.match(store, /StoreCtx\.Provider value=\{\{ \.\.\.api, authReady, liveSyncStatus, syncDiagnostics \}\}/)
  assert.match(dashboard, /LiveSyncBadge/)
  assert.match(dashboard, /store\.liveSyncStatus/)
})

test('refresh safety retains local data on quota failures and empty full responses', () => {
  const store = read('src/store.jsx')
  assert.match(store, /Local cache was not updated; keeping the last known-good browser snapshot/)
  assert.doesNotMatch(store, /localStorage\.removeItem\(KEY\)\n\s*localStorage\.setItem\(KEY/)
  assert.match(store, /const unexpectedEmptyBusinessSlice/)
  assert.match(store, /Ignoring empty \$\{k\} refresh response/)
  assert.match(store, /Supabase returned an empty workspace; local data was preserved/)
  assert.match(store, /allowEmptyBusinessSlices: true/)
})

test('session restoration cannot leave the login screen waiting forever', () => {
  const store = read('src/store.jsx')
  assert.match(store, /const SESSION_RESTORE_TIMEOUT_MS = 8000/)
  assert.match(store, /Promise\.race\(/)
  assert.match(store, /Supabase session restore timed out; continuing to the sign-in screen/)
})

test('workflow stage changes are gated and use the India business date', () => {
  const store = read('src/store.jsx')
  assert.match(store, /setMilestone\(oppId, milestone, reason = '', \{ alreadyGated = false \} = \{\}\)/)
  assert.match(store, /transitionBlockers\(before, milestone, stateRef\.current\.proposals\?\.\[oppId\]/)
  assert.match(store, /const today = nowIST\(\)\.slice\(0, 10\)/)
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
