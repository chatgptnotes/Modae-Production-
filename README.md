# WinTrack ModAE

WinTrack ModAE is a React application for managing ModAE sales work from the
first enquiry through opportunity registration, proposal preparation, approvals,
submission, and follow-up.

## What the application does

- Provides a phone workspace with bottom navigation, a searchable More menu,
  record cards, local search and expandable data tables. Opportunity cards
  offer an “Edit in table” alternative for spreadsheet work. More includes
  documents, proposals and administration according to the user's permissions.

- Captures and reviews incoming leads.
- Extracts enquiry details using AI when configured, with deterministic fallbacks.
- Registers qualified leads as opportunities.
- Fits every key opportunity column in one full-width table without horizontal
  scrolling, including at browser zoom; the full 31-column table scrolls
  horizontally. Clicking a column name opens its menu.
  The Lead inbox keeps its preview beside a horizontally scrollable lead list;
  wider rows give each inbox column more room to show its contents.
- Tracks project, spares, and services opportunities.
- Builds proposals, pricing, terms, and supporting documents.
- Routes technical, commercial, and release approvals.
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
  filters, and sorting. Price Lists shows all matching rows without pagination.
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
- Provides an Excel pipeline upload preview; pipeline migration is a later step
  and previewed rows are not saved.
- Admins can independently require final quote-release approval and approval of
  special customer commercial terms.
- Level 2 intake supports searchable customer-master selection, inline creation
  of new customers, internal enquiries, deferred KYC, active opportunity edits,
  initials-free opportunity IDs, and structured win/loss reasons.
- Level 3 user administration supports standard application roles, multiple
  roles per user, and combined role-based page access while retaining the
  existing Supabase Auth account flow.

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
without Supabase. In that mode it uses the local demo state and does not write
to a database. A configured Supabase environment enables authentication and
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
npm test          # Run the automated test suite
npm run build     # Create a production build
npm run preview   # Preview the production build locally
```

Before production promotion, also walk the manual checklist in
[tests/MANUAL_SMOKE_CHECKLIST.md](./tests/MANUAL_SMOKE_CHECKLIST.md).

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
