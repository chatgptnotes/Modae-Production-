// Readiness gates for sending a proposal out, per the Aug 10 review:
// Red customers need LJS clearance, commercial deviations need AH approval,
// and "approved with conditions" decisions block until the salesperson
// confirms each condition is incorporated in the proposal.
//
// Blocker shape: { key, severity: 'block'|'wait'|'info', text,
//                  approvalType?, approver?, approvalId?, condIdx? }

export function oppBlockers(opp, proposal, approvals) {
  if (!opp) return []
  const b = []
  const mine = approvals.filter(a => a.oppId === opp.id)
  const hasApproved = type => mine.some(a => a.type === type
    && (a.status === 'Approved' || a.status === 'Approved with conditions'))
  const hasOpen = type => mine.some(a => a.type === type && a.status === 'Pending')

  if (opp.customerStatus === 'Red' && !hasApproved('Red customer clearance')) {
    if (hasOpen('Red customer clearance')) {
      b.push({ key: 'red-wait', severity: 'wait', text: 'Red customer clearance awaiting LJS decision.' })
    } else {
      b.push({
        key: 'red', severity: 'block',
        text: 'Red customer — high risk / unpaid record. LJS clearance required before any proposal goes out.',
        approvalType: 'Red customer clearance', approver: 'LJS',
      })
    }
  }

  if (opp.customerStatus === 'Blue') {
    b.push({ key: 'kyc', severity: 'info', text: 'New (Blue) customer — KYC verification pending with admin.' })
  }
  if (opp.customerStatus === 'Amber' && !hasApproved('Amber credit terms') && !hasOpen('Amber credit terms')) {
    b.push({
      key: 'amber', severity: 'info',
      text: 'Amber customer — credit terms are subject to AH approval.',
      approvalType: 'Amber credit terms', approver: 'AH',
    })
  }

  const devs = (proposal?.terms || []).filter(t => t.status === 'Deviation')
  if (devs.length && !hasApproved('Commercial deviation')) {
    if (hasOpen('Commercial deviation')) {
      b.push({ key: 'dev-wait', severity: 'wait', text: 'Commercial-deviation approval awaiting AH decision.' })
    } else {
      b.push({
        key: 'dev', severity: 'block',
        text: `${devs.length} commercial deviation${devs.length > 1 ? 's' : ''} (${devs.map(d => d.term).join(', ')}) need${devs.length > 1 ? '' : 's'} approval before submission.`,
        approvalType: 'Commercial deviation', approver: 'AH',
      })
    }
  }

  for (const a of mine.filter(x => x.status === 'Approved with conditions')) {
    a.conditions.forEach((c, i) => {
      if (!c.incorporated) {
        b.push({
          key: `cond-${a.id}-${i}`, severity: 'block',
          text: `Condition from ${a.approver}: "${c.text}" — confirm it is incorporated in the proposal.`,
          approvalId: a.id, condIdx: i,
        })
      }
    })
  }

  // Any other pending request (e.g. amber terms sent for approval).
  for (const a of mine.filter(x => x.status === 'Pending'
    && !['Red customer clearance', 'Commercial deviation'].includes(x.type))) {
    b.push({ key: `wait-${a.id}`, severity: 'wait', text: `${a.type} awaiting ${a.approver} decision.` })
  }

  return b
}

export const isBlocked = blockers => blockers.some(x => x.severity === 'block' || x.severity === 'wait')
