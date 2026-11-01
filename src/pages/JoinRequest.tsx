import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase, errorKey } from '../lib/supabase'
import { useI18n } from '../lib/i18n'
import { useSession } from '../lib/session'
import { relTime, useRealtime } from '../ui'

type DormRow = { id: string; name: string; address: string | null; hall_count: number; resident_count: number }
type HallRow = { id: string; name: string; resident_count: number }
type Mine = { id: string; status: 'pending' | 'approved' | 'rejected'; created_at: string; hall: { name: string; dorm: { name: string } | null } | null }

/** Anmod om at blive medlem af et kollegie og en bestemt gang. */
export function RequestToJoin() {
  const { t } = useI18n()
  const { refresh, memberships } = useSession()
  const [mine, setMine] = useState<Mine | null | undefined>(undefined)
  const [open, setOpen] = useState(false)
  const [dorms, setDorms] = useState<DormRow[]>([])
  const [q, setQ] = useState('')
  const [dorm, setDorm] = useState<DormRow | null>(null)
  const [halls, setHalls] = useState<HallRow[]>([])
  const [hall, setHall] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.from('join_requests')
      .select('id, status, created_at, hall:halls(name, dorm:dorms(name))')
      .order('created_at', { ascending: false }).limit(1)
    const latest = ((data as unknown as Mine[]) ?? [])[0] ?? null
    setMine(latest)
    // Godkendt → hent medlemskab, så appen åbner gangen.
    if (latest?.status === 'approved' && !memberships.some((m) => m.hall.name === latest.hall?.name)) refresh()
  }, [refresh, memberships])

  useEffect(() => { load() }, [load])
  useRealtime(['join_requests'], load)

  useEffect(() => {
    if (open && !dorms.length) supabase.rpc('approved_dorms').then(({ data }) => setDorms((data as DormRow[]) ?? []))
  }, [open, dorms.length])

  useEffect(() => {
    setHall(''); setHalls([])
    if (dorm) supabase.rpc('dorm_halls', { p_dorm: dorm.id }).then(({ data }) => setHalls((data as HallRow[]) ?? []))
  }, [dorm])

  async function send(e: FormEvent) {
    e.preventDefault()
    setError('')
    const { error } = await supabase.rpc('request_join', { p_hall: hall, p_message: message })
    if (error) return setError(t(errorKey(error)))
    setOpen(false); setDorm(null); setMessage(''); setQ('')
    load()
  }

  async function cancel() {
    if (!mine || !confirm(t('common.confirm'))) return
    await supabase.from('join_requests').delete().eq('id', mine.id)
    load()
  }

  if (mine === undefined) return null

  if (mine?.status === 'pending') {
    return (
      <div className="card stack" style={{ borderColor: 'var(--accent)', borderWidth: 2 }}>
        <strong>⏳ {t('jr.pendingTitle')}</strong>
        <div className="small">{t('jr.pendingBody', { hall: mine.hall?.name ?? '', dorm: mine.hall?.dorm?.name ?? '' })}</div>
        <div className="small muted">{relTime(mine.created_at, 'da-DK')}</div>
        <button className="ghost" style={{ alignSelf: 'flex-start' }} onClick={cancel}>{t('jr.cancel')}</button>
      </div>
    )
  }

  const needle = q.trim().toLowerCase()
  const list = dorms.filter((d) => !needle || d.name.toLowerCase().includes(needle) || (d.address ?? '').toLowerCase().includes(needle))

  return (
    <>
      {mine?.status === 'rejected' && <div className="notice small">{t('jr.rejected', { hall: mine.hall?.name ?? '' })}</div>}
      {!open ? (
        <button className="ghost block" onClick={() => setOpen(true)}>🙋 {t('jr.open')}</button>
      ) : (
        <div className="card stack">
          <div className="row">
            <strong className="grow">{t('jr.open')}</strong>
            <button className="link small" onClick={() => { setOpen(false); setDorm(null) }}>{t('prof.close')}</button>
          </div>
          {!dorm ? (
            <>
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('dorm.searchPh')} autoFocus />
              <div className="stack" style={{ gap: 8, maxHeight: 340, overflowY: 'auto' }}>
                {list.length === 0 && <div className="muted small">{t('dorm.noDorms')}</div>}
                {list.map((d) => (
                  <button key={d.id} className="ghost" onClick={() => setDorm(d)}
                    style={{ textAlign: 'left', color: 'var(--ink)', fontWeight: 400, padding: '10px 12px' }}>
                    <div style={{ fontWeight: 600 }}>{d.name}</div>
                    <div className="small muted">{d.address ? `📍 ${d.address}` : t('dorm.noAddress')}</div>
                    <div className="small muted">{t('dorm.size', { halls: d.hall_count, residents: d.resident_count })}</div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <form className="stack" onSubmit={send}>
              <div className="row">
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>{dorm.name}</div>
                  {dorm.address && <div className="small muted">📍 {dorm.address}</div>}
                </div>
                <button type="button" className="link small" onClick={() => setDorm(null)}>{t('jr.otherDorm')}</button>
              </div>
              <div>
                <label>{t('jr.whichHall')}</label>
                <div className="stack" style={{ gap: 6 }}>
                  {halls.map((h) => (
                    <label key={h.id} className="row" style={{ margin: 0, gap: 8, fontWeight: 500, color: 'var(--ink)', cursor: 'pointer' }}>
                      <input type="radio" name="hall" style={{ width: 'auto' }} checked={hall === h.id} onChange={() => setHall(h.id)} />
                      <span className="grow">{h.name}</span>
                      <span className="small muted">{t('jr.residents', { n: h.resident_count })}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor="jrm">{t('jr.message')}</label>
                <input id="jrm" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} placeholder={t('jr.messagePh')} />
              </div>
              <div className="small muted">{t('jr.note')}</div>
              {error && <div className="error">{error}</div>}
              <button type="submit" disabled={!hall}>{t('jr.send')}</button>
            </form>
          )}
        </div>
      )}
    </>
  )
}

type Pending = { id: string; hall_id: string; hall_name: string; user_name: string; user_email: string; message: string; created_at: string }

/** Åbne anmodninger til gange, man styrer (moderator, administration, superadmin). */
export function PendingRequests({ dormId, hallId }: { dormId: string; hallId?: string }) {
  const { t, locale } = useI18n()
  const [rows, setRows] = useState<Pending[]>([])
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('pending_join_requests', { p_dorm: dormId })
    setRows(((data as Pending[]) ?? []).filter((r) => !hallId || r.hall_id === hallId))
  }, [dormId, hallId])
  useEffect(() => { load() }, [load])
  useRealtime(['join_requests'], load)

  async function decide(id: string, approve: boolean) {
    setError('')
    const { error } = await supabase.rpc('decide_join', { p_id: id, p_approve: approve })
    if (error) setError(t(errorKey(error)))
    load()
  }

  if (!rows.length) return null
  return (
    <>
      <div className="section-title">🙋 {t('jr.requests')} · {rows.length}</div>
      {error && <div className="error">{error}</div>}
      {rows.map((r) => (
        <div className="card stack" key={r.id} style={{ gap: 6, borderColor: 'var(--accent)' }}>
          <div>
            <strong>{r.user_name}</strong> <span className="small muted">· {r.user_email}</span>
            <div className="small muted">{!hallId && `${r.hall_name} · `}{relTime(r.created_at, locale)}</div>
          </div>
          {r.message && <div className="post small">“{r.message}”</div>}
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="danger" onClick={() => decide(r.id, false)}>{t('jr.reject')}</button>
            <button onClick={() => decide(r.id, true)}>{t('jr.approve')}</button>
          </div>
        </div>
      ))}
    </>
  )
}
