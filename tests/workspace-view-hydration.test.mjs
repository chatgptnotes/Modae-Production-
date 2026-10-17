import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import { mergeWorkspaceView } from '../src/workspaceViews.js'

// Exercise the production hydration function, including its session guard and
// first-load baseline, without starting a browser or contacting a real account.
const source = readFileSync(new URL('../src/store.jsx', import.meta.url), 'utf8')
const implementation = source.slice(source.indexOf('  const ensureWorkspaceView ='), source.indexOf('\n  const hydrate ='))
function harness() {
  const stateRef = { current: { auth: { user: { id: 'A' } }, opportunities: [{ id: 'stale' }], proposals: { stale: {} }, audit: [{ id: 'old' }] } }
  const baseline = { current: {} }, hydrated = { current: false }, epoch = { current: 1 }, requested = { current: null }
  const calls = [], pending = []
  let summary = null, activeView = null
  const ctx = vm.createContext({ Promise, JSON, Map, stateRef, lastSavedRef: baseline, hydratedRef: hydrated, authEpochRef: epoch,
    authInvalidRef: { current: false }, viewRequestsRef: { current: new Map() }, requestedViewRef: requested,
    approvalViewRevisionsRef: { current: {} }, bootRef: { current: {} }, workspaceSyncState: {},
    datastore: { dbEnabled: () => true, loadWorkspaceView: view => { calls.push(view); return new Promise(resolve => pending.push(resolve)) }, installWorkspaceViewRevisions() {} },
    mergeWorkspaceView, registerDirtyRecords() {}, applyAuthoritativeProfile: s => s, migrate: s => s,
    emptyState: s => ({ ...s, opportunities: [], proposals: {}, audit: [] }), syncedOf: s => s,
    setState: s => { stateRef.current = s }, recordFrom: (s, entity, id) => s[entity]?.find?.(r => r.id === id),
    applyServer: slices => { stateRef.current = { ...stateRef.current, ...slices }; baseline.current = { ...baseline.current, ...slices } },
    setOverview: value => { summary = value }, setActiveDataView: value => { activeView = value },
    setLiveSyncStatus() {}, setSourcingDataStatus() {}, setSourcingDataError() {}, setSyncDiagnostics() {}, invalidateSupabaseAuth: () => false,
  })
  vm.runInContext(`${implementation}; globalThis.load = ensureWorkspaceView`, ctx)
  return { load: ctx.load, calls, pending, stateRef, baseline, epoch, get summary() { return summary }, get view() { return activeView } }
}
const response = view => ({ view, slices: { users: [{ id: 'A' }], config: {}, leads: [], approvals: [] }, summary: { opportunities: [{ id: 'summary', valueK: 25 }], signals: {} }, revisions: [] })
test('first overview clears stale browser business rows without saving summary rows', async () => {
  const h = harness(), view = { kind: 'overview' }
  const first = h.load(view), duplicate = h.load(view)
  assert.equal(h.calls.length, 1)
  h.pending[0](response(view))
  assert.equal(await first, true)
  assert.equal(await duplicate, true)
  assert.equal(h.stateRef.current.opportunities.length, 0)
  assert.equal(Object.keys(h.stateRef.current.proposals).length, 0)
  assert.equal(h.stateRef.current.audit.length, 0)
  assert.equal(h.baseline.current.opportunities.length, 0)
  assert.equal(h.summary.opportunities[0].valueK, 25)
})
test('a late response from a signed-out account cannot install state or summary', async () => {
  const h = harness(), view = { kind: 'overview' }
  const request = h.load(view)
  h.epoch.current++
  h.pending[0](response(view))
  assert.equal(await request, false)
  assert.equal(h.summary, null)
})
test('a slower old route cannot replace the active route summary', async () => {
  const h = harness(), overview = { kind: 'overview' }, list = { kind: 'list' }
  const first = h.load(overview), second = h.load(list)
  h.pending[1]({ ...response(list), slices: { ...response(list).slices, opportunities: [{ id: 'full' }] } })
  await second
  h.pending[0](response(overview))
  await first
  assert.equal(h.view.kind, 'list')
})

test('inline row editing waits for dependencies and does not open on a failed read', async () => {
  const cells = readFileSync(new URL('../src/ui/EditableOpportunityCell.jsx', import.meta.url), 'utf8')
  const code = cells.slice(cells.indexOf('  const begin = async () => {'), cells.indexOf('\n  useLayoutEffect', cells.indexOf('  const begin = async () => {')))
  let complete, editing = false, error = '', calls = 0
  const ctx = vm.createContext({ preparing: { current: false }, coordinator: { current: null }, handle: { current: {} },
    setLoading() {}, setLoadError: value => { error = value }, setEditing: value => { editing = value },
    prepareEdit: () => { calls++; return new Promise(resolve => { complete = resolve }) }, Error,
  })
  vm.runInContext(`${code}; globalThis.beginEdit = begin`, ctx)
  const first = ctx.beginEdit()
  await ctx.beginEdit()
  assert.equal(editing, false)
  assert.equal(calls, 1)
  complete(false)
  await first
  assert.equal(editing, false)
  assert.match(error, /retry/)
  const retry = ctx.beginEdit()
  complete(true)
  await retry
  assert.equal(editing, true)
  assert.equal(error, '')
})
