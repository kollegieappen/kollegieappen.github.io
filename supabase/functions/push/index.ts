// KollegieAppen · Edge Function "push"
// Sender web push-notifikationer.
//
//   { "type": "shopping" }   – en beboer giver gangen besked om indkøbslisten (kræver login)
//   { "type": "reminders" }  – sender forfaldne påmindelser om tjanser (rengøring, fællesspisning …) (kaldes af cron)
//
// Secrets, der skal sættes i Supabase (Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY
// SUPABASE_URL, SUPABASE_ANON_KEY og SUPABASE_SERVICE_ROLE_KEY findes automatisk.

import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

webpush.setVapidDetails(
  'https://kollegieappen.github.io',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!
)

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

type Message = { title: string; body: string; url?: string; tag?: string }

/** Sender en besked til hver bruger på deres eget sprog. */
async function sendTo(userIds: string[], build: (lang: 'da' | 'en') => Message) {
  if (userIds.length === 0) return 0
  const [{ data: subs }, { data: profiles }] = await Promise.all([
    admin.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth').in('user_id', userIds),
    admin.from('profiles').select('id, language').in('id', userIds)
  ])
  const langOf = new Map((profiles ?? []).map((p) => [p.id, p.language === 'en' ? 'en' : 'da'] as const))
  let sent = 0
  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(build(langOf.get(s.user_id) ?? 'da')),
          { TTL: 60 * 60 * 12 }
        )
        sent++
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode
        // Abonnementet findes ikke længere (app slettet, tilladelse fjernet).
        if (code === 404 || code === 410) await admin.from('push_subscriptions').delete().eq('id', s.id)
        else console.error('push failed', code, (e as Error).message)
      }
    })
  )
  return sent
}

async function shopping(req: Request) {
  const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return json({ error: 'not_authenticated' }, 401)

  // Brugerens aktive gang (en superadmin kan være på flere).
  const [{ data: rows }, { data: prof }] = await Promise.all([
    admin.from('memberships').select('hall_id, joined_at, halls(name, dorms(status))').eq('user_id', user.id).order('joined_at'),
    admin.from('profiles').select('current_hall_id').eq('id', user.id).maybeSingle()
  ])
  const me = (rows ?? []).find((r) => r.hall_id === prof?.current_hall_id) ?? (rows ?? [])[0]
  const hall = me?.halls as unknown as { name: string; dorms: { status: string } } | null
  if (!me || hall?.dorms.status !== 'approved') return json({ error: 'forbidden' }, 403)

  const [{ data: items }, { data: members }, { data: profile }] = await Promise.all([
    admin.from('shopping_items').select('text').eq('hall_id', me.hall_id).eq('done', false).order('created_at'),
    admin.from('memberships').select('user_id').eq('hall_id', me.hall_id).neq('user_id', user.id),
    admin.from('profiles').select('display_name').eq('id', user.id).maybeSingle()
  ])
  const list = (items ?? []).map((i) => i.text)
  if (list.length === 0) return json({ sent: 0, reason: 'empty' })

  let summary = list.slice(0, 8).join(', ')
  if (list.length > 8) summary += ` (+${list.length - 8})`
  const who = profile?.display_name || '?'
  const sent = await sendTo((members ?? []).map((m) => m.user_id), (lang) => ({
    title: lang === 'da' ? `Indkøb · ${hall!.name}` : `Shopping · ${hall!.name}`,
    body: lang === 'da' ? `${who}: Vi mangler ${summary}` : `${who}: We need ${summary}`,
    url: '/#/',
    tag: 'shopping'
  }))
  return json({ sent })
}

/** Dato og time lige nu i Danmark. */
function nowInCopenhagen() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Copenhagen', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date())
  const get = (t: string) => parts.find((p) => p.type === t)!.value
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) }
}

async function reminders() {
  const { date, hour } = nowInCopenhagen()
  const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)
  const tomorrow = d.toISOString().slice(0, 10)
  const { data: shifts } = await admin
    .from('cleaning_shifts')
    .select('id, user_id, date, cleaning_tasks(title, description, remind_hour, remind_days_before, emoji)')
    .in('date', [date, tomorrow])
    .eq('reminded', false)
    .not('user_id', 'is', null)
  type Task = { title: string; description: string | null; remind_hour: number; remind_days_before: number; emoji: string }
  const due = (shifts ?? []).filter((s) => {
    const task = s.cleaning_tasks as unknown as Task | null
    if (!task || task.remind_hour > hour) return false
    return task.remind_days_before === 1 ? s.date === tomorrow : s.date === date
  })
  let sent = 0
  for (const s of due) {
    const task = s.cleaning_tasks as unknown as Task
    const soon = s.date === tomorrow
    sent += await sendTo([s.user_id!], (lang) => ({
      title: `${task.emoji ?? ''} ${task.title} ${lang === 'da' ? (soon ? 'i morgen' : 'i dag') : (soon ? 'tomorrow' : 'today')}`.trim(),
      body: task.description || (lang === 'da' ? (soon ? 'Det er din tur i morgen.' : 'Det er din tur i dag.') : (soon ? "It's your turn tomorrow." : "It's your turn today.")),
      url: '/#/gang',
      tag: 'duty-' + s.id
    }))
    await admin.from('cleaning_shifts').update({ reminded: true }).eq('id', s.id)
  }
  const birthdays = hour >= 8 ? await birthdayGreetings(date) : 0
  return json({ date, hour, due: due.length, sent, birthdays })
}

/** Giv gangen besked om dagens fødselsdage (én gang pr. person pr. år). */
async function birthdayGreetings(date: string) {
  const [y, m, d] = date.split('-').map(Number)
  const { data: people } = await admin
    .from('profile_details').select('user_id, profiles(display_name)').eq('birth_month', m).eq('birth_day', d)
  let sent = 0
  for (const p of people ?? []) {
    const { error } = await admin.from('birthday_log').insert({ user_id: p.user_id, year: y })
    if (error) continue // allerede sendt i år
    const { data: mine } = await admin.from('memberships').select('hall_id').eq('user_id', p.user_id)
    if (!mine?.length) continue
    const { data: hall } = await admin.from('memberships').select('user_id').in('hall_id', mine.map((m) => m.hall_id)).neq('user_id', p.user_id)
    const name = (p.profiles as unknown as { display_name: string } | null)?.display_name ?? '?'
    sent += await sendTo([...new Set((hall ?? []).map((x) => x.user_id))], (lang) => ({
      title: lang === 'da' ? `🎂 ${name} har fødselsdag i dag` : `🎂 It's ${name}'s birthday today`,
      body: lang === 'da' ? 'Husk at sige tillykke!' : 'Remember to say happy birthday!',
      url: '/#/kalender',
      tag: 'birthday-' + p.user_id
    }))
  }
  return sent
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { type } = await req.json().catch(() => ({ type: null }))
    if (type === 'shopping') return await shopping(req)
    if (type === 'reminders') return await reminders()
    return json({ error: 'unknown_type' }, 400)
  } catch (e) {
    console.error(e)
    return json({ error: (e as Error).message }, 500)
  }
})
