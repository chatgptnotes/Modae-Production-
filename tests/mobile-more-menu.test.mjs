import test from 'node:test'
import assert from 'node:assert/strict'

test('More opens purchase orders at the canonical route only for authorized roles', async () => {
  const { mobileDestinations } = await import('../src/tablet/mobileDestinations.js')
  for (const role of ['RS', 'LJS', 'ADMIN']) {
    const result = mobileDestinations({ role }, 'purchase orders')
    assert.equal(result.length, 1)
    assert.equal(result[0][1], '/order')
  }
  assert.equal(mobileDestinations({ role: 'CUST' }, 'purchase orders').length, 0)
})

test('More hides unavailable demo scenarios while preserving permission-filtered search', async () => {
  const { mobileDestinations } = await import('../src/tablet/mobileDestinations.js')
  const store = { roles: ['RS', 'ADMIN'], demoData: false }
  assert.equal(mobileDestinations(store, 'demo').length, 0)
  assert.ok(mobileDestinations({ ...store, demoData: true }, 'demo').some(item => item[1] === '/launcher'))
  assert.ok(mobileDestinations(store, 'inbox').some(item => item[1] === '/inbox'))
  assert.equal(mobileDestinations({ role: 'RS' }, 'Users and roles').length, 0)
  assert.ok(mobileDestinations(store, 'automation')[0][0].includes('map'))
})
