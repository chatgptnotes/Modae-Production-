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

## Optional lead address validation

Set server-only `GOOGLE_MAPS_API_KEY` separately in each Railway environment.
Enable **Address Validation API** and **Geocoding API** in its Google Cloud project,
attach billing, restrict the key to these APIs, and set usage quotas/budget alerts.
Use server IP restrictions if stable outbound IPs are configured; browser referrer
restrictions are not appropriate for these server requests. Never use `VITE_`,
commit the key, or assume the existing Gemini connection enables Maps APIs.
Free usage caps depend on API and billing-region eligibility; consult Google's
[current pricing](https://developers.google.com/maps/billing-and-pricing/pricing).

`POST /api/locations/validate` requires an active signed-in lead editor. It accepts
`{ "fields": { "eucLocation": "...", "sellToCustomerLocation": "..." } }` with
one or both nonempty fields, each at most 1,000 characters, and returns `results`
keyed by field: `status`, `standardizedAddress`, `issues`, `confidence`, `source`
and `canApply`. Calls are limited to 10 batches per account per minute and eight
active batches per process. Keep one replica or share the limits before scaling.
No address contents or keys are logged. Responses use `private, no-store`.

Local demo testing is supported only in non-production mode with an explicit
development header, loopback Host and Origin, and a loopback socket. Production
never accepts that path. Put the Maps key in ignored `.env.local` and restart
the API after changing it. When another app owns port 3000, set `PORT` to a free
port in `.env.local`; Vite forwards `/api` and `/healthz` to that port on 127.0.0.1.
Run both `npm run dev:client` and `npm run dev:server` (or `npm run dev`).

Successful AI extraction starts one advisory check for both populated fields;
matching addresses are deduplicated. The initial save never waits for Google.
Users can also press Enter or click **Check address** to check only the current
location; Shift+Enter inserts a new line. No city dropdown or AI location search
is used in these two lead fields. Typing and blur do not request validation.
Field-specific checks preserve the other location's results and pending requests.
Address Validation input over its 280-character limit uses Geocoding without
truncation. Missing coverage or absent address data also permits Geocoding;
authentication, billing, quota and network failures do not trigger extra calls.
Geocoding coordinates/partial matches never certify an address as valid.
India Address Validation coverage is currently preview; unconfirmed industrial
premises stay advisory. A missing key does not prevent server startup or leads.

Before enabling, ensure public Terms of Use and Privacy Policy cover Google Maps
requirements and sending entered addresses to Google. The UI provides Google Maps
attribution without a map. Results are transient (at most 20 lead attempts per
browser session, expiring after 30 minutes); raw provider data and coordinates
are not persisted. Only explicit user confirmation of Address Validation output
places corrected user data into a draft for normal saving. Geocoding suggestions
cannot be applied directly. See Google's [policies](https://developers.google.com/maps/documentation/address-validation/policies)
and [confirmation/storage terms](https://cloud.google.com/maps-platform/terms/maps-service-terms).

Smoke-test desktop and phone: extract an address, save/qualify while checking,
edit it before a response arrives, confirm a suggested correction, and repeat
with the key disabled or quota exhausted. Reopening or typing must not initiate
validation, and unavailable checks must never populate required-field errors.

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

## Microsoft 365 integration

Configure Supabase Auth → Azure with the existing Entra application's client ID,
secret **value**, and tenant URL. Add the Supabase `/auth/v1/callback` URL as an
Entra **Web** redirect, then add each WinTrack origin's `/auth/callback` to
Supabase Authentication → URL Configuration. Keep password sign-in available
while existing users connect Microsoft from Personal settings; confirm the same
Supabase user UUID and WinTrack role after linking. New Microsoft users without
an active WinTrack roster profile have no workspace access.

In each Railway environment, set server-only `MS_TENANT_ID`, `MS_CLIENT_ID`,
`MS_CLIENT_SECRET`, `MS_REDIRECT_URI` (that environment's exact
`https://<origin>/api/microsoft-auth/callback` Web redirect),
`MS_SHAREPOINT_SITE_ID`, `MS_SHAREPOINT_DRIVE_ID`,
`MS_SHAREPOINT_ROOT_ITEM_ID`, and `MS_SHARED_MAILBOX_UPN`. Keep staging and
production resources distinct. The server uses application Graph permissions
for the selected SharePoint site and the scoped shared mailbox; personal Outlook
uses delegated `Mail.ReadWrite` and `Mail.Send`, so users must reconnect their
personal account to grant the added draft and folder access. Grant site access
with `Sites.Selected` and restrict application `Mail.Read`, `Mail.ReadWrite` /
`Mail.Send` to the designated shared mailbox in Exchange. Test denied access to
another site and mailbox before enabling either feature for users. Graph's send
acceptance is not delivery confirmation; avoid automatic retries after a timeout.

Sales users see lead records and unrepresented shared Outlook messages together
in one date-sorted Lead Inbox list. All mail adds raw messages; the old `/mail`
address opens the combined inbox. Non-sales users retain their existing mailbox
access.
All active WinTrack users can read shared mail.
Lead/opportunity links and lead correspondence use WinTrack permissions. The
existing proposal email approval flow remains separate. Set the build-time
`VITE_MICROSOFT_GRAPH_ENABLED=true` only after the SharePoint root contains the
expected opportunity folders and document bytes; otherwise the existing file
backend remains active. Rebuild when changing that public flag. Apply
`supabase/migrations/20261022140000_microsoft_mail_links.sql` to each Supabase
project before deploying the mailbox UI; it keeps link metadata server-owned.

The unified Lead Inbox also provides Inbox, Sent, Drafts, Starred, Archive,
Spam and Trash views for the selected shared or personal mailbox. Search is
scoped to the current folder. Shared drafts are stored in the shared Outlook
mailbox for team visibility; personal drafts stay in the signed-in user's
Outlook. The composer saves only when Save as draft or Send is clicked and supports
To, Cc, Bcc and up to five 3 MB attachments. Send saves the latest contents before
sending. Message actions include read state, star,
reply, forward, archive, spam and move-to-trash; there is no permanent-delete
action in WinTrack.

In Lead Inbox, clicking Sync also imports new shared-mail messages as unassigned
Global New leads, with message text and attachments. The first click sets the
manual sync starting point and skips existing mailbox history. Later clicks
import only new messages. Without notification configuration, scanning stays
manual. Users need Lead Inbox access and lead creation permission. Application
Graph permissions must include `Mail.Read` for the configured shared mailbox.
Shared send still requires `Mail.Send`.

To enable automatic shared-mail triage, set server-only `MS_MAIL_WEBHOOK_URL`
to `https://<origin>/api/microsoft-notifications` and
`MS_MAIL_WEBHOOK_SECRET` to a random secret of at least 32 characters. Grant
Microsoft Graph application `Mail.Read` and restrict it to the configured
shared mailbox in Exchange. The Railway service creates and renews the Graph
Inbox subscription; its delta token and subscription ID are stored only in the
server-owned `records` entity `mail_links`. Notifications are validated against
the configured secret and only trigger a delta catch-up. AI-classified leads
enter Lead Inbox as unassigned New records; low-confidence results and unreadable
attachments remain visible as Needs review in Shared mail. Keep manual Sync
available as a recovery path. Configure and verify this first in staging,
including the public webhook handshake, before adding the production values.

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
