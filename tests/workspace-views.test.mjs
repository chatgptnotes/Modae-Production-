import test from 'node:test'
import assert from 'node:assert/strict'
import { workspaceView, workspaceViewForPath, mergeWorkspaceView } from '../src/workspaceViews.js'

const state = {
  config: {}, users: [], opportunities: [{ id: 'A', status: 'Closed', stage: 'Won', owner: 'PP', valueK: 12, booking: { valueK: 12 }, workflowHistory: [{ detail: 'large' }] }, { id: 'B', status: 'Closed', stage: 'Lost' }],
  proposals: { A: { bom: [1] }, B: { bom: [2] } }, sparesLines: [{ id: 'S1', oppId: 'A' }, { id: 'S2', oppId: 'B' }], clarifications: [], audit: [],
}
test('overview contains summary rows without proposal payloads or full opportunity history', () => {
  const result = workspaceView(state, { kind: 'overview' })
  assert.equal(result.slices.opportunities, undefined)
  assert.equal(result.slices.proposals, undefined)
  assert.equal(result.summary.opportunities[0].valueK, 12)
  assert.deepEqual(result.summary.opportunities[0].booking, { valueK: 12 })
  assert.equal(result.summary.opportunities[0].workflowHistory, undefined)
})
test('register loads opportunity records but defers proposal and BOQ details', () => {
  const result = workspaceView(state, { kind: 'list' })
  assert.deepEqual(result.slices.opportunities, state.opportunities)
  assert.equal(result.slices.proposals, undefined)
})
test('opening an opportunity returns only its related details', () => {
  const result = workspaceView(state, { kind: 'detail', id: 'A' })
  assert.deepEqual(result.slices.opportunities.map(row => row.id), ['A'])
  assert.deepEqual(Object.keys(result.slices.proposals), ['A'])
  assert.deepEqual(result.slices.sparesLines.map(row => row.id), ['S1'])
  const merged = mergeWorkspaceView(state, result)
  assert.deepEqual(merged.proposals, state.proposals)
  assert.deepEqual(merged.sparesLines, state.sparesLines)
  assert.equal(merged.opportunities.length, 2)
})
test('empty scoped results remove only that opportunity’s related records', () => {
  const response = workspaceView({ ...state, proposals: {}, sparesLines: [] }, { kind: 'detail', id: 'A' })
  const merged = mergeWorkspaceView(state, response)
  assert.deepEqual(merged.proposals, { B: { bom: [2] } })
  assert.deepEqual(merged.sparesLines, [{ id: 'S2', oppId: 'B' }])
})
test('routes request only the visible view, including direct opportunity links', () => {
  assert.deepEqual(workspaceViewForPath('/my-dashboard'), { kind: 'overview' })
  assert.deepEqual(workspaceViewForPath('/opportunities'), { kind: 'list' })
  assert.deepEqual(workspaceViewForPath('/opp/A/proposal'), { kind: 'detail', id: 'A' })
  assert.deepEqual(workspaceViewForPath('/approvals'), { kind: 'approvals' })
})

import { createWorkspaceViewCache } from '../src/workspaceViewCache.js'
test('reopening a view and simultaneous readers reuse one request; force refreshes', async () => {
  let calls = 0, time = 0
  const cache = createWorkspaceViewCache({ now: () => time })
  const load = async () => ++calls
  assert.deepEqual(await Promise.all([cache.read('A', load), cache.read('A', load)]), [1, 1])
  assert.equal(await cache.read('A', load), 1)
  assert.equal(await cache.read('A', load, { force: true }), 2)
  time = 180000
  assert.equal(await cache.read('A', load), 3)
  assert.equal(await cache.read('other-account', load), 4)
})
test('failed requests retry and invalidation prevents an old request entering the cache', async () => {
  const cache = createWorkspaceViewCache()
  await assert.rejects(cache.read('A', async () => { throw new Error('offline') }), /offline/)
  let finish
  const old = cache.read('A', () => new Promise(resolve => { finish = resolve }))
  await Promise.resolve()
  cache.clear()
  finish('old')
  await assert.rejects(old, error => error.code === 'VIEW_READ_INVALIDATED')
  assert.equal(await cache.read('A', async () => 'new'), 'new')
})

import { installWorkspaceViewRevisions, resetWorkspaceViewRecords, workspaceRecord } from '../src/datastore.js'
test('summary rows never become writable opportunity baselines and loaded rows retain real revisions', () => {
  resetWorkspaceViewRecords()
  installWorkspaceViewRevisions({ ...workspaceView(state, { kind: 'overview' }), revisions: [] })
  assert.equal(workspaceRecord('opportunities', 'A'), undefined)
  const result = { ...workspaceView(state, { kind: 'detail', id: 'A' }), revisions: [{ entity: 'opportunities', id: 'A', rev: 9 }, { entity: 'proposals', id: 'A', rev: 4 }] }
  installWorkspaceViewRevisions(result)
  assert.equal(workspaceRecord('opportunities', 'A').rev, 9)
  assert.equal(workspaceRecord('opportunities', 'B'), undefined)
  assert.deepEqual(workspaceRecord('proposals', 'A'), { rev: 4, data: { bom: [1] } })
  installWorkspaceViewRevisions({ ...result, revisions: [{ entity: 'opportunities', id: 'A', rev: 10 }] }, (entity, id) => entity === 'opportunities' && id === 'A')
  assert.equal(workspaceRecord('opportunities', 'A').rev, 9)
  resetWorkspaceViewRecords()
  assert.equal(workspaceRecord('proposals', 'A'), undefined)
})

import { reconcileWorkspaceCollection, workspaceNeedsCatalogue } from '../src/workspaceViews.js'
import { patchWorkspaceViewSnapshot } from '../src/workspaceViewSnapshots.js'
test('refresh updates clean records while retaining edited values and original baselines in either sync mode', () => {
  const baseline = [{ id: 'A', text: 'base A' }, { id: 'B', text: 'base B' }]
  const local = [{ id: 'A', text: 'typing' }, baseline[1]]
  const server = [{ id: 'A', text: 'remote A' }, { id: 'B', text: 'remote B' }]
  const result = reconcileWorkspaceCollection(local, baseline, server)
  assert.deepEqual(result.value, [{ id: 'A', text: 'typing' }, { id: 'B', text: 'remote B' }])
  assert.deepEqual(result.baseline, [{ id: 'A', text: 'base A' }, { id: 'B', text: 'remote B' }])
  // Form-local inputs can pin a baseline even before changing store state.
  const pinned = reconcileWorkspaceCollection(baseline, baseline, server, id => id === 'A')
  assert.deepEqual(pinned.value[0], baseline[0])
  assert.deepEqual(pinned.baseline[0], baseline[0])
  const map = reconcileWorkspaceCollection({ A: { text: 'typing' }, B: {} }, { A: {}, B: {} }, { A: { text: 'remote' }, B: { text: 'new' } })
  assert.deepEqual(map.value.B, { text: 'new' })
  assert.deepEqual(map.baseline.A, {})
})

test('confirmed create/edit/delete rows update cached display models without creating baselines', () => {
  const result = workspaceView({ ...state, leads: [{ id: 'L', subject: 'Old' }] }, { kind: 'inbox' })
  patchWorkspaceViewSnapshot(result, [{ entity: 'leads', id: 'NEW', rev: 1, data: { id: 'NEW', subject: 'Created', attachments: [1] } }])
  assert.equal(result.summary.leads.length, 2)
  assert.equal(result.summary.leads[1].attachments, undefined)
  patchWorkspaceViewSnapshot(result, [{ entity: 'leads', id: 'L', rev: 2, data: { id: 'L', subject: 'Edited' } }])
  assert.equal(result.summary.leads.find(row => row.id === 'L').subject, 'Edited')
  patchWorkspaceViewSnapshot(result, [{ entity: 'leads', id: 'L', rev: 3, available: false }])
  assert.deepEqual(result.summary.leads.map(row => row.id), ['NEW'])
  assert.equal(result.slices.leads, undefined)
  patchWorkspaceViewSnapshot(result, [{ entity: 'opportunities', id: 'A', rev: 5, data: { id: 'A', booking: { valueK: 15 }, history: [1] } }])
  assert.deepEqual(result.summary.opportunities.find(row => row.id === 'A').booking, { valueK: 15 })
  assert.equal(result.summary.opportunities.find(row => row.id === 'A').history, undefined)
})

test('only pricing screens require a catalogue dependency', () => {
  for (const path of ['/register/L', '/proposal/A', '/opp/A/sourcing', '/opp/A/proposal', '/pricelists']) assert.equal(workspaceNeedsCatalogue(path), true)
  for (const path of ['/inbox', '/approvals', '/my-dashboard', '/order', '/opp/A/overview']) assert.equal(workspaceNeedsCatalogue(path), false)
})

test('confirmed archive changes and permanent deletion update the archive display snapshot', () => {
  const result = workspaceView({ leads: [], leadArchive: [{ id: 'OLD', subject: 'Old' }] }, { kind: 'inbox' })
  patchWorkspaceViewSnapshot(result, [{ entity: 'state', id: 'leadArchive', rev: 3, data: [{ id: 'NEW', subject: 'Dropped', attachments: [1] }] }])
  assert.deepEqual(result.summary.leadArchive.map(row => row.id), ['NEW'])
  assert.equal(result.summary.leadArchive[0].attachments, undefined)
  patchWorkspaceViewSnapshot(result, [{ entity: 'leads', id: 'NEW', rev: 4, available: false }])
  assert.deepEqual(result.summary.leadArchive, [])
})
