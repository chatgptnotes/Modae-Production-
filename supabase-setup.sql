-- One-time Supabase setup for WinTrack file storage.
-- Paste into Dashboard → SQL Editor → Run. Safe to re-run (idempotent).

insert into storage.buckets (id, name, public, file_size_limit)
values ('opportunity-files', 'opportunity-files', true, 52428800) -- 50 MB
on conflict (id) do nothing;

-- Prototype-grade access: anyone holding the anon key can read/write this
-- bucket. Tighten to authenticated-user policies before real rollout.
drop policy if exists "anon read opportunity-files" on storage.objects;
create policy "anon read opportunity-files" on storage.objects
  for select to anon using (bucket_id = 'opportunity-files');

drop policy if exists "anon upload opportunity-files" on storage.objects;
create policy "anon upload opportunity-files" on storage.objects
  for insert to anon with check (bucket_id = 'opportunity-files');

drop policy if exists "anon update opportunity-files" on storage.objects;
create policy "anon update opportunity-files" on storage.objects
  for update to anon using (bucket_id = 'opportunity-files');

drop policy if exists "anon delete opportunity-files" on storage.objects;
create policy "anon delete opportunity-files" on storage.objects
  for delete to anon using (bucket_id = 'opportunity-files');

-- ---- App-state persistence: one JSONB row per store slice ----
-- Dashboard prerequisite (not doable in SQL): Settings → API must have the
-- Data API enabled with the "public" schema exposed, and the anon key valid
-- for it — otherwise /rest/v1/ answers 401 "Only service_role". Verify with:
--   curl "$VITE_SUPABASE_URL/rest/v1/app_state?select=key" -H "apikey: $VITE_SUPABASE_ANON_KEY"

create table if not exists public.app_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

-- Prototype-grade access, matching the bucket policies above.
drop policy if exists "anon select app_state" on public.app_state;
create policy "anon select app_state" on public.app_state
  for select to anon, authenticated using (true);

drop policy if exists "anon insert app_state" on public.app_state;
create policy "anon insert app_state" on public.app_state
  for insert to anon, authenticated with check (true);

drop policy if exists "anon update app_state" on public.app_state;
create policy "anon update app_state" on public.app_state
  for update to anon, authenticated using (true);

drop policy if exists "anon delete app_state" on public.app_state;
create policy "anon delete app_state" on public.app_state
  for delete to anon, authenticated using (true);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.app_state to anon, authenticated;
