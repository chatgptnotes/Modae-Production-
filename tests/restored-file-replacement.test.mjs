import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
function harness({ uploadFails = false, deleteFails = false } = {}) {
  let recovered = [{ name: 'original.pdf', folder: 'Customer Specs', size: 2 }]
  const calls = []
  const context = vm.createContext({ supabase: {}, Date,
    sp: { isConfigured: () => true, getAccount: () => ({}), ensureOppFolder: async () => 'Open', uploadFile: async () => { calls.push('upload'); if(uploadFails)throw new Error('SharePoint failed'); return { name: 'original.pdf', itemId: 'new', webUrl: 'https://example.test/new' } }, listFiles: async () => ({ 'Customer Specs': [{ name: 'original.pdf', itemId: 'new', webUrl: 'https://example.test/new' }] }) },
    listUserFiles: async () => recovered,
    deleteUserFile: async scope => { calls.push('retire'); assert.equal(scope.fileName, 'original.pdf'); if(deleteFails)throw new Error('Could not retire restored copy'); recovered = [] },
  })
  const source = readFileSync('src/filestore.js', 'utf8').replace(/^import .*\n/gm, '').replace(/^export /gm, '')
  vm.runInContext(`${source}; globalThis.api = { uploadOppFile, listOppFiles }`, context)
  return { ...context.api, calls }
}
test('successful SharePoint replacement retires the restored copy before reopening', async () => {
  const h = harness(), opp = { id: 'O-1' }
  await h.uploadOppFile(opp, 'Customer Specs', { name: 'original.pdf', size: 3 })
  const files = await h.listOppFiles(opp)
  assert.deepEqual(h.calls, ['upload', 'retire'])
  assert.equal(files['Customer Specs'][0].webUrl, 'https://example.test/new')
  assert.equal(files['Customer Specs'][0].backend, undefined)
})
test('failed SharePoint upload preserves recovered originals', async () => {
  const h = harness({ uploadFails: true })
  await assert.rejects(h.uploadOppFile({ id: 'O' }, 'Customer Specs', { name: 'original.pdf', size: 3 }), /SharePoint failed/)
  assert.deepEqual(h.calls, ['upload'])
})
test('failed recovered-copy retirement is reported instead of claiming replacement succeeded', async () => {
  const h = harness({ deleteFails: true })
  await assert.rejects(h.uploadOppFile({ id: 'O' }, 'Customer Specs', { name: 'original.pdf', size: 3 }), /retire restored copy/)
})
