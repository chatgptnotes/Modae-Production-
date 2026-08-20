import { MODAE_BRAND } from './branding/modae.js'

// Lead-stage outbound mail: the clarification request, and the Amber pre-quote
// processing fee request.
//
// 20 Aug review, in the client's words: the AI must *draft* the mail and a
// human must review it and click Send. The original flow proposed fully
// automated sending, which risks putting wrong information in front of a
// customer. So nothing in this module sends anything. It returns text. The
// only dispatch path is `gmailComposeHref` (src/utils.js) opening a compose
// window that a person still has to submit — see the send handler in
// src/pages/Inbox.jsx.
//
// The wording below is ported from the client's own templates
// (`modae doc/Sample Docs.zip` → `CLARIFICATION & QUOTE FEE MAIL.docx`), not
// invented, so an AI draft that is unavailable or refused degrades to the mail
// ModAE already sends by hand.
//
// Plain JS with no JSX on purpose: `node --test` has no transform step, so this
// is the layer the tests can actually execute.

export const DEFAULT_COMMON_MAILBOX = 'sales@modae.demo'

// The five questions the real clarification mail asks when an enquiry is thin.
// Used when the AI is unavailable, and appended to whatever the AI found so a
// draft is never shorter than the manual one.
export const STANDARD_CLARIFICATIONS = [
  'End user name',
  'Plant / project name & location',
  'Application / machine details (e.g. pump, motor, fan, compressor, blower)',
  'Machine operating speed (RPM), if available',
  'Any additional application-specific information that helps us recommend the most suitable solution',
]

// The pre-quote fee mail's document list.
export const QUOTE_FEE_DOCUMENTS = [
  'Completed KYC form',
  'PAN card',
  'GST registration certificate',
  'Certificate of incorporation',
  'EFT mandate along with a cancelled cheque',
  'End-user details (including project / application information, wherever applicable)',
]

const clean = v => String(v ?? '').trim()

// ---------------------------------------------------------------- the sender
// "Pre-assign common email, post-assign RS." Before a lead is assigned it goes
// out from the common mailbox that every enquiry lands in; once a salesperson
// owns it, it goes out from them, with the common mailbox copied so the thread
// stays visible to the team.
export function clarificationSender(lead, users = [], config = {}) {
  const common = clean(config.commonMailbox) || DEFAULT_COMMON_MAILBOX
  const owner = clean(lead?.assignedOwner)
  if (!owner) {
    return { address: common, role: '', name: 'Common mailbox', rule: 'common-mailbox', cc: '' }
  }
  const user = (users || []).find(u => u.role === owner)
  const address = clean(user?.email)
  if (!address) {
    // Assigned to a role with no address on file — fall back rather than
    // drafting a mail with an empty From, but say which rule applied.
    return { address: common, role: owner, name: 'Common mailbox', rule: 'common-mailbox', cc: '' }
  }
  return {
    address,
    role: owner,
    name: clean(user?.name) || owner,
    rule: 'assigned-owner',
    cc: common,
  }
}

export const senderLabel = sender => (sender.rule === 'assigned-owner'
  ? `${sender.name} (${sender.role}) — lead is assigned`
  : 'Common mailbox — lead is not assigned yet')

// ------------------------------------------------------------- what to draft
export function clarificationKindFor(lead, customerStatus = lead?.customerStatus || '') {
  if (customerStatus === 'Amber' && lead?.amberFeePaid !== true) return 'quote-fee'
  if ((lead?.ai?.missing || []).length) return 'clarification'
  return ''
}

const subjectFor = lead => {
  const subject = clean(lead?.subject) || 'your enquiry'
  return /^(re|fwd|fw):/i.test(subject) ? subject : `Re: ${subject}`
}

const recipientFor = lead => clean(lead?.from) || clean(lead?.sender)

const salutation = customer => {
  const name = clean(customer?.contactPerson)
  return name ? `Dear ${name},` : 'Dear Sir,'
}

function signature(sender) {
  const c = MODAE_BRAND.contact || {}
  const lines = ['Best Regards,', '']
  if (sender.rule === 'assigned-owner') lines.push(sender.name)
  lines.push(MODAE_BRAND.letterhead.legalName)
  lines.push(MODAE_BRAND.letterhead.salesOffice)
  lines.push('')
  lines.push(MODAE_BRAND.letterhead.tagline)
  lines.push(`Phone: ${c.phone_display || ''}`.trim())
  lines.push(`Email: ${sender.address}`)
  lines.push('Web: www.mod-ae.com')
  return lines.filter(l => l !== undefined).join('\n')
}

const bullet = items => items.map(item => `  •  ${item}`).join('\n')

// --------------------------------------------------------- the two templates
// Missing scope. `items` is whatever the AI could not find on the enquiry; the
// standard five are appended so a sparse extraction never produces a mail that
// asks less than the manual template would.
export function clarificationBody(lead, { customer = null, sender, items = [], aiBody = '' } = {}) {
  if (clean(aiBody)) return clean(aiBody)
  const subject = clean(lead?.subject) || 'your requirement'
  const asked = clarificationItems(lead, items)
  return [
    salutation(customer),
    '',
    `Thank you for sharing the RFQ for ${subject}.`,
    '',
    'We are currently preparing our offer along with the duly filled and signed technical compliance sheet. '
      + 'Before finalizing that, we request you to kindly share the following details to ensure the proposed '
      + 'solution is best suited for your application:',
    '',
    bullet(asked),
    '',
    'We look forward to your response and will submit our offer at the earliest upon receiving the above details.',
    'Thank you.',
    '',
    signature(sender),
  ].join('\n')
}

// What each standard question is really asking, so "Operating speed (RPM)"
// from the extraction and "Machine operating speed (RPM), if available" from
// the template are recognised as the same request. Index-aligned with
// STANDARD_CLARIFICATIONS — keep them in step.
const STANDARD_MATCHERS = [
  /end[\s-]?user/i,
  /plant|project|location|site\b/i,
  /application|machine|pump|motor|fan\b|compressor|blower|equipment/i,
  /speed|rpm/i,
  /additional|any other|further detail/i,
]

// The AI's missing list first, in the order it found them, then any of the
// standard questions it did not already cover.
export function clarificationItems(lead, extra = []) {
  const found = [...(lead?.ai?.missing || []), ...extra].map(clean).filter(Boolean)
  const covered = i => found.some(f => STANDARD_MATCHERS[i].test(f))
  return [...found, ...STANDARD_CLARIFICATIONS.filter((_, i) => !covered(i))]
}

// Amber: KYC documents plus the pre-quote processing fee.
export function quoteFeeBody(lead, { customer = null, sender, config = {}, aiBody = '' } = {}) {
  if (clean(aiBody)) return clean(aiBody)
  const fee = config.amberFee || {}
  const amount = Number(fee.amount ?? 25000)
  const amountText = `${fee.cur === 'USD' ? '$' : '₹'}${amount.toLocaleString('en-IN')}`
  return [
    salutation(customer),
    '',
    'Thank you for your enquiry, which has been referred to us by our Head Office for further support. '
      + 'ModAE India is the authorized distributor for B&K Vibro products.',
    '',
    'To enable us to process your request and prepare our offer, we kindly request you to share the following '
      + 'documents at your earliest convenience:',
    '',
    bullet(QUOTE_FEE_DOCUMENTS),
    '',
    `As part of our standard compliance process, a pre-quote processing and administrative fee of ${amountText} `
      + 'is applicable prior to the preparation of the quotation.',
    '',
    'Please note that this amount is fully adjustable against the final order value, provided a Purchase Order '
      + 'is placed within the validity period of our quotation.',
    '',
    'Kindly confirm your acceptance of the above so that we may issue the Proforma Invoice and initiate the '
      + 'quotation process. We appreciate your cooperation and look forward to supporting your requirements.',
    '',
    signature(sender),
  ].join('\n')
}

// ------------------------------------------------------------------ the draft
// One shape for both kinds, so the inbox renders a single editor and the send
// handler has one thing to stamp.
export function draftClarification(lead, {
  kind = '', customer = null, users = [], config = {}, aiBody = '', items = [],
} = {}) {
  const sender = clarificationSender(lead, users, config)
  const resolved = kind || clarificationKindFor(lead) || 'clarification'
  const body = resolved === 'quote-fee'
    ? quoteFeeBody(lead, { customer, sender, config, aiBody })
    : clarificationBody(lead, { customer, sender, items, aiBody })
  const subject = resolved === 'quote-fee'
    ? `${subjectFor(lead)} — KYC documents & pre-quote processing fee`
    : `${subjectFor(lead)} — clarifications required`
  return {
    kind: resolved,
    from: sender.address,
    fromRule: sender.rule,
    fromLabel: senderLabel(sender),
    to: recipientFor(lead),
    cc: sender.cc,
    subject,
    body,
    items: resolved === 'quote-fee' ? QUOTE_FEE_DOCUMENTS : clarificationItems(lead, items),
    draftedBy: clean(aiBody) ? 'AI' : 'Template',
  }
}

// ------------------------------------------------------------- lead patching
// A draft is never a sent mail. `status` only reaches 'Sent' through
// sentPatch(), which the inbox calls after the compose window has been opened
// by a human click.
export function draftPatch(draft, { now = new Date() } = {}) {
  return {
    clarification: {
      status: 'Draft',
      kind: draft.kind,
      draftedAt: new Date(now).toISOString(),
      draftedBy: draft.draftedBy,
      from: draft.from,
      fromRule: draft.fromRule,
      to: draft.to,
      cc: draft.cc,
      subject: draft.subject,
      body: draft.body,
      items: draft.items,
      sentAt: '',
      sentBy: '',
    },
  }
}

export function sentPatch(record, { sentBy = '', now = new Date() } = {}) {
  return {
    clarification: {
      ...(record || {}),
      status: 'Sent',
      sentAt: new Date(now).toISOString(),
      sentBy,
    },
  }
}

// The customer answered — close the clarification so processLeadDeadlines stops
// counting down towards an automatic drop.
export function answeredPatch(record, { now = new Date() } = {}) {
  const at = new Date(now).toISOString()
  return {
    clarification: { ...(record || {}), status: 'Answered', answeredAt: at },
    clarificationCompletedAt: at,
  }
}
