-- Demo-file cleanup support. Run after 004_rules_and_user_files.sql.
-- Safe to re-run.

alter table public.user_files
  add column if not exists is_demo boolean not null default false;

create index if not exists user_files_demo_idx
  on public.user_files (user_id, is_demo)
  where is_demo = true;
