const normalize = value => String(value ?? '')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim()

// Approval memory is scoped to the opportunity, decision type, revision, and
// business detail. It is never a global approval cache.
export const approvalMemoryKey = request => [
  request?.oppId,
  request?.type,
  request?.rev,
  request?.findingKey || request?.detail || request?.blockingReason || request?.text,
].map(normalize).join('|')

export const reviewFindingKey = issue => [
  issue?.code,
  issue?.text,
  issue?.evidence,
].map(normalize).join('|')
