# Changelog

## 2026-09-27

- Polished the Follow-up & Closure workbench layout so long opportunity names, workflow labels, revisions, close-out controls, and competitor inputs wrap within responsive cards instead of clipping or overflowing.
- Reduced Supabase traffic by limiting workspace hydration to one initial session load, removing automatic focus/visibility/route pulls, disabling presence polling, and preventing non-changing sourcing reconciliation from triggering autosaves.
- Fixed the Service SOW handoff so carrying the Statement of Work opens Prepare Offer, keeps the travel confirmation gate visible, and recognizes proposal and quotation language during service classification.
- Simplified new Service opportunities to the Standard Rate Sheet workflow, keeping Site Visit optional and removing proposal-specific handoff controls from the Service UI.
- Routed Service Send Offer through the rate-schedule email panel with PDF preview, while keeping discounts approval-gated and preserving closed historical proposal lanes.

Important project changes are recorded here in reverse chronological order.
This is an implementation and release log, not a dump of every commit.

## [Unreleased]

- Fixed built-in proposal workbook loading to bypass stale browser/service-worker
  responses and expose the failing asset URL and HTTP status for deployment
  diagnosis.
- Canonicalized legacy opportunity IDs for display so owner display names such
  as `R. Sundaram` render as the stable `RS` suffix without changing stored
  primary keys or breaking linked records.
- Prevented stale workspace snapshots from recreating rows after a permanent
  purge by invalidating the server workspace cache, tagging browser sessions
  with a purge generation, rejecting pre-purge saves, and reloading rejected
  clients before they can retry old data.
- Made direct Supabase deletes of opportunities, leads, and approvals invalidate
  the server cache automatically through a persistent database generation marker;
  the marker is hidden from application state and stale browser saves are rejected.
- Hardened the Spares Sourcing-to-Proposal handoff with one shared gate for
  empty, invalid, unconfirmed, missing-price, and expired-price lines. Direct
  and embedded Proposal access now returns users to Sourcing, and stale proposal
  repair cannot create a partial BoQ before sourcing is complete.
- Fixed proposal workbook round-trip validation so an unchanged downloaded ModAE
  Terms & Conditions block is compared with the exact rendered baseline instead
  of internal workflow terms, while genuine customer-facing edits remain visible.
- Improved authentication failure recovery so rejected Supabase bearer tokens
  preserve HTTP diagnostics, stop live-event reconnect loops, clear the stale
  browser session, and return the user to sign-in instead of leaving Sourcing
  in a misleading load-error state.
- Simplified the Lead inbox to one unified list by removing the redundant
  Primary, Qualified, and Opportunity mailbox tabs; status filtering remains
  available in the inbox filter bar.
- Made future opportunity IDs unique across devices by reserving monthly
  sequences atomically in Supabase and normalizing owner suffixes to role codes.
- Restored lightweight cross-device workspace updates for leads, opportunities,
  and approvals, including focus/visibility/reconnect recovery and an in-place
  inbox refresh so a lead created on another device appears without a browser
  reload.
- Reordered the sales-owner dashboard into an action-to-outcome flow, moving
  Pipeline snapshot ahead of detailed tables, placing My orders after
  Performance, and making pipeline counts full-width with a compact empty
  orders state.
- Corrected dashboard View all destinations so My opportunities opens the full
  Opportunities tracker and My orders opens Purchase Orders; also fixed long
  opportunity names overlapping adjacent columns in the personal pipeline.
- Combined pricing-exception and final-quote-release approvals into one complete
  joint AH + LJS request, including the affected pricing rows and decision context.
- Restored the last customer-facing Spares proposal into Sourcing when opening
  a revision, including quantities and commercial adjustments, so requested
  changes such as additional discount start from the sent proposal values.
- Standardized all non-health Gemini AI tasks on the stable `gemini-3.6-flash`
  model, including lead extraction and complex document review.
- Corrected proposal workbook review so Delivery and Incoterms are compared as
  separate terms, related line-value changes are grouped by item, ambiguous
  line matches are blocked, and Gemini review failures require an explicit AI
  retry before validation can complete.
- Fixed open Workbench pages showing stale clarification answers by refreshing
  shared Supabase state on entry, focus, and visibility restoration, with a
  retry warning when the shared pull fails.
- Expanded pricing-threshold approvals with the exact requested percentage,
  allowed limit, excess points, affected-line count, and discount impact so
  approvers can understand the commercial reason before deciding.
- Fixed lead extraction for unlabelled facility addresses so a standalone
  station or plant name is separated from its district, state, and country
  location.
- Restored Scope Confirmation as a distinct Service stage between Service
  Request and Standard Rate Schedule. The site-visit requirement is selected
  once there, and any required site survey is completed before pricing.
- Simplified the Service workflow into five industrial stages — Service Request,
  Scope Confirmation, Standard Rate Schedule, Customer Acceptance, and Service
  Execution & Close — while preserving detailed phase data, legacy links, gated
  survey/travel checks, and explicit operational handoffs.
- Standardized Service workflow form controls with wide bordered fields, clean
  numeric entry, clearer discount guidance, and revision routing back to the
  Standard Rate Schedule when customers request changes.
- Reworked the Standard Rate Schedule card into a responsive two-column layout
  with rate details beside the complete editable customer email composer. The
  rate stage no longer duplicates the survey or travel decision controls.
- Removed internal deployment planning and cost build-up cards from the
  Standard Rate Schedule stage. Engineer assignment, actual days, execution
  readiness, and billing inputs remain in Service Execution & Close.
- Reorganized imported runtime binaries under a semantic `assets/` tree,
  replaced supplied filenames with clean internal names while preserving
  customer-facing attachment names, and updated the brand-refresh and icon
  tools to use the new structure.
- Fixed Service workflow phase persistence so advancing or returning between
  service stages updates the opportunity’s current stage as well as its service
  estimate record.
- Archived completed planning and QA documents, generated reference PDFs and
  their one-off generators, the responsive prototype, retired Supabase setup
  SQL, dead desktop tile code, and optional repository agent skills under the
  ignored `.local/` directory. Removed the archived application-map npm command
  and updated active schema documentation to use the fresh-project baseline.
- Added backend-backed approval refresh on the Approvals page every five
  seconds while visible, with an immediate refresh when returning to the tab
  and a non-blocking connection warning when the backend is unavailable.
- Separated proposal follow-up alerts from lifecycle status counts so the LJS proposal card clearly distinguishes status from action.
- Restyled dashboard work-queue summaries as responsive metric tiles for clearer counts and labels.
- Expanded the LJS “Decisions waiting on you” card to the full dashboard width for a cleaner company-level layout.
- Removed the duplicate Owner priority queue from the LJS dashboard while retaining the Priority proposals table and its proposal actions.

- Migrated deployment runtime to SuperBees with explicit `0.0.0.0` binding,
  graceful shutdown, environment-driven CORS, startup environment validation,
  provider timeouts, shared Supabase API clients, and neutral deployment
  identity handling.
- Redesigned My Dashboard performance reporting into a shared role-aware scorecard with annual progress, quarterly target-versus-actual cards, monthly target/actual run rate, and a scoped funnel for personal or company views.
- Replaced the dashboard funnel list with a five-level tapered funnel matching the reviewed visual: Leads assigned, Qualified, Opportunities, Proposal sent, and Won; grouped funnel clicks now filter all underlying workflow stages.
- Refined the funnel to match the supplied reference layout with numbered steps, centered counts, tapered red sections, dotted label connectors, and compact right-side descriptions.
- Switched complex AI review from restricted Gemini 2.5 Flash to the cheaper
  Gemini 3.5 Flash-Lite model and added a clear model-access error.
- Fixed Opportunities Excel export by using a browser-compatible workbook writer,
  keeping exports to one compact filtered sheet without extra rows or columns.
- Standardized generated Excel cleanup across proposal, pipeline, price-list,
  and editable-workbook exports: proposal print areas now stop at real customer
  content, unused template padding is hidden, table exports expose filters, and
  price-list templates use the ModAE document styling.
- Proposal revision review now asks AI to confirm only meaningful workbook
  changes, ignores harmless unit/formatting differences, preserves uploaded
  comparison data across navigation, and blocks an unvalidated uploaded
  revision from customer submission.
- Protected shared opportunity workflows from stale browser snapshots. A
  newer saved milestone now wins over an old tab's retry in both server and
  direct persistence paths; intentional backward corrections still work only
  with a recorded reason tied to the current server milestone. Approval side
  effects now advance only from Approval, lifecycle refresh bursts share one
  full pull, and approval decisions refresh only their affected rows.
- Made proposal approval collaboration safe across browsers: approval request
  IDs are collision-resistant, simultaneous requests converge by approval
  key, and decisions from each required approver merge without overwriting
  one another. Approval cancellations now save immediately and the decision
  workspace keeps the form open with an error if a shared save fails.
- Opportunity IDs now use the Admin city/state ownership rules consistently
  across lead conversion, registration, manual intake, tender intake, and
  simulated leads; longer AI-extracted addresses also resolve their embedded
  Indian city before applying the regional owner rule.
- Loaded proposals and sourcing rows in the initial workspace hydration so
  Spares Sourcing does not render a false empty BOQ while its background data
  is still arriving. Pending pricing approvals now expose an explicit shared
  status refresh and surface decision-save failures.
- Added a localhost-only fallback to the seeded demo accounts when configured
  Supabase Auth rejects demo credentials; deployed environments remain
  Supabase-authenticated and local-demo sessions stay browser-only.
- Added a dedicated Service Rates list to Price Lists with India and
  International tabs showing the complete configured service charge schedule.
- Added an admin-only Users online dashboard card backed by a protected,
  two-minute Supabase presence heartbeat; business records and workflows are
  not affected.
- Reworked My Dashboard into role-specific cockpits: LJS now starts with the
  company-wide owner view, AH with commercial decisions, sales owners with
  daily execution and own-pipeline work, and TECH with technical review work;
  grouped win/loss analysis is shown only on broad internal cockpits.
- Added LJS's single Proposal Status & Follow-up dashboard card with proposal
  readiness, approval, sent, and follow-up counts plus clickable priority rows.
- Fixed the LJS proposal card layout so long opportunity and customer names
  wrap cleanly without colliding with status, value, or action columns.
- Reworked detailed Analytics into an operational table-led workspace with
  grouped win/loss analysis by close reason, supporting closed-opportunity
  rows, competitor context, and a live open-pipeline register.
- Removed the duplicate Service "Operator view" work-area navigation so the
  10-step Service workflow rail is the single workflow navigation surface.
- Fixed Section 5B commercial approvals reappearing after AH approval. The
  dispatch gate now recognizes current and legacy commercial approval records
- Added request IDs and safe server-side Supabase error metadata to workspace
  purge failures so an unapplied or broken purge RPC can be diagnosed without
  exposing service credentials in the browser.

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

Completed implementation and workflow-review documents are retained locally
under `.local/project-history/` in the checkout where they were archived.
