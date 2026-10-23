import test from 'node:test'
import assert from 'node:assert/strict'
import { addressVerdict, validateGoogleAddress, createAddressValidationHandler, isLocalAddressValidationRequest } from '../api/address-validation.js'

const confirmed = () => ({ result: { verdict: { addressComplete: true, validationGranularity: 'PREMISE' }, address: {
  formattedAddress: 'Plot 48, Dahej, Gujarat 392130, India',
  addressComponents: ['premise','locality','administrative_area_level_1','postal_code','country'].map(componentType => ({ componentType, componentName: { text: componentType }, confirmationLevel: 'CONFIRMED' })),
} } })
test('only complete confirmed premise addresses receive High confidence', () => {
  assert.equal(addressVerdict(confirmed()).status, 'Valid')
  assert.equal(addressVerdict(confirmed()).confidence, 'High')
  for (const patch of [{ addressComplete: false }, { validationGranularity: 'LOCALITY' }, { hasInferredComponents: true }, { hasReplacedComponents: true }, { hasUnconfirmedComponents: true }]) {
    const data = confirmed(); Object.assign(data.result.verdict, patch)
    assert.equal(addressVerdict(data).status, 'Needs Clarification')
    assert.notEqual(addressVerdict(data).confidence, 'High')
  }
  const data = confirmed(); data.result.address.addressComponents.pop()
  assert.equal(addressVerdict(data).status, 'Needs Clarification')
})
test('geographic replacements flag a conflict; spelling corrections require confirmation', () => {
  const data = confirmed()
  Object.assign(data.result.address.addressComponents[2], { replaced: true })
  assert.equal(addressVerdict(data).status, 'Invalid')
  const typo = confirmed(); typo.result.verdict.hasSpellCorrectedComponents = true
  assert.equal(addressVerdict(typo).status, 'Needs Clarification')
})
test('missing key, provider failures and no matches remain advisory', async () => {
  let calls = 0
  const fetcher = async () => { calls++; throw new Error('secret URL and address') }
  assert.equal((await validateGoogleAddress('Some address', { key: '', fetcher })).status, 'Needs Clarification')
  assert.equal(calls, 0)
  const result = await validateGoogleAddress('Some address', { key: 'private', fetcher })
  assert.equal(result.confidence, 'Low')
  assert.ok(!JSON.stringify(result).includes('secret'))
  assert.equal(calls, 1)
})
test('Geocoding fallback never treats coordinates as full validation and never truncates', async () => {
  const long = 'Industrial workshop '.repeat(20)
  const urls = []
  const result = await validateGoogleAddress(long, { key: 'private', fetcher: async url => {
    urls.push(String(url))
    return { ok: true, json: async () => ({ status: 'OK', results: [{ formatted_address: 'Dahej, India', geometry: { location: { lat: 1, lng: 2 } }, partial_match: true }] }) }
  } })
  assert.equal(urls.length, 1)
  assert.equal(new URL(urls[0]).searchParams.get('address'), long.trim())
  assert.equal(result.status, 'Needs Clarification')
  assert.notEqual(result.confidence, 'High')
  assert.equal(result.canApply, false)
})
test('only coverage/insufficient results fall back, not quotas or confirmed conflicts', async () => {
  for (const first of [{ ok: false, status: 429, json: async () => ({}) }, { ok: true, json: async () => {
    const data = confirmed(); data.result.address.addressComponents[2].replaced = true; return data
  } }]) {
    let calls = 0
    await validateGoogleAddress('Plot 48, Dahej, Gujarat 392130, India', { key: 'key', fetcher: async () => { calls++; return first } })
    assert.equal(calls, 1)
  }
  let calls = 0
  const result = await validateGoogleAddress('Unknown territory', { key: 'key', fetcher: async () => {
    calls++
    return calls === 1 ? { ok: false, status: 400, json: async () => ({ error: { message: 'Unsupported region' } }) }
      : { ok: true, json: async () => ({ status: 'ZERO_RESULTS', results: [] }) }
  } })
  assert.equal(calls, 2); assert.equal(result.status, 'Needs Clarification')
})

function fixture() {
  const profile = { id: 'sales', authId: 'auth-id', email: 'sales@example.com', status: 'Active', roles: ['STANDARD_USER'] }
  const client = { auth: { getUser: async token => token === 'valid' ? { data: { user: { id: 'auth-id', email: profile.email } } } : { error: true } }, from(table) {
    const q = { select: () => q, eq: () => q, is: () => q, maybeSingle: async () => ({ data: { data: table === 'records' ? [profile] : {} } }) }; return q
  } }
  let calls = 0
  const handler = createAddressValidationHandler({ getClient: () => client, validate: async () => { calls++; return addressVerdict(confirmed()) } })
  const run = async (body, authorization = 'Bearer valid') => {
    const res = { code: 200, setHeader() {}, status(code) { this.code = code; return this }, json(body) { this.body = body; return this } }
    await handler({ method: 'POST', headers: { authorization }, body }, res); return res
  }
  return { profile, run, calls: () => calls }
}
test('endpoint authenticates active editors and validates/deduplicates at most two fields', async () => {
  const f = fixture(), fields = { eucLocation: 'Plot 48, Dahej, India', sellToCustomerLocation: 'Plot 48, Dahej, India' }
  assert.equal((await f.run({ fields }, '')).code, 401)
  assert.equal((await f.run({ fields }, 'Bearer expired')).code, 401)
  f.profile.roles = ['NON_SALES']
  assert.equal((await f.run({ fields })).code, 403)
  f.profile.roles = ['STANDARD_USER']; f.profile.status = 'Inactive'
  assert.equal((await f.run({ fields })).code, 403)
  f.profile.status = 'Active'
  for (const fields of [{ other: 'x' }, { eucLocation: 12 }, { eucLocation: 'x'.repeat(1001) }]) assert.equal((await f.run({ fields })).code, 400)
  const res = await f.run({ fields })
  assert.equal(res.code, 200); assert.equal(f.calls(), 1)
  assert.equal(res.body.results.eucLocation.status, 'Valid')
  assert.equal(res.body.results.sellToCustomerLocation.status, 'Valid')
})

test('local demo checks require an explicit loopback development request and never bypass production auth', async () => {
  const request = { method: 'POST', headers: { host: 'localhost:3002', origin: 'http://localhost:5173', 'x-wintrack-local-address': 'true' }, socket: { remoteAddress: '127.0.0.1' }, body: { fields: { eucLocation: 'An address' } } }
  assert.equal(isLocalAddressValidationRequest(request, 'development'), true)
  assert.equal(isLocalAddressValidationRequest(request, 'production'), false)
  for (const bad of [
    { ...request, headers: { ...request.headers, origin: 'https://other.example' } },
    { ...request, headers: { ...request.headers, host: 'public.example' } },
    { ...request, headers: { ...request.headers, 'x-wintrack-local-address': '' } },
    { ...request, socket: { remoteAddress: '203.0.113.1' } },
  ]) assert.equal(isLocalAddressValidationRequest(bad, 'development'), false)
  const handler = createAddressValidationHandler({ getClient: () => { throw new Error('Local checks must not read the shared database') }, validate: async () => addressVerdict(confirmed()) })
  const res = { status(code) { this.code = code; return this }, json(body) { this.body = body; return this }, setHeader() {} }
  await handler(request, res)
  assert.equal(res.code, 200)
})
