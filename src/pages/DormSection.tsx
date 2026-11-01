import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { supabase, errorKey } from '../lib/supabase'
import { useI18n } from '../lib/i18n'
import { useSession } from '../lib/session'
import { TrashIcon } from '../ui'
import { Tip } from './Help'
import { geocode } from '../lib/geo'
import type { MapDorm } from './DormMap'

const DormMap = lazy(() => import('./DormMap'))

type Person = { user_id: string; name: string; hall: string }
type Friendship = { id: string; from_dorm: string; to_dorm: string; status: 'pending' | 'accepted' }
type DormRow = { id: string; name: string; address: string | null; hall_count?: number; resident_count?: number; lat?: number | null; lng?: number | null }

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
  const [finding, setFinding] = useState(false)
  const [search, setSearch] = useState('')
  const [editAddr, setEditAddr] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [friendView, setFriendView] = useState<'list' | 'map'>('list')
  const [findView, setFindView] = useState<'list' | 'map'>('list')

  const load = useCallback(async () => {
    const [m, b, f, d] = await Promise.all([
      supabase.from('memberships').select('user_id, profile:profiles(display_name), hall:halls!inner(name, dorm_id)').eq('hall.dorm_id', dormId),
      supabase.from('dorm_board').select('user_id').eq('dorm_id', dormId),
      supabase.from('dorm_friendships').select('id, from_dorm, to_dorm, status'),
      supabase.rpc('approved_dorms')
    ])
    type Row = { user_id: string; profile: { display_name: string } | null; hall: { name: string } | null }
    setPeople(((m.data as unknown as Row[]) ?? []).map((r) => ({ user_id: r.user_id, name: r.profile?.display_name ?? '—', hall: r.hall?.name ?? '' }))
      .sort((a, b) => a.name.localeCompare(b.name)))
    setBoard(((b.data as { user_id: string }[]) ?? []).map((r) => r.user_id))
    setFriends(((f.data as Friendship[]) ?? []).filter((x) => x.from_dorm === dormId || x.to_dorm === dormId))
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
      <div className="section-title">{t('dorm.board')} · {membership!.dorm.name} <Tip k="board" /></div>
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

      <div className="section-title">{t('dorm.address')}</div>
      {editAddr === null ? (
        <div className="card row">
          <span className="grow">📍 {dorms.find((d) => d.id === dormId)?.address || <span className="muted">{t('dorm.noAddress')}</span>}</span>
          {canBoard && (
            <button className="link small" onClick={() => setEditAddr(dorms.find((d) => d.id === dormId)?.address ?? '')}>{t('dorm.editAddress')}</button>
          )}
        </div>
      ) : (
        <form className="row" onSubmit={async (e) => {
          e.preventDefault()
          const addr = editAddr
          setEditAddr(null)
          const c = await geocode(addr)
          run(() => supabase.rpc('set_dorm_address', { p_dorm: dormId, p_address: addr, p_lat: c?.lat ?? null, p_lng: c?.lng ?? null }))
        }}>
          <input className="grow" value={editAddr} onChange={(e) => setEditAddr(e.target.value)} maxLength={160} placeholder={t('dorm.addressPh')} autoFocus />
          <button type="button" className="ghost" onClick={() => setEditAddr(null)}>{t('common.cancel')}</button>
          <button type="submit">{t('common.save')}</button>
        </form>
      )}

      <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
        <span className="section-title" style={{ margin: '0 4px' }}>{t('dorm.friends')} <Tip k="friends" /></span>
        <ViewToggle value={friendView} onChange={setFriendView} />
      </div>
      {friendView === 'map' && (
        <Suspense fallback={<div className="empty">{t('common.loading')}</div>}>
          <DormMap dorms={[
            ...dorms.filter((d) => d.id === dormId).map((d) => ({ ...d, kind: 'me' as const })),
            ...friends.map((f) => {
              const d = dorms.find((x) => x.id === other(f))
              return d ? { ...d, kind: (f.status === 'accepted' ? 'friend' : 'pending') as MapDorm['kind'] } : null
            }).filter((x): x is MapDorm => !!x)
          ]} />
        </Suspense>
      )}
      <div className="list" style={friendView === 'map' ? { display: 'none' } : undefined}>
        {friends.length === 0 && <div className="item muted small">{t('dorm.friendsEmpty')}</div>}
        {friends.map((f) => {
          const incoming = f.status === 'pending' && f.to_dorm === dormId
          const d = dorms.find((x) => x.id === other(f))
          return (
            <div className="item" key={f.id} style={{ flexWrap: 'wrap' }}>
              <div className="grow">
                <div style={{ fontWeight: 600 }}>{d?.name ?? '—'}</div>
                {d?.address && <div className="small muted">📍 {d.address}</div>}
                {f.status === 'pending' && <span className="badge" style={{ marginTop: 4 }}>{t(incoming ? 'dorm.pendingIn' : 'dorm.pendingOut')}</span>}
              </div>
              {isBoard && incoming && (
                <div className="row">
                  <button className="ghost" onClick={() => run(() => supabase.rpc('respond_friendship', { p_id: f.id, p_accept: false }))}>{t('dorm.reject')}</button>
                  <button onClick={() => run(() => supabase.rpc('respond_friendship', { p_id: f.id, p_accept: true }))}>{t('dorm.accept')}</button>
                </div>
              )}
              {isBoard && !incoming && (
                <button className="link small" onClick={() => confirm(t('common.confirm')) && run(() => supabase.rpc('end_friendship', { p_id: f.id }))}>
                  {t(f.status === 'pending' ? 'dorm.cancelRequest' : 'dorm.end')}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {isBoard && !finding && (
        <button className="ghost" onClick={() => setFinding(true)}>🔎 {t('dorm.findFriend')}</button>
      )}
      {isBoard && finding && (() => {
        const q = search.trim().toLowerCase()
        const list = dorms
          .filter((d) => d.id !== dormId && !taken.has(d.id))
          .filter((d) => !q || d.name.toLowerCase().includes(q) || (d.address ?? '').toLowerCase().includes(q))
        return (
          <div className="card stack">
            <div className="row">
              <strong className="grow">{t('dorm.findFriend')}</strong>
              <button className="link small" onClick={() => { setFinding(false); setSearch('') }}>{t('prof.close')}</button>
            </div>
            <div className="row">
              <input className="grow" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('dorm.searchPh')} autoFocus />
              <ViewToggle value={findView} onChange={setFindView} />
            </div>
            {findView === 'map' && (
              <Suspense fallback={<div className="empty">{t('common.loading')}</div>}>
                <DormMap
                  dorms={[
                    ...dorms.filter((d) => d.id === dormId).map((d) => ({ ...d, kind: 'me' as const })),
                    ...list.map((d) => ({ ...d, kind: 'candidate' as const }))
                  ]}
                  renderSelected={(d) => d.kind === 'candidate' && (
                    <button style={{ alignSelf: 'flex-start' }} onClick={() => { run(() => supabase.rpc('request_friendship', { p_to: d.id })); setFinding(false); setSearch('') }}>
                      {t('dorm.requestFriend')}
                    </button>
                  )}
                />
              </Suspense>
            )}
            {findView === 'map' ? null : list.length === 0 ? (
              <div className="muted small">{t('dorm.noDorms')}</div>
            ) : (
              <div className="stack" style={{ gap: 8, maxHeight: 360, overflowY: 'auto' }}>
                {list.map((d) => (
                  <div key={d.id} className="row" style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', alignItems: 'center' }}>
                    <div className="grow">
                      <div style={{ fontWeight: 600 }}>{d.name}</div>
                      <div className="small muted">
                        {d.address ? `📍 ${d.address}` : t('dorm.noAddress')}
                      </div>
                      {d.resident_count !== undefined && (
                        <div className="small muted">{t('dorm.size', { halls: d.hall_count ?? 0, residents: d.resident_count })}</div>
                      )}
                    </div>
                    <button onClick={() => { run(() => supabase.rpc('request_friendship', { p_to: d.id })); setFinding(false); setSearch('') }}>
                      {t('dorm.requestFriend')}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })()}
    </>
  )
}

function ViewToggle({ value, onChange }: { value: 'list' | 'map'; onChange: (v: 'list' | 'map') => void }) {
  const { t } = useI18n()
  return (
    <div className="seg" style={{ flex: 'none' }}>
      <button type="button" className={value === 'list' ? 'on' : ''} onClick={() => onChange('list')}>{t('map.list')}</button>
      <button type="button" className={value === 'map' ? 'on' : ''} onClick={() => onChange('map')}>{t('map.map')}</button>
    </div>
  )
}
