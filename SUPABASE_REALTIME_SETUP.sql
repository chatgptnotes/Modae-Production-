-- WinTrack ModAE: enable Supabase Realtime for shared workspace updates.
-- Run this in the Supabase SQL Editor after the base schema exists.
-- Safe to run more than once. This does not delete or modify business data.

do $$
declare
  table_name text;
begin
  foreach table_name in array array['leads', 'approvals', 'opportunities', 'records'] loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;

-- Verification: this should return four rows.
select tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename in ('leads', 'approvals', 'opportunities', 'records')
order by tablename;
