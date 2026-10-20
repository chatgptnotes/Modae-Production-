# Local Supabase workbook data

The application does not load a hardcoded customer workbook on startup.
Admins can use Opportunities → More → Upload Excel to review and merge records
into the active workspace. Database-backed imports require migration 019 and
commit atomically after review. To explicitly populate local Supabase, use
the local Supabase CLI and Docker:

```bash
npm run local:supabase -- "/Users/ruby/Downloads/Modae production/Betser Sales Pipeline Usage.xlsx"
set -a
source .local/local-supabase.env
set +a
npm run dev
```

Validate the workbook parser without starting Docker or changing a database:

```bash
npm run local:supabase -- "/Users/ruby/Downloads/Modae production/Betser Sales Pipeline Usage.xlsx" --dry-run
```

To generate the ignored SQL without starting Supabase:

```bash
npm run local:supabase -- "/Users/ruby/Downloads/Modae production/Betser Sales Pipeline Usage.xlsx" --generate-only
```

The bootstrap command applies its local workspace migrations, reads the workbook at
runtime, imports all 73 opportunities (9 open and 64 closed across both sheets),
derives 64 customers, and creates application profiles only when none exist.
The Customers sheet supplies classification guidance, not customer records.
It writes only ignored
files under `.local/`:

- `.local/local-excel-seed.sql`
- `.local/local-supabase.env`

Running it again merges missing records while preserving edits and opportunity
tombstones. It never connects to
the production Supabase project unless the local CLI configuration is changed
manually.

## Test AI extraction without local Supabase

For local demo leads, local Supabase and Docker are not required. Keep
`GEMINI_API_KEY` in the ignored `.env.local`, restart the app with `npm run dev`,
and run extraction while signed into the local demo account. The development
client marks unauthenticated AI requests; the server accepts that marker only
for HTTP localhost/loopback requests outside production. The Gemini key stays
server-side. This does not authenticate workspace APIs or change where demo
Store data is saved.

## Test authenticated workspace features

Local Auth users are separate from application profiles. To test features that
need a Supabase session, such as shared workspace reads and writes:

1. Open local Supabase Studio at `http://127.0.0.1:54323` and create an Auth
   user with email `LJ.Swaminathan@mod-ae.com` (or another email in the seeded
   active roster). Choose a local-only password and confirm the user if asked.
2. Load `.local/local-supabase.env` in the same terminal before running
   `npm run dev`; this configures both Vite and the server for local Supabase.
   The server also loads `.env.local`, where `GEMINI_API_KEY` should remain
   server-only.
3. Sign out of any local demo session, sign in through the app using that Auth
   user, and verify the header shows the authenticated account. Then re-run
   extraction on a lead.

Local demo sign-in does not create a Supabase session and cannot access shared
workspace APIs. Its development-only AI access is limited to the localhost AI
proxy described above. Do not use production credentials or commit local
passwords and keys.
