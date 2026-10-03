import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const storeSource = fs.readFileSync('src/store.jsx', 'utf8')
const workbenchSource = fs.readFileSync('src/pages/Workbench.jsx', 'utf8')

test('KYC checklist completion updates customer master status', () => {
  assert.match(storeSource, /const complete = items\.length > 0 && items\.every\(k => k\.state === 'Verified'\)/)
  assert.match(storeSource, /customers: s\.customers\.map\(c => \(c\.name === customerName\s+\? \{ \.\.\.c, kyc: complete \? 'Valid' : 'Pending' \}/)
  assert.doesNotMatch(storeSource, /payment: complete \?/)
})

test('Customer KYC tab keeps completion document-based', () => {
  assert.match(workbenchSource, /const canVerify = store\.role === 'AH' \|\| isAdminRole\(store\.role\)/)
  assert.doesNotMatch(workbenchSource, /simulateAllKycDone|Simulate all KYC done/)
  assert.match(workbenchSource, /Upload…|Replace…/)
})
