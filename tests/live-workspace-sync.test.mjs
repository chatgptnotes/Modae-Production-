import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

test('the shared workspace loads normally once and uses targeted Railway live updates', () => {
  const datastore = read('src/datastore.js')
  assert.doesNotMatch(datastore, /postgres_changes|subscribeBusinessChanges|loadChangedRows|\.channel\(/)
  assert.match(datastore, /loadAll\(\{ force = false \} = \{\}\)/)
  assert.match(datastore, /\.is\('deleted_at', null\)/)

  const store = read('src/store.jsx')
  assert.match(store, /const location = useLocation\(\)/)
  assert.match(store, /import \{ readLiveData, startLiveEvents \} from '\.\/liveSync\.js'/)
  assert.match(datastore, /saveWorkspaceToRailway\(collaborativeDirty\)/)
  assert.match(store, /return startLiveEvents\(/)
  assert.doesNotMatch(store, /publishLiveChanges\(/)
  assert.doesNotMatch(store, /pullSharedData\(\)\.catch\(\(\) => setLiveSyncStatus\('error'\)\)/)
  assert.match(store, /window\.addEventListener\('focus'/)
  assert.match(store, /document\.addEventListener\('visibilitychange'/)
  assert.match(store, /async refreshSharedData\(\)/)
  assert.match(store, /setTimeout\(flushSaves, 0\)/,
    'approval decisions must bypass the ordinary draft-save debounce')
  for (const table of ['proposals', 'spares_lines', 'clarifications', 'audit', 'settings', 'price_lists', 'price_list_versions']) {
    assert.match(datastore, new RegExp(`${table}: '${table}'`))
  }
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
  assert.match(datastore, /currentActorId\(\)/)
  assert.match(datastore, /p_rows: payload\.map\(row => \(\{ \.\.\.row, by: actor \}\)\)/)
  assert.match(datastore, /if \(result\.error\) throw annotateRpcError\(entity, result\.error\)/)
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
  assert.match(datastore, /let saveSlicesActive = false/)
  assert.match(datastore, /pendingDirtySlices/)
  assert.match(datastore, /const mergeDirtySlices = /)
  assert.match(datastore, /for \(const \[, write\] of writes\) await write\(\)/)
})

test('opportunity creation flushes before immediate workbench navigation', () => {
  const store = read('src/store.jsx')
  assert.match(store, /Opportunity creation is immediately followed by navigation/)
  assert.match(store, /setTimeout\(flushSaves, 0\)\n      spTrack\(opp\.id, 'Open'/)
})

test('approval requests flush before a reload can discard the pending gate', () => {
  const store = read('src/store.jsx')
  const requestApproval = store.slice(store.indexOf('    requestApproval(req) {'), store.indexOf('    cancelApproval(', store.indexOf('    requestApproval(req) {')))
  assert.match(requestApproval, /Approval requests gate workflow transitions[\s\S]*must survive an[\s\S]*immediate reload/)
  assert.match(requestApproval, /setTimeout\(flushSaves, 0\)/)
})

test('lead creation flushes before immediate inbox navigation', () => {
  const store = read('src/store.jsx')
  assert.match(store, /A new enquiry is immediately followed by navigation/)
  assert.match(store, /'Lead received',[\s\S]*setTimeout\(flushSaves, 0\)/)
})

test('empty workspace hydration does not republish the browser snapshot', () => {
  const store = read('src/store.jsx')
  const emptyHydration = store.slice(store.indexOf('if (res.empty) {'), store.indexOf('} else {', store.indexOf('if (res.empty) {')))
  assert.match(emptyHydration, /hydratedRef\.current = true/)
  assert.match(emptyHydration, /priceLists: \{\}/)
  assert.doesNotMatch(emptyHydration, /setTimeout\(flushSaves, 0\)/,
    'an empty authoritative workspace must not republish cached rows')
})

test('save failures expose the Supabase error in sync diagnostics', () => {
  const store = read('src/store.jsx')
  assert.match(store, /lastSaveError: saveError/)
  assert.match(store, /message: e\?\.message \|\| 'Supabase save failed'/)
  assert.match(store, /entity: e\?\.entity \|\| ''/)
  assert.match(store, /status: e\?\.status \|\| e\?\.statusCode \|\| null/)
})

test('save RPC errors retain the entity that failed', () => {
  const datastore = read('src/datastore.js')
  assert.match(datastore, /const annotateRpcError = \(entity, error\)/)
  assert.match(datastore, /throw annotateRpcError\(entity, result\.error\)/)
  assert.match(datastore, /throw annotateRpcError\('opportunities', result\.error\)/)
})

test('focus retries dirty writes without reloading the whole shared workspace', () => {
  const store = read('src/store.jsx')
  const focus = store.slice(store.indexOf('const onFocus = () => {'), store.indexOf('const onVisibility = () =>'))
  assert.match(focus, /if \(!hydratedRef\.current\) \{ hydrate\(\); return \}/)
  assert.match(focus, /flushSaves\(\)/)
  assert.doesNotMatch(focus, /pullSharedData\(\)/)
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
  assert.match(workbench, /OpportunityNotFound/)
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

test('price-list loading requires the shared catalogue', () => {
  const datastore = read('src/datastore.js')
  const store = read('src/store.jsx')
  assert.doesNotMatch(datastore, /readPriceListsCache/)
  assert.doesNotMatch(datastore, /degraded: true/)
  assert.doesNotMatch(store, /result\.degraded \? 'degraded' : 'ready'/)
})

test('forced pull reads reuse an older request instead of queuing another fetch', () => {
  const datastore = read('src/datastore.js')
  assert.match(datastore, /if \(loadInFlight\) \{[\s\S]*return loadInFlight/)
})

test('save failures use backoff instead of immediate retry storms', () => {
  const store = read('src/store.jsx')
  assert.match(store, /const saveRetryRef = useRef\(\{ attempts: 0, retryAt: 0, timer: null \}\)/)
  assert.match(store, /if \(retry\.retryAt > Date\.now\(\)\) return Promise\.resolve\(\)/)
  assert.match(store, /Math\.min\(30000, 2000 \* /)
  assert.match(store, /retrying in/)
})

test('save_rows migration orders incoming ids before upserting', () => {
  const migration = read('supabase/011_save_rows_lock_order.sql')
  assert.match(migration, /create or replace function public\.save_rows\(p_entity text, p_rows jsonb\)/)
  assert.equal((migration.match(/order by r->>'id'/g) || []).length, 2)
  assert.match(migration, /grant execute on function public\.save_rows\(text, jsonb\)/)
})

test('the store retains internal sync state without rendering status messaging', () => {
  const store = read('src/store.jsx')
  const dashboard = read('src/pages/MyDashboard.jsx')
  assert.match(store, /useState\(\(\) => supabaseConfigError \? 'config-error' : datastore\.dbEnabled\(\) \? 'connecting' : 'offline'\)/)
  assert.match(store, /setLiveSyncStatus\('live'\)/)
  assert.match(store, /StoreCtx\.Provider value=\{\{ \.\.\.api, authReady, liveSyncStatus, syncDiagnostics, adminSaveState \}\}/)
  assert.doesNotMatch(dashboard, /LiveSyncBadge|store\.liveSyncStatus|Local only|Sync error|Reconnecting/)
  const app = read('src/App.jsx')
  assert.doesNotMatch(app, /SyncNotice|workspace-sync-notice|Supabase sync unavailable|local data only/)
  const workbench = read('src/pages/Workbench.jsx')
  assert.doesNotMatch(workbench, /OpportunitySyncUnavailable|shared workspace could not confirm/)
})

test('refresh safety keeps quota recovery but accepts empty server responses', () => {
  const store = read('src/store.jsx')
  assert.match(store, /Local cache was not updated; keeping the last known-good browser snapshot/)
  assert.doesNotMatch(store, /localStorage\.removeItem\(KEY\)\n\s*localStorage\.setItem\(KEY/)
  assert.doesNotMatch(store, /unexpectedEmptyBusinessSlice/)
  assert.match(store, /const serverSlices = syncedOf\(slices\)/)
  assert.match(store, /deletedOpportunityIds: \[\]/)
})

test('boot does not delete the active browser snapshot before reading it', () => {
  const store = read('src/store.jsx')
  assert.doesNotMatch(store, /localStorage\.removeItem\(['"]wintrack-modae-v4['"]\)/)
})

test('session restoration cannot leave the login screen waiting forever', () => {
  const store = read('src/store.jsx')
  assert.match(store, /const SESSION_RESTORE_TIMEOUT_MS = 8000/)
  assert.match(store, /Promise\.race\(/)
  assert.match(store, /Supabase session restore timed out; continuing to the sign-in screen/)
})

test('invalid Supabase auth clears the session and pauses save retries', () => {
  const store = read('src/store.jsx')
  const supabase = read('src/supabase.js')
  assert.match(supabase, /export const isSupabaseAuthError = error =>/)
  assert.match(supabase, /export async function clearSupabaseSession\(\)/)
  assert.match(store, /const authInvalidRef = useRef\(false\)/)
  assert.match(store, /if \(authInvalidRef\.current\) return Promise\.resolve\(\)/)
  assert.match(store, /invalidateSupabaseAuth\(error\)/)
  assert.match(store, /clearSupabaseSession\(\)/)
  assert.match(store, /authInvalidRef\.current = false/)
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
