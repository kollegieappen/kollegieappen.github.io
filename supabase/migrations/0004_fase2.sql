-- KollegieAppen (KA) · Fase 2: push, telefonliste, fælles ting, rengøringsplan
-- Kør hele filen én gang i SQL Editor (efter 0003).

-- ─────────────────────────────────────────────────────────────
-- Push-abonnementer (én række pr. enhed, der har slået notifikationer til)
-- ─────────────────────────────────────────────────────────────

create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;

drop policy if exists push_own on public.push_subscriptions;
create policy push_own on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- Telefonliste: frivillig, kun synlig for ens egen gang
-- ─────────────────────────────────────────────────────────────

create table if not exists public.phone_numbers (
  user_id uuid primary key default auth.uid() references public.profiles on delete cascade,
  phone   text not null check (length(trim(phone)) between 3 and 30)
);
alter table public.phone_numbers enable row level security;

drop policy if exists phone_select on public.phone_numbers;
drop policy if exists phone_write on public.phone_numbers;
create policy phone_select on public.phone_numbers for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.memberships m
      where m.user_id = phone_numbers.user_id and m.hall_id = public.my_active_hall()
    )
  );
create policy phone_write on public.phone_numbers for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- Fælles ting: ting på gangen, som andre må bruge
-- owner_id = null betyder fælleseje.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.shared_items (
  id          uuid primary key default gen_random_uuid(),
  hall_id     uuid not null references public.halls on delete cascade,
  title       text not null check (length(trim(title)) between 1 and 120),
  description text check (length(description) <= 1000),
  owner_id    uuid references public.profiles on delete set null,
  created_by  uuid references public.profiles on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists shared_items_hall on public.shared_items (hall_id);
alter table public.shared_items enable row level security;

drop policy if exists shared_select on public.shared_items;
drop policy if exists shared_insert on public.shared_items;
drop policy if exists shared_update on public.shared_items;
drop policy if exists shared_delete on public.shared_items;
create policy shared_select on public.shared_items for select to authenticated
  using (hall_id = public.my_active_hall());
create policy shared_insert on public.shared_items for insert to authenticated
  with check (hall_id = public.my_active_hall() and created_by = auth.uid()
              and (owner_id is null or owner_id = auth.uid()));
create policy shared_update on public.shared_items for update to authenticated
  using (hall_id = public.my_active_hall() and (created_by = auth.uid() or public.is_moderator_of(hall_id)))
  with check (owner_id is null or owner_id = auth.uid() or owner_id = created_by);
create policy shared_delete on public.shared_items for delete to authenticated
  using (hall_id = public.my_active_hall() and (created_by = auth.uid() or public.is_moderator_of(hall_id)));

revoke update on public.shared_items from authenticated;
grant update (title, description, owner_id) on public.shared_items to authenticated;

-- ─────────────────────────────────────────────────────────────
-- Rengøring: opgaver (moderator opsætter) og vagter (hvem, hvilken dag)
-- weekdays: 1 = mandag … 7 = søndag. remind_hour: klokkeslæt for påmindelse.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.cleaning_tasks (
  id          uuid primary key default gen_random_uuid(),
  hall_id     uuid not null references public.halls on delete cascade,
  title       text not null check (length(trim(title)) between 1 and 80),
  description text check (length(description) <= 2000),
  weekdays    smallint[] not null check (cardinality(weekdays) between 1 and 7 and weekdays <@ array[1,2,3,4,5,6,7]::smallint[]),
  remind_hour smallint not null default 10 check (remind_hour between 0 and 23),
  created_at  timestamptz not null default now(),
  unique (hall_id, title)
);
alter table public.cleaning_tasks enable row level security;

create table if not exists public.cleaning_shifts (
  id       uuid primary key default gen_random_uuid(),
  task_id  uuid not null references public.cleaning_tasks on delete cascade,
  hall_id  uuid not null references public.halls on delete cascade,
  date     date not null,
  user_id  uuid references public.profiles on delete set null,
  reminded boolean not null default false,
  unique (task_id, date)
);
create index if not exists cleaning_shifts_hall_date on public.cleaning_shifts (hall_id, date);
create index if not exists cleaning_shifts_due on public.cleaning_shifts (date) where not reminded;
alter table public.cleaning_shifts enable row level security;

drop policy if exists tasks_select on public.cleaning_tasks;
drop policy if exists tasks_write on public.cleaning_tasks;
create policy tasks_select on public.cleaning_tasks for select to authenticated
  using (hall_id = public.my_active_hall());
create policy tasks_write on public.cleaning_tasks for all to authenticated
  using (hall_id = public.my_active_hall() and public.is_moderator_of(hall_id))
  with check (hall_id = public.my_active_hall() and public.is_moderator_of(hall_id));

drop policy if exists shifts_select on public.cleaning_shifts;
drop policy if exists shifts_update on public.cleaning_shifts;
drop policy if exists shifts_delete on public.cleaning_shifts;
create policy shifts_select on public.cleaning_shifts for select to authenticated
  using (hall_id = public.my_active_hall());
create policy shifts_update on public.cleaning_shifts for update to authenticated
  using (public.is_moderator_of(hall_id)) with check (public.is_moderator_of(hall_id));
create policy shifts_delete on public.cleaning_shifts for delete to authenticated
  using (public.is_moderator_of(hall_id));

-- Vagter oprettes via funktionerne nedenfor; moderatorer kan kun skifte person.
revoke insert, update on public.cleaning_shifts from authenticated;
grant update (user_id) on public.cleaning_shifts to authenticated;

-- Ny person på en vagt → ny påmindelse.
create or replace function public.reset_reminded()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.user_id is distinct from old.user_id or new.date is distinct from old.date then
    new.reminded := false;
  end if;
  return new;
end $$;
drop trigger if exists cleaning_shifts_reset on public.cleaning_shifts;
create trigger cleaning_shifts_reset before update on public.cleaning_shifts
  for each row execute function public.reset_reminded();

-- Moderator: lav en plan for de næste p_weeks uger fra p_from.
-- Beboerne tages på skift i den rækkefølge, de flyttede ind, og rotationen
-- fortsætter fra den sidste, der havde opgaven før p_from.
create or replace function public.generate_cleaning_rotation(p_task uuid, p_from date, p_weeks int)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_task    public.cleaning_tasks;
  v_members uuid[];
  v_n       int;
  v_idx     int := 0;
  v_last    uuid;
  v_day     date;
  v_count   int := 0;
begin
  select * into v_task from public.cleaning_tasks where id = p_task;
  if not found or not public.is_moderator_of(v_task.hall_id) then raise exception 'forbidden'; end if;
  if p_weeks not between 1 and 52 then raise exception 'invalid_weeks'; end if;

  select array_agg(user_id order by joined_at, user_id) into v_members
  from public.memberships where hall_id = v_task.hall_id;
  v_n := coalesce(array_length(v_members, 1), 0);
  if v_n = 0 then return 0; end if;

  select user_id into v_last from public.cleaning_shifts
  where task_id = p_task and date < p_from and user_id is not null
  order by date desc limit 1;
  if v_last is not null then v_idx := coalesce(array_position(v_members, v_last), 0); end if;

  delete from public.cleaning_shifts where task_id = p_task and date >= p_from;

  for v_day in select g::date from generate_series(p_from, p_from + (p_weeks * 7 - 1), interval '1 day') g loop
    if extract(isodow from v_day)::smallint = any (v_task.weekdays) then
      v_idx := v_idx % v_n + 1;
      insert into public.cleaning_shifts (task_id, hall_id, date, user_id)
      values (p_task, v_task.hall_id, v_day, v_members[v_idx]);
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end $$;

-- Moderator: importér vagter fra CSV. p_rows = [{"date":"2026-11-03","task":"Køkken","name":"Lasse"}, …]
-- Opgave matches på titel og person på navn (uden forskel på store/små bogstaver).
-- Returnerer antal importerede og en liste over rækker, der ikke kunne bruges.
create or replace function public.import_cleaning_shifts(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_hall   uuid := public.my_active_hall();
  v_row    jsonb;
  v_i      int := 0;
  v_task   uuid;
  v_user   uuid;
  v_date   date;
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

    insert into public.cleaning_shifts (task_id, hall_id, date, user_id)
    values (v_task, v_hall, v_date, v_user)
    on conflict (task_id, date) do update set user_id = excluded.user_id, reminded = false;
    v_ok := v_ok + 1;
  end loop;

  return jsonb_build_object('imported', v_ok, 'errors', v_errors);
end $$;

-- Når en beboer forlader gangen, frigives vedkommendes kommende vagter.
create or replace function public.leave_hall()
returns void language plpgsql security definer set search_path = '' as $$
declare v_hall uuid;
begin
  update public.cleaning_shifts set user_id = null where user_id = auth.uid() and date >= current_date;
  delete from public.memberships where user_id = auth.uid() returning hall_id into v_hall;
  if v_hall is not null then perform public.ensure_moderator(v_hall); end if;
end $$;

create or replace function public.remove_member(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_hall uuid;
begin
  select hall_id into v_hall from public.memberships where user_id = p_user;
  if v_hall is null or not public.is_moderator_of(v_hall) or p_user = auth.uid() then
    raise exception 'forbidden';
  end if;
  update public.cleaning_shifts set user_id = null where user_id = p_user and date >= current_date;
  delete from public.memberships where user_id = p_user;
  perform public.ensure_moderator(v_hall);
end $$;

revoke execute on function public.generate_cleaning_rotation(uuid, date, int),
  public.import_cleaning_shifts(jsonb) from anon;

alter publication supabase_realtime add table public.shared_items, public.cleaning_shifts;

notify pgrst, 'reload schema';
