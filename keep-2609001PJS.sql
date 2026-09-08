-- Keep only opportunity 2609001PJS and its linked lead(s).
-- Run in Supabase Dashboard -> SQL Editor.
-- This changes only the opportunities, leads, and leadArchive slices.

begin;

-- Keep the requested opportunity and remove every other opportunity.
update public.app_state
set value = coalesce((
  select jsonb_agg(row order by row->>'id')
  from jsonb_array_elements(value) as item(row)
  where row->>'id' = '2609001PJS'
), '[]'::jsonb),
updated_at = now()
where key = 'opportunities';

-- Keep only leads linked to the requested opportunity.
update public.app_state
set value = coalesce((
  select jsonb_agg(row order by row->>'id')
  from jsonb_array_elements(value) as item(row)
  where row->>'oppId' = '2609001PJS'
), '[]'::jsonb),
updated_at = now()
where key = 'leads';

-- Apply the same cleanup to archived leads, if this slice exists.
update public.app_state
set value = coalesce((
  select jsonb_agg(row order by row->>'id')
  from jsonb_array_elements(value) as item(row)
  where row->>'oppId' = '2609001PJS'
), '[]'::jsonb),
updated_at = now()
where key = 'leadArchive';

commit;

-- Verify the result:
-- select key, jsonb_array_length(value) as remaining
-- from public.app_state
-- where key in ('opportunities', 'leads', 'leadArchive');
