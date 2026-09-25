-- Verify migration 009 relational workspace tables and RLS.

select
  c.relname as table_name,
  c.relrowsecurity as row_security
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
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
  )
order by c.relname;

select 'customers' as table_name, count(*) from public.customers
union all select 'customer_contacts', count(*) from public.customer_contacts
union all select 'lead_items', count(*) from public.lead_items
union all select 'opportunity_items', count(*) from public.opportunity_items
union all select 'proposal_items', count(*) from public.proposal_items
union all select 'catalogue_versions', count(*) from public.catalogue_versions
union all select 'catalogue_parts', count(*) from public.catalogue_parts
union all select 'communications', count(*) from public.communications
union all select 'audit_events', count(*) from public.audit_events
union all select 'workspace_settings', count(*) from public.workspace_settings
order by table_name;
