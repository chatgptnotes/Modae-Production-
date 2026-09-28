# Deploying WinTrack on SuperBees

WinTrack runs as one SuperBees service: Express serves the built React
application and its same-origin `/api/*` endpoints.

## SuperBees service setup

1. Connect the repository to a SuperBees service.
2. Set the build command to `npm run build` and the start command to `npm start`.
3. Configure `/healthz` as the service health check.
4. Configure the service's generated domain or approved custom domain.

Use separate SuperBees staging and production environments, each with its own
Supabase project. They must not share a Supabase project: staging work must
never be able to alter customer production records.

SuperBees should provide `SUPERBEES_GIT_COMMIT_SHA` or `GIT_COMMIT_SHA` so the
client can invalidate browser sessions after a deployment. The application
also accepts `VERCEL_GIT_COMMIT_SHA` for compatible hosted environments.

## Environment variables

Set these in the SuperBees environment variables configuration; never commit
their real values:

```text
NODE_ENV=production
PORT=<provided by SuperBees>
CORS_ORIGINS=https://<frontend-domain>
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_ANON_KEY=...
GEMINI_API_KEY=...
GEONAMES_USERNAME=...
GMAIL_ACCOUNT=...
GMAIL_APP_PASSWORD=...
SUPERBEES_GIT_COMMIT_SHA=...
```

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_ANON_KEY` are
required in production. The two Gmail variables are optional as a pair: omit
both to disable server-side proposal email, or configure both together.
`CORS_ORIGINS` is a comma-separated list of explicitly permitted browser
origins. The service binds to `0.0.0.0` and uses the platform-provided port.

The `VITE_` values are public browser configuration. The service role, Gemini,
GeoNames, and Gmail credentials must remain server-only. The server validates
required production configuration before it starts.

## New Supabase project

Before pointing a SuperBees environment at a new Supabase project, run the SQL
files in this order from the Supabase SQL Editor:

1. `supabase/000_fresh_project.sql`
2. `supabase/007_live_workspace_sync.sql` through `supabase/014_user_presence.sql`, in numeric order

Then copy the new project's URL and keys into the matching SuperBees staging or
production environment. Rebuild after changing either `VITE_SUPABASE_*` value,
because Vite places those public values in the browser build.

Keep this service at **one replica**. Its live-event hub is deliberately in
memory. If the service is later scaled to multiple replicas, add shared pub/sub
before increasing replicas so every browser receives every notification.

## Before production

- Run `npm test` and `npm run build` locally.
- Confirm `GET /healthz` returns `{ "ok": true }` on the SuperBees domain.
- Test login, AI extraction, location search, proposal email, user management,
  workspace purge, and a refreshed deep link.
- In two signed-in browsers, create an approval, lead, and opportunity in one;
  the relevant list should update in the other without reloading the page.
- Confirm a new deployment signs an active browser session out and clears its
  local working cache as intended.
- With two signed-in browsers, confirm the admin dashboard shows both users
  online and removes a user after the two-minute heartbeat window expires.
