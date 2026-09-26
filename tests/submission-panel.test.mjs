import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

const submission = read('src/workbench/SubmissionPanel.jsx')
const api = read('api/send-proposal-email.js')
const aiApi = read('api/ai.js')

// The To field used to be read-only and silently empty whenever the
// opportunity carried no contact address — the quote could then never be
// sent. Every mail field is now prefilled but editable.
test('the customer submission panel exposes editable To, CC, Subject and message', () => {
  assert.match(submission, /const \[emailTo, setEmailTo\]/)
  assert.match(submission, /const \[emailCc, setEmailCc\]/)
  assert.match(submission, /const \[emailSubject, setEmailSubject\]/)
  assert.match(submission, /const \[emailBody, setEmailBody\]/)
  assert.match(submission, /Dear Sir\/Madam,/)
  assert.match(submission, /const emailGreeting = customer\?\.name \|\| opp\.sellTo/)
  assert.match(submission, /onChange=\{e => setEmailTo\(e\.target\.value\)\}/)
  assert.match(submission, /onChange=\{e => setEmailCc\(e\.target\.value\)\}/)
  assert.match(submission, /onChange=\{e => setEmailSubject\(e\.target\.value\)\}/)
  assert.match(submission, /<textarea className="submission-message-draft" value=\{emailBody\}/)
  // Defaults still prefill from the opportunity so typing is usually unnecessary.
  assert.match(submission, /opp\.contactEmail \|\| customer\?\.email \|\| ''/)
  assert.match(submission, /Proposal — \$\{opp\.oppName\} \(\$\{opp\.id\} Rev \$\{p\.revision\}\)/)
  assert.match(submission, /we are pleased to submit our approved Techno-Commercial Proposal/)
  assert.match(submission, /confirm whether the offer meets your technical and commercial requirements/)
  assert.match(submission, /Please find enclosed \$\{attachments\.join\(' and '\)\}/)
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

test('customer submission waits for a validated uploaded workbook to finish storage', () => {
  assert.match(submission, /isValidatedUploadStorageReady/)
  assert.match(submission, /!uploadStorageReady/)
  assert.match(submission, /validated workbook upload to finish/)
})

// The Gmail compose draft records the governed documents that the salesperson
// must attach before submitting the message.
test('sending opens Gmail with the proposal and governed enclosure list', () => {
  assert.match(submission, /gmailComposeHref/)
  assert.match(submission, /draftWindow\.location\.href = href/)
  assert.match(submission, /window\.open\(gmailDraftHref, '_blank', 'noopener'\)/)
  assert.match(submission, /attachments\.forEach\(downloadAttachment\)/)
  assert.match(submission, /customerProposalArtifact/)
  assert.match(submission, /enclosureAttachments\(route\)/)
  assert.match(submission, /enclosuresFor\(route\)\.map\(a => a\.filename\)/)
  assert.match(submission, /Draft email/)
  assert.match(submission, /cc: emailCc/)
  assert.doesNotMatch(submission, /fetch\('\/api\/send-proposal-email'/)
})

test('Gmail opens from the click before asynchronous attachment preparation', () => {
  const sendStart = submission.indexOf('const send = async () => {')
  const popup = submission.indexOf("const draftWindow = window.open('', '_blank')", sendStart)
  const artifact = submission.indexOf('await getCustomerArtifact()', sendStart)
  assert.ok(sendStart >= 0)
  assert.ok(popup > sendStart, 'send should reserve a tab')
  assert.ok(artifact > popup, 'attachment generation should happen after the tab is reserved')
  assert.match(submission, /Chrome blocked the Gmail draft tab/)
  assert.match(submission, /Open Gmail draft/)
  assert.match(submission, /draftWindow\.location\.href = href/)
})

test('proposal message can be created by AI and remains editable', () => {
  assert.match(submission, /runTaskResult\('email\.proposal'/)
  assert.match(submission, /attachments: attachmentNames/)
  assert.match(submission, /assembleProposalEmail\(sections\)/)
  assert.match(submission, /Improve with AI/)
  assert.match(submission, /runTaskResult\('email\.proofread'/)
  assert.match(submission, /Proofread with AI/)
  assert.match(submission, /body: emailBody/)
  assert.match(submission, /Optional professional review/)
  assert.match(submission, /const formatted = formatEmailBody\(assembleProposalEmail\(sections\)\)/)
  assert.match(submission, /const hasRequiredStructure = \/standard terms\/i\.test\(formatted\)/)
  assert.match(submission, /const hasMeaningfulChange = formatted\.trim\(\) !== emailBody\.trim\(\)/)
  assert.match(submission, /setEmailBody\(hasRequiredStructure && hasMeaningfulChange \? formatted : improvedEmailBody\)/)
  assert.match(submission, /timeoutMs: 12000/)
  assert.match(submission, /A professional built-in draft was applied/)
  assert.match(submission, /confirm whether the offer meets your technical and commercial requirements/)
  assert.match(submission, /className="submission-message-draft" value=\{emailBody\}.*rows=\{9\}/)
  assert.match(aiApi, /'email\.proposal'/)
  assert.match(aiApi, /proposalEmailPrompt/)
  assert.match(aiApi, /emailProposalSchema/)
  assert.match(aiApi, /validityAndNextStep/)
  assert.match(aiApi, /attachments: \{ type: 'STRING' \}/)
  assert.match(aiApi, /emailProofreadSchema/)
  assert.match(aiApi, /emailProofreadPrompt/)
  assert.match(aiApi, /Draft formal customer correspondence/)
  assert.match(aiApi, /clarification: one polite sentence offering clarification/)
})

test('the automatic message draft stays comfortably readable', () => {
  const css = read('src/styles.css')
  assert.match(css, /\.submission-message-draft \{[\s\S]*min-height: 180px;/)
})

test('the draft action keeps the primary orange appearance when disabled', () => {
  const css = read('src/styles.css')
  assert.match(css, /\.submission-actions \.submission-draft-action:disabled \{ opacity: 1; \}/)
})

test('proposal attachment is opt-in and requires validated review', () => {
  assert.match(submission, /const \[attachProposal, setAttachProposal\]/)
  assert.match(submission, /p\.reviewStatus === 'Validated' \|\| !!release/)
  assert.match(submission, /Attach validated proposal/)
  assert.match(submission, /attachProposal && !proposalValidated/)
  assert.match(submission, /\.\.\.\(attachProposal \? \[/)
})

test('approved releases replace redundant self-attestation checks before Gmail opens', () => {
  assert.match(submission, /const canSend = \(!finalQuoteApprovalRequired \|\| !!release\) && !pendingConds\.length/)
  assert.match(submission, /Current proposal revision is approved for customer submission\./)
  assert.doesNotMatch(submission, /Customer-facing prices and validity verified/)
  assert.doesNotMatch(submission, /No restricted commercial data in the document/)
  assert.doesNotMatch(submission, /Named reviewer:/)
  assert.doesNotMatch(submission, /Complete the human-review checklist/)
})

test('customer submission uses the available communications-card width', () => {
  assert.match(submission, /className=\{`submission-mailbox/)
  assert.match(read('src/styles.css'), /\.submission-mailbox \{/)
})

test('pending approval keeps the customer submission visible as a locked mailbox preview', () => {
  assert.match(submission, /const releasePending = finalQuoteApprovalRequired && !release/)
  assert.match(submission, /const mailboxLocked = readOnly \|\| releasePending/)
  assert.match(submission, /Awaiting approval/)
  assert.match(submission, /disabled=\{mailboxLocked\}/)
  assert.match(submission, /Awaiting AH \+ LJS approval before sending/)
  assert.doesNotMatch(submission, /Customer submission \(simulated\)/)
})

test('submission panel provides a direct proposal view', () => {
  assert.match(submission, /openProposalPreview/)
  assert.match(submission, /customerProposalArtifact\(\{/)
  assert.match(submission, /const getCustomerArtifact = async/)
  assert.match(submission, /\(await getCustomerArtifact\(\)\)\.attachment/)
  assert.match(submission, /<WorkbookPreview workbook=\{previewWorkbook\} loading=\{previewBusy\} error=\{previewError\}/)
  assert.match(submission, /proposal-preview-modal/)
  assert.match(read('src/proposal/emailAttachments.js'), /parseProposalWorkbook/)
  assert.match(submission, /proposal-preview-modal/)
  assert.match(submission, /View proposal/)
})

test('validated uploaded workbooks remain the active preview and attachment', () => {
  assert.match(submission, /hasValidatedUploadedWorkbook\(p\)/)
  assert.match(submission, /validatedWorkbookStorageKey\(p, opp\.id\)/)
  assert.match(submission, /getFile\(validatedWorkbookStorageKey\(p, opp\.id\), validatedWorkbookFilename\(p\)\)/)
  assert.match(submission, /The validated proposal workbook is unavailable/)
  assert.match(submission, /validatedWorkbookPreview\(p\)/)
})

test('Excel workbook preview carries the approved document branding', () => {
  const preview = read('src/proposal/WorkbookPreview.jsx')
  const css = read('src/styles.css')
  assert.match(preview, /ModaeImageLogo/)
  assert.match(preview, /MODAE_DOCUMENT_STANDARDS/)
  assert.match(css, /\.template-workbook-brandbar/)
  assert.match(css, /font-family: var\(--font-document\)/)
})

test('workbook preview resets scroll position when the worksheet changes', () => {
  const preview = read('src/proposal/WorkbookPreview.jsx')
  const css = read('src/styles.css')
  assert.match(preview, /useEffect, useRef/)
  assert.match(preview, /previewScrollRef = useRef\(null\)/)
  assert.match(preview, /preview\.scrollTop = 0/)
  assert.match(preview, /preview\.scrollLeft = 0/)
  assert.match(preview, /ref=\{previewScrollRef\}/)
  assert.match(css, /\.template-workbook-preview \{[\s\S]*align-items: center;/)
  assert.match(css, /\.template-workbook-page-scroll \{[\s\S]*overflow-x: auto;/)
})

test('Gmail compose failures surface a useful message', () => {
  assert.match(submission, /Gmail draft could not be opened/)
  assert.match(submission, /Add a recipient email address before opening the Gmail draft/)
})

test('the page distinguishes an opened Gmail draft from a confirmed sent email', () => {
  assert.match(submission, /status: 'draft'/)
  assert.match(submission, /revision: String\(p\.revision \?\? ''\)/)
  assert.match(submission, /latestSubmissionForRevision\(store\.communications\?\.\[opp\.id\], p\.revision\)/)
  assert.match(submission, /Mark as sent/)
  assert.match(submission, /status: 'sent'/)
  assert.match(submission, /Proposal email marked as sent/)
})

test('opening Gmail does not complete the opportunity workflow', () => {
  const sendStart = submission.indexOf('const send = async () => {')
  const sendEnd = submission.indexOf('  const markAsSent = () => {', sendStart)
  const sendFlow = submission.slice(sendStart, sendEnd)
  assert.doesNotMatch(sendFlow, /store\.updateOpportunity\(/)
  assert.doesNotMatch(sendFlow, /store\.updateServiceFlow\(/)
  assert.match(sendFlow, /status: 'draft'/)
})

test('manual confirmation only marks the communication as sent', () => {
  const markStart = submission.indexOf('const markAsSent = () => {')
  const markEnd = submission.indexOf('  const retryGmailDraft = () => {', markStart)
  const markFlow = submission.slice(markStart, markEnd)
  assert.match(markFlow, /store\.updateCommunication\(opp\.id, id, \{ status: 'sent' \}/)
  assert.doesNotMatch(markFlow, /store\.updateOpportunity\(/)
  assert.doesNotMatch(markFlow, /store\.updateServiceFlow\(/)
})

test('proposal surfaces expose customer-send status per revision', () => {
  const proposal = read('src/pages/Proposal.jsx')
  const workbench = read('src/pages/Workbench.jsx')
  assert.match(proposal, /Customer submission/)
  assert.match(proposal, /submissionStatusLabel\(currentSubmission\)/)
  assert.match(proposal, /latestSubmissionForRevision\(comms, p\.revision\)/)
  assert.match(workbench, /latestSubmissionForRevision\(store\.communications\?\.\[opp\.id\], historicalRevision\)/)
  assert.match(workbench, /submissionStatusLabel\(submission\)/)
})

test('the mail API accepts business documents and rejects executables', () => {
  assert.match(api, /application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/)
  assert.match(api, /image\/png/)
  assert.match(api, /application\/x-msdownload/)
  assert.match(api, /executables are rejected/)
  assert.match(api, /One to eight attachments/)
})

test('the Vite dev server proxies the mail API to local Express', () => {
  const viteConfig = read('vite.config.js')
  assert.match(viteConfig, /server: \{ proxy:/)
  assert.match(viteConfig, /'\/api': 'http:\/\/localhost:3000'/)
})
