// Session-local only; never persisted. Failed and invalidated reads are not cached.
export function createWorkspaceViewCache({ now = Date.now, ttl = 15000 } = {}) {
  const values = new Map(), pending = new Map()
  let epoch = 0
  return {
    clear() { epoch++; values.clear(); pending.clear() },
    async read(key, load, { force = false } = {}) {
      if (pending.has(key)) return pending.get(key)
      const cached = values.get(key)
      if (!force && cached && now() - cached.at < ttl) return cached.value
      const started = epoch
      const request = Promise.resolve().then(load).then(value => {
        if (started !== epoch) throw Object.assign(new Error('Workspace changed during the read. Retry.'), { code: 'VIEW_READ_INVALIDATED' })
        values.set(key, { value, at: now() })
        return value
      }).finally(() => { if (pending.get(key) === request) pending.delete(key) })
      pending.set(key, request)
      return request
    },
  }
}
