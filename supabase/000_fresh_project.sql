-- WinTrack ModAE — fresh Supabase project schema
--
-- Run this entire file once in Supabase Dashboard -> SQL Editor.
-- It is safe to re-run. This schema intentionally contains only the six
-- production tables used by the application:
--   ai_secrets, approvals, leads, opportunities, records, user_files
--
-- Workspace rows use the current app-compatible access model: the browser
-- client can read and write shared workspace rows with the Supabase anon key.
-- File rows are protected by Supabase Auth and are visible only to their owner.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Shared row model
-- ---------------------------------------------------------------------------

create table if not exists public.opportunities (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  rev bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text,
  deleted_at timestamptz
);

create table if not exists public.leads (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  rev bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text,
  deleted_at timestamptz
);

create table if not exists public.approvals (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  rev bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text,
  deleted_at timestamptz
);

create table if not exists public.records (
  entity text not null,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  rev bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text,
  deleted_at timestamptz,
  primary key (entity, id)
);

-- Server-side encrypted AI credentials. The plaintext secret must never be
-- stored here or exposed through a VITE_ browser variable.
create table if not exists public.ai_secrets (
  id text primary key,
  provider text not null,
  ciphertext text not null,
  iv text not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- Uploaded file bytes are stored directly in PostgreSQL and limited to 10 MB.
create table if not exists public.user_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  record_type text not null,
  record_id text not null,
  folder text not null default '',
  file_name text not null,
  file_type text not null default 'application/octet-stream',
  file_size bigint not null,
  file_data bytea not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_files_name_length check (char_length(file_name) between 1 and 255),
  constraint user_files_size_matches check (file_size = octet_length(file_data)),
  constraint user_files_size_limit check (file_size between 0 and 10485760)
);

-- Generated projections keep common filters fast without duplicating JSON data.
alter table public.opportunities
  add column if not exists opp_name text generated always as (data->>'oppName') stored,
  add column if not exists sell_to text generated always as (data->>'sellTo') stored,
  add column if not exists owner text generated always as (data->>'owner') stored,
  add column if not exists stage text generated always as (data->>'stage') stored,
  add column if not exists status text generated always as (data->>'status') stored,
  add column if not exists milestone text generated always as (data->>'milestone') stored;

alter table public.leads
  add column if not exists status text generated always as (data->>'status') stored,
  add column if not exists owner text generated always as (data->>'assignedOwner') stored,
  add column if not exists opp_id text generated always as (data->>'oppId') stored;

alter table public.approvals
  add column if not exists opp_id text generated always as (data->>'oppId') stored,
  add column if not exists lead_id text generated always as (data->>'leadId') stored,
  add column if not exists status text generated always as (data->>'status') stored;

alter table public.records
  add column if not exists opp_id text generated always as (data->>'oppId') stored;

create index if not exists opportunities_owner_idx
  on public.opportunities (owner) where deleted_at is null;
create index if not exists opportunities_stage_idx
  on public.opportunities (stage, status) where deleted_at is null;
create index if not exists leads_status_owner_idx
  on public.leads (status, owner) where deleted_at is null;
create index if not exists approvals_opp_idx
  on public.approvals (opp_id) where deleted_at is null;
create index if not exists approvals_status_idx
  on public.approvals (status) where deleted_at is null;
create index if not exists records_opp_idx
  on public.records (entity, opp_id) where deleted_at is null;
create index if not exists records_updated_idx
  on public.records (entity, updated_at desc);
create index if not exists user_files_scope_idx
  on public.user_files (user_id, record_type, record_id, folder);
create unique index if not exists user_files_scope_name_idx
  on public.user_files (user_id, record_type, record_id, folder, file_name);

-- ---------------------------------------------------------------------------
-- Conflict-aware bulk write RPC
-- ---------------------------------------------------------------------------

create or replace function public.save_rows(p_entity text, p_rows jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  accepted text[] := '{}';
  conflicts jsonb := '[]'::jsonb;
begin
  if p_entity is null or p_entity !~ '^[a-z_]+$' then
    raise exception 'bad entity %', p_entity using errcode = '22023';
  end if;

  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array' using errcode = '22023';
  end if;

  if p_entity in ('opportunities', 'leads', 'approvals') then
    execute format($sql$
      with incoming as (
        select r->>'id' as id,
               coalesce(r->'data', '{}'::jsonb) as data,
               coalesce((r->>'rev')::bigint, 0) as rev,
               coalesce((r->>'deleted')::boolean, false) as deleted,
               r->>'by' as updated_by
        from jsonb_array_elements($1) r
      ),
      upserted as (
        insert into public.%1$I as target
          (id, data, rev, updated_at, updated_by, deleted_at)
        select id, data, rev + 1, now(), updated_by,
               case when deleted then now() else null end
        from incoming
        where id is not null
        on conflict (id) do update
          set data = excluded.data,
              rev = excluded.rev,
              updated_at = excluded.updated_at,
              updated_by = excluded.updated_by,
              deleted_at = excluded.deleted_at
          where target.rev = excluded.rev - 1
        returning id
      )
      select coalesce(array_agg(id), '{}')::text[] from upserted
    $sql$, p_entity)
    into accepted using p_rows;

    execute format($sql$
      select coalesce(jsonb_agg(to_jsonb(target)), '[]'::jsonb)
      from public.%1$I target
      where target.id in (select r->>'id' from jsonb_array_elements($1) r)
        and not (target.id = any($2))
    $sql$, p_entity)
    into conflicts using p_rows, accepted;
  else
    with incoming as (
      select r->>'id' as id,
             coalesce(r->'data', '{}'::jsonb) as data,
             coalesce((r->>'rev')::bigint, 0) as rev,
             coalesce((r->>'deleted')::boolean, false) as deleted,
             r->>'by' as updated_by
      from jsonb_array_elements(p_rows) r
    ),
    upserted as (
      insert into public.records as target
        (entity, id, data, rev, updated_at, updated_by, deleted_at)
      select p_entity, id, data, rev + 1, now(), updated_by,
             case when deleted then now() else null end
      from incoming
      where id is not null
      on conflict (entity, id) do update
        set data = excluded.data,
            rev = excluded.rev,
            updated_at = excluded.updated_at,
            updated_by = excluded.updated_by,
            deleted_at = excluded.deleted_at
        where target.rev = excluded.rev - 1
      returning id
    )
    select coalesce(array_agg(id), '{}')::text[] into accepted from upserted;

    select coalesce(jsonb_agg(to_jsonb(target)), '[]'::jsonb)
      into conflicts
    from public.records target
    where target.entity = p_entity
      and target.id in (select r->>'id' from jsonb_array_elements(p_rows) r)
      and not (target.id = any(accepted));
  end if;

  return jsonb_build_object('accepted', to_jsonb(accepted), 'conflicts', conflicts);
end;
$$;

-- ---------------------------------------------------------------------------
-- Row-level security and grants
-- ---------------------------------------------------------------------------

alter table public.opportunities enable row level security;
alter table public.leads enable row level security;
alter table public.approvals enable row level security;
alter table public.records enable row level security;
alter table public.ai_secrets enable row level security;
alter table public.user_files enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['opportunities', 'leads', 'approvals', 'records'] loop
    execute format('drop policy if exists app_select_%1$s on public.%1$I', table_name);
    execute format('create policy app_select_%1$s on public.%1$I for select to anon, authenticated using (true)', table_name);
    execute format('drop policy if exists app_insert_%1$s on public.%1$I', table_name);
    execute format('create policy app_insert_%1$s on public.%1$I for insert to anon, authenticated with check (true)', table_name);
    execute format('drop policy if exists app_update_%1$s on public.%1$I', table_name);
    execute format('create policy app_update_%1$s on public.%1$I for update to anon, authenticated using (true) with check (true)', table_name);
    execute format('drop policy if exists app_delete_%1$s on public.%1$I', table_name);
    execute format('create policy app_delete_%1$s on public.%1$I for delete to anon, authenticated using (true)', table_name);
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated', table_name);
  end loop;
end;
$$;

-- AI secrets are intentionally inaccessible to browser roles. The Vercel
-- server route must use SUPABASE_SERVICE_ROLE_KEY when it needs this table.
revoke all on public.ai_secrets from anon, authenticated;
drop policy if exists ai_secrets_no_browser_access on public.ai_secrets;

drop policy if exists user_files_owner_select on public.user_files;
create policy user_files_owner_select on public.user_files
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists user_files_owner_insert on public.user_files;
create policy user_files_owner_insert on public.user_files
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists user_files_owner_update on public.user_files;
create policy user_files_owner_update on public.user_files
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
drop policy if exists user_files_owner_delete on public.user_files;
create policy user_files_owner_delete on public.user_files
  for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, update, delete on public.user_files to authenticated;

grant usage on schema public to anon, authenticated;
grant execute on function public.save_rows(text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

do $$
declare
  table_name text;
begin
  foreach table_name in array array['leads', 'approvals', 'opportunities', 'records'] loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;

-- Verification: should return exactly these six table names.
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('ai_secrets', 'approvals', 'leads', 'opportunities', 'records', 'user_files')
order by table_name;
