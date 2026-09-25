# Supabase production schema

For project setup and the complete application architecture, start with the
[root README](../README.md) and [agent/developer guide](../AGENTS.md).

The application uses these production tables:

- `ai_secrets`
- `approvals`
- `leads`
- `opportunities`
- `records`
- `user_files`
- `proposals`
- `spares_lines`
- `clarifications`
- `audit`
- `settings`
- `price_lists`
- `price_list_versions`
The active repository migrations are `007_live_workspace_sync.sql`,
`008_dedicated_workspace_tables.sql`, and `009_relational_workspace_data.sql`.
Migration 008 moves large JSONB entities out of `records`; migration 009 adds
typed relational business tables and indexes while keeping legacy rows as a
rollback copy. Historical setup and
backfill scripts are kept locally under `.local/backups/supabase/` and are not
part of the application deployment path.

For a completely new Supabase project, run [`000_fresh_project.sql`](./000_fresh_project.sql)
first, then run `007_live_workspace_sync.sql`, `008_dedicated_workspace_tables.sql`,
and `009_relational_workspace_data.sql`. Migration 009 includes the relational
tables, typed backfill, RLS policies, grants, indexes, and realtime publication
entries. Do not use the retired
root-level `supabase-tables.sql` for a new project because it references the
legacy `app_state` migration model.

Verify the active schema with:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('ai_secrets', 'approvals', 'leads', 'opportunities', 'records', 'user_files', 'proposals', 'spares_lines', 'clarifications', 'audit', 'settings', 'price_lists', 'price_list_versions', 'customers', 'customer_contacts', 'lead_items', 'opportunity_items', 'proposal_items', 'catalogue_versions', 'catalogue_parts', 'communications', 'audit_events', 'workspace_settings')
order by table_name;
```

When changing database access, update `AGENTS.md` and `CHANGELOG.md` with the
new contract or migration decision. Runtime code and active migrations must not
introduce any table outside the table allowlist above.
