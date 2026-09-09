import React, { useRef, useState } from 'react'
import { useStore } from '../store.jsx'
import { ROLES } from '../seed.js'
import { ErrBox, Modal } from '../ui.jsx'
import { releaseState } from '../gates.js'
import { Icon } from '../icons.jsx'
import { docModel, docRoute, enclosuresFor } from '../proposalDoc.js'
import { buildPricing } from '../proposal/docProps.js'
import { blobAttachment, proposalWorkbookAttachment, proposalWorkbookPreview, enclosureAttachments } from '../proposal/emailAttachments.js'
import { formatEmailBody, runText } from '../ai.js'
import WorkbookPreview from '../proposal/WorkbookPreview.jsx'
import { EMAIL_RE, splitRecipients, recipientsValid } from '../emailValidation.js'
import { gmailComposeHref } from '../utils.js'

// Customer send — only unlocked by an approved 'Final quote release'
// and a three-point human-in-the-loop checklist. To, CC, Subject, the covering
// message and the attachment list are all editable before the quote goes out.
export default function SubmissionPanel({ opp, onSubmitted }) {
  const store = useStore()
  const p = store.getProposal(opp.id)
  const [checks, setChecks] = useState({ c1: false, c2: false, c3: false })
  const [sentNow, setSentNow] = useState(false)
  const [communicationId, setCommunicationId] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [readingFiles, setReadingFiles] = useState(false)
  const [extraFiles, setExtraFiles] = useState([])
  const [attachProposal, setAttachProposal] = useState(true)
  const [messageBusy, setMessageBusy] = useState(false)
  const [messageError, setMessageError] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewWorkbook, setPreviewWorkbook] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const fileInputRef = useRef(null)
  const customer = (store.customers || []).find(c => c.id === opp.sellTo || c.name === opp.sellTo)
  // Mail fields prefill from the opportunity but stay editable — the
  // salesperson can correct a wrong address or subject before it goes out.
  const [emailFrom, setEmailFrom] = useState(store.config?.gmailAccount || 'sales@mod-ae.com')
  const [emailCc, setEmailCc] = useState('sales@mod-ae.com')
  const [emailTo, setEmailTo] = useState(opp.contactEmail || customer?.email || '')
  const [emailSubject, setEmailSubject] = useState(`Proposal — ${opp.oppName} (${opp.id} Rev ${p.revision})`)
  const [emailBody, setEmailBody] = useState(
    `Dear Sir/Madam,\n\nPlease find our approved Techno-Commercial Proposal ${opp.id}, revision ${p.revision}.\n\nBest regards,\nModAE India Pvt Ltd`)

  // Scoped to the proposal's current revision — a quote revised after release
  // locks submission again until the revision is approved.
  const { release } = releaseState(p, store.approvals, opp.id)
  const pendingConds = store.approvals
    .filter(a => a.oppId === opp.id && a.status === 'Approved with conditions')
    .flatMap(a => (a.conditions || []).filter(c => !c.incorporated)
      .map(c => ({ ...c, approver: a.approver, type: a.type })))
  const submission = (store.communications[opp.id] || []).find(c => c.kind === 'submission')
  const alreadySent = submission?.status === 'sent'
  const draftOpened = sentNow || submission?.status === 'draft'

  if (!release) {
    return (
      <div className="form-card">
          <div className="section-title">Customer submission (simulated)</div>
        <p className="hint">
          Release approval pending — submission opens once a 'Final quote release' is approved.
          Prepare the proposal in the builder and submit it for approval first.
        </p>
      </div>
    )
  }

  const doc = docModel(p, opp, { files: [], config: store.config })
  const route = docRoute(p, opp)
  const { totalQty, lineQuoted, lineCost, linePrice, computeTotals } = buildPricing(store, p)
  const totals = computeTotals(p)
  const priced = p.bidType !== 'Unpriced (Technical)'
  const allChecked = checks.c1 && checks.c2 && checks.c3
  const proposalValidated = p.reviewStatus === 'Validated' || !!release
  const fromValid = EMAIL_RE.test(emailFrom.trim())
  const toValid = recipientsValid(emailTo)
  const ccValid = splitRecipients(emailCc).length === 0 || recipientsValid(emailCc)
  const canSend = allChecked && !pendingConds.length && (!attachProposal || proposalValidated) && fromValid && toValid && ccValid && Boolean(emailSubject.trim()) && Boolean(emailBody.trim()) && !readingFiles

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
      const text = await runText('email.proposal', {
        oppName: opp.oppName,
        customer: opp.sellTo,
        oppId: opp.id,
        revision: p.revision,
        validity: `${p.validityDays || opp.validityDays || 30} days from submission`,
        route,
        senderName: ROLES[store.role]?.name || store.role,
        terms: p.terms || [],
      })
      if (!text?.trim()) throw new Error('AI message could not be created. Check the AI connection and try again.')
      setEmailBody(formatEmailBody(text))
    } catch (error) {
      setMessageError(error?.message || 'AI message could not be created')
    } finally {
      setMessageBusy(false)
    }
  }

  const openProposalPreview = async () => {
    setPreviewOpen(true)
    setPreviewLoading(true)
    setPreviewError('')
    try {
      const workbook = await proposalWorkbookPreview({ p, opp, doc, priced, totalQty, lineQuoted, lineCost, linePrice, totals, route })
      setPreviewWorkbook(workbook)
    } catch (error) {
      setPreviewError(error?.message || 'Proposal workbook could not be previewed')
    } finally {
      setPreviewLoading(false)
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
        to: emailTo,
        cc: emailCc,
        subject: emailSubject,
        body: emailBody,
        kind: 'submission',
        status: 'draft',
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
    ['To', <input type="text" value={emailTo} onChange={e => setEmailTo(e.target.value)} placeholder="customer@company.com, second@company.com" style={{ width: '100%' }} />],
    ['CC', <input type="text" value={emailCc} onChange={e => setEmailCc(e.target.value)} placeholder="name@company.com" style={{ width: '100%' }} />],
    ['Subject', <input type="text" value={emailSubject} onChange={e => setEmailSubject(e.target.value)} placeholder="Proposal subject" style={{ width: '100%' }} />],
    ['Attachments', <>
      <span>{attachmentNames.join(' · ')}</span>
      <button type="button" onClick={openProposalPreview} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 8 }} title="View the customer-facing proposal workbook">
        <Icon name="fileSheet" size={13} /> View proposal
      </button>
    </>],
  ]

  return (
    <div className="form-card">
        <div className="section-title">Customer email submission</div>
      <table className="cost-table" style={{ width: '100%' }}>
        <tbody>
          {rows.map(([k, v]) => <tr key={k}><td style={{ width: 90 }}><b>{k}</b></td><td>{v}</td></tr>)}
        </tbody>
      </table>

      <label className="afield" style={{ display: 'block', marginTop: 8 }}>Message</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '4px 0' }}>
        <button type="button" onClick={createMessage} disabled={messageBusy}>
          <Icon name="sparkles" size={13} /> {messageBusy ? 'Creating message…' : 'AI: create message'}
        </button>
        <span className="hint">Creates a draft in the editable message box.</span>
      </div>
      <textarea value={emailBody} onChange={e => setEmailBody(e.target.value)} rows={5}
        style={{ width: '100%', resize: 'vertical' }} />
      {messageError && <ErrBox>{messageError}</ErrBox>}

      <div className="check-row" style={{ marginTop: 8 }}>
        <input type="checkbox" checked={attachProposal} onChange={e => setAttachProposal(e.target.checked)} />
        <span><b>Attach validated proposal</b><span className="hint"> — generated Rev {p.revision} workbook</span></span>
      </div>
      {attachProposal && !proposalValidated && (
        <ErrBox>Validate the proposal from the Proposal tab before attaching it. You can uncheck this option to send only the standard enclosures and optional files.</ErrBox>
      )}

      <div style={{ marginTop: 8 }}>
        <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={onFilesPicked} />
        <button className="secondary" type="button" disabled={readingFiles}
          onClick={() => fileInputRef.current?.click()}>
          <Icon name="upload" size={13} /> {readingFiles ? 'Reading files…' : `Attach files${extraFiles.length ? ` (${extraFiles.length})` : ''}`}
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

      <div className="section-title" style={{ marginTop: 10 }}>Review required before sending</div>
      {[
        ['c1', 'Customer-facing prices and validity verified'],
        ['c2', 'No restricted commercial data in the document'],
        ['c3', `Named reviewer: ${ROLES[store.role]?.name || store.role}`],
      ].map(([k, label]) => (
        <div key={k} className="check-row">
          <input type="checkbox" checked={checks[k]}
            onChange={e => setChecks({ ...checks, [k]: e.target.checked })} />
          <span>{label}</span>
        </div>
      ))}

      <div style={{ marginTop: 10 }}>
        {sendError && <ErrBox>{sendError}</ErrBox>}
        <button className="primary" disabled={!canSend || sending}
          title={pendingConds.length ? 'Confirm all approval conditions first'
            : attachProposal && !proposalValidated ? 'Validate the proposal before attaching it'
            : !fromValid ? 'Enter a valid sender email in the From field'
            : !allChecked ? 'Complete the human-review checklist'
            : !toValid ? 'Enter a valid recipient email in the To field'
            : !ccValid ? 'The CC address is not valid'
            : !emailSubject.trim() ? 'Enter a subject'
            : !emailBody.trim() ? 'Enter a message'
            : ''}
          onClick={send}>
          <Icon name="send" size={13} /> {sending ? 'Opening Gmail…' : 'Open Gmail compose'}
        </button>
      </div>
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
            <button type="button" onClick={() => setPreviewOpen(false)}>Close</button>
          </div>
          <WorkbookPreview workbook={previewWorkbook} loading={previewLoading} error={previewError} />
        </Modal>
      )}
    </div>
  )
}
