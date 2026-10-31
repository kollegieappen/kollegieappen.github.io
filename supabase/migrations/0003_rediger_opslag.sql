-- KollegieAppen (KA) · Redigering af opslag + vis afsenderens gang
-- Kør hele filen én gang i SQL Editor (efter 0002).

-- Opslag kan redigeres af den, der skrev det (reglen findes allerede i posts_update).
-- Kun teksten kan ændres, og tidspunktet for seneste redigering gemmes.
alter table public.posts add column if not exists edited_at timestamptz;

create or replace function public.touch_edited_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.edited_at := now();
  return new;
end $$;

drop trigger if exists posts_edited on public.posts;
create trigger posts_edited
  before update of body on public.posts
  for each row when (old.body is distinct from new.body)
  execute function public.touch_edited_at();

revoke update on public.posts from authenticated;
grant update (body) on public.posts to authenticated;

-- Beboere kan se, hvilken gang andre på kollegiet bor på
-- (så town square kan vise afsenderens gang).
drop policy if exists memberships_select on public.memberships;
create policy memberships_select on public.memberships for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.halls h
      where h.id = memberships.hall_id and h.dorm_id = public.my_active_dorm()
    )
    or public.is_superadmin()
  );

notify pgrst, 'reload schema';
