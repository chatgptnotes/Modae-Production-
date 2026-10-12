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
`011_save_rows_lock_order.sql`, `012_permanent_workspace_purge.sql`,
`015_atomic_opportunity_sequences.sql`, `016_workspace_generation.sql`, and
`017_complete_bnk_catalogue.sql`, `018_customer_state_repair.sql`, and
`019_atomic_workbook_import.sql`.
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
Migration 016 adds a persistent workspace generation marker and delete triggers;
direct SQL deletes from leads, opportunities, or approvals automatically
invalidate stale browser/server workspace snapshots.
Migration 017 adds the curated B&K parts missing from older approved uploads;
it is additive and preserves all existing price-list rows and prices.

The browser pulls shared data on boot, relevant page entry, focus/visibility
restoration, reconnect, and explicit refresh. Idle pages do not poll or open an
automatic event stream. Independent datastore reads are batched (up to 20) so
they share one fresh authorization and workspace permission snapshot. Every
query retains its permission projection; writes remain separate and revision-aware.

For a completely new Supabase project, run [`000_fresh_project.sql`](./000_fresh_project.sql)
first, then run every migration from `007_live_workspace_sync.sql` through
`019_atomic_workbook_import.sql` and `020_user_account_lifecycle.sql` in numeric order. Migration 009 includes
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

Migration 019 adds the server-only `import_workbook_rows` RPC. Reviewed imports
lock affected tables, verify the workspace generation, and call `save_rows` for
opportunities, customer state, settings and audit in one transaction. Concurrent
edits or deletions abort the entire import. Apply this migration before using
database-backed Excel imports; browser-only imports remain local.

Migration 020 adds service-only `save_user_roster`, which atomically checks the
roster revision and saves its audit event. Browser clients cannot write the
users roster. Restrictive policies require an active roster profile for workspace
access and deny anonymous access even where older permissive policies exist.
Apply this migration before releasing account lifecycle changes; verify the roster
contains an active administrator matching their Auth ID (or legacy email) first.
Deletion retains a minimal profile for attribution and never deletes business
records. Failed Auth removal remains marked deletion-pending with access blocked;
refresh Users and retry Delete. Direct database-owner maintenance is permitted.

## Configurable access and numbering (021–023)

Apply `021_configurable_opportunity_numbers.sql`,
`022_configurable_access_policy.sql` and
`023_preserve_number_reservations.sql` after 020, with the matching application
release. These migrations do not import or delete current business records.

021 adds a service-only complete-ID reservation RPC, with persistent settings
counters/reservations, IST periods and collision checks. 022 adds the
transactional `save_access_policy` RPC and closes direct browser business JSON
reads/writes, including security-definer save bypasses. The authenticated server
data gateway now owns projection and permission enforcement. File metadata keeps
its owner isolation plus configurable page/action checks. 023 replaces the purge
procedure with an allowlisted implementation that preserves all issued IDs,
counters, users and price catalogues.

Coordinate SQL and application deployment: old clients cannot use the new direct
access restrictions. Confirm an active Admin profile before release. Verify a
Standard account cannot access blocked pages/data or write denied actions; verify
Management and Admin defaults, concurrent ID creation, policy revision conflicts
and proposal release checks. SQL rollback alone is insufficient after deploying
the new client; roll back the application and database contract together.
