import nodemailer from 'nodemailer'
import { getAdminSupabaseClient } from './_supabase-client.js'
import { activeProfile } from './_user-roster.js'
import { canAccessPage, canPerform } from '../src/accessPolicy.js'
import { readiness, releaseState } from '../src/gates.js'
import { createWorkspaceReader } from '../src/server/workspace.js'

const denied = (status, message) => { throw Object.assign(new Error(message), { status }) }
export async function authorizeProposalSend(req, input, { getClient = getAdminSupabaseClient, getReader = createWorkspaceReader } = {}) {
  const token = String(req.headers?.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) denied(401, 'A signed-in session is required.')
  const client = getClient()
  if (!client) denied(503, 'Workspace authorization is not configured.')
  const { data, error } = await client.auth.getUser(token)
  if (error || !data?.user) denied(401, 'Your session is no longer valid.')
  const profile = await activeProfile(client, data.user)
  if (!profile) denied(403, 'This workspace account is not active.')
  const read = getReader()
  if (!read) denied(503, 'The shared workspace is not configured.')
  const state = await read()
  const config = state.config || {}
  if (!canAccessPage(profile, 'proposal', config) || !canPerform(profile, 'proposals.send', config)) denied(403, 'You do not have permission to send proposals.')
  const oppId = String(input.oppId || '').trim()
  if (!oppId) denied(400, 'An opportunity ID is required.')
  const opportunity = (state.opportunities || []).find(opp => opp.id === oppId)
  const proposal = state.proposals?.[oppId]
  if (!opportunity || !proposal) denied(404, 'The saved opportunity and proposal could not be found.')
  const blockers = readiness(opportunity, proposal, state).filter(item => item.severity !== 'info')
  const release = releaseState(proposal, state.approvals || [], oppId, opportunity, config)
  if (blockers.length || (release.required && !release.release)) denied(409, 'This proposal is not ready for customer submission. Resolve its readiness and release approvals first.')
  return { profile, opportunity, proposal }
}


const clean = value => String(value || '').trim()
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// To and CC accept comma-separated recipient lists, e.g. a buyer plus their
// purchase department.
const recipientList = value => String(value || '').split(',').map(clean).filter(Boolean)
const recipientsValid = list => list.length > 0 && list.every(a => EMAIL_RE.test(a))

// The salesperson can attach their own supporting files from the Submission
// panel, so anything a customer could reasonably be sent is accepted here;
// executables are the only hard refusal.
const ALLOWED_ATTACHMENT_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
  'application/zip',
  'application/x-zip-compressed',
  'application/rtf',
  'text/plain',
  'text/csv',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/octet-stream',
])
const BLOCKED_ATTACHMENT_MIME = new Set([
  'application/x-msdownload',
  'application/x-dosexec',
  'application/x-sh',
  'application/javascript',
  'text/javascript',
])

const mimeMessage = ({ from, to, cc, subject, body, attachments }) => ({
  from, to, cc: cc || undefined, subject, text: body,
  attachments: attachments.map(a => ({
    filename: a.filename,
    content: Buffer.from(a.contentBase64, 'base64'),
    contentType: a.mimeType,
  })),
})

export function createSendProposalEmailHandler({ authorize = authorizeProposalSend, transportFactory = options => nodemailer.createTransport(options) } = {}) {
  return async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' })

    const account = clean(process.env.GMAIL_ACCOUNT)
    const appPassword = clean(process.env.GMAIL_APP_PASSWORD)
    if (!account || !appPassword) {
      return res.status(503).json({ ok: false, error: 'Gmail is not configured on the server' })
    }

    let input
    try { input = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}) }
    catch { return res.status(400).json({ ok: false, error: 'Malformed request body' }) }
    try { await authorize(req, input) }
    catch (error) {
      return res.status(error.status || 502).json({ ok: false, error: error.status ? error.message : 'Could not verify proposal submission permission.' })
    }
    const from = clean(input.from || account)
    if (!EMAIL_RE.test(from) || from.includes(',')) {
      return res.status(400).json({ ok: false, error: 'From address is not valid' })
    }
    const toList = recipientList(input.to)
    if (!recipientsValid(toList)) {
      return res.status(400).json({ ok: false, error: 'A valid recipient email is required' })
    }
    const ccList = recipientList(input.cc)
    if (ccList.length && !ccList.every(a => EMAIL_RE.test(a))) {
      return res.status(400).json({ ok: false, error: 'The CC address is not valid' })
    }
    const to = toList.join(', ')
    const subject = clean(input.subject)
    const body = clean(input.body)
    const cc = ccList.join(', ')
    if (!subject || !body || body.length > 50000) {
      return res.status(400).json({ ok: false, error: 'Subject and a valid message body are required' })
    }
    const attachments = Array.isArray(input.attachments)
      ? input.attachments
      : input.attachment ? [input.attachment] : []
    if (!attachments.length || attachments.length > 8) {
      return res.status(400).json({ ok: false, error: 'One to eight attachments are required' })
    }
    if (attachments.some(a => !a?.filename || !a.contentBase64
      || BLOCKED_ATTACHMENT_MIME.has(a.mimeType) || !ALLOWED_ATTACHMENT_MIME.has(a.mimeType))) {
      return res.status(400).json({
        ok: false,
        error: 'Attachments must be documents, spreadsheets, presentations, images, text or ZIP files — executables are rejected',
      })
    }
    if (attachments.reduce((sum, a) => sum + String(a.contentBase64).length, 0) > 30_000_000) {
      return res.status(400).json({ ok: false, error: 'Attachments are too large' })
    }

    try {
      // Direct Gmail login (mailbox address + app password) via SMTP, rather
      // than a Google Cloud OAuth app + refresh token — the mailbox owner
      // generates the app password once from their own Google account.
      const transporter = transportFactory({
        service: 'gmail',
        auth: { user: account, pass: appPassword },
      })
      const info = await transporter.sendMail({
        ...mimeMessage({ from: account, to, cc, subject, body, attachments }),
        from,
      })
      return res.status(200).json({ ok: true, messageId: info.messageId })
    } catch (error) {
      console.error('Gmail send error', error?.message || error)
      return res.status(502).json({ ok: false, error: 'Could not reach Gmail' })
    }
  }

}
export default createSendProposalEmailHandler()
