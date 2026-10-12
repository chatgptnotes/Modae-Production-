-- Shared user mutations are server-owned. Auth deletion and the profile intent
-- are separate operations; the durable intent blocks access until completion.
begin;

create or replace function public.save_user_roster(p_users jsonb, p_rev bigint, p_audit jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Server account management required' using errcode = '42501'; end if;
  if jsonb_typeof(p_users) <> 'array' or nullif(p_audit->>'id', '') is null then raise exception 'Invalid user payload'; end if;
  -- save_rows provides the optimistic roster lock. Audit and roster commit together.
  result := public.save_rows('state', jsonb_build_array(jsonb_build_object('id','users','data',p_users,'rev',p_rev,'by',p_audit->>'actor')));
  if jsonb_array_length(coalesce(result->'conflicts','[]'::jsonb)) > 0 then
    raise exception 'User roster changed' using errcode = '40001';
  end if;
  perform public.save_rows('audit', jsonb_build_array(jsonb_build_object('id',p_audit->>'id','data',p_audit,'rev',0,'by',p_audit->>'actor')));
end;
$$;
revoke all on function public.save_user_roster(jsonb,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.save_user_roster(jsonb,bigint,jsonb) to service_role;

create or replace function public.guard_user_roster()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare touches_roster boolean := false;
begin
  if tg_op <> 'INSERT' then touches_roster := old.entity = 'state' and old.id = 'users'; end if;
  if tg_op <> 'DELETE' then touches_roster := touches_roster or (new.entity = 'state' and new.id = 'users'); end if;
  if touches_roster
     and coalesce(auth.role(), '') <> 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Use server account management; browser roster snapshots are not accepted' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists guard_user_roster on public.records;
create trigger guard_user_roster before insert or update or delete on public.records
for each row execute function public.guard_user_roster();

-- A deleted/banned Auth user's existing JWT must not retain database access.
-- SECURITY DEFINER avoids recursion through records RLS; returns only a boolean.
create or replace function public.workspace_account_active()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.records r, jsonb_array_elements(case when r.entity = 'state' and r.id = 'users' then r.data else '[]'::jsonb end) u
    where r.entity = 'state' and r.id = 'users' and r.deleted_at is null
      and u->>'status' = 'Active' and u->>'deletedAt' is null
      and u->>'deletionPendingAt' is null and coalesce((u->>'accessPending')::boolean, false) = false
      and (u->>'authId' = auth.uid()::text or
        (nullif(u->>'authId','') is null and lower(u->>'email') = lower(auth.jwt()->>'email')))
  );
$$;
revoke all on function public.workspace_account_active() from public, anon;
grant execute on function public.workspace_account_active() to authenticated;
do $$
declare table_name text;
begin
  foreach table_name in array array['records','leads','opportunities','approvals','user_files','proposals','spares_lines','clarifications','audit','settings','price_lists','price_list_versions'] loop
    execute format('drop policy if exists deny_anonymous_workspace on public.%I',table_name);
    execute format('create policy deny_anonymous_workspace on public.%I as restrictive for all to anon using (false) with check (false)',table_name);
    execute format('drop policy if exists active_workspace_account on public.%I',table_name);
    execute format('create policy active_workspace_account on public.%I as restrictive for all to authenticated using ((select public.workspace_account_active())) with check ((select public.workspace_account_active()))',table_name);
  end loop;
end $$;
commit;
