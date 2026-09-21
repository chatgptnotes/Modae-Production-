export const isProposalSubmission = communication =>
  communication?.kind === 'submission' || communication?.kind === 'proposal-email'

export const submissionRevision = communication => {
  const revision = communication?.revision ?? communication?.proposalSnapshot?.revision
  return revision == null || revision === '' ? '' : String(revision)
}

export const submissionsForRevision = (communications, revision) =>
  (communications || []).filter(communication =>
    isProposalSubmission(communication) && submissionRevision(communication) === String(revision ?? ''))

export const latestSubmissionForRevision = (communications, revision) =>
  submissionsForRevision(communications, revision)[0] || null

export const submissionStatusLabel = submission => {
  if (submission?.status === 'sent') return 'Sent to customer'
  if (submission?.status === 'draft') return 'Draft opened'
  return 'Not submitted'
}
