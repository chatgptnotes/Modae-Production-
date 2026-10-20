// Session-local only. Failed responses never replace last-good display data.
export const WORKSPACE_VIEW_TTL = 180000
export function createWorkspaceViewCache({ now = Date.now, ttl = WORKSPACE_VIEW_TTL, maxEntries = 20 } = {}) {
  const values = new Map(), pending = new Map()
  let epoch = 0
  return {
    clear() { epoch++; values.clear(); pending.clear() },
    patch(visit) {
      epoch++; pending.clear()
      for (const entry of values.values()) { visit(entry.value); entry.invalid = true }
    },
    evict(predicate) {
      epoch++; pending.clear()
      for (const [key, entry] of values) if (predicate(key, entry.value)) values.delete(key)
    },
    invalidate(predicate = () => true) {
      epoch++; pending.clear()
      for (const [key, entry] of values) if (predicate(key, entry.value)) entry.invalid = true
    },
    peek(key) {
      const entry = values.get(key)
      if (!entry) return null
      values.delete(key); values.set(key, entry)
      return { value: entry.value, at: entry.at, fresh: !entry.invalid && now() - entry.at < ttl }
    },
    async read(key, load, { force = false } = {}) {
      if (pending.has(key)) return pending.get(key)
      const cached = values.get(key)
      if (!force && cached && !cached.invalid && now() - cached.at < ttl) {
        values.delete(key); values.set(key, cached)
        return cached.value
      }
      const started = epoch
      const request = Promise.resolve().then(load).then(value => {
        if (started !== epoch) throw Object.assign(new Error('Workspace changed during the read. Retry.'), { code: 'VIEW_READ_INVALIDATED' })
        values.delete(key)
        values.set(key, { value, at: now(), invalid: false })
        while (values.size > maxEntries) values.delete(values.keys().next().value)
        return value
      }).finally(() => { if (pending.get(key) === request) pending.delete(key) })
      pending.set(key, request)
      return request
    },
  }
}
