import React, { useEffect, useMemo, useRef, useState } from 'react'
import { canPerform } from '../accessPolicy.js'
import { useSharedMailbox } from '../sharedMailbox.js'
import { Icon } from '../icons.jsx'
import { formatEmailBody, runTaskResult, textFromTaskResult } from '../ai.js'
import './mail.css'

const fromAddress = row => row?.from?.emailAddress?.address || ''
const safeEditorHtml = value => String(value || '').replace(/<(script|style|iframe|object|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '').replace(/<\/?([a-z0-9]+)\b[^>]*>/gi, (tag, rawName) => {
  const name = rawName.toLowerCase()
  if (!['b', 'strong', 'i', 'em', 'u', 'br', 'p', 'div', 'ul', 'ol', 'li'].includes(name)) return ''
  return tag.startsWith('</') ? `</${name}>` : `<${name}>`
})
const linkLabel = link => link ? `${link.targetType === 'lead' ? 'Lead' : 'Opportunity'} ${link.targetId}` : 'Not linked'
const dateLabel = value => {
  if (!value) return 'Date unavailable'
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? 'Date unavailable' : date.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function SharedMessageDetails({ mailbox, canEditMailRecords }) {
  const { selected, details, detailsError, retryDetails, targetType, setTargetType, targetId, setTargetId, busy, link, download, mailAction, folder } = mailbox
  const isDraft = folder === 'drafts'
  return <aside className="microsoft-mail-preview" aria-label="Selected message">
    <div className="microsoft-mail-preview-head"><h2>{isDraft ? 'Draft' : 'Message'}</h2>{selected && <span>{linkLabel(selected.link)}</span>}</div>
    {!selected && <div className="microsoft-mail-empty microsoft-mail-empty--preview"><b>Select an item</b><span>Its contents will appear here.</span></div>}
    {selected && !details && !detailsError && <p className="microsoft-mail-loading" role="status">Loading message…</p>}
    {selected && !details && detailsError && <div className="microsoft-mail-loading-error" role="alert"><span>Could not load this message.</span><button type="button" onClick={retryDetails}>Retry</button></div>}
    {details && <div className="microsoft-mail-detail">
      <div className="microsoft-mail-detail-actions">
        {isDraft ? <button type="button" onClick={() => mailbox.editDraft({ ...details.message, ...selected })}>Edit draft</button> : <>
          <button type="button" onClick={() => void mailAction(details.message.isRead ? 'unread' : 'read')}>{details.message.isRead ? 'Mark unread' : 'Mark read'}</button>
          <button type="button" onClick={() => void mailAction(details.message.flag?.flagStatus === 'flagged' ? 'unstar' : 'star')}>{details.message.flag?.flagStatus === 'flagged' ? 'Unstar' : 'Star'}</button>
          <button type="button" onClick={() => void mailAction('reply')}>Reply</button>
          <button type="button" onClick={() => void mailAction('forward')}>Forward</button>
          {['trash', 'archive', 'spam'].includes(folder) ? <button type="button" onClick={() => void mailAction('restore')}>Restore to inbox</button> : <>
            <button type="button" onClick={() => void mailAction('archive')}>Archive</button><button type="button" onClick={() => void mailAction('spam')}>Report spam</button><button type="button" onClick={() => void mailAction('trash')}>Move to trash</button>
          </>}
        </>}
      </div>
      <h3>{details.message.subject || '(no subject)'}</h3>
      <div className="microsoft-mail-meta"><span>From</span><b>{fromAddress(details.message) || 'Unknown sender'}</b><span>Received</span><b>{dateLabel(details.message.receivedDateTime)}</b>
        {details.message.toRecipients?.length > 0 && <><span>To</span><b>{details.message.toRecipients.map(row => row.emailAddress?.address).filter(Boolean).join(', ')}</b></>}
      </div>
      <p className="microsoft-mail-body">{details.message.body?.content || details.message.bodyPreview || 'Message content is unavailable.'}</p>
      {(details.attachments || []).filter(item => !item.isInline).length > 0 && <section className="microsoft-mail-attachments" aria-label="Attachments"><h3>Attachments</h3>
        {(details.attachments || []).filter(item => !item.isInline).map(item => <button type="button" key={item.id} onClick={() => void download(item)}>{item.name || 'Download attachment'}</button>)}
      </section>}
      {!selected.link && selected.mailAccount !== 'personal' && canEditMailRecords && !isDraft && <form className="microsoft-mail-link-form" onSubmit={link}><h3>Link to a record</h3>
        <label>Record type<select name="mail-link-type" value={targetType} onChange={event => setTargetType(event.target.value)}><option value="lead">Lead</option><option value="opportunity">Opportunity</option></select></label>
        <label>Record ID<input name="mail-link-record" value={targetId} onChange={event => setTargetId(event.target.value)} required /></label>
        <button type="submit" disabled={busy}>Link email</button>
      </form>}
    </div>}
  </aside>
}

export function MailComposeDialog({ mailbox, canSendLeadMail }) {
  const { composeOpen, setComposeOpen, status, sender, setSender, leadId, setLeadId, to, setTo,
    cc, setCc, bcc, setBcc, subject, setSubject, body, setBody, busy, error, send, attachments, addAttachments, saveDraft, draftId } = mailbox
  const [showCc, setShowCc] = useState(Boolean(cc))
  const [showBcc, setShowBcc] = useState(Boolean(bcc))
  const [minimized, setMinimized] = useState(false)
  const [proofreadBusy, setProofreadBusy] = useState(false)
  const [proofreadError, setProofreadError] = useState('')
  const [sendBusy, setSendBusy] = useState(false)
  const proofreadRequest = useRef(0)
  const bodyEditor = useRef(null)
  const leads = mailbox.store?.leads || []
  useEffect(() => { if (composeOpen) setMinimized(false) }, [composeOpen])
  useEffect(() => { if (composeOpen && bodyEditor.current) bodyEditor.current.innerHTML = safeEditorHtml(body) }, [composeOpen, draftId])
  const proofreadMessage = async () => {
    const sourceHtml = bodyEditor.current?.innerHTML || ''
    const sourceText = new DOMParser().parseFromString(sourceHtml, 'text/html').body.innerText.trim()
    if (!sourceText) { setProofreadError('Write a message before proofreading.'); return }
    const requestId = ++proofreadRequest.current
    setProofreadBusy(true); setProofreadError('')
    try {
      const result = await runTaskResult('email.proofread', { body: sourceText, customer: '', oppId: '', revision: '', validity: '', senderName: 'WinTrack ModAE' }, { timeoutMs: 12000 })
      if (requestId !== proofreadRequest.current) return
      const corrected = textFromTaskResult(result?.data)
      if (!corrected?.trim()) throw new Error(result?.error || 'Proofreading could not be completed. Try again.')
      if (bodyEditor.current?.innerHTML !== sourceHtml) { setProofreadError('The draft changed while proofreading. Run the check again.'); return }
      const correctedHtml = safeEditorHtml(formatEmailBody(corrected))
      bodyEditor.current.innerHTML = correctedHtml
      setBody(correctedHtml)
    } catch (reason) {
      if (requestId === proofreadRequest.current) setProofreadError(reason.message || 'Proofreading could not be completed.')
    } finally { setProofreadBusy(false) }
  }
  const submitMessage = async event => {
    setSendBusy(true)
    try { await send(event) } finally { setSendBusy(false) }
  }
  useEffect(() => {
    if (!composeOpen) return undefined
    const closeOnEscape = event => { if (event.key === 'Escape') setComposeOpen(false) }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [composeOpen, setComposeOpen])
  if (!canSendLeadMail || !composeOpen) return null
  return <div className="microsoft-mail-compose-backdrop">
    <section className={`microsoft-mail-compose${minimized ? ' is-minimized' : ''}`} role="dialog" aria-modal="true" aria-labelledby="mail-compose-title">
      <header className="microsoft-mail-compose-head"><h2 id="mail-compose-title">{draftId ? 'Draft' : 'New message'}</h2><div><button type="button" onClick={() => setMinimized(value => !value)} aria-label={minimized ? 'Restore compose window' : 'Minimize compose window'}>{minimized ? '□' : '−'}</button><button type="button" onClick={() => setComposeOpen(false)} aria-label="Close compose window"><Icon name="x" size={18} /></button></div></header>
      {!minimized && <>
      <form noValidate onSubmit={submitMessage}>
      <div className="microsoft-mail-compose-from"><span>From</span><select aria-label="Sending account" name="mail-send-from" value={sender} onChange={event => { mailbox.setDraftId(''); setSender(event.target.value) }}><option value="shared">Shared mailbox {status?.sharedMailAddress ? `<${status.sharedMailAddress}>` : ''}</option>{status?.personalMail && <option value="personal">My Outlook {status?.personalMailAddress ? `<${status.personalMailAddress}>` : ''}</option>}</select></div>
      <div className="microsoft-mail-compose-recipient">
        <label htmlFor="mail-send-to">To</label><input id="mail-send-to" name="mail-send-to" type="text" autoComplete="off" placeholder="Recipients" value={to} onChange={event => setTo(event.target.value)} required />
        <span className="microsoft-mail-recipient-actions">{!showCc && <button type="button" onClick={() => setShowCc(true)}>Cc</button>}{!showBcc && <button type="button" onClick={() => setShowBcc(true)}>Bcc</button>}</span>
      </div>
      {showCc && <div className="microsoft-mail-compose-recipient"><label htmlFor="mail-send-cc">Cc</label><input id="mail-send-cc" name="mail-send-cc" type="text" autoComplete="off" autoFocus={!cc.trim()} placeholder="Cc recipients" value={cc} onChange={event => setCc(event.target.value)} onBlur={() => { if (!cc.trim()) setShowCc(false) }} /></div>}
      {showBcc && <div className="microsoft-mail-compose-recipient"><label htmlFor="mail-send-bcc">Bcc</label><input id="mail-send-bcc" name="mail-send-bcc" type="text" autoComplete="off" autoFocus={!bcc.trim()} placeholder="Bcc recipients" value={bcc} onChange={event => setBcc(event.target.value)} onBlur={() => { if (!bcc.trim()) setShowBcc(false) }} /></div>}
      <input className="microsoft-mail-compose-subject" aria-label="Subject" name="mail-send-subject" placeholder="Add a subject" value={subject} onChange={event => setSubject(event.target.value)} required />
      <div className="microsoft-mail-format-toolbar" role="toolbar" aria-label="Message formatting">
        {[['bold', 'Bold'], ['italic', 'Italic'], ['underline', 'Underline'], ['insertUnorderedList', 'Bulleted list'], ['insertOrderedList', 'Numbered list']].map(([command, label]) => <button key={command} type="button" title={label} aria-label={label} onMouseDown={event => event.preventDefault()} onClick={() => { bodyEditor.current?.focus(); document.execCommand(command) }}>{label === 'Bulleted list' ? '• List' : label === 'Numbered list' ? '1. List' : label[0]}</button>)}
        <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => void proofreadMessage()} disabled={proofreadBusy || sendBusy}><Icon name="check" size={13} /> {proofreadBusy ? 'Checking…' : 'Proofread with AI'}</button>
      </div>
      {proofreadError && <p className="microsoft-mail-proofread-error" role="alert">{proofreadError}</p>}
      <div ref={bodyEditor} className="microsoft-mail-compose-body" aria-label="Message" role="textbox" aria-multiline="true" contentEditable spellCheck suppressContentEditableWarning onInput={event => { proofreadRequest.current++; setBody(event.currentTarget.innerHTML) }} data-placeholder="Write your message…" />
      <div className="microsoft-mail-compose-attachments"><label><Icon name="upload" size={16} /> Attach files<input type="file" name="mail-attachments" multiple onChange={event => { void addAttachments(event.target.files); event.target.value = '' }} /></label>{attachments.map((file, index) => <span key={`${file.name}-${index}`}>{file.name}<button type="button" aria-label={`Remove ${file.name}`} onClick={() => mailbox.setAttachments(rows => rows.filter((_, row) => row !== index))}>×</button></span>)}</div>
      <div className="microsoft-mail-compose-related"><label htmlFor="mail-send-lead">Related lead</label><select id="mail-send-lead" name="mail-send-lead" value={leadId} onChange={event => setLeadId(event.target.value)} required><option value="">Choose a lead…</option>{leads.map(lead => <option key={lead.id} value={lead.id}>{lead.subject || 'Untitled enquiry'} · {lead.sender || lead.from || lead.id}</option>)}</select></div>
      {error && <p className="microsoft-mail-compose-error" role="alert">{error}</p>}
      <footer><button type="button" className="microsoft-mail-save-draft" disabled={busy || sendBusy} onClick={() => void saveDraft()}>{busy && !sendBusy ? 'Saving…' : 'Save as draft'}</button><button type="submit" disabled={busy || sendBusy}><Icon name="send" size={16} />{sendBusy ? 'Sending…' : busy ? 'Saving…' : 'Send'}</button><span>{sender === 'personal' ? 'Sent from your Outlook account' : 'Sent from the shared mailbox'}</span></footer>
      </form>
      </>}
    </section>
  </div>
}

export default function Mail({ embedded = false }) {
  const mailbox = useSharedMailbox({ embedded, selectFirst: !embedded })
  const { messages, cursor, selected, details, status, hasLoaded, error, busy, allMail, setAllMail,
    composeOpen, setComposeOpen, targetType, setTargetType, targetId, setTargetId, sender, setSender,
    to, setTo, cc, setCc, bcc, setBcc, subject, setSubject, body, setBody, leadId, setLeadId, notice,
    load, refresh, open, download, link, send, setError } = mailbox
  const store = mailbox.store
  const canEditMailRecords = canPerform(store.auth?.user, 'leads.edit', store.config) || canPerform(store.auth?.user, 'opportunities.edit', store.config)
  const canSendLeadMail = canPerform(store.auth?.user, 'leads.edit', store.config)
  const [query, setQuery] = useState('')

  const visibleMessages = useMemo(() => {
    const term = query.trim().toLocaleLowerCase()
    const classified = allMail ? messages : messages.filter(message => message.triage?.classification === 'lead')
    if (!term) return classified
    return classified.filter(message => [message.subject, fromAddress(message), message.bodyPreview]
      .some(value => String(value || '').toLocaleLowerCase().includes(term)))
  }, [messages, query, allMail])
  return <section id={embedded ? 'shared-mail' : undefined} className={`microsoft-mail${embedded ? ' microsoft-mail--embedded' : ' page'}`}>
    <header className="mailbox-head microsoft-mail-head">
      <div><h2>Shared Outlook</h2><p className="hint">Common sales mailbox · Review messages, then link them to a lead or opportunity.</p></div>
    </header>
    <div className="inbox-toolbar microsoft-mail-toolbar">
      <label className="inbox-toolbar-search"><Icon name="search" size={19} /><span className="visually-hidden">Search shared mail</span>
        <input type="search" placeholder="Search sender, subject or message…" value={query} onChange={event => { setQuery(event.target.value); mailbox.setSearch(event.target.value) }} name="shared-mail-search" />
      </label>
      <label className="microsoft-mail-all-toggle"><input type="checkbox" name="shared-mail-all" checked={allMail} onChange={event => setAllMail(event.target.checked)} />All mail</label>
      {canSendLeadMail && <button type="button" className="microsoft-mail-compose-trigger" onClick={() => setComposeOpen(true)}><Icon name="edit" size={17} />Compose</button>}
      <button type="button" className="microsoft-mail-sync" onClick={() => void refresh()} disabled={busy} aria-label="Sync shared inbox" title="Sync"><Icon name="refresh" size={18} />Sync</button>
    </div>
    {error && !composeOpen && <p role="alert" className="err-text microsoft-mail-message">{error}</p>}
    {notice && <p role="status" className="microsoft-mail-message">{notice}</p>}
    {status && !status.sharedMail && <p role="status" className="microsoft-mail-message">The shared mailbox is awaiting server configuration.</p>}

    <div className="microsoft-mail-workspace">
      <section className="microsoft-mail-list-panel" aria-label="Shared mailbox messages">
        <div className="microsoft-mail-list-head" aria-hidden="true"><span>Received</span><span>From</span><span>Subject</span></div>
        <div className="microsoft-mail-list">
          {visibleMessages.map(message => <button type="button" className="microsoft-mail-row" key={message.id} onClick={() => open(message)} aria-pressed={selected?.id === message.id}>
            <span className="microsoft-mail-date">{dateLabel(message.receivedDateTime)}</span>
            <span className="microsoft-mail-sender">{fromAddress(message) || 'Unknown sender'}</span>
            <span className="microsoft-mail-subject"><b>{message.subject || '(no subject)'}</b><small>{message.triage?.classification === 'needs_review' ? 'Needs review · ' : message.triage?.classification === 'not_lead' ? 'Not a lead · ' : ''}{message.bodyPreview || 'No preview available'}</small></span>
          </button>)}
          {!visibleMessages.length && <div className="microsoft-mail-empty"><Icon name="mail" size={24} /><b>{query ? 'No matching messages' : busy ? 'Syncing messages…' : !hasLoaded ? 'Inbox not synced' : 'No messages to show'}</b><span>{query ? 'Try another sender or subject.' : !hasLoaded ? 'Click Sync to load messages from the shared mailbox.' : 'Messages sent to this shared mailbox will appear here.'}</span></div>}
          {cursor && <button type="button" className="microsoft-mail-load-more" onClick={() => void load(cursor)} disabled={busy}>{busy ? 'Loading…' : 'Load more messages'}</button>}
        </div>
      </section>

      <SharedMessageDetails mailbox={mailbox} canEditMailRecords={canEditMailRecords} />
    </div>
    <MailComposeDialog mailbox={mailbox} canSendLeadMail={canSendLeadMail} />
  </section>
}
