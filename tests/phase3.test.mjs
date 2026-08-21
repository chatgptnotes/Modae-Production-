import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { AI_MAP } from '../src/aimapData.js'
import { parseTender } from '../src/tenderParse.js'
import { newProposal, PERMS, ROLES, OWNERS, ownerForOppType, seedAiLeads, seedOpportunities } from '../src/seed.js'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

test('AI automation map has the agreed 23 + 5 coverage', () => {
  const items = AI_MAP.flatMap(group => group.items)
  assert.equal(items.length, 28)
  assert.equal(items.filter(item => item.phase === 1).length, 23)
  assert.equal(items.filter(item => item.phase === 2).length, 5)
  // `live` was replaced by `kind` — see tests/aimap.test.mjs for the coverage.
  for (const item of items) assert.match(item.to, /^\//, `${item.t} must have a demo route`)
})

test('required demo launcher records exist', () => {
  const leadIds = new Set(seedAiLeads.map(lead => lead.id))
  const opportunityIds = new Set(seedOpportunities.map(opp => opp.id))
  for (const id of ['LD-203', 'LD-204', 'LD-205', 'LD-206']) assert.ok(leadIds.has(id), id)
  assert.ok(opportunityIds.has('2608222RS'))
  assert.ok(opportunityIds.has('2601122LJS'))
})

test('all internal roles can access My Dashboard', () => {
  for (const role of ['RS', 'PP', 'LJS', 'AH', 'SUPER', 'ADMIN', 'TECH']) {
    assert.ok(PERMS[role].includes('mydashboard'), `${role} missing My Dashboard permission`)
  }
  assert.equal(PERMS.CUST.includes('mydashboard'), false)
})

test('proposal type defaults follow the opportunity route', () => {
  assert.equal(newProposal('P', { oppType: 'Project' }).proposalType, 'Project')
  assert.equal(newProposal('S', { oppType: 'Spares' }).proposalType, 'Spares')
  assert.equal(newProposal('V', { oppType: 'Service' }).proposalType, 'Services')
})

test('client owner catalogue and type routing are complete', () => {
  assert.deepEqual(OWNERS, ['LJS', 'PP', 'RS', 'SS', 'PJS', 'RJS', 'SR'])
  assert.equal(ownerForOppType('Project'), 'LJS')
  assert.equal(ownerForOppType('Upgrade'), 'PP')
  assert.equal(ownerForOppType('Retrofit'), 'RS')
  assert.equal(ownerForOppType('Service'), 'SS')
  assert.equal(ownerForOppType('Spares'), 'PJS')
  assert.equal(ownerForOppType('Flow'), 'RJS')
  assert.equal(ownerForOppType('Unknown'), 'LJS')
  for (const owner of OWNERS) assert.ok(ROLES[owner], `${owner} must be a configured role`)
  for (const owner of OWNERS.filter(owner => owner !== 'LJS')) assert.equal(ROLES[owner].sales, true, `${owner} must be a sales role`)
})

test('proposal records the supplied route-specific artifact set', () => {
  assert.deepEqual(newProposal('P', { oppType: 'Project' }).artifactSheets, [
    'Cover Letter', 'Signal List', 'Rack Layout', 'Priced BoQ', 'Compliance Table',
  ])
  assert.deepEqual(newProposal('V', { oppType: 'Service' }).artifactSheets, [
    'Cover Letter', 'Scope of Work', 'Issues List', 'Proposal', 'Service Rate Schedule',
  ])
  assert.deepEqual(newProposal('S', { oppType: 'Spares' }).artifactSheets, [
    'Cover Letter', 'Firm Offer', 'Clarifications', 'Sensor Comparison', 'Priced BoQ',
  ])
})

test('proposal workbook exposes three distinct route templates', () => {
  const proposal = read('src/pages/Proposal.jsx')
  assert.match(proposal, /Project: \['Cover Letter', 'Edit Sheet', 'Document', 'Signal List', 'Rack Layout', 'Priced BoQ'\]/)
  assert.match(proposal, /Services: \['Cover Letter', 'Edit Sheet', 'Document', 'Scope of Work', 'Issues List', 'Proposal', 'Service Rate Schedule'\]/)
  assert.match(proposal, /Spares: \['Cover Letter', 'Edit Sheet', 'Document', 'Firm Offer', 'Clarifications', 'Sensor Comparison', 'Priced BoQ'\]/)
  assert.match(proposal, /function RouteTemplateTab/)
})

test('tender extraction reports RFQ number/date and missing fields', () => {
  const parsed = parseTender([
    'Request for Quotation',
    'RFQ No: ABC-7411347 dated 13/08/2026',
    'Bharat Heavy Electricals Limited',
    'Subject: Supply of vibration monitoring spares',
    'Works: Korba Power Plant',
    'SPECIAL TERMS & CONDITIONS',
  ].join('\n'))
  assert.equal(parsed.header.sectionRef, 'ABC-7411347')
  assert.equal(parsed.header.rfqDate, '13/08/2026')
  assert.equal(parsed.header.buyer, 'Bharat Heavy Electricals Limited')
  assert.equal(parsed.missing.includes('Contact person'), true)
  assert.equal(parsed.missing.includes('Contact phone'), true)
})

test('dashboard and Phase 1 UI wiring are present', () => {
  const app = read('src/App.jsx')
  const intake = read('src/pages/IntakeForm.jsx')
  const inbox = read('src/pages/Inbox.jsx')
  const tracker = read('src/pages/Tracker.jsx')
  assert.match(app, /path="\/my-dashboard"/)
  // Products are multi-select; see tests/intake.test.mjs for the field-level checks.
  assert.match(intake, /'checkbox' : 'radio'/)
  assert.match(inbox, /Revert to Lead/)
  assert.match(inbox, /Reassign/)
  assert.match(tracker, /Expected Order Date/)
  assert.match(tracker, /Expected Ship Date/)
  assert.match(tracker, /Next Action/)
})

test('PWA metadata and service worker registration are configured', () => {
  const manifest = JSON.parse(read('public/manifest.webmanifest'))
  assert.equal(manifest.display, 'standalone')
  assert.equal(manifest.start_url, './#/home')
  assert.ok(manifest.icons.length >= 2)
  assert.match(read('src/pwa.js'), /serviceWorker\.register/)
})

test('user-facing admin setup no longer instructs localhost redirect URLs', () => {
  assert.doesNotMatch(read('src/pages/Admin.jsx'), /http:\/\/localhost:5173/)
})
