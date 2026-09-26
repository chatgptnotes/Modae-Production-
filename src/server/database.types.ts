export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

type JsonTable = {
  Row: { id: string; data: Json; created_at?: string; updated_at?: string; deleted_at?: string | null }
  Insert: { id: string; data: Json; created_at?: string; updated_at?: string; deleted_at?: string | null }
  Update: Partial<{ data: Json; updated_at: string; deleted_at: string | null }>
  Relationships: []
}

// Kept alongside the server so Supabase clients use the active workspace schema.
// Regenerate this from Supabase when the database schema changes.
export type Database = {
  public: {
    Tables: {
      ai_secrets: JsonTable
      approvals: JsonTable
      leads: JsonTable
      opportunities: JsonTable
      records: JsonTable & { Row: JsonTable['Row'] & { entity: string; rev: number; updated_by: string | null } }
      user_files: JsonTable
      proposals: JsonTable
      spares_lines: JsonTable
      clarifications: JsonTable
      audit: JsonTable
      settings: JsonTable
      price_lists: JsonTable
      price_list_versions: JsonTable
    }
    Views: Record<string, never>
    Functions: { purge_workspace_data: { Args: Record<string, never>; Returns: Json } }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
