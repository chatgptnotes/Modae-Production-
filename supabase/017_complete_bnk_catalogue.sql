-- WinTrack ModAE — complete the approved B&K catalogue used by sourcing.
-- This is additive and idempotent: existing price-list rows and prices remain
-- unchanged, while the curated B&K parts missing from older uploads are added.

do $$
declare
  list_row record;
  version_row record;
  list_id text := 'BNK';
  active_id text := 'BNK::Curated-2026-09';
  list_data jsonb;
  version_data jsonb;
  parts jsonb := '[]'::jsonb;
  list_found boolean := false;
  version_found boolean := false;
  curated jsonb := jsonb_build_array(
    jsonb_build_object('pn', 'EC-10', 'desc', 'Extension cable 10m', 'price', 148, 'adders', '[]'::jsonb),
    jsonb_build_object('pn', 'AGSC-51-4-CAB', 'desc', 'Air gap sensor w/ cable', 'price', 1300, 'adders', '[]'::jsonb),
    jsonb_build_object('pn', 'IN081-3-110-50', 'desc', 'Vibration sensor IN-081, 110mm', 'price', 954, 'adders', jsonb_build_array(jsonb_build_object('code', 'L-EXT', 'desc', 'Extended length >110mm', 'price', 98))),
    jsonb_build_object('pn', 'MMS-6210', 'desc', 'Dual-channel axial displacement monitor', 'price', 2340, 'adders', '[]'::jsonb)
  );
  item jsonb;
begin
  -- Prefer the canonical BNK key, but also support an older upload saved as
  -- “B&K Vibro”.
  select id, data, rev into list_row
  from public.price_lists
  where deleted_at is null
    and (id = 'BNK' or lower(coalesce(data->>'supplierName', '')) = 'b&k vibro')
  order by (id = 'BNK') desc
  limit 1;

  if found then
    list_found := true;
    list_id := list_row.id;
    list_data := coalesce(list_row.data, '{}'::jsonb);
    active_id := coalesce(list_data->>'activeVersionId', list_id || '::' || (list_data->>'currentVersion'));
  else
    list_data := jsonb_build_object(
      'listCode', list_id,
      'supplierName', 'B&K Vibro',
      'sourceCurrency', 'EUR',
      'currentVersion', 'Curated-2026-09',
      'uploaded', current_date::text,
      'activeVersionId', active_id,
      'versions', jsonb_build_array(jsonb_build_object(
        'id', active_id, 'version', 'Curated-2026-09', 'currency', 'EUR',
        'uploaded', current_date::text, 'filename', 'curated-bnk-catalogue'
      ))
    );
  end if;

  select id, data, rev into version_row
  from public.price_list_versions
  where id = active_id and deleted_at is null;

  if found then
    version_found := true;
    version_data := coalesce(version_row.data, '{}'::jsonb);
    parts := case when jsonb_typeof(version_data->'parts') = 'array' then version_data->'parts' else '[]'::jsonb end;
  else
    version_data := jsonb_build_object(
      'listCode', list_id,
      'version', coalesce(list_data->>'currentVersion', 'Curated-2026-09'),
      'currency', coalesce(list_data->>'sourceCurrency', 'EUR'),
      'uploaded', coalesce(list_data->>'uploaded', current_date::text),
      'filename', 'curated-bnk-catalogue'
    );
  end if;

  for item in select value from jsonb_array_elements(curated) loop
    if not exists (
      select 1
      from jsonb_array_elements(parts) existing
      where upper(regexp_replace(coalesce(existing->>'pn', ''), '[^A-Za-z0-9]', '', 'g')) =
            upper(regexp_replace(item->>'pn', '[^A-Za-z0-9]', '', 'g'))
    ) then
      parts := parts || jsonb_build_array(item);
    end if;
  end loop;

  if not version_found then
    insert into public.price_list_versions (id, data, rev, updated_at, updated_by, deleted_at)
    values (active_id, version_data || jsonb_build_object('parts', parts), 1, now(), 'migration-017', null);
  else
    update public.price_list_versions
       set data = version_data || jsonb_build_object('parts', parts),
           rev = version_row.rev + 1,
           updated_at = now(),
           updated_by = 'migration-017',
           deleted_at = null
     where id = active_id;
  end if;

  if not list_found then
    insert into public.price_lists (id, data, rev, updated_at, updated_by, deleted_at)
    values (list_id, list_data, 1, now(), 'migration-017', null);
  else
    update public.price_lists
       set data = list_data || jsonb_build_object('activeVersionId', active_id),
           rev = list_row.rev + 1,
           updated_at = now(),
           updated_by = 'migration-017',
           deleted_at = null
     where id = list_id;
  end if;
end;
$$;
