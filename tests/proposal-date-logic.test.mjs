import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ddMMyyyy } from '../src/utils.js'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

test('proposal and forecast dates display as DD/MM/YYYY while ISO remains the input shape', () => {
  assert.equal(ddMMyyyy('2026-10-03'), '03/10/2026')
  assert.equal(ddMMyyyy('2026-10-03T12:30:00+05:30'), '03/10/2026')
  assert.equal(ddMMyyyy(''), '')
  assert.equal(ddMMyyyy('03/10/2026'), '')
})

test('proposal send date is stamped only by the sent confirmation action', () => {
  const submission = read('src/workbench/SubmissionPanel.jsx')
  const proposal = read('src/pages/Proposal.jsx')
  const store = read('src/store.jsx')
  assert.match(submission, /store\.markProposalSent\(opp\.id, id\)/)
  assert.match(store, /status: 'sent', sentAt/)
  assert.match(store, /proposalDate: sentDate/)
  assert.doesNotMatch(proposal, /proposalDate: new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/)
})

test('proposal sent history prefers the exact successful-send timestamp', () => {
  const proposalSent = read('src/pages/ProposalSent.jsx')
  assert.match(proposalSent, /submission\?\.sentAt \|\| opp\.proposalDate/)
  assert.match(proposalSent, /return ddMMyyyy\(/)
})
