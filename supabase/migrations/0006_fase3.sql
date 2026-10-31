-- KollegieAppen (KA) · Fase 3
-- Administration, bestyrelse, anonym brevkasse med rapportering, venskabskollegier,
-- afstemninger, opslagstyper (fremleje, meddelelser) og praktisk info.
-- Kør hele filen én gang i SQL Editor (efter 0005).

-- ─────────────────────────────────────────────────────────────
-- Administration: fagpersoner tilknyttet 0, ét eller flere kollegier
-- ─────────────────────────────────────────────────────────────

create table if not exists public.dorm_admins (
  dorm_id uuid not null references public.dorms on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  primary key (dorm_id, user_id)
);
alter table public.dorm_admins enable row level security;

create or replace function public.hall_dorm(p_hall uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select dorm_id from public.halls where id = p_hall
$$;

create or replace function public.is_admin_of(p_dorm uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.dorm_admins a join public.dorms d on d.id = a.dorm_id
    where a.dorm_id = p_dorm and a.user_id = auth.uid() and d.status = 'approved'
  )
$$;

-- Moderator på gangen, administration på kollegiet eller superadmin.
create or replace function public.can_manage_hall(p_hall uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_moderator_of(p_hall) or public.is_admin_of(public.hall_dorm(p_hall)) or public.is_superadmin()
$$;

drop policy if exists dorm_admins_select on public.dorm_admins;
create policy dorm_admins_select on public.dorm_admins for select to authenticated
  using (user_id = auth.uid() or dorm_id = public.my_active_dorm() or public.is_superadmin());

-- ─────────────────────────────────────────────────────────────
-- Venskabskollegier
-- ─────────────────────────────────────────────────────────────

create table if not exists public.dorm_friendships (
  id         uuid primary key default gen_random_uuid(),
  from_dorm  uuid not null references public.dorms on delete cascade,
  to_dorm    uuid not null references public.dorms on delete cascade,
  status     text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  check (from_dorm <> to_dorm)
);
create unique index if not exists dorm_friendships_pair
  on public.dorm_friendships (least(from_dorm, to_dorm), greatest(from_dorm, to_dorm));
alter table public.dorm_friendships enable row level security;

create or replace function public.friend_dorms()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select case when f.from_dorm = d.me then f.to_dorm else f.from_dorm end
  from public.dorm_friendships f, (select public.my_active_dorm() as me) d
  where f.status = 'accepted' and d.me in (f.from_dorm, f.to_dorm)
$$;

create or replace function public.is_friend_dorm(p_dorm uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_dorm in (select public.friend_dorms())
$$;

drop policy if exists friendships_select on public.dorm_friendships;
create policy friendships_select on public.dorm_friendships for select to authenticated
  using (public.my_active_dorm() in (from_dorm, to_dorm) or public.is_admin_of(from_dorm)
         or public.is_admin_of(to_dorm) or public.is_superadmin());

-- ─────────────────────────────────────────────────────────────
-- Synlighed: administration ser sit kollegie; venner ser hinandens navne
-- ─────────────────────────────────────────────────────────────

create or replace function public.profile_visible(p_other uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_other = auth.uid()
    or public.is_superadmin()
    or exists (
      select 1 from public.memberships m join public.halls h on h.id = m.hall_id
      where m.user_id = p_other
        and (h.dorm_id = public.my_active_dorm() or public.is_admin_of(h.dorm_id) or public.is_friend_dorm(h.dorm_id))
    )
    or exists (
      select 1 from public.dorm_admins a
      where a.user_id = p_other and (a.dorm_id = public.my_active_dorm() or public.is_friend_dorm(a.dorm_id))
    )
$$;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (public.profile_visible(id));

drop policy if exists halls_select on public.halls;
create policy halls_select on public.halls for select to authenticated
  using (dorm_id = public.my_dorm() or public.is_admin_of(dorm_id) or public.is_superadmin());

drop policy if exists memberships_select on public.memberships;
create policy memberships_select on public.memberships for select to authenticated
  using (
    user_id = auth.uid()
    or public.hall_dorm(hall_id) = public.my_active_dorm()
    or public.is_admin_of(public.hall_dorm(hall_id))
    or public.is_superadmin()
  );

drop policy if exists invites_select on public.invites;
drop policy if exists invites_delete on public.invites;
create policy invites_select on public.invites for select to authenticated
  using (public.can_manage_hall(hall_id) or created_by = auth.uid());
create policy invites_delete on public.invites for delete to authenticated
  using (public.can_manage_hall(hall_id) or created_by = auth.uid());

drop policy if exists dorm_board_select on public.dorm_board;
create policy dorm_board_select on public.dorm_board for select to authenticated
  using (dorm_id = public.my_active_dorm() or public.is_admin_of(dorm_id) or public.is_superadmin());

-- Bestyrelse: kan også styres af administrationen.
create or replace function public.is_board_of(p_dorm uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_dorm = public.my_active_dorm() and exists (
    select 1 from public.dorm_board where dorm_id = p_dorm and user_id = auth.uid()
  )
$$;

-- ─────────────────────────────────────────────────────────────
-- Opslag: typer (opslag, fremleje, meddelelse) og venskabsopslag
-- ─────────────────────────────────────────────────────────────

alter table public.posts add column if not exists kind text not null default 'post'
  check (kind in ('post', 'sublet', 'announcement'));
alter table public.posts add column if not exists is_friends boolean not null default false;
alter table public.posts drop constraint if exists posts_friends_check;
alter table public.posts add constraint posts_friends_check
  check (not is_friends or (dorm_id is not null and kind = 'post'));
alter table public.posts drop constraint if exists posts_kind_scope_check;
alter table public.posts add constraint posts_kind_scope_check
  check (kind = 'post' or dorm_id is not null);

drop policy if exists posts_select on public.posts;
drop policy if exists posts_insert on public.posts;
drop policy if exists posts_update on public.posts;
drop policy if exists posts_delete on public.posts;

create policy posts_select on public.posts for select to authenticated
  using (
    hall_id = public.my_active_hall()
    or dorm_id = public.my_active_dorm()
    or (is_friends and public.is_friend_dorm(dorm_id))
    or public.is_admin_of(coalesce(dorm_id, public.hall_dorm(hall_id)))
  );
create policy posts_insert on public.posts for insert to authenticated
  with check (
    created_by = auth.uid() and (
      (hall_id = public.my_active_hall() and kind = 'post')
      or (dorm_id = public.my_active_dorm() and (kind <> 'announcement' or public.is_board_of(dorm_id)))
      or public.is_admin_of(dorm_id)
    )
  );
create policy posts_update on public.posts for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy posts_delete on public.posts for delete to authenticated
  using (
    created_by = auth.uid()
    or (hall_id is not null and public.can_manage_hall(hall_id))
    or (dorm_id is not null and (public.is_board_of(dorm_id) or public.is_admin_of(dorm_id) or public.is_superadmin()))
  );

-- ─────────────────────────────────────────────────────────────
-- Events: venskabsevents og administrationens adgang
-- ─────────────────────────────────────────────────────────────

alter table public.events add column if not exists is_friends boolean not null default false;
alter table public.events drop constraint if exists events_friends_check;
alter table public.events add constraint events_friends_check check (not is_friends or dorm_id is not null);

create or replace function public.can_manage_event(p_hall uuid, p_dorm uuid, p_created_by uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select
    public.is_superadmin()
    or (p_created_by = auth.uid())
    or public.is_admin_of(coalesce(p_dorm, public.hall_dorm(p_hall)))
    or (p_hall is not null and (public.is_moderator_of(p_hall) or public.is_board_of(public.hall_dorm(p_hall))))
    or (p_dorm is not null and (public.is_moderator_in_dorm(p_dorm) or public.is_board_of(p_dorm)))
$$;

drop policy if exists events_select on public.events;
drop policy if exists events_insert on public.events;
create policy events_select on public.events for select to authenticated
  using (
    hall_id = public.my_active_hall()
    or dorm_id = public.my_active_dorm()
    or (is_friends and public.is_friend_dorm(dorm_id))
    or public.is_admin_of(coalesce(dorm_id, public.hall_dorm(hall_id)))
    or public.is_superadmin()
  );
create policy events_insert on public.events for insert to authenticated
  with check (
    created_by = auth.uid()
    and (hall_id = public.my_active_hall() or dorm_id = public.my_active_dorm() or public.is_admin_of(dorm_id))
  );

-- ─────────────────────────────────────────────────────────────
-- Afstemninger (knyttet til et opslag, én stemme pr. person)
-- ─────────────────────────────────────────────────────────────

create table if not exists public.poll_options (
  id       uuid primary key default gen_random_uuid(),
  post_id  uuid not null references public.posts on delete cascade,
  label    text not null check (length(trim(label)) between 1 and 100),
  position smallint not null default 0
);
create index if not exists poll_options_post on public.poll_options (post_id);

create table if not exists public.poll_votes (
  post_id   uuid not null references public.posts on delete cascade,
  option_id uuid not null references public.poll_options on delete cascade,
  user_id   uuid not null default auth.uid() references public.profiles on delete cascade,
  primary key (post_id, user_id)
);
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;

drop policy if exists poll_options_select on public.poll_options;
drop policy if exists poll_options_insert on public.poll_options;
create policy poll_options_select on public.poll_options for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));
create policy poll_options_insert on public.poll_options for insert to authenticated
  with check (exists (select 1 from public.posts p where p.id = post_id and p.created_by = auth.uid()));

drop policy if exists poll_votes_select on public.poll_votes;
drop policy if exists poll_votes_insert on public.poll_votes;
drop policy if exists poll_votes_delete on public.poll_votes;
create policy poll_votes_select on public.poll_votes for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));
create policy poll_votes_insert on public.poll_votes for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.posts p where p.id = post_id)
    and exists (select 1 from public.poll_options o where o.id = option_id and o.post_id = poll_votes.post_id)
  );
create policy poll_votes_delete on public.poll_votes for delete to authenticated
  using (user_id = auth.uid());
revoke update on public.poll_votes, public.poll_options from authenticated;

-- ─────────────────────────────────────────────────────────────
-- Praktisk info ("hvor har vi wc-rens?") på gangen eller for hele kollegiet
-- ─────────────────────────────────────────────────────────────

create table if not exists public.info_items (
  id         uuid primary key default gen_random_uuid(),
  hall_id    uuid references public.halls on delete cascade,
  dorm_id    uuid references public.dorms on delete cascade,
  question   text not null check (length(trim(question)) between 1 and 200),
  answer     text not null default '' check (length(answer) <= 2000),
  updated_by uuid references public.profiles on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  check ((hall_id is null) <> (dorm_id is null))
);
alter table public.info_items enable row level security;

create or replace function public.touch_info()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists info_items_touch on public.info_items;
create trigger info_items_touch before update on public.info_items
  for each row execute function public.touch_info();

drop policy if exists info_select on public.info_items;
drop policy if exists info_insert on public.info_items;
drop policy if exists info_update on public.info_items;
drop policy if exists info_delete on public.info_items;
create policy info_select on public.info_items for select to authenticated
  using (hall_id = public.my_active_hall() or dorm_id = public.my_active_dorm()
         or public.is_admin_of(coalesce(dorm_id, public.hall_dorm(hall_id))));
create policy info_insert on public.info_items for insert to authenticated
  with check (hall_id = public.my_active_hall()
              or (dorm_id is not null and (public.is_board_of(dorm_id) or public.is_admin_of(dorm_id))));
create policy info_update on public.info_items for update to authenticated
  using (hall_id = public.my_active_hall()
         or (dorm_id is not null and (public.is_board_of(dorm_id) or public.is_admin_of(dorm_id))))
  with check (true);
create policy info_delete on public.info_items for delete to authenticated
  using ((hall_id is not null and (updated_by = auth.uid() or public.can_manage_hall(hall_id)))
         or (dorm_id is not null and (public.is_board_of(dorm_id) or public.is_admin_of(dorm_id))));
revoke update on public.info_items from authenticated;
grant update (question, answer) on public.info_items to authenticated;

-- ─────────────────────────────────────────────────────────────
-- Anonym brevkasse: afsenderen er skjult, men gemt, så administrationen
-- kan afsløre den, hvis en besked bliver rapporteret.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.anon_messages (
  id         uuid primary key default gen_random_uuid(),
  hall_id    uuid not null references public.halls on delete cascade,
  body       text not null check (length(trim(body)) between 1 and 2000),
  sender_id  uuid references public.profiles on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists anon_messages_hall on public.anon_messages (hall_id, created_at desc);
alter table public.anon_messages enable row level security;

drop policy if exists anon_select on public.anon_messages;
drop policy if exists anon_delete on public.anon_messages;
create policy anon_select on public.anon_messages for select to authenticated
  using (hall_id = public.my_active_hall() or public.is_admin_of(public.hall_dorm(hall_id)));
create policy anon_delete on public.anon_messages for delete to authenticated
  using (public.can_manage_hall(hall_id));

-- Kolonnen sender_id kan ikke læses af nogen bruger.
revoke all on public.anon_messages from anon, authenticated;
grant select (id, hall_id, body, created_at), delete on public.anon_messages to authenticated;

create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid not null references public.anon_messages on delete cascade,
  hall_id     uuid not null references public.halls on delete cascade,
  reporter_id uuid references public.profiles on delete set null default auth.uid(),
  reason      text not null default '' check (length(reason) <= 500),
  to_admin    boolean not null default false,
  status      text not null default 'open' check (status in ('open', 'resolved')),
  created_at  timestamptz not null default now()
);
alter table public.reports enable row level security;

drop policy if exists reports_select on public.reports;
drop policy if exists reports_update on public.reports;
create policy reports_select on public.reports for select to authenticated
  using (reporter_id = auth.uid()
         or (not to_admin and public.is_moderator_of(hall_id))
         or public.is_admin_of(public.hall_dorm(hall_id))
         or public.is_superadmin());
create policy reports_update on public.reports for update to authenticated
  using ((not to_admin and public.is_moderator_of(hall_id)) or public.is_admin_of(public.hall_dorm(hall_id)) or public.is_superadmin())
  with check (true);
revoke insert, update on public.reports from authenticated;
grant update (status) on public.reports to authenticated;

create table if not exists public.reveal_log (
  id         uuid primary key default gen_random_uuid(),
  report_id  uuid references public.reports on delete set null,
  message_id uuid,
  admin_id   uuid references public.profiles on delete set null,
  created_at timestamptz not null default now()
);
alter table public.reveal_log enable row level security;
drop policy if exists reveal_log_select on public.reveal_log;
create policy reveal_log_select on public.reveal_log for select to authenticated
  using (public.is_superadmin() or admin_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- Funktioner (RPC)
-- ─────────────────────────────────────────────────────────────

create or replace function public.send_anon_message(p_body text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if public.my_active_hall() is null then raise exception 'forbidden'; end if;
  insert into public.anon_messages (hall_id, body, sender_id)
  values (public.my_active_hall(), trim(p_body), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.report_message(p_message uuid, p_reason text, p_to_admin boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_hall uuid; v_id uuid;
begin
  select hall_id into v_hall from public.anon_messages where id = p_message;
  if v_hall is null or v_hall <> public.my_active_hall() then raise exception 'forbidden'; end if;
  insert into public.reports (message_id, hall_id, reporter_id, reason, to_admin)
  values (p_message, v_hall, auth.uid(), left(coalesce(trim(p_reason), ''), 500), coalesce(p_to_admin, false))
  returning id into v_id;
  return v_id;
end $$;

-- Administration: afslør afsenderen af en rapporteret besked. Hver afsløring logges.
create or replace function public.reveal_anon_sender(p_report uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_msg uuid; v_hall uuid; v_name text; v_email text;
begin
  select message_id, hall_id into v_msg, v_hall from public.reports where id = p_report;
  if v_msg is null or not (public.is_admin_of(public.hall_dorm(v_hall)) or public.is_superadmin()) then
    raise exception 'forbidden';
  end if;
  select p.display_name, u.email::text into v_name, v_email
  from public.anon_messages m
  left join public.profiles p on p.id = m.sender_id
  left join auth.users u on u.id = m.sender_id
  where m.id = v_msg;
  insert into public.reveal_log (report_id, message_id, admin_id) values (p_report, v_msg, auth.uid());
  return jsonb_build_object('name', v_name, 'email', v_email);
end $$;

-- Superadmin: tilknyt eller fjern administration.
create or replace function public.add_dorm_admin(p_dorm uuid, p_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
  if not public.is_superadmin() then raise exception 'forbidden'; end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then raise exception 'user_not_found'; end if;
  insert into public.dorm_admins (dorm_id, user_id) values (p_dorm, v_user) on conflict do nothing;
end $$;

create or replace function public.remove_dorm_admin(p_dorm uuid, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_superadmin() then raise exception 'forbidden'; end if;
  delete from public.dorm_admins where dorm_id = p_dorm and user_id = p_user;
end $$;

-- Bestyrelse eller administration: tilføj/fjern et bestyrelsesmedlem.
create or replace function public.set_board(p_user uuid, p_value boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_dorm uuid;
begin
  select h.dorm_id into v_dorm from public.memberships m join public.halls h on h.id = m.hall_id
  where m.user_id = p_user;
  if v_dorm is null and not p_value then
    select dorm_id into v_dorm from public.dorm_board where user_id = p_user limit 1;
  end if;
  if v_dorm is null or not (public.is_board_of(v_dorm) or public.is_admin_of(v_dorm) or public.is_superadmin()) then
    raise exception 'forbidden';
  end if;
  if p_value then
    insert into public.dorm_board (dorm_id, user_id) values (v_dorm, p_user) on conflict do nothing;
  else
    delete from public.dorm_board where dorm_id = v_dorm and user_id = p_user;
  end if;
end $$;

-- Moderator eller administration: invitationskoder, gange, beboere, moderatorer.
create or replace function public.create_invite(p_hall uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_code text;
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_dorm uuid := public.hall_dorm(p_hall);
begin
  if v_dorm is null or not (
    public.is_admin_of(v_dorm)
    or (v_dorm = public.my_active_dorm() and exists (
          select 1 from public.memberships where user_id = auth.uid() and is_moderator))
  ) then
    raise exception 'forbidden';
  end if;
  loop
    select string_agg(substr(v_alphabet, 1 + floor(random() * 32)::int, 1), '')
      into v_code from generate_series(1, 6);
    exit when not exists (select 1 from public.invites where code = v_code);
  end loop;
  insert into public.invites (code, hall_id, created_by) values (v_code, p_hall, auth.uid());
  return v_code;
end $$;

drop function if exists public.create_hall(text);
create or replace function public.create_hall(p_name text, p_dorm uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_hall uuid; v_dorm uuid := coalesce(p_dorm, public.my_active_dorm());
begin
  if v_dorm is null or not (
    public.is_admin_of(v_dorm)
    or (v_dorm = public.my_active_dorm() and exists (
          select 1 from public.memberships where user_id = auth.uid() and is_moderator))
  ) then
    raise exception 'forbidden';
  end if;
  insert into public.halls (dorm_id, name) values (v_dorm, trim(p_name)) returning id into v_hall;
  return v_hall;
end $$;

create or replace function public.remove_member(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_hall uuid;
begin
  select hall_id into v_hall from public.memberships where user_id = p_user;
  if v_hall is null or not public.can_manage_hall(v_hall) or p_user = auth.uid() then
    raise exception 'forbidden';
  end if;
  update public.cleaning_shifts set user_id = null where user_id = p_user and date >= current_date;
  delete from public.dorm_board where user_id = p_user;
  delete from public.memberships where user_id = p_user;
  perform public.ensure_moderator(v_hall);
end $$;

create or replace function public.set_moderator(p_user uuid, p_value boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_hall uuid;
begin
  select hall_id into v_hall from public.memberships where user_id = p_user;
  if v_hall is null or not public.can_manage_hall(v_hall) then raise exception 'forbidden'; end if;
  if not p_value and not exists (
    select 1 from public.memberships where hall_id = v_hall and is_moderator and user_id <> p_user
  ) then
    raise exception 'last_moderator';
  end if;
  update public.memberships set is_moderator = p_value where user_id = p_user;
end $$;

-- Når man forlader gangen, forlader man også bestyrelsen.
create or replace function public.leave_hall()
returns void language plpgsql security definer set search_path = '' as $$
declare v_hall uuid;
begin
  update public.cleaning_shifts set user_id = null where user_id = auth.uid() and date >= current_date;
  delete from public.dorm_board where user_id = auth.uid();
  delete from public.memberships where user_id = auth.uid() returning hall_id into v_hall;
  if v_hall is not null then perform public.ensure_moderator(v_hall); end if;
end $$;

-- Bestyrelse: venskabsanmodninger.
create or replace function public.request_friendship(p_to uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public.my_active_dorm();
begin
  if v_me is null or not public.is_board_of(v_me) then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.dorms where id = p_to and status = 'approved') or p_to = v_me then
    raise exception 'invalid_dorm';
  end if;
  -- Har det andet kollegie allerede spurgt os, accepterer vi i stedet.
  update public.dorm_friendships set status = 'accepted'
  where from_dorm = p_to and to_dorm = v_me and status = 'pending';
  if not found then
    insert into public.dorm_friendships (from_dorm, to_dorm) values (v_me, p_to)
    on conflict do nothing;
  end if;
end $$;

create or replace function public.respond_friendship(p_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_to uuid;
begin
  select to_dorm into v_to from public.dorm_friendships where id = p_id and status = 'pending';
  if v_to is null or not public.is_board_of(v_to) then raise exception 'forbidden'; end if;
  if p_accept then
    update public.dorm_friendships set status = 'accepted' where id = p_id;
  else
    delete from public.dorm_friendships where id = p_id;
  end if;
end $$;

create or replace function public.end_friendship(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_a uuid; v_b uuid;
begin
  select from_dorm, to_dorm into v_a, v_b from public.dorm_friendships where id = p_id;
  if v_a is null or not (public.is_board_of(v_a) or public.is_board_of(v_b)) then raise exception 'forbidden'; end if;
  delete from public.dorm_friendships where id = p_id;
end $$;

-- Liste over godkendte kollegier (til venskabsanmodninger).
create or replace function public.approved_dorms()
returns table (id uuid, name text) language sql stable security definer set search_path = '' as $$
  select id, name from public.dorms where status = 'approved' and auth.uid() is not null order by name
$$;

revoke execute on function
  public.send_anon_message(text), public.report_message(uuid, text, boolean), public.reveal_anon_sender(uuid),
  public.add_dorm_admin(uuid, text), public.remove_dorm_admin(uuid, uuid), public.set_board(uuid, boolean),
  public.create_hall(text, uuid), public.request_friendship(uuid), public.respond_friendship(uuid, boolean),
  public.end_friendship(uuid), public.approved_dorms()
from anon;

alter publication supabase_realtime add table public.poll_votes;

notify pgrst, 'reload schema';
