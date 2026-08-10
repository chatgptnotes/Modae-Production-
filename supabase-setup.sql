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
