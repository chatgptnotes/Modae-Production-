import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { AI_MAP } from '../src/aimapData.js'
import { customerHealth, findDuplicates, suggestProbability, suggestEscalation } from '../src/insights.js'
import { seedCustomers, seedOpportunities, seedAiLeads, seedLeads, STAGES } from '../src/seed.js'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

const items = AI_MAP.flatMap(g => g.items)

// Biji asked to click through all 23 + 5. Every row must say honestly what is
// behind it — the old map had nine entries that were catalogue text only, and
// one flagged live:true that never called a model.
test('every automation declares what is actually behind it', () => {
  for (const i of items) {
    assert.ok(['ai', 'rule', 'preview'].includes(i.kind), `${i.t} has kind ${i.kind}`)
  }
  assert.doesNotMatch(read('src/aimapData.js'), /live: true/,
    'the drifted live flag must be gone — kind is the single source of truth')
})

test('only the tasks the Vercel function implements are labelled Live AI', () => {
  const aiFn = read('api/ai.js')
  const live = items.filter(i => i.kind === 'ai')
  assert.ok(live.length >= 4, 'the map must still claim the real model calls')
  // Each live claim needs a task in the function to back it.
  const tasks = ['lead.extract', 'clarification.suggest', 'email.followup', 'tender.extract']
  for (const t of tasks) assert.ok(aiFn.includes(t), `${t} must exist in the Vercel function`)
  assert.ok(items.find(i => i.t === 'Admin routing configuration review' && i.kind === 'ai'))
  assert.ok(aiFn.includes('admin.routing-review'))
})

test('opportunity ID and owner suggestion is not sold as a model call', () => {
  const item = items.find(i => i.t.startsWith('Opportunity ID'))
  assert.equal(item.kind, 'rule')
  assert.doesNotMatch(read('src/pages/Register.jsx'), /from '\.\.\/ai\.js'/,
    'Register.jsx does not call the model, so the map must not say it does')
})

test('every demo link points at a route the app serves', () => {
  const app = read('src/App.jsx')
  const paths = [...app.matchAll(/<Route path="([^"]+)"/g)].map(m => m[1])
  for (const i of items) {
    const first = '/' + (i.to.split('/')[1] || '')
    const served = paths.some(p => p === i.to || p.split('/')[1] === first.slice(1))
    assert.ok(served, `${i.t} links to ${i.to}, which no route serves`)
  }
})

// ------------------------------------------------------- customer health score
test('customer health scores from class, KYC, payment and history', () => {
  const green = customerHealth(seedCustomers.find(c => c.name === 'Andritz Hydro'), seedOpportunities)
  const red = customerHealth(seedCustomers.find(c => c.name === 'CAPSA Dubai / Realix'), seedOpportunities)
  assert.ok(green.score > red.score, 'a paying Green account must outscore an overdue Red one')
  assert.equal(green.band, 'Healthy')
  assert.equal(red.band, 'At risk')
  // The score has to be arguable, so it carries its reasons.
  assert.ok(red.reasons.some(r => /overdue/i.test(r.why)))
  for (const c of seedCustomers) {
    const h = customerHealth(c, seedOpportunities)
    assert.ok(h.score >= 0 && h.score <= 100, `${c.name} scored ${h.score}`)
  }
})

test('the health score is shown on the customer master', () => {
  const page = read('src/pages/Customers.jsx')
  assert.match(page, /customerHealth\(c, store\.opportunities\)/)
  assert.match(page, /<th>Health<\/th>/)
})

// ------------------------------------------------------------ duplicate leads
test('duplicate detection finds the same enquiry sent twice', () => {
  const leads = [...seedAiLeads, ...seedLeads]
  const dupes = findDuplicates(leads.find(l => l.id === 'LD-207'), leads)
  assert.ok(dupes.length > 0, 'the seeded chaser must be caught')
  assert.equal(dupes[0].leadId, 'LD-201')
  assert.ok(dupes[0].confidence > 0.9)
})

test('distinct enquiries are not flagged as duplicates', () => {
  const leads = [...seedAiLeads, ...seedLeads]
  const distinct = leads.filter(l => !['LD-201', 'LD-207'].includes(l.id))
  for (const l of distinct) {
    assert.deepEqual(findDuplicates(l, distinct), [], `${l.id} must not match anything`)
  }
})

test('a dropped lead is not offered as a duplicate', () => {
  const a = { id: 'A', ref: 'X/1', from: 'a@b.c', subject: 'RFQ pumps' }
  const b = { id: 'B', ref: 'X/1', from: 'a@b.c', subject: 'RFQ pumps', status: 'Dropped' }
  assert.deepEqual(findDuplicates(a, [a, b]), [])
})

test('the inbox computes duplicates live rather than reading a seeded list', () => {
  const inbox = read('src/pages/Inbox.jsx')
  assert.match(inbox, /const dupes = findDuplicates\(lead, store\.leads\)/)
  assert.doesNotMatch(inbox, /\{ai\.duplicates\.map/, 'the seeded list must no longer drive the UI')
})

// ------------------------------------------------------- probability suggestion
test('win probability is suggested from stage, account and age', () => {
  for (const stage of STAGES) {
    const s = suggestProbability({ stage, customerStatus: 'Blue', status: 'Open' }, null)
    assert.ok(['Low', 'Medium', 'High'].includes(s.level), `${stage} suggested ${s.level}`)
    assert.ok(s.why.includes(stage))
  }
  // A Red account is never a high-probability win.
  const red = suggestProbability({ stage: 'Negotiate', customerStatus: 'Red' }, null)
  assert.equal(red.level, 'Low')
})

test('the suggestion never overwrites what the salesperson typed', () => {
  const tracker = read('src/pages/Tracker.jsx')
  assert.match(tracker, /value=\{o\.prob \|\| ''\} onChange=\{upd\(o\.id, 'prob'\)\}/,
    'the stored value still drives the control')
  assert.match(tracker, /\$\{sug\.level\} \(suggested\)/)
})

// ------------------------------------------------------- escalation suggestion
test('a stalled opportunity suggests who to escalate to', () => {
  const stale = { status: 'Open', lastUpdated: '2026-05-01', valueK: 9000 }
  const e = suggestEscalation(stale, [])
  assert.ok(e, 'a stalled opportunity must produce a suggestion')
  assert.equal(e.to, 'LJS', 'a large opportunity goes to the strategic approver')
  assert.match(e.why, /No movement/)
})

test('a fresh opportunity is not escalated', () => {
  const today = new Date().toISOString().slice(0, 10)
  assert.equal(suggestEscalation({ status: 'Open', lastUpdated: today, valueK: 100 }, []), null)
})

test('a waiting approval escalates to the approver holding it', () => {
  const e = suggestEscalation({ status: 'Open', lastUpdated: '2026-08-01' },
    [{ severity: 'wait', approver: 'AH', text: 'Red clearance awaiting AH' }])
  assert.equal(e.to, 'AH')
  assert.equal(e.urgency, 'now')
})
