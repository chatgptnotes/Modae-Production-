import test from 'node:test'
import assert from 'node:assert/strict'
import { canEditOpportunityDetails } from '../src/opportunityEditAccess.js'

test('open opportunity owner with edit access can correct details', () => {
  const opp = { owner: 'LJS', status: 'Open' }
  assert.equal(canEditOpportunityDetails(opp, 'LJS', () => true), true)
})

test('closed records and users without opportunity edit access stay read only', () => {
  const opp = { owner: 'LJS', status: 'Open' }
  assert.equal(canEditOpportunityDetails({ ...opp, status: 'Closed' }, 'LJS', () => true), false)
  assert.equal(canEditOpportunityDetails(opp, 'LJS', () => false), false)
  assert.equal(canEditOpportunityDetails(opp, 'AH', () => true), false)
})
