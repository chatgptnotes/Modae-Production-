// The lead workflow is derived from the saved lead record so the progress
// indicator cannot drift away from the editable data shown on the page.
export const LEAD_WORKFLOW_STEPS = [
  { id: 'L-01', label: 'Receive lead', short: 'Receive' },
  { id: 'L-02', label: 'Initial review', short: 'Review' },
  { id: 'L-03', label: 'Business relevance', short: 'Relevance' },
  { id: 'L-04', label: 'Common mailbox', short: 'Mailbox' },
  { id: 'L-05', label: 'Region and owner', short: 'Region' },
  { id: 'L-06', label: 'Opportunity type', short: 'Type' },
  { id: 'AI', label: 'AI validation', short: 'AI validation' },
  { id: 'CLASS', label: 'Customer classification', short: 'Classification' },
  { id: 'REG', label: 'Opportunity registration', short: 'Registration' },
]

export function leadWorkflow(lead, { customerStatus = '', med = 75 } = {}) {
  const fields = lead?.ai?.fields || []
  const missing = (lead?.ai?.missing || []).filter(label => {
    const text = String(label || '').toLowerCase()
    if (text.includes('customer name')) return !String(lead?.sellTo || fields.find(f => /sell[- ]?to.*customer/i.test(f.k))?.v || '').trim()
    if (text.includes('quantit') || text.includes('specification')) {
      return !(lead?.ai?.lineItems || []).some(item => String(item.description || item.desc || '').trim() && Number(item.qty) > 0)
    }
    return true
  })
  const decided = fields.filter(f => f.state !== 'pending').length
  const pendingLow = fields.filter(f => f.state === 'pending' && Number(f.conf || 0) < med).length
  const hasReview = !!lead?.readAt || decided > 0 || lead?.status !== 'New'
  const hasRelevanceDecision = ['Qualified', 'Converted', 'Dropped'].includes(lead?.status)
  // L-04. `mailbox` is set when the lead is taken in, so this no longer depends
  // on the source string spelling out "common mailbox" — `source` now records
  // where the enquiry originated, not how it reached us. The older shapes are
  // still honoured so saved leads keep their progress.
  const hasMailbox = lead?.mailbox === true
    || /common mailbox/i.test(`${lead?.source || ''} ${lead?.channel || ''}`)
    || !!lead?.ai
  const hasOwner = !!(lead?.assignedOwner || lead?.suggestedOwner)
  const hasType = !!(lead?.route || lead?.parse?.oppType || lead?.ai?.route)
  // Missing AI information is actionable follow-up, not a prerequisite for
  // creating the opportunity. Low-confidence fields still require a human
  // decision before the lead can advance.
  const aiComplete = fields.length > 0 && pendingLow === 0
  const classified = !!(customerStatus || lead?.customerStatus || lead?.redFlag)
  const registered = !!lead?.oppId || lead?.status === 'Converted'

  const done = [
    true,
    hasReview,
    hasRelevanceDecision,
    hasMailbox,
    hasOwner,
    hasType,
    aiComplete,
    classified,
    registered,
  ]
  // A converted lead has passed the lead gate and is now owned by the
  // opportunity workflow, even if an older record still contains stale AI
  // warnings from before registration.
  const displayedDone = registered ? done.map(() => true) : done
  const currentIndex = displayedDone.findIndex(value => !value)
  const activeIndex = currentIndex === -1 ? displayedDone.length - 1 : currentIndex
  const terminal = lead?.status === 'Dropped' ? 'dropped' : registered ? 'converted' : ''
  const blocked = lead?.status === 'Dropped'
    ? 'Lead discarded'
    : pendingLow > 0
      ? `${pendingLow} AI field${pendingLow === 1 ? '' : 's'} need review`
      : ''

  return {
    steps: LEAD_WORKFLOW_STEPS.map((step, index) => ({
      ...step,
      state: displayedDone[index] ? 'complete' : index === activeIndex ? (blocked ? 'blocked' : 'current') : 'upcoming',
    })),
    activeIndex,
    complete: registered,
    terminal,
    blocked,
    decided,
    totalFields: fields.length,
  }
}
