import { useEffect, useRef, useState } from 'react'
import { useStore } from './store.jsx'
import { microsoftRequest, fileBase64 } from './microsoftApi.js'
import { syncSharedMailbox } from './mailTriage.js'

export function useSharedMailbox({ embedded = false, selectFirst = false } = {}) {
  const store = useStore()
  const [messages, setMessages] = useState([])
  const [cursor, setCursor] = useState('')
  const [selected, setSelected] = useState(null)
  const [selectionVersion, setSelectionVersion] = useState(0)
  const [details, setDetails] = useState(null)
  const [detailsError, setDetailsError] = useState('')
  const [status, setStatus] = useState(null)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [allMail, setAllMail] = useState(false)
  const [folder, setFolder] = useState('inbox')
  const [search, setSearch] = useState('')
  const [composeOpen, setComposeOpen] = useState(false)
  const [targetType, setTargetType] = useState('lead')
  const [targetId, setTargetId] = useState('')
  const [sender, setSender] = useState('shared')
  const [to, setTo] = useState(''), [cc, setCc] = useState(''), [bcc, setBcc] = useState(''), [subject, setSubject] = useState(''), [body, setBody] = useState(''), [leadId, setLeadId] = useState('')
  const [notice, setNotice] = useState('')
  const [draftId, setDraftId] = useState('')
  const [attachments, setAttachments] = useState([])
  const loadedContext = useRef(null)
  const loadRequest = useRef(0)

  const load = async (next = '') => {
    if (sender === 'shared' && !status?.sharedMail) { setHasLoaded(true); return }
    if (sender === 'personal' && !status?.personalMail) { setHasLoaded(true); return }
    const requestId = ++loadRequest.current
    setBusy(true); setError('')
    try {
      const result = await microsoftRequest('folder', { folder, sender, cursor: next, search })
      if (requestId !== loadRequest.current) return
      const rows = result.messages || []
      setMessages(previous => next ? [...previous, ...rows.filter(row => !previous.some(item => item.id === row.id))] : rows)
      setCursor(result.next || '')
      setHasLoaded(true)
      if (!next) setSelected(current => {
        if (current && rows.some(row => row.id === current.id)) return current
        return selectFirst ? rows[0] || null : null
      })
    } catch (reason) { if (requestId === loadRequest.current) setError(reason.message) }
    finally { if (requestId === loadRequest.current) setBusy(false) }
  }
  const refresh = async () => {
    setBusy(true); setError(''); setNotice('')
    try {
      if (folder !== 'inbox' || sender !== 'shared') {
        await load()
        return { ok: true, reviewed: 0, imported: 0 }
      }
      const result = embedded && store.syncLeadInbox ? await store.syncLeadInbox() : await syncSharedMailbox()
      if (result.ok === false) throw new Error(result.error || 'Shared mailbox sync failed.')
      if (result.initialized) setNotice('Sync is ready. Existing messages were skipped; new mail will be checked next time.')
      else setNotice(`Checked ${result.reviewed} new message${result.reviewed === 1 ? '' : 's'}; ${result.imported} added to Lead Inbox${result.needsReview ? `; ${result.needsReview} need review` : ''}.${result.errors?.length ? ` ${result.errors.length} could not be checked; click Sync again to retry.` : ''}`)
      const statusRequest = microsoftRequest('status')
      await load()
      const mailboxStatus = await statusRequest
      setStatus(mailboxStatus)
      if (!mailboxStatus.personalMail) setSender(current => current === 'personal' ? 'shared' : current)
      if (result.errors?.length) setError(result.errors.slice(0, 3).join(' · '))
      return result
    } catch (reason) { setError(reason.message); return { ok: false, error: reason.message } }
    finally { setBusy(false) }
  }
  const open = message => { setSelected(message); setSelectionVersion(version => version + 1); setDetails(null); setDetailsError(''); setError('') }
  const clearSelection = () => { setSelected(null); setDetails(null); setDetailsError('') }
  const retryDetails = () => { setDetailsError(''); setSelectionVersion(version => version + 1) }
  const download = async attachment => {
    try {
      const response = await microsoftRequest('attachment', { id: selected.id, sender: selected.mailAccount || sender, attachmentId: attachment.id }, { raw: true })
      const url = URL.createObjectURL(await response.blob())
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = attachment.name || 'attachment'; anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (reason) { setError(reason.message) }
  }
  const link = async event => {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const result = await microsoftRequest('link', { messageId: selected.id, targetType, targetId }, { method: 'POST' })
      setSelected(message => ({ ...message, link: result.link }))
      setMessages(rows => rows.map(row => row.id === selected.id ? { ...row, link: result.link } : row))
      setNotice('Email linked to the selected record.')
    } catch (reason) { setError(reason.message) }
    finally { setBusy(false) }
  }
  const mailAction = async (action, message = selected, value = {}) => {
    if (!message?.id) return
    if (action === 'reply' || action === 'forward') {
      const sourceAddress = message.from?.emailAddress?.address || ''
      setSender(message.mailAccount || sender)
      setTo(action === 'reply' ? sourceAddress : '')
      setCc(''); setBcc(''); setSubject(`${action === 'reply' ? 'Re' : 'Fwd'}: ${String(message.subject || '').replace(/^(re|fwd):\s*/i, '')}`)
      setBody(action === 'forward' ? `---------- Forwarded message ----------\nFrom: ${sourceAddress}\nSubject: ${message.subject || '(no subject)'}\n\n${message.bodyPreview || ''}\n\n` : '')
      setDraftId(''); setLeadId(message.link?.targetType === 'lead' ? message.link.targetId : '')
      setComposeOpen(true); return
    }
    setBusy(true); setError('')
    try {
      await microsoftRequest('mailAction', { sender: message.mailAccount || sender, messageId: message.id, action, ...value }, { method: 'POST' })
      if (['archive', 'spam', 'trash', 'restore'].includes(action)) {
        setMessages(rows => rows.filter(row => row.id !== message.id))
        setSelected(null); setDetails(null)
      } else {
        setMessages(rows => rows.map(row => row.id === message.id ? { ...row, isRead: action === 'read' ? true : action === 'unread' ? false : row.isRead,
          flag: ['star', 'unstar'].includes(action) ? { flagStatus: action === 'star' ? 'flagged' : 'notFlagged' } : row.flag } : row))
        setDetails(current => current ? { ...current, message: { ...current.message,
          isRead: action === 'read' ? true : action === 'unread' ? false : current.message.isRead,
          flag: ['star', 'unstar'].includes(action) ? { flagStatus: action === 'star' ? 'flagged' : 'notFlagged' } : current.message.flag } } : current)
        if (folder === 'starred' && action === 'unstar') setMessages(rows => rows.filter(row => row.id !== message.id))
        if (action === 'reply' || action === 'forward') await load()
      }
    } catch (reason) { setError(reason.message) }
    finally { setBusy(false) }
  }
  const editDraft = message => {
    const parseRecipients = values => (values || []).map(row => row.emailAddress?.address).filter(Boolean).join(', ')
    setSender(message.mailAccount || sender); setDraftId(message.id)
    setTo(parseRecipients(message.toRecipients)); setCc(parseRecipients(message.ccRecipients)); setBcc(parseRecipients(message.bccRecipients))
    setSubject(message.subject || '')
    setBody(String(message.body?.content || '').replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/(p|div)>/gi, '\n').replace(/<[^>]*>/g, ''))
    setLeadId(message.link?.targetType === 'lead' ? message.link.targetId : '')
    setComposeOpen(true)
  }
  const send = async event => {
    event.preventDefault()
    if (!to.trim() || !subject.trim() || !body.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').trim()) {
      setError('Add at least one recipient, a subject, and a message.')
      return
    }
    setError(''); setNotice('')
    try {
      const savedId = await saveDraft()
      if (!savedId) return
      setBusy(true)
      await microsoftRequest('draftSend', { sender, draftId: savedId }, { method: 'POST' })
      setNotice('Outlook accepted the message for sending. Delivery is not yet confirmed.')
      setTo(''); setCc(''); setBcc(''); setSubject(''); setBody(''); setLeadId(''); setDraftId(''); setAttachments([])
      setComposeOpen(false)
      await load()
    } catch (reason) { setError(reason.message) }
    finally { setBusy(false) }
  }
  const saveDraft = async () => {
    if (!to.trim() && !cc.trim() && !bcc.trim() && !subject.trim() && !body.trim() && !attachments.length) return null
    setBusy(true); setError('')
    try {
      const result = await microsoftRequest('draftSave', { sender, draftId, to, cc, bcc, subject, body, leadId,
        attachments: attachments.map(({ name, contentType, contentBytes }) => ({ name, contentType, contentBytes })), replaceAttachments: attachments.some(file => file.pending) }, { method: 'POST' })
      setDraftId(result.id)
      setAttachments(files => files.some(file => file.pending) ? files.map(({ pending, ...file }) => file) : files)
      setNotice('Draft saved to Outlook.')
      return result.id
    } catch (reason) { setError(reason.message); return null }
    finally { setBusy(false) }
  }
  const addAttachments = async files => {
    try {
      const incoming = Array.from(files || [])
      if (attachments.length + incoming.length > 5 || incoming.some(file => file.size > 3 * 1024 * 1024)) throw new Error('Attach up to five files of 3 MB each.')
      const encoded = await Promise.all(incoming.map(async file => ({ name: file.name, contentType: file.type, contentBytes: await fileBase64(file), pending: true })))
      setAttachments(current => [...current, ...encoded])
    } catch (reason) { setError(reason.message) }
  }

  useEffect(() => {
    let active = true
    microsoftRequest('status').then(result => {
      if (!active) return
      setStatus(result)
      if (!result.personalMail) setSender(current => current === 'personal' ? 'shared' : current)
      if (!result.sharedMail && !result.personalMail) setHasLoaded(true)
    }).catch(reason => { if (active) setError(reason.message) })
    return () => { active = false }
  }, [])
  useEffect(() => {
    if (!status?.sharedMail && !status?.personalMail) return undefined
    const context = `${folder}\u0000${sender}\u0000${search}\u0000${Boolean(status.sharedMail)}\u0000${Boolean(status.personalMail)}`
    if (loadedContext.current === context) return undefined
    const changed = loadedContext.current !== null
    if (changed) {
      loadRequest.current += 1
      setBusy(false)
      setSelected(null)
      setDetails(null)
    }
    const timer = setTimeout(() => {
      loadedContext.current = context
      setCursor('')
      void load()
    }, search ? 350 : 0)
    return () => clearTimeout(timer)
  }, [folder, sender, search, status?.sharedMail, status?.personalMail])
  useEffect(() => {
    if (!selected) { setDetails(null); setDetailsError(''); return undefined }
    let active = true
    setDetails(null)
    setDetailsError('')
    microsoftRequest('message', { id: selected.id, sender: selected.mailAccount || sender }).then(result => { if (active) setDetails(result) })
      .catch(reason => { if (active) { setDetailsError(reason.message || 'Could not load this message.'); setError(reason.message) } })
    return () => { active = false }
  }, [selected?.id, selectionVersion])

  return { store, messages, cursor, selected, details, detailsError, retryDetails, status, hasLoaded, error, busy, allMail, setAllMail, folder, setFolder, search, setSearch,
    composeOpen, setComposeOpen, targetType, setTargetType, targetId, setTargetId, sender, setSender,
    to, setTo, cc, setCc, bcc, setBcc, subject, setSubject, body, setBody, leadId, setLeadId, notice, draftId, setDraftId, attachments, setAttachments, addAttachments, saveDraft,
    load, refresh, open, clearSelection, download, link, send, mailAction, editDraft, setError }
}
