import { useEffect, useRef } from 'react'
import { supabase } from './lib/supabase'
import { useSession } from './lib/session'

export function TopBar({ title }: { title: string }) {
  const { membership } = useSession()
  return (
    <header className="topbar">
      <h1>{title}</h1>
      {membership && (
        <span className="where">
          {membership.hall.name}
          <br />
          {membership.dorm.name}
        </span>
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
