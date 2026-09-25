-- WinTrack ModAE — idempotent verification for the browser persistence contract.
-- Run after 000_fresh_project.sql, 007_live_workspace_sync.sql,
-- 008_dedicated_workspace_tables.sql, and 009_relational_workspace_data.sql.

do $$
begin
  if to_regclass('public.user_files') is null then
    raise exception 'WinTrack schema incomplete: public.user_files is missing';
  end if;
  if to_regprocedure('public.save_rows(text,jsonb)') is null then
    raise exception 'WinTrack schema incomplete: public.save_rows(text,jsonb) is missing';
  end if;
end $$;

alter table public.user_files enable row level security;
drop policy if exists user_files_owner_select on public.user_files;
create policy user_files_owner_select on public.user_files for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists user_files_owner_insert on public.user_files;
create policy user_files_owner_insert on public.user_files for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists user_files_owner_update on public.user_files;
create policy user_files_owner_update on public.user_files for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists user_files_owner_delete on public.user_files;
create policy user_files_owner_delete on public.user_files for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, update, delete on public.user_files to authenticated;
grant execute on function public.save_rows(text, jsonb) to anon, authenticated;
