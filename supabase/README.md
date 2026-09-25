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

The active repository migrations are `007_live_workspace_sync.sql` and
`008_dedicated_workspace_tables.sql`. Migration 008 moves large JSONB entities
out of `records` into dedicated tables and keeps legacy rows as a rollback
copy. Historical setup and
backfill scripts are kept locally under `.local/backups/supabase/` and are not
part of the application deployment path.

For a completely new Supabase project, run [`000_fresh_project.sql`](./000_fresh_project.sql)
first, then run `007_live_workspace_sync.sql` and
`008_dedicated_workspace_tables.sql`. The fresh migration creates the base
tables, `save_rows` RPC, row-level policies, indexes, and realtime publication
entries. Do not use the retired
root-level `supabase-tables.sql` for a new project because it references the
legacy `app_state` migration model.

Verify the active schema with:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('ai_secrets', 'approvals', 'leads', 'opportunities', 'records', 'user_files', 'proposals', 'spares_lines', 'clarifications', 'audit', 'settings', 'price_lists', 'price_list_versions')
order by table_name;
```

When changing database access, update `AGENTS.md` and `CHANGELOG.md` with the
new contract or migration decision. Runtime code and active migrations must not
introduce any table outside the table allowlist above.
