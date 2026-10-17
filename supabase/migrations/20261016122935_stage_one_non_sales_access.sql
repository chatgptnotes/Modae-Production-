-- Stage 1 submit-only access and atomic lead registration. Apply after atomic approval commands.
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
  -- Submit-only access must win over stale mixed role assignments.
  if exists (select 1 from jsonb_array_elements_text(assignments) a(value) where upper(btrim(value)) = 'NON_SALES') then return false; end if;
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

-- Prevent two devices or the legacy generic save path from converting one lead twice.
create or replace function public.guard_lead_opportunity_link()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if TG_OP = 'INSERT' and nullif(NEW.data->>'sourceLeadId','') is not null
    and not exists (select 1 from public.opportunities where id=NEW.id)
    and current_setting('wintrack.lead_conversion', true) is distinct from 'on' then
    raise exception 'Use the lead conversion command to register this opportunity' using errcode = '42501';
  end if;
  if TG_OP = 'UPDATE' and coalesce(NEW.data->>'sourceLeadId','') is distinct from coalesce(OLD.data->>'sourceLeadId','') then
    raise exception 'Opportunity source lead cannot be changed' using errcode = '42501';
  end if;
  return NEW;
end;
$$;
revoke all on function public.guard_lead_opportunity_link() from public, anon, authenticated;
drop trigger if exists guard_lead_opportunity_link on public.opportunities;
create trigger guard_lead_opportunity_link before insert or update on public.opportunities
for each row execute function public.guard_lead_opportunity_link();

-- Generic writes cannot forge or replace conversion receipts.
create or replace function public.guard_lead_conversion_receipt()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if (NEW.id like 'LEAD-CONVERSION:%' or NEW.data->>'id' like 'LEAD-CONVERSION:%'
      or (TG_OP = 'UPDATE' and OLD.id like 'LEAD-CONVERSION:%'))
    and current_setting('wintrack.lead_conversion', true) is distinct from 'on' then
    raise exception 'Lead conversion receipt namespace is server-owned' using errcode='42501';
  end if;
  return NEW;
end;
$$;
revoke all on function public.guard_lead_conversion_receipt() from public, anon, authenticated;
drop trigger if exists guard_lead_conversion_receipt on public.audit;
create trigger guard_lead_conversion_receipt before insert or update on public.audit
for each row execute function public.guard_lead_conversion_receipt();

create or replace function public.convert_lead_to_opportunity(
  p_lead_id text, p_lead_rev bigint, p_opportunity jsonb, p_actor text, p_expected_generation bigint
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  lead_row public.leads%rowtype;
  opp_row public.opportunities%rowtype;
  generation bigint;
  result jsonb;
  opportunity_id text := p_opportunity->>'id';
  next_lead jsonb;
begin
  if nullif(btrim(p_actor),'') is null or nullif(btrim(p_lead_id),'') is null
    or nullif(btrim(opportunity_id),'') is null or jsonb_typeof(p_opportunity) is distinct from 'object'
    or p_lead_rev is null or p_lead_rev < 0 then
    raise exception 'Invalid lead conversion' using errcode = '22023';
  end if;
  -- Short transaction serializes conversion against reset and generic saves.
  perform set_config('lock_timeout','2s',true);
  lock table public.opportunities, public.records, public.leads, public.audit in share row exclusive mode;
  select coalesce((data->>'value')::bigint,0) into generation
    from public.records where entity='state' and id='workspace_generation';
  if coalesce(generation,0) is distinct from p_expected_generation then
    raise exception 'Workspace changed; reload before converting' using errcode='40001';
  end if;
  select * into lead_row from public.leads where id=p_lead_id and deleted_at is null for update;
  if not found then raise exception 'Lead no longer exists' using errcode='P0002'; end if;
  select * into opp_row from public.opportunities
    where deleted_at is null and (data->>'sourceLeadId'=p_lead_id or id=lead_row.data->>'oppId')
    order by id limit 1;
  if found then
    return jsonb_build_object('opportunity',jsonb_build_object('id',opp_row.id,'data',opp_row.data,'rev',opp_row.rev),
      'lead',jsonb_build_object('id',lead_row.id,'data',lead_row.data,'rev',lead_row.rev),'existing',true);
  end if;
  if lead_row.data->>'status' = 'Converted' then
    raise exception 'Converted opportunity is unavailable; review the original record' using errcode='40001';
  end if;
  if lead_row.rev is distinct from p_lead_rev or lead_row.data->>'status' is distinct from 'Qualified' then
    raise exception 'Lead changed or is not qualified; review it again' using errcode='40001';
  end if;
  if p_opportunity->>'sourceLeadId' is distinct from p_lead_id or nullif(btrim(p_opportunity->>'sellTo'),'') is null then
    raise exception 'Lead reference and sell-to customer are required' using errcode='22023';
  end if;
  if exists(select 1 from public.opportunities where id=opportunity_id) then
    raise exception 'Opportunity ID is already used' using errcode='40001';
  end if;
  perform set_config('wintrack.lead_conversion','on',true);
  result := public.save_rows('opportunities',jsonb_build_array(jsonb_build_object('id',opportunity_id,'rev',0,'data',p_opportunity,'by',p_actor)));
  if jsonb_array_length(result->'conflicts') > 0 then raise exception 'Opportunity changed' using errcode='40001'; end if;
  next_lead := lead_row.data || jsonb_build_object('status','Converted','oppId',opportunity_id,'lastUpdated',now());
  result := public.save_rows('leads',jsonb_build_array(jsonb_build_object('id',p_lead_id,'rev',lead_row.rev,'data',next_lead,'by',p_actor)));
  if jsonb_array_length(result->'conflicts') > 0 then raise exception 'Lead changed' using errcode='40001'; end if;
  result := public.save_rows('audit',jsonb_build_array(jsonb_build_object('id','LEAD-CONVERSION:'||p_lead_id,'rev',0,
    'data',jsonb_build_object('id','LEAD-CONVERSION:'||p_lead_id,'action','Lead converted','ref',p_lead_id,'actor',p_actor,'by',p_actor,'detail',opportunity_id,'ts',now()),'by',p_actor)));
  if jsonb_array_length(result->'conflicts') > 0 or not (result->'accepted' ? ('LEAD-CONVERSION:'||p_lead_id)) then
    raise exception 'Lead conversion audit receipt conflicted' using errcode='40001';
  end if;
  perform set_config('wintrack.lead_conversion','off',true);
  select * into opp_row from public.opportunities where id=opportunity_id;
  select * into lead_row from public.leads where id=p_lead_id;
  return jsonb_build_object('opportunity',jsonb_build_object('id',opp_row.id,'data',opp_row.data,'rev',opp_row.rev),
    'lead',jsonb_build_object('id',lead_row.id,'data',lead_row.data,'rev',lead_row.rev),'existing',false);
end;
$$;
revoke all on function public.convert_lead_to_opportunity(text,bigint,jsonb,text,bigint) from public, anon, authenticated;
grant execute on function public.convert_lead_to_opportunity(text,bigint,jsonb,text,bigint) to service_role;
commit;
