import test from 'node:test'
import assert from 'node:assert/strict'
import { readWorkspaceScope } from '../api/_workspace-view-reader.js'
import { workspaceView, mergeWorkspaceView } from '../src/workspaceViews.js'
import { projectWorkspace } from '../src/workspaceAccess.js'
import { installWorkspaceViewRevisions, resetWorkspaceViewRecords, workspaceRecord } from '../src/datastore.js'

const rows = {
  settings: [{ id: 'config', data: {}, rev: 1 }],
  records: [{ entity: 'state', id: 'workspace_generation', data: { value: 7 }, rev: 1 }, { entity: 'state', id: 'users', data: [], rev: 1 }, { entity: 'state', id: 'customers', data: [], rev: 1 }, { entity: 'state', id: 'secret-unrelated', data: { big: true }, rev: 1 }],
  leads: [{ id: 'L1', rev: 3, data: { id: 'L1', subject: 'Hello', assignedOwner: 'PP', body: 'x'.repeat(500), attachments: [{ name: 'large.xlsx' }], ai: { summary: 'Summary', fields: [{ k: 'A', v: 'secret', state: 'pending' }] } } }],
  opportunities: [{ id: 'A', rev: 4, data: { id: 'A', owner: 'PP', oppName: 'Alpha', sellTo: 'Customer', stage: 'Won', status: 'Closed', booking: { valueK: 10 }, workflowHistory: [1] } }, { id: 'B', rev: 8, data: { id: 'B', owner: 'KK', oppName: 'Beta' } }],
  approvals: [], proposals: [{ id: 'A', rev: 3, data: { revision: '02', bom: ['private'] } }],
  spares_lines: [{ id: 'S1', rev: 2, data: { id: 'S1', oppId: 'A' } }, { id: 'S2', rev: 2, data: { id: 'S2', oppId: 'B' } }], clarifications: [], audit: [],
}
function clientFixture() {
  const calls = []
  return { calls, from(name) {
    const call = { name, filters: [] }; calls.push(call)
    const query = {
      select(select) { call.select = select; return query },
      is(...filter) { call.filters.push(['is', ...filter]); return query },
      eq(...filter) { call.filters.push(['eq', ...filter]); return query },
      in(...filter) { call.filters.push(['in', ...filter]); return query },
      or(filter) { call.related = filter; return query },
      then(resolve, reject) {
        let data = structuredClone(rows[name] || []).filter(row => call.filters.every(([op, key, value]) => op === 'is' ? (row[key] ?? null) === value : op === 'in' ? value.includes(row[key]) : row[key] === value))
        if (call.related) {
          const id = JSON.parse(call.related.match(/\.eq\.(".*?")/)[1])
          data = data.filter(row => ['oppId','opportunityId','ref','objectId'].some(key => row.data[key] === id))
        }
        if (!call.select.includes(',data,')) data = data.map(row => Object.fromEntries(call.select.split(',').map(field => {
          const [alias, path] = field.split(':')
          return [alias, path ? path.split('->').slice(1).reduce((v, key) => v?.[key], row.data) : row[alias]]
        })))
        return Promise.resolve({ data }).then(resolve, reject)
      },
    }
    return query
  } }
}

test('Inbox chooses only mailbox dependencies and strips attachment/extraction payloads', async () => {
  const client = clientFixture(), state = await readWorkspaceScope(client, { kind: 'inbox' })
  const response = workspaceView(state, { kind: 'inbox' })
  assert.ok(client.calls.every(call => !['proposals','spares_lines','clarifications','audit','price_lists'].includes(call.name)))
  const recordQuery = client.calls.find(call => call.name === 'records')
  assert.ok(recordQuery.filters.some(([op, key]) => op === 'in' && key === 'id'))
  assert.equal(state['secret-unrelated'], undefined)
  assert.equal(response.slices.leads, undefined)
  assert.equal(response.summary.leads[0].attachments, undefined)
  assert.equal(response.summary.leads[0].body.length, 160)
  assert.deepEqual(response.summary.leads[0].ai.fields, [{ state: 'pending' }])
  assert.equal(response.summary.leadRevisions.L1, 3)
  assert.equal(response.summary.navigation.opportunities[0].workflowHistory, undefined)
  assert.equal(state._readMetrics.queries, client.calls.length)
})

test('opportunity details filter database rows before reading and preserve full revision evidence', async () => {
  const client = clientFixture(), state = await readWorkspaceScope(client, { kind: 'detail', id: 'A' })
  assert.deepEqual(state.opportunities.map(row => row.id), ['A'])
  assert.deepEqual(state._revisions.opportunities.map(row => [row.id, row.rev]), [['A', 4]])
  for (const name of ['spares_lines','clarifications','audit']) assert.ok(client.calls.find(call => call.name === name).related)
  assert.ok(client.calls.find(call => call.name === 'proposals').filters.some(([op, key, value]) => op === 'eq' && key === 'id' && value === 'A'))
  assert.deepEqual(state.sparesLines.map(row => row.id), ['S1'])
  const response = workspaceView(state, { kind: 'detail', id: 'A' })
  const merged = mergeWorkspaceView({ opportunities: [{ id: 'B' }], proposals: { B: {} }, sparesLines: [{ id: 'OLD', oppId: 'A' }, { id: 'S2', oppId: 'B' }] }, response)
  assert.deepEqual(merged.opportunities.map(row => row.id).sort(), ['A','B'])
  assert.deepEqual(merged.sparesLines.map(row => row.id).sort(), ['S1','S2'])
  assert.ok(merged.proposals.B)
})

test('lead coverage preserves unrelated records and missing slices never delete opportunity baselines', () => {
  const current = { leads: [{ id: 'L1' }, { id: 'L2' }] }
  assert.deepEqual(mergeWorkspaceView(current, { view: { kind: 'lead', id: 'L1' }, slices: { leads: [] }, coverage: { records: { leads: ['L1'] } } }).leads, [{ id: 'L2' }])
  resetWorkspaceViewRecords()
  installWorkspaceViewRevisions({ view: { kind: 'list' }, slices: { opportunities: rows.opportunities.map(row => row.data) }, revisions: [{ entity: 'opportunities', id: 'A', rev: 4 }] })
  installWorkspaceViewRevisions({ view: { kind: 'inbox' }, slices: {}, revisions: [] })
  assert.equal(workspaceRecord('opportunities','A').rev, 4)
  resetWorkspaceViewRecords()
})

test('navigation indexes pass through permission projection', async () => {
  const state = await readWorkspaceScope(clientFixture(), { kind: 'inbox' })
  const projected = projectWorkspace(state._navigation, { role: 'NON_SALES', roles: ['NON_SALES'] })
  assert.deepEqual(projected.opportunities, [])
  assert.deepEqual(projected.leads, [])
})
