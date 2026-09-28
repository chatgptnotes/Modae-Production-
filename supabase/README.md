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
- `user_presence`
The active repository migrations are `007_live_workspace_sync.sql`,
`008_dedicated_workspace_tables.sql`, `009_relational_workspace_data.sql`,
`010_workspace_contract_verification.sql`, and
`011_save_rows_lock_order.sql`, and `012_permanent_workspace_purge.sql`.
`013_railway_free_tier_security.sql` is a historical Free-plan security
migration: it removes anonymous business-data access and adds small active-row
indexes for the shared server workspace cache.
`014_user_presence.sql` adds the isolated, service-role-only heartbeat table
used by the administrator Users online dashboard card.
Migration 008 moves large JSONB entities out of `records`; migration 009 adds
typed relational business tables and indexes while keeping legacy rows as a
rollback copy. Historical setup and
backfill scripts are kept locally under `.local/backups/supabase/` and are not
part of the application deployment path.

Run `010_workspace_contract_verification.sql` and then
`011_save_rows_lock_order.sql` after the active migrations on existing
projects. Migration 010 verifies the two browser-critical objects
(`user_files` and `save_rows`) and reapplies their authenticated access
contract. Migration 011 keeps the `save_rows` contract unchanged while making
concurrent row locking deterministic.

Migration 012 adds the service-role-only permanent workspace purge procedure.
It deletes all workspace data except price lists, price-list versions, and the
user-profile state needed for authorized users to sign in. The browser invokes
it only through `api/purge-workspace.js` after session and role verification.

The browser loads the workspace on boot and on explicit refresh. It does not
reload the complete workspace for route changes, focus, visibility restoration,
or reconnect. The server sends lightweight live events for approvals, leads, and
opportunities; receiving browsers selectively read only those changed tables
with their own Supabase bearer token. This is not Supabase Realtime.

For a completely new Supabase project, run [`000_fresh_project.sql`](./000_fresh_project.sql)
first, then run every migration from `007_live_workspace_sync.sql` through
`014_user_presence.sql` in numeric order. Migration 009 includes
the relational tables, typed backfill, RLS policies, grants, indexes, and
realtime publication entries. The retired `supabase-tables.sql` is archived
locally under `.local/backups/supabase/`; do not use it for a new project
because it references the legacy `app_state` migration model.

Verify the active schema with:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('ai_secrets', 'approvals', 'leads', 'opportunities', 'records', 'user_files', 'proposals', 'spares_lines', 'clarifications', 'audit', 'settings', 'price_lists', 'price_list_versions', 'user_presence', 'customers', 'customer_contacts', 'lead_items', 'opportunity_items', 'proposal_items', 'catalogue_versions', 'catalogue_parts', 'communications', 'audit_events', 'workspace_settings')
order by table_name;
```

When changing database access, update `AGENTS.md` and `CHANGELOG.md` with the
new contract or migration decision. Runtime code and active migrations must not
introduce any table outside the table allowlist above.
