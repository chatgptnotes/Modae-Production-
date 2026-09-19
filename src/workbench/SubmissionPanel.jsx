import React, { useRef, useState } from 'react'
import { useStore } from '../store.jsx'
import { ErrBox, Modal } from '../ui.jsx'
import { releaseState, serviceApprovalSet } from '../gates.js'
import { Icon } from '../icons.jsx'
import { docModel, docRoute, enclosuresFor } from '../proposalDoc.js'
import { buildPricing } from '../proposal/docProps.js'
import { blobAttachment, proposalWorkbookAttachment, enclosureAttachments } from '../proposal/emailAttachments.js'
import { formatEmailBody, runTask, runText } from '../ai.js'
import PrintDoc from '../proposal/PrintDoc.jsx'
import { EMAIL_RE, splitRecipients, recipientsValid } from '../emailValidation.js'
import { gmailComposeHref, displayRole } from '../utils.js'
import { isCounterAwaitingCustomer } from '../commercialTerms.js'
import { snapshotProposal } from '../store.jsx'

const proposalEmailFallback = ({ greeting, oppId, revision, validityDays }) =>
  `${greeting}\n\nPlease find attached our approved Techno-Commercial Proposal ${oppId}, revision ${revision}, together with the applicable ModAE standard terms.\n\nThe proposal is valid for ${validityDays} days from submission. Please review the attached documents and let us know if you need any clarification or would like us to proceed.\n\nBest regards,\nModAE India Pvt Ltd`

const proposalEmailImprovedFallback = ({ greeting, oppId, revision, validityDays }) =>
  `${greeting}\n\nPlease find attached our approved Techno-Commercial Proposal ${oppId}, revision ${revision}, together with the applicable ModAE standard terms for your review.\n\nThe proposal covers the requirements set out in your request and is valid for ${validityDays} days from submission. Please review the attached documents and confirm whether the offer meets your requirements.\n\nIf you need any clarification on the proposal, scope, or commercial terms, please let us know and our team will be pleased to assist.\n\nBest regards,\nModAE India Pvt Ltd`

const assembleProposalEmail = ({ greeting, purpose, attachments, validityAndNextStep, clarification, signoff }) =>
  [greeting, purpose, attachments, validityAndNextStep, clarification, signoff]
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .join('\n\n')

// Customer send is unlocked only by an approved release for the current
// revision. To, CC, Subject, the covering message and the attachment list stay
// editable before Gmail opens a draft.
export default function SubmissionPanel({ opp, onSubmitted }) {
  const store = useStore()
  const p = store.getProposal(opp.id)
  const [sentNow, setSentNow] = useState(false)
  const [communicationId, setCommunicationId] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [readingFiles, setReadingFiles] = useState(false)
  const [extraFiles, setExtraFiles] = useState([])
  const [attachProposal, setAttachProposal] = useState(true)
  const [messageBusy, setMessageBusy] = useState(false)
  const [messageError, setMessageError] = useState('')
  const [proofreadBusy, setProofreadBusy] = useState(false)
  const [proofreadError, setProofreadError] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const fileInputRef = useRef(null)
  const customer = (store.customers || []).find(c => c.id === opp.sellTo || c.name === opp.sellTo)
  const emailGreeting = customer?.name || opp.sellTo ? `Dear ${customer?.name || opp.sellTo} Team,` : 'Dear Sir/Madam,'
  const defaultEmailBody = proposalEmailFallback({
    greeting: emailGreeting,
    oppId: opp.id,
    revision: p.revision,
    validityDays: p.validityDays || opp.validityDays || 30,
  })
  const improvedEmailBody = proposalEmailImprovedFallback({
    greeting: emailGreeting,
    oppId: opp.id,
    revision: p.revision,
    validityDays: p.validityDays || opp.validityDays || 30,
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
  const serviceRelease = opp.route === 'Service' ? serviceApprovalSet(store.approvals, opp.id, p, opp)[0].approved : null
  const { release: genericRelease, reason: releaseReason, pending: pendingRelease } = releaseState(p, store.approvals, opp.id, opp)
  const release = opp.route === 'Service' ? serviceRelease : genericRelease
  const pendingConds = store.approvals
    .filter(a => a.oppId === opp.id && a.status === 'Approved with conditions')
    .flatMap(a => (a.conditions || []).filter(c => !c.incorporated)
      .map(c => ({ ...c, approver: a.approver, type: a.type })))
  const pendingCommercialConfirmations = (p.terms || []).filter(isCounterAwaitingCustomer)
  const submission = (store.communications[opp.id] || []).find(c => c.kind === 'submission')
  const alreadySent = submission?.status === 'sent'
  const draftOpened = sentNow || submission?.status === 'draft'

  if (!release) {
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
    return (
      <div className="form-card wide">
          <div className="section-title">Customer submission (simulated)</div>
        {releaseReason && <p className="hint"><b>Why the release gate is closed:</b> {releaseReason}</p>}
        <p className="hint">
          {opp.route === 'Service' ? 'Service Review pending — submission opens once AH + LJS approve the offer.' : "Release approval pending — submission opens once a 'Final quote release' is approved."}
          Prepare the proposal in the builder and submit it for approval first.
        </p>
        {opp.route !== 'Service' && !pendingRelease && (
          <button className="exception-action" onClick={requestRelease}>Request final quote release from LJS + AH</button>
        )}
      </div>
    )
  }

  const doc = docModel(p, opp, { files: [], config: store.config })
  const route = docRoute(p, opp)
  const { totalQty, lineQuoted, lineCost, linePrice, computeTotals } = buildPricing(store, p)
  const totals = computeTotals(p)
  const priced = p.bidType !== 'Unpriced (Technical)'
  const proposalValidated = p.reviewStatus === 'Validated' || !!release || p.reviewStatus === 'Override accepted'
  const fromValid = EMAIL_RE.test(emailFrom.trim())
  const toValid = recipientsValid(emailTo)
  const ccValid = splitRecipients(emailCc).length === 0 || recipientsValid(emailCc)
  const canSend = !pendingConds.length && (!attachProposal || proposalValidated) && fromValid && toValid && ccValid && Boolean(emailSubject.trim()) && Boolean(emailBody.trim()) && !readingFiles

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

  const createMessage = async () => {
    setMessageBusy(true)
    setMessageError('')
    try {
      const result = await runTask('email.proposal', {
        oppName: opp.oppName,
        customer: opp.sellTo,
        oppId: opp.id,
        revision: p.revision,
        validity: `${p.validityDays || opp.validityDays || 30} days from submission`,
        route,
        senderName: displayRole(store.role),
        attachments: attachmentNames,
        terms: p.terms || [],
      })
      const sections = result?.data
      if (!sections || typeof sections !== 'object') throw new Error('AI message could not be created. Check the AI connection and try again.')
      const formatted = formatEmailBody(assembleProposalEmail(sections))
      const hasRequiredStructure = /standard terms/i.test(formatted)
        && /valid for .* days/i.test(formatted)
        && /review .*documents|clarification|confirmation/i.test(formatted)
        && formatted.split(/\n\s*\n/).length >= 5
      const hasMeaningfulChange = formatted.trim() !== emailBody.trim()
      setEmailBody(hasRequiredStructure && hasMeaningfulChange ? formatted : improvedEmailBody)
    } catch (error) {
      setMessageError(error?.message || 'AI message could not be created')
    } finally {
      setMessageBusy(false)
    }
  }

  const proofreadMessage = async () => {
    if (!emailBody.trim()) {
      setProofreadError('Enter a message before checking its grammar.')
      return
    }
    setProofreadBusy(true)
    setProofreadError('')
    try {
      const text = await runText('email.proofread', {
        body: emailBody,
        customer: opp.sellTo,
        oppId: opp.id,
        revision: p.revision,
        validity: `${p.validityDays || opp.validityDays || 30} days from submission`,
        senderName: displayRole(store.role),
      })
      if (!text?.trim()) throw new Error('Grammar check could not be completed. Please try again.')
      setEmailBody(formatEmailBody(text))
    } catch (error) {
      setProofreadError(error?.message || 'Grammar check could not be completed')
    } finally {
      setProofreadBusy(false)
    }
  }

  const openProposalPreview = () => setPreviewOpen(true)

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
    try {
      const attachments = [
        ...(attachProposal ? [await proposalWorkbookAttachment({ p, opp, doc, priced, totalQty, lineQuoted, lineCost, linePrice, totals, route })] : []),
        ...(await enclosureAttachments(route)),
        ...extraFiles,
      ]
      attachments.forEach(downloadAttachment)
      const href = gmailComposeHref({ to: emailTo, cc: emailCc, subject: emailSubject, body: emailBody })
      if (!href) throw new Error('Add a recipient email address before opening the Gmail draft')
      window.open(href, '_blank', 'noopener')
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
        proposalSnapshot: snapshotProposal(p),
        attachments,
        attachmentNames: [
          ...(attachProposal ? [`${opp.id}_Proposal_Rev_${p.revision}.xlsx`] : []),
          ...enclosuresFor(route).map(a => a.filename),
          ...extraFiles.map(a => a.filename),
        ],
      })
      setCommunicationId(id)
      store.updateOpportunity(opp.id, {
        milestone: 'Follow-up',
        proposalDate: new Date().toISOString().slice(0, 10),
      })
      if (opp.route === 'Service') store.updateServiceFlow(opp.id, {
        offerSent: true,
        offerSentOn: new Date().toISOString().slice(0, 10),
        offerRecipient: emailTo,
      })
      setSentNow(true)
      onSubmitted?.()
    } catch (error) {
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

  const attachmentNames = [
    ...(attachProposal ? [`${opp.id}_Proposal_Rev_${p.revision}.xlsx`] : []),
    ...enclosuresFor(route).map(e => e.filename),
    ...extraFiles.map(f => f.filename),
  ]
  const rows = [
    ['From', <input type="email" value={emailFrom} onChange={e => setEmailFrom(e.target.value)} placeholder="sales@company.com" style={{ width: '100%' }} />],
    ['To', <input id="customer-email-to" type="text" value={emailTo} onChange={e => setEmailTo(e.target.value)} placeholder="customer@company.com, second@company.com" style={{ width: '100%' }} />],
    ['CC', <input type="text" value={emailCc} onChange={e => setEmailCc(e.target.value)} placeholder="name@company.com" style={{ width: '100%' }} />],
    ['Subject', <input type="text" value={emailSubject} onChange={e => setEmailSubject(e.target.value)} placeholder="Proposal subject" style={{ width: '100%' }} />],
    ['Attachments', <>
      <span>{attachmentNames.join(' · ')}</span>
      <button type="button" onClick={openProposalPreview} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 8 }} title="View the current ModAE customer proposal">
        <Icon name="fileSheet" size={13} /> View proposal
      </button>
    </>],
  ]

  return (
    <div className="form-card wide">
      <div className="section-title">Customer email submission</div>
      <table className="cost-table" style={{ width: '100%' }}>
        <tbody>
          {rows.map(([k, v]) => <tr key={k}><td style={{ width: 90 }}><b>{k}</b></td><td>{v}</td></tr>)}
        </tbody>
      </table>

      <label className="afield" style={{ display: 'block', marginTop: 8 }}>Message draft</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '4px 0' }}>
        <button type="button" onClick={createMessage} disabled={messageBusy || proofreadBusy}>
          <Icon name="sparkles" size={13} /> {messageBusy ? 'Improving message…' : 'Improve draft with AI'}
        </button>
        <button type="button" onClick={proofreadMessage} disabled={proofreadBusy || messageBusy}>
          <Icon name="check" size={13} /> {proofreadBusy ? 'Checking grammar…' : 'Check grammar with AI'}
        </button>
        <span className="hint">Optional rewrite</span>
      </div>
      <textarea className="submission-message-draft" value={emailBody} onChange={e => setEmailBody(e.target.value)} rows={9}
        style={{ width: '100%', resize: 'vertical' }} />
      {messageError && <ErrBox>{messageError}</ErrBox>}
      {proofreadError && <ErrBox>{proofreadError}</ErrBox>}

      <div className="check-row" style={{ marginTop: 8 }}>
        <input type="checkbox" checked={attachProposal} onChange={e => setAttachProposal(e.target.checked)} />
        <span><b>Attach validated proposal</b><span className="hint"> — generated Rev {p.revision} workbook</span></span>
      </div>
      {attachProposal && !proposalValidated && (
        <ErrBox>Validate the proposal from the Proposal tab before attaching it. You can uncheck this option to send only the standard enclosures and optional files.</ErrBox>
      )}

      <div className="submission-actions">
        <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={onFilesPicked} />
        <button className="secondary" type="button" disabled={readingFiles}
          onClick={() => fileInputRef.current?.click()}>
          <Icon name="upload" size={13} /> {readingFiles ? 'Reading files…' : `Attach files${extraFiles.length ? ` (${extraFiles.length})` : ''}`}
        </button>
        <button className="primary submission-draft-action" disabled={!canSend || sending}
          title={pendingConds.length ? 'Confirm all approval conditions first'
            : attachProposal && !proposalValidated ? 'Validate the proposal before attaching it'
            : !fromValid ? 'Enter a valid sender email in the From field'
            : !toValid ? 'Enter a valid recipient email in the To field'
            : !ccValid ? 'The CC address is not valid'
            : !emailSubject.trim() ? 'Enter a subject'
            : !emailBody.trim() ? 'Enter a message'
            : ''}
          onClick={send}>
          <Icon name="send" size={13} /> {sending ? 'Opening Gmail…' : 'Draft email'}
        </button>
        {extraFiles.map(f => (
          <div key={f.filename} className="check-row">
            <Icon name="fileText" size={13} />
            <span>{f.filename}</span>
            <button className="secondary" type="button" style={{ marginLeft: 'auto', padding: '2px 8px' }}
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

      <div className="okbox" style={{ marginTop: 10 }}>
        Current proposal revision is approved for customer submission.
      </div>

      {sendError && <ErrBox>{sendError}</ErrBox>}
      {draftOpened && !alreadySent && (
        <div className="errbox">
          Gmail draft opened — attach the downloaded files and send it in Gmail.
          <button type="button" className="secondary" style={{ marginLeft: 8 }} onClick={markAsSent}>
            Mark as sent
          </button>
        </div>
      )}
      {alreadySent && (
        <div className="okbox">Proposal email marked as sent — logged in Communications; moved to Follow-up.</div>
      )}
      {previewOpen && (
        <Modal onClose={() => setPreviewOpen(false)} wide className="proposal-preview-modal">
          <div className="proposal-preview-toolbar">
            <span className="hint">Current ModAE customer proposal · read-only</span>
            <button type="button" onClick={() => setPreviewOpen(false)}>Close</button>
          </div>
          <div className="proposal-preview-scroll">
            <PrintDoc p={p} opp={opp} doc={doc} priced={priced} totals={totals} lineQuoted={lineQuoted} />
          </div>
        </Modal>
      )}
    </div>
  )
}
