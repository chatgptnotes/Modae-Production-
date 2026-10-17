# Deploying WinTrack on Railway

## Full backup setup

Apply `supabase/migrations/20261017061909_full_workspace_backups.sql` after the
individual-permissions migration and before the AI-integrations migration. Set
server-only `BACKUP_SIGNING_KEY` to a stable random secret of at least 32 characters.
Keep it outside source control and retain it so existing backup signatures remain
verifiable. Local backups need no signing secret and cannot restore shared data.

Admin → Backup & restore creates a ZIP with readable Excel, exact restore data and
original file bytes. Never edit the ZIP/workbook used for restoration. Limits:
100 MB compressed, 300 MB expanded, 10,000 entries and 10 MB per shared file.
The API has a route-specific 150 MB JSON limit to accommodate base64 transport.
Restore is limited to an empty business workspace; reviews expire in ten minutes
and are bound to the authenticated account. Any intervening workspace change
requires another review. Current accounts and credentials are retained, historical
audit evidence is merged, and numbering counters never decrease. Provider keys
must be configured separately. No live restore is part of local validation.

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
5. Keep the service at one replica; workspace caches are held in memory.

Use separate Railway staging and production environments, each with its own
Supabase project. They must not share a Supabase project: staging work must
never be able to alter customer production records.

Railway should provide `RAILWAY_GIT_COMMIT_SHA`, `GIT_COMMIT_SHA`, or a manually
configured deployment identifier so the client can invalidate browser sessions
after a deployment. The application also accepts the legacy
`SUPERBEES_GIT_COMMIT_SHA` and `VERCEL_GIT_COMMIT_SHA` names.

## Atomic approval rollout

Apply `supabase/migrations/20261013080111_atomic_approval_commands.sql` after
migration 023 in staging, then deploy the matching application. Repeat that order
for production after staging validation. Coordinate the change: the database
rejects legacy snapshot-based Accept/Reject writes as soon as the migration is
installed. Do not roll the application back to a version that writes decisions
through generic saves while these guards are installed.

Validate two simultaneous approvers, joint signatures, rejection, cancellation,
proposal/customer effects, and retry after a lost response on desktop and mobile.
See `supabase/README.md` for the disposable PostgreSQL integration runner and
connection/timeout requirements. No environment variable or Realtime subscription
is required for the command workflow.

## Optional event-driven workspace synchronization

Set server-only `WORKSPACE_SYNC_ENABLED=true` on staging to enable explicit
record saves and event-driven synchronization. It stays disabled by default.
There is no Supabase Realtime connection, polling fallback, or new migration
for this layer. Atomic approvals still require their existing migration.

After initial loading, idle screens and typing make no application requests.
Supabase Auth token renewal remains enabled. Local draft debounce and request
abort timers do not poll. Location suggestions use the local catalogue in this
mode; arbitrary locations remain editable. Presence and deployment polling were
removed in all modes. Deployment checks happen on activation; enabled workspace
checks include the deployment identifier and mutations reject old deployments.

Focus, visible restoration and reconnect coalesce into one bounded version
check. Only changed records need body reads. Save/Approve and manual refresh are
explicit network actions. A continuously focused device can display old data
until its next check or commit; expected revisions protect commits regardless.

BroadcastChannel delivers permitted committed snapshots and local editing
indicators between same-account/generation/deployment tabs without fetching.
Without it, tabs revalidate independently on activation. There are no live
cross-device typing indicators. Railway presence/admission data is process-local
and expiring; keep one replica until a shared coordinator is provided.

Version requests still perform Supabase Auth and bounded database queries.
Limits remain eight concurrent synchronization requests per process and thirty
per actor per minute. A failed check waits for the next user/lifecycle event;
there is no retry timer. Bulk revision conflicts return HTTP 409 with both
accepted results and conflicts; do not drop partial successes in clients.

Test desktop and phone Save, unsaved navigation, native Back/Forward, concurrent
approvals, partial failures, inaccessible records, deployment changes and account
switches before enabling production. Verify idle and typing network traces over
several minutes, allowing authentication renewal only. Already-open clients keep
draft protection if the server flag is switched off until logout/reload.

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
INTEGRATIONS_ENCRYPTION_KEY=...
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

## Admin AI integrations

Apply `supabase/migrations/20261017110000_ai_integrations.sql` before using
**Admin → Integrations**. It adds revisions to the existing `ai_secrets` table
and a service-only transaction that saves encrypted configuration and audit
evidence together. Browser roles cannot read keys or invoke the save function.

Configure `INTEGRATIONS_ENCRYPTION_KEY` in Railway with 32 random bytes encoded
as base64 or 64 hexadecimal characters. For example, generate a value locally
with `openssl rand -hex 32`, then put the result directly in the Railway variable.
Use a separate key in staging and production. Keep each environment's key stable
across deployments and retain it in your secret manager: changing or losing it
makes saved credentials unreadable. This key is server-only; never use a `VITE_`
prefix, add it to backups, or commit its value.

An active connected administrator can add or replace credentials for Google
Gemini, OpenAI, Anthropic Claude, xAI, DeepSeek, Mistral and OpenRouter. Select a
provider, enter its key, and refresh its model catalogue. Saving a credential
alone preserves the legacy `GEMINI_API_KEY` configuration until both the default
text model and document/image model have been activated. Each activation retests
the selected models and JSON response format; the document test sends a small
synthetic image and PDF, never customer data. Catalogue capabilities restrict the
choices. The full document selection currently supports Gemini, Claude, OpenAI
and OpenRouter models with compatible image/PDF inputs; text-only connections
remain available for the default model.

The browser receives only masked credential status, model selections and
revisions. Keys are AES-256-GCM encrypted in `ai_secrets`; active AI requests load
their provider/model from server configuration and do not trust browser model
hints. Updating a key, enabling a provider or changing an active model validates
the candidate before replacing the current configuration. Concurrent saves return
a conflict for reload. Disabling a selected provider deliberately stops its AI
tasks until re-enabled or replaced; failures never silently choose another
provider or the legacy key. Disabling alone does not probe unchanged connections,
so another provider's outage cannot block it. Authenticated AI requests consult
this server configuration even if an old browser setting selected local fallback.
Existing approval gates remain in place.

API keys, encryption keys and encrypted `ai_secrets` rows are excluded from
workspace backups. Local demo sessions cannot change server AI credentials.
Provider catalogue and adapter tests use synthetic fixtures; live verification
requires each environment's actual credentials and provider quota. Run the
disposable local PostgreSQL transaction check with:

```bash
PSQL_BIN=/Applications/Postgres.app/Contents/Versions/17/bin/psql \
node scripts/test-ai-integrations-postgres.mjs
```

The script defaults to a local server on port 55441, creates a uniquely named
test database, and removes it after checking access restrictions, revision
conflicts, concurrent saves and audit rollback. Override the local admin URL
with `AI_INTEGRATIONS_TEST_ADMIN_URL` if needed; remote database URLs are rejected.

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

Keep this service at **one replica**. Before scaling out, coordinate workspace
cache invalidation across replicas. Browser synchronization is pull-based.

## Staging acceptance checks

- Run `npm test` and `npm run build` locally.
- Confirm `GET /healthz` returns `{ "ok": true }` on the Railway domain.
- Test login, AI extraction, location search, proposal email, user management,
  workspace purge, and a refreshed deep link.
- In two signed-in browsers, create an approval, lead, and opportunity in one;
  focus the other browser or press Refresh and verify the relevant list updates.
- Confirm a new deployment signs an active browser session out and clears its
  local working cache as intended.
- Leave Approvals and Workbench idle for two minutes; confirm they do not issue
  periodic workspace reads, presence requests, or live-event reconnects.

Before production promotion, repeat the checks against the production Railway
environment with its separate Supabase project and credentials.
