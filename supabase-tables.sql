-- WinTrack / ModAE — row-per-record persistence.
--
-- Replaces the single-table `app_state` model (supabase-setup.sql), where every
-- store slice was one JSONB row and a whole-array upsert silently overwrote a
-- colleague's edit. Here each record is its own row, guarded by a `rev`
-- counter, so a losing write is a no-op the client can merge and retry.
--
-- Four tables, not eighteen. What prevents the data loss is one row per record
-- with the rev guard — not how many tables those rows sit in. Opportunities,
-- leads and approvals keep their own tables because they are what you open the
-- Table Editor to look at; every other entity shares `records` under an
-- `entity` discriminator. The row-level protection is identical either way.
--
-- Paste into Dashboard → SQL Editor → Run. Idempotent: safe to re-run.
-- Policy names are deliberately unquoted — editors that autocorrect straight
-- quotes to curly ones broke the quoted policies in supabase-setup.sql.
--
-- Run order:
--   1. this whole file (schema only — no existing client is affected)
--   2. export app_state:  select key, value from public.app_state;  → Export CSV
--   3. select public.migrate_app_state_to_rows();   -- one-shot backfill
--   4. select * from public.app_meta;               -- expect rowstore.done = true

-- ---------------------------------------------------------------------------
-- Migration bookkeeping
-- ---------------------------------------------------------------------------
create table if not exists public.app_meta (
  key   text primary key,
  value jsonb not null default '{}'::jsonb
);

-- ---------------------------------------------------------------------------
-- Entity tables
--
-- Common shape everywhere: the complete record in `data`, plus the sync
-- columns. The client only ever sends { id, data, rev } — the indexed columns
-- are STORED GENERATED columns over `data`, so adding a field to a record needs
-- no DDL and no client change, and those same columns become the RLS
-- predicates the day real auth lands.
--
-- deleted_at is a soft delete. A hard delete is unsafe while another device may
-- hold a debounced write that would resurrect the row.
-- ---------------------------------------------------------------------------
create table if not exists public.opportunities (
  id         text primary key,
  data       jsonb       not null default '{}'::jsonb,
  rev        bigint      not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text,
  deleted_at timestamptz
);

create table if not exists public.leads (
  id         text primary key,
  data       jsonb       not null default '{}'::jsonb,
  rev        bigint      not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text,
  deleted_at timestamptz
);

create table if not exists public.approvals (
  id         text primary key,
  data       jsonb       not null default '{}'::jsonb,
  rev        bigint      not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text,
  deleted_at timestamptz
);

-- Everything else. `entity` is one of: proposals, clarifications, spares_lines,
-- surveys, competitors, svc_estimates, po_compare, handover, b_steps,
-- communications, kyc, opp_files, customers, users, audit.
--
-- Composite keys are folded into the id with '::' — kyc = customer::item,
-- b_steps = opp::step, opp_files = opp::folder::name — so one save_rows()
-- serves every entity.
create table if not exists public.records (
  entity     text        not null,
  id         text        not null,
  data       jsonb       not null default '{}'::jsonb,
  rev        bigint      not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text,
  deleted_at timestamptz,
  primary key (entity, id)
);

-- Projections. `add column if not exists` keeps this re-runnable.
alter table public.opportunities
  add column if not exists opp_name  text generated always as (data->>'oppName')   stored,
  add column if not exists sell_to   text generated always as (data->>'sellTo')    stored,
  add column if not exists owner     text generated always as (data->>'owner')     stored,
  add column if not exists stage     text generated always as (data->>'stage')     stored,
  add column if not exists status    text generated always as (data->>'status')    stored,
  add column if not exists milestone text generated always as (data->>'milestone') stored;
create index if not exists opportunities_owner_idx on public.opportunities (owner) where deleted_at is null;
create index if not exists opportunities_stage_idx on public.opportunities (stage, status) where deleted_at is null;

alter table public.leads
  add column if not exists status text generated always as (data->>'status')        stored,
  add column if not exists owner  text generated always as (data->>'assignedOwner') stored,
  add column if not exists opp_id text generated always as (data->>'oppId')         stored;
create index if not exists leads_status_idx on public.leads (status) where deleted_at is null;

alter table public.approvals
  add column if not exists opp_id  text generated always as (data->>'oppId')  stored,
  add column if not exists lead_id text generated always as (data->>'leadId') stored,
  add column if not exists status  text generated always as (data->>'status') stored;
create index if not exists approvals_opp_idx    on public.approvals (opp_id) where deleted_at is null;
create index if not exists approvals_status_idx on public.approvals (status) where deleted_at is null;

alter table public.records
  add column if not exists opp_id text generated always as (data->>'oppId') stored;
create index if not exists records_opp_idx     on public.records (entity, opp_id) where deleted_at is null;
create index if not exists records_updated_idx on public.records (entity, updated_at desc);

-- One survey per opportunity, matching requestSurvey's own guard.
create unique index if not exists records_survey_one_per_opp
  on public.records (opp_id) where entity = 'surveys' and deleted_at is null;

-- ---------------------------------------------------------------------------
-- save_rows — the conflict-aware write path.
--
-- p_rows: [{ id, data, rev, deleted, by }]. `rev` is the revision the client
-- believes the server holds; the update only fires when that still matches, so
-- a losing write is a NO-OP rather than a clobber. Every row the guard rejects
-- comes back in `conflicts` carrying the current server record, so the client
-- can merge its own field-level delta and retry in one further round-trip.
--
-- SECURITY INVOKER on purpose: this must not become a hole that bypasses RLS
-- the day the anon `using (true)` policies below are tightened.
-- ---------------------------------------------------------------------------
create or replace function public.save_rows(p_entity text, p_rows jsonb)
returns jsonb
language plpgsql
security invoker
as $$
declare
  accepted  text[] := '{}';
  conflicts jsonb  := '[]'::jsonb;
begin
  if p_entity is null or p_entity !~ '^[a-z_]+$' then
    raise exception 'bad entity %', p_entity using errcode = '22023';
  end if;

  if p_entity in ('opportunities', 'leads', 'approvals') then
    execute format($f$
      with incoming as (
        select r->>'id'                                   as id,
               coalesce(r->'data', '{}'::jsonb)           as data,
               coalesce((r->>'rev')::bigint, 0)           as rev,
               coalesce((r->>'deleted')::boolean, false)  as deleted,
               r->>'by'                                   as by
        from jsonb_array_elements($1) r
      ),
      upserted as (
        insert into public.%1$I as t (id, data, rev, updated_at, updated_by, deleted_at)
        select i.id, i.data, i.rev + 1, now(), i.by, case when i.deleted then now() end
        from incoming i
        on conflict (id) do update
          set data = excluded.data, rev = excluded.rev,
              updated_at = excluded.updated_at, updated_by = excluded.updated_by,
              deleted_at = coalesce(excluded.deleted_at, t.deleted_at)
          where t.rev = excluded.rev - 1
        returning t.id
      )
      select coalesce(array_agg(id), '{}')::text[] from upserted
    $f$, p_entity)
    into accepted using p_rows;

    execute format($f$
      select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
      from public.%1$I t
      where t.id in (select r->>'id' from jsonb_array_elements($1) r)
        and not (t.id = any($2))
    $f$, p_entity)
    into conflicts using p_rows, accepted;

  else
    with incoming as (
      select r->>'id'                                   as id,
             coalesce(r->'data', '{}'::jsonb)           as data,
             coalesce((r->>'rev')::bigint, 0)           as rev,
             coalesce((r->>'deleted')::boolean, false)  as deleted,
             r->>'by'                                   as by
      from jsonb_array_elements(p_rows) r
    ),
    upserted as (
      insert into public.records as t (entity, id, data, rev, updated_at, updated_by, deleted_at)
      select p_entity, i.id, i.data, i.rev + 1, now(), i.by, case when i.deleted then now() end
      from incoming i
      on conflict (entity, id) do update
        set data = excluded.data, rev = excluded.rev,
            updated_at = excluded.updated_at, updated_by = excluded.updated_by,
            deleted_at = coalesce(excluded.deleted_at, t.deleted_at)
        where t.rev = excluded.rev - 1
      returning t.id
    )
    select coalesce(array_agg(id), '{}')::text[] into accepted from upserted;

    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into conflicts
    from public.records t
    where t.entity = p_entity
      and t.id in (select r->>'id' from jsonb_array_elements(p_rows) r)
      and not (t.id = any(accepted));
  end if;

  return jsonb_build_object('accepted', to_jsonb(accepted), 'conflicts', conflicts);
end $$;

-- ---------------------------------------------------------------------------
-- One-shot backfill from app_state.
--
-- Guarded three ways: an advisory lock (so two simultaneous calls cannot
-- interleave), an app_meta 'done' flag, and `on conflict do nothing` on every
-- insert. That last clause is the load-bearing one — it is what makes a later
-- accidental re-run harmless even after real users have written rows.
-- ---------------------------------------------------------------------------
create or replace function public.migrate_app_state_to_rows()
returns jsonb
language plpgsql
security invoker
as $$
declare
  moved jsonb := '{}'::jsonb;
  n     bigint;
begin
  perform pg_advisory_xact_lock(hashtext('modae_appstate_migration'));

  if coalesce((select value->>'done' from public.app_meta where key = 'rowstore'), 'false') = 'true' then
    return jsonb_build_object('skipped', true, 'reason', 'already migrated');
  end if;

  -- The three own-table entities.
  with src as (select value from public.app_state where key = 'opportunities'),
       ins as (insert into public.opportunities (id, data)
               select e->>'id', e from src, jsonb_array_elements(value) e
               where e->>'id' is not null
               on conflict (id) do nothing returning 1)
  select count(*) into n from ins;  moved := moved || jsonb_build_object('opportunities', n);

  with src as (select value from public.app_state where key = 'leads'),
       ins as (insert into public.leads (id, data)
               select e->>'id', e from src, jsonb_array_elements(value) e
               where e->>'id' is not null
               on conflict (id) do nothing returning 1)
  select count(*) into n from ins;  moved := moved || jsonb_build_object('leads', n);

  with src as (select value from public.app_state where key = 'approvals'),
       ins as (insert into public.approvals (id, data)
               select e->>'id', e from src, jsonb_array_elements(value) e
               where e->>'id' is not null
               on conflict (id) do nothing returning 1)
  select count(*) into n from ins;  moved := moved || jsonb_build_object('approvals', n);

  -- Arrays whose elements already carry an id → records.
  with src as (select value from public.app_state where key = 'clarifications'),
       ins as (insert into public.records (entity, id, data)
               select 'clarifications', e->>'id', e from src, jsonb_array_elements(value) e
               where e->>'id' is not null
               on conflict (entity, id) do nothing returning 1)
  select count(*) into n from ins;  moved := moved || jsonb_build_object('clarifications', n);

  with src as (select value from public.app_state where key = 'sparesLines'),
       ins as (insert into public.records (entity, id, data)
               select 'spares_lines', e->>'id', e from src, jsonb_array_elements(value) e
               where e->>'id' is not null
               on conflict (entity, id) do nothing returning 1)
  select count(*) into n from ins;  moved := moved || jsonb_build_object('spares_lines', n);

  with src as (select value from public.app_state where key = 'surveys'),
       ins as (insert into public.records (entity, id, data)
               select 'surveys', e->>'id', e from src, jsonb_array_elements(value) e
               where e->>'id' is not null
               on conflict (entity, id) do nothing returning 1)
  select count(*) into n from ins;  moved := moved || jsonb_build_object('surveys', n);

  with src as (select value from public.app_state where key = 'competitors'),
       ins as (insert into public.records (entity, id, data)
               select 'competitors', e->>'id', e from src, jsonb_array_elements(value) e
               where e->>'id' is not null
               on conflict (entity, id) do nothing returning 1)
  select count(*) into n from ins;  moved := moved || jsonb_build_object('competitors', n);

  with src as (select value from public.app_state where key = 'users'),
       ins as (insert into public.records (entity, id, data)
               select 'users', e->>'id', e from src, jsonb_array_elements(value) e
               where e->>'id' is not null
               on conflict (entity, id) do nothing returning 1)
  select count(*) into n from ins;  moved := moved || jsonb_build_object('users', n);

  -- Natural-key arrays: the customer name / opportunity id is the pk.
  with src as (select value from public.app_state where key = 'customers'),
       ins as (insert into public.records (entity, id, data)
               select 'customers', e->>'name', e from src, jsonb_array_elements(value) e
               where e->>'name' is not null
               on conflict (entity, id) do nothing returning 1)
  select count(*) into n from ins;  moved := moved || jsonb_build_object('customers', n);

  with src as (select value from public.app_state where key = 'svcEstimates'),
       ins as (insert into public.records (entity, id, data)
               select 'svc_estimates', e->>'oppId', e from src, jsonb_array_elements(value) e
               where e->>'oppId' is not null
               on conflict (entity, id) do nothing returning 1)
  select count(*) into n from ins;  moved := moved || jsonb_build_object('svc_estimates', n);

  -- The audit log has no id; hash the entry so a re-run stays idempotent.
  with src as (select value from public.app_state where key = 'audit'),
       ins as (insert into public.records (entity, id, data)
               select 'audit', md5(e::text), e from src, jsonb_array_elements(value) e
               on conflict (entity, id) do nothing returning 1)
  select count(*) into n from ins;  moved := moved || jsonb_build_object('audit', n);

  -- Maps keyed by opportunity id: { oppId: record }.
  with src as (select value from public.app_state where key = 'proposals'),
       ins as (insert into public.records (entity, id, data)
               select 'proposals', kv.k, kv.v || jsonb_build_object('oppId', kv.k)
               from src, jsonb_each(value) as kv(k, v)
               on conflict (entity, id) do nothing returning 1)
  select count(*) into n from ins;  moved := moved || jsonb_build_object('proposals', n);

  with src as (select value from public.app_state where key = 'poCompare'),
       ins as (insert into public.records (entity, id, data)
               select 'po_compare', kv.k, kv.v || jsonb_build_object('oppId', kv.k)
               from src, jsonb_each(value) as kv(k, v)
               on conflict (entity, id) do nothing returning 1)
  select count(*) into n from ins;  moved := moved || jsonb_build_object('po_compare', n);

  with src as (select value from public.app_state where key = 'handover'),
       ins as (insert into public.records (entity, id, data)
               select 'handover', kv.k, kv.v || jsonb_build_object('oppId', kv.k)
               from src, jsonb_each(value) as kv(k, v)
               on conflict (entity, id) do nothing returning 1)
  select count(*) into n from ins;  moved := moved || jsonb_build_object('handover', n);

  -- Nested maps and arrays: the composite key folds into the id with '::'.
  with src as (select value from public.app_state where key = 'bSteps'),
       ins as (insert into public.records (entity, id, data)
               select 'b_steps', o.k || '::' || st.k,
                      st.v || jsonb_build_object('oppId', o.k, 'stepId', st.k)
               from src, jsonb_each(value) as o(k, v), jsonb_each(o.v) as st(k, v)
               on conflict (entity, id) do nothing returning 1)
  select count(*) into n from ins;  moved := moved || jsonb_build_object('b_steps', n);

  with src as (select value from public.app_state where key = 'communications'),
       ins as (insert into public.records (entity, id, data)
               select 'communications', o.k || '::' || c.ord::text,
                      c.v || jsonb_build_object('oppId', o.k)
               from src, jsonb_each(value) as o(k, v),
                    jsonb_array_elements(o.v) with ordinality as c(v, ord)
               on conflict (entity, id) do nothing returning 1)
  select count(*) into n from ins;  moved := moved || jsonb_build_object('communications', n);

  with src as (select value from public.app_state where key = 'kyc'),
       ins as (insert into public.records (entity, id, data)
               select 'kyc', c.k || '::' || coalesce(it.v->>'name', it.ord::text),
                      it.v || jsonb_build_object('customerName', c.k)
               from src, jsonb_each(value) as c(k, v),
                    jsonb_array_elements(c.v) with ordinality as it(v, ord)
               on conflict (entity, id) do nothing returning 1)
  select count(*) into n from ins;  moved := moved || jsonb_build_object('kyc', n);

  -- files: { oppId: { folder: [ {name,...} ] } } — metadata only, the bytes
  -- already live in Storage.
  with src as (select value from public.app_state where key = 'files'),
       ins as (insert into public.records (entity, id, data)
               select 'opp_files', o.k || '::' || f.k || '::' || coalesce(fl.v->>'name', fl.ord::text),
                      fl.v || jsonb_build_object('oppId', o.k, 'folder', f.k)
               from src, jsonb_each(value) as o(k, v),
                    jsonb_each(o.v) as f(k, v),
                    jsonb_array_elements(f.v) with ordinality as fl(v, ord)
               on conflict (entity, id) do nothing returning 1)
  select count(*) into n from ins;  moved := moved || jsonb_build_object('opp_files', n);

  insert into public.app_meta (key, value)
  values ('rowstore', jsonb_build_object('done', true, 'frozen', false, 'at', now(), 'version', 2, 'moved', moved))
  on conflict (key) do update set value = excluded.value;

  return moved;
end $$;

-- ---------------------------------------------------------------------------
-- Clean up the first-pass tables that `records` now replaces.
--
-- Guarded: if any of them holds a row, this raises instead of dropping, so it
-- can never discard real data. They are empty when the backfill has not been
-- run against the 18-table version.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  gone text[] := array[
    'clarifications', 'spares_lines', 'surveys', 'competitors', 'customers',
    'users', 'audit', 'proposals', 'svc_estimates', 'po_compare', 'handover',
    'b_steps', 'communications', 'kyc', 'opp_files'
  ];
  n bigint;
begin
  foreach t in array gone loop
    if to_regclass('public.' || t) is not null then
      execute format('select count(*) from public.%I', t) into n;
      if n > 0 then
        raise exception 'public.% holds % rows — migrate them into public.records before dropping', t, n;
      end if;
      execute format('drop table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Freeze the legacy blob (run only at the END of the dual-write window).
--
--   update public.app_meta set value = jsonb_set(value, '{frozen}', 'true') where key = 'rowstore';
--
-- Old clients then fail to write the migrated slices — safely: their
-- flushSaves() already catches and warns, localStorage keeps their work, they
-- simply stop syncing until they reload onto the new build.
-- ---------------------------------------------------------------------------
create or replace function public.app_state_freeze()
returns trigger
language plpgsql
as $$
begin
  if new.key in ('opportunities','leads','approvals','clarifications','sparesLines','surveys',
                 'competitors','customers','users','audit','proposals','svcEstimates',
                 'poCompare','handover','bSteps','communications','kyc','files')
     and coalesce((select value->>'frozen' from public.app_meta where key = 'rowstore'), 'false') = 'true'
  then
    raise exception 'app_state.% is frozen — this build is out of date, please reload', new.key
      using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists app_state_freeze_trg on public.app_state;
create trigger app_state_freeze_trg
  before insert or update on public.app_state
  for each row execute function public.app_state_freeze();

-- ---------------------------------------------------------------------------
-- Rollback: rebuild the app_state blobs from the row tables, then
--   update public.app_meta set value = jsonb_set(value, '{frozen}', 'false') where key = 'rowstore';
-- and redeploy the client with VITE_ROWSTORE unset.
-- ---------------------------------------------------------------------------
create or replace function public.rows_to_app_state()
returns void
language plpgsql
security invoker
as $$
begin
  insert into public.app_state (key, value, updated_at)
  select 'opportunities', coalesce(jsonb_agg(data order by id), '[]'::jsonb), now()
  from public.opportunities where deleted_at is null
  on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;

  insert into public.app_state (key, value, updated_at)
  select 'leads', coalesce(jsonb_agg(data order by id), '[]'::jsonb), now()
  from public.leads where deleted_at is null
  on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;

  insert into public.app_state (key, value, updated_at)
  select 'approvals', coalesce(jsonb_agg(data order by id), '[]'::jsonb), now()
  from public.approvals where deleted_at is null
  on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;

  insert into public.app_state (key, value, updated_at)
  select 'proposals', coalesce(jsonb_object_agg(id, data), '{}'::jsonb), now()
  from public.records where entity = 'proposals' and deleted_at is null
  on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;

  insert into public.app_state (key, value, updated_at)
  select 'clarifications', coalesce(jsonb_agg(data order by id), '[]'::jsonb), now()
  from public.records where entity = 'clarifications' and deleted_at is null
  on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;
  -- Extend per entity if a rollback ever needs the long tail; these five carry
  -- the transactional data.
end $$;

-- ---------------------------------------------------------------------------
-- Access. Prototype-grade, deliberately identical to supabase-setup.sql:
-- anyone holding the anon key can read and write. This file does NOT improve
-- the security posture — it fixes concurrency. Tighten to
--   using (owner = auth.jwt()->>'sub')
-- on the generated columns above once real auth exists; no client change is
-- needed for that, which is why the projections are there.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  tables text[] := array['opportunities', 'leads', 'approvals', 'records', 'app_meta'];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists anon_select_%1$s on public.%1$I', t);
    execute format('create policy anon_select_%1$s on public.%1$I for select to anon, authenticated using (true)', t);
    execute format('drop policy if exists anon_insert_%1$s on public.%1$I', t);
    execute format('create policy anon_insert_%1$s on public.%1$I for insert to anon, authenticated with check (true)', t);
    execute format('drop policy if exists anon_update_%1$s on public.%1$I', t);
    execute format('create policy anon_update_%1$s on public.%1$I for update to anon, authenticated using (true)', t);
    execute format('drop policy if exists anon_delete_%1$s on public.%1$I', t);
    execute format('create policy anon_delete_%1$s on public.%1$I for delete to anon, authenticated using (true)', t);
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated', t);
  end loop;
end $$;

grant usage on schema public to anon, authenticated;
grant execute on function public.save_rows(text, jsonb) to anon, authenticated;
grant execute on function public.migrate_app_state_to_rows() to anon, authenticated;
