const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim()
const deposit = /\b(?:EMD|earnest money|security deposit|bid security)\b/i
const waived = /\b(?:EMD|earnest money|security deposit|bid security)\s*(?:(?:is|shall be)\s*)?[:=-]?\s*(?:not applicable|not required|waived|nil|none|N\/?A)\b|\bno\s+(?:EMD|earnest money|security deposit|bid security)\b/i
const offerInstruction = /\b(?:confirm|quote|provide|state|specify|include|indicate|advise|offer|show|itemi[sz]e)\b/i
const buyerUnresolved = /\b(?:customer|buyer)\b.*\b(?:confirm|advis|clarif|specif)|\bby (?:the )?(?:customer|buyer)\b/i
const topics = [
  /\bwarrant(?:y|ies)\b/i,
  /\bfreight\b/i,
  /\b(?:delivery|lead time)\b/i,
  /\b(?:price|prices|pricing)\b/i,
  /\b(?:tax|GST)\b/i,
  /\bvalidity\b/i,
  /\bpayment\b/i,
]

export const leadMissingSource = lead => [lead?.subject, lead?.body,
  ...(lead?.attachments || []).map(file => file.text),
].filter(Boolean).join('\n')

// These are customer questions. Requests for our offer stay in the extracted facts.
export function filterLeadMissing(missing = [], { text = '' } = {}) {
  const clauses = String(text || '').split(/\n+|[.;](?:\s|$)|\bbut\b/i).map(clean).filter(Boolean)
  return [...new Set((missing || []).map(clean).filter(Boolean))].filter(question => {
    if (/\b(?:specifications?|quantit(?:y|ies)|dimensions?|thread|part numbers?|configuration|operating|rating)\b/i.test(question)) return true
    if (deposit.test(question) && clauses.length) {
      const requirements = clauses.filter(clause => deposit.test(clause))
      return requirements.some(clause => !waived.test(clause))
    }
    // Addresses, deadlines and buyer constraints are not supplier quote details.
    if (/\b(?:address|location|deadline|site|customer|buyer|GSTIN|GST (?:number|registration)|tax identification|required delivery|delivery date)\b/i.test(question)) return true
    const topic = topics.find(pattern => pattern.test(question))
    if (!topic) return true
    const relevant = clauses.filter(clause => topic.test(clause))
    if (relevant.some(clause => buyerUnresolved.test(clause))) return true
    return !relevant.some(clause => offerInstruction.test(clause))
  })
}
