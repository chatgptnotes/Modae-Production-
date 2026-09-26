-- WinTrack ModAE — start with a fresh workspace and keep approved prices.
--
-- Run in Supabase Dashboard -> SQL Editor on the correct project.
-- This removes workspace/business data and uploaded workspace files. It does
-- not change the schema, users, settings, or any approved price catalogue.
--
-- The operation is destructive. Review the verification output before using
-- this against production, and take a database backup if the old workspace
-- must be recoverable.

begin;

-- Remove relational children before their parent rows.
delete from public.customer_contacts;
delete from public.lead_items;
delete from public.opportunity_items;
delete from public.proposal_items;
delete from public.communications;
delete from public.audit_events;

-- Remove typed workspace records. Catalogue tables are intentionally kept:
-- they are the relational price-catalogue projection and may contain the
-- previous approved prices during schema rollout.
delete from public.customers;

-- Remove the dedicated JSONB workspace entities, including audit history.
delete from public.proposals;
delete from public.spares_lines;
delete from public.clarifications;
delete from public.audit;
delete from public.leads;
delete from public.approvals;
delete from public.opportunities;

-- Remove uploaded workspace file rows and their stored bytes. This is the
-- database-backed file store used by the current application.
delete from public.user_files;

-- Remove legacy copies of operational data and consolidated state. Keeping
-- only these entities prevents an old `state` row from repopulating the app
-- after the reset, while retaining the settings and price fallback records.
delete from public.records
where entity not in ('settings', 'price_lists', 'price_list_versions');

-- Verify that the price sources still exist before committing.
do $$
begin
  if not exists (select 1 from public.price_lists where deleted_at is null) then
    raise exception 'Reset stopped: no active rows remain in price_lists';
  end if;

  if not exists (select 1 from public.price_list_versions where deleted_at is null) then
    raise exception 'Reset stopped: no active rows remain in price_list_versions';
  end if;
end;
$$;

commit;

-- Expected result: both counts are zero. Price counts should be unchanged
-- from before the reset.
select 'active_workspace_rows' as check_name, count(*) as row_count
from (
  select id from public.leads where deleted_at is null
  union all select id from public.opportunities where deleted_at is null
  union all select id from public.approvals where deleted_at is null
  union all select id from public.proposals where deleted_at is null
  union all select id from public.spares_lines where deleted_at is null
  union all select id from public.clarifications where deleted_at is null
  union all select id from public.audit where deleted_at is null
) workspace_rows;

select 'active_price_lists' as check_name, count(*) as row_count
from public.price_lists
where deleted_at is null
union all
select 'active_price_list_versions', count(*)
from public.price_list_versions
where deleted_at is null;
