import { validFont } from './fontChoices.js'
export { FONT_CHOICES, validFont } from './fontChoices.js'
export const fontPreferenceKey = key => `wintrack-font:${encodeURIComponent(key)}`
export const normalizeUserPreferences = value => ({
  font: validFont(value?.font) ? value.font : 'candara',
  sidebarCompact: value?.sidebarCompact === true,
  leadDetailsCollapsed: value?.leadDetailsCollapsed === true,
})
const readCache = (storage, key) => {
  try { return normalizeUserPreferences(JSON.parse(storage?.getItem(fontPreferenceKey(key)) || 'null')) } catch { return normalizeUserPreferences(null) }
}

// Each signed-in account owns a separate session. Responses from a retired
// session, or reads started before a write, cannot overwrite the current choice.
export function createFontPreferenceSession({ key, remote = false, storage, request }) {
  let state = { ...readCache(storage, key), rev: 0, loaded: !remote, loading: false, saving: false, error: '' }
  let sequence = 0, disposed = false
  const listeners = new Set()
  const emit = patch => { state = { ...state, ...patch }; listeners.forEach(listener => listener()) }
  const current = token => !disposed && token === sequence
  const accept = result => {
    if (!validFont(result?.font) || !Number.isSafeInteger(result.rev) || result.rev < 0) throw new Error('Could not read font settings. Please retry.')
    const preferences = normalizeUserPreferences({ ...state, ...result })
    try { storage?.setItem(fontPreferenceKey(key), JSON.stringify(preferences)) } catch { /* Keep the in-memory preference. */ }
    emit({ ...preferences, rev: result.rev, loaded: true, loading: false, saving: false, error: '' })
  }
  const saveChanges = async (patch, optimistic = false) => {
    if (disposed) throw new Error('This account session has ended.')
    if (!state.loaded) throw new Error('Load your saved settings before saving.')
    if (state.saving) throw new Error('A preference change is already being saved.')
    const token = ++sequence, rev = state.rev, previous = normalizeUserPreferences(state)
    emit({ ...(optimistic ? patch : {}), saving: true, loading: false, error: '' })
    try {
      const result = remote ? await request('PUT', { ...patch, rev }) : { ...previous, ...patch, rev: rev + 1 }
      if (current(token)) accept(result)
    } catch (error) {
      if (current(token)) emit({ ...previous, saving: false, error: error.message || 'Could not save preferences.' })
      throw error
    }
  }
  return {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    activate() { disposed = false },
    dispose() { disposed = true; sequence++ },
    async refresh() {
      if (disposed || state.saving) return
      if (!remote) { emit({ ...readCache(storage, key) }); return }
      const token = ++sequence
      emit({ loading: true, error: '' })
      try { const result = await request('GET'); if (current(token)) accept(result) }
      catch (error) { if (current(token)) emit({ loading: false, error: error.message || 'Could not load font settings.' }) }
    },
    async save(font) {
      if (!validFont(font)) throw new Error('Choose a supported font.')
      return saveChanges({ font })
    },
    async saveLayout(patch) {
      if (!patch || !Object.keys(patch).length || Object.entries(patch).some(([field, value]) =>
        !['sidebarCompact', 'leadDetailsCollapsed'].includes(field) || typeof value !== 'boolean')) {
        throw new Error('Choose a valid sidebar preference.')
      }
      return saveChanges(patch, true)
    },
  }
}
