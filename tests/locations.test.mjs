import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeGeoNamesResults } from '../api/locations.js'
import { normalizeLocationValue } from '../src/locations.js'

test('normalizes worldwide GeoNames results with country information', () => {
  assert.deepEqual(normalizeGeoNamesResults([{
    name: 'Tokyo', adminName1: 'Tokyo', countryName: 'Japan', countryCode: 'JP',
  }]), [{
    city: 'Tokyo', state: 'Tokyo', country: 'Japan', countryCode: 'JP',
    region: 'Tokyo', routingRegion: 'International opportunities', value: 'Tokyo, Tokyo, Japan', source: 'geonames',
  }])
})

test('normalizes custom Indian location text into a logical postal format', () => {
  assert.equal(normalizeLocationValue('gggg - 400000, Maharashtra'), 'gggg, Maharashtra - 400000')
  assert.equal(normalizeLocationValue('Plant - 400000, Maharashtra, India'), 'Plant, Maharashtra - 400000')
  assert.equal(normalizeLocationValue('Mumbai, Maharashtra, India - 400001'), 'Mumbai, Maharashtra - 400001')
})

test('preserves canonical and unrecognized custom locations', () => {
  assert.equal(normalizeLocationValue('Tokyo, Tokyo, Japan'), 'Tokyo, Tokyo, Japan')
  assert.equal(normalizeLocationValue('Remote site, Western Australia - WA'), 'Remote site, Western Australia - WA')
})

test('explicit AI location search reads the structured response from the configured API', async () => {
  const { searchAiLocations } = await import('../src/locations.js')
  const original = globalThis.fetch
  const calls = []
  try {
    globalThis.fetch = async (url, options) => {
      calls.push({url,body:JSON.parse(options.body)})
      return Response.json({ok:true,data:{locations:[{city:'Pune',state:'Maharashtra',country:'India',countryCode:'IN'}]}})
    }
    const found = await searchAiLocations('Pune',6)
    assert.equal(calls.length,1)
    assert.equal(calls[0].body.task,'location.search')
    assert.equal(found[0].value,'Pune, Maharashtra, India')
    assert.equal(found[0].routingRegion,'Maharashtra')
  } finally {globalThis.fetch=original}
})
