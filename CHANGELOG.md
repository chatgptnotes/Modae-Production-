# Changelog

Important project changes are recorded here in reverse chronological order.
This is an implementation and release log, not a dump of every commit.

## [Unreleased]

- Fixed Section 5B commercial approvals reappearing after AH approval. The
  dispatch gate now recognizes current and legacy commercial approval records
  by their signed customer terms, repairs missing legacy term details, and
  avoids duplicate pending requests.
  `R. Sundaram` during state migration.
  server-authorized Supabase procedure to remove all workspace data and files
  except price lists, price-list versions, and required user profiles; browser
  state is cleared before reload so deleted rows cannot be recreated locally.
- Fixed clear/reset actions leaving active normalized Supabase rows behind when
  the browser had not populated its revision cache yet; reset now discovers and
  soft-deletes remaining active workspace rows through `save_rows`.
- Coalesced overlapping Supabase workspace refreshes so rapid focus, route,
  reconnect, and visibility events reuse one in-flight read instead of queuing
  duplicate full database loads.
- Coalesced pending workspace saves, serialized entity writes, backed off failed
  retries, and ordered `save_rows` IDs to reduce write spikes and deadlocks.
- Normalized reviewed-workbook currency comparisons to the same two-decimal
  rounding used by downloaded proposal workbooks, preserved blank previous
  prices, and made review currency values display with two decimals so an
  unchanged draft does not produce false price changes.
- Reduced reviewed-workbook scan latency by starting local and AI validation
  immediately after import while storage uploads continue in the background;
  customer submission remains gated until the validated workbook is stored,
  with visible upload failure and retry states.
- Fixed blank opportunity ownership during lead conversion and state hydration;
  known locations now use regional routing, while missing or unclassified data
  falls back to LJS, including existing ownerless opportunities.
- Refined the Admin card grid and ownership controls so category labels,
  routing regions, descriptions, and form controls keep readable widths and
  reflow cleanly across desktop, tablet, and mobile layouts.
- Fixed Admin ownership rows so region fields and owner controls stay aligned
  on one line on desktop and stack cleanly only on narrow screens.
- Added an on-demand AI advisory review for Admin ownership rules and
  state-to-region mappings; deterministic routing remains authoritative and AI
  suggestions never change configuration automatically.
- Uploaded proposal workbooks now compare Payment, Delivery, Warranty, Freight,
  and Validity terms against the original proposal. Changed terms are shown as
  red, non-blocking human-review findings with original/uploaded values and
  workbook evidence; saved internal approval terms remain unchanged.
- Consolidated ownership routing to the regional Ownership rules and removed
  the separate opportunity-type owner fallback from Admin and runtime state.
- Restored reviewed-workbook upload validation with staged loading progress from
  file selection through workbook import, local checks, and AI review.
- Rebuilt the Admin T&C clause library as a structured editable data table with
  inline title/text fields, add/remove actions, and responsive overflow.
- Added visible staged AI scan progress to proposal validation and enabled
  semantic AI review for system-generated proposals as well as uploaded workbooks.
- Changed T&C clause editing to full-width aligned rows with title, text, and
  remove controls on one clean editable line.
- Reworked T&C clause entries into responsive editable cards with flexible
  titles, full-width wrapped text areas, and compact danger-styled remove
  actions.
- Simplified the Admin T&C clause library into an always-visible, aligned
  editor grid instead of expandable rows.
- Reworked Admin workflow navigation into a horizontal landscape layout with
  adaptive two- and three-column card alignment on desktop.
- Added nested Admin workflow categories for access and routing, T&C clauses,
  commercial automation, and customer governance, with region search, owner
  and customer-risk badges, and visible save feedback.
- Made the Terms & Conditions clause library compact and single-open: clauses
  now expand into their editor only when selected.
- Reworked the Admin workflow settings presentation with anchored section
  navigation, readable two-column cards, and responsive wrapping for long
  labels, ownership rows, approval controls, and clause editors.
- Added independent Admin switches for final AH + LJS quote-release approval
  and AH approval of special customer commercial terms; both default to on.
- Added scan-progress surfaces for tender and KYC document work, structured
  Supabase file/RPC diagnostics, and an idempotent migration that verifies the
  `user_files` and `save_rows` browser persistence contract.
- Added recovery for rejected or expired Supabase sessions: invalid persisted
  auth is cleared, the app returns to login, and local save retries pause until
  a successful sign-in instead of repeatedly flooding Auth and `save_rows`.
- Hardened workspace rendering against incomplete hydrated state by normalizing
  map-shaped slices and guarding opportunity-scoped lookups. Supabase save
  diagnostics now retain the failed entity and HTTP status, and the active
  `save_rows` migration explicitly grants browser execution.
- Hardened modal, workspace, proposal, price-list, attachment, and inline-editor
  DOM interactions so delayed focus and scrolling skip nodes detached during
  route changes, state updates, or hydration.
- Downgraded expected empty-workspace hydration and refresh-protection messages
  to debug-level logging while retaining the local-state fallback.
- Replaced runtime Supabase Realtime synchronization with pull-based refreshes
  on boot, route changes, focus/visibility restoration, reconnect, and explicit
  refresh. Shared writes now include the authenticated Supabase user ID as
  `updated_by` where available.

- Customer-facing proposal Excel Terms & Conditions now replace only the
  matching clause for a resolved commercial deviation: accepted customer terms
  or accepted counter-offers are carried through, while unrelated ModAE
  standard terms remain unchanged.
- Added the additive relational workspace migration with typed customer,
  opportunity-item, proposal-item, catalogue, communication, audit, and
  settings tables plus indexed backfill paths. Legacy JSONB data remains
  available for rollback during verification.
- Split proposals, sourcing lines, clarifications, audit rows, settings, and
  price-list records into dedicated Supabase JSONB tables with a compatibility
  backfill from `records`. Also fixed startup persistence deleting the active
  browser snapshot before it could be read.
- Clarified the validated-proposal status when Payment or Delivery decisions
  are still unresolved, and added a direct action from the workflow blocker
  dialog to the commercial-decision section.
- Persisted reviewed proposal workbook snapshots with revision-scoped file keys;
  validation no longer increments the quote revision, and current or historical
  revision previews use the exact uploaded workbook that was reviewed. Customer
  submission continues to attach that same validated workbook.
- Added guarded recovery for stale or missing Vite route chunks, including
  service-worker cache cleanup and a one-time reload instead of leaving pages
  on a dynamic-import crash screen.
- Made a successfully validated uploaded proposal workbook the active artifact
  for Workbench previews, submission previews, and customer attachments instead
  of regenerating an older template-based proposal.
- Fixed Requirement Validation commercial-deviation approvals so approved
  Payment and Delivery terms are recognized by the Sourcing hand-off gate,
  including older approvals with snapshot-only deviation details.
- Extended the Supabase Realtime WebSocket subscription from proposal-only
  records to all shared record entities, so configuration, clarifications,
  spare lines, audit history, and price-list changes reach other open browsers
  without waiting for focus refresh; unsupported or ambiguous changes still
  fall back to an authoritative full refresh.
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
