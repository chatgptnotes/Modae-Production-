import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_KYC_VALIDATION,
  kycIdentityKey,
  kycValidationConfig,
  simulatedKycValue,
  validateKycValue,
} from '../src/kycValidation.js'

test('default KYC rules identify and validate GST, PAN, and CIN', () => {
  assert.equal(kycIdentityKey('GST certificate'), 'GST')
  assert.equal(kycIdentityKey('PAN certificate'), 'PAN')
  assert.equal(kycIdentityKey('CIN reference'), 'CIN')
  assert.equal(validateKycValue('GST certificate', '27ABCDE1234F1Z5').ok, true)
  assert.equal(validateKycValue('PAN certificate', 'ABCDE1234F').ok, true)
  assert.equal(validateKycValue('CIN reference', 'L12345MH2020PLC123456').ok, true)
})

test('invalid required identity values are rejected with an explanation', () => {
  const gst = validateKycValue('GST certificate', 'bad')
  assert.equal(gst.ok, false)
  assert.match(gst.message, /valid/i)
  assert.equal(validateKycValue('PAN certificate', '').ok, false)
})

test('simulated KYC verification supplies valid demo identifiers', () => {
  assert.equal(validateKycValue('GST certificate', simulatedKycValue('GST certificate')).ok, true)
  assert.equal(validateKycValue('PAN certificate', simulatedKycValue('PAN certificate')).ok, true)
  assert.equal(validateKycValue('CIN reference', simulatedKycValue('CIN reference')).ok, true)
  assert.equal(simulatedKycValue('Cancelled cheque'), '')
})

test('Admin configuration can disable or make a rule optional', () => {
  const config = { kycValidation: {
    GST: { enabled: false },
    PAN: { required: false },
  } }
  const rules = kycValidationConfig(config)
  assert.equal(rules.GST.enabled, false)
  assert.equal(validateKycValue('GST certificate', 'bad', config).ok, true)
  assert.equal(validateKycValue('PAN certificate', '', config).ok, true)
  assert.equal(rules.CIN.pattern, DEFAULT_KYC_VALIDATION.CIN.pattern)
})

test('Admin can replace a validation pattern', () => {
  const config = { kycValidation: { GST: { pattern: '^GST-[0-9]+$' } } }
  assert.equal(validateKycValue('GST certificate', 'GST-123', config).ok, true)
  assert.equal(validateKycValue('GST certificate', '27ABCDE1234F1Z5', config).ok, false)
})
