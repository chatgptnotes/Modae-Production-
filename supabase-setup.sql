-- One-time Supabase setup for WinTrack. Paste into Dashboard → SQL Editor →
-- Run. Safe to re-run (idempotent). Policy names deliberately avoid quotes:
-- pasting through editors that autocorrect to curly quotes broke the quoted
-- versions with "syntax error at or near anon".

insert into storage.buckets (id, name, public, file_size_limit)
values ('opportunity-files', 'opportunity-files', true, 52428800) -- 50 MB
on conflict (id) do nothing;

-- Prototype-grade access: anyone holding the anon key can read/write this
-- bucket. Tighten to authenticated-user policies before real rollout.
drop policy if exists anon_read_opportunity_files on storage.objects;
drop policy if exists "anon read opportunity-files" on storage.objects;
create policy anon_read_opportunity_files on storage.objects
  for select to anon using (bucket_id = 'opportunity-files');

drop policy if exists anon_upload_opportunity_files on storage.objects;
drop policy if exists "anon upload opportunity-files" on storage.objects;
create policy anon_upload_opportunity_files on storage.objects
  for insert to anon with check (bucket_id = 'opportunity-files');

drop policy if exists anon_update_opportunity_files on storage.objects;
drop policy if exists "anon update opportunity-files" on storage.objects;
create policy anon_update_opportunity_files on storage.objects
  for update to anon using (bucket_id = 'opportunity-files');

drop policy if exists anon_delete_opportunity_files on storage.objects;
drop policy if exists "anon delete opportunity-files" on storage.objects;
create policy anon_delete_opportunity_files on storage.objects
  for delete to anon using (bucket_id = 'opportunity-files');

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
-- Supabase Vault keeps the provider key encrypted at rest. The Edge Functions
-- call these restricted RPCs with the service role; browser roles cannot call
-- them directly.
create extension if not exists vault with schema vault;

create or replace function public.set_wintrack_ai_secret(p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  existing_id uuid;
begin
  select id into existing_id from vault.decrypted_secrets
    where name = 'wintrack_gemini_api_key' limit 1;
  if existing_id is null then
    perform vault.create_secret(p_secret, 'wintrack_gemini_api_key', 'WinTrack Gemini provider key');
  else
    perform vault.update_secret(existing_id, p_secret, 'wintrack_gemini_api_key', 'WinTrack Gemini provider key');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.get_wintrack_ai_secret()
returns text
language sql
security definer
set search_path = public, vault
as $$
  select decrypted_secret from vault.decrypted_secrets
  where name = 'wintrack_gemini_api_key' limit 1;
$$;

revoke all on function public.set_wintrack_ai_secret(text) from public, anon, authenticated;
revoke all on function public.get_wintrack_ai_secret() from public, anon, authenticated;
grant execute on function public.set_wintrack_ai_secret(text) to service_role;
grant execute on function public.get_wintrack_ai_secret() to service_role;
