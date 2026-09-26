# Deploying WinTrack on Railway

WinTrack is deployed as one Railway service: Express serves the built React
application and its same-origin `/api/*` endpoints.

## Railway service setup

1. Create a new GitHub repository from this local project, then connect that
   repository to a new Railway service.
2. Set the Railway build command to `npm run build`, the start command to
   `npm start`, and the health check path to `/healthz`.
3. Configure the service's generated Railway domain or a custom domain. A
   connected GitHub branch automatically redeploys when changes are pushed.

Use separate Railway staging and production environments, each with its own
Supabase project. They must not share a Supabase project: staging work must
never be able to alter customer production records.

Railway makes its deployment ID and Git commit SHA available to the service.
WinTrack uses those values to invalidate old browser sessions after a deploy.

## Environment variables

Set these in Railway's service Variables page; never commit their real values:

```text
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
GEMINI_API_KEY=...
GEONAMES_USERNAME=...
GMAIL_ACCOUNT=...
GMAIL_APP_PASSWORD=...
```

`SUPABASE_URL` and `VITE_SUPABASE_URL` normally name the same Supabase project.
The `VITE_` values are public browser configuration; the service role, Gemini,
GeoNames, and Gmail credentials must remain server-only. The production server
will not start if `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is missing.

The service role is used only to validate an incoming Supabase access token.
Live approval, lead, and opportunity reads run with that browser's own bearer
token, so existing Supabase RLS policies still decide what it may access.

Keep this service at **one Railway replica**. Its live-event hub is deliberately
in memory to avoid extra Supabase polling. If the service is later scaled to
multiple replicas, add a shared pub/sub service before increasing replicas so
every browser still receives every notification.

## New Supabase project

Before pointing Railway at a new Supabase project, run the SQL files in this
order from the Supabase SQL Editor:

1. `supabase/000_fresh_project.sql`
2. `supabase/007_live_workspace_sync.sql` through `supabase/013_railway_free_tier_security.sql`, in numeric order

Then copy the new project's URL, anon key, and service-role key into Railway's
Variables page. Rebuild Railway after changing either `VITE_SUPABASE_*` value,
because Vite places those two public values in the browser build.

## Before production

- Run `npm test` and `npm run build` locally.
- Confirm `GET /healthz` returns `{ "ok": true }` on the Railway domain.
- Test login, AI extraction, location search, proposal email, user management,
  workspace purge, and a refreshed deep link.
- In two signed-in browsers, create an approval, lead, and opportunity in one;
  the relevant list should update in the other without reloading the page.
- Confirm a new deployment signs an active browser session out and clears its
  local working cache as intended.

No Vercel project or Vercel environment variables are required for this
deployment model.
