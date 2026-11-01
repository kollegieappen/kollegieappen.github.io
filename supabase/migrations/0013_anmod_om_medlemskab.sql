-- KollegieAppen (KA) · Anmod om at blive medlem af en bestemt gang
-- Kør én gang i SQL Editor (efter 0012).
--
-- En bruger vælger kollegie og gang og sender en anmodning. Gangens moderatorer,
-- kollegiets administration eller superadmin godkender eller afviser.

create table if not exists public.join_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles on delete cascade,
  hall_id     uuid not null references public.halls on delete cascade,
  message     text not null default '' check (length(message) <= 500),
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by  uuid references public.profiles on delete set null,
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);
-- Højst én åben anmodning pr. bruger.
create unique index if not exists join_requests_one_pending on public.join_requests (user_id) where status = 'pending';
create index if not exists join_requests_hall on public.join_requests (hall_id) where status = 'pending';
alter table public.join_requests enable row level security;

drop policy if exists jr_select on public.join_requests;
drop policy if exists jr_delete on public.join_requests;
create policy jr_select on public.join_requests for select to authenticated
  using (user_id = auth.uid() or public.can_manage_hall(hall_id));
create policy jr_delete on public.join_requests for delete to authenticated
  using (user_id = auth.uid() and status = 'pending');
revoke insert, update on public.join_requests from authenticated;

-- Gangene på et kollegie (til at vælge gang, før man er medlem).
create or replace function public.dorm_halls(p_dorm uuid)
returns table (id uuid, name text, resident_count int)
language sql stable security definer set search_path = '' as $$
  select h.id, h.name, (select count(*)::int from public.memberships m where m.hall_id = h.id)
  from public.halls h
  join public.dorms d on d.id = h.dorm_id
  where h.dorm_id = p_dorm and d.status = 'approved' and auth.uid() is not null
    and (not d.is_test or public.is_superadmin()
         or coalesce((select x.is_test from public.dorms x where x.id = public.my_active_dorm()), false))
  order by h.name
$$;

create or replace function public.request_join(p_hall uuid, p_message text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if exists (select 1 from public.memberships where user_id = auth.uid()) and not public.is_superadmin() then
    raise exception 'already_member';
  end if;
  if exists (select 1 from public.memberships where user_id = auth.uid() and hall_id = p_hall) then
    raise exception 'already_member';
  end if;
  if not exists (
    select 1 from public.halls h join public.dorms d on d.id = h.dorm_id
    where h.id = p_hall and d.status = 'approved'
  ) then
    raise exception 'invalid_hall';
  end if;
  if exists (select 1 from public.join_requests where user_id = auth.uid() and status = 'pending') then
    raise exception 'request_pending';
  end if;
  insert into public.join_requests (user_id, hall_id, message)
  values (auth.uid(), p_hall, left(coalesce(trim(p_message), ''), 500))
  returning id into v_id;
  return v_id;
end $$;

-- Åbne anmodninger til gange, man kan styre (med navn og e-mail på den, der anmoder).
create or replace function public.pending_join_requests(p_dorm uuid default null)
returns table (id uuid, hall_id uuid, hall_name text, user_name text, user_email text, message text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id, r.hall_id, h.name, p.display_name, u.email::text, r.message, r.created_at
  from public.join_requests r
  join public.halls h on h.id = r.hall_id
  join public.profiles p on p.id = r.user_id
  join auth.users u on u.id = r.user_id
  where r.status = 'pending'
    and public.can_manage_hall(r.hall_id)
    and (p_dorm is null or h.dorm_id = p_dorm)
  order by r.created_at
$$;

create or replace function public.decide_join(p_id uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_req public.join_requests;
begin
  select * into v_req from public.join_requests where id = p_id and status = 'pending' for update;
  if not found or not public.can_manage_hall(v_req.hall_id) then raise exception 'forbidden'; end if;

  if p_approve then
    if exists (select 1 from public.memberships where user_id = v_req.user_id)
       and not exists (select 1 from public.superadmins where user_id = v_req.user_id) then
      -- Personen er kommet ind på en anden gang i mellemtiden.
      update public.join_requests set status = 'rejected', decided_by = auth.uid(), decided_at = now() where id = p_id;
      raise exception 'already_member';
    end if;
    insert into public.memberships (user_id, hall_id) values (v_req.user_id, v_req.hall_id) on conflict do nothing;
    update public.profiles set current_hall_id = v_req.hall_id where id = v_req.user_id;
    perform public.ensure_moderator(v_req.hall_id);
  end if;

  update public.join_requests
  set status = case when p_approve then 'approved' else 'rejected' end, decided_by = auth.uid(), decided_at = now()
  where id = p_id;
end $$;

revoke execute on function public.dorm_halls(uuid), public.request_join(uuid, text),
  public.pending_join_requests(uuid), public.decide_join(uuid, boolean) from anon;

alter publication supabase_realtime add table public.join_requests;

insert into public.schema_migrations (version, name) values (13, '0013_anmod_om_medlemskab')
on conflict (version) do update set applied_at = now();

notify pgrst, 'reload schema';
