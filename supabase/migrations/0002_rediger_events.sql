-- KollegieAppen (KA) · Redigering af kalender-events
-- Kør hele filen én gang i SQL Editor (efter 0001_fase1.sql).
--
-- Et event kan redigeres og slettes af:
--   · beboeren, der oprettede det
--   · moderatorer (gangens events: gangens moderatorer; kollegiets events: alle moderatorer på kollegiet)
--   · bestyrelsen på kollegiet
--   · superadmin

-- Bestyrelse pr. kollegie. Styres indtil videre direkte i databasen;
-- en skærm til at administrere den kommer i fase 3.
create table if not exists public.dorm_board (
  dorm_id uuid not null references public.dorms on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  primary key (dorm_id, user_id)
);
alter table public.dorm_board enable row level security;

drop policy if exists dorm_board_select on public.dorm_board;
create policy dorm_board_select on public.dorm_board for select to authenticated
  using (dorm_id = public.my_active_dorm() or public.is_superadmin());

create or replace function public.is_board_of(p_dorm uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_dorm = public.my_active_dorm() and exists (
    select 1 from public.dorm_board where dorm_id = p_dorm and user_id = auth.uid()
  )
$$;

create or replace function public.is_moderator_in_dorm(p_dorm uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    join public.halls h on h.id = m.hall_id
    where m.user_id = auth.uid() and m.is_moderator and h.dorm_id = p_dorm
  ) and p_dorm = public.my_active_dorm()
$$;

create or replace function public.can_manage_event(p_hall uuid, p_dorm uuid, p_created_by uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select
    public.is_superadmin()
    or (p_created_by = auth.uid() and (p_hall = public.my_active_hall() or p_dorm = public.my_active_dorm()))
    or (p_hall is not null and (
          public.is_moderator_of(p_hall)
          or public.is_board_of((select dorm_id from public.halls where id = p_hall))))
    or (p_dorm is not null and (public.is_moderator_in_dorm(p_dorm) or public.is_board_of(p_dorm)))
$$;

drop policy if exists events_select on public.events;
drop policy if exists events_update on public.events;
drop policy if exists events_delete on public.events;

create policy events_select on public.events for select to authenticated
  using (hall_id = public.my_active_hall() or dorm_id = public.my_active_dorm() or public.is_superadmin());
create policy events_update on public.events for update to authenticated
  using (public.can_manage_event(hall_id, dorm_id, created_by))
  with check (public.can_manage_event(hall_id, dorm_id, created_by));
create policy events_delete on public.events for delete to authenticated
  using (public.can_manage_event(hall_id, dorm_id, created_by));

-- Ved redigering kan kun indholdet ændres, ikke hvem der oprettede det, eller hvem det er for.
revoke update on public.events from authenticated;
grant update (title, description, location, starts_at, ends_at) on public.events to authenticated;

revoke execute on function public.is_board_of(uuid), public.is_moderator_in_dorm(uuid),
  public.can_manage_event(uuid, uuid, uuid) from anon;

notify pgrst, 'reload schema';
