# Deploying WinTrack — staging and production

Two Vercel projects off one repository, per the 13 Aug review: *"we need to have
the code base for us in the staging, and on the production. And the customer will
be using the one on production, and giving us continuous feedback, while we are
developing further on the staging."*

| | Staging | Production |
|---|---|---|
| Vercel project | `wintrack-staging` | `wintrack` |
| Deploys from | `staging` branch | `main` |
| Audience | us | the client |
| Supabase project | its own | its own |

The two must not share a Supabase project. The client is entering real
opportunities in production while staging is still being changed; one shared
database would let a staging migration or a reseed destroy their data.

## One-time setup

The Vercel CLI is not installed in this repo's toolchain:

```bash
npm i -g vercel
vercel login
```

### Production

```bash
vercel link                      # choose/create the "wintrack" project
vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_ANON_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
```

Set the project's Production Branch to `main` in Vercel → Settings → Git.

### Staging

Create a second Vercel project from the same repository, set its Production
Branch to `staging`, then add the same four variables pointed at the **staging**
Supabase project.

### The AI key

`GEMINI_API_KEY` is never a `VITE_` variable — anything so prefixed is compiled
into the browser bundle. The Vercel deployment reads it from the server-side
Vercel environment and exposes only the `/api/ai` proxy to the SPA:

```text
GEMINI_API_KEY=...           # Vercel server-side variable
# The SPA calls the same-origin Vercel route; no AI URL override is required.
```

The /api/ai route requires a valid Supabase Auth session, so the server must
also have SUPABASE_SERVICE_ROLE_KEY configured. The browser sends only the
short-lived Supabase access token; it never receives the Gemini key. The route
also rejects oversized requests and applies a per-user rate limit to control
unexpected document-processing spend.

Routine tasks use `gemini-3.1-flash-lite`; complex proposal, tender, template,
and approval-evidence tasks are automatically routed to `gemini-2.5-flash`.

With no key the function returns 503 and the app falls back to its deterministic
parsers rather than erroring — fine for a preview, not for the client's build.

After adding or replacing either variable, redeploy that environment; Vercel
applies environment-variable changes only to new deployments. On the deployed
app, use **Admin → AI model configuration → Test connection**. It must report
a model and response time before lead extraction is expected to scan email
bodies or attachments.

Add a replacement GEMINI_API_KEY separately to Production and Staging/Preview
as needed. Never place it in .env.example, a VITE_ variable, source code, or
chat.

### Customer quote email

The approval decision stays inside WinTrack. After the final release approval,
the Submission panel calls the Vercel `/api/send-proposal-email` function,
which logs into Gmail directly over SMTP (no Google Cloud OAuth app) using
the mailbox address and an app password. Add these as **server-side** Vercel
variables (never `VITE_` variables):

```bash
GMAIL_ACCOUNT=...
GMAIL_APP_PASSWORD=...
```

Generate the app password from the sending Google account at
https://myaccount.google.com/apppasswords (requires 2-Step Verification).

The sender requires a customer email and a PDF selected in the Submission
panel. A successful Gmail response is then logged in the opportunity's
Supabase-backed Communications history and advances the opportunity to
`Submitted`; a failure leaves its stage unchanged.

## Day to day

```bash
git checkout staging && git merge main     # or work directly on staging
git push origin staging                    # → staging deploy
```

Promote when the client has signed off on what staging shows:

```bash
git checkout main && git merge staging && git push origin main
```

Every other branch gets a Vercel preview URL automatically. Previews inherit the
Preview environment variables — leave those unset so a preview runs on seeded
demo data and can never write to either real database.

## Before promoting to production

- `npm test` green.
- `npm run build` clean.
- `tests/MANUAL_SMOKE_CHECKLIST.md` walked at 390×844 and 1440×900.
- Demo Launcher scenarios 1, 2, 3, 5 from a clean **Reset demo data**.
- Sign in as RS and walk lead → opportunity → proposal → approval → email; the
  salesperson must see prices end to end.

## Notes

- `vercel.json` rewrites everything to `/index.html`; the app is a browser-router
  SPA, so a deep link refresh works without further config.
- `public/sw.js` is network-first for navigations, so a new deploy is picked up
  on the next load rather than being pinned by the service worker.
- State is held in `localStorage` under `wintrack-modae-v4` and mirrored to
  Supabase when configured. Bumping that key in `src/store.jsx` forces every
  browser to reseed — never bump it on production without telling the client,
  it discards what they have entered.
