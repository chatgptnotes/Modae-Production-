-- Repair customer imports created before the consolidated state contract.
-- Preserve typed and legacy customer rows; add the app-readable state slice.

with customer_payload as (
  select coalesce(
    jsonb_agg(data order by lower(coalesce(data->>'name', ''))),
    '[]'::jsonb
  ) as data
  from public.records
  where entity = 'customers'
    and deleted_at is null
)
insert into public.records (
  entity, id, data, rev, updated_at, updated_by, deleted_at
)
select
  'state',
  'customers',
  data,
  1,
  now(),
  'migration-018-customer-state-repair',
  null
from customer_payload
where jsonb_array_length(data) > 0
on conflict (entity, id) do update
set deleted_at = null,
    updated_at = now(),
    updated_by = 'migration-018-customer-state-repair'
where public.records.deleted_at is not null
   or jsonb_typeof(public.records.data) <> 'array'
   or case when jsonb_typeof(public.records.data) = 'array'
      then jsonb_array_length(public.records.data)
      else 0
      end = 0;
