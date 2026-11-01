import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, type Dorm, type Membership, type Profile } from './supabase'
import { useI18n } from './i18n'

type Ctx = {
  ready: boolean
  session: Session | null
  profile: Profile | null
  membership: Membership | null
  memberships: Membership[]
  switchHall: (hallId: string) => Promise<void>
  isSuperadmin: boolean
  isBoard: boolean
  adminDorms: Dorm[]
  hasFriends: boolean
  friendDorms: string[]
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
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [isSuperadmin, setIsSuperadmin] = useState(false)
  const [isBoard, setIsBoard] = useState(false)
  const [adminDorms, setAdminDorms] = useState<Dorm[]>([])
  const [friendDorms, setFriendDorms] = useState<string[]>([])
  const [recovering, setRecovering] = useState(false)

  const load = useCallback(async (s: Session | null) => {
    setSession(s)
    if (!s) {
      setProfile(null); setMembership(null); setMemberships([]); setIsSuperadmin(false); setIsBoard(false); setAdminDorms([]); setFriendDorms([]); setReady(true)
      return
    }
    const uid = s.user.id
    const [p, m, a, b, ad, fr] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).maybeSingle(),
      supabase
        .from('memberships')
        .select('hall_id, is_moderator, joined_at, halls(id, name, dorm_id, dorms(id, name, status))')
        .eq('user_id', uid)
        .order('joined_at'),
      supabase.from('superadmins').select('user_id').eq('user_id', uid).maybeSingle(),
      supabase.from('dorm_board').select('dorm_id').eq('user_id', uid),
      supabase.from('dorm_admins').select('dorms(id, name, status)').eq('user_id', uid),
      supabase.from('dorm_friendships').select('from_dorm, to_dorm').eq('status', 'accepted')
    ])
    const prof = (p.data as Profile | null) ?? null
    setProfile(prof)
    if (prof?.language) setLang(prof.language)
    type Row = {
      hall_id: string; is_moderator: boolean
      halls: { id: string; name: string; dorm_id: string; dorms: Membership['dorm'] } | null
    }
    const rows = ((m.data as unknown as Row[]) ?? []).filter((r) => r.halls)
    const list: Membership[] = rows.map((r) => ({
      hall_id: r.hall_id,
      is_moderator: r.is_moderator,
      hall: { id: r.halls!.id, name: r.halls!.name, dorm_id: r.halls!.dorm_id },
      dorm: r.halls!.dorms
    }))
    // Den valgte gang, ellers den første (samme regel som i databasen).
    const current = (prof as unknown as { current_hall_id?: string | null })?.current_hall_id
    setMemberships(list)
    setMembership(list.find((x) => x.hall_id === current) ?? list[0] ?? null)
    // Medlem af en gang → en gemt invitationskode er brugt op.
    if (list.length) try { localStorage.removeItem('ka.joinCode') } catch { /* ignore */ }
    setIsSuperadmin(!!a.data)
    const activeDorm = (list.find((x) => x.hall_id === current) ?? list[0])?.dorm.id
    setIsBoard(((b.data as { dorm_id: string }[]) ?? []).some((x) => x.dorm_id === activeDorm))
    setAdminDorms(((ad.data as unknown as { dorms: Dorm | null }[]) ?? []).map((r) => r.dorms).filter((d): d is Dorm => !!d && d.status === 'approved'))
    // Kun venskaber for den aktive gangs kollegie (superadmin kan se alle).
    setFriendDorms(((fr.data as { from_dorm: string; to_dorm: string }[]) ?? [])
      .filter((x) => activeDorm && (x.from_dorm === activeDorm || x.to_dorm === activeDorm))
      .map((x) => (x.from_dorm === activeDorm ? x.to_dorm : x.from_dorm)))
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

  const switchHall = useCallback(async (hallId: string) => {
    await supabase.rpc('switch_hall', { p_hall: hallId })
    window.location.hash = '#/'
    await refresh()
  }, [refresh])

  return (
    <SessionContext.Provider
      value={{ ready, session, profile, membership, memberships, switchHall, isSuperadmin, isBoard, adminDorms, hasFriends: friendDorms.length > 0, friendDorms, recovering, setRecovering, refresh }}
    >
      {children}
    </SessionContext.Provider>
  )
}

export const useSession = () => useContext(SessionContext)
