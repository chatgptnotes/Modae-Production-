-- Raw JSON rows cannot be column-redacted by RLS. The authenticated workspace
-- gateway owns projections and action checks; direct business access is closed.
-- user_files retains owner isolation with additional configurable authorization.
begin;

create or replace function public.workspace_access_granted(p_kind text, p_permission text)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
declare profile jsonb; assignments jsonb; application_roles text[]; role_id text; policy jsonb; defaults jsonb; explicit_application boolean;
begin
  if auth.uid() is null or not public.workspace_account_active() then return false; end if;
  select u into profile from public.records r, jsonb_array_elements(case when r.entity = 'state' and r.id = 'users' then r.data else '[]'::jsonb end) u
  where r.entity = 'state' and r.id = 'users' and r.deleted_at is null
    and u->>'status' = 'Active' and u->>'deletedAt' is null and u->>'deletionPendingAt' is null
    and coalesce((u->>'accessPending')::boolean,false) = false
    and (u->>'authId' = auth.uid()::text or (nullif(u->>'authId','') is null and lower(u->>'email') = lower(auth.jwt()->>'email'))) limit 1;
  assignments := case when jsonb_typeof(profile->'roles') = 'array' then profile->'roles' else jsonb_build_array(profile->>'role') end;
  select array_agg(upper(btrim(value))) into application_roles from jsonb_array_elements_text(assignments)
    where upper(btrim(value)) in ('ADMIN','STANDARD_USER','MANAGEMENT','TEAM_LEAD');
  explicit_application := application_roles is not null;
  if application_roles is null then
    select array_agg(case upper(btrim(value)) when 'LJS' then 'ADMIN' when 'SUPER' then 'ADMIN' when 'AH' then 'MANAGEMENT'
      when 'RS' then 'STANDARD_USER' when 'PP' then 'STANDARD_USER' when 'SS' then 'STANDARD_USER' when 'PJS' then 'STANDARD_USER'
      when 'RJS' then 'STANDARD_USER' when 'SR' then 'STANDARD_USER' when 'AN' then 'STANDARD_USER' when 'TECH' then 'STANDARD_USER' end)
    into application_roles from jsonb_array_elements_text(assignments);
  end if;
  if 'ADMIN' = any(application_roles) then return true; end if;
  select data->'accessPolicy' into policy from public.settings where id = 'config' and deleted_at is null;
  defaults := '{"version":1,"roles":{"STANDARD_USER":{"pages":["mydashboard","inbox","tracker","my","new","tender","approvals","folders","proposal","proposalSent","pricelists","analytics","customers","po","aimap","launcher","voice"],"actions":["leads.create","leads.edit","opportunities.create","opportunities.edit","proposals.price","approvals.request","proposals.send","records.delete"]},"MANAGEMENT":{"pages":["mydashboard","tracker","my","approvals","analytics","customers","audit","folders","po","launcher"],"actions":["leads.create","leads.edit","opportunities.create","opportunities.edit","proposals.price","approvals.request","proposals.send","records.delete","commercial.view","approvals.decide"]}}}'::jsonb;
  if policy is null and not explicit_application then
    if assignments ? 'AH' then
      defaults := jsonb_set(defaults,'{roles,MANAGEMENT,pages}','["mydashboard","tracker","my","approvals","folders","proposal","pricelists","proposalSent","analytics","customers","audit","aimap","po","launcher"]'::jsonb);
    end if;
    if jsonb_array_length(assignments) = 1 and (assignments ? 'TECH' or assignments ? 'AN') then
      defaults := jsonb_set(defaults,'{roles,STANDARD_USER,actions}',(defaults->'roles'->'STANDARD_USER'->'actions') - 'proposals.price');
      defaults := jsonb_set(defaults,'{roles,STANDARD_USER,pages}','["mydashboard","inbox","tracker","my","proposal","proposalSent","pricelists","analytics","approvals","aimap","launcher"]'::jsonb || case when assignments ? 'AN' then '["folders"]'::jsonb else '[]'::jsonb end);
    end if;
  end if;
  policy := coalesce(policy, defaults);
  if policy->>'version' <> '1' or p_kind not in ('pages','actions') then return false; end if;
  foreach role_id in array coalesce(application_roles,'{}'::text[]) loop
    if role_id = 'TEAM_LEAD' then role_id := 'STANDARD_USER'; end if;
    if coalesce(policy->'roles'->role_id->p_kind ? p_permission,false) then return true; end if;
  end loop;
  return false;
end;
$$;
revoke all on function public.workspace_access_granted(text,text) from public, anon;
grant execute on function public.workspace_access_granted(text,text) to authenticated;

create or replace function public.guard_workspace_server_write()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  -- Check the JWT rather than current_user: SECURITY DEFINER wrappers must not
  -- accidentally turn an authenticated caller into database-owner maintenance.
  if coalesce(auth.role(),'') <> 'service_role'
    and not (coalesce(auth.role(),'') = '' and session_user in ('postgres','supabase_admin')) then
    raise exception 'Use the authorized workspace API' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.guard_workspace_server_write() from public, anon, authenticated;
do $$
declare table_name text;
begin
  foreach table_name in array array['records','leads','opportunities','approvals','proposals','spares_lines','clarifications','audit','settings','price_lists','price_list_versions'] loop
    execute format('drop policy if exists workspace_gateway_only on public.%I',table_name);
    execute format('create policy workspace_gateway_only on public.%I as restrictive for all to authenticated using (false) with check (false)',table_name);
    execute format('drop trigger if exists guard_workspace_server_write on public.%I',table_name);
    execute format('create trigger guard_workspace_server_write before insert or update or delete on public.%I for each row execute function public.guard_workspace_server_write()',table_name);
  end loop;
end $$;

create or replace function public.workspace_file_allowed(p_type text, p_write boolean)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.workspace_account_active() and case
    when p_type = 'admin-template' then not p_write or public.workspace_access_granted('pages','admin')
    when p_type = 'attachment' then public.workspace_access_granted('pages','inbox')
      and (not p_write or public.workspace_access_granted('actions','leads.edit'))
    when p_type = 'opportunity' then
      (public.workspace_access_granted('pages','folders') or public.workspace_access_granted('pages','proposal'))
      and (public.workspace_access_granted('actions','commercial.view') or public.workspace_access_granted('actions','proposals.price'))
      and (not p_write or public.workspace_access_granted('actions','opportunities.edit'))
    else false end;
$$;
revoke all on function public.workspace_file_allowed(text,boolean) from public, anon;
grant execute on function public.workspace_file_allowed(text,boolean) to authenticated;
drop policy if exists workspace_file_read on public.user_files;
create policy workspace_file_read on public.user_files as restrictive for select to authenticated
using (user_id = (select auth.uid()) and public.workspace_file_allowed(record_type,false));
drop policy if exists workspace_file_insert on public.user_files;
create policy workspace_file_insert on public.user_files as restrictive for insert to authenticated
with check (user_id = (select auth.uid()) and public.workspace_file_allowed(record_type,true));
drop policy if exists workspace_file_update on public.user_files;
create policy workspace_file_update on public.user_files as restrictive for update to authenticated
using (user_id = (select auth.uid()) and public.workspace_file_allowed(record_type,true))
with check (user_id = (select auth.uid()) and public.workspace_file_allowed(record_type,true));
drop policy if exists workspace_file_delete on public.user_files;
create policy workspace_file_delete on public.user_files as restrictive for delete to authenticated
using (user_id = (select auth.uid()) and public.workspace_file_allowed(record_type,true));

create or replace function public.save_access_policy(p_policy jsonb, p_numbering jsonb, p_rev bigint, p_reason text, p_actor_id text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare config jsonb; current_rev bigint; result jsonb; audit_id text; event jsonb;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Server configuration management required' using errcode = '42501'; end if;
  if jsonb_typeof(p_policy) <> 'object' or p_policy->>'version' <> '1' or jsonb_typeof(p_policy->'roles') <> 'object'
    or jsonb_typeof(p_numbering) <> 'object' or nullif(btrim(p_reason),'') is null or nullif(btrim(p_actor_id),'') is null or p_rev is null or p_rev < 0 then
    raise exception 'Invalid access policy payload' using errcode = '22023';
  end if;
  -- Lock serializes read/merge; save_rows additionally checks the supplied revision.
  select data, rev into config, current_rev from public.settings where id = 'config' for update;
  if coalesce(current_rev,0) <> p_rev then raise exception 'Configuration changed; reload before saving' using errcode = '40001'; end if;
  config := coalesce(config,'{}'::jsonb) || jsonb_build_object('accessPolicy',p_policy,'opportunityNumbering',p_numbering);
  result := public.save_rows('settings',jsonb_build_array(jsonb_build_object('id','config','data',config,'rev',p_rev,'by',p_actor_id)));
  if jsonb_array_length(coalesce(result->'conflicts','[]'::jsonb)) > 0 then raise exception 'Configuration changed; reload before saving' using errcode = '40001'; end if;
  audit_id := 'ACCESS-' || gen_random_uuid()::text;
  event := jsonb_build_object('id',audit_id,'action','access-policy.updated','actor',p_actor_id,'by',p_actor_id,
    'reason',btrim(p_reason),'detail',btrim(p_reason),'ref','admin','ts',now(),
    'accessPolicy',p_policy,'opportunityNumbering',p_numbering);
  perform public.save_rows('audit',jsonb_build_array(jsonb_build_object('id',audit_id,'data',event,'rev',0,'by',p_actor_id)));
  return jsonb_build_object('config',config,'rev',p_rev+1,'audit',event);
end;
$$;
revoke all on function public.save_access_policy(jsonb,jsonb,bigint,text,text) from public, anon, authenticated;
grant execute on function public.save_access_policy(jsonb,jsonb,bigint,text,text) to service_role;
commit;
