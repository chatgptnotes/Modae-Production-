import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import { seedConfig } from '../src/seed.js'
import { nextActionWith, readiness, transitionBlockers } from '../src/gates.js'

const workbenchSource = fs.readFileSync('src/pages/Workbench.jsx', 'utf8')
const proposal = { terms: [], bom: [{ quoted: 100, listPrice: 100 }], revision: '01' }
const baseOpp = {
  id: 'OP-KYC',
  sellTo: 'Blue Buyer Ltd',
  oppName: 'Blue buyer proposal',
  owner: 'RS',
  route: 'Spares',
  contactPerson: 'Buyer',
  contactPhone: '9999999999',
  milestone: 'Sourcing',
  customerStatus: 'Blue',
}

test('Blue KYC transition blocker opens the KYC tab instead of milestone exception', () => {
  assert.match(workbenchSource, /item\.key === 'kyc' && <button className="exception-action" onClick=\{\(\) => openTransitionTab\('customer'\)\}>Open Customer\/KYC<\/button>/)
  assert.match(workbenchSource, /const canRequestException = blocker => !blocker\.approvalType\s+&& \['amber-fee', 'red-clearance'\]\.includes\(blocker\.key\)/)
  assert.doesNotMatch(workbenchSource, /\['kyc', 'amber-fee', 'red-clearance'\]\.includes\(blocker\.key\)/)
})

test('optional KYC never blocks Proposal', () => {
  const state = { approvals: [], kyc: {}, clarifications: [] }
  const blocked = transitionBlockers(baseOpp, 'Proposal', proposal, state)
  assert.equal(blocked.some(b => b.key === 'kyc'), false)

  const verified = transitionBlockers(baseOpp, 'Proposal', proposal, {
    ...state,
    kyc: {
      'Blue Buyer Ltd': seedConfig.kycItems.map(name => ({ name, state: 'Verified' })),
    },
  })
  assert.equal(verified.some(b => b.key === 'kyc'), false, 'verified KYC should clear the KYC blocker')
})

test('Blue lead-stage KYC verification clears the opportunity KYC gate', () => {
  const state = { approvals: [], kyc: {}, clarifications: [] }
  const leadVerifiedOpp = {
    ...baseOpp,
    milestone: 'Customer/KYC',
    leadVerification: { type: 'KYC', status: 'Verified' },
  }

  const blockers = transitionBlockers(leadVerifiedOpp, 'Registration', proposal, state)
  assert.equal(blockers.some(b => b.key === 'kyc'), false, 'lead-stage verified KYC should clear Registration')
  assert.equal(readiness(leadVerifiedOpp, proposal, state).some(b => b.key === 'kyc-block'), false,
    'lead-stage verified KYC should clear readiness')
  assert.equal(nextActionWith(leadVerifiedOpp, proposal, state).owner, '',
    'lead-stage verified KYC should not assign the next action to AH')
})

test('unverified lead-stage KYC remains optional', () => {
  const state = { approvals: [], kyc: {}, clarifications: [] }
  const blockers = transitionBlockers({
    ...baseOpp,
    milestone: 'Customer/KYC',
    leadVerification: { type: 'KYC', status: 'Pending' },
  }, 'Registration', proposal, state)
  assert.equal(blockers.some(b => b.key === 'kyc'), false)
})

test('commercial deviation still uses AH approval', () => {
  assert.match(workbenchSource, /Request \{item\.approvalType\.toLowerCase\(\)\} from \{blockerOwner\(item\)\}/)

  const deviatingProposal = {
    ...proposal,
    terms: [{ term: 'Payment', status: 'Deviation', customerAsk: '90 days', ourResponse: '30 days' }],
  }
  const blockers = transitionBlockers({ ...baseOpp, customerStatus: 'Green' }, 'Proposal', deviatingProposal, {
    approvals: [],
    kyc: {},
    clarifications: [],
  })
  const deviation = blockers.find(b => b.key === 'dev')
  assert.equal(deviation?.approvalType, 'Commercial deviation')
  assert.equal(deviation?.approver, 'AH')
})
