import nodemailer from 'nodemailer'

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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' })

  const account = clean(process.env.GMAIL_ACCOUNT)
  const appPassword = clean(process.env.GMAIL_APP_PASSWORD)
  if (!account || !appPassword) {
    return res.status(503).json({ ok: false, error: 'Gmail is not configured on the server' })
  }

  let input
  try { input = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}) }
  catch { return res.status(400).json({ ok: false, error: 'Malformed request body' }) }
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
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: account, pass: appPassword },
    })
    const info = await transporter.sendMail({
      from, to, cc: cc || undefined, subject, text: body,
      attachments: attachments.map(a => ({
        filename: a.filename,
        content: Buffer.from(a.contentBase64, 'base64'),
        contentType: a.mimeType,
      })),
    })
    return res.status(200).json({ ok: true, messageId: info.messageId })
  } catch (error) {
    console.error('Gmail send error', error?.message || error)
    return res.status(502).json({ ok: false, error: 'Could not reach Gmail' })
  }
}
