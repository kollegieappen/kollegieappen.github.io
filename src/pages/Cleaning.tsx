import { Fragment, useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { supabase, errorKey } from '../lib/supabase'
import { useI18n } from '../lib/i18n'
import { useSession } from '../lib/session'
import { EditIcon, TrashIcon, useRealtime } from '../ui'
import { dietSummary } from './Profile'

type Task = {
  id: string; title: string; description: string | null; weekdays: number[]; remind_hour: number
  emoji?: string; people_per_shift?: number; remind_days_before?: number; signup_enabled?: boolean
}
type Signup = { task_id: string; date: string; user_id: string; person: { display_name: string } | null }
type Diet = { user_id: string; tags: string[]; note: string }

const EMOJIS = ['🧹', '🍝', '🗑️', '🧽', '🚿', '🧺', '♻️', '🍳', '🛒', '🌱']
type Shift = { id: string; date: string; task_id: string; user_id: string | null; person: { display_name: string } | null }
type Member = { user_id: string; profile: { display_name: string } | null }

const pad = (n: number) => String(n).padStart(2, '0')
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export default function Cleaning() {
  const { t, locale } = useI18n()
  const { membership, session } = useSession()
  const hallId = membership!.hall_id
  const isMod = membership!.is_moderator
  const me = session!.user.id
  const [tasks, setTasks] = useState<Task[]>([])
  const [shifts, setShifts] = useState<Shift[] | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [showManage, setShowManage] = useState(false)
  const [only, setOnly] = useState('')
  const [signups, setSignups] = useState<Signup[]>([])
  const [diets, setDiets] = useState<Record<string, Diet>>({})
  const [openSignup, setOpenSignup] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const today = isoDate(new Date())
    const tasksQ = (cols: string) => supabase.from('cleaning_tasks').select(cols).eq('hall_id', hallId).order('title')
    const [tk0, sh, mb] = await Promise.all([
      tasksQ('id, title, description, weekdays, remind_hour, emoji, people_per_shift, remind_days_before, signup_enabled'),
      supabase.from('cleaning_shifts').select('id, date, task_id, user_id, person:profiles(display_name)')
        .eq('hall_id', hallId).gte('date', today).order('date').order('task_id').limit(400),
      supabase.from('memberships').select('user_id, profile:profiles(display_name)').eq('hall_id', hallId).order('joined_at')
    ])
    // Fallback, hvis 0007-opsætningen endnu ikke er kørt.
    const tk = tk0.error ? await tasksQ('id, title, description, weekdays, remind_hour') : tk0
    setTasks((tk.data as unknown as Task[]) ?? [])
    setShifts((sh.data as unknown as Shift[]) ?? [])
    setMembers((mb.data as unknown as Member[]) ?? [])
    const [su, di] = await Promise.all([
      supabase.from('duty_signups').select('task_id, date, user_id, person:profiles(display_name)').gte('date', today),
      supabase.from('diet_info').select('user_id, tags, note')
    ])
    setSignups((su.data as unknown as Signup[]) ?? [])
    setDiets(Object.fromEntries(((di.data as Diet[]) ?? []).map((x) => [x.user_id, x])))
  }, [hallId])

  useEffect(() => { load() }, [load])
  useRealtime(['cleaning_shifts', 'duty_signups'], load)

  async function toggleSignup(taskId: string, date: string, joined: boolean) {
    if (joined) await supabase.from('duty_signups').delete().eq('task_id', taskId).eq('date', date).eq('user_id', me)
    else await supabase.from('duty_signups').insert({ task_id: taskId, date })
    load()
  }

  const taskName = (id: string) => {
    const x = tasks.find((y) => y.id === id)
    return x ? `${x.emoji ?? '🧹'} ${x.title}` : ''
  }
  const dayName = (d: string) => {
    const s = new Date(d + 'T12:00:00').toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'short' })
    return s.charAt(0).toUpperCase() + s.slice(1)
  }
  const myNext = shifts?.find((s) => s.user_id === me)

  async function reassign(s: Shift, userId: string) {
    setError('')
    const { error } = await supabase.from('cleaning_shifts').update({ user_id: userId || null }).eq('id', s.id)
    if (error) setError(t(errorKey(error)))
    load()
  }

  const byDate = new Map<string, Shift[]>()
  const visible = (shifts ?? []).filter((s) => !only || s.task_id === only)
  for (const s of visible.slice(0, 80)) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s])

  return (
    <div className="stack">
      <div className="card">
        <div className="muted small">{t('clean.next')}</div>
        {myNext ? (
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>
            {taskName(myNext.task_id)} · {dayName(myNext.date)}
          </div>
        ) : (
          <div style={{ marginTop: 2 }}>{t('clean.noNext')}</div>
        )}
        {myNext && tasks.find((x) => x.id === myNext.task_id)?.description && (
          <div className="post small muted" style={{ marginTop: 6 }}>{tasks.find((x) => x.id === myNext.task_id)!.description}</div>
        )}
      </div>

      {error && <div className="error">{error}</div>}
      {msg && <div className="notice">{msg}</div>}

      {shifts === null ? (
        <div className="empty">{t('common.loading')}</div>
      ) : shifts.length === 0 ? (
        <div className="empty">{t('clean.empty')}{isMod && <><br />{t('clean.emptyMod')}</>}</div>
      ) : (
        <>
          <div className="section-title">{t('clean.upcoming')}</div>
          {tasks.length > 1 && (
            <div className="seg" style={{ flexWrap: 'wrap' }}>
              <button className={!only ? 'on' : ''} onClick={() => setOnly('')}>{t('common.all')}</button>
              {tasks.map((x) => (
                <button key={x.id} className={only === x.id ? 'on' : ''} onClick={() => setOnly(x.id)}>{x.emoji ?? '🧹'} {x.title}</button>
              ))}
            </div>
          )}
          <div className="list">
            {[...byDate.entries()].map(([date, list]) => list.map((s, i) => {
              const task = tasks.find((x) => x.id === s.task_id)
              const lastOfTask = list.map((x) => x.task_id).lastIndexOf(s.task_id) === i
              const people = signups.filter((x) => x.task_id === s.task_id && x.date === date)
              const joined = people.some((x) => x.user_id === me)
              const key = s.task_id + date
              return (
              <Fragment key={s.id}>
              <div className="item">
                <div className="grow">
                  {i === 0 && <div className="small muted">{dayName(date)}</div>}
                  <div>
                    {taskName(s.task_id)} ·{' '}
                    <span style={{ fontWeight: s.user_id === me ? 700 : 400 }}>
                      {s.person?.display_name ?? t('clean.unassigned')}
                    </span>
                  </div>
                </div>
                {isMod && (
                  <select
                    style={{ width: 'auto', maxWidth: 140, padding: '6px 8px' }}
                    value={s.user_id ?? ''}
                    onChange={(e) => reassign(s, e.target.value)}
                    aria-label={taskName(s.task_id)}
                  >
                    <option value="">{t('clean.unassigned')}</option>
                    {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.profile?.display_name}</option>)}
                  </select>
                )}
              </div>
              {lastOfTask && task?.signup_enabled && (
                <div className="item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6, background: 'var(--surface-2)' }}>
                  <div className="row">
                    <button className="link small grow" style={{ textAlign: 'left', padding: 0 }} onClick={() => setOpenSignup(openSignup === key ? '' : key)}>
                      🍽 {t('duty.signedUp', { n: people.length })} {openSignup === key ? '▴' : '▾'}
                    </button>
                    <button className={joined ? 'ghost' : ''} style={{ padding: '6px 10px', fontSize: 13 }} onClick={() => toggleSignup(s.task_id, date, joined)}>
                      {joined ? '✓ ' + t('duty.joined') : t('duty.join')}
                    </button>
                  </div>
                  {openSignup === key && (
                    people.length === 0 ? <div className="small muted">{t('duty.nobody')}</div> : (
                      <div className="small">
                        {people.map((x) => (
                          <div key={x.user_id}>
                            {x.person?.display_name ?? '—'}
                            {dietSummary(diets[x.user_id], t) && <span className="muted"> · {dietSummary(diets[x.user_id], t)}</span>}
                          </div>
                        ))}
                      </div>
                    )
                  )}
                </div>
              )}
              </Fragment>
              )
            }))}
          </div>
        </>
      )}

      {isMod && (
        <>
          <button className="ghost" onClick={() => setShowManage((v) => !v)}>{t('clean.manage')} {showManage ? '▴' : '▾'}</button>
          {showManage && (
            <Manage tasks={tasks} shifts={shifts ?? []} memberCount={members.length} hallId={hallId} onChange={load} setMsg={setMsg} setError={setError} />
          )}
        </>
      )}
    </div>
  )
}

function Manage({ tasks, shifts, memberCount, hallId, onChange, setMsg, setError }: {
  tasks: Task[]; shifts: Shift[]; memberCount: number; hallId: string; onChange: () => void
  setMsg: (s: string) => void; setError: (s: string) => void
}) {
  const { t } = useI18n()
  const [editing, setEditing] = useState<Task | null>(null)
  const [formKey, setFormKey] = useState(0)
  const [genTask, setGenTask] = useState('')
  const [rounds, setRounds] = useState(2) // 0 = selvvalgt antal uger
  const [customWeeks, setCustomWeeks] = useState(10)
  const task = tasks.find((x) => x.id === genTask) ?? tasks[0]
  // Antal uger, så alle beboere får lige mange ture: (uger × dage pr. uge) skal gå op i antal beboere.
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a)
  const n = Math.max(memberCount, 1)
  const perWeek = (task?.weekdays.length || 1) * Math.min(task?.people_per_shift ?? 1, n)
  const weeksPerRound = n / gcd(n, perWeek)
  const roundOptions = Array.from({ length: 8 }, (_, i) => i + 1).filter((r) => r * weeksPerRound <= 52)
  const weeks = rounds === 0
    ? Math.min(Math.max(Math.round(customWeeks) || 1, 1), 52)
    : Math.min(rounds, roundOptions.at(-1) ?? 1) * weeksPerRound
  const fileRef = useRef<HTMLInputElement>(null)

  async function removeTask(task: Task) {
    if (!confirm(t('clean.deleteTask'))) return
    await supabase.from('cleaning_tasks').delete().eq('id', task.id)
    onChange()
  }

  async function generate() {
    const id = genTask || tasks[0]?.id
    if (!id) return
    if (!confirm(t('clean.generateHint'))) return
    setError(''); setMsg('')
    const { data, error } = await supabase.rpc('generate_cleaning_rotation', { p_task: id, p_from: isoDate(new Date()), p_weeks: weeks })
    if (error) return setError(t(errorKey(error)))
    setMsg(t('clean.generated', { n: data as number }))
    onChange()
  }

  function exportCsv() {
    const rows = ['dato;tjans;navn', ...shifts.map((s) => {
      const task = tasks.find((x) => x.id === s.task_id)?.title ?? ''
      return [s.date, task, s.person?.display_name ?? ''].map((v) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(';')
    })]
    const blob = new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `tjanser-${isoDate(new Date())}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function importCsv(file: File) {
    setError(''); setMsg('')
    const text = (await file.text()).replace(/^﻿/, '')
    const lines = text.split(/\r?\n/).filter((l) => l.trim())
    const delim = (lines[0]?.match(/;/g)?.length ?? 0) >= (lines[0]?.match(/,/g)?.length ?? 0) ? ';' : ','
    const parse = (line: string) => {
      const out: string[] = []; let cur = ''; let q = false
      for (let i = 0; i < line.length; i++) {
        const c = line[i]
        if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ } else if (c === '"') q = false; else cur += c }
        else if (c === '"') q = true
        else if (c === delim) { out.push(cur); cur = '' }
        else cur += c
      }
      out.push(cur)
      return out.map((v) => v.trim())
    }
    let rows = lines.map(parse)
    const hasHeader = rows[0] && !/^\d{4}-\d{2}-\d{2}$/.test(rows[0][0])
    const offset = hasHeader ? 2 : 1 // rækkenummer i filen, som brugeren ser det
    if (hasHeader) rows = rows.slice(1)
    const payload = rows.map(([date, task, name]) => ({ date, task, name: name ?? '' }))
    const { data, error } = await supabase.rpc('import_cleaning_shifts', { p_rows: payload })
    if (error) return setError(t(errorKey(error)))
    const res = data as { imported: number; errors: { row: number; error: string }[] }
    let m = t('clean.imported', { n: res.imported })
    if (res.errors.length) m += ' · ' + t('clean.importErrors', { rows: res.errors.map((e) => `${e.row + offset - 1} (${e.error})`).join(', ') })
    setMsg(m)
    onChange()
  }

  return (
    <div className="stack">
      <div className="section-title">{t('clean.tasks')}</div>
      {tasks.length > 0 && (
        <div className="list">
          {tasks.map((task) => (
            <div className="item" key={task.id}>
              <div className="grow">
                <div>{task.emoji ?? '🧹'} {task.title}{(task.people_per_shift ?? 1) > 1 && <span className="muted small"> · {t('clean.perDay', { n: task.people_per_shift! })}</span>}</div>
                <div className="small muted">
                  {task.weekdays.map((d) => t('clean.days').split(',')[d - 1]).join(', ')} · {t(task.remind_days_before ? 'clean.remindDayBefore' : 'clean.remindSameDay')} {pad(task.remind_hour)}:00
                </div>
              </div>
              <button className="icon" aria-label={t('cal.edit')} onClick={() => { setEditing(task); setFormKey((k) => k + 1) }}><EditIcon /></button>
              <button className="icon" aria-label={t('common.delete')} onClick={() => removeTask(task)}><TrashIcon /></button>
            </div>
          ))}
        </div>
      )}
      <TaskForm key={formKey} task={editing} hallId={hallId} onDone={() => { setEditing(null); setFormKey((k) => k + 1); onChange() }} setError={setError} />

      {tasks.length > 0 && (
        <>
          <div className="section-title">{t('clean.generate')}</div>
          <div className="card stack">
            <div className="row">
              <select className="grow" value={genTask || tasks[0].id} onChange={(e) => setGenTask(e.target.value)} aria-label={t('clean.generateFor')}>
                {tasks.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
              </select>
              <select style={{ width: 'auto' }} value={rounds === 0 ? 0 : Math.min(rounds, roundOptions.at(-1) ?? 1)} onChange={(e) => setRounds(Number(e.target.value))}>
                {roundOptions.map((r) => (
                  <option key={r} value={r}>{t('clean.weeks', { n: r * weeksPerRound })} · {t('clean.turns', { n: (r * weeksPerRound * perWeek) / n })}</option>
                ))}
                <option value={0}>{t('clean.customWeeks')}</option>
              </select>
              {rounds === 0 && (
                <input
                  type="number" min={1} max={52} value={customWeeks} style={{ width: 72 }}
                  onChange={(e) => setCustomWeeks(Number(e.target.value))} aria-label={t('clean.customWeeks')}
                />
              )}
            </div>
            <div className="small muted">{t('clean.generateHint')}</div>
            <button onClick={generate}>{t('clean.generate')}</button>
          </div>
        </>
      )}

      <div className="section-title">CSV</div>
      <div className="card stack">
        <div className="small muted">{t('clean.csvHint')}</div>
        <div className="row">
          <button className="ghost grow" onClick={exportCsv} disabled={shifts.length === 0}>{t('clean.export')}</button>
          <button className="ghost grow" onClick={() => fileRef.current?.click()} disabled={tasks.length === 0}>{t('clean.import')}</button>
        </div>
        <input
          ref={fileRef} type="file" accept=".csv,text/csv" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) importCsv(f); e.target.value = '' }}
        />
      </div>
    </div>
  )
}

function TaskForm({ task, hallId, onDone, setError }: {
  task: Task | null; hallId: string; onDone: () => void; setError: (s: string) => void
}) {
  const { t } = useI18n()
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [days, setDays] = useState<number[]>(task?.weekdays ?? [])
  const [hour, setHour] = useState(task?.remind_hour ?? 10)
  const [emoji, setEmoji] = useState(task?.emoji ?? '🧹')
  const [people, setPeople] = useState(task?.people_per_shift ?? 1)
  const [dayBefore, setDayBefore] = useState(task?.remind_days_before ?? 0)
  const [signup, setSignup] = useState(task?.signup_enabled ?? false)
  const [busy, setBusy] = useState(false)
  const labels = t('clean.days').split(',')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    const fields = {
      title: title.trim(), description: description.trim() || null, weekdays: [...days].sort(), remind_hour: hour,
      emoji, people_per_shift: people, remind_days_before: dayBefore, signup_enabled: signup
    }
    const { error } = task
      ? await supabase.from('cleaning_tasks').update(fields).eq('id', task.id)
      : await supabase.from('cleaning_tasks').insert({ ...fields, hall_id: hallId })
    setBusy(false)
    if (error) return setError(t(errorKey(error)))
    onDone()
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <strong>{task ? task.title : t('clean.newTask')}</strong>
      <div className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
        {EMOJIS.map((e) => (
          <button type="button" key={e} onClick={() => setEmoji(e)} className="ghost"
            style={{ padding: '6px 8px', fontSize: 18, borderColor: emoji === e ? 'var(--brand)' : 'var(--line)', borderWidth: emoji === e ? 2 : 1 }}>
            {e}
          </button>
        ))}
      </div>
      <div>
        <label htmlFor="tt">{t('clean.taskTitle')}</label>
        <input id="tt" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={80} placeholder={t('clean.taskPh')} />
      </div>
      <div>
        <label htmlFor="td">{t('clean.taskDesc')}</label>
        <textarea id="td" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
      </div>
      <div>
        <label>{t('clean.weekdays')}</label>
        <div className="seg">
          {labels.map((l, i) => (
            <button
              type="button" key={l} className={days.includes(i + 1) ? 'on' : ''}
              onClick={() => setDays((d) => (d.includes(i + 1) ? d.filter((x) => x !== i + 1) : [...d, i + 1]))}
              style={{ padding: '7px 0' }}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      <label className="row" style={{ margin: 0, gap: 8, fontWeight: 500, color: 'var(--ink)' }}>
        <input type="checkbox" style={{ width: 'auto' }} checked={signup} onChange={(e) => setSignup(e.target.checked)} />
        {t('duty.enableSignup')}
      </label>
      <div className="row">
        <label htmlFor="tp" style={{ margin: 0 }}>{t('clean.people')}</label>
        <select id="tp" style={{ width: 'auto' }} value={people} onChange={(e) => setPeople(Number(e.target.value))}>
          {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <label style={{ margin: 0 }}>{t('clean.remindAt')}</label>
        <select style={{ width: 'auto' }} value={dayBefore} onChange={(e) => setDayBefore(Number(e.target.value))} aria-label={t('clean.remindAt')}>
          <option value={0}>{t('clean.remindSameDay')}</option>
          <option value={1}>{t('clean.remindDayBefore')}</option>
        </select>
        <select id="th" style={{ width: 'auto' }} value={hour} onChange={(e) => setHour(Number(e.target.value))}>
          {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{pad(h)}:00</option>)}
        </select>
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        {task && <button type="button" className="ghost" onClick={onDone}>{t('common.cancel')}</button>}
        <button type="submit" disabled={busy || !title.trim() || days.length === 0}>{t('common.save')}</button>
      </div>
    </form>
  )
}
