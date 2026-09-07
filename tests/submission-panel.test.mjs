import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

const submission = read('src/workbench/SubmissionPanel.jsx')
const api = read('api/send-proposal-email.js')

// The To field used to be read-only and silently empty whenever the
// opportunity carried no contact address — the quote could then never be
// sent. Every mail field is now prefilled but editable.
test('the customer submission panel exposes editable To, CC, Subject and message', () => {
  assert.match(submission, /const \[emailTo, setEmailTo\]/)
  assert.match(submission, /const \[emailCc, setEmailCc\]/)
  assert.match(submission, /const \[emailSubject, setEmailSubject\]/)
  assert.match(submission, /const \[emailBody, setEmailBody\]/)
  assert.match(submission, /onChange=\{e => setEmailTo\(e\.target\.value\)\}/)
  assert.match(submission, /onChange=\{e => setEmailCc\(e\.target\.value\)\}/)
  assert.match(submission, /onChange=\{e => setEmailSubject\(e\.target\.value\)\}/)
  assert.match(submission, /<textarea value=\{emailBody\}/)
  // Defaults still prefill from the opportunity so typing is usually unnecessary.
  assert.match(submission, /opp\.contactEmail \|\| customer\?\.email \|\| ''/)
  assert.match(submission, /Proposal — \$\{opp\.oppName\} \(\$\{opp\.id\} Rev \$\{p\.revision\}\)/)
})

// To and CC take lists — a buyer plus their purchase department — and every
// address is validated before Send unlocks.
test('recipients may be a comma-separated list and are validated', () => {
  assert.match(submission, /splitRecipients/)
  assert.match(submission, /recipientsValid\(emailTo\)/)
  assert.match(api, /recipientList/)
  assert.match(api, /toList\.join\(', '\)/)
})

test('extra files can be attached, listed and removed before sending', () => {
  assert.match(submission, /type="file" multiple/)
  assert.match(submission, /blobAttachment\(/)
  assert.match(submission, /\.\.\.extraFiles/)
  assert.match(submission, /removeExtraFile/)
  assert.match(submission, /Attach files/)
})

// The governed documents still ride along automatically — the picker only
// adds to the workbook and enclosures, it never replaces them.
test('sending still carries the proposal workbook and the governed enclosures', () => {
  assert.match(submission, /enclosureAttachments\(route\)/)
  assert.match(submission, /\.\.\.enclosures/)
  assert.match(submission, /proposalWorkbookAttachment/)
  assert.match(submission, /cc: emailCc/)
  assert.match(submission, /fetch\('\/api\/send-proposal-email'/)
})

test('proposal message can be created by AI and remains editable', () => {
  assert.match(submission, /runText\('email\.proposal'/)
  assert.match(submission, /AI: create message/)
  assert.match(submission, /setEmailBody\(text\.trim\(\)\)/)
  assert.match(submission, /<textarea value=\{emailBody\}/)
})

test('proposal attachment is opt-in and requires validated review', () => {
  assert.match(submission, /const \[attachProposal, setAttachProposal\]/)
  assert.match(submission, /p\.reviewStatus === 'Validated'/)
  assert.match(submission, /Attach validated proposal/)
  assert.match(submission, /attachProposal && !proposalValidated/)
  assert.match(submission, /\.\.\.\(attachProposal \? \[/)
})

test('submission panel provides a direct proposal view', () => {
  assert.match(submission, /openProposalPreview/)
  assert.match(submission, /<WorkbookPreview workbook=\{previewWorkbook\}/)
  assert.match(submission, /proposal-preview-modal/)
  assert.match(submission, /proposalWorkbookPreview/)
  assert.match(read('src/proposal/emailAttachments.js'), /parseProposalWorkbook/)
  assert.match(submission, /proposal-preview-modal/)
  assert.match(submission, /View proposal/)
})

test('Excel workbook preview carries the approved document branding', () => {
  const preview = read('src/proposal/WorkbookPreview.jsx')
  const css = read('src/styles.css')
  assert.match(preview, /ModaeImageLogo/)
  assert.match(preview, /MODAE_DOCUMENT_STANDARDS/)
  assert.match(css, /\.template-workbook-brandbar/)
  assert.match(css, /font-family: var\(--font-document\)/)
})

test('server-side mail failures surface their real message, not a generic one', () => {
  assert.match(submission, /result\?\.error/)
  assert.match(submission, /The email service is unreachable/)
})

test('the mail API accepts business documents and rejects executables', () => {
  assert.match(api, /application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/)
  assert.match(api, /image\/png/)
  assert.match(api, /application\/x-msdownload/)
  assert.match(api, /executables are rejected/)
  assert.match(api, /One to eight attachments/)
})

test('the vite dev server serves the mail API locally', () => {
  const viteConfig = read('vite.config.js')
  assert.match(viteConfig, /vercelApiDevServer/)
  assert.match(viteConfig, /routes\.get\(url\)/)
  assert.match(viteConfig, /loadEnv/)
})
