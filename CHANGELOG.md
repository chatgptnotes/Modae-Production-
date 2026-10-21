## 2026-10-21 — More response space for lead extraction

- Increase the AI response limit for lead extraction from 4,096 to 16,384 tokens
  so detailed enquiry fields and spares tables have more room to finish. Other
  AI task limits are unchanged.

## 2026-10-20 — Accurate enquiry email details and spares

## 2026-10-21 — Correct spares RFQ extraction and submission progress

- Separate adjacent RFQ/date labels, recognize explicit Scope summaries, and reject
  placeholder phone values even when AI returns them without the annotation.
- Keep delivery-only EUC suggestions pending confirmation with accurate evidence.
- Recognize No. table headings and KIT units so all eight sample spares survive
  provider failure without duplicate quantities.
- Reuse immutable attachment encodings, show preparation/extraction/save stages,
  keep submission locked through persistence, and retain the lead ID on retries.
  Record bounded browser stage timings without logging enquiry contents.


- Prevent attachment filenames from being interpreted as company labels. Recover
  customer email headers, external contact/signature details and dated RFQ references
  without substituting internal forwarding signatures for customer identities.
- Parse equipment-tagged spares schedules with wrapped PDF rows. Preserve optional
  `equipmentRef`, part numbers, units and quantities through opportunity/proposal
  handoff, without inventing missing quantities or duplicating repeated table rows.
- Show the Spares table on desktop and phone, remove fabricated fallback rows,
  and summarise all requested spares families in Opportunity Scope.
- Preserve extracted facts when intake fields are blank. Re-run refreshes untouched
  form suggestions, preserves unsaved values/baselines and reviewed decisions on
  automatic scans, and reports structured scan failure reasons. Explicit saved
  RFQ dates/numbers now persist with the other reviewed lead decisions.

## 2026-10-20 — Collapsible lead information and visible assignment

- Move Assigned owner into Customer and contact. Group the remaining opportunity
  classification and RFQ inputs under Additional information, collapsed by default
  and expandable on desktop and phone, without discarding entered values.
- Size the scope box to its content between 80 and 160 pixels so short scopes do
  not need an internal scrollbar and longer scopes stay bounded and scrollable.

## 2026-10-20 — Optional Lead Decisions and compact opportunity scope

- Allow incomplete Lead Decisions to be saved and qualified leads to proceed to
  Opportunity Creation without required-field or AI-review gates. Keep permission,
  ownership authorization and successful-save checks; Opportunity Creation retains
  its existing validation.
- Remove required markers and blocking notices from Lead Decisions while retaining
  optional AI review guidance on desktop and phone.
- Reduce Opportunity Scope to three rows with vertical resizing and contained
  scrolling; keep its status icon beside the first line.

## 2026-10-20 — Page loading and three minute navigation cache

- Load the six main sales views through a shared dependency registry before
  database reads; keep header/navigation mounted on desktop and phone.
- Add a session-memory, 20-view LRU cache with three minute freshness, coalesced
  activation reads and stale display fallback. Manual refresh bypasses caches;
  hidden/idle pages do not poll. Account/access changes clear older projections.
- Load full records before lead preview/editing, opportunity editing and booking
  review; load catalogue data only for pricing screens and wait before mounting
  their editors. Preserve global immutable booking context during scoped edits.
- Keep summaries outside persistence baselines, update cached display rows after
  confirmed saves, and reconcile dirty records independently of unrelated updates
  with event-driven sync either enabled or disabled.
- Add cache, scoped query, coverage, permission and draft-baseline regressions.
  Expose server database timing/query count without business payload logging.

## 2026-10-20 — Preserve lead details from enquiry attachments

- Prefill contact email and customer address from attachment facts during lead
  review, even when the AI response omits a normalized field.
- Read flattened procurement schedule rows as line items so table headings and
  RFQ identifiers do not leak into the opportunity scope.
- Rebuild visual attachment payloads on re-scan and report files omitted by the
  provider's eight-file limit.

## 2026-10-20 — Preview business documents in the attachment popup

- Convert Word, PowerPoint, OpenDocument text/presentation and RTF files to
  temporary PDFs for the existing popup viewer. Keep the original file for
  downloads and remove conversion files after each request.
- Retain native previews for PDFs, images, spreadsheets and readable text, with
  a 10 MB conversion limit and clear download fallback when preview is unavailable.
- Authenticate conversions with the application session; allow local demo
  sessions only from loopback during non-production development.

## 2026-10-20 — Remember sidebar layout per account

- Left navigation and Lead inbox's Lead details panel now remember independent
  collapse choices per account. Connected preferences follow the account across
  devices; local sessions retain choices per user in the browser.
- Collapsed navigation keeps icons; collapsed Lead details keeps an accessible
  reopen control and gives the remaining width to the lead list. Preference
  saves preserve font choices, check revisions, and report retryable failures.
- Reuses the existing user preferences records and API; no migration required.
- Left navigation uses the selected clickable-logo design. The official logo
  toggles the sidebar, with a subtle dotted underline, descriptive tooltip,
  keyboard access and smooth content movement. The vertical MENU tab is removed;
  account preferences and reduced-motion support remain in both themes.

## 2026-10-19 — Compact dashboard amounts

- Show My and Dashboard amounts in crore units with two decimal places across
  desktop, phone, funnels, and drilldowns.
- Keep full INR values in the Opportunities table and add Indian comma grouping
  to the read-only value display.

## 2026-10-17 — Ignore missing subjects in duplicate detection

- Prevent unrelated leads with “(no subject)” from producing duplicate warnings,
  including leads from the same sender. Preserve real subject and buyer-reference
  matches; existing leads benefit without modifying their saved data.

## 2026-10-17 — Editable lead and opportunity forecast details

- Add editable lead source, contact email and remarks, carrying saved decisions
  into registration while retaining the original enquiry.
- Add optional win probability (0–100%, including decimals) and expected order
  date to opportunity creation and editing. Retain High/Medium/Low independently;
  exact percentages drive weighted forecasts when supplied, with band fallback.
- Preserve percentages through shared state, Tracker and workbook import/export.
  Expected dates derive fiscal quarters without creating confirmed bookings.
- Let converted lead details and original emails scroll fully on desktop and phone.

## 2026-10-17 — Focused two-card lead review

- Remove the workflow progress strip and repeated RFQ heading from active lead
  review. Show decisions beside the review rail, stacked on phones.
- Extract a concise equipment/work scope and repair recognized old automatic
  scope copies in the review draft while preserving custom scope edits.
- Keep optional KYC document rows and uploads visible for every classification.
  Missing documents do not block qualification or registration, and empty rows
  never claim verification. Remove the lead-stage Red joint-approval requirement;
  opportunity commercial and proposal approval rules remain in force.
- Keep Customer/EUC dropdowns within the viewport, close inactive lists, wrap
  long names, support keyboard selection and preserve unmatched typed names.

## 2026-10-17 — Restore detailed lead review

- Restore the existing detailed lead review on desktop and phone, including
  extracted-field evidence, decision panels and converted-lead summaries.
  Keep the expanded New Lead form and current workflow rules; route opportunity
  creation through the existing revision-aware registration flow.

## 2026-10-17 — Compact Admin integrations

- Replace provider tiles with one dropdown showing connection status. Group API
  key and model controls into a compact layout that stacks on phones. Keep
  credential storage, provider switching and connection actions unchanged.

## 2026-10-17 — Repair local Admin login setup

- Repair legacy local Admin setup that reused an inactive/deleted account and
  blocked login. Apply recovery once with a versioned receipt; retain other users,
  business records, active-account passwords and subsequent lifecycle changes.
- Connected account lifecycle and credentials are unchanged.

## 2026-10-17 — Admin permissions, integrations and complete backups

- Add account-specific Inherit/Allow/Deny controls with revision checks and audit.
  Keep administrator and submit-only boundaries. Resolve exact authenticated
  identities before email fallbacks and reject ambiguous roster matches.
- Add encrypted server-managed AI connections, provider model catalogues, text and
  document selection, capability probes and explicit connection disable controls.
- Add ZIP backups with readable Excel, exact restoration data and uploaded bytes.
  Exclude credentials; sign shared archives and restore only into an empty workspace.
  Preserve current accounts, audit evidence and opportunity numbering reservations.
- Restore connected records and bytes in one revision-checked SQL transaction.
  Journal browser restorations and recover before hydration after interruption.
  Persist original local document bytes and complete local business snapshots.
- Add service-only permissions, backup and AI integration migrations, which must be
  applied explicitly before enabling connected features. No shared database changes
  or deployment are performed by this implementation.

## 2026-10-16 — Load workspace data when opened

- Fetch account identity separately from business data. Dashboard reads compact
  opportunity summaries and server-calculated blocker/action signals; register
  and opportunity detail views load when opened, including row editing/drawers.
- Coalesce repeated view requests and reuse a session-local 15-second cache.
  Refresh bypasses caching; writes invalidate it. No idle polling is added.
- Carry actual row revisions with permission-projected view responses. Keep
  summaries out of writable state, merge partial detail collections by opportunity,
  retain draft baselines, and use revision-aware saves for partially loaded data.
- Defer price lists until a workflow page needs them and remove the duplicate
  whole-workspace refresh on opportunity entry. No database migration is required.

## 2026-10-16 — Lead intake and opportunity registration

- Add submit-only Non-sales access with an authenticated intake endpoint and
  restricted workspace projection; keep customer details optional and preserve
  submitter attribution. Selected salesperson takes priority over routing rules.
- Widen New Lead on desktop, simplify Lead Decisions, and carry qualified lead
  details and attachments into explicit opportunity registration.
- Persist connected conversion atomically with revision/generation checks and
  retry deduplication. Add the service-only conversion migration; it has not been
  applied to staging or production as part of these local changes.
- Use manual Red/Yellow/Green classification, with Unclassified for new records.
  Preserve legacy Blue/Amber provenance and unrelated commercial controls.
  KYC is visible and optional; verified status still requires evidence.
- Display and edit actual INR in dashboard/register/targets without changing
  internal K-unit storage; remove classification colours from opportunity IDs
  and exclude FX placeholder choices.

## 2026-10-14 — Phone header controls

## 2026-10-14 — Bundled Candara family

- Bundle regular, bold, italic and bold italic WOFF2 faces from the supplied
  Candara family. Hosted faces cover personal font selection, legacy brand tokens,
  signed-out screens and company print documents without a local installation.
- Preserve account font choices and the four-face print loading gate. Missing
  glyphs, including `₹` in this version, continue to use fallback fonts.


- Keep the My/Global indicator inside the phone toggle and align account menu
  actions to the left. Anchor the menu below the avatar, constrain it to the
  phone workspace and viewport, and scroll long menus on short screens.

## 2026-10-14 — Compact phone dashboard opportunities

- Apply option 01 to the Top 5 opportunity feed: compact customer/enquiry rows,
  right-aligned values, stage markers and inline date/probability details.
- Retain blocker messages, permission-aware text action shortcuts and existing
  selection/order rules. Priority actions use matching compact rows with customer,
  task, timing and text shortcuts. Keep the remaining dashboard sections unchanged.

## 2026-10-14 — Align the centred phone workspace

- Account for desktop scrollbars when positioning fixed phone navigation and
  overlays so they align with the centred workspace.

## 2026-10-14 — Phone search and filter wrapping

- Give the phone opportunity search a full-width row and place the list selector
  and More action below it. Keep filter phrases together and allow footer actions
  to wrap, with a content-sized phone filter sheet and scrollable body.

## 2026-10-14 — Phone opportunity register

- Apply design 12 to the phone Opportunities list with a single coloured stage
  strip, wrapping customer/enquiry text and aligned commercial values. Preserve
  the account font, dark theme, filters, page controls and navigation. Keep the
  existing data and amount formatting without adding scheduling fields.

## 2026-10-14 — Calendar-first opportunity date filters

- Pick a single day or a two-click date range from an anchored calendar, with
  quick periods, direct month/year navigation and an optional date-field selector.
- Keep unfinished ranges local until completed; dismissing them preserves the
  previous selection. Summaries use readable dates and existing date-only,
  inclusive, India-business-time filtering remains unchanged.
- Allow the calendar to extend outside the dialog within the viewport, with
  keyboard navigation, phone touch targets and explicit Show opportunities.
- Place the calendar beside the dialog on wide screens; fall back above or
  below the date button on smaller screens without covering the clicked field.

## 2026-10-14 — Keep filter popups beside their trigger

- Fit each menu below or above its clicked phrase and scroll long option lists
  within the available space, preventing tall popups from covering their trigger.

## 2026-10-14 — Anchored sentence-filter popups

- Open compact selection popups beside filter phrases instead of expanding a
  full-width editor. Keep the dialog size stable, position menus within its bounds,
  and dismiss on outside clicks or Escape. Preserve searchable multi-selection,
  date controls, scope and explicit application of filters.

## 2026-10-14 — Sentence-style opportunity filters

- Replace the compact form with a readable “Show … opportunities” sentence and
  selectable phrases for status, owner, stage, probability and type. One shared
  editor supports searchable options, multiple selections, dates and sorting.
- Keep draft counts, explicit Show opportunities, Cancel, Reset, column filters
  and My/Global scope. Escape closes an editor before closing the dialog; phone
  layouts retain touch targets and a fixed action footer.

## 2026-10-14 — Keep the last phone dashboard report reachable

- Preserve bottom navigation and safe-area clearance when applying compact
  dashboard padding, so the final Win/Loss section can scroll fully into view.

## 2026-10-14 — Compact opportunity filters

- Use compact label/value rows, direct multi-select Probability buttons and an
  expandable Date & sort section in the shared desktop and phone filter panel.
  Preserve draft previews, explicit Apply, scope, column filters and Reset behavior.

## 2026-10-14 — Compact phone dashboard and funnel

- Shorten funnel stages in narrow dashboards and place stage names, counts and
  permitted values together beside the chart. Retain Normal/Dynamic views and drilldowns.
- Tighten phone KPI, section and list spacing using dashboard container width,
  including the selected phone workspace on wider displays. Preserve KPI calculations.

## 2026-10-14 — Simplify phone dashboard filters

- Remove All, Qualified, Proposal Sent and Blocked filter buttons from the phone
  dashboard. Keep search, Top 5 period selection, KPI values and drilldowns unchanged.

## 2026-10-14 — Keep Admin usable without service rate sheets

- Handle missing, partially loaded and incomplete service rate sheets without
  crashing Admin. Keep India/International selection available and offer Retry
  through the existing shared refresh.
- Suppress editing until the selected sheet has complete saved amounts; do not
  manufacture zero prices or restore demo rates. Existing pricing permissions
  and valid-sheet editing are unchanged.

## 2026-10-14 — Ignore responses from previous login sessions

- Guard sourcing, approval, opportunity recovery and generic save responses with
  the initiating session version, including errors and delayed save retries.
- Old requests cannot sign out a newer session, advance its save baseline, show
  stale errors or trigger a reload. Same-account logout/login is also isolated.
- Reset retry backoff for a new session while retaining current-session error
  handling and draft protection. No database or API contract changes.

## 2026-10-14 — Verified account identity at sign-in

- Keep connected login and restored sessions behind account verification until
  the authenticated workspace profile loads; remove the temporary RS fallback.
- Apply the verified name, operational role and permission roles together, with
  the server access policy, so dashboard and register scope agree on first login.
- Offer Retry on failed or stalled verification, ignore previous-session responses,
  and preserve same-account business drafts during profile correction.
- Retain local/demo authentication. No database or business-record changes.

## 2026-10-14 — Form control identifiers

- Add browser-identifiable names to native form controls throughout desktop and
  phone screens, including filters, editors, dialogs and shared controls.
- Preserve existing form names and radio groups, and add a source-wide regression
  check for missing identifiers. This addresses form autofill warnings; Chrome
  DevTools can still report stale references to elements that have left the page.

## 2026-10-13 — Event-driven explicit workspace saves

- Replace optional continuous version checks with coalesced activation checks;
  local BroadcastChannel commits and editing hints do not trigger server reads.
- Remove presence/deployment polling; keep ephemeral presence in Railway memory
  and validate deployment identity before workspace mutations.
- Gate background autosave in the opt-in mode, add selected-record Save controls,
  preserve form input ownership, and guard navigation with unsaved inputs.
- Return HTTP 409 with partial save results, keep earlier entity successes after
  later failures, and retain atomic approval operation IDs and revision checks.
- Include linked sourcing/clarification changes in explicit opportunity saves;
  use local location suggestions while typing in this mode.

## 2026-10-13 — Concurrent editing audit fixes

- Refresh clean proposal editor buffers before accepting new input, and install
  explicitly reviewed values in the editor even when the merge needs saving.
- Remove the unsafe form-input acknowledgement bypass. Component-local inputs
  block merging; discard explicitly identifies and reloads all related editor
  records, including unavailable records, with account and edit-sequence guards.
- Fall back to slower independent tab polling when BroadcastChannel is absent
  or restricted, even if browser locks are available.
- Reject mixed targeted-read/discovery requests before database access; add
  regression coverage for buffer refresh, tab fallback and grouped discard races.

## 2026-10-13 — Additional personal fonts

- Add locally hosted Roboto, Open Sans, Merriweather and Lora, including italic
  and bold styles and their open-source licences.
- Share the supported font catalogue between the preference API and interface;
  preserve account choices, Candara defaults and company document typography.
- Check each selected font's actual availability and name it in loading errors.

## 2026-10-13 — Draft-safe active workspace synchronization

- Add opt-in Railway revision checks, bounded tab coordination, targeted reads,
  and memory-only editing indicators; avoid Supabase Realtime and typing writes.
- Preserve dirty form buffers and record baselines across background/lifecycle
  refreshes; pause conflicted row saves and offer explicit review/discard.
- Bind review and refresh results to the active account/workspace generation;
  retain atomic approval operation IDs and protect against late responses.
- Add admission/backoff limits and tests for tab coordination, metadata access,
  editing expiry, draft preservation and session-safe conflict resolution.

## 2026-10-13 — Personal typography preferences

- Add account-scoped Candara, Inter and System font settings on desktop, tablet
  and phone, with revision-checked server saves and per-user local demo caching.
- Apply the selected family to business interface text and improve prose wrapping;
  keep company documents, embedded files, code and icons independent of the choice.
- Detect actual Candara availability and wait for document faces before printing.
  Licensed Candara webfont assets remain pending; missing local fonts are reported.
- Store private preferences in `records` under `user_preferences`, through the
  dedicated authenticated API; do not alter shared configuration or user roles.

## 2026-10-13 — Atomic approval decisions

- Route connected Accept/Reject actions through a server command with stable
  operation IDs, displayed-row revisions, and safe uncertain-response retries.
- Commit signatures, approval outcomes, business effects and audit receipts in
  one PostgreSQL transaction; scope revisions detect inserted or changed dependencies.
- Keep submitted inputs immutable, block legacy decision writes and forged
  receipts, and retain pull-only device synchronization and local demo behavior.
- Add disposable local PostgreSQL race/rollback tests. Apply the atomic approval
  migration after 023 before deploying the matching application.

## 2026-10-13 — Compact desktop dashboard

- Keep all funnel segments fully opaque on hover and keyboard focus while
  preserving glossy reflections and lift in Normal and Dynamic views.
- Tighten desktop KPI, report, performance and table spacing while preserving
  the selected colours, readable text, record popups and hover effects.
- Shorten Normal and Dynamic funnel stages from 74px to 48px in wide dashboard
  containers; retain existing phone, narrow-funnel and Analytics sizing.

## 2026-10-13 — Opportunity identifier theme consistency

- Keep opportunity IDs on one line beside the edit action in both themes.
- Use the light-mode classification colours in the dark register and remove its
  extra status dot; preserve wrapping for descriptions and other business text.
- Restore readable Global View text and keep sidebar access badges together.

## 2026-10-13 — KPI and funnel surface interactions

- Match the reference KPI surfaces (white, pale amber and pale pink) and funnel
  probability colours (green, amber, red and empty grey), retaining hover lighting.
- Add Full-site KPI lift, cursor lighting, icon depth and press feedback while
  retaining independent pipeline links and all existing record popups.
- Lift individual probability segments in both funnel views using clipped visual
  shapes and stationary accessible targets; highlight matching stage details.
- Preserve Phone mode, restricted values, empty stages and reduced-motion support.

## 2026-10-13 — Full-site outcome chart hover

- Add cursor-following reflections, a softly settling lift, softer moving shadows,
  legend hover previews and immediate press feedback without changing click actions.
- Add shaded 6px slice depth, a stronger 300ms hover lift and bounded pointer tilt
  to the Full-site doughnut; keep centre text upright and remove its native tooltip.
- Highlight the hovered slice’s legend and fade its count and
  percentage into the centre. Preserve the existing combined opportunity popup.
- Limit hover to mouse/trackpad input in Full site; keep Phone mode unchanged and
  disable movement for reduced-motion preferences.

## 2026-10-13 — Dashboard phone wrapping

- Give KPI amounts full card width and keep amounts, units and summary counts
  together in narrow Full site and dedicated Phone mode.
- Align performance controls in two columns, place labels and values above bars,
  and wrap section, funnel and outcome labels at word boundaries.
- Retain readable scrolling tables within the dashboard; stack KPIs below 360px
  and apply the same responsive rules to the selected 440px Phone workspace.

## 2026-10-13 — Continuous opportunity row numbers

- Number the combined opportunity register and Excel export sequentially, rather
  than repeating source-tab serial numbers. Pagination, filtering, and sorting
  follow the displayed sequence; source records and opportunity IDs stay intact.
- Give formula inspection a distinct row address for each displayed opportunity,
  even when imported serial numbers match.

## 2026-10-13 — Dashboard record drill-downs

- Open matching records from KPI cards, pipeline counts, performance figures,
  funnel stages and probability bands, and Win/Loss totals and reasons.
- Keep dashboard styling with subtle interactive cues; use shared paginated
  popups on desktop and phone without changing Opportunities filters.
- Show Actual contributions using confirmed PO values or labelled estimates;
  Target and Gap show scoped, period-aware calculation details.
- Preserve Won/Lost label filtering while counts open records, and make Top 5
  and action rows open their existing destinations.

## 2026-10-13 — Documents navigation polish

- Compact folder tiles, collapsible status groups, and sticky search/view controls.
- Remember user-specific view/sort preferences and tab-local filters, collapsed
  groups, and route scroll positions separately for My and Global scope.
- Align subfolders and file tables with the explorer; provide keyboard links and
  readable path context, and label opportunity-backed creation accurately.
- Keep preferences outside shared state, with guarded browser storage and existing
  deployment cleanup. Render the existing mock-upload prompt in file views.

## 2026-10-13 — Documents explorer refresh

- Give opportunity documents a OneDrive-inspired folder grid, readable customer
  labels, breadcrumbs, status filters, folder search, sorting, and a list view.
- Restyle nested folders with consistent spacing and responsive light/dark surfaces.
- Use filled, layered SharePoint-style folder icons with stable amber, green, red,
  and blue status colours in both themes; ordinary subfolders use amber.
- Retain opportunity-backed folder creation, existing file actions, shared view scope,
  and preserved SharePoint folders.

## 2026-10-12 — Keep sessions when changing layout

- Remove the duplicate Phone mode shortcut from the desktop sidebar; retain topbar access.
- Store layout selection locally without adding a shared audit write.
- Keep signed-in sessions on forbidden operations and transient errors; distinguish
  revoked workspace access from ordinary permission denials. Expired sessions and
  deployment changes retain their existing sign-out behavior.

## 2026-10-12 — Phone spreadsheet usability

- Pin only opportunity IDs on phones so other columns remain readable while scrolling.
- Keep small pencil icons with 44px touch areas and readable 16px table editors.
- Apply the same layout to the selected Phone mode workspace on wider screens.

## 2026-10-12 — Stage column readability

- Show eligible Won actions only while an authorized editor has unlocked the row.
- Stack the action beneath the stage with a compact checkbox; wrap stage names
  at word boundaries and retain Won/Lost outcome colors and confirmation flow.

## 2026-10-12 — Readable cells with pencil editing

- Show wrapped spreadsheet values and full dropdown labels before editing;
  reveal permitted editors with one small pencil per opportunity row.
- Coordinate one active row with a Done checkmark, preserving validation, conflict checks and existing
  save actions; keep formula-bar inspection read-only and preview access explicit.
- Allow content-sized rows in both column views, with wider minimum tracks and
  horizontal scrolling instead of clipped names, descriptions and remarks.

## 2026-10-12 — Reduce repeated workspace requests

- Stop automatic event-stream connections/reconnects and approval polling. Keep
  entry, focus/visibility, reconnect, explicit refresh and post-decision reads.
- Let the shared store own lifecycle refreshes instead of repeating them in
  Workbench and Approvals.
- Batch up to 20 simultaneous datastore reads into one authenticated request
  and workspace permission snapshot. Keep per-query projection, fresh account
  checks on every batch, and revision-aware writes outside read batches.
- No database migration is required for this request-reduction change.

## 2026-10-12 — AI opportunity search and readable dates

- Add Search with AI beneath the register search box, including date/owner
  clarification, interpreted conditions, fresh-filter results and retry states.
- Validate bounded typed filter plans on server and client; apply only to
  permitted records. Keep credentials server-side and send no opportunity rows.
- Support verified booking dates through the existing deduplicated register;
  ignore stale AI responses after query or view changes.
- Shorten display headings, wrap descriptions at word boundaries and replace
  cramped date inputs with complete date labels and Save/Cancel editors.

## 2026-10-12 — Editable opportunity spreadsheet and preview

- Remove registration-only locks on spreadsheet business fields within existing
  edit/ownership scope; commit cells on blur/Enter and cancel with Escape.
- Add preview editing with Save/Cancel, COGS, forecast and remarks; protect dirty
  drafts on close/switch and reject conflicting changes to the same field.
- Save only changed fields through existing audited actions; preserve workflow,
  booking, customer-master, pricing and ownership-transfer protections.

## 2026-10-12 — Opportunity column controls

- Give key columns proportional widths and provide clear, scrollable value
  filters with text, numeric, date and multi-value conditions.
- Keep sorting when clearing a column filter; sort percentages numerically,
  probability by Low/Medium/High and financial quarters chronologically.
- Keep condition filters scoped to the current user/view and combine them with
  search, owner, date and value filters without changing workbook data.

## 2026-10-12 — Configurable access and opportunity numbering

- Add Admin page/action matrices for Standard and Management users, with protected
  administrator access, revision checks, change reasons and transactional audit.
- Enforce current account permissions in navigation, store mutations, server saves,
  filtered reads and database access; refresh role assignments on authoritative pulls.
- Add structured ID rules and service-only atomic reservations, preserving legacy
  IDs, counter continuity and reservation history through workspace purges. Connected
  clients fail safely instead of falling back to local numbering.
- Add server-side proposal email permission, readiness and release checks.
- Require migrations 021–023 (after 020) with the matching application release.

## 2026-10-12 — Zoom-safe top navigation

- Keep company, Global/My View and refresh controls inside one header row.
- Respond to actual header width: compact search into an expandable icon and
  move secondary utilities into More before the controls run out of space.
- Prevent vertical header shrinking and dashboard overlap; preserve the native
  phone header and existing search, scope, refresh, Guide and theme actions.

## 2026-10-12 — Purchase Orders layout

- Compact the order summary into a divided strip and give pending verification
  rows clear customer labels, status badges and expandable review forms.
- Align booking fields, simplify empty sections and support narrow layouts in
  both themes while preserving booking verification and joint acceptance rules.

## 2026-10-12 — Data-shaped Dynamic funnel

- Replace separate Dynamic bars with smoothly connected, probability-colored
  bands and offset labels across desktop, Analytics and phone reports.
- Stage counts control the silhouette within the existing 30%–80% scale;
  shapes can narrow, widen or form an hourglass. Empty stages remain grey.
- Keep Normal’s fixed shape, the small switch, saved preference, role-based
  value visibility and Analytics navigation.

## 2026-10-12 — Account management and access removal

- Add searchable/filterable account management, compact actions, phone cards and
  explicit separation of access roles from owner identity.
- Support confirmed deletion in local and shared mode while retaining attribution
  and business records. Protect self, System Owner and the last active admin.
- Make shared account changes server-owned, revision checked and audited. Persist
  pending changes before Auth operations so failures can be retried safely.
- Migration 020 blocks stale browser roster writes and denies inactive/deleted
  accounts workspace access, including existing JWTs. Apply before release.

## 2026-10-12 — Customer-mail dashboard and workflow follow-up

- Rank Top 5 by expected order date within the current fiscal quarter, then
  value, with probability visible on phone and desktop. Keep Won in the funnel.
- Keep deferred/incomplete/cancelled KYC distinct from verified evidence. Require
  the full customer-master checklist and check authority/reason before recording
  a KYC bypass; retain a separate exception record and audit entry.
- Add audited Admin controls for registration requirements and customer-health
  scoring, preserving defaults and leaving probability methodology unchanged.
- Offer three roles for new assignments; retain existing Team Lead records as
  legacy access until an explicit replacement is chosen.
- Decode workbook dates directly from Excel serials to prevent timezone-driven
  day and quarter shifts. Continue to use the atomic import RPC for live merges.

## 2026-10-12 — Normal and Dynamic funnel views

- Add a compact funnel view switch across Dashboard, Analytics and phone reports.
- Default to a fixed narrowing funnel with right-side labels, counts and values;
  retain the existing count-sized Dynamic view and remember the browser preference.
- Share live probability splits, role-based value visibility and Analytics stage
  navigation across both views, with compact labels at phone widths.

## 2026-10-12 — Remove My Pipeline register view

- Remove My Pipeline from the opportunity register tabs and phone menu.
- Previously remembered selections fall back to Opportunities; My Orders
  keeps its Closed/Won filter. Opportunity records and pipeline charts are unchanged.

## 2026-10-12 — Dotted pipeline outline

- Keep the data-driven centered pipeline shape and balanced widths, using
  dotted bar borders and curved connectors without filled ribbons.
- Retain solid probability colors, hover and totals across all chart views.

## 2026-10-12 — Balanced pipeline widths

- Keep the centered, curved pipeline design while widening small stages and
  capping the largest at 80%. Empty stages use gray 30%-width zero bars.
- Explain the adjusted display scale; exact counts, probability splits and
  values remain unchanged across Dashboard, Analytics and phone.

## 2026-10-12 — Flowing pipeline ribbon

- Replace straight pipeline connectors with curved, lightly filled transitions
  and increase desktop bar spacing. Keep count-proportional widths, solid
  probability colors, empty markers and existing chart interactions.

## 2026-10-12 — Phone page picker

- Replace crowded phone pagination with Previous, a direct page picker and
  Next, with the visible record range above. Keep existing page sizes, filter
  resets and desktop controls, including the opportunity register.

## 2026-10-12 — Connected pipeline outline

- Join data-sized pipeline bars with thin edge lines across Dashboard, Analytics,
  and phone. The outline follows counts and empty markers, resizes with the
  layout, and leaves hover, labels, totals and filtering intact.

## 2026-10-12 — Readable phone workspace

- Add shared phone spacing and natural word wrapping across records, forms,
  actions and dialogs, while retaining dedicated spreadsheet scrolling.
- Show full inbox sender names and subjects, with a three-line message preview;
  place timestamps and stars below the text and wrap view filters.
- Give dashboard cards full-width actions, roomier KPIs and stacked report
  controls. Stack registration fields, sourcing editors and Analytics funnel
  totals; wrap Admin navigation and preserve both workspace themes.
- Apply the same rules to explicit Phone mode on large screens without changing
  desktop/tablet workflows, business calculations or printed documents.

## 2026-10-12 — Count-sized pipeline bars

- Replace the fixed taper with centered rounded bars whose widths are directly
  proportional to opportunity count; add clear outlines in both themes.
- Keep solid probability colors, full-row highlighting and aligned totals across
  Dashboard, Analytics and phone. Empty stages use an outlined zero marker.

## 2026-10-12 — Shared Analytics funnel

- Use the dashboard funnel on Analytics with the same solid probability colors,
  stage taper, aligned totals and row highlighting. Analytics filters and stage
  selection still control the report; keyboard stage selection is supported.
- Add a Back to dashboard link to the standalone Analytics page.

## 2026-10-12 — Consistent funnel silhouette

- Give every stage a shared top-to-bottom taper, including gray empty stages,
  so uneven stage populations no longer make the funnel widen and collapse.
- Show band counts inside the shape and values in totals/tooltips to avoid
  clipping labels against the slope.
- Explain that width shows progression; keep probability splits, counts, values,
  permissions and full-row hover driven by existing live data.

## 2026-10-12 — Funnel row highlighting

- Highlight the complete funnel stage row on hover or keyboard focus, including
  stage name, probability bands, count and value. Keep restricted totals hidden.
- Use brighter solid green, amber and red for probability bands and matching
  legends on desktop and phone, with readable contrasting labels.

## 2026-10-12 — Performance quarter selector

- Tap QTD again or double-click to select any fiscal quarter from Q1–Q4 on
  desktop and phone; display the selected quarter on the button.
- Support keyboard navigation and Escape dismissal; reuse existing period
  calculations for Actual, Target and Gap. Top 5 keeps its independent filter.

## 2026-10-12 — Clearer pipeline funnel and KPI colors

- Use solid, deeper funnel probability colors and matching legend without
  gradients or shine, and simplify the tapered stage edges on desktop and phone.
- Restore neutral, amber and red KPI backgrounds for pipeline, follow-ups,
  approvals and blocked work, including phone cards and dark mode.
- Increase band height and keep counts and values aligned without changing
  saved stage totals, probability proportions, or empty-stage behavior.

## 2026-10-12 — Compact continuous dashboard

- Combine dashboard reports and KPIs into one shared glass card with fine
  dividers, compact section padding, and contiguous table rows.
- Keep the sidebar unchanged and desktop reason charts beside the donut;
  preserve phone disclosures, readable wrapping, and touch control sizes.

## 2026-10-12 — Opportunity ID labels

- Show opportunity IDs without legacy owner names or codes throughout desktop
  and phone labels, linked records, previews, search results and alerts.
- Remove the appended owner name from phone opportunity card ID labels; preserve
  stored identifiers, navigation targets and separate Owner fields.

## 2026-10-12 — Sculpted glass dashboard

- Add dashboard-scoped glass surfaces, beveled KPI cards, recessed performance
  tracks, dimensional funnel bands and donut, and raised navigation controls.
- Preserve live chart proportions, business calculations, role permissions,
  and existing filters; adapt depth to both themes and phone layouts.
- Wrap long labels and amounts, space controls and table rows consistently,
  and stack crowded win/loss content on small screens. Respect reduced motion.

## 2026-10-12 — Per-owner dashboard target editor

- Add a Manage targets action to Global Performance for LJS, AH and Admin.
- Open an owner-by-owner editor for annual and quarterly goals, saving through
  the existing FY confirmation and audit workflow.
- Show one company target calculated from confirmed owner targets, with the
  confirmed-owner count and draft total in the editor.
- Make the company total editable by distributing changes proportionally across
  owner targets, with individual or all-owner confirmation actions.
- Exclude unconfirmed values from the company total and keep the remaining-to-
  target gap hidden until every target and Won value is verified.

## 2026-10-12 — Viewport-sized register pagination

- Extend viewport-sized pagination to the desktop and tablet Opportunities,
  My Opportunities, Audit Trail, Users, Purchase Orders and Proposal Sent
  registers, plus the approval queues. Inbox uses the visible height of its
  own message panel.
- Keep the existing ten-item page size for phone card lists.

## 2026-10-12 — Customer Master viewport pagination

- Size desktop and tablet Customer Master pages to the available viewport height,
  keeping the pagination controls and status legend visible. Phone cards and
  other lists retain their existing page sizes.

## 2026-10-12 — Won value in dashboard Performance

- Default desktop and phone Performance to all Won opportunity value. Use the
  confirmed PO amount where available and the saved opportunity amount while
  verification is pending, without counting a win twice.
- Add All history alongside YTD and QTD. Period views use confirmed booking
  dates or expected order dates for unverified wins. Mark estimated totals and
  withhold the remaining-to-target gap until included values are verified.
- Keep Purchase Orders as the confirmed booking register and preserve the
  existing approval and target confirmation workflows.

## 2026-10-12 — Opportunity stage and owner column clarity

- Keep the Mark Won checkbox label on one line and wrap the complete control
  below the stage when needed. Already-won rows show their stage once, without
  a duplicate disabled checkbox; other closed outcomes retain the existing action.
- Rename the visible LJS column to Opportunity Owner. Preserve the workbook's
  LJS export heading, owner filter behavior and existing owner assignments.

## 2026-10-12 — Data-responsive funnel polish

- Funnel widths now respond to saved current-stage counts on desktop and phone,
  using a square-root scale so small populated stages remain readable. The
  probability-band proportions, totals and restricted values remain based on
  those same saved records.
- Matched the reference's emerald, yellow and coral probability bands with
  subtle shading and a centered opportunity/value caption. Tightened stage
  spacing and softened grey zero-count shapes with a visible 0.

## 2026-10-12 — Clearer Win/Loss dashboard

- Place the donut beside Won/Lost counts and their percentage shares, then show
  the Won/Lost closed count and total opportunity value for roles allowed to
  see commercial values. Add matching count axes to both reason charts.
- Turned the existing Won/Lost counts into accessible filter buttons. Selection
  shows only that outcome's reasons and percentages; clicking again restores
  both and resets the top-five view. The donut retains the overall win rate.
  Added explicit green Won/red Lost bar labels and omitted zero-count bars.
- Simplified the clickable counts to plain text without boxes or fills, using
  an underline for selection. Show both outcomes is also a plain text control.
- Matched the reference's compact three-column report: a larger win-rate donut
  and totals, a Won/Lost reason comparison, and ranked top loss reasons.
  Both views show all-closed totals and explain the win-rate denominator;
  desktop and phone share the same report content.
- Comparison bars use the same opportunity-count scale for wins and losses;
  loss bars include percentages of all losses. Both charts show the top five
  by default, with Show all reasons retaining access to every reason.
  Empty states and other closed stages remain separate, and phones stack the
  three report columns.
- Kept workbook data, report calculations, view filters and detailed-analysis
  navigation unchanged. Added rendered-report tests for denominator clarity,
  reason percentages and empty/single-outcome states on desktop and phone.

## 2026-10-12 — Enquiry EUC extraction mapping

- Prioritize explicit end-user names and locations over site, delivery and
  generic address fields; recognize the combined Site / Plant labels produced
  by extraction. Ignore blank and rejected fields when selecting suggestions.
- Keep missing EUC names blank instead of copying the buyer. Restrict prose
  suggestions to installation or equipment requirements, and keep same-customer
  delivery suggestions only when the delivery block names that customer.
- Prevent generic buyer location labels from overwriting AI EUC locations.
  Preserve human-entered identity values and pending review for AI suggestions.
- Add regression coverage for field mapping and the real intake extraction
  path using local fallback and a controlled AI response.

## 2026-10-12 — Complete local workbook recovery

- Recovered the missing closed rows from the reviewed Betser workbook into the
  local browser workspace through the existing upload and merge workflow.
  Existing edits, proposals, approvals and files were preserved; the backup
  and conflict review remain local-only.
- Verified all 73 workbook opportunities: 9 open, 11 won, 33 lost and 20 other
  closed outcomes. Added regression coverage for restoring closed current-sheet
  wins and losses, preserving saved edits and importing again without duplicates.

## 2026-10-12 — Continuous funnel silhouette

- Tapered the six desktop and phone funnel rows by stage so their silhouette
  reads like the reference. Row totals and probability-band proportions still
  reflect saved current-stage opportunities; a visible note separates the
  stage shape from the data counts. Empty rows remain grey.

## 2026-10-12 — Funnel visual alignment

- Matched the reference's green/yellow/red probability bands, denser tapered
  rows and in-band count/value labels where space permits on desktop and phone.
  Narrow bands keep their counts and values in the existing totals/tooltip.

## 2026-10-12 — Visible empty funnel stages

- Added neutral grey funnel placeholders for zero-count stages on desktop and
  phone, with an empty-stage tooltip and legend text. Saved counts, values and
  the widths of populated stages remain unchanged.

## 2026-10-12 — Dashboard funnel count widths

- Kept desktop and phone funnel shapes and made their widths and probability
  bands consistently reflect opportunity counts at the current saved stage.
- Added a visible count-width label. Zero or missing values no longer change
  the scale; populated stages retain shapes and empty stages remain uncoloured.
  Commercial values remain alongside the counts for permitted roles.

## 2026-10-12 — Opportunity dashboard totals and dates

- Show scoped total, open and closed counts from saved opportunity records on
  desktop and phone. Pipeline value continues to include only open records.
- Added All dates to Top 5, including future and undated open opportunities;
  the financial year remains the default. Empty period views explain why open
  records are excluded. No opportunity records are imported or restored.

## 2026-10-12 — Frozen opportunity columns

- Kept Sl., Opp ID and Sell To Customer at identical widths in Key and All
  Columns, and froze their headers and cells while the other columns scroll.
- Added compact frozen widths for phone tables and retained customer colour,
  editing and filter controls in both themes.

## 2026-10-12 — Six-stage pipeline funnel

- Removed Closed / No Win from the shared funnel, leaving six stages ending at
  Won across Dashboard, Opportunities, and Analytics. Lost and other closed
  records remain available in opportunity lists and Win/Loss analysis.

## 2026-10-12 — Empty inbox width

- Expanded the mailbox to the full available width when no lead preview is
  rendered, including empty search/filter results. Populated desktop inboxes
  retain their side-by-side lead preview.

## 2026-10-12 — Editable customer policy matrix

- Refined the matrix with coloured sticky headers, a pinned Criteria column,
  compact spreadsheet cells and save bar, keyboard-accessible definition help,
  and account text that grows to fit without internal scrollbars.
- Replaced the customer governance cards, expandable editors and comparison
  list with one Excel-style Criteria / Blue / Red / Amber / Green / Remarks
  table, including quoting actions and typical-account guidance.
- Saved cells update classification comparisons, payment terms and the Amber
  quotation fee. A saved No Bid action blocks quoting until admin changes it;
  approximate workbook thresholds remain visible and require definition.
- Moved KYC number validation to Documents & templates and service rates to
  Commercial & automation. Field-list saves update only field configuration.

## 2026-10-12 — Dashboard opportunity reporting

- Decoupled all-history opportunity reports and active work from performance
  period filters; Top 5 retains its own expected-order-date selection.
- Fixed Closed / No Win probability segments and totals, removed colored empty
  funnel placeholders, and separated counted win and loss reasons on desktop
  and phone without merging saved reasons into a generic overflow category.
- Excluded future booked orders from actual performance and protected desktop
  sales values for roles without commercial access.
- Derived dashboard YTD/QTD quarters from today's IST date and the configured
  financial year, so stale saved quarter settings cannot hide booked actuals.

## 2026-10-12 — Excel pipeline alignment

- Matched All Columns to the workbook’s 32 columns and order, including K₹
  amounts, calculated margins, FQ-FY, and independent historical dates.
- Retained all Current Opps and Old Closed Opps, including won history. Removed
  automatic hardcoded workbook/customer loading; admin preview imports merge
  saved data while preserving edits, linked files, approvals and tombstones.
- Added atomic, generation-checked server imports (migration 019) and customer
  classification facts/guidance. Excel payment defaults preserve custom terms;
  Red remains No Bid unless joint LJS/AH continuation clearance is approved.

## 2026-10-12

- Hid the sidebar scrollbar while preserving navigation scrolling and removed
  the sidebar AI extraction and last-sync status labels.

## 2026-10-10

- Added a repeatable local Supabase bootstrap that applies the active schema,
  reads the Betser Excel pipeline workbook, and imports local opportunity,
  customer, and application-profile data without changing browser demo seeds.
- Added a browser-local Excel import action that replaces demo business records
  with the workbook's opportunities and derived customer records without any
  Supabase write.
## 2026-10-10

- Fixed Excel customer imports so the app-readable consolidated `state/customers` slice is populated while typed and legacy customer rows remain preserved.
## 2026-10-12 — Confirmed bookings and trustworthy performance

- Make Performance, Purchase Orders and shared sales KPI helpers use one
  confirmed booking register. Exclude Lost/No Bid/other closed outcomes,
  expected dates and future or malformed bookings; deduplicate before owner scope.
- Add historical imported-Won booking review with a verified PO/contract,
  actual date, accepted net INR value and evidence. New orders require verified
  PO details plus both LJS/AH signatures. Saving changed details resets acceptance;
  simulations and newly marking Won do not create bookings.
- Store acceptance snapshots on opportunity rows through existing revision-aware
  persistence, protect them from stale edits, retain confirmed sales when an
  opportunity is deleted in the app, and retain compact sales/PO/handover
  data in the local fallback. No database migration or new table is needed.
- Explain incomplete booking data on desktop and phone, suppress unreliable gaps,
  require confirmation of untouched demo targets and label comparisons against
  full-year/full-quarter targets. Target saves record the FY and reviewer and
  require quarterly totals to reconcile with the annual target.
## 2026-10-12 — Shared opportunity filters

- Unify desktop and phone filtering with a draft popup, matching-record count,
  multi-selection, validated dates, Apply/Cancel, and explicit Reset behavior.
- Share the evaluator between preview, table/cards, and exported rows; preserve
  owner scope, advanced column conditions, and independent search/sorting.
- Keep filters when using stage shortcuts, expose active fields as removable
  chips, and simplify More to export, admin import, and phone table access.
## 2026-10-17 — Mod-AE user directory

- Add the separate local WinTrack Admin account through a one-time bootstrap.
  Restrict Preview as user to its stable identity in both UI and the store;
  reject other administrators, pending/inactive targets and connected mode.
  Preserve subsequent credential edits and deletion without reseeding.
- Add self-service Change password below Appearance for every account category.
  Verify the current password, require matching 8+ character new entries, keep
  local changes scoped to the signed-in account, and use isolated verification
  plus the captured app session for connected Auth updates. Keep passwords out
  of shared profiles, preferences and audit details; preserve unsaved workspace data.
- Limit new local workspaces to the twelve requested Mod-AE accounts, with LJ
  retaining Sales and Management access. Retire existing legacy/duplicate local
  accounts once, preserve historical attribution and passwords for retained
  profiles, sign out retired sessions, and stop recreating users after edits.
- Restrict new owner selections to owners with an active account; retain current
  historical owners when editing their existing records. Shared rosters remain
  server-owned and are not modified by browser migration.
- Show account Actions in a floating dropdown instead of stretching table rows.
  Preserve permission checks, add keyboard navigation and outside dismissal,
  and keep the menu within the viewport on small screens and bottom rows.
- Resolve linked owner labels from the current account roster across workspace
  screens and new exports; account edits override stale configuration labels.
  Remove the separate Owner names editor; Accounts is the single name editor.
  Retain historical snapshots and existing fallback labels for unlinked owners.
- Refresh the signed-in account email together with its authoritative name.
- Update local directory names and emails to the supplied Mod-AE accounts while
  preserving stable owner IDs and historical record ownership.
- Add the six Non-sales submit-only users and Lokesh Bhardwaj with Management
  access; LJ Swaminathan retains both Sales and Management access.
- Keep role codes internal for routing and permissions while showing full names
  in the user-facing owner and approver displays.

## 2026-10-20 — Broader lead attachment scanning

- Extract readable cells from `.xlsx` and `.xls` workbooks and text from `.pptx`
  slides, preserving sheet and slide labels for AI review.
- Convert Word, Excel, PowerPoint, OpenDocument, and RTF uploads to temporary
  PDFs on the server, including modern Office formats, so visual review can see
  layout and embedded content. Install LibreOffice Writer, Calc, and Impress in
  Railway and remove temporary files after conversion. Report conversion, size,
  damage and password errors clearly.
- Continue sending PDFs and common images directly for visual AI reading.
  Limit direct images to Gemini-supported PNG, JPEG, WebP, HEIC and HEIF; report
  unsupported image types instead of sending them with an unusable MIME type.
- Re-apply file and byte limits after merging existing and newly added files on
  a re-scan, so the provider cannot silently drop files beyond its request cap.
- Stop treating Outlook `.msg` binary files as plain-text email; saved `.eml`
  messages remain supported.
