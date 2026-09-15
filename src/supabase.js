import { createClient } from '@supabase/supabase-js'

// Null when the env vars are absent OR malformed — the Folders page then falls
// back to the original mock (prompt-a-filename) behavior, so the prototype
// still runs without a Supabase project. createClient throws on a bad URL at
// module load, which would blank the whole app (seen on Vercel when the env
// var held a placeholder) — so validate and try/catch instead of trusting it.
// `import.meta.env` is injected by Vite and simply absent under plain Node, so
// importing this module from a test used to throw before the guard below ever
// ran. Treat "no env at all" the same as "not configured".
const env = import.meta.env || {}
const url = (env.VITE_SUPABASE_URL || '').trim()
const anonKey = (env.VITE_SUPABASE_ANON_KEY || '').trim()
function makeClient() {
  if (!/^https?:\/\/.+/i.test(url) || !anonKey) return null
  try {
    // This app has its own role/login layer and uses Supabase only as a
    // shared-data and storage backend. Do not persist or reuse a browser
    // Supabase session: a stale token can override the valid anon key and make
    // every hydration request fail with "Invalid API key".
    return createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  } catch (e) {
    console.warn('Supabase disabled — invalid configuration:', e?.message)
    return null
  }
}
export const supabase = makeClient()

export const BUCKET = 'opportunity-files'

export async function uploadAdminTemplate(path, file) {
  if (!supabase) throw new Error('Supabase storage is not configured')
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true })
  if (error) throw error
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

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
