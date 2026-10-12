import test from 'node:test'
import assert from 'node:assert/strict'
import { ACCESS_ACTIONS, defaultAccessPolicy, effectiveAccess, canAccessPage, canPerform, validateAccessPolicy } from '../src/accessPolicy.js'

test('explicit application roles override operational authority and revocation', () => {
  const user = { role: 'LJS', roles: ['STANDARD_USER'] }
  const config = { accessPolicy: defaultAccessPolicy() }
  config.accessPolicy.roles.STANDARD_USER.actions = []
  config.accessPolicy.roles.STANDARD_USER.pages = []
  assert.deepEqual(effectiveAccess(user, config).actions, [])
  assert.equal(canAccessPage(user, 'admin', config), false)
  assert.equal(canPerform(['LJS', 'STANDARD_USER'], 'priceLists.manage', config), false)
  assert.equal(effectiveAccess({role:'ADMIN',roles:[]}).isAdmin, false)
})
test('admin cannot be locked out; configurable role grants combine', () => {
  const policy = defaultAccessPolicy()
  policy.roles.STANDARD_USER = { pages: ['inbox'], actions: ['leads.create'] }
  policy.roles.MANAGEMENT = { pages: ['analytics'], actions: ['commercial.view'] }
  const config = { accessPolicy: policy }
  assert.equal(canAccessPage('ADMIN','admin',config), true)
  for (const { id } of ACCESS_ACTIONS) assert.equal(canPerform('ADMIN',id,config), true)
  const both = effectiveAccess(['STANDARD_USER','MANAGEMENT'],config)
  assert.deepEqual(both.pages,['inbox','analytics'])
  assert.deepEqual(both.actions,['leads.create','commercial.view'])
})
test('proposal pricing is independent of cross-pipeline commercial reports', () => {
  assert.equal(canPerform('RS','commercial.view'), false)
  assert.equal(canPerform('RS','proposals.price'), true)
  assert.equal(canPerform('RS','records.delete'), true)
  assert.equal(canPerform('AH','approvals.decide'), true)
  assert.equal(canPerform('TEAM_LEAD','approvals.decide'), false)
  assert.equal(canAccessPage('RS','order'), true)
})
test('policy validation rejects unknown grants, protected roles and malformed lists', () => {
  assert.equal(validateAccessPolicy(defaultAccessPolicy()).valid, true)
  for (const mutate of [p => p.roles.ADMIN = {pages:[],actions:[]}, p => p.roles.STANDARD_USER.pages.push('admin'), p => p.roles.MANAGEMENT.actions.push('unknown'), p => p.roles.MANAGEMENT.actions = null, p => p.roles.STANDARD_USER.pages.push('inbox'), p => p.version = 2]) {
    const policy = defaultAccessPolicy(); mutate(policy)
    assert.equal(validateAccessPolicy(policy).valid, false)
    assert.deepEqual(effectiveAccess('STANDARD_USER',{accessPolicy:policy}).pages,[])
  }
  assert.deepEqual(effectiveAccess(null).actions,[])
})
test('default policy copies cannot mutate subsequent resolutions', () => {
  const p = defaultAccessPolicy(); p.roles.STANDARD_USER.actions.length = 0
  assert.equal(canPerform('STANDARD_USER','leads.create'),true)
})
test('legacy technical personas and AH retain baseline until policy or application assignment', () => {
  assert.equal(canPerform({role:'TECH'},'proposals.price'),false)
  assert.equal(canAccessPage({role:'TECH'},'new'),false)
  assert.equal(canAccessPage({role:'AN'},'folders'),true)
  assert.equal(canAccessPage({role:'AH'},'proposal'),true)
  assert.equal(canPerform({role:'TECH',roles:['STANDARD_USER']},'proposals.price'),true)
  const accessPolicy = defaultAccessPolicy(); accessPolicy.roles.MANAGEMENT.pages=[]
  assert.equal(canAccessPage({role:'AH'},'proposal',{accessPolicy}),false)
})

// Run against a disposable local database with migrations 000/008/011/020/022
// already applied. The SQL rolls all fixtures back. Never point this at live data.
test('PostgreSQL permission boundary integration', { skip: !process.env.ACCESS_POLICY_TEST_DATABASE_URL }, async () => {
  const { execFileSync } = await import('node:child_process')
  execFileSync(process.env.PSQL_BIN || 'psql', [process.env.ACCESS_POLICY_TEST_DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-f', new URL('./access-policy-db.sql', import.meta.url).pathname], { encoding: 'utf8' })
})
