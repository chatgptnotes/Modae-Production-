# Deploying WinTrack on Railway

WinTrack runs as one Railway service: Express serves the built React
application and its same-origin `/api/*` endpoints.

## Railway service setup

1. Create a Railway project with a staging environment.
2. Connect the repository and deploy the `staging` branch.
3. Keep the service configuration from `railway.json`:
   - Build command: `npm run build`
   - Start command: `npm start`
   - Health check: `/healthz`
   - Restart policy: `ALWAYS`
4. Generate a Railway domain for staging.
5. Keep the service at one replica. The live-event hub is intentionally in memory.

Use separate Railway staging and production environments, each with its own
Supabase project. They must not share a Supabase project: staging work must
never be able to alter customer production records.

Railway should provide `RAILWAY_GIT_COMMIT_SHA`, `GIT_COMMIT_SHA`, or a manually
configured deployment identifier so the client can invalidate browser sessions
after a deployment. The application also accepts the legacy
`SUPERBEES_GIT_COMMIT_SHA` and `VERCEL_GIT_COMMIT_SHA` names.

## Environment variables

Set these in the Railway staging service variables; never commit
their real values:

```text
NODE_ENV=production
PORT=<provided by Railway>
CORS_ORIGINS=https://<railway-generated-domain>
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_ANON_KEY=...
GEMINI_API_KEY=...
AI_RATE_LIMIT=120
GEONAMES_USERNAME=...
GMAIL_ACCOUNT=...
GMAIL_APP_PASSWORD=...
RAILWAY_GIT_COMMIT_SHA=...
```

Railway serves the React bundle and the Express `/api/*` routes, including
`/api/ai`. Set `CORS_ORIGINS` to the generated Railway domain shown in the
service settings. The Gemini key and `AI_RATE_LIMIT` belong only to Railway;
never add them as `VITE_` variables.

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_ANON_KEY` are
required in production. The two Gmail variables are optional as a pair: omit
both to disable server-side proposal email, or configure both together.
`CORS_ORIGINS` is a comma-separated list of explicitly permitted browser
origins. The service binds to `0.0.0.0` and uses the platform-provided port.

The `VITE_` values are public browser configuration. The service role, Gemini,
GeoNames, and Gmail credentials must remain server-only. The server validates
required production configuration before it starts.

## New staging Supabase project

Create a separate Supabase project for staging. Before connecting Railway to it,
run the SQL files in this order from the Supabase SQL Editor:

1. `supabase/000_fresh_project.sql`
2. `supabase/007_live_workspace_sync.sql` through `supabase/017_complete_bnk_catalogue.sql`, in numeric order

This includes the Railway security contract, user presence, atomic opportunity
sequences, workspace generation protection, and the complete B&K catalogue.
Then copy the new project's URL and keys into the Railway staging environment.
Rebuild after changing either `VITE_SUPABASE_*` value,
because Vite places those public values in the browser build.

### Staging data copy

The staging database is a sanitized clone of the real workspace:

- Copy all price-list and catalogue rows exactly, including current versions and prices.
- Copy only representative workflow data for leads, opportunities, approvals, and proposals.
- Replace customer names, email addresses, phone numbers, physical addresses, and other personal data.
- Map copied ownership to dedicated staging users; do not copy production `auth.users`.
- Do not copy service keys, AI secrets, SMTP credentials, SharePoint credentials, or production files.
- Keep staging Storage empty unless separately approved sanitized files are uploaded.

Take a production backup before preparing the clone. Treat the export as sensitive
until sanitization is complete, and verify the staging project URL before any
import or destructive cleanup.

Keep this service at **one replica**. Its live-event hub is deliberately in
memory. If the service is later scaled to multiple replicas, add shared pub/sub
before increasing replicas so every browser receives every notification.

## Staging acceptance checks

- Run `npm test` and `npm run build` locally.
- Confirm `GET /healthz` returns `{ "ok": true }` on the Railway domain.
- Test login, AI extraction, location search, proposal email, user management,
  workspace purge, and a refreshed deep link.
- In two signed-in browsers, create an approval, lead, and opportunity in one;
  the relevant list should update in the other without reloading the page.
- Confirm a new deployment signs an active browser session out and clears its
  local working cache as intended.
- With two signed-in browsers, confirm the admin dashboard shows both users
  online and removes a user after the two-minute heartbeat window expires.

Before production promotion, repeat the checks against the production Railway
environment with its separate Supabase project and credentials.
