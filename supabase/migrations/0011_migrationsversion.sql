-- KollegieAppen (KA) · Hold styr på hvilke migrationer der er kørt
-- Kør én gang i SQL Editor (efter 0010).
--
-- Tabellen har én række pr. migration. Den nuværende version er det højeste nummer.
-- Fremover slutter hver migration med en linje, der registrerer dens eget nummer:
--   insert into public.schema_migrations (version, name) values (12, '0012_navn')
--   on conflict (version) do update set applied_at = now();
--
-- Se status:  select * from public.schema_migrations order by version;

create table if not exists public.schema_migrations (
  version    int primary key,
  name       text not null,
  applied_at timestamptz not null default now()
);
alter table public.schema_migrations enable row level security;

drop policy if exists schema_migrations_select on public.schema_migrations;
create policy schema_migrations_select on public.schema_migrations for select to authenticated
  using (public.is_superadmin());

-- Registrér de tidligere migrationer, men kun dem, der faktisk er kørt
-- (afgøres ud fra, om det, de opretter, findes i databasen).
do $$
declare
  cron_ok boolean := false;
begin
  if to_regclass('cron.job') is not null then
    execute $q$select exists (select 1 from cron.job where jobname = 'ka-cleaning-reminders')$q$ into cron_ok;
  end if;

  insert into public.schema_migrations (version, name, applied_at)
  select v, n, now() from (values
    (1,  '0001_fase1',               to_regclass('public.dorms') is not null),
    (2,  '0002_rediger_events',      to_regclass('public.dorm_board') is not null),
    (3,  '0003_rediger_opslag',      exists (select 1 from information_schema.columns
                                             where table_schema = 'public' and table_name = 'posts' and column_name = 'edited_at')),
    (4,  '0004_fase2',               to_regclass('public.push_subscriptions') is not null),
    (5,  '0005_paamindelser_cron',   cron_ok),
    (6,  '0006_fase3',               to_regclass('public.dorm_admins') is not null),
    (7,  '0007_tjanser',             exists (select 1 from information_schema.columns
                                             where table_schema = 'public' and table_name = 'cleaning_tasks' and column_name = 'emoji')),
    (8,  '0008_profil_og_events',    to_regclass('public.profile_details') is not null),
    (9,  '0009_kollegieoversigt',    to_regprocedure('public.set_dorm_address(uuid, text)') is not null),
    (10, '0010_venskab_fremleje',    exists (select 1 from pg_constraint
                                             where conname = 'posts_friends_check'
                                               and pg_get_constraintdef(oid) like '%sublet%'))
  ) as m(v, n, ok)
  where ok
  on conflict (version) do nothing;
end $$;

-- Superadmin: nuværende version og hvilke numre der mangler (bruges af appen).
create or replace function public.schema_status()
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when public.is_superadmin() then jsonb_build_object(
    'version', (select max(version) from public.schema_migrations),
    'applied', (select coalesce(jsonb_agg(version order by version), '[]'::jsonb) from public.schema_migrations)
  ) end
$$;
revoke execute on function public.schema_status() from anon;

insert into public.schema_migrations (version, name) values (11, '0011_migrationsversion')
on conflict (version) do update set applied_at = now();

notify pgrst, 'reload schema';
