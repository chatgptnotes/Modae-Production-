-- WinTrack ModAE — reduce save_rows deadlocks during concurrent workspace writes.
-- Keep the existing function signature, payload contract, revision checks, and
-- permissions. Sorting incoming IDs makes concurrent transactions acquire row
-- locks in the same order.

create or replace function public.save_rows(p_entity text, p_rows jsonb)
returns jsonb language plpgsql security invoker set search_path = public
as $$
declare
  target_table text;
  accepted text[] := '{}';
  conflicts jsonb := '[]'::jsonb;
begin
  if p_entity is null or p_entity !~ '^[a-z_]+$' or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'invalid save_rows request' using errcode = '22023';
  end if;

  target_table := case p_entity
    when 'proposals' then 'proposals'
    when 'spares_lines' then 'spares_lines'
    when 'clarifications' then 'clarifications'
    when 'audit' then 'audit'
    when 'settings' then 'settings'
    when 'price_lists' then 'price_lists'
    when 'price_list_versions' then 'price_list_versions'
    when 'opportunities' then 'opportunities'
    when 'leads' then 'leads'
    when 'approvals' then 'approvals'
    else null
  end;

  if target_table is not null then
    execute format($sql$
      with incoming as (
        select r->>'id' id, coalesce(r->'data', '{}'::jsonb) data,
          coalesce((r->>'rev')::bigint, 0) rev,
          coalesce((r->>'deleted')::boolean, false) deleted, r->>'by' updated_by
        from jsonb_array_elements($1) r
        order by r->>'id'
      ), upserted as (
        insert into public.%1$I (id, data, rev, updated_at, updated_by, deleted_at)
        select id, data, rev + 1, now(), updated_by, case when deleted then now() else null end
        from incoming where id is not null
        on conflict (id) do update set data = excluded.data, rev = excluded.rev,
          updated_at = excluded.updated_at, updated_by = excluded.updated_by,
          deleted_at = excluded.deleted_at
        where public.%1$I.rev = excluded.rev - 1
        returning id
      ) select coalesce(array_agg(id), '{}')::text[] from upserted
    $sql$, target_table) into accepted using p_rows;

    execute format($sql$
      select coalesce(jsonb_agg(to_jsonb(target)), '[]'::jsonb)
      from public.%1$I target
      where target.id in (select r->>'id' from jsonb_array_elements($1) r)
        and not (target.id = any($2))
    $sql$, target_table) into conflicts using p_rows, accepted;
  else
    with incoming as (
      select r->>'id' id, coalesce(r->'data', '{}'::jsonb) data,
        coalesce((r->>'rev')::bigint, 0) rev,
        coalesce((r->>'deleted')::boolean, false) deleted, r->>'by' updated_by
      from jsonb_array_elements(p_rows) r
      order by r->>'id'
    ), upserted as (
      insert into public.records (entity, id, data, rev, updated_at, updated_by, deleted_at)
      select p_entity, id, data, rev + 1, now(), updated_by, case when deleted then now() else null end
      from incoming where id is not null
      on conflict (entity, id) do update set data = excluded.data, rev = excluded.rev,
        updated_at = excluded.updated_at, updated_by = excluded.updated_by,
        deleted_at = excluded.deleted_at
      where public.records.rev = excluded.rev - 1
      returning id
    ) select coalesce(array_agg(id), '{}')::text[] into accepted from upserted;

    select coalesce(jsonb_agg(to_jsonb(target)), '[]'::jsonb) into conflicts
    from public.records target
    where target.entity = p_entity
      and target.id in (select r->>'id' from jsonb_array_elements(p_rows) r)
      and not (target.id = any(accepted));
  end if;
  return jsonb_build_object('accepted', to_jsonb(accepted), 'conflicts', conflicts);
end;
$$;

grant execute on function public.save_rows(text, jsonb) to anon, authenticated;
