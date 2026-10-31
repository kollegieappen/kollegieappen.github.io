-- KollegieAppen (KA) · Profil (fødselsdag, om mig, madvaner), tilmelding til tjanser
-- (fx "Jeg spiser med"), kommentarer og reaktioner på events.
-- Kør hele filen én gang i SQL Editor (efter 0007).

-- ─────────────────────────────────────────────────────────────
-- Profil: fødselsdag og "om mig" — synligt for hele kollegiet
-- ─────────────────────────────────────────────────────────────

create table if not exists public.profile_details (
  user_id     uuid primary key default auth.uid() references public.profiles on delete cascade,
  birth_month smallint check (birth_month between 1 and 12),
  birth_day   smallint check (birth_day between 1 and 31),
  birth_year  smallint check (birth_year between 1900 and 2100),
  about       text not null default '' check (length(about) <= 500),
  check ((birth_month is null) = (birth_day is null))
);
alter table public.profile_details enable row level security;

-- Bor den anden på samme (godkendte) kollegie som mig?
create or replace function public.in_my_dorm(p_other uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m join public.halls h on h.id = m.hall_id
    where m.user_id = p_other and h.dorm_id = public.my_active_dorm()
  )
$$;

create or replace function public.in_my_hall(p_other uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m where m.user_id = p_other and m.hall_id = public.my_active_hall()
  )
$$;

drop policy if exists details_select on public.profile_details;
drop policy if exists details_write on public.profile_details;
create policy details_select on public.profile_details for select to authenticated
  using (user_id = auth.uid() or public.in_my_dorm(user_id));
create policy details_write on public.profile_details for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- Allergier og madvaner — kun synligt for ens egen gang
-- ─────────────────────────────────────────────────────────────

create table if not exists public.diet_info (
  user_id uuid primary key default auth.uid() references public.profiles on delete cascade,
  tags    text[] not null default '{}' check (cardinality(tags) <= 20),
  note    text not null default '' check (length(note) <= 300)
);
alter table public.diet_info enable row level security;

drop policy if exists diet_select on public.diet_info;
drop policy if exists diet_write on public.diet_info;
create policy diet_select on public.diet_info for select to authenticated
  using (user_id = auth.uid() or public.in_my_hall(user_id));
create policy diet_write on public.diet_info for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- Tilmelding til en tjans-dag (fx "Jeg spiser med" til fællesspisning)
-- ─────────────────────────────────────────────────────────────

alter table public.cleaning_tasks
  add column if not exists signup_enabled boolean not null default false;

create table if not exists public.duty_signups (
  task_id    uuid not null references public.cleaning_tasks on delete cascade,
  date       date not null,
  user_id    uuid not null default auth.uid() references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, date, user_id)
);
alter table public.duty_signups enable row level security;

drop policy if exists signups_select on public.duty_signups;
drop policy if exists signups_insert on public.duty_signups;
drop policy if exists signups_delete on public.duty_signups;
create policy signups_select on public.duty_signups for select to authenticated
  using (exists (select 1 from public.cleaning_tasks t where t.id = task_id and t.hall_id = public.my_active_hall()));
create policy signups_insert on public.duty_signups for insert to authenticated
  with check (
    user_id = auth.uid() and date >= current_date
    and exists (select 1 from public.cleaning_tasks t where t.id = task_id and t.hall_id = public.my_active_hall() and t.signup_enabled)
  );
create policy signups_delete on public.duty_signups for delete to authenticated
  using (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- Kommentarer og reaktioner (❤️ / ❌) på events
-- Synlige for alle, der kan se eventet.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.event_comments (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events on delete cascade,
  body       text not null check (length(trim(body)) between 1 and 1000),
  created_by uuid references public.profiles on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists event_comments_event on public.event_comments (event_id, created_at);
alter table public.event_comments enable row level security;

drop policy if exists comments_select on public.event_comments;
drop policy if exists comments_insert on public.event_comments;
drop policy if exists comments_delete on public.event_comments;
create policy comments_select on public.event_comments for select to authenticated
  using (exists (select 1 from public.events e where e.id = event_id));
create policy comments_insert on public.event_comments for insert to authenticated
  with check (created_by = auth.uid() and exists (select 1 from public.events e where e.id = event_id));
create policy comments_delete on public.event_comments for delete to authenticated
  using (
    created_by = auth.uid()
    or exists (select 1 from public.events e where e.id = event_id and public.can_manage_event(e.hall_id, e.dorm_id, e.created_by))
  );
revoke update on public.event_comments from authenticated;

create table if not exists public.event_reactions (
  event_id uuid not null references public.events on delete cascade,
  user_id  uuid not null default auth.uid() references public.profiles on delete cascade,
  kind     text not null check (kind in ('heart', 'cross')),
  primary key (event_id, user_id)
);
alter table public.event_reactions enable row level security;

drop policy if exists reactions_select on public.event_reactions;
drop policy if exists reactions_insert on public.event_reactions;
drop policy if exists reactions_delete on public.event_reactions;
create policy reactions_select on public.event_reactions for select to authenticated
  using (exists (select 1 from public.events e where e.id = event_id));
create policy reactions_insert on public.event_reactions for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.events e where e.id = event_id));
create policy reactions_delete on public.event_reactions for delete to authenticated
  using (user_id = auth.uid());
revoke update on public.event_reactions from authenticated;

-- ─────────────────────────────────────────────────────────────
-- Fødselsdagsbeskeder: logger, hvem der er sendt besked om, så det kun sker én gang pr. år
-- (bruges kun af push-funktionen).
-- ─────────────────────────────────────────────────────────────

create table if not exists public.birthday_log (
  user_id uuid not null references public.profiles on delete cascade,
  year    smallint not null,
  primary key (user_id, year)
);
alter table public.birthday_log enable row level security;

revoke execute on function public.in_my_dorm(uuid), public.in_my_hall(uuid) from anon;

alter publication supabase_realtime add table public.duty_signups, public.event_comments, public.event_reactions;

notify pgrst, 'reload schema';
