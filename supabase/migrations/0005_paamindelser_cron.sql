-- KollegieAppen (KA) · Rengøringspåmindelser hver time
-- Kør først, når Edge Function "push" er oprettet (se README).
--
-- Kalder push-funktionen 2 minutter over hver hele time. Funktionen sender kun
-- påmindelser for vagter i dag, hvis tidspunkt er passeret, og kun én gang pr. vagt,
-- så det er ufarligt, hvis den kaldes ekstra gange.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.unschedule('ka-cleaning-reminders')
where exists (select 1 from cron.job where jobname = 'ka-cleaning-reminders');

-- Nøglen herunder er projektets offentlige anon-nøgle (samme som appen bruger).
select cron.schedule(
  'ka-cleaning-reminders',
  '2 * * * *',
  $$
  select net.http_post(
    url     := 'https://repwwjwbgcmthgaojcym.supabase.co/functions/v1/push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJlcHd3andiZ2NtdGhnYW9qY3ltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0NTQ1NzUsImV4cCI6MjEwOTAzMDU3NX0.bHL1WbJcPTylfkbCGgKr5525_-DIn3YaVbYh9ZYpVak'
    ),
    body    := '{"type":"reminders"}'::jsonb
  );
  $$
);
