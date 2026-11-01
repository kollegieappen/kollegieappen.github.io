-- KollegieAppen (KA) · Superadmin på flere gange, testkollegier og funktionsønsker
-- Kør hele filen én gang i SQL Editor (efter 0011).
--
-- · Superadmin kan være medlem af ingen, én eller flere gange og skifte mellem dem.
--   Alle andre kan stadig kun være medlem af én gang.
-- · Superadmin kan gøre sig selv til administration for et kollegie.
-- · Kollegier kan markeres som test. Testkollegier skjules for andre end testkollegier.
-- · Alle kan sende funktionsønsker, som superadmin ser og svarer på.

-- ─────────────────────────────────────────────────────────────
-- Flere medlemskaber (kun superadmin) og "aktiv gang"
-- ─────────────────────────────────────────────────────────────

alter table public.memberships drop constraint if exists memberships_pkey;
alter table public.memberships add primary key (user_id, hall_id);

alter table public.profiles add column if not exists current_hall_id uuid references public.halls on delete set null;

create or replace function public.one_membership_unless_superadmin()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.memberships where user_id = new.user_id and hall_id <> new.hall_id)
     and not exists (select 1 from public.superadmins where user_id = new.user_id) then
    raise exception 'already_member';
  end if;
  return new;
end $$;
drop trigger if exists memberships_one_only on public.memberships;
create trigger memberships_one_only before insert on public.memberships
  for each row execute function public.one_membership_unless_superadmin();

-- Den gang, man har valgt (eller den eneste/ældste, hvis intet er valgt).
create or replace function public.my_hall()
returns uuid language sql stable security definer set search_path = '' as $$
  select m.hall_id
  from public.memberships m
  where m.user_id = auth.uid()
  order by (m.hall_id = (select current_hall_id from public.profiles where id = auth.uid())) desc nulls last, m.joined_at
  limit 1
$$;

create or replace function public.my_active_hall()
returns uuid language sql stable security definer set search_path = '' as $$
  select h.id from public.halls h join public.dorms d on d.id = h.dorm_id
  where h.id = public.my_hall() and d.status = 'approved'
$$;

create or replace function public.my_active_dorm()
returns uuid language sql stable security definer set search_path = '' as $$
  select h.dorm_id from public.halls h join public.dorms d on d.id = h.dorm_id
  where h.id = public.my_hall() and d.status = 'approved'
$$;

create or replace function public.my_dorm()
returns uuid language sql stable security definer set search_path = '' as $$
  select dorm_id from public.halls where id = public.my_hall()
$$;

create or replace function public.switch_hall(p_hall uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.memberships where user_id = auth.uid() and hall_id = p_hall) then
    raise exception 'forbidden';
  end if;
  update public.profiles set current_hall_id = p_hall where id = auth.uid();
end $$;

-- Moderator-rettigheder gælder i den aktive gang.
create or replace function public.create_invite(p_hall uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_code text;
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_dorm uuid := public.hall_dorm(p_hall);
begin
  if v_dorm is null or not (
    public.is_admin_of(v_dorm) or public.is_superadmin()
    or (v_dorm = public.my_active_dorm() and public.is_moderator_of(public.my_active_hall()))
  ) then
    raise exception 'forbidden';
  end if;
  loop
    select string_agg(substr(v_alphabet, 1 + floor(random() * 32)::int, 1), '') into v_code from generate_series(1, 6);
    exit when not exists (select 1 from public.invites where code = v_code);
  end loop;
  insert into public.invites (code, hall_id, created_by) values (v_code, p_hall, auth.uid());
  return v_code;
end $$;

create or replace function public.create_hall(p_name text, p_dorm uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_hall uuid; v_dorm uuid := coalesce(p_dorm, public.my_active_dorm());
begin
  if v_dorm is null or not (
    public.is_admin_of(v_dorm) or public.is_superadmin()
    or (v_dorm = public.my_active_dorm() and public.is_moderator_of(public.my_active_hall()))
  ) then
    raise exception 'forbidden';
  end if;
  insert into public.halls (dorm_id, name) values (v_dorm, trim(p_name)) returning id into v_hall;
  return v_hall;
end $$;

create or replace function public.request_dorm(p_name text, p_address text, p_halls text[], p_my_hall text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_dorm uuid; v_hall uuid; v_name text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if exists (select 1 from public.memberships where user_id = auth.uid()) and not public.is_superadmin() then
    raise exception 'already_member';
  end if;
  if coalesce(array_length(p_halls, 1), 0) = 0 or array_length(p_halls, 1) > 50 then raise exception 'invalid_halls'; end if;
  if not (trim(p_my_hall) = any (select trim(x) from unnest(p_halls) x)) then raise exception 'my_hall_not_in_list'; end if;

  insert into public.dorms (name, address, requested_by) values (trim(p_name), nullif(trim(p_address), ''), auth.uid())
  returning id into v_dorm;
  foreach v_name in array p_halls loop
    if length(trim(v_name)) > 0 then
      insert into public.halls (dorm_id, name) values (v_dorm, trim(v_name)) on conflict (dorm_id, name) do nothing;
    end if;
  end loop;
  select id into v_hall from public.halls where dorm_id = v_dorm and name = trim(p_my_hall);
  insert into public.memberships (user_id, hall_id, is_moderator) values (auth.uid(), v_hall, true);
  update public.profiles set current_hall_id = v_hall where id = auth.uid();
  return v_dorm;
end $$;

create or replace function public.join_with_code(p_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_inv public.invites;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if exists (select 1 from public.memberships where user_id = auth.uid()) and not public.is_superadmin() then
    raise exception 'already_member';
  end if;
  select i.* into v_inv
  from public.invites i join public.halls h on h.id = i.hall_id join public.dorms d on d.id = h.dorm_id
  where i.code = upper(trim(p_code)) and i.expires_at > now() and i.uses < i.max_uses and d.status = 'approved'
  for update of i;
  if not found then raise exception 'invalid_code'; end if;
  if exists (select 1 from public.memberships where user_id = auth.uid() and hall_id = v_inv.hall_id) then
    raise exception 'already_member';
  end if;
  insert into public.memberships (user_id, hall_id) values (auth.uid(), v_inv.hall_id);
  update public.invites set uses = uses + 1 where code = v_inv.code;
  update public.profiles set current_hall_id = v_inv.hall_id where id = auth.uid();
  perform public.ensure_moderator(v_inv.hall_id);
  return v_inv.hall_id;
end $$;

-- Fjern en person fra én gang (og fra bestyrelsen, hvis de ikke længere bor på kollegiet).
create or replace function public._remove_membership(p_user uuid, p_hall uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_dorm uuid := public.hall_dorm(p_hall);
begin
  update public.cleaning_shifts set user_id = null where user_id = p_user and hall_id = p_hall and date >= current_date;
  delete from public.memberships where user_id = p_user and hall_id = p_hall;
  if not exists (
    select 1 from public.memberships m join public.halls h on h.id = m.hall_id where m.user_id = p_user and h.dorm_id = v_dorm
  ) then
    delete from public.dorm_board where user_id = p_user and dorm_id = v_dorm;
  end if;
  update public.profiles set current_hall_id = null where id = p_user and current_hall_id = p_hall;
  perform public.ensure_moderator(p_hall);
end $$;
revoke execute on function public._remove_membership(uuid, uuid) from public, anon, authenticated;

create or replace function public.leave_hall()
returns void language plpgsql security definer set search_path = '' as $$
declare v_hall uuid := public.my_hall();
begin
  if v_hall is not null then perform public._remove_membership(auth.uid(), v_hall); end if;
end $$;

create or replace function public.remove_member(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_hall uuid;
begin
  select hall_id into v_hall from public.memberships
  where user_id = p_user and public.can_manage_hall(hall_id)
  order by (hall_id = public.my_active_hall()) desc limit 1;
  if v_hall is null or p_user = auth.uid() then raise exception 'forbidden'; end if;
  perform public._remove_membership(p_user, v_hall);
end $$;

create or replace function public.set_moderator(p_user uuid, p_value boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_hall uuid;
begin
  select hall_id into v_hall from public.memberships
  where user_id = p_user and public.can_manage_hall(hall_id)
  order by (hall_id = public.my_active_hall()) desc limit 1;
  if v_hall is null then raise exception 'forbidden'; end if;
  if not p_value and not exists (
    select 1 from public.memberships where hall_id = v_hall and is_moderator and user_id <> p_user
  ) then
    raise exception 'last_moderator';
  end if;
  update public.memberships set is_moderator = p_value where user_id = p_user and hall_id = v_hall;
end $$;

create or replace function public.set_board(p_user uuid, p_value boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_dorm uuid;
begin
  select h.dorm_id into v_dorm from public.memberships m join public.halls h on h.id = m.hall_id
  where m.user_id = p_user and (public.is_board_of(h.dorm_id) or public.is_admin_of(h.dorm_id) or public.is_superadmin())
  order by (h.dorm_id = public.my_active_dorm()) desc limit 1;
  if v_dorm is null and not p_value then
    select dorm_id into v_dorm from public.dorm_board
    where user_id = p_user and (public.is_board_of(dorm_id) or public.is_admin_of(dorm_id) or public.is_superadmin())
    limit 1;
  end if;
  if v_dorm is null then raise exception 'forbidden'; end if;
  if p_value then
    insert into public.dorm_board (dorm_id, user_id) values (v_dorm, p_user) on conflict do nothing;
  else
    delete from public.dorm_board where dorm_id = v_dorm and user_id = p_user;
  end if;
end $$;

create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
declare v_halls uuid[]; v_hall uuid;
begin
  select coalesce(array_agg(hall_id), '{}') into v_halls from public.memberships where user_id = auth.uid();
  delete from auth.users where id = auth.uid();
  foreach v_hall in array v_halls loop perform public.ensure_moderator(v_hall); end loop;
end $$;

-- Superadmin ser medlemskaber og gange i alle kollegier, men opslag og events kun
-- i den aktive gang, ligesom alle andre (eller som administration).
drop policy if exists events_select on public.events;
create policy events_select on public.events for select to authenticated
  using (
    hall_id = public.my_active_hall()
    or dorm_id = public.my_active_dorm()
    or (is_friends and public.is_friend_dorm(dorm_id))
    or public.is_admin_of(coalesce(dorm_id, public.hall_dorm(hall_id)))
  );

-- ─────────────────────────────────────────────────────────────
-- Superadmin som administration
-- ─────────────────────────────────────────────────────────────

create or replace function public.admin_self(p_dorm uuid, p_value boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_superadmin() then raise exception 'forbidden'; end if;
  if p_value then
    insert into public.dorm_admins (dorm_id, user_id) values (p_dorm, auth.uid()) on conflict do nothing;
  else
    delete from public.dorm_admins where dorm_id = p_dorm and user_id = auth.uid();
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Testkollegier
-- ─────────────────────────────────────────────────────────────

alter table public.dorms add column if not exists is_test boolean not null default false;
alter table public.dorms add column if not exists lat double precision check (lat between -90 and 90);
alter table public.dorms add column if not exists lng double precision check (lng between -180 and 180);

-- Adresse og placering på kortet (bestyrelse, administration eller superadmin).
drop function if exists public.set_dorm_address(uuid, text);
create or replace function public.set_dorm_address(p_dorm uuid, p_address text, p_lat double precision default null, p_lng double precision default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (public.is_board_of(p_dorm) or public.is_admin_of(p_dorm) or public.is_superadmin()) then
    raise exception 'forbidden';
  end if;
  update public.dorms
  set address = nullif(left(trim(p_address), 160), ''), lat = p_lat, lng = p_lng
  where id = p_dorm;
end $$;
revoke execute on function public.set_dorm_address(uuid, text, double precision, double precision) from anon;
update public.dorms set is_test = true where name like '🧪 %';

create or replace function public.set_dorm_test(p_dorm uuid, p_value boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_superadmin() then raise exception 'forbidden'; end if;
  update public.dorms set is_test = p_value where id = p_dorm;
end $$;

-- Liste over kollegier. Testkollegier vises kun for testkollegier (og superadmin).
drop function if exists public.approved_dorms();
create or replace function public.approved_dorms()
returns table (id uuid, name text, address text, hall_count int, resident_count int, is_test boolean, i_am_admin boolean,
               lat double precision, lng double precision)
language sql stable security definer set search_path = '' as $$
  select d.id, d.name, d.address,
         (select count(*)::int from public.halls h where h.dorm_id = d.id),
         (select count(*)::int from public.memberships m join public.halls h on h.id = m.hall_id where h.dorm_id = d.id),
         d.is_test,
         exists (select 1 from public.dorm_admins a where a.dorm_id = d.id and a.user_id = auth.uid()),
         d.lat, d.lng
  from public.dorms d
  where d.status = 'approved' and auth.uid() is not null
    and (not d.is_test
         or public.is_superadmin()
         or coalesce((select x.is_test from public.dorms x where x.id = public.my_active_dorm()), false))
  order by d.name
$$;

create or replace function public.request_friendship(p_to uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public.my_active_dorm();
begin
  if v_me is null or not public.is_board_of(v_me) then raise exception 'forbidden'; end if;
  if not exists (
    select 1 from public.dorms t, public.dorms m
    where t.id = p_to and m.id = v_me and t.status = 'approved' and t.is_test = m.is_test
  ) or p_to = v_me then
    raise exception 'invalid_dorm';
  end if;
  update public.dorm_friendships set status = 'accepted' where from_dorm = p_to and to_dorm = v_me and status = 'pending';
  if not found then
    insert into public.dorm_friendships (from_dorm, to_dorm) values (v_me, p_to) on conflict do nothing;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Funktionsønsker
-- ─────────────────────────────────────────────────────────────

create table if not exists public.feature_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles on delete set null default auth.uid(),
  dorm_id     uuid references public.dorms on delete set null default public.my_dorm(),
  title       text not null check (length(trim(title)) between 3 and 120),
  description text not null default '' check (length(description) <= 2000),
  status      text not null default 'new' check (status in ('new', 'planned', 'done', 'rejected')),
  admin_note  text not null default '' check (length(admin_note) <= 1000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.feature_requests enable row level security;

drop policy if exists fr_select on public.feature_requests;
drop policy if exists fr_insert on public.feature_requests;
drop policy if exists fr_update on public.feature_requests;
drop policy if exists fr_delete on public.feature_requests;
create policy fr_select on public.feature_requests for select to authenticated
  using (user_id = auth.uid() or public.is_superadmin());
create policy fr_insert on public.feature_requests for insert to authenticated
  with check (user_id = auth.uid() and status = 'new' and admin_note = '');
create policy fr_update on public.feature_requests for update to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());
create policy fr_delete on public.feature_requests for delete to authenticated
  using ((user_id = auth.uid() and status = 'new') or public.is_superadmin());
revoke update on public.feature_requests from authenticated;
grant update (status, admin_note) on public.feature_requests to authenticated;

create or replace function public.touch_feature_request()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists feature_requests_touch on public.feature_requests;
create trigger feature_requests_touch before update on public.feature_requests
  for each row execute function public.touch_feature_request();

revoke execute on function public.my_hall(), public.switch_hall(uuid), public.admin_self(uuid, boolean),
  public.set_dorm_test(uuid, boolean), public.approved_dorms() from anon;

insert into public.schema_migrations (version, name) values (12, '0012_superadmin_test_oensker')
on conflict (version) do update set applied_at = now();

notify pgrst, 'reload schema';
