import test from 'node:test'
import assert from 'node:assert/strict'
import { classRule, classOrder, checklistFor, noExceptionKeys, upgradeCustomerRules, migrateCustomerClassification, normalizeCustomerClass, LEGACY_CUSTOMER_CLASSES } from '../src/customerClasses.js'
import { migrate, seedState } from '../src/appState.js'
import { customerStatusForLead } from '../src/leadCustomerClass.js'

test('classification is manual and old labels normalize without customer or flag inference', () => {
  assert.deepEqual(classOrder(), ['Green', 'Yellow', 'Red', 'Unclassified'])
  assert.equal(normalizeCustomerClass('Blue'), 'Red')
  assert.equal(normalizeCustomerClass('Amber'), 'Yellow')
  assert.equal(customerStatusForLead({ sellTo: 'Buyer', redFlag: true }, [{ name: 'Buyer', status: 'Red' }]), 'Unclassified')
  assert.equal(customerStatusForLead({ customerStatus: 'Green' }), 'Green')
})
test('migration preserves legacy controls separately and is idempotent', () => {
  const config = upgradeCustomerRules({ customerClasses: LEGACY_CUSTOMER_CLASSES })
  const blue = migrateCustomerClassification({ customerStatus: 'Blue', verification: { kyc: { GST: { state: 'Missing' } } } })
  const red = migrateCustomerClassification({ customerStatus: 'Red' })
  assert.equal(blue.customerStatus, 'Red')
  assert.equal(blue.legacyCustomerClass, 'Blue')
  assert.deepEqual(migrateCustomerClassification(blue), blue)
  assert.equal(classRule(config, blue.customerStatus, blue).gate, null)
  assert.equal(classRule(config, red.customerStatus, red).gate.key, 'red-clearance')
  assert.equal(classRule(config, 'Red', { customerClassificationVersion: 2 }).gate, null)
  assert.equal(blue.verification.kyc.GST.state, 'Missing')
  assert.equal(upgradeCustomerRules(config), config)
})
test('custom fee controls and terms survive migration while KYC cannot block', () => {
  const config = upgradeCustomerRules({ amberFee: { days: 12 }, classRules: { Green: '60 days', Amber: 'Advance' }, customerClasses: { Blue: { ...LEGACY_CUSTOMER_CLASSES.Blue, gate: { ...LEGACY_CUSTOMER_CLASSES.Blue.gate, severity: 'block' } } } })
  assert.equal(config.customerClasses.Yellow.verification.deadlineDays, 12)
  assert.equal(config.customerClasses.Green.paymentTerms, '60 days')
  assert.equal(config.customerClasses.Yellow.gate.key, 'amber-fee')
  assert.equal(classRule(config, 'Blue').gate, null)
  assert.ok(checklistFor(config, 'Unclassified').length)
  assert.ok(noExceptionKeys(config).includes('red-clearance'))
})
test('state projection upgrades all collection labels and retains original records and evidence', () => {
  const state = seedState()
  state.leads = [{ id: 'L', customerStatus: 'Blue', verification: { kycRequestStatus: 'deferred' } }]
  state.customers = [{ name: 'Buyer', status: 'Amber' }]
  state.opportunities = [{ id: 'O', customerStatus: 'Red', owner: 'RS' }]
  const migrated = migrate(state)
  assert.equal(migrated.leads.find(row => row.id === 'L').customerStatus, 'Red')
  assert.equal(migrated.leads.find(row => row.id === 'L').verification.kycRequestStatus, 'deferred')
  assert.equal(migrated.customers[0].status, 'Yellow')
  assert.equal(migrated.opportunities[0].legacyCustomerClass, 'Red')
  assert.equal(migrated.config.customerPolicyVersion, 2)
})
