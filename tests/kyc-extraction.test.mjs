import test from 'node:test'
import assert from 'node:assert/strict'
import { extractKycIdentityCandidate, normalizeKycCandidate } from '../src/kycExtraction.js'

test('KYC text extraction finds GST, PAN and CIN values', () => {
  assert.equal(extractKycIdentityCandidate('GST certificate', 'GSTIN: 27ABCDE1234F1Z5').value, '27ABCDE1234F1Z5')
  assert.equal(extractKycIdentityCandidate('PAN certificate', 'PAN No: ABCDE1234F').value, 'ABCDE1234F')
  assert.equal(extractKycIdentityCandidate('CIN reference', 'CIN U62099KA2024PTC185715').value, 'U62099KA2024PTC185715')
})

test('KYC extraction returns no identity value when the requested value is absent', () => {
  assert.equal(extractKycIdentityCandidate('PAN certificate', 'Cancelled cheque attached'), null)
  assert.equal(extractKycIdentityCandidate('Cancelled cheque', 'PAN ABCDE1234F'), null)
})

test('KYC candidates are normalized before validation', () => {
  assert.equal(normalizeKycCandidate(' 27-ab cde1234f1z5 '), '27ABCDE1234F1Z5')
})
