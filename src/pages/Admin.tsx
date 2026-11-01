import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase, errorKey, APP_URL, EXPECTED_DB_VERSION, type Dorm } from '../lib/supabase'
import { useI18n } from '../lib/i18n'
import { useSession } from '../lib/session'
import { TopBar, TrashIcon, relTime } from '../ui'
import { PendingRequests } from './JoinRequest'
import { Tip } from './Help'

type PendingDorm = {
  id: string; name: string; address: string | null; created_at: string
  requester_email: string | null; requester_name: string | null; hall_names: string[]
}

export default function Admin({ standalone = false }: { standalone?: boolean }) {
  const { t } = useI18n()
  const { isSuperadmin, adminDorms } = useSession()
  const [dormId, setDormId] = useState(adminDorms[0]?.id ?? '')

  return (
    <div className={standalone ? 'app' : undefined}>
      <TopBar title={t('nav.admin')} help={['admin']} />
      <main className={'stack' + (standalone ? ' plain' : '')}>
        {standalone && <Link to="/">←</Link>}
        {adminDorms.length > 0 && (
          <>
            {adminDorms.length > 1 && (
              <select value={dormId} onChange={(e) => setDormId(e.target.value)} aria-label={t('adm.myDorm')}>
                {adminDorms.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            )}
            {dormId && <AdminDorm key={dormId} dorm={adminDorms.find((d) => d.id === dormId)!} />}
          </>
        )}
        {isSuperadmin && <SuperAdmin />}
      </main>
    </div>
  )
}

/** Superadmin: viser hvilke databasemigrationer der er kørt, og hvilke der mangler. */
function DbStatus() {
  const { t } = useI18n()
  const [status, setStatus] = useState<{ version: number; applied: number[] } | null | 'unknown'>(null)

  useEffect(() => {
    supabase.rpc('schema_status').then(({ data, error }) => setStatus(error || !data ? 'unknown' : (data as { version: number; applied: number[] })))
  }, [])

  if (status === null) return null
  const missing = status === 'unknown'
    ? []
    : Array.from({ length: EXPECTED_DB_VERSION }, (_, i) => i + 1).filter((v) => !status.applied.includes(v))
  const ok = status !== 'unknown' && missing.length === 0
  const pad = (n: number) => String(n).padStart(4, '0')

  return (
    <div className="card stack" style={{ gap: 6, borderColor: ok ? 'var(--line)' : 'var(--accent)', borderWidth: ok ? 1 : 2 }}>
      <strong>{ok ? '✓ ' : '⚠️ '}{t('adm.db')}</strong>
      <div className="small">
        {status === 'unknown'
          ? t('adm.dbUnknown', { file: '0011_migrationsversion.sql' })
          : ok
            ? t('adm.dbOk', { v: status.version })
            : t('adm.dbMissing', { v: status.version, files: missing.map(pad).join(', ') })}
      </div>
      {!ok && (
        <a className="small" href="https://github.com/kollegieappen/kollegieappen.github.io/tree/main/supabase/migrations"
          target="_blank" rel="noreferrer" style={{ color: 'var(--brand)', fontWeight: 600 }}>
          {t('adm.dbLink')} →
        </a>
      )}
    </div>
  )
}

function SuperAdmin() {
  const { t, locale } = useI18n()
  const { refresh } = useSession()
  const [rows, setRows] = useState<PendingDorm[] | null>(null)
  type DormRow = { id: string; name: string; address: string | null; hall_count: number; resident_count: number; is_test: boolean; i_am_admin: boolean }
  const [dorms, setDorms] = useState<DormRow[]>([])
  const [q, setQ] = useState('')
  const [showTest, setShowTest] = useState(false)
  const [openDorm, setOpenDorm] = useState<string | null>(null)
  const [admins, setAdmins] = useState<{ dorm_id: string; user_id: string; profile: { display_name: string } | null }[]>([])
  const [emails, setEmails] = useState<Record<string, string>>({})
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [p, d, a] = await Promise.all([
      supabase.rpc('pending_dorms'),
      supabase.rpc('approved_dorms'),
      supabase.from('dorm_admins').select('dorm_id, user_id, profile:profiles(display_name)')
    ])
    if (p.error) setError(t(errorKey(p.error)))
    setRows((p.data as PendingDorm[]) ?? [])
    setDorms((d.data as DormRow[]) ?? [])
    setAdmins((a.data as unknown as typeof admins) ?? [])
  }, [t])

  useEffect(() => { load() }, [load])

  async function run(fn: () => PromiseLike<{ error: unknown }>) {
    setError('')
    const { error } = await fn()
    if (error) setError(t(errorKey(error)))
    await load()
    refresh()
  }

  const needle = q.trim().toLowerCase()
  const shown = dorms
    .filter((d) => showTest || !d.is_test)
    .filter((d) => !needle || d.name.toLowerCase().includes(needle) || (d.address ?? '').toLowerCase().includes(needle))

  async function decide(id: string, approve: boolean) {
    if (!approve && !confirm(t('common.confirm'))) return
    const { error } = await supabase.rpc('decide_dorm', { p_dorm: id, p_approve: approve })
    if (error) setError(t(errorKey(error)))
    await load()
    refresh()
  }

  async function addAdmin(e: FormEvent, dorm: string) {
    e.preventDefault()
    setError('')
    const { error } = await supabase.rpc('add_dorm_admin', { p_dorm: dorm, p_email: emails[dorm] ?? '' })
    if (error) return setError(t(errorKey(error)))
    setEmails((x) => ({ ...x, [dorm]: '' }))
    load(); refresh()
  }

  async function removeAdmin(dorm: string, user: string) {
    if (!confirm(t('common.confirm'))) return
    await supabase.rpc('remove_dorm_admin', { p_dorm: dorm, p_user: user })
    load(); refresh()
  }

  return (
    <>
      <DbStatus />
      <div className="section-title">{t('admin.title')}</div>
      {error && <div className="error">{error}</div>}
      {rows === null ? (
        <div className="empty">{t('common.loading')}</div>
      ) : rows.length === 0 ? (
        <div className="muted small" style={{ padding: '0 4px' }}>{t('admin.empty')}</div>
      ) : (
        rows.map((d) => (
          <div className="card stack" key={d.id}>
            <div>
              <strong style={{ fontSize: 18 }}>{d.name}</strong>
              {d.address && <div className="muted small">{d.address}</div>}
            </div>
            <div className="small">{t('admin.by', { name: d.requester_name ?? '—', email: d.requester_email ?? '—' })}</div>
            <div className="small muted">
              {new Date(d.created_at).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })} · {d.hall_names.join(', ')}
            </div>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="danger" onClick={() => decide(d.id, false)}>{t('admin.reject')}</button>
              <button onClick={() => decide(d.id, true)}>{t('admin.approve')}</button>
            </div>
          </div>
        ))
      )}

      <FeatureRequestsAdmin />

      <div className="section-title">{t('adm.dorms')}</div>
      <div className="row">
        <input className="grow" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('dorm.searchPh')} />
      </div>
      <label className="row small" style={{ margin: 0, gap: 6, fontWeight: 500, color: 'var(--ink)' }}>
        <input type="checkbox" style={{ width: 'auto' }} checked={showTest} onChange={(e) => setShowTest(e.target.checked)} />
        {t('adm.showTest')}
      </label>
      {shown.length === 0 && <div className="muted small" style={{ padding: '0 4px' }}>{t('dorm.noDorms')}</div>}
      {shown.map((d) => {
        const list = admins.filter((a) => a.dorm_id === d.id)
        const open = openDorm === d.id
        return (
          <div className="card stack" key={d.id} style={{ gap: 8 }}>
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <div className="grow">
                <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <strong>{d.name}</strong>
                  {d.is_test && <span className="badge">🧪 {t('adm.test')}</span>}
                  {d.i_am_admin && <span className="badge dorm">{t('adm.youAdmin')}</span>}
                </div>
                <div className="small muted">{d.address ? `📍 ${d.address}` : t('dorm.noAddress')}</div>
                <div className="small muted">{t('dorm.size', { halls: d.hall_count, residents: d.resident_count })}</div>
              </div>
              <button className={d.i_am_admin ? 'ghost' : ''} onClick={() => run(() => supabase.rpc('admin_self', { p_dorm: d.id, p_value: !d.i_am_admin }))}>
                {t(d.i_am_admin ? 'adm.stopAdmin' : 'adm.becomeAdmin')}
              </button>
            </div>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <label className="row small" style={{ margin: 0, gap: 6, fontWeight: 500, color: 'var(--ink)' }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={d.is_test}
                  onChange={() => run(() => supabase.rpc('set_dorm_test', { p_dorm: d.id, p_value: !d.is_test }))} />
                {t('adm.testFlag')}
              </label>
              <button className="link small" onClick={() => setOpenDorm(open ? null : d.id)}>
                {t('adm.admins')} ({list.length}) {open ? '▴' : '▾'}
              </button>
            </div>
            {open && (
              <div className="stack" style={{ gap: 6, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                {list.length === 0 && <div className="muted small">{t('adm.noAdmins')}</div>}
                {list.map((a) => (
                  <div className="row" key={a.user_id}>
                    <span className="grow">{a.profile?.display_name ?? '—'}</span>
                    <button className="icon" aria-label={t('common.delete')} onClick={() => removeAdmin(d.id, a.user_id)}><TrashIcon /></button>
                  </div>
                ))}
                <form className="row" onSubmit={(e) => addAdmin(e, d.id)}>
                  <input
                    className="grow" type="email" placeholder={t('adm.addAdmin')} value={emails[d.id] ?? ''}
                    onChange={(e) => setEmails((x) => ({ ...x, [d.id]: e.target.value }))}
                  />
                  <button type="submit" className="ghost" disabled={!emails[d.id]}>{t('common.add')}</button>
                </form>
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

type Member = { user_id: string; hall_id: string; is_moderator: boolean; profile: { display_name: string } | null }
type Report = { id: string; message_id: string; reason: string; created_at: string; to_admin: boolean }

function AdminDorm({ dorm }: { dorm: Dorm }) {
  const { t, locale } = useI18n()
  const [halls, setHalls] = useState<{ id: string; name: string }[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [board, setBoard] = useState<string[]>([])
  const [reports, setReports] = useState<Report[]>([])
  const [messages, setMessages] = useState<Record<string, string>>({})
  const [revealed, setRevealed] = useState<Record<string, string>>({})
  const [codes, setCodes] = useState<Record<string, string>>({})
  const [newHall, setNewHall] = useState('')
  const [announce, setAnnounce] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data: h } = await supabase.from('halls').select('id, name').eq('dorm_id', dorm.id).order('name')
    const hallIds = ((h as { id: string }[]) ?? []).map((x) => x.id)
    setHalls((h as { id: string; name: string }[]) ?? [])
    if (!hallIds.length) return
    const [m, b, r, msg] = await Promise.all([
      supabase.from('memberships').select('user_id, hall_id, is_moderator, profile:profiles(display_name)').in('hall_id', hallIds),
      supabase.from('dorm_board').select('user_id').eq('dorm_id', dorm.id),
      supabase.from('reports').select('id, message_id, reason, created_at, to_admin').in('hall_id', hallIds).eq('status', 'open').order('created_at'),
      supabase.from('anon_messages').select('id, body').in('hall_id', hallIds)
    ])
    setMembers((m.data as unknown as Member[]) ?? [])
    setBoard(((b.data as { user_id: string }[]) ?? []).map((x) => x.user_id))
    setReports(((r.data as Report[]) ?? []).filter((x) => x.to_admin))
    setMessages(Object.fromEntries(((msg.data as { id: string; body: string }[]) ?? []).map((x) => [x.id, x.body])))
  }, [dorm.id])

  useEffect(() => { load() }, [load])

  async function run(fn: () => PromiseLike<{ error: unknown; data?: unknown }>) {
    setError('')
    const res = await fn()
    if (res.error) setError(t(errorKey(res.error)))
    await load()
    return res
  }

  async function reveal(r: Report) {
    if (!confirm(t('adm.revealConfirm'))) return
    const { data, error } = await supabase.rpc('reveal_anon_sender', { p_report: r.id })
    if (error) return setError(t(errorKey(error)))
    const d = data as { name: string | null; email: string | null }
    setRevealed((x) => ({ ...x, [r.id]: t('adm.sender', { name: d.name ?? '—', email: d.email ?? '—' }) }))
  }

  async function postAnnouncement(e: FormEvent) {
    e.preventDefault()
    const { error } = await supabase.from('posts').insert({ dorm_id: dorm.id, body: announce.trim(), kind: 'announcement' })
    if (error) return setError(t(errorKey(error)))
    setAnnounce(''); setNote(t('adm.announceSent')); setTimeout(() => setNote(''), 4000)
  }

  return (
    <>
      <h2 style={{ margin: '4px 4px 0' }}>{dorm.name}</h2>
      {error && <div className="error">{error}</div>}
      {note && <div className="notice">{note}</div>}

      <form className="card stack" onSubmit={postAnnouncement}>
        <strong>📣 {t('adm.announce')}</strong>
        <textarea value={announce} onChange={(e) => setAnnounce(e.target.value)} placeholder={t('adm.announcePh')} maxLength={4000} />
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="submit" disabled={!announce.trim()}>{t('board.post')}</button>
        </div>
      </form>

      <PendingRequests dormId={dorm.id} />

      <div className="section-title">{t('adm.reports')}</div>
      {reports.length === 0 ? (
        <div className="muted small" style={{ padding: '0 4px' }}>{t('adm.noReports')}</div>
      ) : (
        reports.map((r) => (
          <div className="card stack" key={r.id} style={{ borderColor: 'var(--danger)' }}>
            <div className="small muted">{relTime(r.created_at, locale)}{r.reason && ` · ${r.reason}`}</div>
            <div className="post">{messages[r.message_id] ?? '—'}</div>
            {revealed[r.id] && <div className="notice">{revealed[r.id]}</div>}
            <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              {!revealed[r.id] && <><Tip k="reveal" /><button className="ghost" onClick={() => reveal(r)}>{t('adm.reveal')}</button></>}
              <button className="danger" onClick={() => confirm(t('common.confirm')) && run(() => supabase.from('anon_messages').delete().eq('id', r.message_id))}>
                {t('mail.deleteMsg')}
              </button>
              <button className="ghost" onClick={() => run(() => supabase.from('reports').update({ status: 'resolved' }).eq('id', r.id))}>
                {t('mail.resolve')}
              </button>
            </div>
          </div>
        ))
      )}

      <div className="section-title">{t('adm.halls')}</div>
      {halls.map((h) => {
        const list = members.filter((m) => m.hall_id === h.id)
        return (
          <div className="card stack" key={h.id}>
            <div className="row">
              <strong className="grow">{h.name}</strong>
              {codes[h.id] ? (
                <button className="ghost" onClick={() => navigator.clipboard?.writeText(`${APP_URL}/#/join/${codes[h.id]}`)}>
                  <span className="code" style={{ fontSize: 15 }}>{codes[h.id]}</span> · {t('common.copy')}
                </button>
              ) : (
                <button className="ghost" onClick={async () => {
                  const res = await run(() => supabase.rpc('create_invite', { p_hall: h.id }))
                  if (res.data) setCodes((x) => ({ ...x, [h.id]: res.data as string }))
                }}>{t('adm.invite')}</button>
              )}
            </div>
            {list.length === 0 && <div className="muted small">{t('adm.noMembers')}</div>}
            {list.map((m) => (
              <div className="row" key={m.user_id} style={{ flexWrap: 'wrap' }}>
                <span className="grow">{m.profile?.display_name ?? '—'}</span>
                <label className="row small" style={{ margin: 0, gap: 4, fontWeight: 500 }}>
                  <input type="checkbox" style={{ width: 'auto' }} checked={m.is_moderator}
                    onChange={() => run(() => supabase.rpc('set_moderator', { p_user: m.user_id, p_value: !m.is_moderator }))} />
                  {t('adm.mod')}
                </label>
                <label className="row small" style={{ margin: 0, gap: 4, fontWeight: 500 }}>
                  <input type="checkbox" style={{ width: 'auto' }} checked={board.includes(m.user_id)}
                    onChange={() => run(() => supabase.rpc('set_board', { p_user: m.user_id, p_value: !board.includes(m.user_id) }))} />
                  {t('adm.board')}
                </label>
                <button className="icon" aria-label={t('hall.kick')}
                  onClick={() => confirm(t('hall.kickConfirm', { name: m.profile?.display_name ?? '' })) && run(() => supabase.rpc('remove_member', { p_user: m.user_id }))}>
                  <TrashIcon />
                </button>
              </div>
            ))}
          </div>
        )
      })}
      <form className="row" onSubmit={async (e) => { e.preventDefault(); await run(() => supabase.rpc('create_hall', { p_name: newHall.trim(), p_dorm: dorm.id })); setNewHall('') }}>
        <input className="grow" value={newHall} onChange={(e) => setNewHall(e.target.value)} placeholder={t('hall.newHallName')} maxLength={60} />
        <button type="submit" className="ghost" disabled={!newHall.trim()}>{t('adm.newHall')}</button>
      </form>
    </>
  )
}

type FeatureRequest = {
  id: string; title: string; description: string; status: 'new' | 'planned' | 'done' | 'rejected'
  admin_note: string; created_at: string
  author: { display_name: string } | null; dorm: { name: string } | null
}
const FR_STATUSES = ['new', 'planned', 'done', 'rejected'] as const

/** Superadmin: funktionsønsker fra brugerne. */
function FeatureRequestsAdmin() {
  const { t, locale } = useI18n()
  const [rows, setRows] = useState<FeatureRequest[]>([])
  const [status, setStatus] = useState<'open' | FeatureRequest['status']>('open')
  const [notes, setNotes] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    const { data } = await supabase.from('feature_requests')
      .select('id, title, description, status, admin_note, created_at, author:profiles(display_name), dorm:dorms(name)')
      .order('created_at', { ascending: false })
    setRows((data as unknown as FeatureRequest[]) ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  async function update(id: string, patch: Partial<Pick<FeatureRequest, 'status' | 'admin_note'>>) {
    await supabase.from('feature_requests').update(patch).eq('id', id)
    load()
  }

  const shown = rows.filter((r) => (status === 'open' ? r.status === 'new' || r.status === 'planned' : r.status === status))
  const newCount = rows.filter((r) => r.status === 'new').length

  return (
    <>
      <div className="section-title">💡 {t('fr.adminTitle')}{newCount > 0 && ` · ${t('fr.newCount', { n: newCount })}`}</div>
      <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
        <option value="open">{t('fr.open')}</option>
        {FR_STATUSES.map((s) => <option key={s} value={s}>{t('fr.status.' + s)}</option>)}
      </select>
      {shown.length === 0 && <div className="muted small" style={{ padding: '0 4px' }}>{t('fr.none')}</div>}
      {shown.map((r) => (
        <div className="card stack" key={r.id} style={{ gap: 8 }}>
          <div>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              <strong>{r.title}</strong>
              <span className={'badge' + (r.status === 'done' ? ' dorm' : '')}>{t('fr.status.' + r.status)}</span>
            </div>
            <div className="small muted">
              {r.author?.display_name ?? '—'}{r.dorm && ` · ${r.dorm.name}`} · {new Date(r.created_at).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}
            </div>
          </div>
          {r.description && <div className="post small">{r.description}</div>}
          <div className="row">
            <select className="grow" value={r.status} onChange={(e) => update(r.id, { status: e.target.value as FeatureRequest['status'] })}>
              {FR_STATUSES.map((s) => <option key={s} value={s}>{t('fr.status.' + s)}</option>)}
            </select>
          </div>
          <form className="row" onSubmit={(e) => { e.preventDefault(); update(r.id, { admin_note: notes[r.id] ?? r.admin_note }) }}>
            <input className="grow" value={notes[r.id] ?? r.admin_note} maxLength={1000} placeholder={t('fr.notePh')}
              onChange={(e) => setNotes((x) => ({ ...x, [r.id]: e.target.value }))} />
            <button type="submit" className="ghost" disabled={(notes[r.id] ?? r.admin_note) === r.admin_note}>{t('common.save')}</button>
          </form>
        </div>
      ))}
    </>
  )
}
