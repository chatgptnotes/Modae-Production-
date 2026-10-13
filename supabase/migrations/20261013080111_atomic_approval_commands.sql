-- Apply after 023. No browser RPC access. All application tables remain allowlisted.
begin;

-- Scope revisions protect absent rows and predicate reads, not only rows updated
-- by a decision. Advisory locks also protect a scope before its first row exists.
create or replace function public.approval_row_scopes(p_table text, p_row jsonb)
returns text[] language sql immutable set search_path = '' as $$
  select array_remove(array[
    'row:' || p_table || ':' || case when p_table='records' then p_row->>'entity' || ':' else '' end || (p_row->>'id'),
    case when p_table in ('approvals','clarifications','spares_lines','leads') and nullif(p_row->'data'->>'oppId','') is not null
      then 'opp:' || (p_row->'data'->>'oppId') end,
    case when p_table='opportunities' then 'opp:' || (p_row->>'id') end,
    case when p_table in ('leads','opportunities') then 'customer:' || lower(btrim(coalesce(p_row->'data'->>'sellTo',p_row->'data'->>'customerName',''))) end
  ],null)
$$;

create or replace function public.track_approval_dependency()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare k text; scopes text[] := '{}';
begin
  if tg_table_name='records' and coalesce(to_jsonb(new)->>'entity',to_jsonb(old)->>'entity') <> 'state' then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  if tg_op <> 'INSERT' then scopes := scopes || public.approval_row_scopes(tg_table_name,to_jsonb(old)); end if;
  if tg_op <> 'DELETE' then scopes := scopes || public.approval_row_scopes(tg_table_name,to_jsonb(new)); end if;
  for k in select distinct unnest(scopes) order by 1 loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('approval-scope:'||k,0));
    insert into public.records(entity,id,data,rev,updated_at,updated_by)
      values('approval_scope',k,'{}',1,now(),'dependency-trigger')
    on conflict(entity,id) do update set rev=public.records.rev+1,updated_at=now(),deleted_at=null;
  end loop;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;

-- Prevent legacy service-backed snapshot routes from modifying decision evidence.
create or replace function public.guard_approval_command()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_setting('wintrack.approval_command',true) = 'on' then return new; end if;
  if tg_op='INSERT' then
    if coalesce(new.data->>'status','Pending') <> 'Pending'
      or coalesce(new.data->'decisions','{}'::jsonb) <> '{}'::jsonb then
      raise exception 'Use the approval command endpoint' using errcode='PT403';
    end if;
  elsif (new.data->'decisions' is distinct from old.data->'decisions')
    or (new.data->>'status' is distinct from old.data->>'status' and not (old.data->>'status'='Pending' and new.data->>'status'='Cancelled')) then
    raise exception 'Use the approval command endpoint' using errcode='PT403';
  end if;
  return new;
end $$;

create or replace function public.guard_approval_receipt()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if (new.id like 'APPROVAL-COMMAND:%' or new.data->>'kind'='approval_command')
    and current_setting('wintrack.approval_command',true) is distinct from 'on' then
    raise exception 'Receipt namespace is server-owned' using errcode='PT403';
  end if;
  return new;
end $$;
drop trigger if exists approval_receipt_guard on public.audit;
create trigger approval_receipt_guard before insert or update on public.audit
for each row execute function public.guard_approval_receipt();

-- AFTER avoids treating the candidate INSERT of an upsert as a new decision.
drop trigger if exists approval_command_guard on public.approvals;
create trigger approval_command_guard after insert or update on public.approvals
for each row execute function public.guard_approval_command();
do $$ declare t text; begin
  foreach t in array array['approvals','opportunities','leads','proposals','clarifications','spares_lines','records','settings'] loop
    execute format('drop trigger if exists approval_dependency_revision on public.%I',t);
    execute format('create trigger approval_dependency_revision after insert or update or delete on public.%I for each row execute function public.track_approval_dependency()',t);
  end loop;
end $$;

create index if not exists approval_context_opp on public.approvals ((data->>'oppId')) where deleted_at is null;
create index if not exists clarification_context_opp on public.clarifications ((data->>'oppId')) where deleted_at is null;
create index if not exists spares_context_opp on public.spares_lines ((data->>'oppId')) where deleted_at is null;
create index if not exists lead_context_opp on public.leads ((data->>'oppId')) where deleted_at is null;
create index if not exists opportunity_context_customer on public.opportunities ((lower(btrim(data->>'sellTo')))) where deleted_at is null;
create index if not exists lead_context_customer on public.leads ((lower(btrim(coalesce(data->>'sellTo',data->>'customerName',''))))) where deleted_at is null;

-- One SQL statement means one MVCC snapshot for the rows AND their guards.
create or replace function public.approval_decision_context(p_id text)
returns jsonb language sql stable security invoker set search_path = '' as $$
with a as (select * from public.approvals where id=p_id and deleted_at is null),
o as (select * from public.opportunities where id=(select data->>'oppId' from a) and deleted_at is null),
r as (
  select 'approvals'::text entity,id,data,rev from public.approvals
    where deleted_at is null and (id=p_id or data->>'oppId'=(select data->>'oppId' from a))
  union all select 'opportunities',id,data,rev from public.opportunities where deleted_at is null and
    (id=(select data->>'oppId' from a) or ((select data->>'type' from a)='Customer master change' and lower(btrim(data->>'sellTo'))=lower(btrim((select data->>'customerName' from a)))))
  union all select 'leads',id,data,rev from public.leads where deleted_at is null and
    (id=(select data->>'leadId' from a) or id=(select data->>'sourceLeadId' from o) or data->>'oppId'=(select id from o)
      or ((select data->>'type' from a)='Customer master change' and lower(btrim(coalesce(data->>'sellTo',data->>'customerName','')))=lower(btrim((select data->>'customerName' from a)))))
  union all select 'proposals',id,data,rev from public.proposals where deleted_at is null and id=(select id from o)
  union all select 'clarifications',id,data,rev from public.clarifications where deleted_at is null and data->>'oppId'=(select id from o)
  union all select 'spares_lines',id,data,rev from public.spares_lines where deleted_at is null and data->>'oppId'=(select id from o)
  union all select 'state',id,data,rev from public.records where entity='state' and deleted_at is null
    and id in ('users','workspace_generation','customers','kyc','svcEstimates','surveys','leadArchive')
  union all select 'settings',id,data,rev from public.settings where id='config' and deleted_at is null
), keys as (
  select unnest(public.approval_row_scopes(case when entity='state' then 'records' else entity end,to_jsonb(r))) k from r
  union select 'row:approvals:'||p_id
  union select 'row:settings:config'
  union select 'row:records:state:'||unnest(array['users','workspace_generation','customers','kyc','svcEstimates','surveys','leadArchive'])
  union select 'row:leads:'||(data->>'leadId') from a
  union select 'row:leads:'||(data->>'sourceLeadId') from o
  union select 'row:opportunities:'||(data->>'oppId') from a
  union select 'row:proposals:'||(data->>'oppId') from a
  union select 'opp:'||(data->>'oppId') from a
  union select 'customer:'||lower(btrim(data->>'customerName')) from a where data->>'type'='Customer master change'
)
select jsonb_build_object(
  'at',statement_timestamp(),
  'generation',(select data->>'value' from r where entity='state' and id='workspace_generation'),
  'rows',coalesce((select jsonb_agg(to_jsonb(r) order by entity,id) from r),'[]'::jsonb),
  'guards',coalesce((select jsonb_agg(jsonb_build_object('id',k,'rev',coalesce(g.rev,0)) order by k)
    from keys left join public.records g on g.entity='approval_scope' and g.id=k where k is not null),'[]'::jsonb)
)
$$;

create or replace function public.decide_approval(p_actor uuid,p_actor_email text,p_command jsonb,p_plan jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  write_scopes text[] := '{}'; write_row jsonb;
  request_id text := p_command->>'requestId'; operation_id uuid := (p_command->>'operationId')::uuid;
  expected_rev bigint := (p_command->>'expectedRev')::bigint; action text := p_command->>'action';
  receipt_id text; receipt jsonb; result jsonb; saved jsonb; generation jsonb; users jsonb; profile jsonb;
  approval public.approvals%rowtype; needed jsonb; decisions jsonb; next_data jsonb; outcome text; complete boolean;
  item jsonb; actual_rev bigint; actual_data jsonb; removed timestamptz; target text; actor_role text;
  stamp timestamptz := clock_timestamp();
begin
  if p_actor is null or operation_id is null or nullif(request_id,'') is null or expected_rev is null or expected_rev<0
    or action is null or action not in ('accept','reject') then raise exception 'INVALID_COMMAND' using errcode='PT422'; end if;
  perform pg_catalog.set_config('lock_timeout','1s',true);
  -- Current account access is required even to obtain one's own receipt.
  select data into users from public.records where entity='state' and id='users' and deleted_at is null for share;
  select value into profile from jsonb_array_elements(coalesce(users,'[]'::jsonb)) where
    (value->>'authId'=p_actor::text or value->>'id'=p_actor::text or
      (nullif(value->>'authId','') is null and nullif(p_actor_email,'') is not null and lower(value->>'email')=lower(p_actor_email)))
    and value->>'status'='Active' and value->>'deletedAt' is null and value->>'deletionPendingAt' is null
    and coalesce((value->>'accessPending')::boolean,false)=false limit 1;
  if profile is null then raise exception 'WORKSPACE_ACCESS_REVOKED' using errcode='PT403'; end if;
  actor_role := profile->>'role';
  select data into generation from public.records where entity='state' and id='workspace_generation' and deleted_at is null for share;
  if generation->>'value' is distinct from p_command->>'generation' or generation is null then
    raise exception 'WORKSPACE_GENERATION_CHANGED' using errcode='PT409'; end if;
  receipt_id := 'APPROVAL-COMMAND:'||p_actor::text||':'||operation_id::text;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(receipt_id,0));
  select data into receipt from public.audit where id=receipt_id;
  if found then
    if receipt->'command' is distinct from p_command then raise exception 'OPERATION_ID_REUSED' using errcode='PT409'; end if;
    return receipt->'result'||jsonb_build_object('replayed',true);
  end if;
  if p_plan is null then raise exception 'PLAN_REQUIRED' using errcode='PT428'; end if;
  if jsonb_typeof(p_plan->'guards') is distinct from 'array' or jsonb_typeof(p_plan->'writes') is distinct from 'array'
    or jsonb_typeof(p_plan->'reads') is distinct from 'array' then raise exception 'INVALID_PLAN' using errcode='PT422'; end if;
  -- Take exclusive locks for known write scopes before any approval row lock.
  -- Read-only scopes stay shared, so unrelated approvals do not serialize on
  -- global configuration/roster dependencies.
  select to_jsonb(a) into write_row from public.approvals a where id=request_id;
  write_scopes := public.approval_row_scopes('approvals',write_row);
  for item in select value from jsonb_array_elements(p_plan->'writes') loop
    target := item->>'entity';
    if target not in ('state','leads','opportunities','proposals') then raise exception 'INVALID_EFFECT' using errcode='PT422'; end if;
    if target='state' then
      select to_jsonb(r) into write_row from public.records r where entity='state' and id=item->>'id';
    else
      execute format('select to_jsonb(r) from public.%I r where id=$1',target) into write_row using item->>'id';
    end if;
    write_scopes := write_scopes || public.approval_row_scopes(case when target='state' then 'records' else target end,write_row)
      || public.approval_row_scopes(case when target='state' then 'records' else target end,item);
  end loop;
  -- The API is trusted to authorize the plan. These guards prove the account,
  -- policy and every business dependency are still the versions it authorized.
  for item in select value from jsonb_array_elements(p_plan->'guards') order by value->>'id' loop
    if item->>'id'=any(write_scopes) then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('approval-scope:'||(item->>'id'),0));
    else
      perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended('approval-scope:'||(item->>'id'),0));
    end if;
    select rev into actual_rev from public.records where entity='approval_scope' and id=item->>'id';
    if coalesce(actual_rev,0) is distinct from (item->>'rev')::bigint then raise exception 'DEPENDENCY_CHANGED' using errcode='PT409'; end if;
  end loop;
  select * into approval from public.approvals where id=request_id and deleted_at is null for update;
  if not found then raise exception 'APPROVAL_NOT_FOUND' using errcode='PT404'; end if;
  needed := coalesce(approval.data->'needed',jsonb_build_array(approval.data->>'approver'));
  if not coalesce(needed ? actor_role,false) then raise exception 'NOT_ASSIGNED_APPROVER' using errcode='PT403'; end if;
  if approval.rev<>expected_rev or approval.data->>'status' is distinct from 'Pending' then raise exception 'APPROVAL_CHANGED' using errcode='PT409'; end if;
  decisions := coalesce(approval.data->'decisions','{}'::jsonb);
  if decisions ? actor_role then raise exception 'ALREADY_DECIDED' using errcode='PT409'; end if;
  for item in select value from jsonb_array_elements(p_plan->'reads') order by value->>'entity',value->>'id' loop
    target := item->>'entity'; actual_rev := null;
    if target not in ('state','settings','approvals','leads','opportunities','proposals','spares_lines','clarifications') then raise exception 'INVALID_PLAN_ENTITY' using errcode='PT422'; end if;
    if target='state' then
      select rev,deleted_at into actual_rev,removed from public.records where entity='state' and id=item->>'id';
    else
      execute format('select rev,deleted_at from public.%I where id=$1',target) into actual_rev,removed using item->>'id';
    end if;
    if actual_rev is distinct from (item->>'rev')::bigint or removed is not null then raise exception 'DEPENDENCY_CHANGED' using errcode='PT409'; end if;
  end loop;
  decisions := decisions||jsonb_build_object(actor_role,jsonb_build_object('d',case when action='accept' then 'Approved' else 'Rejected' end,
    'c',p_command->>'comment','when',stamp,'actorId',p_actor,'commentReview',p_command->'commentReview'));
  if coalesce((approval.data->>'anyOf')::boolean,false) then
    select exists(select 1 from jsonb_array_elements_text(needed) n where decisions->n->>'d'='Approved') into complete;
  else
    select not exists(select 1 from jsonb_array_elements_text(needed) n where decisions->n->>'d' is distinct from 'Approved') into complete;
  end if;
  outcome := case when exists(select 1 from jsonb_each(decisions) d where d.value->>'d'='Rejected') then 'Rejected' when complete then 'Approved' else 'Pending' end;
  if outcome is distinct from p_plan->>'expectedStatus' or (outcome='Pending' and jsonb_array_length(p_plan->'writes')<>0) then raise exception 'PLAN_OUTCOME_CHANGED' using errcode='PT409'; end if;
  next_data := approval.data||jsonb_build_object('decisions',decisions,'status',outcome,'__sv',stamp,'decisionNote',p_command->>'comment');
  if outcome<>'Pending' then next_data:=next_data||jsonb_build_object('decisionTs',stamp); end if;
  if p_plan->'approvalSnapshot' is not null and p_plan->'approvalSnapshot'<>'null'::jsonb then next_data:=next_data||jsonb_build_object('approvalSnapshot',p_plan->'approvalSnapshot'); end if;
  if outcome='Rejected' then next_data:=next_data||jsonb_build_object('rejectionCommentReview',p_command->'commentReview','rejectionActions',
    case when jsonb_array_length(coalesce(p_command->'commentReview'->'requiredActions','[]'::jsonb))>0 then p_command->'commentReview'->'requiredActions' else jsonb_build_array(p_command->>'comment') end); end if;
  perform pg_catalog.set_config('wintrack.approval_command','on',true);
  saved:=public.save_rows('approvals',jsonb_build_array(jsonb_build_object('id',request_id,'data',next_data,'rev',expected_rev,'by',p_actor)));
  if jsonb_array_length(saved->'conflicts')>0 then raise exception 'APPROVAL_CHANGED' using errcode='PT409'; end if;
  for item in select value from jsonb_array_elements(p_plan->'writes') order by value->>'entity',value->>'id' loop
    target:=item->>'entity';
    if target not in ('leads','opportunities','proposals','state') or (target='state' and item->>'id'<>'customers')
      or not exists(select 1 from jsonb_array_elements(p_plan->'reads') r where r->>'entity'=target and r->>'id'=item->>'id' and r->>'rev'=item->>'rev')
      then raise exception 'INVALID_EFFECT' using errcode='PT422'; end if;
    saved:=public.save_rows(target,jsonb_build_array(jsonb_build_object('id',item->>'id','data',item->'data','rev',(item->>'rev')::bigint,'by',p_actor)));
    if jsonb_array_length(saved->'conflicts')>0 then raise exception 'EFFECT_CONFLICT' using errcode='PT409'; end if;
  end loop;
  result:=jsonb_build_object('operationId',operation_id,'requestId',request_id,'generation',p_command->>'generation','committedRev',expected_rev+1,'status',outcome,'committedAt',stamp);
  saved:=public.save_rows('audit',jsonb_build_array(jsonb_build_object('id',receipt_id,'rev',0,'by',p_actor,'data',jsonb_build_object(
    'id',receipt_id,'kind','approval_command','actorId',p_actor,'role',actor_role,'action','Approval '||lower(outcome),'objectId',request_id,'ts',stamp,'detail',p_command->>'comment','command',p_command,'result',result))));
  if jsonb_array_length(saved->'conflicts')>0 then raise exception 'RECEIPT_CONFLICT' using errcode='PT409'; end if;
  return result||jsonb_build_object('replayed',false);
end $$;

revoke all on function public.approval_row_scopes(text,jsonb), public.track_approval_dependency(), public.guard_approval_command(), public.guard_approval_receipt(), public.approval_decision_context(text), public.decide_approval(uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.approval_row_scopes(text,jsonb), public.track_approval_dependency(), public.guard_approval_command(), public.guard_approval_receipt(), public.approval_decision_context(text), public.decide_approval(uuid,text,jsonb,jsonb) to service_role;
commit;
