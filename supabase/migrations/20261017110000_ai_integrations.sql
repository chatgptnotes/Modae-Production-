-- Only the server service role can read or replace encrypted integration data.
alter table public.ai_secrets add column if not exists rev bigint not null default 1;
revoke all on public.ai_secrets from anon, authenticated;
alter table public.ai_secrets enable row level security;

create or replace function public.guard_ai_integration_receipt()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if ((new.id like 'AI-INTEGRATIONS:%' or new.data->>'id' like 'AI-INTEGRATIONS:%' or new.data->>'kind' = 'ai_integration_command')
    or (tg_op = 'UPDATE' and (old.id like 'AI-INTEGRATIONS:%' or old.data->>'id' like 'AI-INTEGRATIONS:%' or old.data->>'kind' = 'ai_integration_command')))
    and current_setting('wintrack.ai_integration_command', true) is distinct from 'on'
    and current_setting('wintrack.backup_restore', true) is distinct from 'on' then
    raise exception 'AI integration receipt namespace is server-owned' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.guard_ai_integration_receipt() from public, anon, authenticated;
drop trigger if exists ai_integration_receipt_guard on public.audit;
create trigger ai_integration_receipt_guard before insert or update on public.audit
for each row execute function public.guard_ai_integration_receipt();

create or replace function public.save_ai_integrations(
  p_ciphertext text, p_iv text, p_rev bigint, p_actor_id uuid, p_provider text
) returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare current_rev bigint; next_rev bigint; previous_marker text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  if p_actor_id is null or p_ciphertext is null or p_iv is null or p_rev is null or p_rev < 0 or p_provider is null or length(p_ciphertext) > 1000000
    or p_provider not in ('gemini','openai','anthropic','xai','deepseek','mistral','openrouter') then
    raise exception 'Invalid integration configuration' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('workspace-ai-integrations', 0));
  select rev into current_rev from public.ai_secrets where id = 'workspace-ai-integrations' for update;
  if coalesce(current_rev, 0) <> p_rev then raise exception 'Integration revision conflict' using errcode = '40001'; end if;
  next_rev := coalesce(current_rev, 0) + 1;
  insert into public.ai_secrets(id,provider,ciphertext,iv,updated_by,updated_at,rev)
  values ('workspace-ai-integrations','multi',p_ciphertext,p_iv,p_actor_id::text,now(),next_rev)
  on conflict(id) do update set ciphertext = excluded.ciphertext, iv = excluded.iv,
    updated_by = excluded.updated_by, updated_at = excluded.updated_at, rev = excluded.rev;
  previous_marker := current_setting('wintrack.ai_integration_command', true);
  perform set_config('wintrack.ai_integration_command', 'on', true);
  insert into public.audit(id, data, updated_by)
  values ('AI-INTEGRATIONS:' || gen_random_uuid()::text,
    jsonb_build_object('kind','ai_integration_command','action','AI integrations updated','provider',p_provider,'actor',p_actor_id,'ts',now(),'rev',next_rev), p_actor_id::text);
  perform set_config('wintrack.ai_integration_command', coalesce(previous_marker, ''), true);
  return next_rev;
end $$;
revoke all on function public.save_ai_integrations(text,text,bigint,uuid,text) from public, anon, authenticated;
grant execute on function public.save_ai_integrations(text,text,bigint,uuid,text) to service_role;
