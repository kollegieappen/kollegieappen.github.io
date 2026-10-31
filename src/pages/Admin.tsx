import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, errorKey } from '../lib/supabase'
import { useI18n } from '../lib/i18n'
import { useSession } from '../lib/session'
import { TopBar } from '../ui'

type PendingDorm = {
  id: string; name: string; address: string | null; created_at: string
  requester_email: string | null; requester_name: string | null; hall_names: string[]
}

export default function Admin({ standalone = false }: { standalone?: boolean }) {
  const { t, locale } = useI18n()
  const { refresh } = useSession()
  const [rows, setRows] = useState<PendingDorm[] | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('pending_dorms')
    if (error) setError(t(errorKey(error)))
    setRows((data as PendingDorm[]) ?? [])
  }, [t])

  useEffect(() => { load() }, [load])

  async function decide(id: string, approve: boolean) {
    if (!approve && !confirm(t('common.confirm'))) return
    const { error } = await supabase.rpc('decide_dorm', { p_dorm: id, p_approve: approve })
    if (error) setError(t(errorKey(error)))
    await load()
    refresh()
  }

  return (
    <div className={standalone ? 'app' : undefined}>
      <TopBar title={t('admin.title')} />
      <main className={'stack' + (standalone ? ' plain' : '')}>
        {standalone && <Link to="/">←</Link>}
        {error && <div className="error">{error}</div>}
        {rows === null ? (
          <div className="empty">{t('common.loading')}</div>
        ) : rows.length === 0 ? (
          <div className="empty">{t('admin.empty')}</div>
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
      </main>
    </div>
  )
}
