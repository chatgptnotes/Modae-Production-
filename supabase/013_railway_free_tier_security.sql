-- WinTrack ModAE — Railway-first shared workspace for Supabase Free.
-- Run after 000 through 012. Railway validates employee sessions and owns the
-- shared cache; the browser must not use the anon key for business-data calls.


do $$
declare
  table_name text;
begin
  foreach table_name in array array['leads', 'opportunities', 'approvals'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists app_select_%1$s on public.%1$I', table_name);
    execute format('drop policy if exists app_insert_%1$s on public.%1$I', table_name);
    execute format('drop policy if exists app_update_%1$s on public.%1$I', table_name);
    execute format('drop policy if exists app_delete_%1$s on public.%1$I', table_name);
    execute format('create policy app_select_%1$s on public.%1$I for select to authenticated using (true)', table_name);
    execute format('create policy app_insert_%1$s on public.%1$I for insert to authenticated with check (true)', table_name);
    execute format('create policy app_update_%1$s on public.%1$I for update to authenticated using (true) with check (true)', table_name);
    execute format('create policy app_delete_%1$s on public.%1$I for delete to authenticated using (true)', table_name);
    execute format('revoke all on table public.%I from anon', table_name);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', table_name);
  end loop;
end $$;

-- These indexes support Railway cache warm-up diagnostics and future
-- incremental reads without indexing soft-deleted records.
create index if not exists leads_active_updated_idx
  on public.leads (updated_at desc) where deleted_at is null;
create index if not exists opportunities_active_updated_idx
  on public.opportunities (updated_at desc) where deleted_at is null;
create index if not exists approvals_active_updated_idx
  on public.approvals (updated_at desc) where deleted_at is null;

revoke all on function public.save_rows(text, jsonb) from anon;
revoke all on function public.save_rows(text, jsonb) from public;
grant execute on function public.save_rows(text, jsonb) to authenticated, service_role;
