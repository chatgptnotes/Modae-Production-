-- Business data uses the existing compact row model from supabase-tables.sql.
-- No extra business_* tables are needed:
--   opportunities  -> one row per opportunity
--   leads          -> one row per lead
--   approvals      -> one row per approval
--   records        -> proposals, spares_lines, audit, and other entities
-- Run the existing migration once to copy legacy app_state data into those
-- tables. It is guarded and safe to run again.

select public.migrate_app_state_to_rows();

-- Keep the important lookup columns available for filtering in Table Editor.
alter table public.leads
  add column if not exists status text generated always as (data->>'status') stored,
  add column if not exists owner text generated always as (data->>'assignedOwner') stored,
  add column if not exists opp_id text generated always as (data->>'oppId') stored;

alter table public.opportunities
  add column if not exists opp_name text generated always as (data->>'oppName') stored,
  add column if not exists owner text generated always as (data->>'owner') stored,
  add column if not exists stage text generated always as (data->>'stage') stored,
  add column if not exists status text generated always as (data->>'status') stored;

create index if not exists leads_status_owner_idx on public.leads(status, owner);
create index if not exists opportunities_stage_owner_idx on public.opportunities(stage, owner);
