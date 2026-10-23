import test from 'node:test'
import assert from 'node:assert/strict'
import { matchOpportunityFolder } from '../src/sharepointFolderMatch.js'
import { createMicrosoftDocuments } from '../api/_microsoft-documents.js'

test('SharePoint folder names use exact or unique numeric opportunity matches', () => {
  const rows = [{ id: '2407000LJS', sellTo: 'First' }, { id: '2409002', sellTo: 'Second' }]
  assert.equal(matchOpportunityFolder('2407000LJS', rows), rows[0])
  assert.equal(matchOpportunityFolder('2409002LJS', rows), rows[1])
  assert.equal(matchOpportunityFolder('unknown', rows), null)
  assert.equal(matchOpportunityFolder('2407000OTHER', [...rows, { id: '2407000RS' }]), null)
})

test('Documents users can browse the copied Opportunities tree only', async () => {
  const graph = {
    config: { siteId: 'site', driveId: 'drive', rootId: 'root' },
    pages: async url => url.includes('/items/root/')
      ? [{ id: 'opportunities', name: 'Opportunities', folder: {} }, { id: 'pipeline', name: 'Sales Pipeline', folder: {} }]
      : url.includes('/items/opportunities/')
        ? [{ id: 'folder', name: '2407000LJS', folder: {} }]
        : [{ id: 'file', name: 'quote.pdf', file: {}, size: 4 }],
    request: async () => new Response('file', { headers: { 'content-type': 'application/pdf' } }),
  }
  const documents = createMicrosoftDocuments(graph)
  const user = { role: 'STANDARD_USER' }
  const state = { config: {} }
  const listing = await documents.browse(user, state, 'Opportunities')
  assert.deepEqual(listing.items.map(item => item.name), ['2407000LJS'])
  const file = await documents.browseDownload(user, state, 'Opportunities/2407000LJS', 'file')
  assert.equal(file.name, 'quote.pdf')
  await assert.rejects(() => documents.browse(user, state, 'Sales Pipeline'), /Invalid document path/)
  await assert.rejects(() => documents.browseDownload(user, state, 'Sales Pipeline', 'file'), /Invalid document path/)
  await assert.rejects(() => documents.browse({ role: 'NON_SALES' }, state, 'Opportunities'), /Documents access is required/)
})

test('Microsoft opportunity uploads use the same flat Opportunities tree as browsing', async () => {
  const graph = {
    config: { siteId: 'site', driveId: 'drive', rootId: 'root' },
    pages: async url => url.includes('/items/root/')
      ? [{ id: 'opportunities', name: 'Opportunities', folder: {} }]
      : url.includes('/items/opportunities/')
        ? [{ id: 'opp', name: '2407000LJS', folder: {} }]
        : url.includes('/items/opp/')
          ? [{ id: 'specs', name: 'Customer Specs', folder: {} }]
          : url.includes('/items/specs/')
            ? [{ id: 'file', name: 'quote.pdf', file: {}, size: 4 }]
            : [],
    request: async () => { throw new Error('Unexpected SharePoint write') },
  }
  const documents = createMicrosoftDocuments(graph)
  const user = { role: 'STANDARD_USER' }
  const state = { config: {}, opportunities: [{ id: '2407000LJS' }] }
  assert.equal((await documents.ensure(user, state, '2407000LJS')).item.id, 'opp')
  assert.deepEqual(await documents.list(user, state, '2407000LJS'), {
    'Customer Specs': [{ name: 'quote.pdf', itemId: 'file', backend: 'microsoft', date: '', size: 4 }],
  })
  await documents.move(user, state, '2407000LJS', 'WON')
})
