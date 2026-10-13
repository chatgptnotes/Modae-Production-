// UI-only preferences. These keys are included in deployment storage cleanup.
export const documentsKeys = (user, scope) => ({
  device: `wintrack-modae-documents-v1:${encodeURIComponent(user)}`,
  tab: `wintrack-modae-documents-tab-v1:${encodeURIComponent(user)}:${scope}`,
})
const unavailableStorage = new Map()
const groups = ['Open', 'WON', 'Closed', 'Preserved']
function normalize(value = {}) {
  return {
    layout: value?.layout === 'list' ? 'list' : 'grid',
    sort: ['id', 'ascending', 'customer'].includes(value?.sort) ? value.sort : 'id',
    search: typeof value?.search === 'string' ? value.search : '',
    statusFilter: ['All', ...groups.slice(0, 3)].includes(value?.statusFilter) ? value.statusFilter : 'All',
    collapsed: Array.isArray(value?.collapsed) ? value.collapsed.filter(v => groups.includes(v)) : [],
    scroll: Object.fromEntries(Object.entries(value?.scroll && typeof value.scroll === 'object' ? value.scroll : {})
      .filter(([key, n]) => /^\/folders(?:\/|$)/.test(key) && Number.isFinite(n) && n >= 0)),
  }
}
export function createDocumentsPreferences(user, scope, local, session) {
  const keys = documentsKeys(user, scope)
  const fallback = unavailableStorage
  const read = (storage, key) => {
    let raw
    try { raw = storage.getItem(key); fallback.delete(key) } catch { return fallback.get(key) || {} }
    try { return JSON.parse(raw || '{}') } catch { return {} }
  }
  const write = (storage, key, value) => {
    try { storage.setItem(key, JSON.stringify(value)); fallback.delete(key) } catch { fallback.set(key, value) }
  }
  return {
    read: () => normalize({ ...read(local, keys.device), ...read(session, keys.tab) }),
    save(value) {
      const { layout, sort, ...navigation } = normalize(value)
      write(local, keys.device, { layout, sort })
      write(session, keys.tab, navigation)
    },
  }
}
