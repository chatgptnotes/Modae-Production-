-- Remaining non-transactional slices live one-per-row here. This removes the
-- need for new writes to the legacy app_state table while keeping flexible
-- configuration JSON together as a settings value.

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);

insert into public.app_settings (key, value, updated_at, updated_by)
select key,
       case when key = 'config' then value - 'currencyRates' else value end,
       updated_at,
       'APP_STATE'
from public.app_state
where key not in ('leads', 'opportunities', 'approvals', 'proposals', 'sparesLines', 'audit', 'priceLists')
on conflict (key) do nothing;

alter table public.app_settings enable row level security;
drop policy if exists anon_read_app_settings on public.app_settings;
create policy anon_read_app_settings on public.app_settings for select to anon, authenticated using (true);
drop policy if exists anon_write_app_settings on public.app_settings;
create policy anon_write_app_settings on public.app_settings for all to anon, authenticated using (true) with check (true);
grant select, insert, update, delete on public.app_settings to anon, authenticated;
