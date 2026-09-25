import test from 'node:test'
import assert from 'node:assert/strict'
import { ownerIdFor } from '../src/seed.js'

test('ownerIdFor keeps canonical role ids stable', () => {
  assert.equal(ownerIdFor('RS'), 'RS')
  assert.equal(ownerIdFor('PJS'), 'PJS')
})

test('ownerIdFor resolves default and admin-customized display names', () => {
  assert.equal(ownerIdFor('R. Sundaram'), 'RS')
  assert.equal(ownerIdFor('Parts Team', { PJS: 'Parts Team' }), 'PJS')
})

test('ownerIdFor preserves unknown values for auditability', () => {
  assert.equal(ownerIdFor('Unassigned'), 'Unassigned')
  assert.equal(ownerIdFor(''), '')
})
