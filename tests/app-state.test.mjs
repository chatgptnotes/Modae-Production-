import test from 'node:test'
import assert from 'node:assert/strict'
import { essentialProposalSnapshot, migrate, seedState } from '../src/appState.js'
import { newProposal } from '../src/seed.js'
import { proposalApprovalSnapshot } from '../src/approvalMemory.js'
import {
  CIN_PATTERN,
  GSTIN_PATTERN,
  LEGACY_CIN_PATTERN,
  LEGACY_GSTIN_PATTERN,
  LEGACY_PAN_PATTERN,
  PAN_PATTERN,
} from '../src/kycValidation.js'

test('the compact local proposal snapshot preserves commercial decisions', () => {
  const proposal = {
    oppId: 'OP-LOCAL', revision: '03', terms: [
      { term: 'Payment', status: 'Deviation', customerAsk: '90 days credit', decision: 'Match customer terms', ourResponse: '90 days credit' },
      { term: 'Delivery', status: 'Deviation', customerAsk: '8 weeks', decision: 'Counter-offer with ModAE standard terms', customerConfirmationStatus: 'Awaiting reply' },
    ],
    bom: [{ pn: 'CMS-RPT', qty: 1 }], costing: { customsDutyPct: 8.5 },
    letterBody: 'This field is intentionally excluded from the compact recovery snapshot.',
  }
  const compact = essentialProposalSnapshot(proposal)
  assert.deepEqual(compact.terms, proposal.terms)
  assert.deepEqual(compact.bom, proposal.bom)
  assert.equal(compact.revision, '03')
  assert.equal(compact.letterBody, undefined)
})

test('migrate repairs an approved release created before the proposal was persisted', () => {
  const state = seedState()
  const opportunity = state.opportunities[0]
  const proposal = newProposal(opportunity.id, opportunity)
  state.proposals = { [opportunity.id]: proposal }
  state.approvals = [{
    id: 'AP-legacy',
    oppId: opportunity.id,
    type: 'Final quote release',
    status: 'Approved',
    approver: 'LJS',
    needed: ['LJS', 'AH'],
    decisions: { LJS: { d: 'Approved' }, AH: { d: 'Approved' } },
    approvalSnapshot: proposalApprovalSnapshot(undefined, opportunity),
  }]

  const migrated = migrate(state)
  const repaired = migrated.approvals[0]

  assert.deepEqual(repaired.approvalSnapshot, proposalApprovalSnapshot(proposal, opportunity))
  assert.equal(repaired.snapshotRepair.reason, 'Approval was requested before the proposal was persisted')
})

test('migrate backfills Admin configuration added after a saved state', () => {
  const state = seedState()
  const config = { ...state.config }
  delete config.ownershipRules
  delete config.ownerRules
  delete config.stateRegions
  delete config.kycItems
  delete config.aiThresholds

  const migrated = migrate({ ...state, config })

  assert.ok(migrated.config.ownershipRules.length > 0)
  assert.ok(migrated.config.ownerRules.length > 0)
  assert.ok(migrated.config.stateRegions.length > 0)
  assert.ok(migrated.config.kycItems.length > 0)
  assert.deepEqual(migrated.config.aiThresholds, { high: 90, med: 75 })
})

test('migrate preserves configured Admin values and intentional empty lists', () => {
  const state = seedState()
  const customOwnership = [{ region: 'Custom region', owner: 'RS' }]
  const customOwners = [{ oppType: 'Project', owner: 'AN' }]
  const customStates = [{ code: 'XX', name: 'Custom state', region: 'Unclassified leads' }]
  const config = {
    ...state.config,
    ownershipRules: customOwnership,
    ownerRules: customOwners,
    stateRegions: customStates,
    kycItems: [],
    aiThresholds: { high: 88 },
  }

  const migrated = migrate({ ...state, config })

  assert.deepEqual(migrated.config.ownershipRules, customOwnership)
  assert.deepEqual(migrated.config.ownerRules, customOwners)
  assert.deepEqual(migrated.config.stateRegions, customStates)
  assert.deepEqual(migrated.config.kycItems, [])
  assert.deepEqual(migrated.config.aiThresholds, { high: 88, med: 75 })
})

test('migrate upgrades legacy identity defaults without overwriting custom patterns', () => {
  const state = seedState()
  const legacy = migrate({
    ...state,
    config: {
      ...state.config,
      kycValidation: {
        ...state.config.kycValidation,
        GST: { ...state.config.kycValidation.GST, pattern: LEGACY_GSTIN_PATTERN },
        PAN: { ...state.config.kycValidation.PAN, pattern: LEGACY_PAN_PATTERN },
        CIN: { ...state.config.kycValidation.CIN, pattern: LEGACY_CIN_PATTERN },
      },
    },
  })
  assert.equal(legacy.config.kycValidation.GST.pattern, GSTIN_PATTERN)
  assert.equal(legacy.config.kycValidation.PAN.pattern, PAN_PATTERN)
  assert.equal(legacy.config.kycValidation.CIN.pattern, CIN_PATTERN)

  const customPattern = '^GST-[0-9]+$'
  const customPanPattern = '^PAN-[0-9]+$'
  const customCinPattern = '^CIN-[0-9]+$'
  const custom = migrate({
    ...state,
    config: {
      ...state.config,
      kycValidation: {
        ...state.config.kycValidation,
        GST: { ...state.config.kycValidation.GST, pattern: customPattern },
        PAN: { ...state.config.kycValidation.PAN, pattern: customPanPattern },
        CIN: { ...state.config.kycValidation.CIN, pattern: customCinPattern },
      },
    },
  })
  assert.equal(custom.config.kycValidation.GST.pattern, customPattern)
  assert.equal(custom.config.kycValidation.PAN.pattern, customPanPattern)
  assert.equal(custom.config.kycValidation.CIN.pattern, customCinPattern)
})
