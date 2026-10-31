import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase, errorKey, APP_URL, type Dorm } from '../lib/supabase'
import { useI18n } from '../lib/i18n'
import { useSession } from '../lib/session'
import { TopBar, TrashIcon, relTime } from '../ui'
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

function SuperAdmin() {
  const { t, locale } = useI18n()
  const { refresh } = useSession()
  const [rows, setRows] = useState<PendingDorm[] | null>(null)
  const [dorms, setDorms] = useState<{ id: string; name: string }[]>([])
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
    setDorms((d.data as { id: string; name: string }[]) ?? [])
    setAdmins((a.data as unknown as typeof admins) ?? [])
  }, [t])

  useEffect(() => { load() }, [load])

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

      <div className="section-title">{t('adm.dorms')}</div>
      {dorms.map((d) => {
        const list = admins.filter((a) => a.dorm_id === d.id)
        return (
          <div className="card stack" key={d.id}>
            <strong>{d.name}</strong>
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
