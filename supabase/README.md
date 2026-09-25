# Supabase production schema

For project setup and the complete application architecture, start with the
[root README](../README.md) and [agent/developer guide](../AGENTS.md).

The application is locked to these six production tables:

- `ai_secrets`
- `approvals`
- `leads`
- `opportunities`
- `records`
- `user_files`

The active repository migration is `007_live_workspace_sync.sql`, which only
configures realtime for the approved business tables. Historical setup and
backfill scripts are kept locally under `.local/backups/supabase/` and are not
part of the application deployment path.

For a completely new Supabase project, run [`000_fresh_project.sql`](./000_fresh_project.sql)
first. It creates the six approved tables, the `save_rows` RPC, row-level
policies, indexes, and realtime publication entries. Do not use the retired
root-level `supabase-tables.sql` for a new project because it references the
legacy `app_state` migration model.

Verify the active schema with:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('ai_secrets', 'approvals', 'leads', 'opportunities', 'records', 'user_files')
order by table_name;
```

When changing database access, update `AGENTS.md` and `CHANGELOG.md` with the
new contract or migration decision. Runtime code and active migrations must not
introduce any table outside the six-table allowlist above.
