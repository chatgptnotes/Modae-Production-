-- Reservations are service-only and retain a permanent ledger in settings.
-- The authoritative configuration and IST period are read inside the transaction.
drop function if exists public.reserve_opportunity_number();
create or replace function public.reserve_opportunity_number(p_actor_id text)
returns text language plpgsql security invoker set search_path = public
as $$
declare
  c jsonb;
  prefix text;
  fmt text;
  sep text;
  width integer;
  reset_mode text;
  local_now timestamp := timezone('Asia/Kolkata', statement_timestamp());
  date_part text;
  stem text;
  period text;
  counter_id text;
  sequence_value bigint;
  imported_max bigint;
  candidate text;
  inserted_count integer;
begin
  if nullif(btrim(p_actor_id), '') is null then
    raise exception 'Authenticated reservation actor is required' using errcode = '22023';
  end if;
  -- Serializes all formats, including settings changes that converge on the same ID.
  perform pg_advisory_xact_lock(721051021);
  select data->'opportunityNumbering' into c from public.settings where id = 'config' and deleted_at is null for share;
  c := '{"version":1,"prefix":"","dateFormat":"YYMM","separator":"","sequenceWidth":3,"reset":"monthly"}'::jsonb || coalesce(c, '{}'::jsonb);
  prefix := c->>'prefix'; fmt := c->>'dateFormat'; sep := c->>'separator'; reset_mode := c->>'reset';
  if jsonb_typeof(c) <> 'object' or c->'version' is distinct from '1'::jsonb or prefix is null or prefix !~ '^[A-Z0-9]{0,12}$'
    or jsonb_typeof(c->'prefix') is distinct from 'string'
    or fmt is null or fmt not in ('YYMM','YYYYMM','YYYY','none') or sep is null or sep not in ('','-')
    or reset_mode is null or reset_mode not in ('monthly','yearly','continuous')
    or jsonb_typeof(c->'sequenceWidth') is distinct from 'number' or (c->>'sequenceWidth') !~ '^[3-8]$'
    or (reset_mode = 'monthly' and fmt not in ('YYMM','YYYYMM')) or (reset_mode = 'yearly' and fmt = 'none') then
    raise exception 'Invalid opportunity numbering settings' using errcode = '22023';
  end if;
  width := (c->>'sequenceWidth')::integer;
  date_part := case when fmt = 'none' then '' else to_char(local_now, fmt) end;
  stem := concat_ws(sep, nullif(prefix, ''), nullif(date_part, ''));
  if stem <> '' then stem := stem || sep; end if;
  period := case reset_mode when 'monthly' then to_char(local_now, 'YYYYMM') when 'yearly' then to_char(local_now, 'YYYY') else 'all' end;
  counter_id := 'opportunity_counter_' || reset_mode || '_' || period;
  -- Full numeric suffix, including sequences beyond the configured minimum width.
  select coalesce(max(substring(substring(id from length(stem)+1) from '^[0-9]+')::bigint), 0)
    into imported_max from public.opportunities
    where left(id, length(stem)) = stem and substring(id from length(stem)+1) ~ '^[0-9]+(-?[A-Z]+)?$';
  select greatest(coalesce((data->>'next')::bigint,0), imported_max) into sequence_value from public.settings where id = counter_id;
  sequence_value := coalesce(sequence_value, imported_max);
  -- Preserve numbers reserved by migration 015 even when their opportunity was never saved.
  if prefix = '' and sep = '' and fmt = 'YYMM' then
    select greatest(sequence_value, coalesce((select (data->>'next')::bigint from public.settings where id = 'opportunity_sequence_' || to_char(local_now,'YYMM')),0)) into sequence_value;
  end if;
  loop
    sequence_value := sequence_value + 1;
    candidate := stem || case when length(sequence_value::text) < width then lpad(sequence_value::text, width, '0') else sequence_value::text end;
    if exists(select 1 from public.opportunities where id = candidate) then continue; end if;
    insert into public.settings(id,data) values ('opportunity_reserved_' || candidate, jsonb_build_object('id',candidate,'actor',p_actor_id)) on conflict(id) do nothing;
    get diagnostics inserted_count = row_count;
    exit when inserted_count = 1;
  end loop;
  insert into public.settings(id,data) values(counter_id,jsonb_build_object('next',sequence_value))
  on conflict(id) do update set data=excluded.data, rev=public.settings.rev+1, updated_at=now();
  return candidate;
end;
$$;
revoke all on function public.reserve_opportunity_number(text) from public, anon, authenticated;
grant execute on function public.reserve_opportunity_number(text) to service_role;
revoke all on function public.next_opportunity_sequence(text) from public, anon, authenticated;
