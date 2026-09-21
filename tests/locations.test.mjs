import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeGeoNamesResults } from '../api/locations.js'

test('normalizes worldwide GeoNames results with country information', () => {
  assert.deepEqual(normalizeGeoNamesResults([{
    name: 'Tokyo', adminName1: 'Tokyo', countryName: 'Japan', countryCode: 'JP',
  }]), [{
    city: 'Tokyo', state: 'Tokyo', country: 'Japan', countryCode: 'JP',
    region: 'Tokyo', routingRegion: 'International opportunities', value: 'Tokyo, Tokyo, Japan', source: 'geonames',
  }])
})
