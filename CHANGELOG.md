# Changelog

Important project changes are recorded here in reverse chronological order.
This is an implementation and release log, not a dump of every commit.

## [Unreleased]

- Opportunity saves now send only new, edited, or deleted rows instead of
  rewriting the complete opportunity list, reducing revision conflicts between
  open browsers.
- Kept deleted-lead recovery markers local to the browser so they cannot block
  shared lead and opportunity saves.
- Prevented hydration from marking unchanged browser-cached state as dirty;
  this stops every browser from repeatedly rewriting the consolidated state
  and causing optimistic save conflicts.
- Kept migration markers and derived lead-deadline timers local to the browser
  so they no longer create false shared-workspace save failures; persistence
  errors now include the exact remaining state keys.
- Made cross-browser sync failures visible in the workspace shell, added an
  explicit shared-data refresh action, and retried pending saves when the
  browser reconnects so locally completed commercial decisions do not remain
  silently isolated to one browser.
- Added bounded latest-local-wins retries for consolidated state and
  configuration writes so simultaneous browser sessions no longer leave the
  workspace stuck on revision-conflict errors.
- Hardened production refresh and login recovery: browser storage quota errors
  now retain the last known-good workspace cache, empty Supabase refreshes no
  longer erase populated local business records, and session restoration times
  out safely instead of leaving the login screen loading indefinitely.
- Persisted proposal decisions immediately to Supabase and retained a compact
  browser fallback, preventing commercial terms from reverting after refresh.
- Protected newly created opportunities from disappearing during refresh while
  their normalized Supabase row is still awaiting confirmation; explicit
  deletions and confirmed remote deletions retain their existing behavior.
- Added direct deep-link recovery and explicit sync-error messaging when an
  opportunity is omitted from the initial shared workspace response.
- Added lead-stage KYC document review with professional **Approve**, **Reject**,
  and **Pending Review** outcomes. Rejections require a reason and generate an
  AI-assisted customer email draft for human review before sending; legacy
  `Verified` records remain readable.
- Enforced commercial hand-off in Requirement Validation: every Payment,
  Delivery, or other deviation must be resolved before Sourcing, counter-offers
  wait for customer acceptance, and matched customer terms require AH approval;
  corrected the AH review preview to show ModAE's response.
- Restored separate proposal previews: Preview PDF now shows the customer-facing
  ModAE document, while Draft workbook remains the Excel reference preview.
- Stabilized Supabase workspace saves by serializing overlapping writes and
  retrying optimistic revision conflicts with bounded local latest-save-wins
  rebases. Approved price lists now remain usable from the browser cache when
  the consolidated shared records are temporarily unavailable, with degraded
  sync status shown in the Price Lists workspace.
- Made Admin GST, PAN, and CIN validation rules readable with plain-language
  formats and examples while retaining regex editing under an advanced control.
- Restored missing structured spare lines by merging AI, parser, and attachment
  extraction and reconciling existing Sourcing records.
- Tightened default GSTIN, PAN, and CIN validation to enforce their standard
  segment structures and migrated only the old built-in patterns, preserving
  custom Admin rules.
- Backfilled missing Admin routing, KYC, and AI-threshold configuration when
  loading legacy saved workspace state, preventing empty Admin cards and zeroed
  threshold values.
- Removed the Admin Integrations & AI tab and its SharePoint/AI configuration
  panels while keeping the underlying integration and model-routing code intact.
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
