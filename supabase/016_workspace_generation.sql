-- WinTrack ModAE — automatic invalidation for direct workspace deletes.
-- The marker lives in the existing records state model so no new runtime table
-- is needed. Server caches compare it before serving or accepting snapshots.

insert into public.records (entity, id, data, rev, updated_at, updated_by, deleted_at)
values ('state', 'workspace_generation', '{"value": 0}'::jsonb, 1, now(), 'migration-016', null)
on conflict (entity, id) do nothing;

create or replace function public.bump_workspace_generation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.records as generation_marker (entity, id, data, rev, updated_at, updated_by, deleted_at)
  values ('state', 'workspace_generation', '{"value": 1}'::jsonb, 1, now(), 'database-delete', null)
  on conflict (entity, id) do update
    set data = jsonb_build_object('value', coalesce((generation_marker.data->>'value')::bigint, 0) + 1),
        rev = generation_marker.rev + 1,
        updated_at = now(),
        updated_by = 'database-delete',
        deleted_at = null;
  return null;
end;
$$;

revoke all on function public.bump_workspace_generation() from public, anon, authenticated;

drop trigger if exists opportunities_workspace_generation_delete on public.opportunities;
create trigger opportunities_workspace_generation_delete
after delete on public.opportunities
for each statement execute function public.bump_workspace_generation();

drop trigger if exists leads_workspace_generation_delete on public.leads;
create trigger leads_workspace_generation_delete
after delete on public.leads
for each statement execute function public.bump_workspace_generation();

drop trigger if exists approvals_workspace_generation_delete on public.approvals;
create trigger approvals_workspace_generation_delete
after delete on public.approvals
for each statement execute function public.bump_workspace_generation();

-- Keep the marker alive during the permanent purge so the next browser pull
-- observes the new generation instead of accepting an old cached snapshot.
create or replace function public.purge_workspace_data()
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  counts jsonb := '{}'::jsonb;
  affected bigint := 0;
begin
  delete from public.customer_contacts;
  get diagnostics affected = row_count;
  counts := counts || jsonb_build_object('customer_contacts', affected);
  delete from public.lead_items;
  get diagnostics affected = row_count;
  counts := counts || jsonb_build_object('lead_items', affected);
  delete from public.opportunity_items;
  get diagnostics affected = row_count;
  counts := counts || jsonb_build_object('opportunity_items', affected);
  delete from public.proposal_items;
  get diagnostics affected = row_count;
  counts := counts || jsonb_build_object('proposal_items', affected);
  delete from public.communications;
  get diagnostics affected = row_count;
  counts := counts || jsonb_build_object('communications', affected);
  delete from public.audit_events;
  get diagnostics affected = row_count;
  counts := counts || jsonb_build_object('audit_events', affected);
  delete from public.workspace_settings;
  get diagnostics affected = row_count;
  counts := counts || jsonb_build_object('workspace_settings', affected);
  delete from public.catalogue_parts;
  get diagnostics affected = row_count;
  counts := counts || jsonb_build_object('catalogue_parts', affected);
  delete from public.catalogue_versions;
  get diagnostics affected = row_count;
  counts := counts || jsonb_build_object('catalogue_versions', affected);
  delete from public.customers;
  get diagnostics affected = row_count;
  counts := counts || jsonb_build_object('customers', affected);
  delete from public.user_files;
  get diagnostics affected = row_count;
  counts := counts || jsonb_build_object('user_files', affected);
  delete from public.proposals;
  get diagnostics affected = row_count;
  counts := counts || jsonb_build_object('proposals', affected);
  delete from public.spares_lines;
  get diagnostics affected = row_count;
  counts := counts || jsonb_build_object('spares_lines', affected);
  delete from public.clarifications;
  get diagnostics affected = row_count;
  counts := counts || jsonb_build_object('clarifications', affected);
  delete from public.audit;
  get diagnostics affected = row_count;
  counts := counts || jsonb_build_object('audit', affected);
  delete from public.settings;
  get diagnostics affected = row_count;
  counts := counts || jsonb_build_object('settings', affected);
  delete from public.approvals;
  get diagnostics affected = row_count;
  counts := counts || jsonb_build_object('approvals', affected);
  delete from public.leads;
  get diagnostics affected = row_count;
  counts := counts || jsonb_build_object('leads', affected);
  delete from public.opportunities;
  get diagnostics affected = row_count;
  counts := counts || jsonb_build_object('opportunities', affected);
  delete from public.ai_secrets;
  get diagnostics affected = row_count;
  counts := counts || jsonb_build_object('ai_secrets', affected);
  delete from public.records
  where not (entity = 'state' and id in ('users', 'workspace_generation'))
    and entity not in ('price_lists', 'price_list_versions');
  get diagnostics affected = row_count;
  counts := counts || jsonb_build_object('records', affected);
  return counts;
end;
$$;

revoke all on function public.purge_workspace_data() from public, anon, authenticated;
grant execute on function public.purge_workspace_data() to service_role;
