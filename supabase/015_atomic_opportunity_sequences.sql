-- WinTrack ModAE — reserve opportunity numbers centrally.
-- The sequence is stored in the existing settings table so no new runtime
-- table is needed. A row-level upsert serializes concurrent devices.

create or replace function public.next_opportunity_sequence(p_yymm text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  sequence_id text := 'opportunity_sequence_' || p_yymm;
  initial_value integer;
  next_value integer;
begin
  if p_yymm is null or p_yymm !~ '^[0-9]{4}$' then
    raise exception 'invalid opportunity sequence period' using errcode = '22023';
  end if;

  select coalesce(max(nullif(substring(id from 5 for 3), '')::integer), 0) + 1
    into initial_value
    from public.opportunities
   where id like p_yymm || '%';

  insert into public.settings (id, data, rev, updated_at)
  values (sequence_id, jsonb_build_object('next', greatest(initial_value, 1)), 1, now())
  on conflict (id) do update
    set data = jsonb_build_object('next', coalesce((public.settings.data->>'next')::integer, 0) + 1),
        rev = public.settings.rev + 1,
        updated_at = now()
  returning (data->>'next')::integer into next_value;

  return next_value;
end;
$$;

grant execute on function public.next_opportunity_sequence(text) to anon, authenticated;
