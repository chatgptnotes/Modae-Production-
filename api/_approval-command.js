import { planApprovalDecision } from './_approval-planner.js'
import { createHash } from 'node:crypto'

// Railway currently runs one replica. Share the limiter across all handlers in
// this process; replacing it with a distributed limiter is required to scale out.
const admission = new Map()
let active = 0
export function admitApprovalCommand(token) {
  const now = Date.now()
  for (const [key, value] of admission) if (value.until <= now) admission.delete(key)
  const key = createHash('sha256').update(token).digest('hex')
  const bucket = admission.get(key) || { count: 0, until: now + 60000 }
  if (active >= 16 || bucket.count >= 30 || !admission.has(key) && admission.size >= 2048) {
    throw Object.assign(new Error('Too many decisions. Wait briefly and retry the same command.'), { status: 429, code: 'RATE_LIMITED' })
  }
  admission.set(key, { ...bucket, count: bucket.count + 1 }); active++
  return () => { active-- }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const invalid = () => { throw Object.assign(new Error('Invalid approval command.'), { status: 422, code: 'PT422' }) }
export function validateApprovalCommand(raw, generation) {
  const keys = ['requestId','operationId','expectedRev','generation','action','comment','commentReview']
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(key => !keys.includes(key))
    || typeof raw.requestId !== 'string' || !raw.requestId || raw.requestId.length > 200
    || !uuid.test(raw.operationId || '') || !Number.isSafeInteger(raw.expectedRev) || raw.expectedRev < 1
    || typeof raw.generation !== 'string' || !/^(0|[1-9]\d*)$/.test(raw.generation) || raw.generation !== generation
    || !['accept','reject'].includes(raw.action) || typeof raw.comment !== 'string' || !raw.comment.trim() || raw.comment.length > 4000) invalid()
  const review = raw.commentReview ?? null
  if (review !== null && (typeof review !== 'object' || Array.isArray(review) || JSON.stringify(review).length > 16000
    || (review.requiredActions != null && (!Array.isArray(review.requiredActions) || review.requiredActions.some(item => typeof item !== 'string'))))) invalid()
  return { requestId: raw.requestId, operationId: raw.operationId.toLowerCase(), expectedRev: raw.expectedRev,
    generation: raw.generation, action: raw.action, comment: raw.comment, commentReview: review }
}

export const approvalErrorStatus = error => error.status || ({ PT401:401,PT403:403,PT404:404,PT409:409,PT422:422,'42501':403,'40001':409,'22P02':422,'22023':422 }[error.code]) || 503

export async function executeApprovalCommand(client, authUser, command) {
  const args = { p_actor: authUser.id, p_actor_email: authUser.email || '', p_command: command }
  const probe = () => client.rpc('decide_approval', { ...args, p_plan: null })
  const replay = await probe()
  if (!replay.error) return replay.data
  if (replay.error.code !== 'PT428') throw replay.error
  try {
    const snapshot = await client.rpc('approval_decision_context', { p_id: command.requestId })
    if (snapshot.error) throw snapshot.error
    const plan = planApprovalDecision(snapshot.data, authUser, command)
    const result = await client.rpc('decide_approval', { ...args, p_plan: plan })
    if (result.error) throw result.error
    return result.data
  } catch (error) {
    // A simultaneous identical command may have committed while we planned.
    // Probe its receipt before returning a stale-state/permission failure.
    const replayAfterRace = await probe()
    if (!replayAfterRace.error) return replayAfterRace.data
    if (replayAfterRace.error.code !== 'PT428') throw replayAfterRace.error
    throw error
  }
}
