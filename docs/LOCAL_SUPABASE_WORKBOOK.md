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

The bootstrap command applies the active migrations, reads the workbook at
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

Local Auth users are separate from the application profiles. Create local
Auth users in the local Supabase Studio if sign-in testing is required; do not
commit passwords or local keys.
