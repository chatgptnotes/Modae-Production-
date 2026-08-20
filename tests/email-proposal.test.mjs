import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { seedCustomers } from '../src/seed.js'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

const proposal = read('src/pages/Proposal.jsx')

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
  // Sending opens a compose window and only needs a recipient; the inline
  // preview remains optional. The URL builder moved to utils.js so the lead
  // clarification draft and this dialog share one implementation.
  assert.match(proposal, /const composeHref = gmailComposeHref\(\{ to: emailTo, cc: emailCc, subject: emailSubject, body: emailBody \}\)/)
  assert.match(proposal, /href=\{composeHref \|\| undefined\}/)
  assert.doesNotMatch(proposal, /const gmailComposeHref = \(\(\) => \{/,
    'the inline copy must be gone, not duplicated')
  assert.match(read('src/utils.js'), /https:\/\/mail\.google\.com\/mail\/\?view=cm/)
})

// A mailto: link cannot carry a file. The UI used to say "Attachment ready…
// the mail app may require final attachment confirmation", which read as though
// the PDF was attached. It never was.
test('the attachment claim matches what actually happens', () => {
  assert.doesNotMatch(proposal, /Attachment ready:/)
  assert.match(proposal, /cannot send or carry the generated PDF/)
  assert.match(proposal, /Save proposal PDF/, 'the user must be able to produce the PDF here')
  assert.match(proposal, /const attachmentName = /, 'one attachment name, used everywhere')
  assert.doesNotMatch(proposal, /The detailed proposal is attached as/)
})

test('the sent email is logged against the opportunity', () => {
  assert.match(proposal, /kind: 'proposal-email-compose', pdfName: attachmentName,/)
})
