-- WinTrack ModAE — irreversible workspace purge, retaining price lists and user profiles.
-- This function is service-role-only and is invoked by api/purge-workspace.js
-- after it verifies a signed-in SUPER, ADMIN, or LJS profile.


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
  where not (entity = 'state' and id = 'users')
    and entity not in ('price_lists', 'price_list_versions');
  get diagnostics affected = row_count;
  counts := counts || jsonb_build_object('records', affected);

  return counts;
end;
$$;

revoke all on function public.purge_workspace_data() from public, anon, authenticated;
grant execute on function public.purge_workspace_data() to service_role;
