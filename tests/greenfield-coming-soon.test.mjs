import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const workbench = fs.readFileSync('src/pages/Workbench.jsx', 'utf8')
const proposal = fs.readFileSync('src/pages/Proposal.jsx', 'utf8')
const seed = fs.readFileSync('src/seed.js', 'utf8')
const comingSoon = fs.readFileSync('src/workbench/OpportunityComingSoon.jsx', 'utf8')

test('future opportunity types use the read-only Coming Soon view', () => {
  assert.match(seed, /ACTIVE_WORKFLOW_TYPES = \['Spares', 'Service'\]/)
  assert.match(seed, /isWorkflowAvailable = oppType => ACTIVE_WORKFLOW_TYPES\.includes\(oppType\)/)
  assert.match(workbench, /!isWorkflowAvailable\(opp\.oppType\)/)
  assert.match(workbench, /<OpportunityComingSoon opp=\{opp\} created=\{createdNotice\}/)
  assert.match(proposal, /if \(opp && !isWorkflowAvailable\(opp\.oppType\)\) return <OpportunityComingSoon opp=\{opp\} \/>/)
  assert.match(comingSoon, /created \? 'Opportunity created' : 'Coming soon'/)
  assert.match(comingSoon, /The workflow for this opportunity type is not available yet/)
  assert.match(comingSoon, /to="\/opportunities"/)
})

test('Retrofit keeps its type identity without inheriting the active Spares screen', () => {
  assert.match(seed, /if \(oppType === 'Spares' \|\| oppType === 'Retrofit'\) return 'Spares'/)
  assert.match(workbench, /if \(!isWorkflowAvailable\(opp\.oppType\)\) return <OpportunityComingSoon opp=\{opp\} created=\{createdNotice\}/)
})

test('Greenfield proposal editor is not mounted before the guard', () => {
  const guard = proposal.indexOf("if (opp && !isWorkflowAvailable(opp.oppType))")
  const editor = proposal.indexOf('return <ProposalEditor {...props} />')
  assert.ok(guard >= 0 && editor > guard)
})
