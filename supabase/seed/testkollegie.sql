-- KollegieAppen (KA) · Testkollegie med dummy-data
--
-- Opretter "🧪 Testkollegiet" og "🧪 Testvenskabskollegiet" med brugere, der kan logge ind,
-- og data på alle skærme. Kør hele filen i SQL Editor (efter alle migrationer).
-- Den kan køres igen: eksisterende testdata slettes først.
-- Fjern det hele igen med slet_testdata.sql.
--
-- Alle testbrugere har e-mail på @kollegieappen.test og samme adgangskode (sæt den herunder).
--
--   Rolle            E-mail                                   Gang
--   Beboer           beboer@kollegieappen.test                1. sal
--   Moderator        moderator@kollegieappen.test             1. sal
--   Bestyrelse       bestyrelse@kollegieappen.test            2. sal
--   Administration   administration@kollegieappen.test        (bor ikke på kollegiet)
--   Venskab          venskab@kollegieappen.test               Testvenskabskollegiet (bestyrelse)
--
-- Superadmin er ikke med: det er din egen konto.

create or replace function public._ka_seed_user(p_email text, p_name text, p_password text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  ) values (
    v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('display_name', p_name, 'language', 'da'), now(), now(),
    '', '', '', '', '', '', '', ''
  );
  insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id::text, v_id,
          jsonb_build_object('sub', v_id::text, 'email', p_email, 'email_verified', true),
          'email', now(), now(), now());
  return v_id;
end $$;

do $$
declare
  v_pw    text := 'SKIFT-MIG';   -- ← adgangskode til alle testbrugere
  d1      uuid; d2 uuid;           -- Testkollegiet, Testvenskabskollegiet
  h1      uuid; h2 uuid; h3 uuid; hv uuid;
  -- rollebrugere
  bo uuid; mia uuid; bent uuid; anna uuid; vera uuid;
  -- øvrige beboere
  sofie uuid; jonas uuid; karl uuid; freja uuid; ali uuid; emma uuid;
  t_clean uuid; t_dinner uuid; t_trash uuid;
  p_poll uuid; o1 uuid; o2 uuid; o3 uuid;
  e_fest uuid; e_film uuid; e_venskab uuid;
  m1 uuid; m2 uuid;
  day date; members uuid[]; idx int; slot int;
  tz text := 'Europe/Copenhagen';
begin
  if v_pw = 'SKIFT-MIG' then raise exception 'Sæt en adgangskode i v_pw øverst i scriptet'; end if;

  -- Ryd tidligere testdata
  delete from public.dorms where name in ('🧪 Testkollegiet', '🧪 Testvenskabskollegiet');
  delete from auth.users where email like '%@kollegieappen.test';

  -- Kollegier og gange
  insert into public.dorms (name, address, status) values ('🧪 Testkollegiet', 'Testvej 1, 2200 København N', 'approved') returning id into d1;
  insert into public.dorms (name, address, status) values ('🧪 Testvenskabskollegiet', 'Prøvegade 42, 8000 Aarhus C', 'approved') returning id into d2;
  insert into public.halls (dorm_id, name) values (d1, '1. sal') returning id into h1;
  insert into public.halls (dorm_id, name) values (d1, '2. sal') returning id into h2;
  insert into public.halls (dorm_id, name) values (d1, 'Køkken A') returning id into h3;
  insert into public.halls (dorm_id, name) values (d2, 'Stuen') returning id into hv;

  -- Brugere
  bo    := public._ka_seed_user('beboer@kollegieappen.test',         'Bo Beboer',           v_pw);
  mia   := public._ka_seed_user('moderator@kollegieappen.test',      'Mia Moderator',       v_pw);
  bent  := public._ka_seed_user('bestyrelse@kollegieappen.test',     'Bent Bestyrelse',     v_pw);
  anna  := public._ka_seed_user('administration@kollegieappen.test', 'Anna Administration', v_pw);
  vera  := public._ka_seed_user('venskab@kollegieappen.test',        'Vera Venskab',        v_pw);
  sofie := public._ka_seed_user('sofie@kollegieappen.test',          'Sofie Sørensen',      v_pw);
  jonas := public._ka_seed_user('jonas@kollegieappen.test',          'Jonas Jensen',        v_pw);
  karl  := public._ka_seed_user('karl@kollegieappen.test',           'Karl Kristensen',     v_pw);
  freja := public._ka_seed_user('freja@kollegieappen.test',          'Freja Frederiksen',   v_pw);
  ali   := public._ka_seed_user('ali@kollegieappen.test',            'Ali Hassan',          v_pw);
  emma  := public._ka_seed_user('emma@kollegieappen.test',           'Emma Nielsen',        v_pw);

  -- Medlemskaber og roller
  insert into public.memberships (user_id, hall_id, is_moderator, joined_at) values
    (mia,   h1, true,  now() - interval '300 days'),
    (bo,    h1, false, now() - interval '200 days'),
    (sofie, h1, false, now() - interval '150 days'),
    (jonas, h1, false, now() - interval '60 days'),
    (karl,  h2, true,  now() - interval '400 days'),
    (bent,  h2, false, now() - interval '250 days'),
    (freja, h2, false, now() - interval '90 days'),
    (ali,   h3, true,  now() - interval '120 days'),
    (emma,  h3, false, now() - interval '30 days'),
    (vera,  hv, true,  now() - interval '100 days');
  insert into public.dorm_board (dorm_id, user_id) values (d1, bent), (d1, freja), (d2, vera);
  insert into public.dorm_admins (dorm_id, user_id) values (d1, anna);
  insert into public.dorm_friendships (from_dorm, to_dorm, status) values (d1, d2, 'accepted');
  insert into public.invites (code, hall_id, created_by, expires_at, max_uses) values ('TESTKA', h1, mia, now() + interval '1 year', 50);

  -- Profiler: telefon, fødselsdag, om mig, madvaner
  insert into public.phone_numbers (user_id, phone) values
    (bo, '20 11 22 33'), (mia, '30 44 55 66'), (sofie, '40 77 88 99'), (bent, '50 12 34 56'), (ali, '60 98 76 54');
  insert into public.profile_details (user_id, birth_month, birth_day, birth_year, about) values
    (sofie, extract(month from current_date)::int, extract(day from current_date)::int, 2002, 'Læser medicin på 4. semester. Bager gerne kage til gangen 🍰'),
    (jonas, extract(month from current_date + 5)::int, extract(day from current_date + 5)::int, null, 'Datalogi på KU. Spørg mig om computere.'),
    (bo,    3, 14, 2001, 'Jura-studerende fra Aalborg. Spiller fodbold om tirsdagen.'),
    (mia,   7, 2, 1999, 'Moderator på 1. sal. Skriv endelig, hvis der er noget!'),
    (bent,  11, 20, 1998, 'Formand for bestyrelsen.'),
    (emma,  extract(month from current_date + 12)::int, extract(day from current_date + 12)::int, 2003, 'Ny på kollegiet – hej alle!'),
    (freja, 1, 30, 2000, '');
  insert into public.diet_info (user_id, tags, note) values
    (bo,    '{vegetarian}', ''),
    (sofie, '{gluten,nuts}', 'Meget allergisk over for nødder'),
    (jonas, '{}', 'Ingen koriander, tak'),
    (emma,  '{vegan}', ''),
    (ali,   '{halal}', '');

  -- Indkøbsliste
  insert into public.shopping_items (hall_id, text, done, created_by) values
    (h1, 'Mælk', false, bo), (h1, 'Toiletpapir', false, mia), (h1, 'Opvaskemiddel', false, sofie),
    (h1, 'Kaffe', false, jonas), (h1, 'Rugbrød', true, bo), (h1, 'Æg', true, mia),
    (h2, 'Skraldeposer', false, karl), (h2, 'Smør', false, freja),
    (h3, 'Ris', false, ali);

  -- Kalender
  insert into public.events (dorm_id, title, description, location, starts_at, ends_at, created_by)
    values (d1, 'Julefrokost 🎄', 'Tag en ret med til det fælles bord. Bestyrelsen sørger for snaps.', 'Fælleshuset',
            ((current_date + 6)::timestamp + time '18:00') at time zone tz, ((current_date + 7)::timestamp + time '01:00') at time zone tz, bent)
    returning id into e_fest;
  insert into public.events (hall_id, title, description, location, starts_at, created_by)
    values (h1, 'Filmaften', 'Vi ser en klassiker. Popcorn er købt.', 'Køkkenet på 1. sal',
            ((current_date + 2)::timestamp + time '20:00') at time zone tz, sofie)
    returning id into e_film;
  insert into public.events (hall_id, title, location, starts_at, created_by) values
    (h1, 'Gangmøde', 'Køkkenet', ((current_date + 9)::timestamp + time '19:00') at time zone tz, mia),
    (h1, 'Brunch', 'Køkkenet', ((current_date - 3)::timestamp + time '11:00') at time zone tz, bo),
    (h2, 'Spilaften 🎲', 'Køkkenet på 2. sal', ((current_date + 4)::timestamp + time '19:30') at time zone tz, freja);
  insert into public.events (dorm_id, title, description, location, starts_at, created_by) values
    (d1, 'Generalforsamling', 'Valg til bestyrelsen og budget for næste år.', 'Fælleshuset', ((current_date + 20)::timestamp + time '19:00') at time zone tz, bent),
    (d1, 'Vicevært: vandet lukkes', 'Vandet er lukket i hele bygningen.', null, ((current_date + 1)::timestamp + time '09:00') at time zone tz, anna);
  insert into public.events (dorm_id, is_friends, title, description, location, starts_at, created_by)
    values (d1, true, 'Venskabsfest med Testvenskabskollegiet', 'Fælles fest for begge kollegier.', 'Fælleshuset',
            ((current_date + 14)::timestamp + time '20:00') at time zone tz, bent)
    returning id into e_venskab;
  insert into public.event_reactions (event_id, user_id, kind) values
    (e_fest, bo, 'heart'), (e_fest, mia, 'heart'), (e_fest, sofie, 'heart'), (e_fest, karl, 'heart'), (e_fest, jonas, 'cross'),
    (e_film, bo, 'heart'), (e_film, mia, 'cross'),
    (e_venskab, vera, 'heart'), (e_venskab, freja, 'heart');
  insert into public.event_comments (event_id, body, created_by, created_at) values
    (e_fest, 'Jeg tager frikadeller med!', sofie, now() - interval '5 hours'),
    (e_fest, 'Er der nogen der har en ekstra stol?', jonas, now() - interval '2 hours'),
    (e_film, 'Hvilken film?', bo, now() - interval '1 hour'),
    (e_venskab, 'Vi glæder os! Vi kommer ca. 15 stykker 🎉', vera, now() - interval '1 day');

  -- Opslag
  insert into public.posts (hall_id, body, created_by, created_at) values
    (h1, 'Hvem har lånt den store gryde? Den har været væk siden fredag 🙃', mia, now() - interval '3 hours'),
    (h1, 'Der er kage i køleskabet – tag bare!', sofie, now() - interval '1 day'),
    (h2, 'Husk at tømme opvaskemaskinen, når den er færdig.', karl, now() - interval '2 days');
  insert into public.posts (dorm_id, body, kind, created_by, created_at) values
    (d1, 'Vandet lukkes i morgen kl. 9-12 pga. reparation i kælderen.', 'announcement', anna, now() - interval '4 hours'),
    (d1, 'Tilmelding til julefrokosten senest fredag. Skriv i kommentarerne på eventet.', 'announcement', bent, now() - interval '1 day'),
    (d1, 'Fremlejer mit værelse i januar–februar. 18 m², møbleret, 3.900 kr./md. Skriv for billeder.', 'sublet', jonas, now() - interval '6 hours'),
    (d1, 'Er der nogen, der vil med til fodbold tirsdag aften?', 'post', bo, now() - interval '8 hours');
  insert into public.posts (dorm_id, body, created_by, created_at)
    values (d1, 'Hvad skal vi have til julefrokosten?', mia, now() - interval '10 hours')
    returning id into p_poll;
  insert into public.poll_options (post_id, label, position) values (p_poll, 'Flæskesteg', 0) returning id into o1;
  insert into public.poll_options (post_id, label, position) values (p_poll, 'And', 1) returning id into o2;
  insert into public.poll_options (post_id, label, position) values (p_poll, 'Vegetarisk buffet', 2) returning id into o3;
  insert into public.poll_votes (post_id, option_id, user_id) values
    (p_poll, o1, karl), (p_poll, o1, jonas), (p_poll, o2, mia), (p_poll, o3, bo), (p_poll, o3, emma), (p_poll, o3, sofie);
  insert into public.posts (dorm_id, is_friends, body, created_by, created_at) values
    (d2, true, 'Hej Testkollegiet! Vi har lånt jeres højttaler – I får den tilbage til venskabsfesten 😄', vera, now() - interval '1 day'),
    (d1, true, 'Velkommen til jer fra Testvenskabskollegiet!', bent, now() - interval '2 days');

  -- Anonym brevkasse og rapporter
  insert into public.anon_messages (hall_id, body, sender_id, created_at)
    values (h1, 'Kan vi blive bedre til at rydde op efter os selv i køkkenet? Det er lidt træls at starte med andres opvask.', jonas, now() - interval '2 days');
  insert into public.anon_messages (hall_id, body, sender_id, created_at)
    values (h1, 'Musikken om natten fra værelse 12 er for høj.', bo, now() - interval '1 day')
    returning id into m1;
  insert into public.anon_messages (hall_id, body, sender_id, created_at)
    values (h1, 'Nogen spiser altid min yoghurt. Det er ikke i orden.', sofie, now() - interval '5 hours')
    returning id into m2;
  insert into public.reports (message_id, hall_id, reporter_id, reason, to_admin) values
    (m1, h1, mia, 'Nævner et værelsesnummer', false),
    (m2, h1, jonas, 'Føles som en anklage', true);

  -- Fælles ting
  insert into public.shared_items (hall_id, title, description, owner_id, created_by) values
    (h1, 'Chokoladekage', 'I køleskabet, nederste hylde', sofie, sofie),
    (h1, 'Opvasketabs', 'Under vasken', null, mia),
    (h1, 'Boremaskine', 'Spørg før du låner', jonas, jonas),
    (h2, 'Brætspil', 'I skabet ved sofaen', null, karl);

  -- Praktisk info
  insert into public.info_items (hall_id, question, answer, updated_by) values
    (h1, 'Hvor har vi wc-rens?', 'Under vasken på badeværelset ved trappen.', mia),
    (h1, 'Hvornår kommer skraldemanden?', 'Tirsdag morgen. Sæt skraldet ud mandag aften.', mia),
    (h1, 'Wi-Fi-kode', 'Spørg en moderator.', mia);
  insert into public.info_items (dorm_id, question, answer, updated_by) values
    (d1, 'Hvordan booker jeg vaskeriet?', 'På tavlen i kælderen. Max 2 tider ad gangen.', bent),
    (d1, 'Hvem kontakter jeg ved skader?', 'Viceværten: Anna, via Opslag eller administrationen.', anna);

  -- Tjanser
  insert into public.cleaning_tasks (hall_id, title, description, weekdays, remind_hour, emoji, people_per_shift, remind_days_before, signup_enabled)
    values (h1, 'Køkkenrengøring', 'Tør borde af, tøm opvasker, fej gulv og tag skraldet med ned.', '{1,4}', 10, '🧹', 1, 0, false)
    returning id into t_clean;
  insert into public.cleaning_tasks (hall_id, title, description, weekdays, remind_hour, emoji, people_per_shift, remind_days_before, signup_enabled)
    values (h1, 'Fællesspisning', 'Køb ind og lav mad til dem, der er tilmeldt. Spisning kl. 18.30.', '{3}', 12, '🍝', 2, 1, true)
    returning id into t_dinner;
  insert into public.cleaning_tasks (hall_id, title, weekdays, remind_hour, emoji)
    values (h2, 'Skrald og pant', '{2}', 9, '🗑️')
    returning id into t_trash;

  -- Plan for de næste 4 uger (beboerne på skift)
  select array_agg(user_id order by joined_at) into members from public.memberships where hall_id = h1;
  idx := 0;
  for day in select g::date from generate_series(current_date, current_date + 27, interval '1 day') g loop
    if extract(isodow from day)::smallint = any ('{1,4}'::smallint[]) then
      idx := idx % array_length(members, 1) + 1;
      insert into public.cleaning_shifts (task_id, hall_id, date, slot, user_id) values (t_clean, h1, day, 1, members[idx]);
    end if;
  end loop;
  idx := 0;
  for day in select g::date from generate_series(current_date, current_date + 27, interval '1 day') g loop
    if extract(isodow from day) = 3 then
      for slot in 1..2 loop
        idx := idx % array_length(members, 1) + 1;
        insert into public.cleaning_shifts (task_id, hall_id, date, slot, user_id) values (t_dinner, h1, day, slot, members[idx]);
      end loop;
      insert into public.duty_signups (task_id, date, user_id) values
        (t_dinner, day, bo), (t_dinner, day, sofie), (t_dinner, day, jonas);
    end if;
  end loop;
  select array_agg(user_id order by joined_at) into members from public.memberships where hall_id = h2;
  idx := 0;
  for day in select g::date from generate_series(current_date, current_date + 27, interval '1 day') g loop
    if extract(isodow from day) = 2 then
      idx := idx % array_length(members, 1) + 1;
      insert into public.cleaning_shifts (task_id, hall_id, date, slot, user_id) values (t_trash, h2, day, 1, members[idx]);
    end if;
  end loop;

  raise notice 'Testkollegiet er oprettet. Log ind med fx beboer@kollegieappen.test';
end $$;

drop function public._ka_seed_user(text, text, text);
