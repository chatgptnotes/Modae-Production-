export const SYNC_ENTITIES = ['leads', 'opportunities', 'proposals', 'approvals']
export const recordKey = (entity, id) => `${entity}:${id}`
export class DraftRegistry {
  entries = new Map()
  listeners = new Set()
  subscribe = fn => { this.listeners.add(fn); return () => this.listeners.delete(fn) }
  notify() { for (const fn of this.listeners) fn() }
  get(entity, id) { return this.entries.get(recordKey(entity,id)) }
  edit(entity, id, base, localOnly = false) {
    if (![...SYNC_ENTITIES,'spares_lines','clarifications'].includes(entity) || !base) return
    const key = recordKey(entity,id), previous = this.entries.get(key)
    this.entries.set(key, previous ? { ...previous, seq: previous.seq + 1, touchedAt: Date.now(), localOnly: previous.localOnly || localOnly }
      : { entity, id, base: structuredClone(base), seq: 1, status: 'dirty', touchedAt: Date.now(), localOnly })
    this.notify()
  }
  blocked(entity, id) { return ['conflict','unavailable'].includes(this.get(entity,id)?.status) }
  observe(entity, id, remote) {
    const entry = this.get(entity,id)
    if (!entry) return true
    if (remote.conflict || !remote.available || remote.rev > entry.base.rev) {
      entry.remote = remote
      entry.status = remote.available ? 'conflict' : 'unavailable'
      this.notify()
    }
    return false
  }
  saved(entity, id, saved, seq) {
    const entry = this.get(entity,id)
    if (!entry) return
    if (entry.status === 'unavailable' || entry.remote?.rev > saved.rev) {
      entry.base = saved; this.notify(); return
    }
    if (entry.seq === seq && !entry.localOnly) this.entries.delete(recordKey(entity,id))
    else { entry.base = saved; entry.status = 'dirty'; delete entry.remote }
    this.notify()
  }
  clear(entity,id) { this.entries.delete(recordKey(entity,id)); this.notify() }
  reset() { this.entries.clear(); this.notify() }
}
export const workspaceDrafts = new DraftRegistry()
