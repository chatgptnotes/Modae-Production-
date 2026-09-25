-- Verify the complete workspace schema from migrations 000, 007, 008 and 009.

select
  c.relname as table_name,
  c.relrowsecurity as row_security
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'ai_secrets',
    'approvals',
    'leads',
    'opportunities',
    'records',
    'user_files',
    'proposals',
    'spares_lines',
    'clarifications',
    'audit',
    'settings',
    'price_lists',
    'price_list_versions',
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

with expected(table_name) as (
  values
    ('ai_secrets'), ('approvals'), ('leads'), ('opportunities'), ('records'),
    ('user_files'), ('proposals'), ('spares_lines'), ('clarifications'),
    ('audit'), ('settings'), ('price_lists'), ('price_list_versions'),
    ('customers'), ('customer_contacts'), ('lead_items'), ('opportunity_items'),
    ('proposal_items'), ('catalogue_versions'), ('catalogue_parts'),
    ('communications'), ('audit_events'), ('workspace_settings')
)
select
  e.table_name,
  (c.oid is not null) as exists,
  coalesce(c.relrowsecurity, false) as row_security,
  coalesce(s.n_live_tup, 0)::bigint as estimated_rows
from expected e
left join pg_class c
  on c.relname = e.table_name
 and c.relnamespace = 'public'::regnamespace
 and c.relkind = 'r'
left join pg_stat_user_tables s on s.relid = c.oid
order by e.table_name;
