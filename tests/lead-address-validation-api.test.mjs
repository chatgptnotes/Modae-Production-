import test from 'node:test'
import assert from 'node:assert/strict'
import { requestAddressValidation, beginAddressExtraction, rememberAddressExtraction, validateExtractedLeadLocations, leadAddressValidation } from '../src/leadAddressValidationApi.js'

test('validation transport uses authenticated same-origin requests and rejects account changes', async () => {
  const signal = new AbortController().signal
  let account = 'A', requests = 0
  const auth = { getSession: async () => ({ data: { session: { access_token: 'secret', user: { id: account } } } }) }
  const fetcher = async (url, options) => {
    requests++
    assert.equal(url, '/api/locations/validate'); assert.equal(options.cache, 'no-store')
    assert.equal(options.headers.Authorization, 'Bearer secret')
    assert.deepEqual(JSON.parse(options.body), { fields: { eucLocation: 'Original' } })
    return { ok: true, json: async () => ({ results: { eucLocation: { status: 'Valid' } } }) }
  }
  assert.equal((await requestAddressValidation({ eucLocation: 'Original' }, signal, auth, fetcher)).eucLocation.status, 'Valid')
  await assert.rejects(requestAddressValidation({ eucLocation: 'Original' }, signal, auth, async (...args) => {
    const response = await fetcher(...args); account = 'B'; return response
  }), /account changed/i)
  const aborted = new AbortController(); aborted.abort()
  await assert.rejects(requestAddressValidation({}, aborted.signal, auth, fetcher))
  assert.equal(requests, 2)
})

test('only successful extraction contexts for the current account may start a background check', async () => {
  const storeA = { auth: { source: 'supabase', user: { id: 'A' } } }
  const storeB = { auth: { source: 'supabase', user: { id: 'B' } } }
  const extracted = { eucLocation: 'A address', ai: { scan: { complete: true } } }
  const contextA = beginAddressExtraction(storeA)
  rememberAddressExtraction(extracted, contextA)
  beginAddressExtraction(storeB)
  validateExtractedLeadLocations(storeA, 'lead-A', extracted)
  assert.equal(leadAddressValidation.read('A', 'lead-A', 'eucLocation', 'A address'), null)
  const incomplete = { eucLocation: 'B address', ai: { scan: { complete: false } } }
  rememberAddressExtraction(incomplete, beginAddressExtraction(storeB))
  validateExtractedLeadLocations(storeB, 'lead-B', incomplete)
  assert.equal(leadAddressValidation.read('B', 'lead-B', 'eucLocation', 'B address'), null)
  leadAddressValidation.setAccount(null)
})

test('a newer extraction for the same lead supersedes an older unfinished extraction', () => {
  const store = { auth: { source: 'supabase', user: { id: 'A' } } }
  const old = { eucLocation: 'Old address', ai: { scan: { complete: true } } }
  const context = beginAddressExtraction(store, 'same-lead')
  beginAddressExtraction(store, 'same-lead')
  rememberAddressExtraction(old, context)
  validateExtractedLeadLocations(store, 'same-lead', old)
  assert.equal(leadAddressValidation.read('A', 'same-lead', 'eucLocation', 'Old address'), null)
  leadAddressValidation.setAccount(null)
})
