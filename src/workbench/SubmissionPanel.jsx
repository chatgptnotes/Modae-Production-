import React, { useRef, useState } from 'react'
import { useStore } from '../store.jsx'
import { ErrBox, Modal, WarnBox } from '../ui.jsx'
import { releaseState, serviceApprovalSet, legacyServiceReview } from '../gates.js'
import { Icon } from '../icons.jsx'
import { docModel, docRoute, enclosuresFor } from '../proposalDoc.js'
import { buildPricing } from '../proposal/docProps.js'
import { blobAttachment, customerProposalArtifact, enclosureAttachments } from '../proposal/emailAttachments.js'
import { formatEmailBody, runTaskResult, textFromTaskResult } from '../ai.js'
import WorkbookPreview from '../proposal/WorkbookPreview.jsx'
import { EMAIL_RE, splitRecipients, recipientsValid } from '../emailValidation.js'
import { gmailComposeHref, displayRole } from '../utils.js'
import { isCounterAwaitingCustomer } from '../commercialTerms.js'
import { snapshotProposal } from '../store.jsx'
import { loadProposalTemplateBuffer, resolveProposalTemplate } from '../proposal/templateRegistry.js'
import { latestSubmissionForRevision } from '../submissionStatus.js'
import { getFile } from '../leadBlobs.js'
import { hasValidatedUploadedWorkbook, validatedWorkbookFilename, validatedWorkbookPreview, validatedWorkbookStorageKey } from '../proposal/validatedWorkbook.js'

const proposalEmailFallback = ({ greeting, oppName, oppId, revision, validityDays, senderName, attachments }) =>
  `${greeting}\n\nWith reference to your request for quotation for ${oppName}, we are pleased to submit our approved Techno-Commercial Proposal for Opportunity ${oppId}, Revision ${revision}.\n\nPlease find enclosed ${attachments.join(' and ')} for your review and records.\n\nOur offer is valid for ${validityDays} days from the date of submission. Kindly review the attached documents and confirm whether the offer meets your technical and commercial requirements.\n\nShould you require any additional information or clarification regarding the scope, technical specifications, or commercial terms, please feel free to contact us.\n\nWe look forward to your response.\n\nBest regards,\n${senderName}\nModAE India Pvt. Ltd.`

const proposalEmailImprovedFallback = proposalEmailFallback

const assembleProposalEmail = ({ greeting, purpose, attachments, validityAndNextStep, clarification, signoff }) =>
  [greeting, purpose, attachments, validityAndNextStep, clarification, signoff]
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .join('\n\n')

const proposalFilenameFor = (oppId, revision) => `ModAE_Techno-Commercial_Proposal_${oppId}_Rev_${revision}.xlsx`
const validProposalFilename = value => {
  const filename = String(value || '').trim()
  return filename.length > 5 && filename.length <= 140 && /\.xlsx$/i.test(filename) && !/[\\/:*?"<>|]/.test(filename)
}

// Customer send is unlocked only by an approved release for the current
// revision. Before release, the same mail surface remains visible as a locked
// preview so the customer-send step has one consistent shape.
export default function SubmissionPanel({ opp, onSubmitted, readOnly = false }) {
  const store = useStore()
  const p = store.getProposal(opp.id)
  const route = docRoute(p, opp)
  const proposalTemplate = resolveProposalTemplate(store.config, route)
  const [proposalFilename, setProposalFilename] = useState(() => proposalFilenameFor(opp.id, p.revision))
  const governedAttachmentNames = [
    proposalFilename,
    ...enclosuresFor(route).map(enclosure => enclosure.filename),
  ]
  const [sentNow, setSentNow] = useState(false)
  const [communicationId, setCommunicationId] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [gmailDraftHref, setGmailDraftHref] = useState('')
  const [readingFiles, setReadingFiles] = useState(false)
  const [extraFiles, setExtraFiles] = useState([])
  const [attachProposal, setAttachProposal] = useState(true)
  const [messageBusy, setMessageBusy] = useState(false)
  const [messageNotice, setMessageNotice] = useState('')
  const [proofreadBusy, setProofreadBusy] = useState(false)
  const [proofreadError, setProofreadError] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewWorkbook, setPreviewWorkbook] = useState(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const fileInputRef = useRef(null)
  const aiRequestRef = useRef(0)
  const customerArtifactRef = useRef({ key: '', promise: null })
  const customer = (store.customers || []).find(c => c.id === opp.sellTo || c.name === opp.sellTo)
  const emailGreeting = customer?.name || opp.sellTo ? `Dear ${customer?.name || opp.sellTo} Team,` : 'Dear Sir/Madam,'
  const defaultEmailBody = proposalEmailFallback({
    greeting: emailGreeting,
    oppName: opp.oppName,
    oppId: opp.id,
    revision: p.revision,
    validityDays: p.validityDays || opp.validityDays || 30,
    senderName: displayRole(store.role),
    attachments: governedAttachmentNames,
  })
  const improvedEmailBody = proposalEmailImprovedFallback({
    greeting: emailGreeting,
    oppName: opp.oppName,
    oppId: opp.id,
    revision: p.revision,
    validityDays: p.validityDays || opp.validityDays || 30,
    senderName: displayRole(store.role),
    attachments: governedAttachmentNames,
  })
  // Mail fields prefill from the opportunity but stay editable — the
  // salesperson can correct a wrong address or subject before it goes out.
  const [emailFrom, setEmailFrom] = useState(store.config?.gmailAccount || 'sales@mod-ae.com')
  const [emailCc, setEmailCc] = useState('sales@mod-ae.com')
  const [emailTo, setEmailTo] = useState(opp.contactEmail || customer?.email || '')
  const [emailSubject, setEmailSubject] = useState(`Proposal — ${opp.oppName} (${opp.id} Rev ${p.revision})`)
  const [emailBody, setEmailBody] = useState(defaultEmailBody)

  // A quote remains releasable after unrelated edits; material customer-facing
  // changes reopen the release gate.
  // Only a service opportunity still on the older single review releases off it;
  // the rest release through §5 like any other quote.
  const onLegacyReview = !!legacyServiceReview(opp, store.approvals)
  const serviceRelease = onLegacyReview ? serviceApprovalSet(store.approvals, opp.id, p, opp)[0].approved : null
  const { release: genericRelease, reason: releaseReason, pending: pendingRelease } = releaseState(p, store.approvals, opp.id, opp)
  const release = onLegacyReview ? serviceRelease : genericRelease
  const pendingConds = store.approvals
    .filter(a => a.oppId === opp.id && a.status === 'Approved with conditions')
    .flatMap(a => (a.conditions || []).filter(c => !c.incorporated)
      .map(c => ({ ...c, approver: a.approver, type: a.type })))
  const pendingCommercialConfirmations = (p.terms || []).filter(isCounterAwaitingCustomer)
  const submission = latestSubmissionForRevision(store.communications[opp.id], p.revision)
  const alreadySent = submission?.status === 'sent'
  const draftOpened = sentNow || submission?.status === 'draft'
  const releasePending = !release
  const mailboxLocked = readOnly || releasePending
  const requestRelease = () => store.requestApproval({
    oppId: opp.id,
    type: 'Final quote release',
    rev: String(p.revision ?? ''),
    approver: 'LJS',
    needed: ['LJS', 'AH'],
    detail: 'Final quote release is required before the customer quote can be sent.',
    blockingReason: 'The customer-facing quote cannot be sent until LJS + AH approve its final release.',
    opportunitySummary: `${opp.oppName || 'This opportunity'} is a ${opp.route || 'sales'} opportunity for ${opp.sellTo || 'the customer'}.`,
  })

  const doc = docModel(p, opp, { files: [], config: store.config })
  const { totalQty, lineQuoted, lineCost, linePrice, computeTotals } = buildPricing(store, p)
  const totals = computeTotals(p)
  const priced = p.bidType !== 'Unpriced (Technical)'
  const proposalValidated = p.reviewStatus === 'Validated' || !!release || p.reviewStatus === 'Override accepted'
  const fromValid = EMAIL_RE.test(emailFrom.trim())
  const toValid = recipientsValid(emailTo)
  const ccValid = splitRecipients(emailCc).length === 0 || recipientsValid(emailCc)
  const filenameValid = !attachProposal || validProposalFilename(proposalFilename)
  const canSend = !!release && !pendingConds.length && (!attachProposal || proposalValidated) && filenameValid && fromValid && toValid && ccValid && Boolean(emailSubject.trim()) && Boolean(emailBody.trim()) && !readingFiles && !readOnly

  const removeExtraFile = filename => setExtraFiles(files => files.filter(f => f.filename !== filename))

  const onFilesPicked = async event => {
    const files = Array.from(event.target.files || [])
    if (!files.length) return
    setReadingFiles(true)
    setSendError('')
    try {
      const attachments = await Promise.all(files.map(file =>
        blobAttachment(file, file.name, file.type || 'application/octet-stream')))
      setExtraFiles(prev => [...prev, ...attachments])
    } catch (error) {
      setSendError(error?.message || 'Attached file could not be read')
    } finally {
      setReadingFiles(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const artifactKey = JSON.stringify({
    proposal: snapshotProposal(p),
    reviewStatus: p.reviewStatus,
    reviewedUpload: p.reviewedUpload
      ? { filename: p.reviewedUpload.filename, uploadedAt: p.reviewedUpload.uploadedAt, blobKey: p.reviewedUpload.blobKey }
      : null,
    opportunity: { id: opp.id, name: opp.oppName, customer: opp.sellTo, route },
    template: {
      source: proposalTemplate?.source,
      id: proposalTemplate?.id,
      path: proposalTemplate?.path,
      filename: proposalTemplate?.filename,
      mapping: proposalTemplate?.mapping,
    },
    filename: proposalFilename,
  })
  const getCustomerArtifact = async () => {
    if (customerArtifactRef.current.key !== artifactKey || !customerArtifactRef.current.promise) {
      const promise = hasValidatedUploadedWorkbook(p)
        ? getFile(validatedWorkbookStorageKey(p, opp.id), validatedWorkbookFilename(p)).then(file => {
          if (!file) throw new Error('The validated proposal workbook is unavailable. Please upload it again from the Proposal page.')
          return blobAttachment(file, proposalFilename.trim(), file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            .then(attachment => ({
              workbookPreview: validatedWorkbookPreview(p),
              attachment,
            }))
        })
        : loadProposalTemplateBuffer(proposalTemplate).then(templateBuffer => customerProposalArtifact({
          templateBuffer,
          mapping: proposalTemplate?.mapping,
          mappingWarnings: proposalTemplate?.mappingWarnings,
          filename: proposalFilename.trim(),
          p, opp, doc, priced, totalQty, lineQuoted, lineCost, linePrice, totals, route,
        }))
      customerArtifactRef.current = { key: artifactKey, promise }
    }
    try {
      return await customerArtifactRef.current.promise
    } catch (error) {
      if (customerArtifactRef.current.key === artifactKey) customerArtifactRef.current = { key: '', promise: null }
      throw error
    }
  }

  const createMessage = async () => {
    const requestId = ++aiRequestRef.current
    setMessageBusy(true)
    setProofreadError('')
    setMessageNotice('')
    try {
      const result = await runTaskResult('email.proposal', {
        oppName: opp.oppName,
        customer: opp.sellTo,
        oppId: opp.id,
        revision: p.revision,
        validity: `${p.validityDays || opp.validityDays || 30} days from submission`,
        route,
        senderName: displayRole(store.role),
        attachments: attachmentNames,
        terms: p.terms || [],
      }, { timeoutMs: 12000 })
      if (requestId !== aiRequestRef.current) return
      const sections = result?.data?.data
      if (!sections || typeof sections !== 'object') {
        setEmailBody(improvedEmailBody)
        setMessageNotice(`AI was unavailable${result?.error ? ` (${result.error})` : ''}. A professional built-in draft was applied; please review it before sending.`)
        return
      }
      const formatted = formatEmailBody(assembleProposalEmail(sections))
      const hasRequiredStructure = /standard terms/i.test(formatted)
        && /valid for .* days/i.test(formatted)
        && /review .*documents|clarification|confirmation/i.test(formatted)
        && formatted.split(/\n\s*\n/).length >= 5
      const hasMeaningfulChange = formatted.trim() !== emailBody.trim()
      setEmailBody(hasRequiredStructure && hasMeaningfulChange ? formatted : improvedEmailBody)
      if (!(hasRequiredStructure && hasMeaningfulChange)) {
        setMessageNotice('The AI response did not meet the required email structure, so the professional built-in draft was applied.')
      }
    } catch (error) {
      if (requestId !== aiRequestRef.current) return
      setEmailBody(improvedEmailBody)
      setMessageNotice(`AI was unavailable${error?.message ? ` (${error.message})` : ''}. A professional built-in draft was applied; please review it before sending.`)
    } finally {
      setMessageBusy(false)
    }
  }

  const proofreadMessage = async () => {
    if (!emailBody.trim()) {
      setProofreadError('Enter a message before checking its grammar.')
      return
    }
    const requestId = ++aiRequestRef.current
    setProofreadBusy(true)
    setProofreadError('')
    setMessageNotice('')
    try {
      const result = await runTaskResult('email.proofread', {
        body: emailBody,
        customer: opp.sellTo,
        oppId: opp.id,
        revision: p.revision,
        validity: `${p.validityDays || opp.validityDays || 30} days from submission`,
        senderName: displayRole(store.role),
      }, { timeoutMs: 12000 })
      if (requestId !== aiRequestRef.current) return
      const text = textFromTaskResult(result?.data)
      if (!text?.trim()) throw new Error(result?.error || 'Grammar check could not be completed. Please try again.')
      setEmailBody(formatEmailBody(text))
    } catch (error) {
      if (requestId !== aiRequestRef.current) return
      setProofreadError(error?.message || 'Grammar check could not be completed')
    } finally {
      setProofreadBusy(false)
    }
  }

  const openProposalPreview = async () => {
    if (previewBusy) return
    setPreviewOpen(true)
    setPreviewBusy(true)
    setPreviewError('')
    try {
      const artifact = await getCustomerArtifact()
      setPreviewWorkbook(artifact.workbookPreview)
    } catch (error) {
      setPreviewWorkbook(null)
      setPreviewError(error?.message || 'The proposal workbook preview could not be generated')
    } finally {
      setPreviewBusy(false)
    }
  }

  const downloadAttachment = attachment => {
    const binary = atob(attachment.contentBase64)
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
    const url = URL.createObjectURL(new Blob([bytes], { type: attachment.mimeType }))
    const link = document.createElement('a')
    link.href = url
    link.download = attachment.filename
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const send = async () => {
    setSending(true)
    setSendError('')
    setGmailDraftHref('')
    const href = gmailComposeHref({ to: emailTo, cc: emailCc, subject: emailSubject, body: emailBody })
    if (!href) {
      setSending(false)
      setSendError('Add a recipient email address before opening the Gmail draft')
      return
    }

    // Reserve the tab while the click is still trusted. Generating the
    // workbook and reading enclosures are asynchronous; opening Gmail after
    // those awaits makes Chrome treat the popup as unsolicited.
    const draftWindow = window.open('', '_blank')
    setGmailDraftHref(href)
    if (!draftWindow) {
      setSending(false)
      setSendError('Chrome blocked the Gmail draft tab. Use “Open Gmail draft” below or allow pop-ups for this site.')
      return
    }

    try {
      const attachments = [
        ...(attachProposal ? [(await getCustomerArtifact()).attachment] : []),
        ...(await enclosureAttachments(route)),
        ...extraFiles,
      ]
      attachments.forEach(downloadAttachment)
      draftWindow.location.href = href
      const id = 'CM-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
      store.addCommunication(opp.id, {
        id,
        direction: 'outbound',
        from: emailFrom,
        to: emailTo,
        cc: emailCc,
        subject: emailSubject,
        body: emailBody,
        kind: 'submission',
        status: 'draft',
        revision: String(p.revision ?? ''),
        proposalSnapshot: snapshotProposal(p),
        attachments,
        attachmentNames: [
          ...(attachProposal ? [proposalFilename.trim()] : []),
          ...enclosuresFor(route).map(a => a.filename),
          ...extraFiles.map(a => a.filename),
        ],
      })
      setCommunicationId(id)
      setSentNow(true)
      onSubmitted?.()
    } catch (error) {
      draftWindow.close()
      setSendError(error?.message || 'Gmail draft could not be opened')
    } finally {
      setSending(false)
    }
  }

  const markAsSent = () => {
    const id = communicationId || submission?.id
    if (!id) return
    store.updateCommunication(opp.id, id, { status: 'sent' }, 'Proposal email marked as sent')
    setSentNow(false)
  }

  const retryGmailDraft = () => {
    if (!gmailDraftHref) return
    window.open(gmailDraftHref, '_blank', 'noopener')
    setSendError('')
  }

  const attachmentNames = [
    ...(attachProposal ? [proposalFilename] : []),
    ...enclosuresFor(route).map(e => e.filename),
    ...extraFiles.map(f => f.filename),
  ]
  const rows = [
    ['From', <input type="email" value={emailFrom} disabled={mailboxLocked} onChange={e => setEmailFrom(e.target.value)} placeholder="sales@company.com" />],
    ['To', <input id="customer-email-to" type="text" value={emailTo} disabled={mailboxLocked} onChange={e => setEmailTo(e.target.value)} placeholder="customer@company.com, second@company.com" />],
    ['CC', <input type="text" value={emailCc} disabled={mailboxLocked} onChange={e => setEmailCc(e.target.value)} placeholder="name@company.com" />],
    ['Subject', <input type="text" value={emailSubject} disabled={mailboxLocked} onChange={e => setEmailSubject(e.target.value)} placeholder="Proposal subject" />],
    ['Attachments', <div className="submission-attachment-editor">
      {attachProposal && <label className="submission-attachment-name">
        <span>Proposal workbook filename</span>
        <input type="text" value={proposalFilename} disabled={mailboxLocked} onChange={event => setProposalFilename(event.target.value)}
          aria-invalid={!filenameValid} aria-describedby={!filenameValid ? 'proposal-filename-error' : undefined} />
      </label>}
      {!filenameValid && <span id="proposal-filename-error" className="err-text">Use a valid filename ending in .xlsx.</span>}
      <div className="submission-attachment-supporting">
        <span><b>Also attached:</b> {[...enclosuresFor(route).map(e => e.filename), ...extraFiles.map(f => f.filename)].join(' · ') || 'No additional files'}</span>
        <button type="button" onClick={openProposalPreview} className="submission-preview-action" title="View the exact Excel workbook that will be attached">
          <Icon name="fileSheet" size={13} /> View proposal Excel
        </button>
      </div>
    </div>],
  ]

  return (
    <div className={`submission-mailbox ${mailboxLocked ? 'is-locked' : 'is-ready'}`}>
      <div className="submission-mailbox-head">
        <div>
          <div className="section-title">Customer email submission</div>
          <div className="hint">Prepare and review the approved offer before sending it to the customer.</div>
        </div>
        <span className={`submission-status ${releasePending ? 'is-pending' : alreadySent ? 'is-sent' : 'is-ready'}`}>
          {releasePending ? 'Awaiting approval' : alreadySent ? 'Sent' : 'Ready to send'}
        </span>
      </div>

      {releasePending && (
        <div className="submission-approval-banner" role="status">
          <div>
            <b>{opp.route === 'Service' ? 'Service Review pending' : 'Final quote release pending'}</b>
            <span>{releaseReason || 'AH + LJS must approve the current proposal revision before it can be sent.'}</span>
          </div>
          {opp.route !== 'Service' && !pendingRelease && (
            <button className="exception-action" type="button" onClick={requestRelease}>Request approval</button>
          )}
        </div>
      )}

      <div className="submission-mail-fields">
        {rows.slice(0, 4).map(([k, v]) => <label key={k} className="submission-mail-field"><b>{k}</b>{v}</label>)}
      </div>
      <div className="submission-mail-attachments">
        <b>Attachments</b>
        {rows[4][1]}
      </div>

      <label className="submission-mail-body-label">Message draft</label>
      <div className="submission-mail-toolbar">
        <button type="button" onClick={createMessage} disabled={mailboxLocked || messageBusy || proofreadBusy}>
          <Icon name="sparkles" size={13} /> {messageBusy ? 'Improving draft…' : 'Improve with AI'}
        </button>
        <button type="button" onClick={proofreadMessage} disabled={mailboxLocked || proofreadBusy || messageBusy}>
          <Icon name="check" size={13} /> {proofreadBusy ? 'Proofreading…' : 'Proofread with AI'}
        </button>
        <span className="hint">Optional professional review</span>
      </div>
      <textarea className="submission-message-draft" value={emailBody} disabled={mailboxLocked} onChange={e => { aiRequestRef.current += 1; setEmailBody(e.target.value) }} rows={9} />
      {messageNotice && <WarnBox>{messageNotice}</WarnBox>}
      {proofreadError && <ErrBox>{proofreadError}</ErrBox>}

      <div className="check-row" style={{ marginTop: 8 }}>
        <input type="checkbox" checked={attachProposal} disabled={mailboxLocked} onChange={e => setAttachProposal(e.target.checked)} />
        <span><b>Attach validated proposal</b><span className="hint"> — generated Rev {p.revision} workbook</span></span>
      </div>
      {attachProposal && !proposalValidated && (
        <ErrBox>Validate the proposal from the Proposal tab before attaching it. You can uncheck this option to send only the standard enclosures and optional files.</ErrBox>
      )}

      <div className="submission-actions">
        <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={onFilesPicked} />
        <button className="secondary" type="button" disabled={mailboxLocked || readingFiles}
          onClick={() => fileInputRef.current?.click()}>
          <Icon name="upload" size={13} /> {readingFiles ? 'Reading files…' : `Attach files${extraFiles.length ? ` (${extraFiles.length})` : ''}`}
        </button>
        <button className="primary submission-draft-action" disabled={!canSend || sending}
          title={pendingConds.length ? 'Confirm all approval conditions first'
            : attachProposal && !proposalValidated ? 'Validate the proposal before attaching it'
            : !fromValid ? 'Enter a valid sender email in the From field'
            : !toValid ? 'Enter a valid recipient email in the To field'
            : !ccValid ? 'The CC address is not valid'
            : !filenameValid ? 'Enter a valid proposal filename ending in .xlsx'
            : !emailSubject.trim() ? 'Enter a subject'
            : !emailBody.trim() ? 'Enter a message'
            : !release ? 'Awaiting AH + LJS approval before sending' : ''}
          onClick={send}>
          <Icon name="send" size={13} /> {sending ? 'Opening Gmail…' : 'Draft email'}
        </button>
        {extraFiles.map(f => (
          <div key={f.filename} className="check-row">
            <Icon name="fileText" size={13} />
            <span>{f.filename}</span>
            <button className="secondary" type="button" disabled={mailboxLocked} style={{ marginLeft: 'auto', padding: '2px 8px' }}
              onClick={() => removeExtraFile(f.filename)}>
              <Icon name="x" size={11} /> Remove
            </button>
          </div>
        ))}
        <div className="hint" style={{ marginTop: 4 }}>
          Files are downloaded when Gmail opens so you can attach them to the draft (max 8 files, 30 MB total).
        </div>
      </div>

      {pendingConds.length > 0 && (
        <ErrBox>
          {pendingConds.length} approval condition{pendingConds.length === 1 ? '' : 's'} not yet confirmed incorporated —
          the proposal cannot go to the customer until every one is accounted for in the builder.
          {pendingConds.map((c, i) => <div key={i} style={{ marginTop: 4 }}>"{c.text}" — set by {c.approver}</div>)}
        </ErrBox>
      )}

      {pendingCommercialConfirmations.length > 0 && (
        <div className="warnbox" role="status">
          {pendingCommercialConfirmations.length} commercial counter-offer{pendingCommercialConfirmations.length === 1 ? '' : 's'} awaiting customer confirmation:
          {pendingCommercialConfirmations.map(term => <div key={term.term} style={{ marginTop: 4 }}>
            {term.term}: ModAE proposes “{term.proposedTerm || term.ourResponse}” against the customer request “{term.customerAsk}”. The quotation may be prepared, but Follow-up must record the customer response.
          </div>)}
        </div>
      )}

      {release && <div className="okbox" style={{ marginTop: 10 }}>
        Current proposal revision is approved for customer submission.
      </div>}

      {sendError && <ErrBox>{sendError}</ErrBox>}
      {gmailDraftHref && !draftOpened && (
        <div className="hint" style={{ marginTop: 8 }}>
          <button type="button" className="secondary" onClick={retryGmailDraft}>Open Gmail draft</button>
        </div>
      )}
      {draftOpened && !alreadySent && (
        <div className="errbox">
          Gmail draft opened — attach the downloaded files and send it in Gmail.
            <button type="button" className="secondary" disabled={mailboxLocked} style={{ marginLeft: 8 }} onClick={markAsSent}>
            Mark as sent
          </button>
        </div>
      )}
      {alreadySent && (
        <div className="okbox">Proposal email marked as sent — logged in Communications; moved to Follow-up.</div>
      )}
      {previewOpen && (
        <Modal onClose={() => setPreviewOpen(false)} wide className="proposal-preview-modal workbook-preview-modal">
          <div className="proposal-preview-toolbar">
            <span className="hint">Exact customer Excel attachment · read-only</span>
            <button type="button" onClick={() => setPreviewOpen(false)}>Close</button>
          </div>
          <WorkbookPreview workbook={previewWorkbook} loading={previewBusy} error={previewError} />
        </Modal>
      )}
    </div>
  )
}
