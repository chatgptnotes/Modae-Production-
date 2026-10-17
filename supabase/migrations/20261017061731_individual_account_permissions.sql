-- Per-account grants extend v1 policies without changing existing role defaults.
begin;
-- Resolve before lifecycle checks: a disabled exact binding cannot fall through
-- to an active unbound profile with the same email address.
create function public.workspace_actor_profile()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare roster jsonb; candidates jsonb; profile jsonb;
begin
  if auth.uid() is null then return null; end if;
  select data into roster from public.records where entity='state' and id='users' and deleted_at is null;
  if jsonb_typeof(roster) is distinct from 'array' then return null; end if;
  select coalesce(jsonb_agg(u),'[]'::jsonb) into candidates from jsonb_array_elements(roster) u
    where u->>'authId'=auth.uid()::text or u->>'id'=auth.uid()::text;
  if jsonb_array_length(candidates)=0 then
    select coalesce(jsonb_agg(u),'[]'::jsonb) into candidates from jsonb_array_elements(roster) u
      where nullif(u->>'authId','') is null and nullif(lower(btrim(u->>'email')),'')=nullif(lower(btrim(auth.jwt()->>'email')),'');
  end if;
  if jsonb_array_length(candidates)<>1 then return null; end if;
  profile := candidates->0;
  if profile->>'status' is distinct from 'Active' or profile->>'deletedAt' is not null or profile->>'deletionPendingAt' is not null
    or coalesce((profile->>'accessPending')::boolean,false) then return null; end if;
  if (select count(*) from jsonb_array_elements(roster) u where u->>'id'=profile->>'id')<>1 then return null; end if;
  return profile;
end;
$$;
revoke all on function public.workspace_actor_profile() from public, anon, authenticated, service_role;
create or replace function public.workspace_account_active()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.workspace_actor_profile() is not null;
$$;
revoke all on function public.workspace_account_active() from public, anon;
grant execute on function public.workspace_account_active() to authenticated;

alter function public.workspace_access_granted(text,text) rename to workspace_role_access_granted;
revoke all on function public.workspace_role_access_granted(text,text) from public, anon, authenticated;

create function public.workspace_access_granted(p_kind text, p_permission text)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
declare profile jsonb; assignments jsonb; policy jsonb; defaults jsonb; choice text; role_id text; application_roles text[]; explicit_application boolean;
begin
  if auth.uid() is null or not public.workspace_account_active() or p_kind not in ('pages','actions') then return false; end if;
  profile := public.workspace_actor_profile();
  if profile is null then return false; end if;
  assignments := case when jsonb_typeof(profile->'roles')='array' then profile->'roles' else jsonb_build_array(profile->>'role') end;
  select coalesce(jsonb_agg(upper(btrim(value))),'[]'::jsonb) into assignments from jsonb_array_elements_text(assignments);
  if assignments ? 'NON_SALES' then return false; end if;
  if assignments ? 'ADMIN' then return true; end if;
  if not (assignments ?| array['STANDARD_USER','MANAGEMENT','TEAM_LEAD']) and assignments ?| array['LJS','SUPER'] then return true; end if;
  select data->'accessPolicy' into policy from public.settings where id='config' and deleted_at is null;
  if policy->>'version'='1' then choice := policy->'users'->(profile->>'id')->p_kind->>p_permission; end if;
  if choice='deny' then return false; end if;
  if choice='allow' then return true; end if;
  select array_agg(value) into application_roles from jsonb_array_elements_text(assignments)
    where value in ('ADMIN','STANDARD_USER','MANAGEMENT','TEAM_LEAD');
  explicit_application := application_roles is not null;
  if not explicit_application then
    select array_agg(case value when 'AH' then 'MANAGEMENT' when 'RS' then 'STANDARD_USER' when 'PP' then 'STANDARD_USER'
      when 'SS' then 'STANDARD_USER' when 'PJS' then 'STANDARD_USER' when 'RJS' then 'STANDARD_USER' when 'SR' then 'STANDARD_USER'
      when 'AN' then 'STANDARD_USER' when 'TECH' then 'STANDARD_USER' end) into application_roles from jsonb_array_elements_text(assignments);
  end if;
  defaults := '{"version":1,"roles":{"STANDARD_USER":{"pages":["mydashboard","inbox","tracker","my","new","tender","approvals","folders","proposal","proposalSent","pricelists","analytics","customers","po","aimap","launcher","voice"],"actions":["leads.create","leads.edit","opportunities.create","opportunities.edit","proposals.price","approvals.request","proposals.send","records.delete"]},"MANAGEMENT":{"pages":["mydashboard","tracker","my","approvals","analytics","customers","audit","folders","po","launcher"],"actions":["leads.create","leads.edit","opportunities.create","opportunities.edit","proposals.price","approvals.request","proposals.send","records.delete","commercial.view","approvals.decide"]}}}'::jsonb;
  if policy is null and not explicit_application then
    if assignments ? 'AH' then defaults := jsonb_set(defaults,'{roles,MANAGEMENT,pages}','["mydashboard","tracker","my","approvals","folders","proposal","pricelists","proposalSent","analytics","customers","audit","aimap","po","launcher"]'); end if;
    if jsonb_array_length(assignments)=1 and assignments ?| array['TECH','AN'] then
      defaults := jsonb_set(defaults,'{roles,STANDARD_USER,actions}',(defaults->'roles'->'STANDARD_USER'->'actions')-'proposals.price');
      defaults := jsonb_set(defaults,'{roles,STANDARD_USER,pages}','["mydashboard","inbox","tracker","my","proposal","proposalSent","pricelists","analytics","approvals","aimap","launcher"]'::jsonb || case when assignments ? 'AN' then '["folders"]'::jsonb else '[]'::jsonb end);
    end if;
  end if;
  policy := coalesce(policy,defaults);
  if policy->>'version' is distinct from '1' then return false; end if;
  foreach role_id in array coalesce(application_roles,'{}'::text[]) loop
    if role_id='TEAM_LEAD' then role_id := 'STANDARD_USER'; end if;
    if coalesce(policy->'roles'->role_id->p_kind ? p_permission,false) then return true; end if;
  end loop;
  return false;
end;
$$;
revoke all on function public.workspace_access_granted(text,text) from public, anon;
grant execute on function public.workspace_access_granted(text,text) to authenticated;

alter function public.save_access_policy(jsonb,jsonb,bigint,text,text) rename to save_role_access_policy;
revoke all on function public.save_role_access_policy(jsonb,jsonb,bigint,text,text) from public, anon, authenticated, service_role;
create function public.save_access_policy(p_policy jsonb,p_numbering jsonb,p_rev bigint,p_reason text,p_actor_id text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare roster jsonb; item record; collection record; permission record;
  pages text[] := array['mydashboard','inbox','tracker','my','new','tender','approvals','folders','proposal','proposalSent','pricelists','analytics','customers','audit','po','aimap','launcher','voice'];
  actions text[] := array['leads.create','leads.edit','opportunities.create','opportunities.edit','records.delete','commercial.view','proposals.price','priceLists.manage','approvals.request','approvals.decide','proposals.send'];
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Server configuration management required' using errcode='42501'; end if;
  if jsonb_typeof(p_policy) is distinct from 'object' or p_policy->>'version' is distinct from '1'
    or jsonb_typeof(p_policy->'roles') is distinct from 'object'
    or exists(select 1 from jsonb_object_keys(p_policy) k where k not in ('version','roles','users')) then
    raise exception 'Invalid policy' using errcode='22023';
  end if;
  if not (p_policy->'roles' ?& array['STANDARD_USER','MANAGEMENT']) or exists(select 1 from jsonb_object_keys(p_policy->'roles') k where k not in ('STANDARD_USER','MANAGEMENT')) then raise exception 'Invalid configurable role' using errcode='22023'; end if;
  for item in select key,value from jsonb_each(p_policy->'roles') loop
    if jsonb_typeof(item.value) is distinct from 'object' or not (item.value ?& array['pages','actions']) then raise exception 'Invalid role grants' using errcode='22023'; end if;
    for collection in select key,value from jsonb_each(item.value) loop
      if collection.key not in ('pages','actions') or jsonb_typeof(collection.value) is distinct from 'array' then raise exception 'Invalid role collection' using errcode='22023'; end if;
      if exists(select 1 from jsonb_array_elements(collection.value) x where jsonb_typeof(x)<>'string')
        or (select count(distinct x) from jsonb_array_elements_text(collection.value) x)<>jsonb_array_length(collection.value)
        or exists(select 1 from jsonb_array_elements_text(collection.value) x where not (x=any(case when collection.key='pages' then pages else actions end))) then raise exception 'Invalid role permission' using errcode='22023'; end if;
    end loop;
  end loop;
  if p_policy ? 'users' then
    if jsonb_typeof(p_policy->'users') is distinct from 'object' then raise exception 'Invalid user grants' using errcode='22023'; end if;
    -- Retain tombstones as valid identities; stale or invented account IDs fail.
    select data into roster from public.records where entity='state' and id='users' and deleted_at is null for share;
    for item in select key,value from jsonb_each(p_policy->'users') loop
      if length(item.key) not between 1 and 200 or btrim(item.key)<>item.key or item.key in ('__proto__','constructor','prototype')
        or (select count(*) from jsonb_array_elements(coalesce(roster,'[]'::jsonb)) u where u->>'id'=item.key)<>1
        or jsonb_typeof(item.value) is distinct from 'object' then raise exception 'Invalid permission account' using errcode='22023'; end if;
      for collection in select key,value from jsonb_each(item.value) loop
        if collection.key not in ('pages','actions') or jsonb_typeof(collection.value) is distinct from 'object' then raise exception 'Invalid user permission collection' using errcode='22023'; end if;
        for permission in select key,value from jsonb_each_text(collection.value) loop
          if not (permission.key=any(case when collection.key='pages' then pages else actions end)) or permission.value is null or permission.value not in ('allow','deny') then raise exception 'Invalid user permission' using errcode='22023'; end if;
        end loop;
      end loop;
    end loop;
  end if;
  -- Existing transaction owns revision checks, config merge and audit evidence.
  return public.save_role_access_policy(p_policy,p_numbering,p_rev,p_reason,p_actor_id);
end;
$$;
revoke all on function public.save_access_policy(jsonb,jsonb,bigint,text,text) from public, anon, authenticated;
grant execute on function public.save_access_policy(jsonb,jsonb,bigint,text,text) to service_role;
commit;
