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
  assert.equal(validateKycValue('PAN certificate', 'ABCPD1234F').ok, true)
  assert.equal(validateKycValue('CIN reference', 'L12345MH2020PLC123456').ok, true)
})

test('default KYC rules expose human-readable formats and examples', () => {
  assert.match(DEFAULT_KYC_VALIDATION.GST.format, /2 digits.*5 uppercase letters/)
  assert.equal(DEFAULT_KYC_VALIDATION.GST.example, '27ABCDE1234F1Z5')
  assert.match(DEFAULT_KYC_VALIDATION.PAN.format, /status letter.*4 digits/)
  assert.equal(DEFAULT_KYC_VALIDATION.PAN.example, 'ABCPD1234F')
  assert.match(DEFAULT_KYC_VALIDATION.CIN.format, /2 state letters.*4-digit year/)
  assert.equal(DEFAULT_KYC_VALIDATION.CIN.example, 'L12345MH2020PLC123456')
})

test('invalid required identity values are rejected with an explanation', () => {
  const gst = validateKycValue('GST certificate', 'bad')
  assert.equal(gst.ok, false)
  assert.match(gst.message, /valid/i)
  assert.equal(validateKycValue('PAN certificate', '').ok, false)
})

test('GST validation enforces the standard segment structure', () => {
  for (const value of [
    'A7ABCDE1234F1Z5',
    '27AB1DE1234F1Z5',
    '27ABCDE1234F1Y5',
    '27ABCDE1234F1Z',
  ]) {
    assert.equal(validateKycValue('GST certificate', value).ok, false, value)
  }
})

test('PAN and CIN validation enforce their identifier structures', () => {
  assert.equal(validateKycValue('PAN certificate', 'ABCPD1234F').ok, true)
  assert.equal(validateKycValue('PAN certificate', 'ABCDX1234F').ok, false)
  assert.equal(validateKycValue('PAN certificate', 'ABCPD123F').ok, false)

  assert.equal(validateKycValue('CIN reference', 'L12345MH2020PLC123456').ok, true)
  assert.equal(validateKycValue('CIN reference', 'X12345MH2020PLC123456').ok, false)
  assert.equal(validateKycValue('CIN reference', 'L12345M12020PLC123456').ok, false)
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
