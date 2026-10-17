-- Full backups contain only contract tables. These RPCs are service-only;
-- the API authenticates an active Admin and verifies the signed archive.
create or replace function public.guard_backup_restore_receipt()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if (new.id like 'BACKUP-RESTORE:%' or new.data->>'id' like 'BACKUP-RESTORE:%' or new.data->>'kind'='backup_restore_command'
    or (tg_op='UPDATE' and (old.id like 'BACKUP-RESTORE:%' or old.data->>'kind'='backup_restore_command')))
    and current_setting('wintrack.backup_restore',true) is distinct from 'on' then
    raise exception 'Backup restore receipts are server-owned' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function public.guard_backup_restore_receipt() from public, anon, authenticated;
drop trigger if exists backup_restore_receipt_guard on public.audit;
create trigger backup_restore_receipt_guard before insert or update on public.audit
for each row execute function public.guard_backup_restore_receipt();

create or replace function public.workspace_backup_snapshot()
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare output jsonb := '{}'::jsonb; t text; rows jsonb;
begin
  lock table public.approvals, public.audit, public.clarifications, public.leads,
    public.opportunities, public.price_list_versions, public.price_lists,
    public.proposals, public.records, public.settings, public.spares_lines, public.user_files in share mode;
  foreach t in array array['approvals','audit','clarifications','leads','opportunities','price_list_versions','price_lists','proposals','records','settings','spares_lines','user_files'] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(r) order by r.id),''[]''::jsonb) from public.%I r', t) into rows;
    output := output || jsonb_build_object(t,rows);
  end loop;
  return output;
end $$;
revoke all on function public.workspace_backup_snapshot() from public, anon, authenticated;
grant execute on function public.workspace_backup_snapshot() to service_role;

create or replace function public.restore_workspace_backup(p_generation bigint, p_database jsonb, p_files jsonb, p_actor uuid, p_digest text, p_expected_snapshot jsonb)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare t text; row jsonb; rows jsonb; result jsonb; current_rev bigint; current_data jsonb;
  generation bigint; entity_name text; rid text; incoming jsonb; restored integer:=0; audit_id text; restored_files jsonb := '[]'::jsonb;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Service restore required' using errcode='42501'; end if;
  if jsonb_typeof(p_database) <> 'object' or jsonb_typeof(p_files) <> 'array' or p_actor is null or p_digest !~ '^[a-f0-9]{64}$' then raise exception 'Invalid backup payload' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(721051021);
  lock table public.approvals, public.audit, public.clarifications, public.leads,
    public.opportunities, public.price_list_versions, public.price_lists,
    public.proposals, public.records, public.settings, public.spares_lines, public.user_files in share row exclusive mode;
  select coalesce((data->>'value')::bigint,0) into generation from public.records where entity='state' and id='workspace_generation';
  if coalesce(generation,0) is distinct from p_generation then raise exception 'Workspace changed after restore preview' using errcode='40001'; end if;
  if public.workspace_backup_snapshot() is distinct from p_expected_snapshot then raise exception 'Workspace changed after restore preview' using errcode='40001'; end if;
  if exists(select 1 from public.opportunities where deleted_at is null) or exists(select 1 from public.leads where deleted_at is null)
    or exists(select 1 from public.approvals where deleted_at is null) or exists(select 1 from public.proposals where deleted_at is null)
    or exists(select 1 from public.spares_lines where deleted_at is null) or exists(select 1 from public.clarifications where deleted_at is null)
    or exists(select 1 from public.user_files)
    or exists(select 1 from public.records where entity='state' and id in ('customers','leadArchive','vendorQuotes','svcEstimates','surveys','communications','files','kyc','poCompare','handover','bSteps') and deleted_at is null and data not in ('[]'::jsonb,'{}'::jsonb,'null'::jsonb))
    or exists(select 1 from public.records where entity='state' and id='sales' and deleted_at is null and coalesce(data->'orders','[]'::jsonb) not in ('[]'::jsonb,'{}'::jsonb,'null'::jsonb)) then
    raise exception 'Restore requires an empty business workspace' using errcode='22023';
  end if;
  -- Only verified, same-workspace archives reach these guarded namespaces.
  perform set_config('wintrack.approval_command','on',true);
  perform set_config('wintrack.lead_conversion','on',true);
  perform set_config('wintrack.backup_restore','on',true);
  foreach t in array array['leads','opportunities','proposals','spares_lines','clarifications','approvals','price_lists','price_list_versions','settings','records','audit'] loop
    rows := coalesce(p_database->t,'[]'::jsonb);
    if jsonb_typeof(rows) <> 'array' then raise exception 'Invalid backup collection' using errcode='22023'; end if;
    for row in select value from jsonb_array_elements(rows) loop
      rid := row->>'id'; entity_name := case when t='records' then row->>'entity' else t end; incoming := row->'data';
      if nullif(rid,'') is null or incoming is null then raise exception 'Invalid backup row' using errcode='22023'; end if;
      -- Lifecycle, internal revisions and ephemeral presence are never restored.
      if t='records' and (entity_name='approval_scope' or (entity_name='state' and rid in ('users','workspace_generation'))) then continue; end if;
      if t='records' then select rev,data into current_rev,current_data from public.records where entity=entity_name and id=rid;
      else execute format('select rev,data from public.%I where id=$1',t) into current_rev,current_data using rid; end if;
      if t='audit' and current_rev is not null then
        if current_data is distinct from incoming then raise exception 'Backup conflicts with retained audit history' using errcode='40001'; end if;
        continue;
      end if;
      if t='settings' and rid like 'opportunity_reserved_%' and current_rev is not null then continue; end if;
      if t='settings' and (rid like 'opportunity_counter_%' or rid like 'opportunity_sequence_%') then
        incoming := incoming || jsonb_build_object('next',greatest(coalesce((incoming->>'next')::bigint,0),coalesce((current_data->>'next')::bigint,0)));
      end if;
      result := public.save_rows(entity_name,jsonb_build_array(jsonb_build_object('id',rid,'data',incoming,'rev',coalesce(current_rev,0),'deleted',row->>'deleted_at' is not null,'by',p_actor::text)));
      if jsonb_array_length(result->'conflicts')<>0 or jsonb_array_length(result->'accepted')<>1 then raise exception 'Restore revision conflict' using errcode='40001'; end if;
      restored := restored+1;
    end loop;
  end loop;
  -- Bytes are staged in the authenticated request and inserted in this same DB
  -- transaction; there is no partially committed external storage stage.
  for row in select value from jsonb_array_elements(p_files) loop
    insert into public.user_files(id,user_id,record_type,record_id,folder,file_name,file_type,file_size,file_data,is_demo,created_at,updated_at)
    values ((row->>'id')::uuid,case when exists(select 1 from auth.users where id=(row->>'user_id')::uuid) then (row->>'user_id')::uuid else p_actor end,
      row->>'record_type',row->>'record_id',coalesce(row->>'folder',''),row->>'file_name',coalesce(row->>'file_type','application/octet-stream'),
      (row->>'file_size')::bigint,decode(row->>'hex','hex'),false,coalesce((row->>'created_at')::timestamptz,now()),now());
    restored_files := restored_files || jsonb_build_array(jsonb_build_object('id',row->>'id','recordType',row->>'record_type','recordId',row->>'record_id','folder',coalesce(row->>'folder',''),'name',row->>'file_name'));
  end loop;
  insert into public.settings(id,data) select 'opportunity_reserved_'||id,jsonb_build_object('id',id,'source','full-backup') from public.opportunities on conflict(id) do nothing;
  insert into public.records(entity,id,data,rev) values('state','workspace_generation',jsonb_build_object('value',coalesce(generation,0)+1),1)
    on conflict(entity,id) do update set data=excluded.data,rev=public.records.rev+1,updated_at=now();
  audit_id := 'BACKUP-RESTORE:'||gen_random_uuid()::text;
  perform public.save_rows('audit',jsonb_build_array(jsonb_build_object('id',audit_id,'rev',0,'by',p_actor::text,'data',jsonb_build_object('id',audit_id,'kind','backup_restore_command','action','Full backup restored','actor',p_actor,'ts',now(),'digest',p_digest,'restoredRows',restored,'restoredFiles',restored_files))));
  return jsonb_build_object('ok',true,'restoredRows',restored,'generation',coalesce(generation,0)+1);
end $$;
revoke all on function public.restore_workspace_backup(bigint,jsonb,jsonb,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.restore_workspace_backup(bigint,jsonb,jsonb,uuid,text,jsonb) to service_role;
