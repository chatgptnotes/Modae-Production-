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

test('Customer KYC tab offers an AH-admin simulated completion shortcut', () => {
  assert.match(workbenchSource, /const canVerify = store\.role === 'AH' \|\| isAdminRole\(store\.role\)/)
  assert.match(workbenchSource, /const simulateAllKycDone = \(\) => \{/)
  assert.match(workbenchSource, /if \(!customer \|\| !canVerify \|\| busy\) return/)
  assert.match(workbenchSource, /items\.forEach\(item => store\.setKycState\(customer\.name, item\.name, 'Verified'\)\)/)
  assert.match(workbenchSource, /Simulate all KYC done/)
  assert.match(workbenchSource, /disabled=\{!canVerify \|\| !!busy \|\| items\.every\(k => k\.state === 'Verified'\)\}/)
})
