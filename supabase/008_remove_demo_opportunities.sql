-- Remove the current seeded/demo opportunity dataset without hard-deleting it.
-- Run after supabase-tables.sql and 003_app_settings.sql.
-- Safe to re-run: already soft-deleted rows are not selected again.

begin;

-- Keep all dependent updates in one PostgreSQL statement. Supabase SQL Editor
-- may execute top-level statements in separate sessions, so a temp table would
-- not reliably remain visible to the statements that follow it.
do $$
declare
  demo_ids text[];
begin
  select coalesce(array_agg(id), array[]::text[])
    into demo_ids
  from public.opportunities
  where (
    data->>'simulated' = 'true'
    or data::text ilike '%demo%'
    or data::text ilike '%LD-SIM%'
    or data::text ilike '%example.com%'
    or data::text ilike '%example.in%'
  );

  -- Keep the production application in real-data mode for every browser.
  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('demoData', 'false'::jsonb, now(), 'demo-cleanup-2026-09-22')
  on conflict (key) do update
  set value = excluded.value,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by;

  -- Keep the legacy row consistent for older builds still reading app_state.
  update public.app_state
  set value = 'false'::jsonb,
      updated_at = now()
  where key = 'demoData';

  -- Older deployments still read the legacy JSON snapshot. Remove the same
  -- records there too, otherwise an old browser build can resurrect them on
  -- screen refresh even though public.opportunities is already clean.
  update public.app_state s
  set value = coalesce(
        (
          select jsonb_agg(item)
          from jsonb_array_elements(s.value) item
          where not (
            item->>'simulated' = 'true'
            or item::text ilike '%demo%'
            or item::text ilike '%LD-SIM%'
            or item::text ilike '%example.com%'
            or item::text ilike '%example.in%'
          )
        ),
        '[]'::jsonb
      ),
      updated_at = now()
  where s.key = 'opportunities'
    and jsonb_typeof(s.value) = 'array';

  update public.opportunities o
  set deleted_at = coalesce(o.deleted_at, now()),
      updated_at = now(),
      updated_by = 'demo-cleanup-2026-09-22'
  where o.id = any(demo_ids)
    and o.deleted_at is null;

  update public.leads l
  set deleted_at = coalesce(l.deleted_at, now()),
      updated_at = now(),
      updated_by = 'demo-cleanup-2026-09-22'
  where (l.data->>'oppId' = any(demo_ids)
      or l.data->>'sourceOppId' = any(demo_ids))
    and l.deleted_at is null;

  update public.approvals a
  set deleted_at = coalesce(a.deleted_at, now()),
      updated_at = now(),
      updated_by = 'demo-cleanup-2026-09-22'
  where a.data->>'oppId' = any(demo_ids)
    and a.deleted_at is null;

  update public.records r
  set deleted_at = coalesce(r.deleted_at, now()),
      updated_at = now(),
      updated_by = 'demo-cleanup-2026-09-22'
  where (r.data->>'oppId' = any(demo_ids)
      or (r.entity in ('proposals', 'po_compare', 'handover')
          and r.id = any(demo_ids)))
    and r.deleted_at is null;

  -- File rows have no deleted_at column. Mark them as demo so real-data mode
  -- hides them while preserving the bytes for recovery or audit purposes.
  update public.user_files f
  set is_demo = true,
      updated_at = now()
  where f.record_type = 'opportunity'
    and f.record_id = any(demo_ids);
end $$;

commit;

-- Verification: active opportunities should now exclude all matched demo rows.
select
  count(*) filter (where deleted_at is null) as active_opportunities,
  count(*) filter (where deleted_at is not null) as soft_deleted_opportunities
from public.opportunities;
