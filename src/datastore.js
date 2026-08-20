import { supabase } from './supabase.js'

// Server persistence for the store: one JSONB row per top-level state slice in
// public.app_state (see supabase-setup.sql). Mirrors the filestore facade —
// every function no-ops when Supabase isn't configured, so the app keeps its
// original localStorage-only behavior without env vars.

// Per-device/session state that must never be shared across browsers.
export const LOCAL_ONLY = ['viewMode', 'viewModePinned', 'tabletTheme', 'spSync', 'auth', 'role',
  'inboxShowAll']

export const dbEnabled = () => !!supabase

const TABLE = 'app_state'

// → { empty, slices: {key: value} } | null when disabled or on error
// (caller stays on localStorage and may retry later).
export async function loadAll() {
  if (!supabase) return null
  try {
    const { data, error } = await supabase.from(TABLE).select('key, value')
    if (error) throw error
    const slices = {}
    for (const row of data || []) slices[row.key] = row.value
    return { empty: !data || data.length === 0, slices }
  } catch (e) {
    console.warn('Supabase load failed — staying on localStorage:', e?.message)
    return null
  }
}

// dirty: {key: value}. Throws on error so the caller can keep the keys dirty.
export async function saveSlices(dirty) {
  if (!supabase) return
  const rows = Object.entries(dirty).map(([key, value]) => ({
    key, value, updated_at: new Date().toISOString(),
  }))
  if (!rows.length) return
  const { error } = await supabase.from(TABLE).upsert(rows)
  if (error) throw error
}

// Reset Demo: overwrite every slice with seeds and drop stray rows. Upserting
// (rather than delete-all) means other open devices refetch seeds on focus
// instead of racing to re-push their stale state.
export async function resetAll(seedMap) {
  if (!supabase) return
  await saveSlices(seedMap)
  const { error } = await supabase.from(TABLE).delete()
    .not('key', 'in', `(${Object.keys(seedMap).join(',')})`)
  if (error) throw error
}
