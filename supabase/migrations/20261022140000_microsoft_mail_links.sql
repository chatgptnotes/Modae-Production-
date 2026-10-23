-- Mail links are server-owned because every user may read the common mailbox,
-- while WinTrack record visibility and edit rights differ per account.
begin;

create policy server_owned_mail_links_select on public.records
  as restrictive for select to authenticated
  using (entity <> 'mail_links');

create or replace function public.guard_mail_links()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare protected boolean := false;
begin
  if tg_op <> 'INSERT' then protected := old.entity = 'mail_links'; end if;
  if tg_op <> 'DELETE' then protected := protected or new.entity = 'mail_links'; end if;
  if protected and coalesce(auth.role(), '') <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Mail links require the WinTrack server' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.guard_mail_links() from public, anon, authenticated;
create trigger mail_links_guard before insert or update or delete on public.records
for each row execute function public.guard_mail_links();

commit;
