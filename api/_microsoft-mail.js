import { createMicrosoftGraph } from './_microsoft-graph.js'

const email = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim())
const recipients = value => String(value || '').split(',').map(item => item.trim()).filter(Boolean)
const addressRows = value => recipients(value).map(address => ({ emailAddress: { address } }))
const safeHtmlText = value => String(value || '').slice(0, 100000)
  .replace(/<(script|style|iframe|object|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
  .replace(/<!--[^]*?-->/g, '')
  .replace(/<\/?([a-z0-9]+)\b[^>]*>/gi, (tag, rawName) => {
    const name = rawName.toLowerCase()
    if (!['b', 'strong', 'i', 'em', 'u', 'br', 'p', 'div', 'ul', 'ol', 'li'].includes(name)) return tag.replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return tag.startsWith('</') ? `</${name}>` : `<${name}>`
  })
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }) }
const enc = encodeURIComponent
const GRAPH = 'https://graph.microsoft.com/v1.0'
const FOLDER_IDS = { inbox: 'inbox', sent: 'sentitems', drafts: 'drafts', archive: 'archive', spam: 'junkemail', trash: 'deleteditems' }

export function createMicrosoftMail(config, fetcher = fetch) {
  const graph = createMicrosoftGraph(config, fetcher)
  const base = `/users/${enc(config.mailbox)}`
  const inbox = `${base}/mailFolders/inbox/messages`
  const deltaPath = `${inbox}/delta?$top=50&$select=id,subject,from,receivedDateTime,bodyPreview,hasAttachments,isRead,conversationId`
  const ensure = () => { if (!email(config.mailbox)) throw Object.assign(new Error('The shared mailbox is not configured.'), { status: 503 }) }
  const rootFor = accessToken => accessToken ? '/me' : base
  const requestFor = async (path, accessToken = '', options = {}) => {
    if (!accessToken) return graph.request(path, options)
    if (!path.startsWith('/') || path.startsWith('//')) fail('Invalid Microsoft Graph path.')
    const jsonBody = options.body != null && typeof options.body === 'object' && !Buffer.isBuffer(options.body)
    const response = await fetcher(`${GRAPH}${path}`, { method: options.method || 'GET',
      headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'IdType="ImmutableId"', ...(jsonBody ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
      ...(options.body == null ? {} : { body: typeof options.body === 'string' || Buffer.isBuffer(options.body) ? options.body : JSON.stringify(options.body) }),
      signal: AbortSignal.timeout(30_000) })
    if (!response.ok) {
      const failure = await response.json().catch(() => ({}))
      const code = typeof failure.error?.code === 'string' && /^[A-Za-z0-9_.-]{1,100}$/.test(failure.error.code) ? failure.error.code : ''
      throw Object.assign(new Error(`Microsoft Graph returned HTTP ${response.status}.`), { status: response.status === 403 ? 503 : 502, graphStatus: response.status, graphCode: code })
    }
    if (options.raw) return response
    if ([202, 204].includes(response.status)) return null
    return response.json()
  }
  const validId = id => { if (!id || String(id).length > 600) fail('Invalid message ID.'); return enc(id) }
  const checkedFiles = files => {
    if (!Array.isArray(files) || files.length > 5 || files.some(file => !file.name || !file.contentBytes || Buffer.byteLength(file.contentBytes, 'base64') > 3 * 1024 * 1024)) fail('Attach up to five files of 3 MB each.')
    return files
  }
  const messageSelect = 'id,subject,from,toRecipients,ccRecipients,bccRecipients,receivedDateTime,sentDateTime,bodyPreview,hasAttachments,isRead,flag,conversationId,parentFolderId'
  const listFolder = async (folder, cursor = '', search = '', accessToken = '') => {
    if (accessToken) { /* delegated personal mailbox */ } else ensure()
    const root = rootFor(accessToken)
    const folderPath = folder === 'starred' ? `${root}/messages` : `${root}/mailFolders/${FOLDER_IDS[folder] || ''}/messages`
    if (folder !== 'starred' && !FOLDER_IDS[folder]) fail('Unsupported mail folder.')
    let path = folderPath
    if (!cursor) {
      const params = new URLSearchParams({ '$top': '25', '$orderby': 'receivedDateTime desc', '$select': messageSelect })
      if (folder === 'starred') params.set('$filter', "flag/flagStatus eq 'flagged'")
      if (search.trim()) params.set('$search', `"${search.trim().replace(/["\\]/g, ' ').slice(0, 100)}"`)
      path += `?${params}`
    } else {
      try { path = Buffer.from(cursor, 'base64url').toString('utf8') } catch { fail('Invalid mail page.') }
      if (!path.startsWith(`${folderPath}?`) || path.length > 4000) fail('Invalid mail page.')
    }
    const result = await requestFor(path, accessToken, { headers: search.trim() && !cursor ? { ConsistencyLevel: 'eventual' } : {} })
    const next = result['@odata.nextLink'] ? new URL(result['@odata.nextLink']) : null
    const origin = GRAPH
    if (next && (next.origin !== origin || !next.pathname.startsWith(`/v1.0${folderPath}`))) fail('Invalid mail page.')
    return { messages: result.value || [], next: next ? Buffer.from(next.pathname.slice('/v1.0'.length) + next.search).toString('base64url') : '' }
  }
  const getFor = async (id, accessToken = '') => requestFor(`${rootFor(accessToken)}/messages/${validId(id)}?$select=${messageSelect},body`, accessToken,
    { headers: { Prefer: 'IdType="ImmutableId", outlook.body-content-type="text"' } })
  const setAction = async (id, action, value, accessToken = '') => {
    const root = rootFor(accessToken), messageId = validId(id), path = `${root}/messages/${messageId}`
    if (action === 'read' || action === 'unread') return requestFor(path, accessToken, { method: 'PATCH', body: { isRead: action === 'read' } })
    if (action === 'star' || action === 'unstar') return requestFor(path, accessToken, { method: 'PATCH', body: { flag: { flagStatus: action === 'star' ? 'flagged' : 'notFlagged' } } })
    const destinations = { archive: 'archive', spam: 'junkemail', trash: 'deleteditems', restore: 'inbox' }
    if (destinations[action]) return requestFor(`${path}/move`, accessToken, { method: 'POST', body: { destinationId: destinations[action] } })
    if (action === 'reply') return requestFor(`${path}/reply`, accessToken, { method: 'POST', body: { comment: String(value || '').slice(0, 50000) } })
    if (action === 'forward') return requestFor(`${path}/forward`, accessToken, { method: 'POST', body: { comment: String(value?.comment || '').slice(0, 50000), toRecipients: addressRows(value?.to) } })
    fail('Unsupported mail action.')
  }
  const saveDraft = async ({ id = '', to, cc = '', bcc = '', subject = '', body = '', attachments: files = [], replaceAttachments = false }, accessToken = '') => {
    if (!accessToken) ensure()
    const root = rootFor(accessToken), draftId = id ? validId(id) : ''
    const draft = { subject: String(subject).slice(0, 500), body: { contentType: 'HTML', content: safeHtmlText(body) },
      toRecipients: addressRows(to), ccRecipients: addressRows(cc), bccRecipients: addressRows(bcc) }
    let saved = draftId ? await requestFor(`${root}/messages/${draftId}`, accessToken, { method: 'PATCH', body: draft }) : await requestFor(`${root}/messages`, accessToken, { method: 'POST', body: draft })
    const nextId = saved?.id || id
    if (!nextId) fail('Outlook did not return the saved draft ID.', 502)
    if (replaceAttachments || files.length) {
      checkedFiles(files)
      for (const file of files) await requestFor(`${root}/messages/${validId(nextId)}/attachments`, accessToken, { method: 'POST', body: {
        '@odata.type': '#microsoft.graph.fileAttachment', name: String(file.name).slice(0, 255), contentType: file.contentType || 'application/octet-stream', contentBytes: file.contentBytes,
      } })
    }
    return { id: nextId }
  }
  const sendDraft = async (id, accessToken = '') => {
    if (!accessToken) ensure()
    await requestFor(`${rootFor(accessToken)}/messages/${validId(id)}/send`, accessToken, { method: 'POST' })
    return { accepted: true }
  }
  const deleteMessage = async (id, accessToken = '') => {
    if (!accessToken) ensure()
    await requestFor(`${rootFor(accessToken)}/messages/${validId(id)}`, accessToken, { method: 'DELETE' })
    return { deleted: true }
  }
  const safeCursor = (cursor, initial = `${inbox}?$top=25&$orderby=receivedDateTime%20desc&$select=id,subject,from,receivedDateTime,bodyPreview,hasAttachments,isRead,conversationId`) => {
    if (!cursor) return initial
    let path
    try { path = Buffer.from(cursor, 'base64url').toString('utf8') } catch { fail('Invalid mail page.') }
    if (!path.startsWith(`${inbox}?`) || path.length > 4000) fail('Invalid mail page.')
    return path
  }
  const page = async (path, cursor = '') => {
    const result = await graph.request(safeCursor(cursor, path))
    const next = result['@odata.nextLink'] ? new URL(result['@odata.nextLink']) : null
    if (next && (next.origin !== 'https://graph.microsoft.com' || !next.pathname.startsWith(`/v1.0${inbox}`))) fail('Invalid mail page.')
    return { messages: result.value || [], next: next ? Buffer.from(next.pathname.slice('/v1.0'.length) + next.search).toString('base64url') : '' }
  }
  const delta = async cursor => {
    ensure()
    const path = cursor || deltaPath
    if (cursor && !String(cursor).startsWith(`${inbox}/delta?`)) fail('Invalid mail delta token.')
    const result = await graph.request(path)
    const valid = value => {
      if (!value) return ''
      const url = new URL(value)
      if (url.origin !== 'https://graph.microsoft.com' || !url.pathname.startsWith(`/v1.0${inbox}/delta`)) fail('Invalid mail delta page.')
      return `${url.pathname.slice('/v1.0'.length)}${url.search}`
    }
    return { messages: result.value || [], next: valid(result['@odata.nextLink']), delta: valid(result['@odata.deltaLink']) }
  }
  const createSubscription = async () => {
    ensure()
    if (!config.mailWebhookUrl || !config.mailWebhookSecret) throw Object.assign(new Error('Shared-mail notifications are not configured.'), { status: 503 })
    return graph.request('/subscriptions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: {
      changeType: 'created', notificationUrl: config.mailWebhookUrl, resource: `/users/${enc(config.mailbox)}/mailFolders('inbox')/messages`,
      expirationDateTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(), clientState: config.mailWebhookSecret,
    } })
  }
  const renewSubscription = (id, expirationDateTime) => graph.request(`/subscriptions/${enc(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: { expirationDateTime } })
  const list = async (folder = 'inbox', cursor = '') => {
    ensure()
    if (folder !== 'inbox') fail('Unsupported mail folder.')
    return page(`${inbox}?$top=25&$orderby=receivedDateTime%20desc&$select=id,subject,from,receivedDateTime,bodyPreview,hasAttachments,isRead,conversationId`, cursor)
  }
  const listSince = async (since, cursor = '') => {
    ensure()
    const timestamp = new Date(since)
    if (!Number.isFinite(timestamp.valueOf())) fail('Invalid mail sync checkpoint.')
    const query = new URLSearchParams({ '$top': '25', '$orderby': 'receivedDateTime asc', '$filter': `receivedDateTime ge ${timestamp.toISOString()}`,
      '$select': 'id,subject,from,receivedDateTime,bodyPreview,hasAttachments,isRead,conversationId' })
    return page(`${inbox}?${query}`, cursor)
  }
  const get = async id => {
    ensure()
    if (!id || String(id).length > 600) fail('Invalid message ID.')
    return graph.request(`${inbox}/${enc(id)}?$select=id,subject,from,toRecipients,receivedDateTime,body,bodyPreview,hasAttachments,conversationId`, { headers: { Prefer: 'IdType="ImmutableId", outlook.body-content-type="text"' } })
  }
  const attachments = async id => {
    await get(id)
    const result = await graph.request(`${inbox}/${enc(id)}/attachments?$select=id,name,contentType,size,isInline`)
    return (result.value || []).map(({ id: itemId, name, contentType, size, isInline }) => ({ id: itemId, name, contentType, size, isInline }))
  }
  const attachmentsFor = async (id, accessToken = '') => {
    await getFor(id, accessToken)
    const result = await requestFor(`${rootFor(accessToken)}/messages/${validId(id)}/attachments?$select=id,name,contentType,size,isInline`, accessToken)
    return (result.value || []).map(({ id: itemId, name, contentType, size, isInline }) => ({ id: itemId, name, contentType, size, isInline }))
  }
  const attachmentFor = async (id, attachmentId, accessToken = '') => {
    await getFor(id, accessToken)
    const result = await requestFor(`${rootFor(accessToken)}/messages/${validId(id)}/attachments/${validId(attachmentId)}`, accessToken)
    if (!result.contentBytes || result.size > 10 * 1024 * 1024) fail('This attachment cannot be downloaded.')
    return { name: result.name, mimeType: result.contentType || 'application/octet-stream', bytes: Buffer.from(result.contentBytes, 'base64') }
  }
  const attachment = async (id, attachmentId) => {
    await get(id)
    const result = await graph.request(`${inbox}/${enc(id)}/attachments/${enc(attachmentId)}`)
    if (!result.contentBytes || result.size > 10 * 1024 * 1024) fail('This attachment cannot be downloaded.')
    return { name: result.name, mimeType: result.contentType || 'application/octet-stream', bytes: Buffer.from(result.contentBytes, 'base64') }
  }
  const forLead = async id => {
    const message = await get(id)
    const files = (await attachments(id)).filter(file => !file.isInline)
    if (files.length > 10) fail('This email has more than ten attachments and could not be imported as a lead.')
    let total = 0
    const copied = []
    for (const file of files) {
      const original = await attachment(id, file.id)
      total += original.bytes.length
      if (total > 6 * 1024 * 1024) fail('This email’s attachments exceed the 6 MB lead limit and could not be imported.')
      copied.push({ name: safeAttachmentName(original.name || file.name), size: original.bytes.length,
        type: original.mimeType, dataUrl: `data:${original.mimeType};base64,${original.bytes.toString('base64')}` })
    }
    return { message, attachments: copied }
  }
  const forAutoTriage = async id => {
    const message = await get(id)
    const files = (await attachments(id)).filter(file => !file.isInline)
    const copied = [], errors = []
    if (files.length > 10) errors.push('More than ten attachments; remaining files were not scanned.')
    let total = 0
    for (const file of files.slice(0, 10)) {
      try {
        if (Number(file.size) > 6 * 1024 * 1024 || total + Number(file.size || 0) > 6 * 1024 * 1024) throw new Error('Attachment exceeds the 6 MB scan limit.')
        const original = await attachment(id, file.id)
        total += original.bytes.length
        if (total > 6 * 1024 * 1024) throw new Error('Attachments exceed the 6 MB scan limit.')
        copied.push({ name: safeAttachmentName(original.name || file.name), size: original.bytes.length, type: original.mimeType,
          dataUrl: `data:${original.mimeType};base64,${original.bytes.toString('base64')}` })
      } catch (error) { errors.push(`${safeAttachmentName(file.name)}: ${error.message || 'could not be read'}`) }
    }
    return { message, attachments: copied, attachmentErrors: errors }
  }
  const send = async ({ to, cc = '', bcc = '', subject, body, attachments: files = [] }, accessToken = '') => {
    ensure()
    const toRows = recipients(to), ccRows = recipients(cc), bccRows = recipients(bcc)
    if (!toRows.length || ![...toRows, ...ccRows, ...bccRows].every(email)) fail('Enter valid email recipients.')
    if (!String(subject || '').trim() || !String(body || '').trim()) fail('Enter a subject and message.')
    if (files.length > 5 || files.some(file => !file.name || !file.contentBytes || Buffer.byteLength(file.contentBytes, 'base64') > 3 * 1024 * 1024)) fail('Attach up to five files of 3 MB each.')
    const path = accessToken ? '/me/sendMail' : `${base}/sendMail`
    const message = { subject: String(subject).slice(0, 500), body: { contentType: 'Text', content: String(body).slice(0, 50000) },
      toRecipients: addressRows(to), ccRecipients: addressRows(cc), bccRecipients: addressRows(bcc),
      ...(files.length ? { attachments: files.map(file => ({ '@odata.type': '#microsoft.graph.fileAttachment', name: file.name, contentType: file.contentType || 'application/octet-stream', contentBytes: file.contentBytes })) } : {}) }
    if (accessToken) {
      const response = await fetcher(`https://graph.microsoft.com/v1.0${path}`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ message, saveToSentItems: true }), signal: AbortSignal.timeout(30_000) })
      if (!response.ok) throw Object.assign(new Error(`Personal Outlook send failed (HTTP ${response.status}).`), { status: 502 })
    } else await graph.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: { message, saveToSentItems: true } })
    return { accepted: true }
  }
  const reply = async (id, comment) => {
    ensure()
    if (!id || String(id).length > 600) fail('Invalid message ID.')
    if (!String(comment || '').trim()) fail('Enter a reply.')
    await graph.request(`${inbox}/${enc(id)}/reply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: { comment: String(comment).slice(0, 50000) } })
    return { accepted: true }
  }
  return { list, listFolder, listSince, delta, createSubscription, renewSubscription, get, getFor, setAction, saveDraft, sendDraft, deleteMessage, attachments, attachmentsFor, attachmentFor, attachment, forLead, forAutoTriage, send, reply }
}

const safeAttachmentName = value => String(value || 'attachment').replace(/[\\/\r\n\0]/g, '_').slice(0, 255)
