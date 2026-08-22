import test from 'node:test'
import assert from 'node:assert/strict'

import { INDIA_LOCATIONS, indiaLocation, indiaRegionForLocation } from '../src/indiaLocations.js'

test('India location catalogue covers all states and union territories', () => {
  assert.ok(INDIA_LOCATIONS.length >= 4000)
  assert.equal(new Set(INDIA_LOCATIONS.map(item => item.state)).size, 36)
})

test('city selection resolves the configured business region', () => {
  assert.equal(indiaLocation('Kolkata — West Bengal')?.state, 'West Bengal')
  assert.equal(indiaRegionForLocation('Kolkata'), 'South & East India')
  assert.equal(indiaRegionForLocation('Mumbai'), 'North & West India')
})
