# Changelog

Important project changes are recorded here in reverse chronological order.
This is an implementation and release log, not a dump of every commit.

## [Unreleased]

- Continue recording meaningful schema, workflow, deployment, and architectural
  changes before they are pushed.
- Protected the Gemini proxy with Supabase Auth, added request-size and rate
  limits, deduplicated concurrent browser requests, and removed the example
  Gemini credential from `.env.example`.
- Routed routine AI work to `gemini-3.1-flash-lite` and reserved
  `gemini-2.5-flash` for complex document reasoning tasks.

## [2026-09-24]

### Changed

- Rebuilt the B&K and Metrix catalogue modules from the supplied workbooks;
  sourcing now tolerates harmless part-number formatting differences, keeps
  AI alternatives unconfirmed until a human accepts them, and consolidates
  duplicate customer-reference rows.
- Locked runtime Supabase access to the six production tables:
  `ai_secrets`, `approvals`, `leads`, `opportunities`, `records`, and `user_files`.
- Updated admin user loading to use the `records` state row instead of the old
  application-state table.
- Added automated checks for the six-table Supabase allowlist.
- Moved prototypes, personal/reference documents, generated files, scraped
  branding material, backups, and retired migrations into the ignored `.local/`
  archive.
- Kept only runtime branding assets and imported proposal references in tracked
  application directories.
- Removed unused Home and proposal part-picker components and their obsolete
  test coverage.
- Updated Supabase schema notes, workflow references, and asset-fetch behavior.

### Validation

- `npm run build` passed.
- Targeted brand identity and proposal pipeline tests passed.
- `git diff --check` passed.

### Commit

- `75c5519 chore(cleanup): remove unused files and enforce production assets`

## Earlier milestones

- Consolidated Supabase synchronization around the live workspace row model.
- Added offline/local browser fallback when Supabase is not configured.
- Added proposal routes for project, spares, and services workflows.
- Added technical, commercial, and release approval gates with revision-aware
  approval records.
- Added staging and production deployment guidance using separate Vercel and
  Supabase projects.

For detailed feature status and workflow decisions, see
[IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) and
[WORKFLOW_CONFORMANCE.md](./WORKFLOW_CONFORMANCE.md).
