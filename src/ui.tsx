import { useEffect, useRef, useState } from 'react'
import { HelpDialogContent } from './pages/Help'
import { supabase } from './lib/supabase'
import { useSession } from './lib/session'
import { useI18n } from './lib/i18n'

export function TopBar({ title, help }: { title: string; help?: string[] }) {
  const { membership, memberships, switchHall } = useSession()
  const { t } = useI18n()
  const dialog = useRef<HTMLDialogElement>(null)
  const hallDialog = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)
  const many = memberships.length > 1
  return (
    <header className="topbar">
      <h1>{title}</h1>
      {help && (
        <button className="help-btn" aria-label="?" onClick={() => { setOpen(true); dialog.current?.showModal() }}>?</button>
      )}
      {membership && (
        many ? (
          <button className="where where-btn" onClick={() => hallDialog.current?.showModal()} aria-label={t('hall.switch')}>
            {membership.hall.name} ▾
            <br />
            {membership.dorm.name}
          </button>
        ) : (
          <span className="where">
            {membership.hall.name}
            <br />
            {membership.dorm.name}
          </span>
        )
      )}
      {many && (
        <dialog ref={hallDialog}>
          <div className="stack">
            <strong style={{ fontSize: 18 }}>{t('hall.switch')}</strong>
            <div className="list">
              {memberships.map((m) => (
                <button key={m.hall_id} className="item ghost" style={{ border: 'none', borderRadius: 0, width: '100%', textAlign: 'left', color: 'var(--ink)' }}
                  onClick={() => { hallDialog.current?.close(); if (m.hall_id !== membership?.hall_id) switchHall(m.hall_id) }}>
                  <span className="grow">
                    <strong>{m.hall.name}</strong><br />
                    <span className="small muted">{m.dorm.name}</span>
                  </span>
                  {m.hall_id === membership?.hall_id && <span>✓</span>}
                </button>
              ))}
            </div>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="ghost" onClick={() => hallDialog.current?.close()}>{t('prof.close')}</button>
            </div>
          </div>
        </dialog>
      )}
      {help && (
        <dialog ref={dialog} onClose={() => setOpen(false)}>
          {open && <HelpDialogContent pages={help} onClose={() => dialog.current?.close()} />}
        </dialog>
      )}
    </header>
  )
}

/** Kalder onChange, når en af tabellerne ændrer sig (RLS bestemmer, hvad vi hører om). */
export function useRealtime(tables: string[], onChange: () => void) {
  const cb = useRef(onChange)
  cb.current = onChange
  const key = tables.join(',')
  useEffect(() => {
    const channel = supabase.channel('rt-' + key + '-' + Math.random().toString(36).slice(2))
    for (const table of key.split(',')) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => cb.current())
    }
    channel.subscribe()
    // Hent igen, når appen kommer i forgrunden (fx efter telefonen har sovet).
    const onVisible = () => document.visibilityState === 'visible' && cb.current()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      supabase.removeChannel(channel)
    }
  }, [key])
}

export function relTime(iso: string, locale: string) {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const abs = Math.abs(diff)
  if (abs < 60) return rtf.format(Math.round(diff), 'second')
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour')
  if (abs < 7 * 86400) return rtf.format(Math.round(diff / 86400), 'day')
  return new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short' })
}

export function TrashIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16 M10 11v6 M14 11v6 M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12 M9 7V4h6v3" />
    </svg>
  )
}

export function EditIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20h4L19 9l-4-4L4 16z M13.5 6.5l4 4" />
    </svg>
  )
}
