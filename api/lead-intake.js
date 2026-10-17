import { LEAD_SOURCES } from '../src/seed.js'
import { getAdminSupabaseClient } from './_supabase-client.js'
import { activeProfile } from './_user-roster.js'
import { createWorkspaceReader } from '../src/server/workspace.js'
import { canPerform, isNonSalesUser } from '../src/accessPolicy.js'
import { isActiveUser } from '../src/userManagement.js'
import { opportunityOwnerFor } from '../src/leadRules.js'

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }) }
export function intakeAssignees(state) {
  return [...new Map((state.users || []).filter(user => isActiveUser(user) && !isNonSalesUser(user)
    && canPerform(user, 'opportunities.create', state.config) && !['SUPER','ADMIN','CUST'].includes(user.role))
    .map(user => [user.role, { id: user.role, name: user.name }])).values()]
}
export function buildSubmittedLead(input, actor, state, now = new Date().toISOString()) {
  if (!input || Array.isArray(input) || typeof input !== 'object') fail('Enter the lead details.')
  if (!/^LD-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.id || '')) fail('Invalid submission identifier.')
  const fields = ['customerName','contactPerson','contactEmail','contactPhone','location','region','subject','body','assignedOwner','forwardingDepartment','source']
  if (Object.keys(input).some(key => !['id','attachments',...fields].includes(key))) fail('Unsupported lead field.')
  const clean = Object.fromEntries(fields.map(key => {
    if (input[key] != null && typeof input[key] !== 'string') fail('Invalid lead details.')
    const value = (input[key] || '').trim()
    if (value.length > (key === 'body' ? 50000 : 500)) fail('A lead field exceeds its length limit.')
    return [key, value]
  }))
  if (clean.source && !LEAD_SOURCES.includes(clean.source)) fail('Choose a supported lead source.')
  if (clean.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.contactEmail)) fail('Enter a valid contact email.')
  if (clean.assignedOwner && !intakeAssignees(state).some(user => user.id === clean.assignedOwner)) fail('Choose an active salesperson.')
  const attachments = input.attachments || []
  if (!Array.isArray(attachments) || attachments.length > 10) fail('Attach up to ten files.')
  let total = 0
  const safeAttachments = attachments.map(file => {
    if (!file || typeof file.name !== 'string' || !file.name.trim() || file.name.length > 255
      || typeof file.dataUrl !== 'string' || !/^data:[a-z0-9.+\-/]+;base64,[A-Za-z0-9+/]*={0,2}$/i.test(file.dataUrl)) fail('Invalid attachment.')
    const encoded = file.dataUrl.split(',')[1]
    const bytes = Buffer.from(encoded, 'base64')
    if (bytes.toString('base64') !== encoded) fail('Invalid attachment encoding.')
    total += bytes.length
    if (total > 6 * 1024 * 1024) fail('Attachments must total 6 MB or less.')
    return { name: file.name.trim(), size: bytes.length, type: file.dataUrl.slice(5, file.dataUrl.indexOf(';')), dataUrl: file.dataUrl }
  })
  if (!clean.subject && !clean.body && !safeAttachments.length) fail('Enter enquiry details or attach a document.')
  const assignedOwner = clean.assignedOwner || opportunityOwnerFor({ location: clean.location, region: clean.region, config: state.config, fallback: 'LJS' })
  return { ...clean, id: input.id, assignedOwner, suggestedOwner: assignedOwner, sellTo: clean.customerName,
    sellToCustomerLocation: clean.location, from: clean.contactEmail, sender: clean.contactPerson || actor.name,
    attachments: safeAttachments, status: 'New', source: clean.source || 'Internal / Non-sales Enquiry', channel: clean.source || 'Internal',
    mailbox: true, ts: now, receivedAt: now, forwardedBy: actor.name, originator: { id: actor.id, name: actor.name, email: actor.email }, submittedBy: actor.id, submittedByAuthId: actor.authId || null }
}
export function createLeadIntakeHandler({ getClient = getAdminSupabaseClient, getReader = createWorkspaceReader, invalidate = () => {} } = {}) {
  return async (req, res) => {
    res.setHeader?.('Cache-Control', 'private, no-store')
    if (!['GET','POST'].includes(req.method)) return res.status(405).json({ error: 'GET or POST only.' })
    try {
      const token = /^Bearer\s+(.+)$/i.exec(String(req.headers?.authorization || ''))?.[1]
      if (!token) fail('Sign in to submit a lead.', 401)
      const client = getClient()
      if (!client) fail('Lead submission is unavailable.', 503)
      const auth = await client.auth.getUser(token)
      if (auth.error || !auth.data?.user) fail('Your session has expired.', 401)
      const actor = await activeProfile(client, auth.data.user)
      if (!actor || !isNonSalesUser(actor)) fail('This form is for active non-sales accounts.', 403)
      const reader = getReader()
      if (!reader) fail('Lead submission is unavailable.', 503)
      const state = await reader()
      if (req.method === 'GET') return res.status(200).json({ assignees: intakeAssignees(state), generation: String(state.workspaceGeneration || 0) })
      const deployment = process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || 'local'
      if (deployment !== 'local' && req.headers?.['x-workspace-deployment'] !== deployment) fail('Reload after the latest deployment before submitting.', 409)
      if (String(req.headers?.['x-workspace-generation'] || '') !== String(state.workspaceGeneration || 0)) fail('The workspace changed. Reload this form before submitting.', 409)
      const lead = buildSubmittedLead(req.body, actor, state)
      const current = await client.from('leads').select('data,deleted_at').eq('id', lead.id).maybeSingle()
      if (current.error) throw current.error
      if (current.data) {
        if (current.data.deleted_at || current.data.data?.submittedBy !== actor.id) fail('This submission identifier is unavailable.', 409)
        return res.status(200).json({ id: lead.id, submitted: true })
      }
      const result = await client.rpc('save_rows', { p_entity: 'leads', p_rows: [{ id: lead.id, data: lead, rev: 0, by: auth.data.user.id }] })
      if (result.error) throw result.error
      if (result.data?.conflicts?.length || !result.data?.accepted?.includes(lead.id)) fail('Submission conflicted. Please retry.', 409)
      invalidate()
      return res.status(201).json({ id: lead.id, submitted: true })
    } catch (error) { const status = error.status || 503; return res.status(status).json({ error: status === 503 ? 'Could not submit the lead. Your form is preserved; please retry.' : error.message }) }
  }
}
