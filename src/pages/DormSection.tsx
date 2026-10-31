import { useCallback, useEffect, useState } from 'react'
import { supabase, errorKey } from '../lib/supabase'
import { useI18n } from '../lib/i18n'
import { useSession } from '../lib/session'
import { TrashIcon } from '../ui'

type Person = { user_id: string; name: string; hall: string }
type Friendship = { id: string; from_dorm: string; to_dorm: string; status: 'pending' | 'accepted' }
type DormRow = { id: string; name: string }

/** Bestyrelse og venskabskollegier (vises under Gangen → Beboere). */
export default function DormSection() {
  const { t } = useI18n()
  const { membership, isBoard, adminDorms, refresh } = useSession()
  const dormId = membership!.dorm.id
  const canBoard = isBoard || adminDorms.some((d) => d.id === dormId)
  const [people, setPeople] = useState<Person[]>([])
  const [board, setBoard] = useState<string[]>([])
  const [friends, setFriends] = useState<Friendship[]>([])
  const [dorms, setDorms] = useState<DormRow[]>([])
  const [pickUser, setPickUser] = useState('')
  const [pickDorm, setPickDorm] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [m, b, f, d] = await Promise.all([
      supabase.from('memberships').select('user_id, profile:profiles(display_name), hall:halls(name)'),
      supabase.from('dorm_board').select('user_id').eq('dorm_id', dormId),
      supabase.from('dorm_friendships').select('id, from_dorm, to_dorm, status'),
      supabase.rpc('approved_dorms')
    ])
    type Row = { user_id: string; profile: { display_name: string } | null; hall: { name: string } | null }
    setPeople(((m.data as unknown as Row[]) ?? []).map((r) => ({ user_id: r.user_id, name: r.profile?.display_name ?? '—', hall: r.hall?.name ?? '' }))
      .sort((a, b) => a.name.localeCompare(b.name)))
    setBoard(((b.data as { user_id: string }[]) ?? []).map((r) => r.user_id))
    setFriends((f.data as Friendship[]) ?? [])
    setDorms((d.data as DormRow[]) ?? [])
  }, [dormId])

  useEffect(() => { load() }, [load])

  async function run(fn: () => PromiseLike<{ error: unknown }>) {
    setError('')
    const { error } = await fn()
    if (error) setError(t(errorKey(error)))
    await load()
    refresh()
  }

  const name = (id: string) => people.find((p) => p.user_id === id)
  const dormName = (id: string) => dorms.find((d) => d.id === id)?.name ?? '—'
  const other = (f: Friendship) => (f.from_dorm === dormId ? f.to_dorm : f.from_dorm)
  const taken = new Set(friends.map(other))

  return (
    <>
      <div className="section-title">{t('dorm.board')} · {membership!.dorm.name}</div>
      {error && <div className="error">{error}</div>}
      <div className="list">
        {board.length === 0 && <div className="item muted small">{t('dorm.boardEmpty')}</div>}
        {board.map((id) => (
          <div className="item" key={id}>
            <span className="grow">{name(id)?.name ?? '—'} <span className="muted small">{name(id)?.hall}</span></span>
            {canBoard && (
              <button className="icon" aria-label={t('common.delete')} onClick={() => run(() => supabase.rpc('set_board', { p_user: id, p_value: false }))}>
                <TrashIcon />
              </button>
            )}
          </div>
        ))}
      </div>
      {canBoard && (
        <div className="row">
          <select className="grow" value={pickUser} onChange={(e) => setPickUser(e.target.value)}>
            <option value="">{t('dorm.choose')}</option>
            {people.filter((p) => !board.includes(p.user_id)).map((p) => (
              <option key={p.user_id} value={p.user_id}>{p.name} · {p.hall}</option>
            ))}
          </select>
          <button className="ghost" disabled={!pickUser} onClick={() => { run(() => supabase.rpc('set_board', { p_user: pickUser, p_value: true })); setPickUser('') }}>
            {t('common.add')}
          </button>
        </div>
      )}

      <div className="section-title">{t('dorm.friends')}</div>
      <div className="list">
        {friends.length === 0 && <div className="item muted small">{t('dorm.friendsEmpty')}</div>}
        {friends.map((f) => {
          const incoming = f.status === 'pending' && f.to_dorm === dormId
          return (
            <div className="item" key={f.id} style={{ flexWrap: 'wrap' }}>
              <div className="grow">
                <div>{dormName(other(f))}</div>
                {f.status === 'pending' && <span className="badge">{t(incoming ? 'dorm.pendingIn' : 'dorm.pendingOut')}</span>}
              </div>
              {isBoard && incoming && (
                <div className="row">
                  <button className="ghost" onClick={() => run(() => supabase.rpc('respond_friendship', { p_id: f.id, p_accept: false }))}>{t('dorm.reject')}</button>
                  <button onClick={() => run(() => supabase.rpc('respond_friendship', { p_id: f.id, p_accept: true }))}>{t('dorm.accept')}</button>
                </div>
              )}
              {isBoard && !incoming && (
                <button className="link small" onClick={() => confirm(t('common.confirm')) && run(() => supabase.rpc('end_friendship', { p_id: f.id }))}>
                  {t('dorm.end')}
                </button>
              )}
            </div>
          )
        })}
      </div>
      {isBoard && (
        <div className="row">
          <select className="grow" value={pickDorm} onChange={(e) => setPickDorm(e.target.value)}>
            <option value="">{t('dorm.chooseDorm')}</option>
            {dorms.filter((d) => d.id !== dormId && !taken.has(d.id)).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <button className="ghost" disabled={!pickDorm} onClick={() => { run(() => supabase.rpc('request_friendship', { p_to: pickDorm })); setPickDorm('') }}>
            {t('dorm.requestFriend')}
          </button>
        </div>
      )}
    </>
  )
}
