import { microsoftRequest } from './microsoftApi.js'
import { runTaskResult } from './ai.js'
import { aiAttachmentPayload, completeAiAttachmentPayload } from './aiAttachments.js'
import { extractDocText } from './docText.js'

const addressOf = row => row?.from?.emailAddress?.address || ''

// Sync is deliberately explicit: only a user click runs AI or downloads files.
export async function syncSharedMailbox() {
  const result = await microsoftRequest('syncCandidates', {}, { method: 'POST' })
  if (result.initialized) return { ...result, reviewed: 0, imported: 0, needsReview: 0, errors: [] }
  let reviewed = 0, imported = 0, needsReview = 0
  const errors = []
  for (const candidate of result.candidates || []) {
    try {
      const detail = await microsoftRequest('message', { id: candidate.id })
      const files = (detail.attachments || []).filter(file => !file.isInline)
      const aiFiles = [], textParts = []
      let unreadable = files.length > 10
      for (const attachment of files.slice(0, 10)) {
        try {
          const response = await microsoftRequest('attachment', { id: candidate.id, attachmentId: attachment.id }, { raw: true })
          const blob = await response.blob()
          const file = new File([blob], attachment.name || 'attachment', { type: attachment.contentType || blob.type || 'application/octet-stream' })
          if (file.size > 6 * 1024 * 1024) { unreadable = true; continue }
          const extracted = await extractDocText(file)
          if (extracted.text) textParts.push(`[${file.name}]\n${extracted.text.slice(0, 12000)}`)
          const payload = await aiAttachmentPayload([file])
          const included = payload.filter(item => item.dataBase64)
          aiFiles.push(...included)
          if (!included.length && !extracted.text) unreadable = true
          if (extracted.err && !included.length) unreadable = true
        } catch { unreadable = true }
      }
      const boundedAiFiles = await completeAiAttachmentPayload([], aiFiles)
      if (boundedAiFiles.some(file => file.skippedReason)) unreadable = true
      const ai = await runTaskResult('mail.classify', {
        from: addressOf(detail.message), subject: detail.message.subject || '',
        body: detail.message.body?.content || detail.message.bodyPreview || '',
        attachmentText: textParts.join('\n\n'), aiAttachments: boundedAiFiles.filter(file => file.dataBase64),
      }, { timeoutMs: 60000 })
      const classification = unreadable || !ai.data?.data ? 'needs_review'
        : ai.data.data.classification === 'lead' ? 'lead' : 'not_lead'
      const reason = unreadable ? 'One or more attachments could not be read completely.' : ai.data?.data?.reason || ai.error || ''
      const saved = await microsoftRequest('triageMessage', { messageId: candidate.id, classification, reviewReason: reason }, { method: 'POST' })
      reviewed += saved.triaged ? 1 : 0
      imported += saved.leadId ? 1 : 0
      needsReview += classification === 'needs_review' && saved.triaged ? 1 : 0
    } catch (error) { errors.push(`${candidate.subject || 'No subject'}: ${error.message || 'Could not classify this message.'}`); break }
  }
  return { ...result, hasMore: Boolean(result.hasMore || errors.length), reviewed, imported, needsReview, errors }
}
