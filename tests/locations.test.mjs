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
