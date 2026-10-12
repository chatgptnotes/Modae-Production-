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
