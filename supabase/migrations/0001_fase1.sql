-- KollegieAppen (KA) · Fase 1
-- Kør hele filen én gang i Supabase: SQL Editor → New query → indsæt → Run.
-- Alle tabeller har Row Level Security slået til. Skrivninger, der kræver
-- særlige rettigheder, går gennem funktionerne nederst.


-- ─────────────────────────────────────────────────────────────
-- Tabeller
-- ─────────────────────────────────────────────────────────────

create table public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text not null default '' check (length(display_name) <= 60),
  language     text not null default 'da' check (language in ('da', 'en')),
  created_at   timestamptz not null default now()
);

create table public.superadmins (
  user_id uuid primary key references auth.users on delete cascade
);

create table public.dorms (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(trim(name)) between 2 and 80),
  address      text check (length(address) <= 160),
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_by uuid references public.profiles on delete set null,
  created_at   timestamptz not null default now()
);

create table public.halls (
  id         uuid primary key default gen_random_uuid(),
  dorm_id    uuid not null references public.dorms on delete cascade,
  name       text not null check (length(trim(name)) between 1 and 60),
  created_at timestamptz not null default now(),
  unique (dorm_id, name)
);
create index on public.halls (dorm_id);

-- Én gang pr. bruger (user_id er primærnøgle).
create table public.memberships (
  user_id      uuid primary key references public.profiles on delete cascade,
  hall_id      uuid not null references public.halls on delete cascade,
  is_moderator boolean not null default false,
  joined_at    timestamptz not null default now()
);
create index on public.memberships (hall_id);

create table public.invites (
  code       text primary key,
  hall_id    uuid not null references public.halls on delete cascade,
  created_by uuid references public.profiles on delete set null,
  expires_at timestamptz not null default now() + interval '14 days',
  max_uses   int not null default 50 check (max_uses between 1 and 500),
  uses       int not null default 0,
  created_at timestamptz not null default now()
);
create index on public.invites (hall_id);

create table public.shopping_items (
  id         uuid primary key default gen_random_uuid(),
  hall_id    uuid not null references public.halls on delete cascade,
  text       text not null check (length(trim(text)) between 1 and 200),
  done       boolean not null default false,
  created_by uuid references public.profiles on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.shopping_items (hall_id, done);

-- Et event eller opslag hører enten til en gang eller til hele kollegiet.
create table public.events (
  id          uuid primary key default gen_random_uuid(),
  hall_id     uuid references public.halls on delete cascade,
  dorm_id     uuid references public.dorms on delete cascade,
  title       text not null check (length(trim(title)) between 1 and 120),
  description text check (length(description) <= 2000),
  location    text check (length(location) <= 120),
  starts_at   timestamptz not null,
  ends_at     timestamptz,
  created_by  uuid references public.profiles on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  check ((hall_id is null) <> (dorm_id is null)),
  check (ends_at is null or ends_at >= starts_at)
);
create index on public.events (starts_at);

create table public.posts (
  id         uuid primary key default gen_random_uuid(),
  hall_id    uuid references public.halls on delete cascade,
  dorm_id    uuid references public.dorms on delete cascade,
  body       text not null check (length(trim(body)) between 1 and 4000),
  created_by uuid references public.profiles on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check ((hall_id is null) <> (dorm_id is null))
);
create index on public.posts (created_at desc);

-- ─────────────────────────────────────────────────────────────
-- Hjælpefunktioner til RLS (security definer, så de ikke selv rammer RLS)
-- ─────────────────────────────────────────────────────────────

-- Min gang, men kun hvis kollegiet er godkendt.
create or replace function public.my_active_hall()
returns uuid language sql stable security definer set search_path = '' as $$
  select m.hall_id
  from public.memberships m
  join public.halls h on h.id = m.hall_id
  join public.dorms d on d.id = h.dorm_id
  where m.user_id = auth.uid() and d.status = 'approved'
$$;

-- Mit kollegie, men kun hvis det er godkendt.
create or replace function public.my_active_dorm()
returns uuid language sql stable security definer set search_path = '' as $$
  select h.dorm_id
  from public.memberships m
  join public.halls h on h.id = m.hall_id
  join public.dorms d on d.id = h.dorm_id
  where m.user_id = auth.uid() and d.status = 'approved'
$$;

-- Mit kollegie uanset status (bruges til at vise "afventer godkendelse").
create or replace function public.my_dorm()
returns uuid language sql stable security definer set search_path = '' as $$
  select h.dorm_id
  from public.memberships m
  join public.halls h on h.id = m.hall_id
  where m.user_id = auth.uid()
$$;

create or replace function public.is_moderator_of(p_hall uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships
    where user_id = auth.uid() and hall_id = p_hall and is_moderator
  )
$$;

create or replace function public.is_superadmin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.superadmins where user_id = auth.uid())
$$;

-- Bor den anden bruger på samme kollegie som mig?
create or replace function public.shares_dorm(p_other uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.memberships m1
    join public.halls h1 on h1.id = m1.hall_id
    join public.memberships m2 on m2.user_id = p_other
    join public.halls h2 on h2.id = m2.hall_id
    where m1.user_id = auth.uid() and h1.dorm_id = h2.dorm_id
  )
$$;

-- ─────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────

alter table public.profiles       enable row level security;
alter table public.superadmins    enable row level security;
alter table public.dorms          enable row level security;
alter table public.halls          enable row level security;
alter table public.memberships    enable row level security;
alter table public.invites        enable row level security;
alter table public.shopping_items enable row level security;
alter table public.events         enable row level security;
alter table public.posts          enable row level security;

-- profiles: se dig selv og folk på dit kollegie; ret kun dig selv.
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_dorm(id) or public.is_superadmin());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- superadmins: man kan kun se, om man selv er det.
create policy superadmins_select on public.superadmins for select to authenticated
  using (user_id = auth.uid());

-- dorms: godkendte kollegier er synlige for alle; dit eget altid.
create policy dorms_select on public.dorms for select to authenticated
  using (status = 'approved' or id = public.my_dorm() or requested_by = auth.uid() or public.is_superadmin());

-- halls: dit eget kollegies gange.
create policy halls_select on public.halls for select to authenticated
  using (dorm_id = public.my_dorm() or public.is_superadmin());

-- memberships: din egen række og din gangs beboere.
create policy memberships_select on public.memberships for select to authenticated
  using (user_id = auth.uid() or hall_id = public.my_active_hall() or public.is_superadmin());

-- invites: kun moderatorer på gangen.
create policy invites_select on public.invites for select to authenticated
  using (public.is_moderator_of(hall_id) or created_by = auth.uid());
create policy invites_delete on public.invites for delete to authenticated
  using (public.is_moderator_of(hall_id));

-- shopping_items: alle på gangen kan alt.
create policy shopping_select on public.shopping_items for select to authenticated
  using (hall_id = public.my_active_hall());
create policy shopping_insert on public.shopping_items for insert to authenticated
  with check (hall_id = public.my_active_hall() and created_by = auth.uid());
create policy shopping_update on public.shopping_items for update to authenticated
  using (hall_id = public.my_active_hall()) with check (hall_id = public.my_active_hall());
create policy shopping_delete on public.shopping_items for delete to authenticated
  using (hall_id = public.my_active_hall());

-- events og posts: gang-niveau eller kollegie-niveau.
create policy events_select on public.events for select to authenticated
  using (hall_id = public.my_active_hall() or dorm_id = public.my_active_dorm());
create policy events_insert on public.events for insert to authenticated
  with check (created_by = auth.uid() and (hall_id = public.my_active_hall() or dorm_id = public.my_active_dorm()));
create policy events_update on public.events for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid() and (hall_id = public.my_active_hall() or dorm_id = public.my_active_dorm()));
create policy events_delete on public.events for delete to authenticated
  using (created_by = auth.uid() or (hall_id is not null and public.is_moderator_of(hall_id)) or public.is_superadmin());

create policy posts_select on public.posts for select to authenticated
  using (hall_id = public.my_active_hall() or dorm_id = public.my_active_dorm());
create policy posts_insert on public.posts for insert to authenticated
  with check (created_by = auth.uid() and (hall_id = public.my_active_hall() or dorm_id = public.my_active_dorm()));
create policy posts_update on public.posts for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid() and (hall_id = public.my_active_hall() or dorm_id = public.my_active_dorm()));
create policy posts_delete on public.posts for delete to authenticated
  using (created_by = auth.uid() or (hall_id is not null and public.is_moderator_of(hall_id)) or public.is_superadmin());

-- Kolonner, som klienten ikke selv må ændre.
revoke update on public.shopping_items from authenticated;
grant update (text, done) on public.shopping_items to authenticated;
revoke update on public.profiles from authenticated;
grant update (display_name, language) on public.profiles to authenticated;

-- ─────────────────────────────────────────────────────────────
-- Ny bruger → profil
-- ─────────────────────────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, language)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)), 60),
    case when new.raw_user_meta_data ->> 'language' = 'en' then 'en' else 'da' end
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- Funktioner (RPC), som appen kalder
-- ─────────────────────────────────────────────────────────────

-- Anmod om at registrere et nyt kollegie. Anmoderen bliver moderator
-- på den gang, vedkommende selv bor på.
create or replace function public.request_dorm(p_name text, p_address text, p_halls text[], p_my_hall text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_dorm uuid;
  v_hall uuid;
  v_name text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if exists (select 1 from public.memberships where user_id = auth.uid()) then
    raise exception 'already_member';
  end if;
  if coalesce(array_length(p_halls, 1), 0) = 0 or array_length(p_halls, 1) > 50 then
    raise exception 'invalid_halls';
  end if;
  if not (trim(p_my_hall) = any (select trim(x) from unnest(p_halls) x)) then
    raise exception 'my_hall_not_in_list';
  end if;

  insert into public.dorms (name, address, requested_by)
  values (trim(p_name), nullif(trim(p_address), ''), auth.uid())
  returning id into v_dorm;

  foreach v_name in array p_halls loop
    if length(trim(v_name)) > 0 then
      insert into public.halls (dorm_id, name) values (v_dorm, trim(v_name))
      on conflict (dorm_id, name) do nothing;
    end if;
  end loop;

  select id into v_hall from public.halls where dorm_id = v_dorm and name = trim(p_my_hall);
  insert into public.memberships (user_id, hall_id, is_moderator) values (auth.uid(), v_hall, true);
  return v_dorm;
end $$;

-- Superadmin: liste over kollegier, der venter på godkendelse.
create or replace function public.pending_dorms()
returns table (id uuid, name text, address text, created_at timestamptz, requester_email text, requester_name text, hall_names text[])
language sql stable security definer set search_path = '' as $$
  select d.id, d.name, d.address, d.created_at, u.email::text, p.display_name,
         array(select h.name from public.halls h where h.dorm_id = d.id order by h.name)
  from public.dorms d
  left join auth.users u on u.id = d.requested_by
  left join public.profiles p on p.id = d.requested_by
  where d.status = 'pending' and public.is_superadmin()
  order by d.created_at
$$;

create or replace function public.decide_dorm(p_dorm uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_superadmin() then raise exception 'forbidden'; end if;
  update public.dorms set status = case when p_approve then 'approved' else 'rejected' end
  where id = p_dorm and status = 'pending';
  if not p_approve then
    -- Frigiv anmoderen, så vedkommende kan prøve igen eller joine et andet kollegie.
    delete from public.memberships m using public.halls h
    where m.hall_id = h.id and h.dorm_id = p_dorm;
  end if;
end $$;

-- Moderator: tilføj en ny gang til sit kollegie.
create or replace function public.create_hall(p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_hall uuid;
begin
  if not exists (
    select 1 from public.memberships where user_id = auth.uid() and is_moderator
  ) or public.my_active_dorm() is null then
    raise exception 'forbidden';
  end if;
  insert into public.halls (dorm_id, name) values (public.my_active_dorm(), trim(p_name))
  returning id into v_hall;
  return v_hall;
end $$;

-- Moderator: lav en invitationskode til en gang på sit kollegie.
create or replace function public.create_invite(p_hall uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_code text;
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if not exists (
    select 1 from public.memberships m
    join public.halls h on h.id = p_hall
    where m.user_id = auth.uid() and m.is_moderator and h.dorm_id = public.my_active_dorm()
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

-- Beboer: brug en invitationskode.
create or replace function public.join_with_code(p_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_inv public.invites;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if exists (select 1 from public.memberships where user_id = auth.uid()) then
    raise exception 'already_member';
  end if;
  select i.* into v_inv
  from public.invites i
  join public.halls h on h.id = i.hall_id
  join public.dorms d on d.id = h.dorm_id
  where i.code = upper(trim(p_code)) and i.expires_at > now() and i.uses < i.max_uses and d.status = 'approved'
  for update of i;
  if not found then raise exception 'invalid_code'; end if;
  insert into public.memberships (user_id, hall_id) values (auth.uid(), v_inv.hall_id);
  update public.invites set uses = uses + 1 where code = v_inv.code;
  -- Første beboer på en ny gang bliver moderator.
  perform public.ensure_moderator(v_inv.hall_id);
  return v_inv.hall_id;
end $$;

-- Sørger for, at en gang med beboere altid har mindst én moderator.
create or replace function public.ensure_moderator(p_hall uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.memberships where hall_id = p_hall and is_moderator) then
    update public.memberships set is_moderator = true
    where user_id = (
      select user_id from public.memberships where hall_id = p_hall order by joined_at limit 1
    );
  end if;
end $$;
revoke execute on function public.ensure_moderator(uuid) from public, anon, authenticated;

-- Beboer: forlad sin gang.
create or replace function public.leave_hall()
returns void language plpgsql security definer set search_path = '' as $$
declare v_hall uuid;
begin
  delete from public.memberships where user_id = auth.uid() returning hall_id into v_hall;
  if v_hall is not null then perform public.ensure_moderator(v_hall); end if;
end $$;

-- Moderator: smid en beboer ud af gangen.
create or replace function public.remove_member(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_hall uuid;
begin
  select hall_id into v_hall from public.memberships where user_id = p_user;
  if v_hall is null or not public.is_moderator_of(v_hall) or p_user = auth.uid() then
    raise exception 'forbidden';
  end if;
  delete from public.memberships where user_id = p_user;
  perform public.ensure_moderator(v_hall);
end $$;

-- Moderator: gør en beboer til moderator, eller fjern titlen igen.
create or replace function public.set_moderator(p_user uuid, p_value boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_hall uuid;
begin
  select hall_id into v_hall from public.memberships where user_id = p_user;
  if v_hall is null or not public.is_moderator_of(v_hall) then raise exception 'forbidden'; end if;
  if not p_value and not exists (
    select 1 from public.memberships where hall_id = v_hall and is_moderator and user_id <> p_user
  ) then
    raise exception 'last_moderator';
  end if;
  update public.memberships set is_moderator = p_value where user_id = p_user;
end $$;

-- Beboer: slet sin konto og sine data (GDPR).
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
declare v_hall uuid;
begin
  select hall_id into v_hall from public.memberships where user_id = auth.uid();
  delete from auth.users where id = auth.uid();
  if v_hall is not null then perform public.ensure_moderator(v_hall); end if;
end $$;

-- Hjælpefunktioner må kun kaldes af indloggede brugere.
revoke execute on all functions in schema public from anon;

-- ─────────────────────────────────────────────────────────────
-- Live-opdatering
-- ─────────────────────────────────────────────────────────────

alter publication supabase_realtime add table public.shopping_items, public.posts, public.events;
