# Local Supabase workbook data

The localhost application loads the Betser workbook into browser storage on
first launch. To run the workbook data in a database-backed local Supabase
environment instead, use the local Supabase CLI and Docker:

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
runtime, imports 9 open and 33 old-closed opportunities, derives customer
records, and creates the five application profiles. It writes only ignored
files under `.local/`:

- `.local/local-excel-seed.sql`
- `.local/local-supabase.env`

Run the command again to reset/reseed the local database. It never connects to
the production Supabase project unless the local CLI configuration is changed
manually.

Local Auth users are separate from the application profiles. Create local
Auth users in the local Supabase Studio if sign-in testing is required; do not
commit passwords or local keys.
