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

## Lokal udvikling

```bash
npm install
npm run dev
```

## Struktur

| Sti | Indhold |
| --- | --- |
| `supabase/migrations/` | Tabeller, RLS-regler og funktioner |
| `src/lib/` | Supabase-klient, login-session, dansk/engelsk tekst |
| `src/pages/` | Skærmene: Indkøb, Kalender, Opslag, Gangen, Mig, Admin |
| `.github/workflows/deploy.yml` | Bygger og udgiver til GitHub Pages |
