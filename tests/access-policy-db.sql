\set ON_ERROR_STOP on
begin;
insert into auth.users(id) values ('11111111-1111-1111-1111-111111111111'),('22222222-2222-2222-2222-222222222222');
insert into public.records(entity,id,data) values ('state','users','[{"authId":"11111111-1111-1111-1111-111111111111","role":"LJS","roles":["STANDARD_USER"],"status":"Active"},{"authId":"22222222-2222-2222-2222-222222222222","role":"RS","roles":["ADMIN"],"status":"Active"}]');
insert into public.leads(id,data) values ('L-TEST','{"secret":"commercial"}');
insert into public.settings(id,data) values ('config','{"unrelated":"preserve"}');
create function public.access_test_definer() returns void language plpgsql security definer as $$ begin insert into public.leads(id,data) values ('L-BYPASS','{}'); end $$;
grant execute on function public.access_test_definer() to authenticated;
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"11111111-1111-1111-1111-111111111111"}';
do $$ begin
  if not public.workspace_access_granted('actions','proposals.price') then raise exception 'Owner pricing lost'; end if;
  if public.workspace_access_granted('actions','commercial.view') then raise exception 'Operational LJS restored admin'; end if;
  if exists(select 1 from public.leads) then raise exception 'Raw business data readable'; end if;
  begin perform public.save_rows('leads','[{"id":"L-BLOCKED","data":{},"rev":0}]'); raise exception 'Direct write accepted'; exception when insufficient_privilege then null; end;
  begin perform public.access_test_definer(); raise exception 'Definer bypass accepted'; exception when insufficient_privilege then null; end;
  begin perform public.save_access_policy('{}','{}',1,'reason','actor'); raise exception 'Browser policy save accepted'; exception when insufficient_privilege then null; end;
  insert into public.user_files(user_id,record_type,record_id,file_name,file_size,file_data)
    values(auth.uid(),'attachment','L-TEST','test',1,'\x00');
  begin insert into public.user_files(user_id,record_type,record_id,file_name,file_size,file_data)
    values(auth.uid(),'admin-template','L-TEST','bad',1,'\x00'); raise exception 'Nonadmin template write accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local request.jwt.claims = '';
update public.settings set data = data || '{"accessPolicy":{"version":1,"roles":{"STANDARD_USER":{"pages":[],"actions":[]},"MANAGEMENT":{"pages":[],"actions":[]}}}}';
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"11111111-1111-1111-1111-111111111111"}';
do $$ begin
  if public.workspace_access_granted('actions','proposals.price') then raise exception 'Revoked pricing restored'; end if;
  if exists(select 1 from public.user_files) then raise exception 'Revoked files readable'; end if;
  begin insert into public.user_files(user_id,record_type,record_id,file_name,file_size,file_data)
    values(auth.uid(),'attachment','L-TEST','revoked',1,'\x00'); raise exception 'Revoked lead file write accepted'; exception when insufficient_privilege then null; end;
end $$;
set local request.jwt.claims = '{"role":"authenticated","sub":"22222222-2222-2222-2222-222222222222"}';
do $$ begin
  if not public.workspace_access_granted('actions','proposals.price') then raise exception 'Admin locked out'; end if;
  if exists(select 1 from public.user_files) then raise exception 'Other owner files readable'; end if;
  begin perform public.save_rows('settings','[{"id":"config","data":{},"rev":1}]'); raise exception 'Direct admin config write accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local request.jwt.claims = '{"role":"service_role"}';
do $$ declare result jsonb; begin
  result := public.save_access_policy('{"version":1,"roles":{"STANDARD_USER":{"pages":[],"actions":[]},"MANAGEMENT":{"pages":[],"actions":[]}}}','{"mode":"monthly"}',1,'reviewed reason','ADMIN');
  if result->'config'->>'unrelated' <> 'preserve' or (result->>'rev')::integer <> 2 then raise exception 'Config merge/revision broken'; end if;
  if not exists(select 1 from public.audit where data->>'reason' = 'reviewed reason') then raise exception 'Audit missing'; end if;
  begin perform public.save_access_policy('{"version":1,"roles":{}}','{}',1,'stale','ADMIN'); raise exception 'Stale revision accepted'; exception when serialization_failure then null; end;
  if exists(select 1 from public.audit where data->>'reason' = 'stale') then raise exception 'Stale save audit leaked'; end if;
end $$;
set local request.jwt.claims = '';
update public.records set data = jsonb_set(data,'{0,status}','"Inactive"') where entity='state' and id='users';
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"11111111-1111-1111-1111-111111111111"}';
do $$ begin if public.workspace_access_granted('pages','inbox') or public.workspace_file_allowed('admin-template',false) then raise exception 'Inactive account access retained'; end if; end $$;
rollback;
