import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase, errorKey, APP_URL, type Hall } from '../lib/supabase'
import { useI18n } from '../lib/i18n'
import { useSession } from '../lib/session'
import { TopBar, TrashIcon } from '../ui'
import Cleaning from './Cleaning'
import SharedItems from './SharedItems'

type Member = { user_id: string; is_moderator: boolean; joined_at: string; profile: { display_name: string } | null }
type Invite = { code: string; hall_id: string; uses: number; max_uses: number; expires_at: string }

export default function HallPage() {
  const { t } = useI18n()
  const { membership } = useSession()
  const [tab, setTab] = useState<'cleaning' | 'shared' | 'members'>(() => {
    try { return (sessionStorage.getItem('ka.hallTab') as 'cleaning') ?? 'cleaning' } catch { return 'cleaning' }
  })
  const pick = (v: typeof tab) => { setTab(v); try { sessionStorage.setItem('ka.hallTab', v) } catch { /* ignore */ } }
  return (
    <>
      <TopBar title={membership!.hall.name} />
      <main className="stack">
        <div className="seg">
          <button className={tab === 'cleaning' ? 'on' : ''} onClick={() => pick('cleaning')}>{t('hall.tabCleaning')}</button>
          <button className={tab === 'shared' ? 'on' : ''} onClick={() => pick('shared')}>{t('hall.tabShared')}</button>
          <button className={tab === 'members' ? 'on' : ''} onClick={() => pick('members')}>{t('hall.tabMembers')}</button>
        </div>
        {tab === 'cleaning' && <Cleaning />}
        {tab === 'shared' && <SharedItems />}
        {tab === 'members' && <Members />}
      </main>
    </>
  )
}

function Members() {
  const { t, locale } = useI18n()
  const { membership, session, refresh } = useSession()
  const isMod = !!membership?.is_moderator
  const me = session!.user.id
  const [members, setMembers] = useState<Member[]>([])
  const [halls, setHalls] = useState<Hall[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [inviteHall, setInviteHall] = useState(membership!.hall_id)
  const [newHall, setNewHall] = useState('')
  const [copied, setCopied] = useState('')
  const [error, setError] = useState('')
  const [phones, setPhones] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    const [m, h, i] = await Promise.all([
      supabase.from('memberships').select('user_id, is_moderator, joined_at, profile:profiles(display_name)')
        .eq('hall_id', membership!.hall_id).order('joined_at'),
      supabase.from('halls').select('id, name, dorm_id').eq('dorm_id', membership!.dorm.id).order('name'),
      isMod
        ? supabase.from('invites').select('code, hall_id, uses, max_uses, expires_at')
            .gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false })
        : Promise.resolve({ data: [] })
    ])
    setMembers((m.data as unknown as Member[]) ?? [])
    setHalls((h.data as Hall[]) ?? [])
    setInvites(((i.data as Invite[]) ?? []).filter((x) => x.uses < x.max_uses))
    const ph = await supabase.from('phone_numbers').select('user_id, phone')
    setPhones(Object.fromEntries(((ph.data as { user_id: string; phone: string }[]) ?? []).map((x) => [x.user_id, x.phone])))
  }, [membership, isMod])

  useEffect(() => { load() }, [load])

  async function run(fn: () => PromiseLike<{ error: unknown }>) {
    setError('')
    const { error } = await fn()
    if (error) setError(t(errorKey(error)))
    await load()
    return !error
  }

  const hallName = (id: string) => halls.find((h) => h.id === id)?.name ?? ''
  const link = (code: string) => `${APP_URL}/#/join/${code}`

  async function share(inv: Invite) {
    const text = t('hall.inviteShare', { hall: hallName(inv.hall_id), link: link(inv.code) })
    if (navigator.share) {
      try { await navigator.share({ text }) } catch { /* annulleret */ }
    } else {
      await navigator.clipboard.writeText(text)
      setCopied(inv.code); setTimeout(() => setCopied(''), 1500)
    }
  }

  async function addHall(e: FormEvent) {
    e.preventDefault()
    if (await run(() => supabase.rpc('create_hall', { p_name: newHall.trim() }))) setNewHall('')
  }

  return (
    <div className="stack">
        {error && <div className="error">{error}</div>}

        <div className="section-title">{t('hall.members')} · {members.length}</div>
        <div className="list">
          {members.map((m) => (
            <div className="item" key={m.user_id} style={{ flexWrap: 'wrap' }}>
              <div className="grow">
                <div>
                  {m.profile?.display_name ?? '—'}
                  {m.user_id === me && <span className="muted"> ({t('common.you')})</span>}
                </div>
                {phones[m.user_id] && (
                  <a className="small" href={`tel:${phones[m.user_id].replace(/\s/g, '')}`} style={{ color: 'var(--brand)', marginRight: 8 }}>
                    {phones[m.user_id]}
                  </a>
                )}
                {m.is_moderator && <span className="badge">{t('hall.moderator')}</span>}
              </div>
              {isMod && m.user_id !== me && (
                <div className="row">
                  <button className="link small" onClick={() => run(() => supabase.rpc('set_moderator', { p_user: m.user_id, p_value: !m.is_moderator }))}>
                    {t(m.is_moderator ? 'hall.removeMod' : 'hall.makeMod')}
                  </button>
                  <button
                    className="icon" aria-label={t('hall.kick')}
                    onClick={() => confirm(t('hall.kickConfirm', { name: m.profile?.display_name ?? '' })) && run(() => supabase.rpc('remove_member', { p_user: m.user_id }))}
                  >
                    <TrashIcon />
                  </button>
                </div>
              )}
              {isMod && m.user_id === me && m.is_moderator && members.some((x) => x.is_moderator && x.user_id !== me) && (
                <button className="link small" onClick={async () => { await run(() => supabase.rpc('set_moderator', { p_user: me, p_value: false })); refresh() }}>
                  {t('hall.removeMod')}
                </button>
              )}
            </div>
          ))}
        </div>

        {isMod && (
          <>
            <div className="section-title">{t('hall.invites')}</div>
            <div className="card stack">
              <div className="row">
                <select className="grow" value={inviteHall} onChange={(e) => setInviteHall(e.target.value)} aria-label={t('hall.inviteFor')}>
                  {halls.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
                <button onClick={() => run(() => supabase.rpc('create_invite', { p_hall: inviteHall }))}>{t('hall.newInvite')}</button>
              </div>
              {invites.length === 0 && <div className="muted small">{t('hall.noInvites')}</div>}
            </div>
            {invites.length > 0 && (
              <div className="list">
                {invites.map((inv) => (
                  <div className="item" key={inv.code}>
                    <div className="grow">
                      <div className="code">{inv.code}</div>
                      <div className="muted small">
                        {hallName(inv.hall_id)} · {t('hall.inviteInfo', {
                          uses: inv.uses, max: inv.max_uses,
                          date: new Date(inv.expires_at).toLocaleDateString(locale, { day: 'numeric', month: 'short' })
                        })}
                      </div>
                    </div>
                    <button className="ghost small" onClick={() => share(inv)}>
                      {copied === inv.code ? t('common.copied') : t('common.share')}
                    </button>
                    <button className="icon" aria-label={t('common.delete')} onClick={() => run(() => supabase.from('invites').delete().eq('code', inv.code))}>
                      <TrashIcon />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <div className="section-title">{t('hall.otherHalls')} · {membership!.dorm.name}</div>
        <div className="list">
          {halls.map((h) => (
            <div className="item" key={h.id}>
              <span className="grow">{h.name}</span>
              {h.id === membership!.hall_id && <span className="badge dorm">{t('common.you')}</span>}
            </div>
          ))}
        </div>
        {isMod && (
          <form className="row" onSubmit={addHall}>
            <input className="grow" value={newHall} onChange={(e) => setNewHall(e.target.value)} placeholder={t('hall.newHallName')} maxLength={60} />
            <button type="submit" className="ghost" disabled={!newHall.trim()}>{t('hall.newHall')}</button>
          </form>
        )}
    </div>
  )
}
