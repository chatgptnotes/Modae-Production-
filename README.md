# WinTrack ModAE

WinTrack ModAE is a React application for managing ModAE sales work from the
first enquiry through opportunity registration, proposal preparation, approvals,
submission, and follow-up.

## What the application does

- Opportunities uses the same Filters panel and matching logic in full site
  and phone mode. Combine owner, status, stage, type, probability, and dates;
  preview the matching count before Apply. Column filters remain visible and
  removable, and Reset clears structured filters while keeping search and sort.
  Stage shortcuts preserve other selections. More contains Excel export,
  admin import, and the phone editable-table action.

- Authorized opportunity editors can edit business fields throughout the pipeline,
  including closed history. Spreadsheet cells show wrapped text by default; use each cell’s small pencil
  to edit. Text and date cells save on blur/Enter; Escape cancels.
  The Details preview uses Save/Cancel and warns before discarding a draft.
  Workflow transitions, customer-master status, calculated fields and bookings
  retain their existing controls.

- Desktop navigation keeps company and workspace-view controls on one row at
  browser zoom. Narrow headers collapse search to an icon and move the clock,
  Guide and Phone mode into More; search and all controls remain accessible.

- User management includes search, status/access-role filters, account counts,
  compact account actions and phone cards. Delete removes access while preserving
  business history; self, System Owner and last-administrator protections apply.
  Shared account changes require migration `020_user_account_lifecycle.sql`.

- Phone mode uses spacious record rows, full customer names and enquiry subjects,
  wrapping filters, stacked form fields and full-width dashboard actions. Long
  IDs and filenames wrap without pushing pages sideways; spreadsheet editors
  retain their own scrolling regions. This also applies to the selected 440px
  Phone mode workspace on larger displays, in both themes.
- Phone pagination uses Previous and Next buttons with a direct page picker
  between them and the visible record range above.
- Performance: tap QTD for the current quarter; tap again or double-click to
  choose Q1–Q4. The selected quarter applies to Actual, Target and Gap.
- Analytics shares the dashboard funnel and offers a Back to dashboard link.
- Pipeline charts offer a compact Dynamic / Normal switch, shared across Dashboard,
  Analytics and phone views. Normal is the default fixed narrowing funnel with
  offset labels; the browser remembers the selected view. Both show live counts,
  probability splits and permitted values. Normal widths indicate stage order.
- Dynamic pipeline charts use connected curved bands with count-based widths in a
  30%–80% display range for readability. The shape follows saved stage counts and
  can narrow, widen or form an hourglass. Live probability splits, offset labels
  and separate count/value totals remain visible; empty stages stay grey.
- Dashboard uses one compact glass card with a divided KPI strip, raised
  controls, dimensional charts, and recessed tracks in both workspace themes.
  Reports share a continuous surface with fine dividers; phone layouts use shallower
  depth; reduced-motion preferences disable control motion. Long labels and
  values wrap, with narrow tables retaining horizontal scrolling.

- Paginated desktop and tablet registers size their pages to the available
  viewport or list panel. Phone card lists retain ten rows per page.
- Admin → Customer governance shows an editable Excel-style customer matrix.
  Save rules applies the quoting actions, fee, payment terms and exact
  classification criteria; approximate values remain marked Needs definition.
  Typical Accounts and Remarks provide editable guidance for admin review.
  KYC number validation is under Documents & templates; service rates are under
  Commercial & automation.
- Provides a phone workspace with bottom navigation, a searchable More menu,
  record cards, local search and expandable data tables. Opportunity cards
  offer an “Edit in table” alternative for spreadsheet work. More includes
  documents, proposals and administration according to the user's permissions.
- Phone mode opens the phone interface in a centered 440px workspace on larger
  screens, and fills smaller phone screens. The device remembers an explicit
  selection across resize and reload; More → Full site returns to the wider
  workspace. Automatic tablet layouts remain available when no mode is pinned.
  More hides disabled demo scenarios and identifies the automation map's
  roadmap previews. Status updates use searchable phone rows with a table
  option; tender review provides stacked BOQ and commercial-term editors.
  Browser-only sessions display “Local only” without offering database refresh.
- On phones, Opportunities uses readable customer rows with values and overdue
  cues, compact search/filter controls, and a floating Create opportunity action.
  The detail screen has an expandable summary, gated workflow steps and task navigation.
  Spares sourcing starts with a checklist and searchable parts workspace: edit
  quantities or prices across rows, select visible or all matching parts, preview
  batch pricing and confirmations against enquiry totals, then apply together.
  Drafts survive filters, task changes and refresh on the same device.
  Service forms use focused mobile tasks; Project retains its Coming soon gate.
  Existing permissions, pricing calculations, and approval gates still apply;
  tablet and desktop retain their wider layouts.
- At phone widths (600px or less), Dashboard shows KPIs, ranked Top 5
  opportunities and priority actions, with independently expandable Performance,
  Pipeline Funnel and Win/Loss reports. Its header shares the desktop view and
  light/dark preferences; tablet and desktop retain their wider layouts.

- On phones, Lead inbox uses a compact search/filter bar, All leads / Needs review / Converted / Starred views, readable message rows, visible stars, and a floating New enquiry action. Its header shares the workspace view and theme controls.
- Captures and reviews incoming leads.
- Phone creation forms use readable single-column fields and consistent headings.
  Phone dark mode uses consistent charcoal controls, terracotta actions and
  readable neutral labels, including intake classification options and status badges.
  Its five main phone tabs share 16px page edges and single-row 48px search
  controls with integrated actions and readable 16px input text in both themes.
  Search colors follow the selected theme; graphite panels remain dark-mode only.
  All signed-in phone pages share a pinned original-logo/view/theme/profile row;
  full-screen forms and editable tables retain that row within their own screen.
  Sync/refresh stays below the page header, while small dialogs are unchanged.
  Tapping the initials circle opens account details, Full site and Log out.
  New enquiry keeps attachments, extraction errors and unextracted recovery;
  New opportunity retains its existing intake and validation requirements.
- Phone lead review separates Overview, Details, and Email while retaining draft
  edits between tabs. Missing-information shortcuts open the relevant field;
  qualification, registration, and converted opportunity actions keep their
  existing checks. Less-used actions are in More; desktop/tablet are unchanged.
- Extracts enquiry details using AI when configured, with deterministic fallbacks.
- EUC suggestions prioritize explicit end-user details over site and general
  address fields. A buyer alone does not establish the EUC; missing end-user
  names stay blank for review. AI suggestions remain pending human acceptance.
- Registers qualified leads as opportunities. Opportunity ID labels omit legacy
  owner suffixes; ownership remains available in separate Owner fields.
- Opportunities search offers **Search with AI** beneath typed text. Natural-language
  requests become visible filters after any needed clarification; AI search replaces
  table filters while respecting My/Global View. Win-date requests ask which recorded
  date to use. AI requires an online authenticated session and configured server AI;
  ordinary search remains available. Dates open in a readable Save/Cancel editor.
- Opportunity column menus provide text, numeric and date conditions alongside
  searchable value selection. Clear filter preserves sorting; probability sorts
  Low–Medium–High and fiscal quarters sort chronologically.
- Fits every key opportunity column in one full-width table without horizontal
  scrolling, including at browser zoom; the full 31-column table scrolls
  horizontally. Clicking a column name opens its menu.
  Empty Lead inbox views expand the mailbox across the available width.
  The Lead inbox keeps its preview beside a horizontally scrollable lead list;
  wider rows give each inbox column more room to show its contents.
  Desktop and tablet inboxes use a single-row toolbar: search with a filter
  dialog, a view dropdown, refresh, more actions, and New enquiry. All leads,
  Needs review, Converted and Starred views include scoped/filter-aware counts;
  Archive and selection actions are available in the more menu. Scroll the
  lead list right to access every column; desktop details stay beside the list
  with original email, attachment previews and linked opportunity actions.
- Tracks project, spares, and services opportunities.
- Builds proposals, pricing, terms, and supporting documents.
- Routes technical, commercial, and release approvals.
- Opens Purchase Orders from the sidebar and phone More at `/order`, with `/po`
  redirecting for existing bookmarks.
- Stores opportunity files and supports SharePoint integration.
- Provides dashboards, audit history, user administration, and workflow tools.
- Includes permission-filtered workspace quick search, operational status
  summaries, an inbox preview, and a weekly proposal follow-up board.
- Offers light and dark workspace themes with a shared desktop/tablet toggle.
  Both themes use full-width workspace pages with consistent side spacing as
  browser zoom changes the available width.
  Light is the default; the browser remembers your choice and synchronizes it
  across open tabs. The dark palette uses charcoal surfaces and terracotta accents,
  with green, amber, red, and cyan distinguishing success, warnings, errors, and
  information. Sign-in, public showcase, proposal documents, and printed output
  retain their light presentation. Deployment cleanup resets the preference.
- Provides shared personal/global opportunity views, a combined open-and-won My
  Pipeline register, a six-stage funnel with High/Medium/Low bands,
  and closed-opportunity reporting with a loss-reason filter.
- Keeps the My View / Global View switch in the top navigation across desktop
  and tablet pages; owner-based lists follow the selection within existing role
  access limits.
- Main record lists use consistent 10-row pagination that follows search,
  filters, and sorting. Price Lists shows all matching rows without pagination;
  Documents shows all opportunity folders together within their status groups.
- LJS and ADMIN can edit supplier price lists as new saved versions and edit
  India/International service rates directly from Price Lists. Pricing edits,
  uploads, restores, and currency-rate changes are read-only for other roles.
- My Dashboard calculates pipeline cards, active work, the sales funnel, and
  Win/Loss from all eligible opportunity history in My View / Global View.
  The pipeline card shows scoped total, open and closed opportunity counts.
  Top 5 defaults to the current fiscal quarter and ranks open opportunities by
  earliest expected order date, then highest order value for matching dates.
  Desktop and phone show probability. FY and All dates remain available;
  undated records sort last in All dates, and empty periods explain exclusions.
  The dashboard funnel changes width with each stage's saved opportunity count.
  Its row totals and the
  green/yellow/red probability bands show actual counts at the current saved
  stage, with values alongside for permitted roles. Empty stages show a grey
  shape and zero totals; in-band labels appear where they fit.
  Dashboard Performance defaults to all Won opportunity value. It uses the
  confirmed PO value when available and the opportunity value otherwise,
  clearly marking unverified estimates. YTD and QTD use the booking date for
  confirmed orders and the expected order date for unverified wins; undated
  wins remain in All history. Confirmed FY targets appear only in YTD and QTD,
  and the remaining-to-target gap waits until every included win is verified.
  Purchase Orders retains the confirmed customer booking register. Imported
  Won opportunities await manual verification of the customer PO/contract,
  actual booking date, accepted net INR value (excluding GST), and evidence
  in Purchase Orders. New orders require verified PO details and joint LJS/AH
  acceptance; changing those details resets both signatures. Simulated POs,
  expected order dates, and other closed outcomes never count as bookings.
  Missing or incomplete booking data is explained without treating estimates
  as confirmed bookings.
  Confirmed bookings survive ordinary opportunity edits and are retained in
  the order register when an opportunity is deleted through the application.
  Untouched demo targets require FY confirmation through More reports & settings;
  previously customized targets remain compatible. YTD compares dated Won value
  against the full-year target; QTD uses the full-quarter target. Neither is a
  prorated target-to-date or a revenue-recognition report.
  Performance YTD/QTD filters dated Won work and targets; Top 5 has its own
  expected-order-date filter. The funnel has six stages, from Qualified Lead
  through Won; closed losses and other closed outcomes stay in Win/Loss
  analysis. Win/Loss uses explicit Won/Lost results and shows separate counted
  win and loss reasons; other closed outcomes are listed separately.
  Its summary shows the win-rate donut beside Won/Lost counts and their shares
  of Won/Lost decisions, plus the Won/Lost total and permitted opportunity
  value. Won and Lost shares use Won + Lost as their denominator; other closed
  outcomes stay separate. Its reason comparison and ranked reason chart use
  aligned count scales; ranked reasons show their share of all wins or losses.
  Show all reasons expands the compact charts.
  The existing Won and Lost counts are filter buttons: select one to show its
  reasons and shares, then click it again or Show both outcomes to reset.
  The overall win rate stays unchanged while filtering reasons.
  Saved edits recalculate these reports, and remote edits appear on the existing
  synchronization pulls. Marking Won does not itself create a booked order.
- My Dashboard puts scoped summary cards and urgent work before its sales funnel,
  performance charts, and searchable opportunity/approval register. My View
  includes decisions assigned to you even when another salesperson owns the
  opportunity. Global View includes company approvals and supports owner and
  fiscal-period filters. Existing role reports and target tools remain under
  the register menu → “More reports & settings.” The configured FY is selected
  by default; task dates appear only when a real workflow deadline exists.
- Matches the Betser pipeline’s 32 columns and order in All Columns, with K₹
  amounts, calculated margins and April–March financial quarters. Admins can
  preview and merge Current Opps and Old Closed Opps, including won history.
  Saved edits and deleted records are preserved. Customer records come from
  reviewed imports and saved data; opening the app never reseeds them.
- Customer classification stores reviewed facts and workbook guidance. Defaults
  keep Blue pending validation, Amber’s ₹25,000 quote fee and 30-day terms,
  Green’s 30–45-day terms, and Red’s No Bid with joint LJS/AH clearance. Existing
  custom policy and issued proposal terms remain preserved.
- Admins can independently require final quote-release approval and approval of
  special customer commercial terms.
- Admin → Workflow → Access & routing includes required registration fields and
  customer-health scoring. Changes require a reason, validate thresholds and
  reject stale settings drafts. Sell-to customer remains mandatory. Defaults
  preserve existing behavior; health scores do not feed probability. Existing
  probability suggestions and forecast weights remain separate. Admin can configure Standard and Management page/action permissions and structured opportunity numbering in Workflow → Access. Existing IDs stay unchanged; connected creation reserves an ID on the server and reports a retryable error if reservation is unavailable.
- KYC skip-for-now snapshots stay Deferred. Incomplete or cancelled requests
  cannot become Verified, and customer-master checklists must contain every
  required document. Configured approvers and administrators can record a
  reasoned, timestamped bypass when the category permits it; the bypass does
  not mark KYC completed. Existing completed lead KYC can be reused.
- Excel date cells are decoded as calendar serials so timezone conversion does
  not move expected order dates into the previous day or fiscal quarter.
  Live workbook merges require `019_atomic_workbook_import.sql` on the target
  database; a missing RPC stops the merge without partial writes.

- Level 2 intake supports searchable customer-master selection, inline creation
  of new customers, internal enquiries, deferred KYC, active opportunity edits,
  initials-free opportunity IDs, and structured win/loss reasons.
- Level 3 user administration supports standard application roles, multiple
  roles per user, and combined role-based page access while retaining the
  existing Supabase Auth account flow.
  User management offers Standard User, Management User, and Admin User in
  a single role selector. Existing Team Lead assignments remain readable as
  legacy access until an administrator explicitly selects a replacement; new
  Team Lead assignments are disabled. Existing multiple assignments survive unrelated
  edits; choosing a different role replaces the application assignment while
  retaining the operational owner ID used by historical work and approval gates.
  Administrators can click Edit on an account to change its name, email, role,
  and status directly in the table, then Save or Cancel the complete row.

## Technology

- React 18 and Vite
- React Router
- Supabase Auth, pull-based database synchronization, and persistence
  with simultaneous reads batched through the server. Idle pages do not poll
  or reconnect a data stream; shared updates load on page entry where needed,
  focus/visibility restoration, reconnect, and explicit Refresh.
- Express API routes served by Railway
- ExcelJS, PDF.js, and XLSX utilities for proposal and document workflows

The application pulls shared state from Supabase on boot, route changes,
window focus/visibility restoration, reconnect, and explicit refresh. It does
not use Supabase Realtime or WebSockets. Supabase is authoritative for shared
data, including deletions; browser snapshots are offline working copies and
are never republished merely because they exist locally. Each new Railway
deployment invalidates active browser sessions, clears app-owned browser
storage/cache, and returns users to sign-in. The application can run locally
without Supabase. In that mode it uses browser-local persistence and does not
write to a database. A configured Supabase environment enables authentication and
cloud persistence. When running on localhost, seeded demo credentials may fall
back to browser-only local auth if Supabase rejects them; deployed environments
always require Supabase Auth.

## Getting started

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open the local Vite URL shown in the terminal. The required environment
variables are documented in `.env.example` and deployment-specific settings are
documented in [DEPLOYMENT.md](./DEPLOYMENT.md).

## Useful commands

```bash
npm run dev       # Start the local Vite development server
npm run local:supabase  # Bootstrap local Supabase from the Excel pipeline workbook
npm test          # Run the automated test suite
npm run build     # Create a production build
npm run preview   # Preview the production build locally
```

Before production promotion, also walk the manual checklist in
[tests/MANUAL_SMOKE_CHECKLIST.md](./tests/MANUAL_SMOKE_CHECKLIST.md).

For a local Supabase workspace populated from the Betser workbook, see
[docs/LOCAL_SUPABASE_WORKBOOK.md](./docs/LOCAL_SUPABASE_WORKBOOK.md).

## Project structure

```text
api/              API route handlers used by the Express server
assets/           Imported runtime brand, document, and workbook assets
public/           PWA icons, service worker, and fonts
scripts/          Local build, document, asset, and workflow utilities
src/              React application, state, workflows, and integrations
supabase/         Active production database migration and schema notes
tests/            Automated tests and the manual smoke checklist
.local/           Ignored local archive for personal/reference material
```

The main browser entry point is `src/main.jsx`. The application shell and route
registration are in `src/App.jsx`; tablet routes are in `src/tablet/TabletApp.jsx`.
Shared state and persistence are primarily handled by `src/store.jsx` and
`src/datastore.js`.

## Production database

The production database uses a controlled Supabase table allowlist:

1. `ai_secrets`
2. `approvals`
3. `leads`
4. `opportunities`
5. `records`
6. `user_files`
7. `proposals`
8. `spares_lines`
9. `clarifications`
10. `audit`
11. `settings`
12. `price_lists`
13. `price_list_versions`

The application stores remaining compact state in the JSON-backed `records`
table, while large workflow collections use dedicated JSONB tables. Do not add
queries for another table. See
[supabase/README.md](./supabase/README.md) for the schema policy and verification
query.

## Deployment

Staging and production are separate Railway environments with separate
Supabase projects. Staging uses a sanitized workspace copy with the complete
price lists and catalogue data. Read [DEPLOYMENT.md](./DEPLOYMENT.md) before
changing environment variables, branches, or production data.

## Local-only files

Reference documents, completed planning and QA notes, prototypes, backups,
generated PDFs, optional agent tooling, scraped branding material, and retired
migrations belong under `.local/`. This directory is ignored by Git on purpose.
Moving a file there keeps it available on the local machine but prevents it
from being committed or deployed.

Do not copy local-only files back into runtime directories unless the application
actually imports or serves them.

## More documentation

- [AGENTS.md](./AGENTS.md) — technical context and rules for developers and coding agents
- [CHANGELOG.md](./CHANGELOG.md) — dated project changes and cleanup history
- [DEPLOYMENT.md](./DEPLOYMENT.md) — staging and production deployment procedure
- [supabase/README.md](./supabase/README.md) — active database schema policy

### Configurable access and numbering

Admin → Workflow → Access contains **Role permissions & opportunity IDs**.
Load the current rules, edit Standard/Management pages and actions, enter a reason,
and save. Admin access remains protected; grants do not replace KYC, assigned
approver or joint-signature requirements. Stale settings must be reloaded.

Numbering supports an optional uppercase prefix, YYMM/ YYYYMM/ YYYY/ no date,
an optional hyphen, 3–8 minimum sequence digits and monthly/yearly/continuous
numbering. Defaults remain YYMM plus three digits, resetting monthly in IST.
Previews are provisional. Reservations and counters survive workspace purges.

Apply migrations **020, 021, 022 and 023** before releasing this application.
Migration 022 closes direct browser business-table access: the application uses
authenticated, permission-filtered data routes instead. Deploy the migration and
application during the same maintenance window; older clients must sign in again.
This feature does not execute the separate workbook reset/import SQL.
