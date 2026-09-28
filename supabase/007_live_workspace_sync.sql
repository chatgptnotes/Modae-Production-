-- Deliver lead, approval, and workflow changes to other open devices immediately.
-- Safe to run after 000_fresh_project.sql. Realtime still enforces the table's
-- existing RLS policies for each subscriber; this migration grants no access.

do $$
declare
  target text;
begin
  foreach target in array array['leads', 'approvals', 'opportunities', 'records'] loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = target
    ) then
      execute format('alter publication supabase_realtime add table public.%I', target);
    end if;
  end loop;
end $$;
