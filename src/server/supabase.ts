import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types.js'

export function createServiceClient(url: string, serviceRoleKey: string): SupabaseClient<Database> {
  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
