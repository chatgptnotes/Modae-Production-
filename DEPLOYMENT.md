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

## Before production

- Run `npm test` and `npm run build` locally.
- Confirm `GET /healthz` returns `{ "ok": true }` on the Railway domain.
- Test login, AI extraction, location search, proposal email, user management,
  workspace purge, and a refreshed deep link.
- Confirm a new deployment signs an active browser session out and clears its
  local working cache as intended.

No Vercel project or Vercel environment variables are required for this
deployment model.
