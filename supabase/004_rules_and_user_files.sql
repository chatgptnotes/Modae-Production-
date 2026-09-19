-- Runtime rules and direct PostgreSQL file persistence.
-- Run manually in Supabase SQL Editor after 003_app_settings.sql.
-- Safe to re-run.

create table if not exists public.workflow_rules (
  rule_key text primary key,
  label text not null,
  definition jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.approval_rules (
  rule_key text primary key,
  label text not null,
  definition jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.lead_rules (
  rule_key text primary key,
  label text not null,
  definition jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

-- One BYTEA row per uploaded file. The logical record is identified by the
-- record type/id pair, so lead, KYC, opportunity, template, and folder files
-- share one persistence path.
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_files_name_length check (char_length(file_name) between 1 and 255),
  constraint user_files_size_matches check (file_size = octet_length(file_data)),
  constraint user_files_size_limit check (file_size between 0 and 10485760)
);

create unique index if not exists user_files_scope_name_idx
  on public.user_files (user_id, record_type, record_id, folder, file_name);
create index if not exists user_files_scope_idx
  on public.user_files (user_id, record_type, record_id, folder);

alter table public.workflow_rules enable row level security;
alter table public.approval_rules enable row level security;
alter table public.lead_rules enable row level security;
alter table public.user_files enable row level security;

-- Active rules are shared workspace configuration. Writes are restricted to
-- authenticated users whose application profile has an admin/LJS role. The
-- profile lookup is intentionally isolated in one helper so role mapping can
-- be changed without rewriting every policy.
create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  app_user_id text unique,
  role text not null default 'RS',
  updated_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;
drop policy if exists user_profiles_self on public.user_profiles;
create policy user_profiles_self on public.user_profiles
  for select to authenticated using (id = (select auth.uid()));

create or replace function public.can_edit_rules()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_profiles p
    where p.id = (select auth.uid())
      and p.role in ('SUPER', 'LJS')
  );
$$;

grant execute on function public.can_edit_rules() to authenticated;

-- Configuration rows are readable by signed-in users, but only the same
-- admin/LJS roles may change them. This keeps legacy app_settings writes from
-- bypassing the normalized rule tables.
drop policy if exists anon_read_app_settings on public.app_settings;
drop policy if exists anon_write_app_settings on public.app_settings;
drop policy if exists app_settings_authenticated_read on public.app_settings;
drop policy if exists app_settings_admin_write on public.app_settings;
create policy app_settings_authenticated_read on public.app_settings
  for select to authenticated using (true);
create policy app_settings_admin_write on public.app_settings
  for all to authenticated using (public.can_edit_rules()) with check (public.can_edit_rules());

do $$
declare
  t text;
begin
  foreach t in array array['workflow_rules', 'approval_rules', 'lead_rules'] loop
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format('create policy %I_read on public.%I for select to authenticated using (true)', t, t);
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format('create policy %I_write on public.%I for all to authenticated using (public.can_edit_rules()) with check (public.can_edit_rules())', t, t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

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

-- After creating Auth users, map their application roles manually, for example:
-- insert into public.user_profiles (id, app_user_id, role)
-- values ('AUTH-USER-UUID', 'U-001', 'SUPER');

-- Convert the existing JSON configuration into the first rule rows. This keeps
-- the current application behavior while making the rule families queryable.
insert into public.approval_rules (rule_key, label, definition)
select 'approval-thresholds', 'Approval thresholds', jsonb_build_object(
  'thresholds', coalesce(value->'approvalThresholds', '{}'::jsonb),
  'gates', jsonb_build_array(
    jsonb_build_object('key', 'tech-approval', 'type', 'Technical approval', 'label', 'Technical approval (LJS or AN)', 'routes', jsonb_build_array('Project', 'Retrofit'), 'needed', jsonb_build_array('LJS', 'AN'), 'anyOf', true, 'approver', 'LJS'),
    jsonb_build_object('key', 'comm-approval', 'type', 'Commercial approval', 'label', 'Commercial approval (AH)', 'routes', jsonb_build_array('Project', 'Retrofit', 'Spares'), 'needed', jsonb_build_array('AH'), 'approver', 'AH'),
    jsonb_build_object('key', 'release', 'type', 'Final quote release', 'label', 'Final quote release', 'routes', jsonb_build_array('Project', 'Retrofit', 'Spares'), 'needed', jsonb_build_array('LJS', 'AH'), 'approver', 'LJS'),
    jsonb_build_object('key', 'service-review', 'type', 'Service offer review', 'label', 'Service offer review', 'routes', jsonb_build_array('Service'), 'needed', jsonb_build_array('AH', 'LJS'), 'approver', 'AH')
  )
)
from public.app_settings where key = 'config'
on conflict (rule_key) do nothing;

insert into public.lead_rules (rule_key, label, definition)
select 'lead-routing-and-deadlines', 'Lead routing and deadlines', jsonb_build_object(
  'ownershipRules', coalesce(value->'ownershipRules', '[]'::jsonb),
  'ownerRules', coalesce(value->'ownerRules', '[]'::jsonb),
  'stateRegions', coalesce(value->'stateRegions', '[]'::jsonb),
  'leadDeadlines', coalesce(value->'leadDeadlines', '{}'::jsonb),
  'fastTrack', coalesce(value->'fastTrack', '{}'::jsonb)
)
from public.app_settings where key = 'config'
on conflict (rule_key) do nothing;

insert into public.workflow_rules (rule_key, label, definition)
select 'workflow-and-gates', 'Workflow and gate definitions', jsonb_build_object(
  'workflow', coalesce(value->'workflow', '{}'::jsonb),
  'customerClasses', coalesce(value->'customerClasses', '{}'::jsonb),
  'documentChecklists', coalesce(value->'documentChecklists', '{}'::jsonb),
  'kycItems', coalesce(value->'kycItems', '[]'::jsonb),
  'kycValidation', coalesce(value->'kycValidation', '{}'::jsonb),
  'classRules', coalesce(value->'classRules', '{}'::jsonb),
  'amberFee', coalesce(value->'amberFee', '{}'::jsonb),
  'requiredFields', jsonb_build_array(
    jsonb_build_object('field', 'sellTo', 'text', 'Customer is required'),
    jsonb_build_object('field', 'eucName', 'text', 'EUC name is required'),
    jsonb_build_object('field', 'eucLocation', 'text', 'EUC location is required'),
    jsonb_build_object('field', 'oppName', 'text', 'Opportunity name is required'),
    jsonb_build_object('field', 'owner', 'text', 'Opportunity owner is required'),
    jsonb_build_object('field', 'route', 'text', 'Opportunity route is required'),
    jsonb_build_object('field', 'contactPerson', 'text', 'Customer contact person is required'),
    jsonb_build_object('field', 'contactPhone', 'text', 'Customer contact phone is required')
  )
)
from public.app_settings where key = 'config'
on conflict (rule_key) do nothing;
