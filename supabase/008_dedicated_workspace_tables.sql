-- WinTrack ModAE — split large workspace entities out of records.
-- Run after 000_fresh_project.sql and 007_live_workspace_sync.sql.
-- Legacy records are copied, not deleted, so the application can roll back
-- safely while existing deployments are upgraded.

create table if not exists public.proposals (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  rev bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text,
  deleted_at timestamptz
);

create table if not exists public.spares_lines (id text primary key, data jsonb not null default '{}'::jsonb, rev bigint not null default 1, updated_at timestamptz not null default now(), updated_by text, deleted_at timestamptz);
create table if not exists public.clarifications (id text primary key, data jsonb not null default '{}'::jsonb, rev bigint not null default 1, updated_at timestamptz not null default now(), updated_by text, deleted_at timestamptz);
create table if not exists public.audit (id text primary key, data jsonb not null default '{}'::jsonb, rev bigint not null default 1, updated_at timestamptz not null default now(), updated_by text, deleted_at timestamptz);
create table if not exists public.settings (id text primary key, data jsonb not null default '{}'::jsonb, rev bigint not null default 1, updated_at timestamptz not null default now(), updated_by text, deleted_at timestamptz);
create table if not exists public.price_lists (id text primary key, data jsonb not null default '{}'::jsonb, rev bigint not null default 1, updated_at timestamptz not null default now(), updated_by text, deleted_at timestamptz);
create table if not exists public.price_list_versions (id text primary key, data jsonb not null default '{}'::jsonb, rev bigint not null default 1, updated_at timestamptz not null default now(), updated_by text, deleted_at timestamptz);

insert into public.proposals (id, data, rev, updated_at, updated_by, deleted_at)
select id, data, rev, updated_at, updated_by, deleted_at from public.records where entity = 'proposals'
on conflict (id) do nothing;
insert into public.spares_lines (id, data, rev, updated_at, updated_by, deleted_at)
select id, data, rev, updated_at, updated_by, deleted_at from public.records where entity = 'spares_lines'
on conflict (id) do nothing;
insert into public.clarifications (id, data, rev, updated_at, updated_by, deleted_at)
select id, data, rev, updated_at, updated_by, deleted_at from public.records where entity = 'clarifications'
on conflict (id) do nothing;
insert into public.audit (id, data, rev, updated_at, updated_by, deleted_at)
select id, data, rev, updated_at, updated_by, deleted_at from public.records where entity = 'audit'
on conflict (id) do nothing;
insert into public.settings (id, data, rev, updated_at, updated_by, deleted_at)
select id, data, rev, updated_at, updated_by, deleted_at from public.records where entity = 'settings'
on conflict (id) do nothing;
insert into public.price_lists (id, data, rev, updated_at, updated_by, deleted_at)
select id, data, rev, updated_at, updated_by, deleted_at from public.records where entity = 'price_lists'
on conflict (id) do nothing;
insert into public.price_list_versions (id, data, rev, updated_at, updated_by, deleted_at)
select id, data, rev, updated_at, updated_by, deleted_at from public.records where entity = 'price_list_versions'
on conflict (id) do nothing;

create index if not exists proposals_opp_idx on public.proposals ((data->>'oppId')) where deleted_at is null;
create index if not exists spares_lines_opp_idx on public.spares_lines ((data->>'oppId')) where deleted_at is null;
create index if not exists clarifications_opp_idx on public.clarifications ((data->>'oppId')) where deleted_at is null;
create index if not exists audit_updated_idx on public.audit (updated_at desc);

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

do $$
declare table_name text;
begin
  foreach table_name in array array['proposals', 'spares_lines', 'clarifications', 'audit', 'settings', 'price_lists', 'price_list_versions'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists app_select_%1$s on public.%1$I', table_name);
    execute format('create policy app_select_%1$s on public.%1$I for select to anon, authenticated using (true)', table_name);
    execute format('drop policy if exists app_insert_%1$s on public.%1$I', table_name);
    execute format('create policy app_insert_%1$s on public.%1$I for insert to anon, authenticated with check (true)', table_name);
    execute format('drop policy if exists app_update_%1$s on public.%1$I', table_name);
    execute format('create policy app_update_%1$s on public.%1$I for update to anon, authenticated using (true) with check (true)', table_name);
    execute format('drop policy if exists app_delete_%1$s on public.%1$I', table_name);
    execute format('create policy app_delete_%1$s on public.%1$I for delete to anon, authenticated using (true)', table_name);
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated', table_name);
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;
