# KollegieAppen (KA)

Indkøbsliste, kalender og opslagstavle for gangen og kollegiet. En web-app (PWA), der kan lægges på hjemmeskærmen.

- **Frontend:** React + Vite + TypeScript, hostet på GitHub Pages (`https://kollegieappen.github.io`)
- **Backend:** Supabase (login, Postgres med Row Level Security, live-opdatering)

## Opsætning (én gang)

1. **Database:** Supabase → SQL Editor → New query → indsæt `supabase/migrations/0001_fase1.sql` → Run.
2. **Gør dig selv til superadmin** (efter du har oprettet en konto i appen):
   ```sql
   insert into public.superadmins (user_id)
   select id from auth.users where email = 'DIN@MAIL.DK';
   ```
3. **Login-links:** Supabase → Authentication → URL Configuration
   - Site URL: `https://kollegieappen.github.io`
   - Redirect URLs: `https://kollegieappen.github.io/**` og `http://localhost:5173/**`
4. **GitHub Pages:** repository → Settings → Pages → Source: **GitHub Actions**.

Hver push til `main` bygger og udgiver appen automatisk.

## Opdateringer af databasen

Kør filerne i `supabase/migrations/` i nummerrækkefølge i SQL Editor. Hver fil køres kun én gang.

Tabellen `public.schema_migrations` har én række pr. kørt migration. Se status med
`select * from public.schema_migrations order by version;` eller under Admin i appen (superadmin).

**Ny migration:** giv filen næste nummer (fx `0012_navn.sql`), afslut den med

```sql
insert into public.schema_migrations (version, name) values (12, '0012_navn')
on conflict (version) do update set applied_at = now();
```

og sæt `EXPECTED_DB_VERSION` i `src/lib/supabase.ts` til samme nummer.

## Push-notifikationer (fase 2)

1. Supabase → Edge Functions → Deploy a new function → Via Editor. Navn: `push`. Indsæt `supabase/functions/push/index.ts` og deploy.
2. Edge Functions → Secrets: tilføj `VAPID_PUBLIC_KEY` og `VAPID_PRIVATE_KEY`. Den offentlige nøgle står i `src/lib/push.ts`. Den private nøgle ligger ikke i repository'et.
3. Kør `0005_paamindelser_cron.sql`, så rengøringspåmindelser sendes hver time.

## Lokal udvikling

```bash
npm install
npm run dev
```

## Struktur

| Sti | Indhold |
| --- | --- |
| `supabase/migrations/` | Tabeller, RLS-regler og funktioner |
| `supabase/functions/push/` | Sender push-notifikationer |
| `src/lib/` | Supabase-klient, login-session, dansk/engelsk tekst |
| `src/pages/` | Skærmene: Indkøb, Kalender, Opslag, Gangen, Mig, Admin |
| `.github/workflows/deploy.yml` | Bygger og udgiver til GitHub Pages |
