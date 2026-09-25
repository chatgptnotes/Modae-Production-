-- WinTrack ModAE — fresh Supabase verification
-- Paste this into Supabase Dashboard -> SQL Editor -> Run.

-- 1. Confirm the six required production tables exist.
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('ai_secrets', 'approvals', 'leads', 'opportunities', 'records', 'user_files')
order by table_name;

-- 2. Confirm the conflict-safe save RPC exists.
select routine_schema, routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'save_rows';

-- 3. Confirm realtime is enabled for shared workspace tables.
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename in ('leads', 'approvals', 'opportunities', 'records')
order by tablename;

-- 4. Show current row counts. These may be zero on a new project.
select 'leads' as table_name, count(*) as row_count from public.leads
union all
select 'opportunities', count(*) from public.opportunities
union all
select 'approvals', count(*) from public.approvals
union all
select 'records', count(*) from public.records
union all
select 'user_files', count(*) from public.user_files
order by table_name;
