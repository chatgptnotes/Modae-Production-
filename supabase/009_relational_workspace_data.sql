-- WinTrack ModAE — relational workspace data model.
-- Run after 008_dedicated_workspace_tables.sql.
-- This migration is additive: legacy JSONB rows remain available until the
-- relational readers and production verification are complete.

create table if not exists public.customers (
  id text primary key,
  name text not null,
  customer_class text,
  email text,
  phone text,
  address text,
  city text,
  state text,
  country text,
  gstin text,
  pan text,
  cin text,
  kyc_status text,
  metadata jsonb not null default '{}'::jsonb,
  rev bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text,
  deleted_at timestamptz
);

create table if not exists public.customer_contacts (
  id text primary key,
  customer_id text not null references public.customers(id),
  name text not null,
  email text,
  phone text,
  role text,
  is_primary boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  rev bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text,
  deleted_at timestamptz
);

create table if not exists public.lead_items (
  id text primary key,
  lead_id text not null references public.leads(id),
  customer_reference text,
  part_number text,
  description text,
  quantity numeric,
  unit text,
  metadata jsonb not null default '{}'::jsonb,
  rev bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text,
  deleted_at timestamptz
);

create table if not exists public.opportunity_items (
  id text primary key,
  opportunity_id text not null references public.opportunities(id),
  item_type text not null default 'spares',
  part_number text,
  description text,
  quantity numeric,
  unit_price numeric,
  currency text,
  confirmation_state text,
  metadata jsonb not null default '{}'::jsonb,
  rev bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text,
  deleted_at timestamptz
);

create table if not exists public.proposal_items (
  id text primary key,
  proposal_id text not null,
  opportunity_id text references public.opportunities(id),
  item_type text not null default 'line',
  part_number text,
  description text,
  quantity numeric,
  unit_price numeric,
  total_price numeric,
  currency text,
  metadata jsonb not null default '{}'::jsonb,
  rev bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text,
  deleted_at timestamptz
);

create table if not exists public.catalogue_versions (
  id text primary key,
  catalogue_code text not null,
  version text not null,
  currency text,
  filename text,
  uploaded_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  rev bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text,
  deleted_at timestamptz,
  unique (catalogue_code, version)
);

create table if not exists public.catalogue_parts (
  id text primary key,
  version_id text not null references public.catalogue_versions(id),
  part_number text,
  description text,
  manufacturer text,
  unit_price numeric,
  currency text,
  lead_time text,
  metadata jsonb not null default '{}'::jsonb,
  rev bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text,
  deleted_at timestamptz
);

create table if not exists public.communications (
  id text primary key,
  opportunity_id text references public.opportunities(id),
  lead_id text references public.leads(id),
  direction text,
  sender text,
  recipients text[],
  subject text,
  body text,
  sent_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  rev bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text,
  deleted_at timestamptz
);

create table if not exists public.audit_events (
  id text primary key,
  entity_type text not null,
  entity_id text not null,
  action text not null,
  actor text,
  detail text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  rev bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text,
  deleted_at timestamptz
);

create table if not exists public.workspace_settings (
  id text primary key,
  setting_group text not null,
  setting_key text not null,
  value jsonb not null default '{}'::jsonb,
  rev bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text,
  deleted_at timestamptz,
  unique (setting_group, setting_key)
);

-- Backfill the highest-value typed fields. Full source payloads stay in
-- metadata so no imported or AI-derived information is discarded.
insert into public.customers (id, name, customer_class, email, phone, address, city, state, country, gstin, pan, cin, kyc_status, metadata)
select coalesce(nullif(data->>'id', ''), md5(data::text)),
       coalesce(data->>'name', data->>'customerName', 'Unnamed customer'),
       coalesce(data->>'customerClass', data->>'class'), data->>'email', data->>'phone',
       data->>'address', data->>'city', data->>'state', data->>'country', data->>'gstin', data->>'pan', data->>'cin',
       coalesce(data->>'kyc', data->>'kycStatus'), data
from public.records
where entity = 'customers' and deleted_at is null
on conflict (id) do nothing;

insert into public.lead_items (id, lead_id, customer_reference, part_number, description, quantity, unit, metadata)
select coalesce(nullif(r.data->>'id', ''), md5(r.data::text)),
       coalesce(r.data->>'leadId', r.id),
       coalesce(r.data->>'custRef', r.data->>'customerReference'), r.data->>'pn', r.data->>'desc',
       case when r.data->>'qty' ~ '^-?[0-9]+(\\.[0-9]+)?$' then (r.data->>'qty')::numeric end,
       r.data->>'unit', r.data
from public.records r
where r.entity = 'lead_items' and r.deleted_at is null
on conflict (id) do nothing;

insert into public.opportunity_items (id, opportunity_id, item_type, part_number, description, quantity, unit_price, currency, metadata)
select coalesce(nullif(data->>'id', ''), md5(data::text)), data->>'oppId',
       coalesce(data->>'itemType', 'spares'), data->>'pn', data->>'desc',
       case when data->>'qty' ~ '^-?[0-9]+(\\.[0-9]+)?$' then (data->>'qty')::numeric end,
       case when data->>'listUnitPrice' ~ '^-?[0-9]+(\\.[0-9]+)?$' then (data->>'listUnitPrice')::numeric end,
       data->>'currency', data
from public.spares_lines
where deleted_at is null
on conflict (id) do nothing;

insert into public.audit_events (id, entity_type, entity_id, action, actor, detail, occurred_at, metadata)
select id, 'workspace', coalesce(data->>'objectId', ''), coalesce(data->>'action', 'unknown'),
       data->>'role', data->>'detail', updated_at, data
from public.audit
where deleted_at is null
on conflict (id) do nothing;

insert into public.proposal_items (id, proposal_id, opportunity_id, item_type, part_number, description, quantity, unit_price, total_price, currency, metadata)
select concat(p.id, ':', item.ordinality), p.id, p.data->>'oppId', coalesce(item.value->>'itemType', 'line'),
       item.value->>'pn', item.value->>'desc',
       case when item.value->>'qty' ~ '^-?[0-9]+(\\.[0-9]+)?$' then (item.value->>'qty')::numeric end,
       case when item.value->>'unitPrice' ~ '^-?[0-9]+(\\.[0-9]+)?$' then (item.value->>'unitPrice')::numeric end,
       case when item.value->>'total' ~ '^-?[0-9]+(\\.[0-9]+)?$' then (item.value->>'total')::numeric end,
       coalesce(item.value->>'currency', p.data->>'currency'), item.value
from public.proposals p
cross join lateral jsonb_array_elements(coalesce(p.data->'bom', '[]'::jsonb)) with ordinality item(value, ordinality)
where p.deleted_at is null
on conflict (id) do nothing;

insert into public.catalogue_versions (id, catalogue_code, version, currency, filename, metadata)
select coalesce(v.value->>'id', concat(pl.id, ':', coalesce(v.value->>'version', 'Initial'))),
       pl.id, coalesce(v.value->>'version', 'Initial'),
       coalesce(v.value->>'currency', pl.data->>'sourceCurrency'), v.value->>'filename', v.value
from public.price_lists pl
cross join lateral jsonb_array_elements(coalesce(pl.data->'versions', '[]'::jsonb)) v(value)
where pl.deleted_at is null
on conflict (id) do nothing;

insert into public.catalogue_parts (id, version_id, part_number, description, manufacturer, unit_price, currency, metadata)
select concat(cv.id, ':', part.ordinality), cv.id, part.value->>'pn', part.value->>'description',
       part.value->>'oem',
       case when part.value->>'price' ~ '^-?[0-9]+(\\.[0-9]+)?$' then (part.value->>'price')::numeric end,
       coalesce(part.value->>'currency', cv.currency), part.value
from public.catalogue_versions cv
join public.price_list_versions plv on plv.id = cv.id
cross join lateral jsonb_array_elements(coalesce(plv.data->'parts', '[]'::jsonb)) with ordinality part(value, ordinality)
where plv.deleted_at is null
on conflict (id) do nothing;

create index if not exists customers_name_idx on public.customers (lower(name)) where deleted_at is null;
create index if not exists customers_class_idx on public.customers (customer_class) where deleted_at is null;
create index if not exists customer_contacts_customer_idx on public.customer_contacts (customer_id) where deleted_at is null;
create index if not exists lead_items_lead_idx on public.lead_items (lead_id) where deleted_at is null;
create index if not exists opportunity_items_opp_idx on public.opportunity_items (opportunity_id) where deleted_at is null;
create index if not exists proposal_items_proposal_idx on public.proposal_items (proposal_id) where deleted_at is null;
create index if not exists catalogue_versions_code_idx on public.catalogue_versions (catalogue_code, version) where deleted_at is null;
create index if not exists catalogue_parts_version_part_idx on public.catalogue_parts (version_id, lower(part_number)) where deleted_at is null;
create index if not exists communications_opp_idx on public.communications (opportunity_id, sent_at desc) where deleted_at is null;
create index if not exists audit_events_entity_idx on public.audit_events (entity_type, entity_id, occurred_at desc) where deleted_at is null;
create index if not exists workspace_settings_group_idx on public.workspace_settings (setting_group, setting_key) where deleted_at is null;

-- Enable RLS before exposing the relational tables to the browser client.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'customers',
    'customer_contacts',
    'lead_items',
    'opportunity_items',
    'proposal_items',
    'catalogue_versions',
    'catalogue_parts',
    'communications',
    'audit_events',
    'workspace_settings'
  ] loop
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
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;
