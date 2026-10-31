import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { supabase, errorKey, type Scope } from '../lib/supabase'
import { useI18n } from '../lib/i18n'
import { useSession } from '../lib/session'
import { TopBar, TrashIcon, useRealtime } from '../ui'

type Ev = {
  id: string; hall_id: string | null; dorm_id: string | null; title: string
  description: string | null; location: string | null; starts_at: string; ends_at: string | null
  created_by: string | null; author: { display_name: string } | null
}

const pad = (n: number) => String(n).padStart(2, '0')
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export default function Calendar() {
  const { t, locale } = useI18n()
  const { membership, session } = useSession()
  const [events, setEvents] = useState<Ev[] | null>(null)
  const [filter, setFilter] = useState<'all' | Scope>('all')
  const dialog = useRef<HTMLDialogElement>(null)

  const load = useCallback(async () => {
    const start = new Date(); start.setHours(0, 0, 0, 0)
    const { data } = await supabase
      .from('events')
      .select('id, hall_id, dorm_id, title, description, location, starts_at, ends_at, created_by, author:profiles(display_name)')
      .gte('starts_at', start.toISOString())
      .order('starts_at')
      .limit(200)
    setEvents((data as unknown as Ev[]) ?? [])
  }, [])

  useEffect(() => { load() }, [load])
  useRealtime(['events'], load)

  async function remove(ev: Ev) {
    if (!confirm(t('common.confirm'))) return
    await supabase.from('events').delete().eq('id', ev.id)
    load()
  }

  const shown = (events ?? []).filter((e) => filter === 'all' || (filter === 'hall' ? e.hall_id : e.dorm_id))
  const days = new Map<string, Ev[]>()
  for (const e of shown) {
    const k = localDate(new Date(e.starts_at))
    days.set(k, [...(days.get(k) ?? []), e])
  }
  const today = localDate(new Date())
  const tomorrow = localDate(new Date(Date.now() + 86400000))
  const dayLabel = (k: string) => {
    const d = new Date(k + 'T12:00:00')
    const name = d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })
    if (k === today) return `${t('cal.today')} · ${name}`
    if (k === tomorrow) return `${t('cal.tomorrow')} · ${name}`
    return name.charAt(0).toUpperCase() + name.slice(1)
  }
  const time = (iso: string) => new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })

  return (
    <>
      <TopBar title={t('cal.title')} />
      <main className="stack">
        <div className="seg">
          {(['all', 'hall', 'dorm'] as const).map((f) => (
            <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
              {t(f === 'all' ? 'common.all' : f === 'hall' ? 'common.hall' : 'common.dorm')}
            </button>
          ))}
        </div>

        {events === null ? (
          <div className="empty">{t('common.loading')}</div>
        ) : shown.length === 0 ? (
          <div className="empty">{t('cal.empty')}</div>
        ) : (
          <div>
            {[...days.entries()].map(([k, list]) => (
              <section key={k}>
                <div className="day-head">{dayLabel(k)}</div>
                <div className="stack">
                  {list.map((e) => {
                    const canDelete = e.created_by === session?.user.id || (e.hall_id && membership?.is_moderator)
                    return (
                      <div className="card row" key={e.id} style={{ alignItems: 'flex-start' }}>
                        <div className="event-time">{time(e.starts_at)}</div>
                        <div className="grow">
                          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                            <strong>{e.title}</strong>
                            <span className={'badge' + (e.dorm_id ? ' dorm' : '')}>{t(e.dorm_id ? 'common.dorm' : 'common.hall')}</span>
                          </div>
                          <div className="muted small">
                            {e.ends_at && <>– {time(e.ends_at)} · </>}
                            {e.location && <>{e.location} · </>}
                            {e.author?.display_name}
                          </div>
                          {e.description && <div className="post small" style={{ marginTop: 6 }}>{e.description}</div>}
                        </div>
                        {canDelete && (
                          <button className="icon" onClick={() => remove(e)} aria-label={t('common.delete')}><TrashIcon /></button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
      <button className="fab" onClick={() => dialog.current?.showModal()}>+ {t('cal.new')}</button>
      <dialog ref={dialog}>
        <NewEvent onDone={() => { dialog.current?.close(); load() }} onCancel={() => dialog.current?.close()} />
      </dialog>
    </>
  )
}

function NewEvent({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { t } = useI18n()
  const { membership } = useSession()
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(localDate(new Date()))
  const [start, setStart] = useState('18:00')
  const [end, setEnd] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [scope, setScope] = useState<Scope>('hall')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    const startsAt = new Date(`${date}T${start}`)
    let endsAt: Date | null = end ? new Date(`${date}T${end}`) : null
    if (endsAt && endsAt < startsAt) endsAt = new Date(endsAt.getTime() + 86400000) // slutter efter midnat
    const { error } = await supabase.from('events').insert({
      title: title.trim(),
      location: location.trim() || null,
      description: description.trim() || null,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt?.toISOString() ?? null,
      hall_id: scope === 'hall' ? membership!.hall_id : null,
      dorm_id: scope === 'dorm' ? membership!.dorm.id : null
    })
    setBusy(false)
    if (error) return setError(t(errorKey(error)))
    setTitle(''); setLocation(''); setDescription(''); setEnd('')
    onDone()
  }

  return (
    <form className="stack" onSubmit={submit}>
      <strong style={{ fontSize: 18 }}>{t('cal.new')}</strong>
      <div>
        <label htmlFor="et">{t('cal.what')}</label>
        <input id="et" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} />
      </div>
      <div className="row">
        <div className="grow">
          <label htmlFor="ed">{t('cal.date')}</label>
          <input id="ed" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
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
      <div>
        <label>{t('cal.for')}</label>
        <div className="seg">
          <button type="button" className={scope === 'hall' ? 'on' : ''} onClick={() => setScope('hall')}>{membership!.hall.name}</button>
          <button type="button" className={scope === 'dorm' ? 'on' : ''} onClick={() => setScope('dorm')}>{membership!.dorm.name}</button>
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="ghost" onClick={onCancel}>{t('common.cancel')}</button>
        <button type="submit" disabled={busy}>{t('common.save')}</button>
      </div>
    </form>
  )
}
