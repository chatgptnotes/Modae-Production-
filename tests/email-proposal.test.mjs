import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { seedCustomers } from '../src/seed.js'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

const proposal = read('src/pages/Proposal.jsx')
const workbench = read('src/pages/Workbench.jsx')
const submission = read('src/workbench/SubmissionPanel.jsx')

// Biji, 13 Aug: "this has to automatically come, I should not be selecting…
// that is from the RFQ, either that has to keep the sender address." The To
// field resolved to '' on every opportunity because neither opp.contactEmail
// nor customer.email existed anywhere in the app.
test('every customer carries an address the proposal can be sent to', () => {
  assert.ok(seedCustomers.length > 0)
  for (const c of seedCustomers) {
    assert.ok(c.email, `${c.name} must have a contact address`)
    assert.match(c.email, /^[^@\s]+@[^@\s]+\.[^@\s]+$/, `${c.name} address must be well formed`)
  }
})

test('the enquiry sender is carried onto the opportunity', () => {
  // Registering a lead, and qualifying one through the intake form, must both
  // put the original sender on the opportunity as contactEmail.
  assert.match(read('src/pages/Register.jsx'), /contactEmail: lead\.from \|\| ''/)
  assert.match(read('src/pages/Inbox.jsx'), /contactEmail: lead\.from \|\| ''/)
  assert.match(read('src/pages/IntakeForm.jsx'), /contactEmail: f\.contactEmail \|\| ''/)
})

test('the email dialog resolves a recipient without typing', () => {
  assert.match(proposal, /setEmailTo\(opp\.contactEmail \|\| customer\?\.email \|\| ''\)/)
  // Subject is auto-built, and CC exists.
  assert.match(proposal, /setEmailSubject\(`\$\{oppId\} — Techno-Commercial Proposal/)
  assert.match(proposal, /value=\{emailCc\}/)
})

// The preview was four lines of text claiming to be the proposal. The
// salesperson has to see the actual document before it goes out.
test('preview renders the real document, not a text stub', () => {
  assert.match(proposal, /\{emailPreview && \(/)
  assert.match(proposal, /<div className="email-preview-doc">\s*<PrintDoc/,
    'the preview must render PrintDoc')
  assert.doesNotMatch(proposal, /<p>Attached: \{oppId\}_Proposal_Rev_/,
    'the old text stub must be gone')
  assert.match(proposal, /fetch\('\/api\/send-proposal-email'/)
  assert.match(proposal, /attachments: \[/)
  assert.match(proposal, /proposalWorkbookAttachment/)
  assert.match(proposal, /enclosureAttachments/)
})

test('the attachment claim matches what actually happens', () => {
  // The count derives from the enclosure rule, never from a hand-kept number.
  assert.match(proposal, /Send with \$\{1 \+ enclosuresFor\(route\)\.length\} attachments/)
  assert.doesNotMatch(proposal, /Proposal PDF attachment \*/)
  assert.match(proposal, /Save proposal PDF/, 'the user must be able to produce the PDF here')
  assert.doesNotMatch(proposal, /!proposalPdf/, 'sending must not depend on a manually selected PDF')
})

// Biji, 20 Aug review: the Services Rate Schedule goes with every services
// proposal — domestic or international — and never with spares or projects.
// The Standard Terms go with everything. One rule, one place.
test('service proposals carry the rate schedule, others do not', async () => {
  const { ENCLOSURES, enclosuresFor } = await import('../src/proposalDoc.js')
  assert.deepEqual(enclosuresFor('Services').map(e => e.filename),
    ['ModAE Standard Terms-Sales.pdf', 'ModAE Services Rate Schedule FY2025-26.pdf'])
  assert.deepEqual(enclosuresFor('Spares').map(e => e.filename), ['ModAE Standard Terms-Sales.pdf'])
  assert.deepEqual(enclosuresFor('Project').map(e => e.filename), ['ModAE Standard Terms-Sales.pdf'])
  assert.ok(ENCLOSURES.gtc.label.includes('General Terms'))
  // Both send paths draw from the rule rather than keeping their own ternary.
  for (const file of [proposal, submission]) {
    assert.match(file, /enclosureAttachments\(route\)/)
    assert.match(file, /\.\.\.enclosures/)
    assert.doesNotMatch(file, /serviceRateScheduleAttachment/)
  }
  const attachments = read('src/proposal/emailAttachments.js')
  assert.match(attachments, /enclosuresFor\(route\)/)
  for (const enclosure of enclosuresFor('Services')) {
    assert.ok(fs.existsSync(new URL(`../branding/Further Inputs/Further Inputs/Proposals and T&Cs/${enclosure.filename}`, import.meta.url)),
      `${enclosure.filename} must ship with the app`)
  }
})

test('the sent email is logged against the opportunity', () => {
  assert.match(proposal, /kind: 'proposal-email'/)
  assert.match(proposal, /attachmentNames:/)
})

test('every outbound email surface exposes sender and copy recipients', () => {
  assert.match(proposal, /q-label">From<\/div>/)
  assert.match(workbench, /clarificationSender\(/)
  assert.match(workbench, /<label className="afield">From/)
  assert.match(workbench, /<label className="afield">To/)
  assert.match(workbench, /<label className="afield">CC/)
  assert.match(workbench, /gmailComposeHref\(draft\)/)
  assert.match(workbench, /className="clarification-compose-modal"/)
  assert.match(workbench, /<div className="clar-mail-form">/)
  assert.match(submission, /const \[emailCc, setEmailCc\]/)
  assert.match(submission, /cc: emailCc/)
  assert.match(read('api/send-proposal-email.js'), /mimeMessage\(\{ from: account, to, cc, subject, body, attachments \}\)/)
  assert.match(submission, /proposalWorkbookAttachment/)
  assert.match(submission, /enclosureAttachments/)
})
