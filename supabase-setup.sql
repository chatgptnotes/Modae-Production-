-- One-time Supabase setup for WinTrack. Paste into Dashboard → SQL Editor →
-- Run. Safe to re-run (idempotent). Policy names deliberately avoid quotes:
-- pasting through editors that autocorrect to curly quotes broke the quoted
-- versions with "syntax error at or near anon".

-- File bytes are stored directly in public.user_files.file_data (BYTEA).
-- Run supabase/004_rules_and_user_files.sql for the file table and policies.

-- ---- App-state persistence: one JSONB row per store slice ----
-- Dashboard prerequisite (not doable in SQL): Settings → API must have the
-- Data API enabled with the public schema exposed, and the anon key valid
-- for it — otherwise /rest/v1/ answers 401 Only service_role. Verify with:
--   curl "$VITE_SUPABASE_URL/rest/v1/app_state?select=key" -H "apikey: $VITE_SUPABASE_ANON_KEY"

create table if not exists public.app_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

-- Prototype-grade access, matching the bucket policies above.
drop policy if exists anon_select_app_state on public.app_state;
create policy anon_select_app_state on public.app_state
  for select to anon, authenticated using (true);

drop policy if exists anon_insert_app_state on public.app_state;
create policy anon_insert_app_state on public.app_state
  for insert to anon, authenticated with check (true);

drop policy if exists anon_update_app_state on public.app_state;
create policy anon_update_app_state on public.app_state
  for update to anon, authenticated using (true);

drop policy if exists anon_delete_app_state on public.app_state;
create policy anon_delete_app_state on public.app_state
  for delete to anon, authenticated using (true);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.app_state to anon, authenticated;

-- ---- Secure AI credential storage ----------------------------------------
-- Some Supabase projects do not expose the Vault extension. The Edge Functions
-- encrypt this value before writing it here, using their service-role secret as
-- the decryption key. The browser roles have no table privileges.
create table if not exists public.ai_secrets (
  name text primary key,
  ciphertext text not null,
  iv text not null,
  updated_at timestamptz not null default now(),
  updated_by text not null default 'SYSTEM'
);
alter table public.ai_secrets enable row level security;
revoke all on public.ai_secrets from public, anon, authenticated;
grant select, insert, update, delete on public.ai_secrets to service_role;
