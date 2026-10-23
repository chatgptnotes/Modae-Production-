import { activeAiConnection } from './_ai-integrations.js'
import { generateProvider } from './_ai-providers.js'
import { convertOfficeToPdf } from './_office-convert.js'

const schema = { type: 'OBJECT', properties: { classification: { type: 'STRING', enum: ['lead', 'not_lead'] }, confidence: { type: 'INTEGER' }, reason: { type: 'STRING' } }, required: ['classification', 'confidence', 'reason'] }

export async function classifySharedMail(client, message, attachments = []) {
  const parts = [{ text: `Classify this incoming shared sales mailbox message. A lead is a genuine customer/prospect enquiry, RFQ, quotation request, spare parts, service, project or product information request. Newsletters, spam, internal notes, automated notices and unrelated invoices are not leads. Use only evidence supplied and explain uncertainty.\nFROM: ${message.from?.emailAddress?.address || ''}\nSUBJECT: ${message.subject || ''}\nEMAIL:\n${String(message.body?.content || message.bodyPreview || '').slice(0, 30000)}\nReturn JSON with classification lead or not_lead, confidence 0–100, and reason.` }]
  const attachmentErrors = []
  for (const file of attachments) {
    const match = /^data:([^;,]+);base64,(.+)$/s.exec(file.dataUrl || '')
    if (!match) { attachmentErrors.push(`${file.name}: unsupported attachment encoding`); continue }
    const ext = String(file.name || '').match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase()
    if (['doc', 'docx', 'odt', 'rtf', 'xls', 'xlsx', 'ods', 'ppt', 'pptx', 'odp'].includes(ext)) {
      try {
        const pdf = await convertOfficeToPdf(Buffer.from(match[2], 'base64'), file.name)
        parts.push({ inlineData: { mimeType: 'application/pdf', data: pdf.toString('base64') } })
      } catch (error) { attachmentErrors.push(`${file.name}: ${error.message || 'could not be converted'}`) }
    } else parts.push({ inlineData: { mimeType: match[1], data: match[2] } })
  }
  const connection = await activeAiConnection(client, parts.length > 1)
  if (!connection.key) throw new Error('AI is not configured for mailbox classification.')
  const text = await generateProvider({ ...connection, requestBody: { contents: [{ parts }], generationConfig: { maxOutputTokens: 512, responseMimeType: 'application/json', responseSchema: schema } } })
  const result = JSON.parse(text)
  if (!['lead', 'not_lead'].includes(result.classification) || !Number.isFinite(Number(result.confidence))) throw new Error('AI returned an invalid mailbox classification.')
  return { ...result, attachmentErrors }
}
