import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { supabase, errorKey } from '../lib/supabase'
import { useI18n } from '../lib/i18n'
import { useSession } from '../lib/session'
import { EditIcon, TopBar, TrashIcon, relTime, useRealtime } from '../ui'

type Scope = 'hall' | 'dorm' | 'friends'
type Ev = {
  id: string; hall_id: string | null; dorm_id: string | null; title: string
  description: string | null; location: string | null; starts_at: string; ends_at: string | null
  created_by: string | null; is_friends: boolean; author: { display_name: string } | null; dorm: { name: string } | null
}
type Reaction = { event_id: string; user_id: string; kind: 'heart' | 'cross' }
type Birthday = { user_id: string; birth_month: number; birth_day: number; birth_year: number | null; profile: { display_name: string } | null }

const scopeOf = (e: Ev): Scope => (e.is_friends ? 'friends' : e.hall_id ? 'hall' : 'dorm')

const pad = (n: number) => String(n).padStart(2, '0')
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const localTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }

export default function Calendar() {
  const { t, locale } = useI18n()
  const { membership, session, isSuperadmin, isBoard, hasFriends } = useSession()
  const [view, setView] = useState<'list' | 'month'>(() => {
    try { return sessionStorage.getItem('ka.calView') === 'month' ? 'month' : 'list' } catch { return 'list' }
  })
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [selected, setSelected] = useState(localDate(new Date()))
  const [events, setEvents] = useState<Ev[] | null>(null)
  const [reactions, setReactions] = useState<Reaction[]>([])
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({})
  const [birthdays, setBirthdays] = useState<Birthday[]>([])
  const [filter, setFilter] = useState<'all' | Scope>('all')
  const [editing, setEditing] = useState<Ev | null>(null)
  const [formKey, setFormKey] = useState(0)
  const dialog = useRef<HTMLDialogElement>(null)

  // Månedsvisningen viser hele uger (mandag–søndag).
  const gridStart = addDays(month, -((month.getDay() + 6) % 7))
  const gridEnd = addDays(gridStart, 42)
  const today0 = new Date(); today0.setHours(0, 0, 0, 0)
  const from = view === 'month' ? gridStart : today0
  const fromKey = from.toISOString()
  const toKey = view === 'month' ? gridEnd.toISOString() : null

  const load = useCallback(async () => {
    let q = supabase
      .from('events')
      .select('id, hall_id, dorm_id, title, description, location, starts_at, ends_at, created_by, is_friends, author:profiles(display_name), dorm:dorms(name)')
      .or(`hall_id.eq.${membership!.hall_id},dorm_id.eq.${membership!.dorm.id},is_friends.eq.true`)
      .gte('starts_at', fromKey)
      .order('starts_at')
      .limit(300)
    if (toKey) q = q.lt('starts_at', toKey)
    const { data } = await q
    const list = (data as unknown as Ev[]) ?? []
    setEvents(list)
    const ids = list.map((e) => e.id)
    if (ids.length) {
      const [r, c] = await Promise.all([
        supabase.from('event_reactions').select('event_id, user_id, kind').in('event_id', ids),
        supabase.from('event_comments').select('event_id').in('event_id', ids)
      ])
      setReactions((r.data as Reaction[]) ?? [])
      const counts: Record<string, number> = {}
      for (const x of (c.data as { event_id: string }[]) ?? []) counts[x.event_id] = (counts[x.event_id] ?? 0) + 1
      setCommentCounts(counts)
    }
  }, [membership, fromKey, toKey])

  useEffect(() => { load() }, [load])
  useRealtime(['events', 'event_reactions', 'event_comments'], load)
  useEffect(() => {
    supabase.from('profile_details').select('user_id, birth_month, birth_day, birth_year, profile:profiles(display_name)')
      .not('birth_month', 'is', null)
      .then(({ data }) => setBirthdays((data as unknown as Birthday[]) ?? []))
  }, [])

  // Samme regel som i databasen: opretter, moderator, bestyrelse eller superadmin.
  const canManage = (e: Ev) =>
    e.created_by === session?.user.id || isSuperadmin ||
    ((!!e.hall_id || e.dorm_id === membership!.dorm.id) && (isBoard || !!membership?.is_moderator))

  function open(ev: Ev | null) {
    setEditing(ev)
    setFormKey((k) => k + 1)
    dialog.current?.showModal()
  }

  async function remove(ev: Ev) {
    if (!confirm(t('common.confirm'))) return
    await supabase.from('events').delete().eq('id', ev.id)
    load()
  }

  function pickView(v: 'list' | 'month') {
    setView(v)
    try { sessionStorage.setItem('ka.calView', v) } catch { /* ignore */ }
  }

  const shown = (events ?? []).filter((e) => filter === 'all' || scopeOf(e) === filter)
  const days = new Map<string, Ev[]>()
  for (const e of shown) {
    const k = localDate(new Date(e.starts_at))
    days.set(k, [...(days.get(k) ?? []), e])
  }
  // Fødselsdage (kollegiet) i det viste tidsrum.
  const bdays = new Map<string, Birthday[]>()
  if (filter === 'all' || filter === 'dorm' || filter === 'hall') {
    const end = view === 'month' ? gridEnd : addDays(today0, 60)
    for (let d = new Date(from); d < end; d = addDays(d, 1)) {
      const hits = birthdays.filter((b) => b.birth_month === d.getMonth() + 1 && b.birth_day === d.getDate())
      if (hits.length) bdays.set(localDate(d), hits)
    }
  }
  const allKeys = [...new Set([...days.keys(), ...bdays.keys()])].sort()

  const today = localDate(new Date())
  const tomorrow = localDate(addDays(new Date(), 1))
  const dayLabel = (k: string) => {
    const d = new Date(k + 'T12:00:00')
    const name = d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })
    if (k === today) return `${t('cal.today')} · ${name}`
    if (k === tomorrow) return `${t('cal.tomorrow')} · ${name}`
    return name.charAt(0).toUpperCase() + name.slice(1)
  }

  const renderDay = (k: string, showHead = true) => (
    <section key={k}>
      {showHead && <div className="day-head">{dayLabel(k)}</div>}
      <div className="stack">
        {(bdays.get(k) ?? []).map((b) => (
          <div className="card row" key={'b' + b.user_id} style={{ background: 'color-mix(in srgb, var(--accent) 12%, var(--surface))' }}>
            <span style={{ fontSize: 20 }}>🎂</span>
            <span className="grow">
              {t('cal.birthday', { name: b.profile?.display_name ?? '—' })}
              {b.birth_year && <span className="muted small"> · {t('cal.turns', { n: Number(k.slice(0, 4)) - b.birth_year })}</span>}
            </span>
          </div>
        ))}
        {(days.get(k) ?? []).map((e) => (
          <EventCard
            key={e.id} e={e} canManage={canManage(e)} reactions={reactions.filter((r) => r.event_id === e.id)}
            commentCount={commentCounts[e.id] ?? 0} onEdit={() => open(e)} onDelete={() => remove(e)} onChange={load}
          />
        ))}
      </div>
    </section>
  )

  const weekdayLabels = Array.from({ length: 7 }, (_, i) =>
    addDays(new Date(2024, 0, 1), i).toLocaleDateString(locale, { weekday: 'narrow' }))

  return (
    <>
      <TopBar title={t('cal.title')} />
      <main className="stack">
        <div className="row">
          <div className="seg grow">
            {(['all', 'hall', 'dorm', ...(hasFriends ? ['friends'] as const : [])] as const).map((f) => (
              <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
                {t(f === 'all' ? 'common.all' : f === 'hall' ? 'common.hall' : f === 'dorm' ? 'common.dorm' : 'cal.friends')}
              </button>
            ))}
          </div>
          <div className="seg" style={{ flex: 'none' }}>
            <button className={view === 'list' ? 'on' : ''} onClick={() => pickView('list')} aria-label={t('cal.list')}>☰</button>
            <button className={view === 'month' ? 'on' : ''} onClick={() => pickView('month')} aria-label={t('cal.month')}>▦</button>
          </div>
        </div>

        {view === 'month' && (
          <>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <button className="icon" style={{ fontSize: 20 }} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="←">‹</button>
              <strong style={{ textTransform: 'capitalize' }}>{month.toLocaleDateString(locale, { month: 'long', year: 'numeric' })}</strong>
              <button className="icon" style={{ fontSize: 20 }} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="→">›</button>
            </div>
            <div className="month">
              {weekdayLabels.map((w, i) => <div key={i} className="month-wd">{w}</div>)}
              {Array.from({ length: 42 }, (_, i) => {
                const d = addDays(gridStart, i)
                const k = localDate(d)
                const n = days.get(k)?.length ?? 0
                const cls = ['month-day', d.getMonth() !== month.getMonth() ? 'out' : '', k === today ? 'today' : '', k === selected ? 'sel' : ''].join(' ')
                return (
                  <button key={k} className={cls} onClick={() => setSelected(k)}>
                    <span>{d.getDate()}</span>
                    <span className="month-marks">
                      {bdays.has(k) && '🎂'}
                      {n > 0 && <span className="month-dot">{n > 1 ? n : ''}</span>}
                    </span>
                  </button>
                )
              })}
            </div>
            <div className="day-head">{dayLabel(selected)}</div>
            {days.has(selected) || bdays.has(selected)
              ? renderDay(selected, false)
              : <div className="muted small" style={{ padding: '0 4px' }}>{t('cal.noneThisDay')}</div>}
          </>
        )}

        {view === 'list' && (
          events === null ? (
            <div className="empty">{t('common.loading')}</div>
          ) : allKeys.length === 0 ? (
            <div className="empty">{t('cal.empty')}</div>
          ) : (
            <div>{allKeys.map((k) => renderDay(k))}</div>
          )
        )}
      </main>
      <button className="fab" onClick={() => open(null)}>+ {t('cal.new')}</button>
      <dialog ref={dialog}>
        <EventForm
          key={formKey}
          event={editing}
          defaultDate={view === 'month' ? selected : undefined}
          onDone={() => { dialog.current?.close(); load() }}
          onCancel={() => dialog.current?.close()}
        />
      </dialog>
    </>
  )
}

function EventCard({ e, canManage, reactions, commentCount, onEdit, onDelete, onChange }: {
  e: Ev; canManage: boolean; reactions: Reaction[]; commentCount: number
  onEdit: () => void; onDelete: () => void; onChange: () => void
}) {
  const { t, locale } = useI18n()
  const { session } = useSession()
  const me = session!.user.id
  const [showComments, setShowComments] = useState(false)
  const mine = reactions.find((r) => r.user_id === me)?.kind
  const hearts = reactions.filter((r) => r.kind === 'heart').length
  const crosses = reactions.filter((r) => r.kind === 'cross').length
  const time = (iso: string) => new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })

  async function react(kind: 'heart' | 'cross') {
    await supabase.from('event_reactions').delete().eq('event_id', e.id).eq('user_id', me)
    if (mine !== kind) await supabase.from('event_reactions').insert({ event_id: e.id, kind })
    onChange()
  }

  const pill = (active: boolean) => ({
    padding: '4px 10px', fontSize: 13, fontWeight: 600,
    borderColor: active ? 'var(--brand)' : 'var(--line)', borderWidth: active ? 2 : 1, color: 'var(--ink)'
  })

  return (
    <div className="card">
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="event-time">{time(e.starts_at)}</div>
        <div className="grow">
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <strong>{e.title}</strong>
            <span className={'badge' + (e.dorm_id ? ' dorm' : '')}>
              {e.is_friends ? `${t('cal.friends')} · ${e.dorm?.name ?? ''}` : t(e.dorm_id ? 'common.dorm' : 'common.hall')}
            </span>
          </div>
          <div className="muted small">
            {e.ends_at && <>– {time(e.ends_at)} · </>}
            {e.location && <>{e.location} · </>}
            {e.author?.display_name}
          </div>
          {e.description && <div className="post small" style={{ marginTop: 6 }}>{e.description}</div>}
        </div>
        {canManage && (
          <div className="row" style={{ gap: 0 }}>
            <button className="icon" onClick={onEdit} aria-label={t('cal.edit')}><EditIcon /></button>
            <button className="icon" onClick={onDelete} aria-label={t('common.delete')}><TrashIcon /></button>
          </div>
        )}
      </div>
      <div className="row" style={{ marginTop: 10, gap: 6 }}>
        <button className="ghost" style={pill(mine === 'heart')} onClick={() => react('heart')} aria-pressed={mine === 'heart'}>❤️ {hearts}</button>
        <button className="ghost" style={pill(mine === 'cross')} onClick={() => react('cross')} aria-pressed={mine === 'cross'}>❌ {crosses}</button>
        <button className="ghost" style={{ ...pill(showComments), marginLeft: 'auto' }} onClick={() => setShowComments((v) => !v)}>
          💬 {commentCount}
        </button>
      </div>
      {showComments && <Comments eventId={e.id} canModerate={canManage} onChange={onChange} />}
    </div>
  )
}

function Comments({ eventId, canModerate, onChange }: { eventId: string; canModerate: boolean; onChange: () => void }) {
  const { t, locale } = useI18n()
  const { session } = useSession()
  const [list, setList] = useState<{ id: string; body: string; created_at: string; created_by: string | null; author: { display_name: string } | null }[] | null>(null)
  const [body, setBody] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.from('event_comments')
      .select('id, body, created_at, created_by, author:profiles(display_name)').eq('event_id', eventId).order('created_at')
    setList((data as unknown as typeof list) ?? [])
  }, [eventId])
  useEffect(() => { load() }, [load])

  async function send(ev: FormEvent) {
    ev.preventDefault()
    if (!body.trim()) return
    await supabase.from('event_comments').insert({ event_id: eventId, body: body.trim() })
    setBody('')
    load(); onChange()
  }

  async function remove(id: string) {
    await supabase.from('event_comments').delete().eq('id', id)
    load(); onChange()
  }

  return (
    <div className="stack" style={{ gap: 8, marginTop: 10, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
      {list?.map((c) => (
        <div key={c.id} className="small">
          <div className="row" style={{ gap: 6 }}>
            <strong>{c.author?.display_name ?? '—'}</strong>
            <span className="muted">{relTime(c.created_at, locale)}</span>
            {(c.created_by === session!.user.id || canModerate) && (
              <button className="icon" style={{ marginLeft: 'auto', padding: 2 }} onClick={() => remove(c.id)} aria-label={t('common.delete')}><TrashIcon /></button>
            )}
          </div>
          <div className="post">{c.body}</div>
        </div>
      ))}
      <form className="row" onSubmit={send}>
        <input className="grow" value={body} onChange={(e) => setBody(e.target.value)} placeholder={t('cal.comment')} maxLength={1000} />
        <button type="submit" disabled={!body.trim()}>{t('board.post')}</button>
      </form>
    </div>
  )
}

function EventForm({ event, defaultDate, onDone, onCancel }: { event: Ev | null; defaultDate?: string; onDone: () => void; onCancel: () => void }) {
  const { t } = useI18n()
  const { membership, hasFriends } = useSession()
  const start0 = event ? new Date(event.starts_at) : null
  const [title, setTitle] = useState(event?.title ?? '')
  const [date, setDate] = useState(start0 ? localDate(start0) : defaultDate ?? localDate(new Date()))
  const [start, setStart] = useState(start0 ? localTime(start0) : '18:00')
  const [end, setEnd] = useState(event?.ends_at ? localTime(new Date(event.ends_at)) : '')
  const [location, setLocation] = useState(event?.location ?? '')
  const [description, setDescription] = useState(event?.description ?? '')
  const [scope, setScope] = useState<Scope>(event ? scopeOf(event) : 'hall')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    const startsAt = new Date(`${date}T${start}`)
    let endsAt: Date | null = end ? new Date(`${date}T${end}`) : null
    if (endsAt && endsAt < startsAt) endsAt = new Date(endsAt.getTime() + 86400000) // slutter efter midnat
    const fields = {
      title: title.trim(),
      location: location.trim() || null,
      description: description.trim() || null,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt?.toISOString() ?? null
    }
    const { error } = event
      ? await supabase.from('events').update(fields).eq('id', event.id)
      : await supabase.from('events').insert({
          ...fields,
          hall_id: scope === 'hall' ? membership!.hall_id : null,
          dorm_id: scope !== 'hall' ? membership!.dorm.id : null,
          is_friends: scope === 'friends'
        })
    setBusy(false)
    if (error) return setError(t(errorKey(error)))
    onDone()
  }

  return (
    <form className="stack" onSubmit={submit}>
      <strong style={{ fontSize: 18 }}>{t(event ? 'cal.edit' : 'cal.new')}</strong>
      <div>
        <label htmlFor="et">{t('cal.what')}</label>
        <input id="et" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} />
      </div>
      <div>
        <label htmlFor="ed">{t('cal.date')}</label>
        <input id="ed" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </div>
      <div className="row">
        <div className="grow">
          <label htmlFor="es">{t('cal.start')}</label>
          <input id="es" type="time" value={start} onChange={(e) => setStart(e.target.value)} required />
        </div>
        <div className="grow">
          <label htmlFor="ee">{t('cal.end')}</label>
          <input id="ee" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>
      <div>
        <label htmlFor="el">{t('cal.where')}</label>
        <input id="el" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={120} />
      </div>
      <div>
        <label htmlFor="ex">{t('cal.desc')}</label>
        <textarea id="ex" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
      </div>
      {!event && (
        <div>
          <label>{t('cal.for')}</label>
          <div className="seg">
            <button type="button" className={scope === 'hall' ? 'on' : ''} onClick={() => setScope('hall')}>{membership!.hall.name}</button>
            <button type="button" className={scope === 'dorm' ? 'on' : ''} onClick={() => setScope('dorm')}>{membership!.dorm.name}</button>
            {hasFriends && <button type="button" className={scope === 'friends' ? 'on' : ''} onClick={() => setScope('friends')}>{t('cal.friends')}</button>}
          </div>
        </div>
      )}
      {error && <div className="error">{error}</div>}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="ghost" onClick={onCancel}>{t('common.cancel')}</button>
        <button type="submit" disabled={busy}>{t('common.save')}</button>
      </div>
    </form>
  )
}
