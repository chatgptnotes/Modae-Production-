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
  assert.match(submission, /useState\(opp\.contactEmail \|\| customer\?\.email \|\| ''\)/)
  // Subject is auto-built, and CC exists.
  assert.match(submission, /Please find attached our approved Techno-Commercial Proposal \$\{opp\.id\}, revision \$\{p\.revision\}/)
  assert.match(submission, /value=\{emailCc\}/)
})

// The preview was four lines of text claiming to be the proposal. The
// salesperson has to see the actual document before it goes out.
test('preview renders the real document, not a text stub', () => {
  assert.doesNotMatch(submission, /proposalWorkbookPreview/)
  assert.match(submission, /<PrintDoc p=\{p\} opp=\{opp\}/,
    'the email flow must preview the current ModAE document')
  assert.match(submission, /proposalWorkbookAttachment/)
  assert.doesNotMatch(submission, /Attached: \{opp\.id\}_Proposal_Rev_/)
})

test('the email sends the BoQ by default and permits selected extra files', () => {
  assert.match(submission, /const \[attachProposal, setAttachProposal\] = useState\(true\)/)
  assert.match(submission, /proposalWorkbookAttachment\(/)
  assert.match(submission, /const \[extraFiles, setExtraFiles\] = useState\(\[\]\)/)
  assert.match(submission, /Attach files/)
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
  // The submission path sends the governed supporting documents. The proposal
  // email starts with the BoQ alone and lets the salesperson select extras.
  for (const file of [submission]) {
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
  assert.match(submission, /kind: 'submission'/)
  assert.match(submission, /attachmentNames:/)
})

test('the compact submission panel keeps one primary email action', () => {
  assert.doesNotMatch(proposal, /Email proposal/)
  assert.match(submission, /<div className="section-title">Customer email submission<\/div>/)
  assert.match(submission, /className="submission-actions"/)
  assert.match(submission, /className="primary submission-draft-action"/)
  assert.doesNotMatch(submission, /emailToRef/)
})

test('proposal workspace labels distinct navigation and preview controls', () => {
  assert.match(workbench, /\['edit-sheet', 'Edit proposal'\]/)
  assert.doesNotMatch(workbench, /\['preview', 'Document preview'\]/)
  assert.doesNotMatch(workbench, /B-05 Proposal sign-off/)
  assert.match(proposal, /className="toolbar proposal-action-toolbar"/)
  assert.match(workbench, /className="proposal-tab-shell"/)
})

test('communications combines the inbound enquiry with all logged messages', () => {
  assert.match(workbench, /store\.communications\?\.\[lead\?\.id\]/)
  assert.match(workbench, /store\.communications\?\.\[opp\.id\]/)
  assert.match(workbench, /id: `lead-\$\{lead\.id\}`.*kind: 'enquiry'/s)
  assert.match(workbench, /\.sort\(\(a, b\) => new Date\(b\.ts \|\| 0\) - new Date\(a\.ts \|\| 0\)\)/)
  assert.match(workbench, /ModAE Sales Desk/)
  assert.match(workbench, /ROLES\[opp\.owner\]\?\.name/)
  assert.match(workbench, /formatKind = kind =>/)
})

test('communication log entries open a message detail view', () => {
  assert.match(workbench, /className="check-row communication-row"/)
  assert.match(workbench, /setSelectedCommunication\(c\)/)
  assert.match(workbench, /role="button" tabIndex=\{0\}/)
  assert.match(workbench, /<Modal title=\{c\.subject \|\| 'Communication'\}/)
  assert.match(workbench, /communication-detail-body/)
  assert.match(workbench, /communication-detail-attachments/)
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
