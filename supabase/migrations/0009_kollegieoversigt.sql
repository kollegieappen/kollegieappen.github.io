-- KollegieAppen (KA) · Oversigt over kollegier med adresse og størrelse
-- (bruges når bestyrelsen finder et venskabskollegie). Kør én gang i SQL Editor (efter 0008).

drop function if exists public.approved_dorms();

create or replace function public.approved_dorms()
returns table (id uuid, name text, address text, hall_count int, resident_count int)
language sql stable security definer set search_path = '' as $$
  select d.id, d.name, d.address,
         (select count(*)::int from public.halls h where h.dorm_id = d.id),
         (select count(*)::int from public.memberships m join public.halls h on h.id = m.hall_id where h.dorm_id = d.id)
  from public.dorms d
  where d.status = 'approved' and auth.uid() is not null
  order by d.name
$$;

-- Bestyrelse, administration eller superadmin: ret kollegiets adresse.
create or replace function public.set_dorm_address(p_dorm uuid, p_address text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (public.is_board_of(p_dorm) or public.is_admin_of(p_dorm) or public.is_superadmin()) then
    raise exception 'forbidden';
  end if;
  update public.dorms set address = nullif(left(trim(p_address), 160), '') where id = p_dorm;
end $$;

revoke execute on function public.approved_dorms(), public.set_dorm_address(uuid, text) from anon;

notify pgrst, 'reload schema';
