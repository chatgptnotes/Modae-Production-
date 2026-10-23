import { createHash, timingSafeEqual } from 'node:crypto'
import { getAdminSupabaseClient } from './_supabase-client.js'
import { activeProfile } from './_user-roster.js'
import { createWorkspaceReader } from '../src/server/workspace.js'
import { canAccessPage, canPerform, effectiveAccess } from '../src/accessPolicy.js'
import { assertWorkspaceRowWrite, projectWorkspace } from '../src/workspaceAccess.js'
import { createMicrosoftGraph, microsoftConfig } from './_microsoft-graph.js'
import { createMicrosoftDocuments } from './_microsoft-documents.js'
import { createMicrosoftMail } from './_microsoft-mail.js'
import { createPersonalMicrosoft } from './_microsoft-personal.js'
import { classifySharedMail } from './_microsoft-auto-triage.js'

const fail = (message, status = 403) => { throw Object.assign(new Error(message), { status }) }
const clean = value => String(value || '').trim()
const linkId = (mailbox, messageId) => createHash('sha256').update(`${mailbox}\n${messageId}`).digest('hex')
const safeName = value => clean(value).replace(/[\\/\r\n\0]/g, '_').slice(0, 180)
const importedLeadId = (mailbox, messageId) => `LD-M365-${createHash('sha256').update(`${mailbox}\n${messageId}`).digest('hex').slice(0, 32)}`
const syncCheckpointId = mailbox => linkId(mailbox, '__lead_import_checkpoint__')
const deltaStateId = mailbox => linkId(mailbox, '__delta_sync_state__')
const subscriptionStateId = mailbox => linkId(mailbox, '__notification_subscription__')

export function createMicrosoftHandlers({ getClient = getAdminSupabaseClient, getReader = createWorkspaceReader, invalidate = () => {},
  config = microsoftConfig(), graph = createMicrosoftGraph(config), mail = createMicrosoftMail(config), personal = createPersonalMicrosoft(config) } = {}) {
  const documents = createMicrosoftDocuments(graph)
  const auth = async req => {
    const token = clean(req.headers?.authorization).replace(/^Bearer\s+/i, '')
    if (!token) fail('Sign in to WinTrack first.', 401)
    const client = getClient()
    if (!client) fail('WinTrack authentication is not configured.', 503)
    const result = await client.auth.getUser(token)
    if (result.error || !result.data?.user) fail('Your WinTrack session has expired.', 401)
    const profile = await activeProfile(client, result.data.user)
    if (!profile) fail('This WinTrack account is not active.', 403)
    return { client, authUser: result.data.user, profile }
  }
  const stateFor = async () => {
    const reader = getReader()
    if (!reader) fail('The workspace is unavailable.', 503)
    return reader()
  }
  const canLink = (profile, state, targetType, targetId) => {
    const projected = projectWorkspace(state, profile)
    const admin = effectiveAccess(profile, state.config || {}).isAdmin
    const commercial = canPerform(profile, 'commercial.view', state.config || {})
    if (targetType === 'lead') {
      const lead = projected.leads?.find(row => row.id === targetId)
      if (!lead || !canPerform(profile, 'leads.edit', state.config || {}) || !admin && !commercial && lead.assignedOwner !== profile.role) fail('You cannot link mail to this lead.')
      return
    }
    if (targetType === 'opportunity') {
      const opportunity = projected.opportunities?.find(row => row.id === targetId)
      if (!opportunity || !canPerform(profile, 'opportunities.edit', state.config || {}) || !admin && !commercial && opportunity.owner !== profile.role) fail('You cannot link mail to this opportunity.')
      return
    }
    fail('Choose a lead or opportunity.', 400)
  }
  const visibleLink = (profile, state, link) => {
    if (!link) return null
    const rows = projectWorkspace(state, profile)
    if (link.targetType === 'lead' && rows.leads?.some(row => row.id === link.targetId)) return link
    if (link.targetType === 'opportunity' && rows.opportunities?.some(row => row.id === link.targetId)) return link
    return null
  }
  const readLink = async (client, messageId) => {
    const id = linkId(config.mailbox, messageId)
    const result = await client.from('records').select('id,data,rev').eq('entity', 'mail_links').eq('id', id).is('deleted_at', null).maybeSingle()
    if (result.error) throw result.error
    return result.data
  }
  const mailAccount = async (sender, authUser) => {
    if (sender === 'shared') {
      if (!config.mailbox) fail('The shared mailbox is not configured.', 503)
      return { access: '', mailboxKey: config.mailbox }
    }
    if (sender === 'personal') return { access: await personal.access(authUser.id), mailboxKey: `personal:${authUser.id}` }
    fail('Choose a mail account.', 400)
  }
  const readAccountMailLink = async (client, mailboxKey, messageId) => {
    const id = linkId(mailboxKey, messageId)
    const result = await client.from('records').select('id,data,rev').eq('entity', 'mail_links').eq('id', id).is('deleted_at', null).maybeSingle()
    if (result.error) throw result.error
    return result.data
  }
  const saveDraftMailLink = async (client, authUser, profile, state, mailboxKey, messageId, leadId) => {
    if (!leadId) return null
    canLink(profile, state, 'lead', leadId)
    const current = await readAccountMailLink(client, mailboxKey, messageId)
    if (current?.data?.targetType && (current.data.targetType !== 'lead' || current.data.targetId !== leadId)) fail('This draft is linked to another record.', 409)
    const id = linkId(mailboxKey, messageId)
    const data = { ...(current?.data || {}), mailbox: mailboxKey, messageId, kind: 'draft_link', targetType: 'lead', targetId: leadId,
      linkedBy: current?.data?.linkedBy || authUser.id, linkedAt: current?.data?.linkedAt || new Date().toISOString(), updatedAt: new Date().toISOString() }
    const saved = await client.rpc('save_rows', { p_entity: 'mail_links', p_rows: [{ id, data, rev: Number(current?.rev) || 0, by: authUser.id }] })
    if (saved.error) throw saved.error
    if (saved.data?.conflicts?.length || !saved.data?.accepted?.includes(id)) fail('The draft link changed in another session. Save again.', 409)
    return data
  }
  const readCheckpoint = async client => {
    const result = await client.from('records').select('id,data,rev,deleted_at').eq('entity', 'mail_links').eq('id', syncCheckpointId(config.mailbox)).maybeSingle()
    if (result.error) throw result.error
    if (result.data?.deleted_at) fail('The shared-mail sync checkpoint was deleted. Contact an administrator.', 409)
    return result.data
  }
  const saveCheckpoint = async (client, checkpoint, receivedAt, actorId) => {
    const timestamp = Date.parse(receivedAt)
    const currentTimestamp = Date.parse(checkpoint?.data?.lastReceivedAt || '')
    if (!Number.isFinite(timestamp)) return checkpoint
    if (Number.isFinite(currentTimestamp) && timestamp <= currentTimestamp) return checkpoint
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const data = { mailbox: config.mailbox, kind: 'lead_import_checkpoint', lastReceivedAt: receivedAt }
      const saved = await client.rpc('save_rows', { p_entity: 'mail_links', p_rows: [{ id: syncCheckpointId(config.mailbox), data, rev: Number(checkpoint?.rev) || 0, by: actorId }] })
      if (saved.error) throw saved.error
      if (!saved.data?.conflicts?.length && saved.data?.accepted?.includes(syncCheckpointId(config.mailbox))) {
        return { id: syncCheckpointId(config.mailbox), data, rev: (Number(checkpoint?.rev) || 0) + 1 }
      }
      checkpoint = await readCheckpoint(client)
      const newer = Date.parse(checkpoint?.data?.lastReceivedAt || '')
      if (Number.isFinite(newer) && newer >= timestamp) return checkpoint
    }
    fail('Another inbox sync is running. Click Sync again in a moment.', 409)
  }
  const saveImportedLink = async (client, messageId, leadId, actorId) => {
    const id = linkId(config.mailbox, messageId)
    const existing = await readLink(client, messageId)
    if (existing) {
      if (existing.data?.targetType === 'lead' && existing.data?.targetId === leadId) return
      fail('This email is already linked to another record. Review it in Shared Outlook.', 409)
    }
    const data = { messageId, mailbox: config.mailbox, targetType: 'lead', targetId: leadId,
      linkedBy: actorId, linkedAt: new Date().toISOString(), importedFromMailbox: true }
    const saved = await client.rpc('save_rows', { p_entity: 'mail_links', p_rows: [{ id, data, rev: 0, by: actorId }] })
    if (saved.error) throw saved.error
    if (saved.data?.conflicts?.length || !saved.data?.accepted?.includes(id)) {
      const current = await readLink(client, messageId)
      if (current?.data?.targetType === 'lead' && current.data?.targetId === leadId) return
      fail('This email was linked in another session. Click Sync again.', 409)
    }
  }
  const importMailboxLeads = async (client, authUser, profile, state) => {
    if (!canPerform(profile, 'leads.create', state.config || {}) || !canAccessPage(profile, 'inbox', state.config || {})) {
      fail('You do not have permission to sync email into Lead Inbox.')
    }
    let checkpoint = await readCheckpoint(client)
    if (!checkpoint) {
      const latest = await mail.list('inbox')
      const baseline = latest.messages?.[0]?.receivedDateTime || new Date().toISOString()
      const data = { mailbox: config.mailbox, kind: 'lead_import_checkpoint', lastReceivedAt: baseline }
      const saved = await client.rpc('save_rows', { p_entity: 'mail_links', p_rows: [{ id: syncCheckpointId(config.mailbox), data, rev: 0, by: authUser.id }] })
      if (saved.error) throw saved.error
      checkpoint = saved.data?.accepted?.includes(syncCheckpointId(config.mailbox))
        ? { id: syncCheckpointId(config.mailbox), data, rev: 1 }
        : await readCheckpoint(client)
      if (!checkpoint) fail('Could not initialize shared-mail sync. Click Sync again.', 409)
      return { initialized: true, imported: 0, alreadyImported: 0, errors: [], hasMore: false }
    }

    const overlap = new Date(Date.parse(checkpoint.data?.lastReceivedAt || '') - 60_000).toISOString()
    let cursor = ''
    let pages = 0
    let imported = 0
    let alreadyImported = 0
    const errors = []
    while (pages < 20) {
      const page = await mail.listSince(overlap, cursor)
      pages += 1
      for (const message of page.messages || []) {
        const messageId = clean(message.id)
        if (!messageId || !Number.isFinite(Date.parse(message.receivedDateTime))) continue
        const existingLink = await readLink(client, messageId)
        if (existingLink) {
          if (!visibleLink(profile, state, existingLink.data)) fail('This email is linked to a record you cannot access.', 403)
          alreadyImported += 1
          checkpoint = await saveCheckpoint(client, checkpoint, message.receivedDateTime, authUser.id)
          continue
        }
        const id = importedLeadId(config.mailbox, messageId)
        const prior = await client.from('leads').select('id,data,rev,deleted_at').eq('id', id).maybeSingle()
        if (prior.error) throw prior.error
        if (prior.data?.deleted_at) {
          errors.push(`“${clean(message.subject) || 'No subject'}” was previously deleted and was not recreated.`)
          break
        }
        if (prior.data && prior.data.data?.mailboxMessageId !== messageId) fail('Email identity collision while importing mailbox messages.', 409)

        try {
          if (!prior.data) {
            const full = await mail.forLead(messageId)
            const sender = full.message.from?.emailAddress || {}
            const receivedAt = full.message.receivedDateTime || message.receivedDateTime
            const lead = {
              id, ts: receivedAt, receivedAt, channel: 'Email', source: 'Email', mailbox: true,
              sharedMailboxImport: true, mailboxUpn: config.mailbox, mailboxMessageId: messageId,
              from: sender.address || '', sender: sender.name || sender.address || 'Unknown sender',
              contactEmail: sender.address || '', subject: full.message.subject || '(no subject)',
              body: String(full.message.body?.content || full.message.bodyPreview || '').slice(0, 50000),
              attachments: full.attachments, assignedOwner: '', suggestedOwner: '', status: 'New',
              originator: { id: authUser.id, name: profile.name || '', email: profile.email || authUser.email || '' },
              parse: { confidence: 0, note: 'Imported from the shared mailbox. Review and structure before qualification.' },
            }
            assertWorkspaceRowWrite(profile, 'leads', undefined, lead, state.config || {}, state, id)
            const created = await client.rpc('save_rows', { p_entity: 'leads', p_rows: [{ id, data: lead, rev: 0, by: authUser.id }] })
            if (created.error) throw created.error
            if (created.data?.conflicts?.length || !created.data?.accepted?.includes(id)) {
              const raced = await client.from('leads').select('id,data,rev,deleted_at').eq('id', id).maybeSingle()
              if (raced.error) throw raced.error
              if (raced.data?.data?.mailboxMessageId !== messageId) fail('The lead could not be saved because another change conflicted. Click Sync again.', 409)
            }
          }
          await saveImportedLink(client, messageId, id, authUser.id)
          imported += prior.data ? 0 : 1
          alreadyImported += prior.data ? 1 : 0
        } catch (error) {
          errors.push(`“${clean(message.subject) || 'No subject'}”: ${error.message || 'Could not import this email.'}`)
          break
        }
        checkpoint = await saveCheckpoint(client, checkpoint, message.receivedDateTime, authUser.id)
      }
      if (errors.length || !page.next) break
      cursor = page.next
    }
    return { initialized: false, imported, alreadyImported, errors: errors.slice(0, 10), hasMore: Boolean(cursor && pages >= 20) }
  }
  const syncCandidates = async (client, profile, state) => {
    if (!canAccessPage(profile, 'inbox', state.config || {})) fail('You do not have permission to sync the shared inbox.')
    let checkpoint = await readCheckpoint(client)
    if (!checkpoint) {
      const latest = await mail.list('inbox')
      const baseline = latest.messages?.[0]?.receivedDateTime || new Date().toISOString()
      const data = { mailbox: config.mailbox, kind: 'lead_import_checkpoint', lastReceivedAt: baseline }
      const saved = await client.rpc('save_rows', { p_entity: 'mail_links', p_rows: [{ id: syncCheckpointId(config.mailbox), data, rev: 0, by: profile.id }] })
      if (saved.error) throw saved.error
      if (!saved.data?.accepted?.includes(syncCheckpointId(config.mailbox))) fail('Could not initialize shared-mail sync. Click Sync again.', 409)
      return { initialized: true, candidates: [] }
    }
    const overlap = new Date(Date.parse(checkpoint.data?.lastReceivedAt || '') - 60_000).toISOString()
    let cursor = '', pages = 0
    const candidates = []
    while (pages < 4 && candidates.length < 100) {
      const page = await mail.listSince(overlap, cursor)
      pages += 1
      for (const message of page.messages || []) {
        const messageId = clean(message.id)
        if (!messageId || !Number.isFinite(Date.parse(message.receivedDateTime)) || await readLink(client, messageId)) continue
        candidates.push(message)
      }
      cursor = page.next
      if (!cursor) break
    }
    return { initialized: false, candidates, hasMore: Boolean(cursor) }
  }
  const saveTriage = async (client, authUser, profile, state, messageId, classification, reviewReason = '', scannedFull = null) => {
    if (!canAccessPage(profile, 'inbox', state.config || {})) fail('You do not have permission to classify shared mail.')
    if (!['lead', 'not_lead', 'needs_review'].includes(classification)) fail('Invalid mail classification.', 400)
    const existing = await readLink(client, messageId)
    if (existing) return { triaged: false, existing: true }
    const full = scannedFull || (classification === 'lead' ? await mail.forLead(messageId) : { message: await mail.get(messageId), attachments: [] })
    const message = full.message
    const id = importedLeadId(config.mailbox, messageId)
    let linkData = { messageId, mailbox: config.mailbox, classification, triageReason: clean(reviewReason).slice(0, 500), triagedAt: new Date().toISOString(), triagedBy: profile.id }
    if (classification === 'lead') {
      if (!canPerform(profile, 'leads.create', state.config || {})) fail('You do not have permission to create leads from mail.')
      const prior = await client.from('leads').select('id,data,rev,deleted_at').eq('id', id).maybeSingle()
      if (prior.error) throw prior.error
      if (prior.data?.deleted_at) fail('This email was previously deleted and was not recreated.', 409)
      const sender = message.from?.emailAddress || {}
      const receivedAt = message.receivedDateTime || new Date().toISOString()
      if (!prior.data) {
        const lead = { id, ts: receivedAt, receivedAt, channel: 'Email', source: 'Email', mailbox: true,
          sharedMailboxImport: true, mailboxUpn: config.mailbox, mailboxMessageId: messageId,
          from: sender.address || '', sender: sender.name || sender.address || 'Unknown sender', contactEmail: sender.address || '',
          subject: message.subject || '(no subject)', body: String(message.body?.content || message.bodyPreview || '').slice(0, 50000),
          attachments: full.attachments, attachmentScanReview: Boolean(full.attachmentErrors?.length), attachmentScanErrors: full.attachmentErrors || [], assignedOwner: '', suggestedOwner: '', status: 'New',
          originator: { id: authUser.id, name: profile.name || '', email: profile.email || authUser.email || '' },
          parse: { confidence: 0, note: 'AI classified this as a sales enquiry. Review and structure before qualification.' } }
        assertWorkspaceRowWrite(profile, 'leads', undefined, lead, state.config || {}, state, id)
        const created = await client.rpc('save_rows', { p_entity: 'leads', p_rows: [{ id, data: lead, rev: 0, by: authUser.id }] })
        if (created.error) throw created.error
        if (created.data?.conflicts?.length || !created.data?.accepted?.includes(id)) fail('Lead save conflicted. Click Sync again.', 409)
      }
      linkData = { ...linkData, targetType: 'lead', targetId: id, linkedBy: authUser.id, linkedAt: new Date().toISOString(), importedFromMailbox: true }
    }
    const saved = await client.rpc('save_rows', { p_entity: 'mail_links', p_rows: [{ id: linkId(config.mailbox, messageId), data: linkData, rev: 0, by: authUser.id }] })
    if (saved.error) throw saved.error
    if (saved.data?.conflicts?.length || !saved.data?.accepted?.includes(linkId(config.mailbox, messageId))) fail('Mail classification conflicted. Click Sync again.', 409)
    const checkpoint = await readCheckpoint(client)
    await saveCheckpoint(client, checkpoint, message.receivedDateTime, authUser.id)
    return { triaged: true, classification, leadId: classification === 'lead' ? id : '' }
  }
  const readServerRecord = async (client, id) => {
    const result = await client.from('records').select('id,data,rev,deleted_at').eq('entity', 'mail_links').eq('id', id).maybeSingle()
    if (result.error) throw result.error
    if (result.data?.deleted_at) fail('Shared-mail sync state was deleted. Contact an administrator.', 409)
    return result.data
  }
  const saveServerRecord = async (client, id, data, row, actorId) => {
    const saved = await client.rpc('save_rows', { p_entity: 'mail_links', p_rows: [{ id, data, rev: Number(row?.rev) || 0, by: actorId }] })
    if (saved.error) throw saved.error
    if (saved.data?.conflicts?.length || !saved.data?.accepted?.includes(id)) fail('Shared-mail state changed during processing. It will retry.', 409)
    return { id, data, rev: (Number(row?.rev) || 0) + 1 }
  }
  const automaticProfile = async state => {
    const candidates = (state.users || []).filter(user => user.status === 'Active' && canAccessPage(user, 'inbox', state.config || {}) && canPerform(user, 'leads.create', state.config || {}))
    const profile = candidates.find(user => effectiveAccess(user, state.config || {}).isAdmin) || candidates[0]
    if (!profile) fail('No active account can create mailbox leads.', 503)
    return profile
  }
  let deltaWork = null
  let deltaQueued = false
  const processDelta = async () => {
    if (deltaWork) { deltaQueued = true; return deltaWork }
    deltaWork = (async () => {
      const client = getClient()
      if (!client || !config.mailbox || !config.mailWebhookSecret) return
      const state = await stateFor()
      const profile = await automaticProfile(state)
      const actor = { id: profile.authId || profile.id, email: profile.email || '' }
      let saved = await readServerRecord(client, deltaStateId(config.mailbox))
      if (!saved?.data?.deltaLink) {
        let page = await mail.delta()
        while (page.next) page = await mail.delta(page.next)
        await saveServerRecord(client, deltaStateId(config.mailbox), { kind: 'mail_delta_state', mailbox: config.mailbox, deltaLink: page.delta, updatedAt: new Date().toISOString() }, saved, actor.id)
        return
      }
      let cursor = saved.data.deltaLink, finalDelta = '', pages = 0
      do {
        const page = await mail.delta(cursor)
        pages += 1
        for (const message of page.messages || []) {
          if (message['@removed']) continue
          if (!message.id || await readLink(client, message.id)) continue
          const full = await mail.forAutoTriage(message.id)
          let classification = 'needs_review', reason = ''
          try {
            const result = await classifySharedMail(client, full.message, full.attachments)
            classification = result.confidence < 70 ? 'needs_review' : result.classification
            reason = result.reason || ''
            full.attachmentErrors.push(...result.attachmentErrors)
          } catch (error) { reason = `Automatic classification failed: ${error.message || 'AI unavailable.'}` }
          if (full.attachmentErrors.length) reason = [reason, ...full.attachmentErrors].filter(Boolean).join(' ')
          await saveTriage(client, actor, profile, state, message.id, classification, reason, full)
        }
        cursor = page.next
        if (!cursor) finalDelta = page.delta
      } while (cursor && pages < 100)
      if (cursor) throw new Error('Shared-mail delta exceeded 100 pages; checkpoint retained for retry.')
      if (finalDelta) await saveServerRecord(client, deltaStateId(config.mailbox), { kind: 'mail_delta_state', mailbox: config.mailbox, deltaLink: finalDelta, updatedAt: new Date().toISOString() }, saved, actor.id)
      invalidate()
    })().finally(() => {
      deltaWork = null
      if (deltaQueued) { deltaQueued = false; void processDelta().catch(error => console.error('Shared-mail queued scan failed:', error.message || error)) }
    })
    return deltaWork
  }
  const ensureSubscription = async () => {
    const client = getClient()
    if (!client || !config.mailbox || !config.mailWebhookUrl || String(config.mailWebhookSecret || '').length < 32) return
    const saved = await readServerRecord(client, subscriptionStateId(config.mailbox))
    const profile = await automaticProfile(await stateFor())
    const actorId = profile.authId || profile.id
    const expires = new Date(Date.now() + 55 * 60 * 1000).toISOString()
    if (saved?.data?.subscriptionId && Date.parse(saved.data.expiresAt) > Date.now() + 5 * 60 * 1000) {
      if (!(await readServerRecord(client, deltaStateId(config.mailbox)))?.data?.deltaLink) await processDelta()
      return
    }
    try {
      if (saved?.data?.subscriptionId) await mail.renewSubscription(saved.data.subscriptionId, expires)
      else {
        const subscription = await mail.createSubscription()
        await saveServerRecord(client, subscriptionStateId(config.mailbox), { kind: 'mail_subscription', mailbox: config.mailbox, subscriptionId: subscription.id, expiresAt: subscription.expirationDateTime }, saved, actorId)
        await processDelta()
        return
      }
      await saveServerRecord(client, subscriptionStateId(config.mailbox), { ...saved.data, expiresAt: expires }, saved, actorId)
    } catch (error) {
      if (saved?.data?.subscriptionId) await saveServerRecord(client, subscriptionStateId(config.mailbox), { kind: 'mail_subscription', mailbox: config.mailbox, subscriptionId: '', expiresAt: '' }, saved, actorId)
      else throw error
    }
  }
  const notificationHandler = async (req, res) => {
    const validation = clean(req.query?.validationToken)
    if (req.method === 'GET' && validation) return res.type('text/plain').status(200).send(validation)
    if (req.method !== 'POST' || !Array.isArray(req.body?.value)) return res.status(400).end()
    const secret = Buffer.from(String(config.mailWebhookSecret || ''))
    const valid = secret.length >= 32 && req.body.value.length > 0 && req.body.value.every(item => {
      const supplied = Buffer.from(String(item.clientState || ''))
      return supplied.length === secret.length && timingSafeEqual(supplied, secret)
    })
    if (!valid) return res.status(401).end()
    res.status(202).end()
    void processDelta().catch(error => console.error('Shared-mail background scan failed:', error.message || error))
  }
  const handler = async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store')
    let operation = '', input = {}
    try {
      const { client, authUser, profile } = await auth(req)
      input = req.method === 'GET' ? req.query || {} : req.body || {}
      operation = clean(input.operation)
      if (operation === 'status' && req.method === 'GET') return res.json({ documents: Boolean(config.siteId && config.driveId && config.rootId),
        sharedMail: Boolean(config.mailbox), sharedMailAddress: config.mailbox || '', personalMail: personal.connected(authUser.id), personalMailAddress: personal.identity(authUser.id) })
      if (operation === 'syncLeads' && req.method === 'POST') {
        return res.status(409).json({ error: 'Use Shared Outlook Sync to review and classify new mail before importing leads.' })
      }
      if (operation === 'syncCandidates' && req.method === 'POST') {
        return res.json(await syncCandidates(client, profile, await stateFor()))
      }
      if (operation === 'triageMessage' && req.method === 'POST') {
        const result = await saveTriage(client, authUser, profile, await stateFor(), clean(input.messageId), clean(input.classification), clean(input.reviewReason))
        if (result.leadId) invalidate()
        return res.json(result)
      }
      if (req.method === 'GET' && operation === 'inbox') {
        const result = await mail.list('inbox', clean(input.cursor))
        const ids = result.messages.map(message => linkId(config.mailbox, message.id))
        let links = []
        if (ids.length) {
          const read = await client.from('records').select('id,data').eq('entity', 'mail_links').in('id', ids).is('deleted_at', null)
          if (read.error) throw read.error
          links = read.data || []
        }
        const state = links.length ? await stateFor() : null
        return res.json({ ...result, messages: result.messages.map(message => { const data = links.find(row => row.id === linkId(config.mailbox, message.id))?.data
          return { ...message, link: visibleLink(profile, state, data), triage: data ? { classification: data.classification || (data.targetType ? 'lead' : ''), reason: data.triageReason || '' } : null }
        }) })
      }
      if (req.method === 'GET' && operation === 'folder') {
        const state = await stateFor()
        if (!canAccessPage(profile, 'inbox', state.config || {})) fail('You do not have permission to view mailbox folders.')
        const account = await mailAccount(clean(input.sender || 'shared'), authUser)
        const result = await mail.listFolder(clean(input.folder || 'inbox'), clean(input.cursor), clean(input.search), account.access)
        const ids = result.messages.map(message => linkId(account.mailboxKey, message.id))
        let links = []
        if (ids.length) {
          const read = await client.from('records').select('id,data').eq('entity', 'mail_links').in('id', ids).is('deleted_at', null)
          if (read.error) throw read.error
          links = read.data || []
        }
        const stateForLinks = links.length ? state : null
        return res.json({ ...result, messages: result.messages.map(message => {
          const data = links.find(row => row.id === linkId(account.mailboxKey, message.id))?.data
          return { ...message, mailAccount: clean(input.sender || 'shared'), link: visibleLink(profile, stateForLinks, data) }
        }) })
      }
      if (req.method === 'GET' && operation === 'message') {
        const account = await mailAccount(clean(input.sender || 'shared'), authUser)
        const message = await mail.getFor(clean(input.id), account.access)
        return res.json({ message, attachments: await mail.attachmentsFor(clean(input.id), account.access) })
      }
      if (req.method === 'GET' && operation === 'attachment') {
        const account = await mailAccount(clean(input.sender || 'shared'), authUser)
        const file = await mail.attachmentFor(clean(input.id), clean(input.attachmentId), account.access)
        res.setHeader('Content-Type', file.mimeType); res.setHeader('Content-Disposition', `attachment; filename="${safeName(file.name)}"`)
        return res.send(file.bytes)
      }
      if (req.method === 'GET' && operation === 'documents') return res.json({ folders: await documents.list(profile, await stateFor(), clean(input.oppId)) })
      if (req.method === 'GET' && operation === 'browseDocuments') {
        return res.json(await documents.browse(profile, await stateFor(), clean(input.path)))
      }
      if (req.method === 'GET' && operation === 'browseDocument') {
        const file = await documents.browseDownload(profile, await stateFor(), clean(input.path), clean(input.itemId))
        res.setHeader('Content-Type', file.mimeType); res.setHeader('Content-Disposition', `inline; filename="${safeName(file.name)}"`)
        return res.send(file.bytes)
      }
      if (req.method === 'GET' && operation === 'document') {
        const file = await documents.download(profile, await stateFor(), clean(input.oppId), clean(input.folder), clean(input.itemId))
        res.setHeader('Content-Type', file.mimeType); res.setHeader('Content-Disposition', `inline; filename="${safeName(file.name)}"`)
        return res.send(file.bytes)
      }
      if (req.method !== 'POST') fail('Unsupported Microsoft request.', 405)
      if (operation === 'mailAction') {
        const state = await stateFor()
        if (!canAccessPage(profile, 'inbox', state.config || {})) fail('You do not have permission to manage mailbox messages.')
        const account = await mailAccount(clean(input.sender || 'shared'), authUser)
        const result = await mail.setAction(clean(input.messageId), clean(input.action), { comment: input.comment, to: input.to }, account.access)
        return res.json({ result })
      }
      if (operation === 'draftSave') {
        const state = await stateFor()
        if (!canPerform(profile, 'leads.edit', state.config || {})) fail('You do not have permission to save lead correspondence.')
        const account = await mailAccount(clean(input.sender || 'shared'), authUser)
        const result = await mail.saveDraft({ id: clean(input.draftId), to: input.to, cc: input.cc, bcc: input.bcc,
          subject: input.subject, body: input.body, attachments: input.attachments || [], replaceAttachments: Boolean(input.replaceAttachments) }, account.access)
        const leadId = clean(input.leadId)
        const link = await saveDraftMailLink(client, authUser, profile, state, account.mailboxKey, result.id, leadId)
        return res.json({ ...result, link })
      }
      if (operation === 'draftSend') {
        const state = await stateFor()
        if (!canPerform(profile, 'leads.edit', state.config || {})) fail('You do not have permission to send workspace mail.')
        const account = await mailAccount(clean(input.sender || 'shared'), authUser)
        const draftId = clean(input.draftId)
        const link = await readAccountMailLink(client, account.mailboxKey, draftId)
        if (link?.data?.targetId) canLink(profile, state, 'lead', link.data.targetId)
        await mail.sendDraft(draftId, account.access)
        return res.status(202).json({ accepted: true })
      }
      if (operation === 'draftDelete') {
        const state = await stateFor()
        if (!canPerform(profile, 'leads.edit', state.config || {})) fail('You do not have permission to discard this draft.')
        const account = await mailAccount(clean(input.sender || 'shared'), authUser)
        await mail.deleteMessage(clean(input.draftId), account.access)
        return res.status(204).end()
      }
      if (operation === 'link') {
        const messageId = clean(input.messageId), targetType = clean(input.targetType), targetId = clean(input.targetId)
        if (!messageId || messageId.length > 600 || !targetId || targetId.length > 120) fail('Choose a message and record.', 400)
        const state = await stateFor()
        canLink(profile, state, targetType, targetId)
        await mail.get(messageId)
        const existing = await readLink(client, messageId)
        if (existing) {
          if (existing.data?.targetType === targetType && existing.data?.targetId === targetId) return res.json({ link: existing.data })
          fail('This email is already linked to another record.', 409)
        }
        const data = { messageId, mailbox: config.mailbox, targetType, targetId, linkedBy: profile.id, linkedAt: new Date().toISOString() }
        const saved = await client.rpc('save_rows', { p_entity: 'mail_links', p_rows: [{ id: linkId(config.mailbox, messageId), data, rev: 0, by: authUser.id }] })
        if (saved.error) throw saved.error
        if (saved.data?.conflicts?.length) fail('This email was linked in another session. Refresh the inbox.', 409)
        return res.json({ link: data })
      }
      if (operation === 'send') {
        const state = await stateFor()
        canLink(profile, state, 'lead', clean(input.leadId))
        if (!['shared', 'personal'].includes(input.sender)) fail('Choose a sending mailbox.', 400)
        const access = input.sender === 'personal' ? await personal.access(authUser.id) : ''
        const result = await mail.send({ to: input.to, cc: input.cc, bcc: input.bcc, subject: input.subject, body: input.body }, access)
        return res.status(202).json(result)
      }
      if (operation === 'upload') {
        const bytes = Buffer.from(clean(input.base64), 'base64')
        return res.json({ file: await documents.upload(profile, await stateFor(), clean(input.oppId), clean(input.folder), clean(input.name), bytes, clean(input.mimeType)) })
      }
      if (operation === 'delete') { await documents.remove(profile, await stateFor(), clean(input.oppId), clean(input.folder), clean(input.itemId)); return res.status(204).end() }
      if (operation === 'ensure') { await documents.ensure(profile, await stateFor(), clean(input.oppId)); return res.status(204).end() }
      if (operation === 'move') { await documents.move(profile, await stateFor(), clean(input.oppId), clean(input.to)); return res.status(204).end() }
      fail('Unsupported Microsoft request.', 400)
    } catch (error) {
      const status = Number(error.status) >= 400 && Number(error.status) < 600 ? Number(error.status) : 503
      if (error.graphStatus) {
        const stage = operation === 'draftSave' ? 'saving draft' : operation === 'draftSend' ? 'sending draft' : ''
        const code = typeof error.graphCode === 'string' && /^[A-Za-z0-9_.-]{1,100}$/.test(error.graphCode) ? error.graphCode : ''
        const personal = clean(input.sender) === 'personal'
        const permission = error.graphStatus === 403 ? operation === 'draftSave' ? 'Mail.ReadWrite' : operation === 'draftSend' ? 'Mail.Send' : '' : ''
        const guidance = permission ? personal
          ? ` Check ${permission} consent and mailbox access for this Outlook account.`
          : ` Check the app's ${permission} application permission and shared-mailbox access policy.` : ''
        const diagnostic = { status: error.graphStatus, code, ...(stage ? { stage: operation } : {}) }
        const message = stage
          ? `Microsoft Graph denied ${stage} (HTTP ${error.graphStatus}${code ? `, ${code}` : ''}).${guidance}`
          : `Microsoft Graph returned HTTP ${error.graphStatus}${code ? ` (${code})` : ''}.`
        return res.status(status).json({ error: message, graph: diagnostic })
      }
      return res.status(status).json({ error: error.message || 'Microsoft request failed.' })
    }
  }
  const personalHandler = async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store')
    try {
      if (req.method === 'GET' && req.path === '/callback') {
        await personal.complete(clean(req.query.state), clean(req.query.code))
        return res.redirect(302, `${new URL(config.redirectUri).origin}/mail?outlook=connected`)
      }
      if (req.method !== 'POST') fail('Unsupported Outlook request.', 405)
      const { authUser, profile } = await auth(req)
      if (req.body?.operation === 'connect') return res.json({ url: personal.start(authUser.id, profile.email) })
      if (req.body?.operation === 'disconnect') { personal.disconnect(authUser.id); return res.status(204).end() }
      fail('Unsupported Outlook request.', 400)
    } catch (error) {
      if (req.path === '/callback' && config.redirectUri) return res.redirect(302, `${new URL(config.redirectUri).origin}/mail?outlook=error`)
      return res.status(error.status || 503).json({ error: error.message || 'Outlook connection failed.' })
    }
  }
  const startAutomaticMail = () => {
    if (!config.mailbox || !config.mailWebhookUrl || String(config.mailWebhookSecret || '').length < 32) return
    const timer = setTimeout(() => { void ensureSubscription().catch(error => console.error('Shared-mail subscription setup failed:', error.message || error)) }, 1000)
    timer.unref?.()
    const renewal = setInterval(() => { void ensureSubscription().catch(error => console.error('Shared-mail subscription renewal failed:', error.message || error)) }, 15 * 60 * 1000)
    renewal.unref?.()
    return () => { clearTimeout(timer); clearInterval(renewal) }
  }
  return { handler, personalHandler, notificationHandler, startAutomaticMail }
}

const handlers = createMicrosoftHandlers()
export const microsoftHandler = handlers.handler
export const personalMicrosoftHandler = handlers.personalHandler
export const microsoftNotificationHandler = handlers.notificationHandler
