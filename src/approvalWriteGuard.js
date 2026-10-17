const same = (a,b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
const deny = () => { throw Object.assign(new Error('Use the approval decision command; decision evidence is server-owned.'), { status: 403, code: 'PT403' }) }
// Called at both generic server write boundaries, including administrators.
export function assertNoApprovalCommandWrite(entity, before, after, recordId = after?.id) {
  if (entity === 'audit' && ([recordId, before?.id, after?.id].some(id => String(id || '').startsWith('BACKUP-RESTORE:')) || before?.kind === 'backup_restore_command' || after?.kind === 'backup_restore_command')) throw Object.assign(new Error('Backup restoration audit receipts are server-owned.'), { status: 403, code: 'PT403' })
  if (entity === 'audit' && ([recordId, before?.id, after?.id].some(id => String(id || '').startsWith('AI-INTEGRATIONS:')) || before?.kind === 'ai_integration_command' || after?.kind === 'ai_integration_command')) throw Object.assign(new Error('AI integration audit receipts are server-owned.'), { status: 403, code: 'PT403' })
  if (entity === 'audit' && (String(recordId || '').startsWith('APPROVAL-COMMAND:') || String(after?.id || '').startsWith('APPROVAL-COMMAND:') || after?.kind === 'approval_command')) deny()
  if (entity === 'approvals') {
    if (!before) {
      if (after.status && after.status !== 'Pending' || Object.keys(after.decisions || {}).length || after.decidedBy || after.decisionTs) deny()
    } else {
      const inputs = ['needed','approver','anyOf','leadId','type','approvalSnapshot','patch','customerName','pricingSignature','pricingRows','coversPricingThreshold','blockerKey','targetMilestone','requestedValue','listValue','discountPct','markupPct','rev']
      if (inputs.some(key => !same(before[key], after[key]))) deny()
      // workspaceAccess separately verifies the first link points to the
      // opportunity converted from this request's lead, including signed rows.
      if (!same(before.oppId, after.oppId) && before.oppId) deny()
      if (['decisions','decidedBy','decisionTs','decisionNote','rejectionActions','rejectionCommentReview'].some(key => !same(before[key],after[key]))) deny()
      if (after.status !== before.status && !(before.status === 'Pending' && after.status === 'Cancelled')) deny()
    }
  }
  if (entity === 'proposals') {
    if (!same(before?.approvedPricing,after?.approvedPricing)) deny()
    if (after?.releaseStatus === 'Released' && before?.releaseStatus !== 'Released') deny()
    const receipts = value => (value?.pricingHistory || []).filter(row => row.approvalId)
    if (!same(receipts(before),receipts(after))) deny()
  }
}

export const publicAuditEvent = row => {
  if (row?.kind !== 'approval_command') return row
  const { command, result, ...event } = row
  return event
}
