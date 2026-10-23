# Supabase production schema

## Admin permissions, backups and AI integrations

After the Stage 1 migration, apply in order:

1. `migrations/20261017061731_individual_account_permissions.sql`
2. `migrations/20261017061909_full_workspace_backups.sql`
3. `migrations/20261017110000_ai_integrations.sql`

Individual permissions extend the revision-checked access policy with stable
roster IDs. `workspace_backup_snapshot` and `restore_workspace_backup` are
service-only: restore compares the reviewed snapshot under transaction locks,
retains current account lifecycle and audit rows, preserves maximum opportunity
counters/reservations, writes file bytes atomically and advances generation.
`save_ai_integrations` commits encrypted credentials, settings and audit together.
AI and backup receipt namespaces reject ordinary forged audit inserts.
No production table names are added. Keys stay outside exported workbooks and
backups. See [deployment setup](../DEPLOYMENT.md) for server encryption and signing
keys. Run disposable local PostgreSQL transaction checks before release; never
point fixture scripts at a shared Supabase project.

## Lead intake and atomic conversion

After the atomic approval migration below, apply
`migrations/20261016122935_stage_one_non_sales_access.sql` before deploying Stage 1.
It denies direct workspace access to Non-sales accounts (including mixed legacy
roles), which submit through `/api/lead-intake`. The service-only
`convert_lead_to_opportunity` RPC commits the opportunity, converted lead and audit
receipt together, checks revisions and workspace generation, and returns the
existing conversion on retries. Ordinary opportunity saves cannot create a new
lead link or change an existing one. No new tables are introduced.

Run the disposable PostgreSQL regression with:

```bash
STAGE_ONE_TEST_ADMIN_URL=postgresql://postgres@localhost:55441/postgres \
PSQL_BIN=/Applications/Postgres.app/Contents/Versions/17/bin/psql \
node scripts/test-stage-one-postgres.mjs
```

The runner creates and removes a uniquely named local test database. It verifies
concurrent conversion retries, revision/generation conflicts, receipt protection,
ordinary subsequent edits and full rollback. Never point the fixture installer
at a shared project.

## Atomic approval commands

After migration 023, apply
`migrations/20261013080111_atomic_approval_commands.sql` before deploying the
matching application. This repository's earlier migrations are manually ordered
root-level SQL files; do not use `db push` as a substitute for that existing
history. The new CLI-generated migration remains in `migrations/`.

The service-only context RPC reads a consistent dependency snapshot. The commit
RPC locks scope markers, checks revisions/generation, derives the decision and
saves all effects plus a receipt in one transaction. Internal scope rows live in
`records`, and receipts live in `audit`; no new application tables are introduced.
Ordinary database writes update scope revisions through triggers. Do not disable
these triggers for imports or add a gate dependency without extending context
selection and scope coverage. Historical decisions remain readable; new decisions
must use the command API. Direct decision imports must be separately reviewed.

For integration tests, start an isolated local PostgreSQL server, then run:

```bash
APPROVAL_TEST_ADMIN_URL=postgresql://postgres@localhost:55439/postgres \
PSQL_BIN=/Applications/Postgres.app/Contents/Versions/17/bin/psql \
node scripts/test-approval-postgres.mjs
```

The runner creates a uniquely named synthetic database, exercises concurrent
sessions and rollbacks, then drops that test database. It rejects nonlocal hosts.
`PSQL_BIN` defaults to `psql`. Ordinary `npm test` skips the database integration
cases unless the runner supplies their isolated database URL.

Before release, verify Accept/Reject from desktop and mobile sessions, an all-of
approval, a lost-response retry, cancelled requests, and proposal/customer effects.
Keep one Railway replica: command admission is process-wide (16 in flight,
30 attempts per bearer token per minute); scale-out requires a shared limiter and
coordinated cache invalidation. Configure database/API statement timeouts before
execution; the command sets a 1-second lock timeout and the browser waits 12 seconds.

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
retained for migration compatibility; runtime activity indicators now use Railway memory.
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

## Personal appearance preferences

`/api/user-preferences` uses `records.entity = user_preferences`, with the
Supabase Auth UUID as row ID and `{font, sidebarCompact, leadDetailsCollapsed}` as data.
Missing sidebar fields default to `false` (expanded). PUT accepts a revision and
one or more of these preferences, preserving omitted fields so font changes and
sidebar choices cannot erase each other. Reads and writes are server-only
and tied to an active authenticated profile, with `save_rows` revision checks.
The existing records schema and migration 022 access boundary are reused; no new
migration is required. These rows are excluded from shared state projections.

## Active-screen version checks

The optional Railway `WORKSPACE_SYNC_ENABLED` flag adds bounded authenticated
metadata reads for visible screens. It does not enable Realtime, add application
tables, or persist typing heartbeats. Row commits still use existing revision-aware
RPCs. Checks run on activation, never an idle timer. See `DEPLOYMENT.md` for explicit-save limits and staging verification.

## Microsoft mailbox link metadata

Apply `migrations/20261022140000_microsoft_mail_links.sql` before enabling the
Microsoft mailbox UI. It adds no table: links use `records.entity = 'mail_links'`
and `save_rows`, but browser SQL access to those rows is denied. The service
role reads and writes links only after the API applies WinTrack permissions.
