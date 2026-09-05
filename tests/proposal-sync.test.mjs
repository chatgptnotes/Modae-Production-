import test from 'node:test'
import assert from 'node:assert/strict'
import { syncProposalFromOpportunity } from '../src/proposal/opportunitySync.js'
import { newProposal } from '../src/seed.js'

test('opportunity metadata syncs into proposal header fields', () => {
  const proposal = {
    addressee: 'M/s. Old Customer',
    attnPhone: '000',
    kindAttn: 'Old Contact',
    rfqNumber: 'OLD-RFQ',
    revisionDate: '2026-01-01',
    subject: 'Old subject',
    project: 'Old project',
    bom: [{ pn: 'KEEP-ME' }],
    terms: [{ term: 'Payment', status: 'Comply' }],
    costing: { baseRate: 112 },
  }
  const opportunity = {
    oppName: 'Updated turbine package',
    sellTo: 'Updated Customer',
    contactPerson: 'A. Buyer',
    contactPhone: '+91 90000 00000',
    rfqNumber: 'RFQ-2026-09',
    rfqDate: '2026-09-05',
  }

  const next = syncProposalFromOpportunity(proposal, opportunity)

  assert.equal(next.addressee, 'M/s. Updated Customer')
  assert.equal(next.attnPhone, '+91 90000 00000')
  assert.equal(next.kindAttn, 'A. Buyer')
  assert.equal(next.rfqNumber, 'RFQ-2026-09')
  assert.equal(next.revisionDate, '2026-09-05')
  assert.equal(next.subject, 'Proposal For Updated turbine package')
  assert.equal(next.project, 'Updated turbine package')
  assert.deepEqual(next.bom, proposal.bom)
  assert.deepEqual(next.terms, proposal.terms)
  assert.deepEqual(next.costing, proposal.costing)
})

test('empty optional opportunity fields clear canonical proposal headers', () => {
  const next = syncProposalFromOpportunity({
    addressee: 'M/s. Customer', kindAttn: 'Buyer', attnPhone: '123',
    rfqNumber: 'RFQ-1', subject: 'Proposal For Old', project: 'Old', revisionDate: '2026-01-01',
  }, {})

  assert.equal(next.addressee, '')
  assert.equal(next.kindAttn, '')
  assert.equal(next.attnPhone, '')
  assert.equal(next.rfqNumber, '')
  assert.equal(next.subject, '')
  assert.equal(next.project, '')
  assert.equal(next.revisionDate, '2026-01-01')
})

test('a proposal created after an opportunity edit inherits RFQ metadata', () => {
  const proposal = newProposal('2609001PJS', {
    oppType: 'Spares', oppName: 'Updated package', sellTo: 'Updated Customer',
    contactPerson: 'A. Buyer', contactPhone: '+91 90000 00000',
    rfqNumber: 'RFQ-2026-09', rfqDate: '2026-09-05',
  })

  assert.equal(proposal.rfqNumber, 'RFQ-2026-09')
  assert.equal(proposal.revisionDate, '2026-09-05')
  assert.equal(proposal.subject, 'Proposal For Updated package')
  assert.equal(proposal.project, 'Updated package')
})
