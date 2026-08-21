const clean = value => String(value || '').trim()
const headerValue = value => clean(value).replace(/[\r\n"]/g, '_')

function encodeBase64Url(value) {
  return Buffer.from(value).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function mimeMessage({ from, to, cc, subject, body, attachment }) {
  if (!attachment) {
    const lines = [
      `From: ${headerValue(from)}`, `To: ${headerValue(to)}`, ...(cc ? [`Cc: ${headerValue(cc)}`] : []), `Subject: ${headerValue(subject)}`,
      'MIME-Version: 1.0', 'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: 8bit', '', body,
    ]
    return encodeBase64Url(lines.join('\r\n'))
  }
  const boundary = `=_wintrack_${Date.now()}`
  const encoded = String(attachment.contentBase64 || '').replace(/\s/g, '').match(/.{1,76}/g)?.join('\r\n') || ''
  const lines = [
    `From: ${headerValue(from)}`,
    `To: ${headerValue(to)}`,
    ...(cc ? [`Cc: ${headerValue(cc)}`] : []),
    `Subject: ${headerValue(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit', '',
    body,
    '', `--${boundary}`,
    `Content-Type: ${attachment.mimeType || 'application/pdf'}; name="${headerValue(attachment.filename)}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${headerValue(attachment.filename)}"`, '',
    encoded,
    `--${boundary}--`, '',
  ]
  return encodeBase64Url(lines.join('\r\n'))
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' })

  const clientId = clean(process.env.GOOGLE_CLIENT_ID)
  const clientSecret = clean(process.env.GOOGLE_CLIENT_SECRET)
  const refreshToken = clean(process.env.GOOGLE_REFRESH_TOKEN)
  const account = clean(process.env.GMAIL_ACCOUNT)
  if (!clientId || !clientSecret || !refreshToken || !account) {
    return res.status(503).json({ ok: false, error: 'Gmail is not configured on the server' })
  }

  let input
  try { input = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}) }
  catch { return res.status(400).json({ ok: false, error: 'Malformed request body' }) }
  const to = clean(input.to)
  const subject = clean(input.subject)
  const body = clean(input.body)
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return res.status(400).json({ ok: false, error: 'A valid recipient email is required' })
  }
  if (!subject || !body || body.length > 50000) {
    return res.status(400).json({ ok: false, error: 'Subject and a valid message body are required' })
  }
  const attachment = input.attachment
  if (!attachment?.filename || !attachment?.contentBase64 || attachment.mimeType !== 'application/pdf') {
    return res.status(400).json({ ok: false, error: 'A proposal PDF attachment is required' })
  }
  if (String(attachment.contentBase64).length > 30_000_000) {
    return res.status(400).json({ ok: false, error: 'Proposal PDF is too large' })
  }

  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    })
    const token = await tokenResponse.json()
    if (!tokenResponse.ok || !token.access_token) {
      console.error('Gmail token exchange failed', token.error || tokenResponse.status)
      return res.status(502).json({ ok: false, error: 'Gmail authentication failed' })
    }

    const gmailResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token.access_token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        raw: mimeMessage({ from: account, to, cc: clean(input.cc), subject, body, attachment }),
      }),
    })
    const result = await gmailResponse.json()
    if (!gmailResponse.ok || !result.id) {
      console.error('Gmail send failed', result.error?.message || gmailResponse.status)
      return res.status(502).json({ ok: false, error: 'Gmail rejected the message' })
    }
    return res.status(200).json({ ok: true, messageId: result.id, threadId: result.threadId })
  } catch (error) {
    console.error('Gmail send error', error?.message || error)
    return res.status(502).json({ ok: false, error: 'Could not reach Gmail' })
  }
}
