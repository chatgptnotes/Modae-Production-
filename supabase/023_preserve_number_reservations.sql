-- Keep the permanent opportunity reservation history across explicit workspace purges.
-- Only production contract tables are referenced. Prices, user attribution and
-- the workspace generation survive, as in the existing purge contract.
create or replace function public.purge_workspace_data()
returns jsonb language plpgsql security invoker set search_path = public
as $$
declare
  counts jsonb := '{}'::jsonb;
  affected bigint := 0;
begin
  perform pg_advisory_xact_lock(721051021);
  -- Imported IDs may predate reservations. Record them before deleting rows.
  insert into public.settings(id, data)
    select 'opportunity_reserved_' || id, jsonb_build_object('id', id)
    from public.opportunities
  on conflict(id) do nothing;
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
  delete from public.settings
  where left(id, length('opportunity_reserved_')) <> 'opportunity_reserved_'
    and left(id, length('opportunity_counter_')) <> 'opportunity_counter_'
    and left(id, length('opportunity_sequence_')) <> 'opportunity_sequence_';
  get diagnostics affected = row_count;
  counts := counts || jsonb_build_object('settings', affected);
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
