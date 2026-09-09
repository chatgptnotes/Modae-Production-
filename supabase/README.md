# Supabase SQL run order

Run these from the Supabase SQL Editor for project `rwaxprpwqyxoovihlxpe`:

1. `../supabase-setup.sql` — storage and legacy `app_state` prerequisites.
2. `../supabase-tables.sql` — row-level business-record tables and migration function.
3. `001_pricing_tables.sql` — currency rates and normalized price-list tables, plus the price-list backfill.
4. `002_business_tables.sql` — migrates business records into the existing `opportunities`, `leads`, `approvals`, and `records` tables without creating duplicate business tables.
5. `003_app_settings.sql` — moves remaining non-transactional slices into one-row-per-setting storage.

The scripts are designed to be re-run. They do not delete `app_state` data.

After running them, verify:

```sql
select * from public.currency_rates order by currency_code;
select list_code, source_currency, current_version from public.price_lists order by list_code;
select count(*) from public.price_list_parts;
select count(*) from public.leads;
select count(*) from public.opportunities;
select key from public.app_settings order by key;
```

Keep `app_state` until the application has been tested against the new tables. The
existing row-store migration can be run separately with:

```sql
select public.migrate_app_state_to_rows();
```
