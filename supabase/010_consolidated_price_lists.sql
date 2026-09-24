-- Copy price-list metadata and version payloads into the existing JSONB
-- records store. This migration is non-destructive and leaves the relational
-- pricing tables available as a fallback until parity is confirmed.

insert into public.records (entity, id, data)
select
  'price_lists',
  l.list_code,
  jsonb_build_object(
    'listCode', l.list_code,
    'supplierName', l.supplier_name,
    'sourceCurrency', l.source_currency,
    'currentVersion', coalesce(l.current_version, v.version_code, 'Initial'),
    'uploaded', coalesce(l.uploaded_at::text, ''),
    'activeVersionId', concat(l.list_code, '::', coalesce(l.current_version, v.version_code, 'Initial')),
    'versions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', concat(l.list_code, '::', pv.version_code),
        'version', pv.version_code,
        'currency', pv.source_currency,
        'uploaded', coalesce(pv.uploaded_at::text, ''),
        'filename', coalesce(pv.filename, '')
      ) order by pv.version_code)
      from public.price_list_versions pv
      where pv.price_list_id = l.id
    ), '[]'::jsonb)
  )
from public.price_lists l
left join lateral (
  select version_code
  from public.price_list_versions pv
  where pv.price_list_id = l.id
  order by pv.is_active desc, pv.uploaded_at desc nulls last, pv.id desc
  limit 1
) v on true
where not exists (
  select 1 from public.records r
  where r.entity = 'price_lists' and r.id = l.list_code and r.deleted_at is null
);

insert into public.records (entity, id, data)
select
  'price_list_versions',
  concat(l.list_code, '::', v.version_code),
  jsonb_build_object(
    'listCode', l.list_code,
    'version', v.version_code,
    'currency', v.source_currency,
    'uploaded', coalesce(v.uploaded_at::text, ''),
    'filename', coalesce(v.filename, ''),
    'parts', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'pn', p.part_number,
          'desc', p.description,
          'price', p.unit_price,
          'currency', p.currency,
          'keywords', p.keywords,
          'adders', coalesce((
            select jsonb_agg(jsonb_build_object(
              'code', a.code,
              'desc', a.description,
              'price', a.unit_price
            ) order by a.code)
            from public.price_list_adders a
            where a.part_id = p.id
          ), '[]'::jsonb)
        ) order by p.part_number
      )
      from public.price_list_parts p
      where p.version_id = v.id
    ), '[]'::jsonb)
  )
from public.price_lists l
join public.price_list_versions v on v.price_list_id = l.id
where not exists (
  select 1 from public.records r
  where r.entity = 'price_list_versions'
    and r.id = concat(l.list_code, '::', v.version_code)
    and r.deleted_at is null
);

