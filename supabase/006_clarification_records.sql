-- Move legacy clarification snapshots from app_settings into the normalized
-- records table. Run after 002_business_tables.sql and 003_app_settings.sql.
-- Existing normalized records win, so this is safe to run more than once.

insert into public.records (entity, id, data, rev, updated_at)
select
  'clarifications',
  item->>'id',
  item,
  1,
  coalesce(settings.updated_at, now())
from public.app_settings as settings
cross join lateral jsonb_array_elements(
  case
    when jsonb_typeof(settings.value) = 'array' then settings.value
    else '[]'::jsonb
  end
) as item
where settings.key = 'clarifications'
  and item ? 'id'
  and nullif(item->>'id', '') is not null
on conflict (entity, id) do nothing;
