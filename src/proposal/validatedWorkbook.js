// A reviewed upload becomes the customer-facing proposal only after the
// validation checkpoint succeeds. Keeping this rule in one place prevents the
// Proposal page and the submission/workbench pages from choosing different
// artifacts for the same opportunity.
export const VALIDATED_REVIEW_STATUSES = new Set(['Validated', 'Override accepted'])

export const hasValidatedUploadedWorkbook = proposal =>
  VALIDATED_REVIEW_STATUSES.has(proposal?.reviewStatus)
  && Array.isArray(proposal?.reviewedUpload?.sheets)
  && proposal.reviewedUpload.sheets.length > 0

export const isValidatedUploadStorageReady = proposal => {
  if (!hasValidatedUploadedWorkbook(proposal)) return true
  const status = proposal?.reviewedUpload?.storageStatus
  // Older validated uploads predate storageStatus and remain valid because
  // their local blob key is already usable by the submission flow.
  return !status || status === 'uploaded'
}

export const validatedWorkbookPreview = proposal =>
  hasValidatedUploadedWorkbook(proposal)
    ? { sheets: proposal.reviewedUpload.sheets }
    : null

export const validatedWorkbookStorageKey = (proposal, oppId) =>
  proposal?.reviewedUpload?.blobKey || `proposal-review-${oppId}`

export const validatedWorkbookFilename = proposal =>
  proposal?.reviewedUpload?.filename || 'validated-proposal.xlsx'
