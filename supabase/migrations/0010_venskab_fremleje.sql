-- KollegieAppen (KA) · Fremleje-opslag også for venskabskollegier
-- Kør én gang i SQL Editor (efter 0009).

alter table public.posts drop constraint if exists posts_friends_check;
alter table public.posts add constraint posts_friends_check
  check (not is_friends or (dorm_id is not null and kind in ('post', 'sublet')));
