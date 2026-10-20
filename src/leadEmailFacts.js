// Conservative recovery of facts from an email embedded in an enquiry document.
// These are suggestions, never accepted decisions or customer-master changes.
const clean = value => String(value || '').replace(/[ \t]+/g, ' ').trim()
const invalidIdentity = value => /@|\.(?:pdf|docx?|xlsx?|txt|png|jpe?g)\b/i.test(value)
export const validCustomerName = value => Boolean(clean(value) && !invalidIdentity(value))
export const validContactName = value => Boolean(validCustomerName(value) && !/^(?:from|to|email|phone|mobile)\s*:/i.test(value))

export function normalizeEnquiryDate(value) {
  const text = clean(value)
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  // Numeric day/month dates are ambiguous: leave them for human review.
  const match = text.match(/^(\d{1,2})[ -]+([A-Za-z]+)[ -]+(\d{4})\b/)
  if (!match) return ''
  const month = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(match[2].slice(0,3).toLowerCase())
  const date = new Date(Date.UTC(Number(match[3]), month, Number(match[1])))
  return month >= 0 && date.getUTCDate() === Number(match[1]) && date.getUTCMonth() === month ? date.toISOString().slice(0,10) : ''
}

export function enquiryEmailFacts(text, { from = '', isInternal = () => false } = {}) {
  const source = String(text || '').replace(/\r/g, '')
  const lines = source.split('\n').map(clean)
  const facts = []
  const add = (k, v, evidence, conf = 90) => {
    if (v) facts.push({ group: /RFQ|Subject|Lead source/.test(k) ? 'RFQ' : 'Customer', k, v, conf, ev: evidence, source: 'deterministic' })
  }
  const fromHeaders = [...source.matchAll(/^(?:[ \t]*>?[ \t]*)From\s*:\s*([^\n]+)$/gim)].map(match => {
    const value = match[1]
    const email = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || ''
    const name = clean(value.replace(/<[^>]+>|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig, '').replace(/^["']|["']$/g, ''))
    return { email, name, line: match[0] }
  }).filter(header => header.email && !isInternal(header.email))
  const uniqueEmails = [...new Set(fromHeaders.map(h => h.email.toLowerCase()))]
  const sender = uniqueEmails.length === 1 ? fromHeaders[0] : null
  const external = uniqueEmails.length > 1 ? false : sender || (from && !isInternal(from))
  if (sender) {
    add('Contact email', sender.email, sender.line, 96)
    if (validContactName(sender.name)) add('Contact person', sender.name, sender.line, 94)
    add('Lead source', 'Email', 'From header in enquiry', 96)
  }
  // Only a directly external email may use an unlabelled signature. Internal
  // forwards require the named external From header above instead.
  const closing = lines.findIndex(line => /^(?:best |kind )?regards[,!]?$/i.test(line))
  if (!sender && external && closing >= 0 && validContactName(lines[closing + 1]) && !/\b(?:ltd|limited|department|team)\b/i.test(lines[closing + 1])) {
    add('Contact person', lines[closing + 1], `External email signature: ${lines[closing + 1]}`, 85)
  }
  if (external) {
    const companyPattern = /\b(?:pvt\.?\s*ltd\.?|private limited|limited|ltd\.?|llc|inc\.?)$/i
    const companies = [...new Set(lines.filter(line => companyPattern.test(line) && validCustomerName(line) && line.length < 160))]
    if (companies.length === 1) {
      add('Sell-to customer', companies[0], `Company in customer address/signature: ${companies[0]}`, 92)
      const delivery = lines.findIndex(line => /^delivery address\s*:?$/i.test(line))
      const block = lines.slice(delivery + 1, delivery + 5)
      if (delivery >= 0 && block.includes(companies[0])) {
        const address = block.find(line => /\b\d{6}\b/.test(line) && /,/.test(line))
        add('Sell-to customer location', address, `Customer delivery address: ${address}`, 90)
      }
    }
  }
  const subject = lines.find(line => /^Subject\s*:/i.test(line))?.replace(/^Subject\s*:\s*/i, '')
  add('Subject', subject, `Email subject: ${subject}`, 96)
  const ref = (subject || '').match(/\b[A-Z][A-Z0-9]*\/(?:RFQ|ENQ|INQ)\/[A-Z0-9/-]+\b/i)?.[0]
  add('RFQ number', ref, `Enquiry reference in subject: ${ref}`, 94)
  const date = lines.find(line => /^Date\s*:/i.test(line))?.replace(/^Date\s*:\s*/i, '').replace(/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,\s*/i, '').split(',')[0]
  add('RFQ date', normalizeEnquiryDate(date), `Email date: ${date}`, 90)
  return facts
}

export function extractedLeadValues(fields = []) {
  const get = pattern => fields.find(f => f.state !== 'rejected' && pattern.test(f.k))?.v || ''
  return {
    sellTo: get(/^sell[- ]?to(?: customer)?$/i) || get(/^buyer$/i),
    contactPerson: get(/^contact person$/i), contactEmail: get(/^contact email$/i),
    contactPhone: get(/^(?:contact phone|mobile)$/i),
    sellToCustomerLocation: get(/^(?:sell[- ]?to customer location|customer (?:location|address))$/i),
    rfqNumber: get(/^RFQ number$/i), rfqDate: normalizeEnquiryDate(get(/^RFQ date$/i)),
    subject: get(/^Subject$/i), source: get(/^Lead source$/i),
  }
}
