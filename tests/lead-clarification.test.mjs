import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  DEFAULT_COMMON_MAILBOX,
  QUOTE_FEE_DOCUMENTS,
  STANDARD_CLARIFICATIONS,
  answeredPatch,
  clarificationItems,
  clarificationKindFor,
  clarificationSender,
  clarificationTopic,
  draftClarification,
  draftPatch,
  senderLabel,
  sentPatch,
} from '../src/leadClarification.js'
import { gmailComposeHref } from '../src/utils.js'
import { seedUsers, seedConfig } from '../src/seed.js'
import { deadlineForLead } from '../src/leadRules.js'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

// 20 Aug review: "AI will draft clarification emails for incomplete leads, but
// a human must review and manually click Send to prevent errors." And on the
// sender: "pre-assign common email, post-assign RS."

const lead = {
  id: 'LD-205',
  subject: 'Inquiry for Vibration Sensor Specifications & Pricing',
  from: 'buyer@ntpc-demo.example.in',
  body: 'Please quote loop powered vibration sensors.',
  ai: { missing: ['End user name', 'Operating speed (RPM)'], fields: [] },
}

// ------------------------------------------------------------- the send rule
test('an unassigned lead sends from the common mailbox', () => {
  const sender = clarificationSender(lead, seedUsers, seedConfig)
  assert.equal(sender.rule, 'common-mailbox')
  assert.equal(sender.address, seedConfig.commonMailbox)
  assert.equal(sender.cc, '', 'nothing to copy — it is already the mailbox')
  assert.match(senderLabel(sender), /not assigned yet/)
})

test('an assigned lead sends from the salesperson, copying the mailbox', () => {
  const sender = clarificationSender({ ...lead, assignedOwner: 'RS' }, seedUsers, seedConfig)
  assert.equal(sender.rule, 'assigned-owner')
  assert.equal(sender.role, 'RS')
  assert.equal(sender.address, seedUsers.find(u => u.role === 'RS').email)
  assert.equal(sender.cc, seedConfig.commonMailbox, 'the team must keep sight of the thread')
  assert.match(senderLabel(sender), /RS/)
})

test('the sender rule degrades rather than drafting a blank From', () => {
  // Assigned to a role with no address on file.
  const sender = clarificationSender({ ...lead, assignedOwner: 'ZZZ' }, seedUsers, seedConfig)
  assert.equal(sender.address, seedConfig.commonMailbox)
  assert.equal(sender.rule, 'common-mailbox')

  // No config at all still yields a usable address.
  assert.equal(clarificationSender(lead, [], {}).address, DEFAULT_COMMON_MAILBOX)
})

// -------------------------------------------------------------- what we ask
test('the draft asks for every missing item', () => {
  const draft = draftClarification(lead, { users: seedUsers, config: seedConfig })
  for (const item of lead.ai.missing) {
    assert.ok(draft.body.includes(item), `the body must ask for "${item}"`)
    assert.ok(draft.items.includes(item))
  }
})

test('the standard questions top up a thin extraction without duplicating it', () => {
  // "Operating speed (RPM)" already covers the standard RPM question.
  const items = clarificationItems(lead)
  assert.equal(items.filter(i => /rpm/i.test(i)).length, 1, 'do not ask for the speed twice')
  assert.ok(items.includes('End user name'))
  assert.equal(items.filter(i => /end[\s-]?user/i.test(i)).length, 1)

  // A lead missing something unrelated still gets all five standard questions.
  const sparse = clarificationItems({ ai: { missing: ['Delivery schedule'] } })
  assert.equal(sparse[0], 'Delivery schedule')
  for (const q of STANDARD_CLARIFICATIONS) assert.ok(sparse.includes(q), `must still ask: ${q}`)
})

test('a VM600 RFQ receives the complete technical and commercial clarification set', () => {
  const items = clarificationItems({ ai: { missing: [
    'Detailed BOQ with exact part numbers and rack configuration',
    'Machine tag details and existing sensor configuration',
  ] } })
  for (const topic of [
    /part numbers/i, /IOC4T/, /ABE042/, /probe specifications/i,
    /extension-cable/i, /signal-conditioner/i, /power-supply/i,
    /end-user/i, /delivery\/site address/i, /machine operating speed/i,
    /delivery date/i, /RFQ, datasheets/i,
  ]) assert.ok(items.some(item => topic.test(item)), `missing clarification topic: ${topic}`)
  assert.equal(items.filter(item => /sensor configuration/i.test(item)).length, 1)
})

test('clarification topics remain stable when AI rephrases the question', () => {
  assert.equal(clarificationTopic('Please provide the exact part numbers and quantities in the BOM'), clarificationTopic('Which manufacturer part numbers and quantities are required?'))
  assert.equal(clarificationTopic('What voltage should the rack power supply use?'), clarificationTopic('Please confirm whether the power supply is 24 VDC or 85–264 VAC'))
  assert.notEqual(clarificationTopic('What is the machine operating speed?'), clarificationTopic('Please share the complete delivery address'))
})

test('an Amber lead gets the pre-quote fee mail instead', () => {
  assert.equal(clarificationKindFor(lead, 'Green'), 'clarification')
  assert.equal(clarificationKindFor({ ...lead, customerStatus: 'Amber' }), 'quote-fee')
  assert.equal(clarificationKindFor({ ...lead, customerStatus: 'Amber', amberFeePaid: true }), 'clarification')
  assert.equal(clarificationKindFor({ ai: { missing: [] } }, 'Green'), '', 'nothing to ask, nothing to draft')

  const draft = draftClarification({ ...lead, customerStatus: 'Amber' }, { users: seedUsers, config: seedConfig })
  assert.equal(draft.kind, 'quote-fee')
  // The fee, and the promise that it comes back off the order, are the two
  // things the client's own template leads with.
  assert.match(draft.body, /25,000/)
  assert.match(draft.body, /fully adjustable against the final order value/)
  for (const doc of QUOTE_FEE_DOCUMENTS) assert.ok(draft.body.includes(doc), `must ask for: ${doc}`)
})

test('the model writes the prose when it can, the template when it cannot', () => {
  const template = draftClarification(lead, { users: seedUsers, config: seedConfig })
  assert.equal(template.draftedBy, 'Template')
  assert.match(template.body, /technical compliance sheet/, 'the ModAE template wording')

  const fromAi = draftClarification(lead, { users: seedUsers, config: seedConfig, aiBody: 'Dear Sir,\n\nModel wrote this.' })
  assert.equal(fromAi.draftedBy, 'AI')
  assert.equal(fromAi.body, 'Dear Sir,\n\nModel wrote this.')

  // An empty / null AI response is the fallback case, not an error case.
  assert.equal(draftClarification(lead, { users: seedUsers, config: seedConfig, aiBody: '' }).draftedBy, 'Template')
})

test('the draft is addressed and titled without anyone typing', () => {
  const draft = draftClarification(lead, { users: seedUsers, config: seedConfig })
  assert.equal(draft.to, lead.from, 'reply to whoever sent the enquiry')
  assert.match(draft.subject, /^Re: Inquiry for Vibration Sensor/)
  assert.match(draft.subject, /clarifications required$/)
  // A reply to a reply must not stack prefixes.
  assert.match(draftClarification({ ...lead, subject: 'Re: Already a reply' }, {}).subject, /^Re: Already a reply/)
  assert.equal(/^Re: Re:/.test(draftClarification({ ...lead, subject: 'Re: Already a reply' }, {}).subject), false)
})

// ------------------------------------------------------- draft is not "sent"
test('a draft is never a sent mail', () => {
  const draft = draftClarification(lead, { users: seedUsers, config: seedConfig })
  const drafted = draftPatch(draft, { now: new Date('2026-08-20T09:00:00Z') })
  assert.equal(drafted.clarification.status, 'Draft')
  assert.equal(drafted.clarification.sentAt, '')
  assert.equal(drafted.clarification.sentBy, '')
  assert.equal(drafted.clarification.draftedAt, '2026-08-20T09:00:00.000Z')

  const sent = sentPatch(drafted.clarification, { sentBy: 'RS', now: new Date('2026-08-20T10:00:00Z') })
  assert.equal(sent.clarification.status, 'Sent')
  assert.equal(sent.clarification.sentBy, 'RS')
  assert.equal(sent.clarification.sentAt, '2026-08-20T10:00:00.000Z')
  // Everything the human reviewed survives the transition unchanged.
  assert.equal(sent.clarification.body, drafted.clarification.body)
  assert.equal(sent.clarification.to, drafted.clarification.to)
})

test('an answered clarification stops the auto-drop timer', () => {
  // processLeadDeadlines drops a lead whose clarification deadline expires, so
  // the answer has to close the deadline as well as the record.
  const open = { ...lead, ts: '2026-08-01T00:00:00Z' }
  assert.ok(deadlineForLead(open, seedConfig, new Date('2026-08-20T00:00:00Z'))
    .some(r => r.type === 'clarification'))

  const answered = { ...open, ...answeredPatch({ status: 'Sent' }, { now: new Date('2026-08-20T00:00:00Z') }) }
  assert.equal(answered.clarification.status, 'Answered')
  assert.ok(answered.clarificationCompletedAt)
  assert.equal(deadlineForLead(answered, seedConfig, new Date('2026-08-20T00:00:00Z'))
    .some(r => r.type === 'clarification'), false)
})

test('the compose link carries the reviewed draft, and refuses an empty To', () => {
  const draft = draftClarification({ ...lead, assignedOwner: 'RS' }, { users: seedUsers, config: seedConfig })
  const href = gmailComposeHref(draft)
  assert.match(href, /^https:\/\/mail\.google\.com\/mail\/\?view=cm/)
  assert.ok(href.includes(`to=${encodeURIComponent(draft.to)}`))
  assert.ok(href.includes(`cc=${encodeURIComponent(draft.cc)}`))
  assert.equal(gmailComposeHref({ ...draft, to: '   ' }), '', 'no recipient, no link')
  // Trimming a long body must not leave a half-written %XX escape behind.
  const long = gmailComposeHref({ to: 'a@b.co', body: 'é'.repeat(2000) })
  assert.equal(/%[0-9A-F]?$/i.test(long), false)
})

// --------------------------------------------------------- nothing auto-sends
test('the inbox drafts and sends in two separate, human-triggered steps', () => {
  const source = read('src/pages/Inbox.jsx')

  // Drafting writes a Draft and nothing else.
  assert.match(source, /const draftClarificationMail = async \(\) => \{/)
  assert.match(source, /store\.updateLead\(lead\.id, draftPatch\(draft\)/)

  // Sending is its own handler, reached only from a button.
  assert.match(source, /const sendClarification = \(\) => \{/)
  assert.match(source, /onClick=\{sendClarification\}/)
  assert.match(source, /sentPatch\(/)

  // The draft handler must not mark anything sent.
  const draftFn = source.slice(source.indexOf('const draftClarificationMail'), source.indexOf('const sendClarification'))
  assert.equal(/sentPatch|window\.open/.test(draftFn), false,
    'drafting must never dispatch or stamp a send')

  // And there must be no auto-send on a timer or an effect anywhere.
  assert.equal(/setTimeout\([^)]*sendClarification/.test(source), false)
  assert.equal(/useEffect\([^)]*sendClarification/.test(source), false)
})

test('the AI task drafts a body and has no dispatch capability', () => {
  const fn = read('supabase/functions/ai/index.ts')
  assert.match(fn, /'lead\.clarify': \{/)
  // It returns prose only — no schema, so no structured "send" instruction can
  // come back from it, and the client only ever reads `.text`.
  assert.match(read('src/pages/Inbox.jsx'), /runText\('lead\.clarify'/)
  assert.match(fn, /Drafting only\. The model never sends/)
})

test('the AI map no longer claims the mail goes out by itself', () => {
  const map = read('src/aimapData.js')
  assert.equal(/drafts the clarification request automatically/.test(map), false)
  assert.match(map, /never sent automatically/)
})

test('proposal email uses the attachment-capable send path', () => {
  const proposal = read('src/pages/Proposal.jsx')
  assert.match(proposal, /fetch\('\/api\/send-proposal-email'/)
  assert.match(proposal, /attachments: \[/)
  assert.equal(/Open Gmail compose/.test(proposal), false)
  assert.match(read('src/utils.js'), /export function gmailComposeHref/)
})
