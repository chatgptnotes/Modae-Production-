-- A short-lived online indicator for application administrators. The browser
-- never queries this table directly; the protected Vercel endpoint uses the
-- service role after validating the caller's Supabase session.

create table if not exists public.user_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);

create index if not exists user_presence_last_seen_at_idx
  on public.user_presence (last_seen_at desc);

alter table public.user_presence enable row level security;
revoke all on table public.user_presence from anon, authenticated;
