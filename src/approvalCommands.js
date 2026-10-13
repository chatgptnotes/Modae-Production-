import { workspaceDeploymentHeaders } from './workspaceDeployment.js'
// This queue is device-local coordination state, never shared workspace state.
export function createApprovalCommands({ identity, revision, send, storage }) {
  const pending = new Map()
  let scope = ''
  let epoch = 0
  const storageKey = 'wintrack-approval-commands'
  function synchronize() {
    const current = identity()
    const key = `${current.actorId || ''}:${current.generation}`
    if (scope !== key) {
      pending.clear(); scope = key; epoch++
      try {
        const saved = JSON.parse(storage?.getItem(storageKey) || 'null')
        if (saved?.scope === scope) for (const [id, entry] of saved.entries || []) {
          pending.set(id, { command: entry.command, uncertain: true })
        }
      } catch { /* blocked storage is optional */ }
    }
    return current
  }
  function persist() {
    try { storage?.setItem(storageKey, JSON.stringify({ scope, entries: [...pending].map(([id, e]) => [id, { command: e.command }]) })) } catch { /* optional */ }
  }
  function clear() {
    pending.clear(); scope = ''; epoch++
    try { storage?.removeItem(storageKey) } catch { /* optional */ }
  }
  function decide(requestId, input) {
    const current = synchronize()
    if (!current.actorId || current.generation === '') return Promise.resolve({ kind: 'session-changed' })
    let entry = pending.get(requestId)
    if (entry?.promise) return entry.promise
    if (!entry) {
      const expectedRev = revision(requestId)
      if (!Number.isSafeInteger(expectedRev) || expectedRev < 1) return Promise.resolve({ kind: 'refresh-required' })
      entry = { command: { requestId, operationId: crypto.randomUUID(), expectedRev, generation: current.generation,
        action: input.action, comment: input.comment, commentReview: input.commentReview ?? null }, uncertain: false }
      pending.set(requestId, entry)
    }
    const submittedScope = scope
    const submittedEpoch = epoch
    persist()
    entry.promise = (async () => {
      let result
      try { result = await send(entry.command) } catch { result = { kind: 'uncertain' } }
      const latest = identity()
      if (epoch !== submittedEpoch || `${latest.actorId || ''}:${latest.generation}` !== submittedScope) return { kind: 'session-changed' }
      if (result.kind === 'committed') pending.delete(requestId)
      else if (result.kind === 'uncertain' || entry.uncertain) {
        entry.uncertain = true
        result = { kind: 'uncertain', error: result }
      } else if (result.status !== 429) pending.delete(requestId)
      return result
    })().finally(() => { delete entry.promise; if (epoch === submittedEpoch) persist() })
    return entry.promise
  }
  return { decide, pending, clear }
}

export async function sendApprovalCommand(client, command, fetcher = fetch) {
  const { data } = await client.auth.getSession()
  const token = data?.session?.access_token
  if (!token) return { kind: 'rejected', status: 401, code: 'SESSION_REQUIRED' }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)
  try {
    const response = await fetcher('/api/workspace/data', {
      method: 'POST', signal: controller.signal,
      headers: { ...workspaceDeploymentHeaders(), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-workspace-generation': command.generation },
      body: JSON.stringify({ operation: 'approval_decision', command })
    })
    const body = await response.json().catch(() => null)
    if (response.ok && body?.data?.operationId === command.operationId && body.data.requestId === command.requestId
      && body.data.generation === command.generation && Number.isSafeInteger(body.data.committedRev)) return { kind: 'committed', data: body.data }
    if (!body || response.ok || response.status >= 500) return { kind: 'uncertain' }
    return { kind: 'rejected', status: response.status, code: body.code, message: body.error }
  } catch { return { kind: 'uncertain' } }
  finally { clearTimeout(timer) }
}
