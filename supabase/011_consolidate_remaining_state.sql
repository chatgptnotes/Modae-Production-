-- Move non-normalized app_state slices into the existing JSONB records store.
-- Normalized business slices and consolidated configuration/pricing are
-- excluded because they already have canonical records elsewhere.

insert into public.records (entity, id, data)
select 'state', key, value
from public.app_state
where key not in (
  'leads', 'opportunities', 'approvals', 'proposals', 'sparesLines',
  'clarifications', 'audit', 'priceLists', 'config'
)
and not exists (
  select 1
  from public.records r
  where r.entity = 'state'
    and r.id = public.app_state.key
    and r.deleted_at is null
);

insert into public.records (entity, id, data)
select 'state', key, value
from public.app_settings
where key <> 'config'
and not exists (
  select 1
  from public.records r
  where r.entity = 'state'
    and r.id = public.app_settings.key
    and r.deleted_at is null
);

