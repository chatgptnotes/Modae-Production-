# WinTrack ModAE

WinTrack ModAE is a React application for managing ModAE sales work from the
first enquiry through opportunity registration, proposal preparation, approvals,
submission, and follow-up.

## What the application does

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
- Registers qualified leads as opportunities.
- Fits every key opportunity column in one full-width table without horizontal
  scrolling, including at browser zoom; the full 31-column table scrolls
  horizontally. Clicking a column name opens its menu.
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
  Pipeline register, a value-scaled six-stage funnel with High/Medium/Low bands,
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
- My Dashboard puts scoped summary cards and urgent work before its sales funnel,
  performance charts, and searchable opportunity/approval register. My View
  includes decisions assigned to you even when another salesperson owns the
  opportunity. Global View includes company approvals and supports owner and
  fiscal-period filters. Existing role reports and target tools remain under
  the register menu → “More reports & settings.” The configured FY is selected
  by default; task dates appear only when a real workflow deadline exists.
- Loads the Betser workbook as the local-only opportunity/customer dataset on
  first localhost launch, and also provides an Excel pipeline upload action for
  replacing that local dataset later.
- Admins can independently require final quote-release approval and approval of
  special customer commercial terms.
- Level 2 intake supports searchable customer-master selection, inline creation
  of new customers, internal enquiries, deferred KYC, active opportunity edits,
  initials-free opportunity IDs, and structured win/loss reasons.
- Level 3 user administration supports standard application roles, multiple
  roles per user, and combined role-based page access while retaining the
  existing Supabase Auth account flow.
  User management displays Standard User, Team Lead, Management, and Admin in
  a single role selector. Existing multiple assignments survive unrelated
  edits; choosing a different role replaces the application assignment while
  retaining the operational owner ID used by historical work and approval gates.
  Administrators can click Edit on an account to change its name, email, role,
  and status directly in the table, then Save or Cancel the complete row.

## Technology

- React 18 and Vite
- React Router
- Supabase Auth, pull-based database synchronization, and persistence
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
