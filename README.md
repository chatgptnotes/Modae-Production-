# WinTrack ModAE

WinTrack ModAE is a React application for managing ModAE sales work from the
first enquiry through opportunity registration, proposal preparation, approvals,
submission, and follow-up.

## What the application does

- Captures and reviews incoming leads.
- Extracts enquiry details using AI when configured, with deterministic fallbacks.
- Registers qualified leads as opportunities.
- Tracks project, spares, and services opportunities.
- Builds proposals, pricing, terms, and supporting documents.
- Routes technical, commercial, and release approvals.
- Stores opportunity files and supports SharePoint integration.
- Provides dashboards, audit history, user administration, and workflow tools.
- Admins can independently require final quote-release approval and approval of
  special customer commercial terms.

## Technology

- React 18 and Vite
- React Router
- Supabase Auth, pull-based database synchronization, and persistence
- Vercel serverless API routes
- ExcelJS, PDF.js, and XLSX utilities for proposal and document workflows

The application pulls shared state from Supabase on boot, route changes,
window focus/visibility restoration, reconnect, and explicit refresh. It does
not use Supabase Realtime or WebSockets. Supabase is authoritative for shared
data, including deletions; browser snapshots are offline working copies and
are never republished merely because they exist locally. Each new Vercel
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
api/              Vercel serverless routes
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

Staging and production are separate Vercel projects with separate Supabase
projects. Read [DEPLOYMENT.md](./DEPLOYMENT.md) before changing environment
variables, branches, or production data.

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
