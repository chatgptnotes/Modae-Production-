import { createClient } from '@supabase/supabase-js'

// Null when the env vars are absent — the Folders page then falls back to the
// original mock (prompt-a-filename) behavior, so the prototype still runs
// without a Supabase project.
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
export const supabase = url && anonKey ? createClient(url, anonKey) : null

export const BUCKET = 'opportunity-files'

// Objects live at <oppId>/<subfolder>/<filename>.
export async function uploadFile(path, file) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true })
  if (error) throw error
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

export async function removePaths(paths) {
  if (!paths.length) return
  const { error } = await supabase.storage.from(BUCKET).remove(paths)
  if (error) throw error
}

// Storage has no real directories — deleting a "folder" means listing every
// object under the prefix (entries without an id are pseudo-folders) and
// removing them in one call.
export async function removePrefix(prefix) {
  const collect = async pre => {
    const { data, error } = await supabase.storage.from(BUCKET).list(pre, { limit: 1000 })
    if (error) throw error
    const out = []
    for (const entry of data || []) {
      if (entry.id) out.push(`${pre}/${entry.name}`)
      else out.push(...await collect(`${pre}/${entry.name}`))
    }
    return out
  }
  await removePaths(await collect(prefix))
}
