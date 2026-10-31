import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, type Membership, type Profile } from './supabase'
import { useI18n } from './i18n'

type Ctx = {
  ready: boolean
  session: Session | null
  profile: Profile | null
  membership: Membership | null
  isSuperadmin: boolean
  recovering: boolean
  setRecovering: (v: boolean) => void
  refresh: () => Promise<void>
}

const SessionContext = createContext<Ctx>(null as unknown as Ctx)

export function SessionProvider({ children }: { children: ReactNode }) {
  const { setLang } = useI18n()
  const [ready, setReady] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [membership, setMembership] = useState<Membership | null>(null)
  const [isSuperadmin, setIsSuperadmin] = useState(false)
  const [recovering, setRecovering] = useState(false)

  const load = useCallback(async (s: Session | null) => {
    setSession(s)
    if (!s) {
      setProfile(null); setMembership(null); setIsSuperadmin(false); setReady(true)
      return
    }
    const uid = s.user.id
    const [p, m, a] = await Promise.all([
      supabase.from('profiles').select('id, display_name, language').eq('id', uid).maybeSingle(),
      supabase
        .from('memberships')
        .select('hall_id, is_moderator, halls(id, name, dorm_id, dorms(id, name, status))')
        .eq('user_id', uid)
        .maybeSingle(),
      supabase.from('superadmins').select('user_id').eq('user_id', uid).maybeSingle()
    ])
    const prof = (p.data as Profile | null) ?? null
    setProfile(prof)
    if (prof?.language) setLang(prof.language)
    const row = m.data as unknown as {
      hall_id: string; is_moderator: boolean
      halls: { id: string; name: string; dorm_id: string; dorms: Membership['dorm'] } | null
    } | null
    setMembership(
      row && row.halls
        ? {
            hall_id: row.hall_id,
            is_moderator: row.is_moderator,
            hall: { id: row.halls.id, name: row.halls.name, dorm_id: row.halls.dorm_id },
            dorm: row.halls.dorms
          }
        : null
    )
    setIsSuperadmin(!!a.data)
    setReady(true)
  }, [setLang])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      load(data.session)
      // Fjern ?code=… fra adresselinjen efter login via mail-link.
      if (window.location.search) history.replaceState(null, '', window.location.pathname + window.location.hash)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        // Udskyd, så vi ikke kalder Supabase inde i dens egen callback.
        setTimeout(() => load(s), 0)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [load])

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    await load(data.session)
  }, [load])

  return (
    <SessionContext.Provider
      value={{ ready, session, profile, membership, isSuperadmin, recovering, setRecovering, refresh }}
    >
      {children}
    </SessionContext.Provider>
  )
}

export const useSession = () => useContext(SessionContext)
