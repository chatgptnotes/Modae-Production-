# WinTrack ModAE — Agent and Developer Guide

This file is the compact technical context for engineers and coding agents
working in this repository. Read it before changing application behavior,
database access, deployment configuration, or tracked assets.

## Project identity

- Product: WinTrack ModAE sales workspace
- Frontend: React 18, Vite, React Router
- Backend boundary: Vercel serverless functions in `api/`
- Persistence: Supabase Auth and database sync, with local browser fallback
- Deployment: Vercel staging and production projects
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
Do not bypass revision handling with ad hoc writes unless the change is for one
of the dedicated tables and follows its existing helper pattern.

The active repository migrations are `supabase/007_live_workspace_sync.sql`,
`supabase/008_dedicated_workspace_tables.sql`,
`supabase/009_relational_workspace_data.sql`,
`supabase/010_workspace_contract_verification.sql`, and
`supabase/011_save_rows_lock_order.sql`, and
`supabase/012_permanent_workspace_purge.sql`.
Historical migrations and backups are local-only under `.local/backups/`.

## Change rules

- Make the smallest structural change that solves the requested problem.
- Preserve existing user-facing behavior unless the request explicitly changes it.
- Do not move runtime assets into `.local/` if source code imports or serves them.
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

- Some AI and automation entries intentionally remain deterministic previews.
- Shared database synchronization is pull-based only: boot, route changes,
  focus/visibility restoration, reconnect, and explicit refresh. Do not add
  Supabase Realtime or WebSocket subscriptions for workspace synchronization.
- Proposal PDF generation currently uses the browser print flow.
- Server-side email sending is available through the Vercel route and remains
  approval-gated in the UI.
- A full production workflow still depends on correctly configured Supabase,
  Vercel, SharePoint, and SMTP credentials.
