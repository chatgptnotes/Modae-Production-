# WinTrack ModAE — Agent and Developer Guide

This file is the compact technical context for engineers and coding agents
working in this repository. Read it before changing application behavior,
database access, deployment configuration, or tracked assets.

## Project identity

- Product: WinTrack ModAE sales workspace
- Frontend: React 18, Vite, React Router
- Backend boundary: Express server in `src/server/`, with route handlers in `api/`
- Persistence: Supabase Auth and database sync, with local browser fallback
- Deployment: Railway staging and production environments
- Package manager: npm
- Module format: native ESM (`"type": "module"`)

## Required reading order

1. `README.md` for setup and repository orientation.
2. This file for architecture and change rules.
3. `src/store.jsx` and `src/datastore.js` before changing persistence or state.
4. `supabase/README.md` before changing database access or migrations.
5. `DEPLOYMENT.md` before changing environment variables or release flow.
6. `CHANGELOG.md` before extending an existing cleanup or migration decision.

## Runtime structure

### Application entry and routing

- `src/main.jsx` mounts the React application and browser router.
- `src/App.jsx` defines desktop routes and the main application shell.
- `src/tablet/TabletApp.jsx` defines tablet routes and responsive entry behavior.
- `src/pages/` contains route-level screens.
- `src/workbench/` contains opportunity workflow panels.
- `src/proposal/` contains proposal-specific view helpers and components.
- `assets/` contains tracked runtime brand data, images, customer documents,
  and workbook templates imported by browser code.

### State and persistence

- `src/store.jsx` owns the application state provider, actions, auth lifecycle,
  local persistence, and synchronization triggers.
- `src/datastore.js` reads and writes the Supabase-backed state model.
- `src/supabase.js` creates the optional Supabase client and auth helpers.
- `src/userFiles.js` owns `user_files` metadata and file-row operations.
- `src/filestore.js` selects the active file backend.
- `src/seed.js` defines demo/default state and configuration.

Keep state shapes compatible with the payloads returned from the persistence
layer. If a field changes, update its seed/default value, state action, read
path, write path, and affected tests together.

### Server routes

- `api/ai.js` proxies configured AI requests and keeps the AI key server-side.
- `api/admin-users.js` handles privileged user administration.
- `api/send-proposal-email.js` sends approved proposal email through SMTP.
- `api/locations.js` provides location-related server data.

Never expose server secrets through `VITE_` variables or browser source code.

## Supabase contract

The permitted production tables are:

```text
ai_secrets
approvals
leads
opportunities
records
user_files
proposals
spares_lines
clarifications
audit
settings
price_lists
price_list_versions
user_presence
```

Any new `.from()` query must target one of those allowlisted names. Do not reintroduce
deprecated, demo, temporary, or migration-only table names into runtime code,
tests, API routes, or active migrations.

The `records` table is the general state store:

```text
entity       logical collection name
id           logical row identifier
data         JSONB payload
rev          optimistic revision number
updated_at   server timestamp
updated_by   actor identifier
deleted_at   soft-delete timestamp
```

Use the existing `save_rows` RPC and datastore helpers for bulk state changes.
Reviewed workbook imports use server-only `import_workbook_rows`, which checks
workspace generation and wraps revision-aware saves in one transaction.
Do not bypass revision handling with ad hoc writes unless the change is for one
of the dedicated tables and follows its existing helper pattern.

The active repository migrations are `supabase/007_live_workspace_sync.sql`,
`supabase/008_dedicated_workspace_tables.sql`,
`supabase/009_relational_workspace_data.sql`,
`supabase/010_workspace_contract_verification.sql`, and
`supabase/011_save_rows_lock_order.sql`, and
`supabase/012_permanent_workspace_purge.sql`,
`supabase/015_atomic_opportunity_sequences.sql`, and
`supabase/016_workspace_generation.sql`,
`supabase/017_complete_bnk_catalogue.sql`,
`supabase/018_customer_state_repair.sql`, and
`supabase/019_atomic_workbook_import.sql`, and
`supabase/020_user_account_lifecycle.sql`.
`supabase/014_user_presence.sql` stores the short-lived admin-only online
indicator; browser code must access it only through `api/presence.js`.
Historical migrations and backups are local-only under `.local/backups/`.

## Change rules

- Make the smallest structural change that solves the requested problem.
- Preserve existing user-facing behavior unless the request explicitly changes it.
- Do not move runtime assets into `.local/` if source code imports or serves them.
- Keep imported binary assets under the semantic `assets/` hierarchy; do not
  recreate the retired root-level `branding/` or `modae doc/` directories.
- Put personal documents, prototypes, scraped material, generated outputs,
  backups, and retired migrations under `.local/`.
- Keep `.local/` ignored and never stage it.
- Remove dead imports, handlers, tests, and utilities only after searching all
  references with `rg`.
- Update tests and documentation when changing a public workflow or data shape.
- Avoid unrelated formatting or broad rewrites.

## Validation

Run the smallest relevant checks first, then the complete build checks:

```bash
npm test
npm run build
git diff --check
```

For persistence changes, verify that all active Supabase table references are
inside the table allowlist and run the Supabase persistence tests. For
proposal or branding changes, run the relevant proposal and brand identity
tests. Before release, walk `tests/MANUAL_SMOKE_CHECKLIST.md` at both mobile and
desktop viewport sizes.

Build warnings about large chunks are currently non-blocking if the build exits
successfully. A failed build, broken import, unexpected table reference, or
staged `.local/` file is blocking.

## Release safety

- Staging deploys from `staging`; production deploys from `main`.
- Staging and production must use different Supabase projects.
- Never commit `.env`, service-role keys, AI keys, SMTP passwords, or customer
  documents.
- Do not change the `wintrack-modae-v4` local-storage key casually; changing it
  reseeds browser state and can discard locally entered data.
- Keep approval and proposal behavior approval-gated when modifying transitions.

## Documentation and change log

Update `CHANGELOG.md` for meaningful architecture, schema, workflow, deployment,
or cleanup changes. Update `README.md` when setup, structure, or user-facing
capabilities change. Update this file when an agent-facing rule, data contract,
directory convention, or validation requirement changes.

## Current known boundaries

- Confirmed order bookings live in immutable `opportunity.booking` snapshots;
  legacy `sales.orders` are a compatibility input. Use `bookingRegister` for
  order totals, deduplicate globally before applying owner scope, and preserve
  confirmed snapshots during stale opportunity rebases. Never infer a booking
  from Closed/Won, expected dates, record creation or last-edit dates.
- Historical booking review is limited to imported Closed/Won records; newly
  won records require verified PO details and joint LJS/AH acceptance. Changing
  PO booking details resets both signatures. Target confirmation records the FY
  and actor; untouched demo targets must not produce a business performance gap.

- Some AI and automation entries intentionally remain deterministic previews.
- Shared database synchronization remains HTTP pull-based. With server-only
  `WORKSPACE_SYNC_ENABLED=true`, visible screens also perform bounded revision
  checks (15-second jitter, elected browser tab); hidden/offline tabs stop.
  Browser BroadcastChannel carries identifiers/revisions only. Do not add
  Supabase Realtime or WebSocket subscriptions for workspace synchronization.
- Background checks must never flush drafts. Draft baselines remain pinned until
  successful save or explicit conflict review; paused records cannot enter generic
  snapshot saves. Generation changes pause saving until reload. Advisory editing
  presence lives only in the single Railway process and expires after 45 seconds.
- Supabase is authoritative for shared state, including empty/deleted slices.
  Never write a browser snapshot back to Supabase merely because it exists in
  localStorage; only edits made after an authoritative pull may be saved.
- Direct deletes from opportunities, leads, or approvals increment the
  database-backed workspace generation so stale browser/server snapshots cannot
  recreate deleted rows.
- Every Railway deployment invalidates active browser sessions. The client must
  clear app-owned local/session storage, Cache Storage, service-worker state,
  and local IndexedDB file data, sign out locally, and reload to login. Do not
  use the remote file-deletion reset path for deployment cleanup.
- Proposal PDF generation currently uses the browser print flow.
- Server-side email sending is available through the Railway route and remains
  approval-gated in the UI.
- A full production workflow still depends on correctly configured Supabase,
  Railway, SharePoint, and SMTP credentials.

- The shared users roster is server-owned. Use service-only `save_user_roster`
  with roster revision and audit; never save users through browser bulk state.
  Deletion retains attribution tombstones; pending deletion/update blocks access.
  Preserve these lifecycle fields during state migration and never seed credentials
  into shared profiles. Migration 020 enforces active-account workspace access.

## Configurable access contract

- Atomic approval commands use `approval_decision_context` and `decide_approval`
  from `supabase/migrations/20261013080111_atomic_approval_commands.sql` (after 023).
  Both are service-only. Browser decisions use the `approval_decision` operation
  at `/api/workspace/data`; never merge decision evidence through generic saves.
- `records.entity = 'approval_scope'` contains internal dependency revisions.
  Scope triggers protect predicate reads and absent rows; preserve them when
  adding dependencies to `api/_approval-planner.js`. Approval receipts use the
  reserved `APPROVAL-COMMAND:` audit namespace and are never browser-writable.
- Submitted decision inputs are immutable. Cancel a pending request and create
  a new one when inputs change; never carry signatures to the replacement.
- Run `node scripts/test-approval-postgres.mjs` against a local PostgreSQL server
  for approval transaction changes, in addition to the normal tests/build.

- Migrations `021_configurable_opportunity_numbers.sql`,
  `022_configurable_access_policy.sql`, `023_preserve_number_reservations.sql`
  add complete-ID reservation, server-owned access policy and purge preservation.
- Business JSON reads/writes go through authenticated workspace APIs; never
  restore direct browser table/RPC access to bypass permission failures.
- `src/accessPolicy.js` resolves explicit application roles before legacy owner
  IDs. `src/workspaceAccess.js` governs projection and mutation authorization.
- Access policy and numbering edits use the dedicated revision-checked Admin
  endpoint. Generic configuration saves cannot alter those fields.
- Preserve opportunity counters and reservation history through all resets.
  Connected ID creation must never fall back to a local counter.

## Personal appearance preferences

- `GET`/`PUT /api/user-preferences` reads/writes only the authenticated account's
  `records` row (`entity = user_preferences`, `id = auth user UUID`). Use `save_rows`
  revisions; never include preferences in generic workspace snapshots or roster saves.
- Interface font choices are account-specific. Company documents keep Candara;
  the interface preference must not affect uploaded document content or print fonts.
- Candara WOFF2 faces are bundled under `public/fonts/candara/` for regular, bold,
  italic and bold italic. Preserve both hosted family aliases and verify actual
  browser faces when changing font loading. The supplied version lacks `₹`;
  missing glyphs use fallback fonts.

## Event-driven workspace mode

With `WORKSPACE_SYNC_ENABLED=true`, never add idle polling or typing-triggered
network saves. Auth renewal is the explicit exception. Use scoped explicit saves,
coalesced activation checks, and local committed snapshots. Keep HTTP 409 partial
results intact. Existing form-local inputs require owner acknowledgement before
merging or leaving. Ephemeral presence stays in Railway memory; do not resume
browser heartbeat writes to `user_presence`. Multiple replicas need shared limits.
