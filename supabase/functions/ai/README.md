# `ai` — the WinTrack model proxy

Every Gemini call in the app goes through this function. The key lives here and
nowhere else: the SPA is a static bundle, so anything it holds is public.

## Deploy

```bash
supabase link --project-ref <project-ref>
supabase secrets set GEMINI_API_KEY=<key>
supabase functions deploy ai --no-verify-jwt
```

`--no-verify-jwt` matches the anon-key posture the prototype already uses
(`supabase-setup.sql`) — there is no per-user Supabase auth in this app. Tighten
this together with the storage policies when the prototype goes to real users.

## Local

```bash
supabase functions serve ai --no-verify-jwt --env-file .env.functions
```

`vite dev` does not serve functions, so run both and point
`VITE_SUPABASE_URL` at the local Supabase.

## Contract

Request: `{ task, payload, model? }` — the browser never sends a prompt. `model`
is only honoured if it matches `gemini-[\w.-]+`; anything else falls back to the
task's default.

Response: `{ ok: true, model, data }` for schema-bearing tasks, `{ ok: true,
model, text }` for prose tasks, `{ ok: false, error }` otherwise. Upstream error
bodies are logged, never returned — they can echo the credential.

| task | model | returns | used by |
|---|---|---|---|
| `health` | flash | text | Admin → Test connection |
| `lead.extract` | pro | `lead.ai` shape | Inbox — new enquiry, re-run |
| `clarification.suggest` | flash | `{rows[]}` | Workbench → Clarifications |
| `email.clarification` | flash | text | Workbench → AI: draft email |
| `email.followup` | flash | text | Workbench → AI: draft follow-up |
| `tender.extract` | pro | header/guesses/risks | Tender intake |

## Adding a task

Add an entry to `TASKS` with a `build(payload)` and, when the app needs
structured data, a `schema` in Gemini's OpenAPI subset (uppercase type names).
Then call it from the client via `runJson` / `runText` in `src/ai.js`, always
with a deterministic fallback — `runTask` returns `null` rather than throwing,
and the app must stay usable with no AI at all.
