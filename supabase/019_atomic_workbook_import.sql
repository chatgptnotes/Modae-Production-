-- Reviewed workbook imports must not restore rows deleted after preview.
-- Keep revision-aware save_rows writes, but validate generation and apply all
-- slices/audit in one transaction. Only the authenticated admin server calls it.
create or replace function public.import_workbook_rows(p_generation bigint, p_batches jsonb)
returns jsonb language plpgsql security invoker set search_path = public
as $$
declare
  batch jsonb;
  result jsonb;
  generation bigint;
begin
  if jsonb_typeof(p_batches) is distinct from 'array' then
    raise exception 'invalid workbook import' using errcode = '22023';
  end if;
  -- Deletes and updates cannot pass the generation check concurrently with
  -- these writes. Acquire every table in a stable order before checking.
  lock table public.opportunities, public.records, public.settings, public.audit
    in share row exclusive mode;
  select coalesce((data->>'value')::bigint, 0) into generation
    from public.records where entity = 'state' and id = 'workspace_generation';
  if coalesce(generation, 0) is distinct from p_generation then
    raise exception 'workspace changed after workbook preview' using errcode = '40001';
  end if;
  for batch in select value from jsonb_array_elements(p_batches) loop
    if batch->>'entity' not in ('opportunities', 'state', 'settings', 'audit')
      or batch->>'entity' is null then
      raise exception 'invalid workbook entity' using errcode = '22023';
    end if;
    result := public.save_rows(batch->>'entity', batch->'rows');
    if jsonb_array_length(result->'conflicts') > 0
      or jsonb_array_length(result->'accepted') <> jsonb_array_length(batch->'rows') then
      raise exception 'workspace edited during workbook import' using errcode = '40001';
    end if;
  end loop;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.import_workbook_rows(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.import_workbook_rows(bigint, jsonb) to service_role;
