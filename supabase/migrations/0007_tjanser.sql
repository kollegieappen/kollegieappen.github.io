-- KollegieAppen (KA) · Rengøringsplanen bliver til generelle tjanser
-- (rengøring, fællesspisning, skrald …). Kør hele filen én gang i SQL Editor (efter 0006).
--
-- Nyt pr. opgave:
--   emoji              – vises ved opgaven, fx 🧹 eller 🍝
--   people_per_shift   – hvor mange der har tjansen samme dag (fx 2 kokke)
--   remind_days_before – 0 = påmindelse samme dag, 1 = dagen før
-- Tabellerne hedder stadig cleaning_* internt.

alter table public.cleaning_tasks
  add column if not exists emoji text not null default '🧹' check (char_length(emoji) between 1 and 8),
  add column if not exists people_per_shift smallint not null default 1 check (people_per_shift between 1 and 10),
  add column if not exists remind_days_before smallint not null default 0 check (remind_days_before between 0 and 1);

-- Flere personer pr. dag: én række pr. plads (slot).
alter table public.cleaning_shifts add column if not exists slot smallint not null default 1;
alter table public.cleaning_shifts drop constraint if exists cleaning_shifts_task_id_date_key;
alter table public.cleaning_shifts drop constraint if exists cleaning_shifts_task_date_slot;
alter table public.cleaning_shifts add constraint cleaning_shifts_task_date_slot unique (task_id, date, slot);

-- Lav en plan: beboerne tages på skift; har opgaven flere pladser pr. dag,
-- fyldes de med de næste i rækken (aldrig den samme person to gange samme dag).
create or replace function public.generate_cleaning_rotation(p_task uuid, p_from date, p_weeks int)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_task    public.cleaning_tasks;
  v_members uuid[];
  v_n       int;
  v_slots   int;
  v_idx     int := 0;
  v_last    uuid;
  v_day     date;
  v_slot    int;
  v_count   int := 0;
begin
  select * into v_task from public.cleaning_tasks where id = p_task;
  if not found or not public.is_moderator_of(v_task.hall_id) then raise exception 'forbidden'; end if;
  if p_weeks not between 1 and 52 then raise exception 'invalid_weeks'; end if;

  select array_agg(user_id order by joined_at, user_id) into v_members
  from public.memberships where hall_id = v_task.hall_id;
  v_n := coalesce(array_length(v_members, 1), 0);
  if v_n = 0 then return 0; end if;
  v_slots := least(v_task.people_per_shift, v_n);

  select user_id into v_last from public.cleaning_shifts
  where task_id = p_task and date < p_from and user_id is not null
  order by date desc, slot desc limit 1;
  if v_last is not null then v_idx := coalesce(array_position(v_members, v_last), 0); end if;

  delete from public.cleaning_shifts where task_id = p_task and date >= p_from;

  for v_day in select g::date from generate_series(p_from, p_from + (p_weeks * 7 - 1), interval '1 day') g loop
    if extract(isodow from v_day)::smallint = any (v_task.weekdays) then
      for v_slot in 1..v_slots loop
        v_idx := v_idx % v_n + 1;
        insert into public.cleaning_shifts (task_id, hall_id, date, slot, user_id)
        values (p_task, v_task.hall_id, v_day, v_slot, v_members[v_idx]);
        v_count := v_count + 1;
      end loop;
    end if;
  end loop;
  return v_count;
end $$;

-- CSV-import: flere rækker med samme dato og opgave bliver til flere pladser.
-- Eksisterende tjanser for en dato og opgave i filen erstattes.
create or replace function public.import_cleaning_shifts(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_hall   uuid := public.my_active_hall();
  v_row    jsonb;
  v_i      int := 0;
  v_task   uuid;
  v_user   uuid;
  v_date   date;
  v_key    text;
  v_slot   int;
  v_seen   jsonb := '{}'::jsonb;
  v_ok     int := 0;
  v_errors jsonb := '[]'::jsonb;
begin
  if v_hall is null or not public.is_moderator_of(v_hall) then raise exception 'forbidden'; end if;
  if jsonb_array_length(p_rows) > 2000 then raise exception 'too_many_rows'; end if;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_i := v_i + 1;
    begin
      v_date := (v_row ->> 'date')::date;
    exception when others then
      v_errors := v_errors || jsonb_build_object('row', v_i, 'error', 'date');
      continue;
    end;

    select id into v_task from public.cleaning_tasks
    where hall_id = v_hall and lower(trim(title)) = lower(trim(v_row ->> 'task'));
    if v_task is null then
      v_errors := v_errors || jsonb_build_object('row', v_i, 'error', 'task');
      continue;
    end if;

    v_user := null;
    if coalesce(trim(v_row ->> 'name'), '') <> '' then
      select m.user_id into v_user from public.memberships m
      join public.profiles p on p.id = m.user_id
      where m.hall_id = v_hall and lower(trim(p.display_name)) = lower(trim(v_row ->> 'name'))
      limit 1;
      if v_user is null then
        v_errors := v_errors || jsonb_build_object('row', v_i, 'error', 'name');
        continue;
      end if;
    end if;

    v_key := v_task::text || '|' || v_date::text;
    if v_seen ? v_key then
      v_slot := (v_seen ->> v_key)::int + 1;
    else
      delete from public.cleaning_shifts where task_id = v_task and date = v_date;
      v_slot := 1;
    end if;
    v_seen := v_seen || jsonb_build_object(v_key, v_slot);

    insert into public.cleaning_shifts (task_id, hall_id, date, slot, user_id)
    values (v_task, v_hall, v_date, v_slot, v_user);
    v_ok := v_ok + 1;
  end loop;

  return jsonb_build_object('imported', v_ok, 'errors', v_errors);
end $$;

notify pgrst, 'reload schema';
