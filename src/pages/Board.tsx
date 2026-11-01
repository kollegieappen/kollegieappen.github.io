import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase, errorKey } from '../lib/supabase'
import { useI18n } from '../lib/i18n'
import { useSession } from '../lib/session'
import { EditIcon, TopBar, TrashIcon, relTime, useRealtime } from '../ui'
import Mailbox from './Mailbox'
import { Tip } from './Help'

type Tab = 'hall' | 'mail' | 'dorm' | 'friends'
type Kind = 'post' | 'sublet' | 'announcement'
type HallRef = { hall: { name: string } | null }
type Post = {
  id: string; body: string; created_at: string; edited_at: string | null; created_by: string | null
  hall_id: string | null; dorm_id: string | null; kind: Kind; is_friends: boolean
  dorm: { name: string } | null
  author: { display_name: string; memberships?: HallRef | HallRef[] | null } | null
}
type Option = { id: string; post_id: string; label: string; position: number }
type Vote = { post_id: string; option_id: string; user_id: string }

const authorHall = (p: Post) => {
  const m = p.author?.memberships
  return (Array.isArray(m) ? m[0] : m)?.hall?.name ?? null
}

export default function Board() {
  const { t } = useI18n()
  const [tab, setTab] = useState<Tab>(() => {
    try { return (sessionStorage.getItem('ka.boardTab') as Tab) || 'hall' } catch { return 'hall' }
  })
  const pick = (v: Tab) => { setTab(v); try { sessionStorage.setItem('ka.boardTab', v) } catch { /* ignore */ } }
  const tabs: Tab[] = ['hall', 'mail', 'dorm', 'friends']
  const label: Record<Tab, string> = { hall: 'board.tabHall', mail: 'board.tabMail', dorm: 'board.tabDorm', friends: 'board.tabFriends' }

  return (
    <>
      <TopBar title={t('board.title')} help={['board', 'mailbox']} />
      <main className="stack">
        <div className="seg">
          {tabs.map((x) => (
            <button key={x} className={tab === x ? 'on' : ''} onClick={() => pick(x)} style={{ fontSize: 13 }}>{t(label[x])}</button>
          ))}
        </div>
        {tab === 'mail' ? <Mailbox /> : <Feed key={tab} tab={tab} />}
      </main>
    </>
  )
}

type Period = 'all' | 'today' | 'week' | 'month' | 'date' | 'range'
type Filters = { q: string; period: Period; date: string; from: string; to: string; group: string }
const noFilters: Filters = { q: '', period: 'all', date: '', from: '', to: '', group: '' }

const pad2 = (n: number) => String(n).padStart(2, '0')
const isoDay = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
const startOf = (iso: string) => new Date(iso + 'T00:00:00')
const plusDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }

/** Tidsrum → [fra, til) som ISO-tidspunkter, eller null for "alle". */
function periodRange(f: Filters): [string | null, string | null] {
  const today = startOf(isoDay(new Date()))
  switch (f.period) {
    case 'today': return [today.toISOString(), null]
    case 'week': return [plusDays(today, -6).toISOString(), null]
    case 'month': return [plusDays(today, -29).toISOString(), null]
    case 'date': return f.date ? [startOf(f.date).toISOString(), plusDays(startOf(f.date), 1).toISOString()] : [null, null]
    case 'range': return [f.from ? startOf(f.from).toISOString() : null, f.to ? plusDays(startOf(f.to), 1).toISOString() : null]
    default: return [null, null]
  }
}

function Feed({ tab }: { tab: Exclude<Tab, 'mail'> }) {
  const { t } = useI18n()
  const { membership, hasFriends, friendDorms } = useSession()
  const [posts, setPosts] = useState<Post[] | null>(null)
  const [options, setOptions] = useState<Option[]>([])
  const [votes, setVotes] = useState<Vote[]>([])
  const [filter, setFilter] = useState<'all' | 'sublet' | 'nosublet'>('all')
  const [f, setF] = useState<Filters>(noFilters)
  const [query, setQuery] = useState('') // forsinket søgetekst
  const [showFilters, setShowFilters] = useState(false)
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([])

  // Søg først, når man holder pause i skrivningen.
  useEffect(() => { const id = setTimeout(() => setQuery(f.q.trim()), 300); return () => clearTimeout(id) }, [f.q])

  // Valgmuligheder: gange (kollegiet) eller kollegier (venskab).
  useEffect(() => {
    if (tab === 'dorm') {
      supabase.from('halls').select('id, name').eq('dorm_id', membership!.dorm.id).order('name')
        .then(({ data }) => setGroups((data as { id: string; name: string }[]) ?? []))
    } else if (tab === 'friends') {
      supabase.from('dorm_friendships').select('from_dorm, to_dorm').eq('status', 'accepted').then(async ({ data }) => {
        const ids = new Set<string>([membership!.dorm.id])
        for (const r of (data as { from_dorm: string; to_dorm: string }[]) ?? []) { ids.add(r.from_dorm); ids.add(r.to_dorm) }
        const { data: d } = await supabase.from('dorms').select('id, name').in('id', [...ids]).order('name')
        setGroups((d as { id: string; name: string }[]) ?? [])
      })
    }
  }, [tab, membership])

  const [from, to] = periodRange(f)

  const load = useCallback(async () => {
    let q = supabase
      .from('posts')
      .select('id, body, created_at, edited_at, created_by, hall_id, dorm_id, kind, is_friends, dorm:dorms(name), author:profiles!posts_created_by_fkey(display_name, memberships(hall:halls(name)))')
      .order('created_at', { ascending: false })
      .limit(100)
    if (tab === 'hall') q = q.eq('hall_id', membership!.hall_id)
    else if (tab === 'dorm') q = q.eq('dorm_id', membership!.dorm.id).eq('is_friends', false)
    else {
      q = q.eq('is_friends', true).in('dorm_id', [membership!.dorm.id, ...friendDorms])
      if (f.group) q = q.eq('dorm_id', f.group)
    }
    if (query) q = q.ilike('body', `%${query.replace(/[\\%_]/g, (c) => '\\' + c)}%`)
    if (from) q = q.gte('created_at', from)
    if (to) q = q.lt('created_at', to)
    const { data, error } = await q
    if (error) console.error('posts', error)
    const list = (data as unknown as Post[]) ?? []
    setPosts(list)
    const ids = list.map((p) => p.id)
    if (ids.length) {
      const [o, v] = await Promise.all([
        supabase.from('poll_options').select('id, post_id, label, position').in('post_id', ids).order('position'),
        supabase.from('poll_votes').select('post_id, option_id, user_id').in('post_id', ids)
      ])
      setOptions((o.data as Option[]) ?? [])
      setVotes((v.data as Vote[]) ?? [])
    }
  }, [tab, membership, friendDorms, query, from, to, f.group])

  useEffect(() => { load() }, [load])
  useRealtime(['posts', 'poll_votes'], load)

  if (tab === 'friends' && !hasFriends) return <div className="empty">{t('board.noFriends')}</div>

  const hallName = tab === 'dorm' ? groups.find((g) => g.id === f.group)?.name : undefined
  const active = (f.period !== 'all' ? 1 : 0) + (f.group ? 1 : 0)
  const filtering = active > 0 || !!query || filter !== 'all'
  const announcements = tab === 'dorm' && !filtering ? (posts ?? []).filter((p) => p.kind === 'announcement').slice(0, 3) : []
  const rest = (posts ?? [])
    .filter((p) => !announcements.includes(p))
    .filter((p) => filter === 'all' || (filter === 'sublet' ? p.kind === 'sublet' : p.kind !== 'sublet'))
    .filter((p) => !hallName || authorHall(p) === hallName)
  const set = (patch: Partial<Filters>) => setF((x) => ({ ...x, ...patch }))
  const periods: Period[] = ['all', 'today', 'week', 'month', 'date', 'range']

  return (
    <>
      {tab === 'dorm' && <div className="muted small">{t('board.squareHint', { dorm: membership!.dorm.name })}</div>}
      {tab === 'friends' && <div className="muted small">{t('board.friendsHint')}</div>}

      {announcements.map((p) => (
        <PostCard key={p.id} post={p} options={options} votes={votes} onChange={load} tab={tab} />
      ))}

      <Composer tab={tab} onPosted={load} />

      <div className="row">
        <input className="grow" type="search" value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder={t('board.search')} />
        <button className={active ? '' : 'ghost'} onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}>
          {t('board.filter')}{active ? ` (${active})` : ''} {showFilters ? '▴' : '▾'}
        </button>
      </div>

      {showFilters && (
        <div className="card stack" style={{ gap: 10 }}>
          <div>
            <label htmlFor="fp">{t('board.period')}</label>
            <select id="fp" value={f.period} onChange={(e) => set({ period: e.target.value as Period })}>
              {periods.map((p) => <option key={p} value={p}>{t('board.period.' + p)}</option>)}
            </select>
          </div>
          {f.period === 'date' && (
            <input type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} aria-label={t('board.period.date')} />
          )}
          {f.period === 'range' && (
            <div className="row">
              <div className="grow"><label htmlFor="ff">{t('board.from')}</label><input id="ff" type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} /></div>
              <div className="grow"><label htmlFor="ft">{t('board.to')}</label><input id="ft" type="date" value={f.to} onChange={(e) => set({ to: e.target.value })} /></div>
            </div>
          )}
          {tab !== 'hall' && groups.length > 0 && (
            <div>
              <label htmlFor="fg">{t(tab === 'dorm' ? 'common.hall' : 'common.dorm')}</label>
              <select id="fg" value={f.group} onChange={(e) => set({ group: e.target.value })}>
                <option value="">{t('common.all')}</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          )}
          {active > 0 && (
            <button className="link small" style={{ alignSelf: 'flex-start', padding: 0 }} onClick={() => setF({ ...noFilters, q: f.q })}>
              {t('board.reset')}
            </button>
          )}
        </div>
      )}

      {tab !== 'hall' && (
        <div className="seg">
          <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>{t('board.filterAll')}</button>
          <button className={filter === 'sublet' ? 'on' : ''} onClick={() => setFilter('sublet')}>{t('board.onlySublet')}</button>
          <button className={filter === 'nosublet' ? 'on' : ''} onClick={() => setFilter('nosublet')}>{t('board.noSublet')}</button>
        </div>
      )}

      {posts === null ? (
        <div className="empty">{t('common.loading')}</div>
      ) : rest.length === 0 ? (
        <div className="empty">
          {filtering ? t('board.noMatches') : t(tab === 'hall' ? 'board.emptyHall' : tab === 'dorm' ? 'board.emptySquare' : 'board.emptyFriends')}
        </div>
      ) : (
        <>
          {filtering && <div className="small muted" style={{ padding: '0 4px' }}>{t('board.matches', { n: rest.length })}</div>}
          {rest.map((p) => <PostCard key={p.id} post={p} options={options} votes={votes} onChange={load} tab={tab} />)}
        </>
      )}
    </>
  )
}

function Composer({ tab, onPosted }: { tab: Exclude<Tab, 'mail'>; onPosted: () => void }) {
  const { t } = useI18n()
  const { membership, isBoard, adminDorms } = useSession()
  const [body, setBody] = useState('')
  const [kind, setKind] = useState<Kind>('post')
  const [poll, setPoll] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const canAnnounce = isBoard || adminDorms.some((d) => d.id === membership!.dorm.id)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setBusy(true); setError('')
    const { data, error } = await supabase.from('posts').insert({
      body: body.trim(),
      kind: tab === 'hall' ? 'post' : kind,
      is_friends: tab === 'friends',
      hall_id: tab === 'hall' ? membership!.hall_id : null,
      dorm_id: tab === 'hall' ? null : membership!.dorm.id
    }).select('id').single()
    if (!error && poll) {
      const labels = poll.map((l) => l.trim()).filter(Boolean)
      if (labels.length >= 2) {
        await supabase.from('poll_options').insert(labels.map((label, position) => ({ post_id: data!.id, label, position })))
      }
    }
    setBusy(false)
    if (error) return setError(t(errorKey(error)))
    setBody(''); setPoll(null); setKind('post')
    onPosted()
  }

  const kinds: Kind[] = tab === 'dorm' && canAnnounce ? ['post', 'sublet', 'announcement'] : ['post', 'sublet']
  const kindLabel: Record<Kind, string> = { post: 'board.kindPost', sublet: 'board.kindSublet', announcement: 'board.kindAnnouncement' }

  return (
    <form className="card stack" onSubmit={submit}>
      {tab !== 'hall' && (
        <div className="row">
          <div className="seg grow">
            {kinds.map((k) => (
              <button type="button" key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{t(kindLabel[k])}</button>
            ))}
          </div>
          <Tip k="postKind" />
        </div>
      )}
      <textarea
        value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000}
        placeholder={kind === 'sublet' ? t('board.subletHint') : t('board.placeholder')}
      />
      {poll && (
        <div className="stack" style={{ gap: 8 }}>
          {poll.map((v, i) => (
            <input
              key={i} value={v} maxLength={100} placeholder={t('board.option', { n: i + 1 })}
              onChange={(e) => setPoll((p) => p!.map((x, j) => (j === i ? e.target.value : x)))}
            />
          ))}
          {poll.length < 8 && (
            <button type="button" className="link small" style={{ alignSelf: 'flex-start' }} onClick={() => setPoll((p) => [...p!, ''])}>
              {t('board.addOption')}
            </button>
          )}
        </div>
      )}
      {error && <div className="error">{error}</div>}
      <div className="row">
        <button type="button" className="link small" onClick={() => setPoll(poll ? null : ['', ''])}>
          {poll ? t('board.removePoll') : '📊 ' + t('board.addPoll')}
        </button>
        {!poll && <Tip k="poll" />}
        <span className="grow" />
        <button type="submit" disabled={busy || !body.trim() || (!!poll && poll.filter((x) => x.trim()).length < 2)}>
          {t('board.post')}
        </button>
      </div>
    </form>
  )
}

function PostCard({ post: p, options, votes, onChange, tab }: {
  post: Post; options: Option[]; votes: Vote[]; onChange: () => void; tab: Exclude<Tab, 'mail'>
}) {
  const { t, locale } = useI18n()
  const { membership, session, isBoard, isSuperadmin } = useSession()
  const me = session!.user.id
  const [editing, setEditing] = useState(false)
  const [editBody, setEditBody] = useState(p.body)
  const mine = p.created_by === me
  const fromMyDorm = p.dorm_id === membership!.dorm.id || !!p.hall_id
  const canDelete = mine || isSuperadmin || (p.hall_id ? membership!.is_moderator : fromMyDorm && isBoard)
  const opts = options.filter((o) => o.post_id === p.id)
  const pv = votes.filter((v) => v.post_id === p.id)
  const myVote = pv.find((v) => v.user_id === me)?.option_id

  async function saveEdit() {
    if (!editBody.trim()) return
    await supabase.from('posts').update({ body: editBody.trim() }).eq('id', p.id)
    setEditing(false)
    onChange()
  }

  async function remove() {
    if (!confirm(t('common.confirm'))) return
    await supabase.from('posts').delete().eq('id', p.id)
    onChange()
  }

  async function vote(optionId: string) {
    await supabase.from('poll_votes').delete().eq('post_id', p.id).eq('user_id', me)
    if (optionId !== myVote) await supabase.from('poll_votes').insert({ post_id: p.id, option_id: optionId })
    onChange()
  }

  const badge = tab === 'friends' && p.dorm_id !== membership!.dorm.id ? p.dorm?.name : authorHall(p)
  const isAnn = p.kind === 'announcement'

  return (
    <article className="card" style={isAnn ? { borderColor: 'var(--accent)', borderWidth: 2 } : undefined}>
      <div className="post-meta" style={{ flexWrap: 'wrap' }}>
        {isAnn && <span className="badge" style={{ background: 'var(--accent)' }}>📣 {t('board.announcement')}</span>}
        {p.kind === 'sublet' && <span className="badge dorm">🏠 {t('board.kindSublet')}</span>}
        <strong style={{ color: 'var(--ink)' }}>{p.author?.display_name ?? '—'}</strong>
        {badge && <span className="badge">{badge}</span>}
        <span>· {relTime(p.created_at, locale)}{p.edited_at && ` · ${t('board.edited')}`}</span>
        <span style={{ marginLeft: 'auto' }} />
        {mine && !editing && (
          <button className="icon" onClick={() => { setEditing(true); setEditBody(p.body) }} aria-label={t('board.edit')}><EditIcon /></button>
        )}
        {canDelete && <button className="icon" onClick={remove} aria-label={t('common.delete')}><TrashIcon /></button>}
      </div>
      {editing ? (
        <div className="stack">
          <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} maxLength={4000} autoFocus />
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="ghost" onClick={() => setEditing(false)}>{t('common.cancel')}</button>
            <button onClick={saveEdit} disabled={!editBody.trim()}>{t('common.save')}</button>
          </div>
        </div>
      ) : (
        <div className="post">{p.body}</div>
      )}
      {opts.length > 0 && (
        <div className="stack" style={{ gap: 6, marginTop: 10 }}>
          {opts.map((o) => {
            const n = pv.filter((v) => v.option_id === o.id).length
            const pct = pv.length ? Math.round((n / pv.length) * 100) : 0
            const chosen = myVote === o.id
            return (
              <button
                key={o.id} onClick={() => vote(o.id)} className="ghost"
                style={{
                  position: 'relative', overflow: 'hidden', textAlign: 'left', fontWeight: chosen ? 700 : 500,
                  borderColor: chosen ? 'var(--brand)' : 'var(--line)', color: 'var(--ink)'
                }}
              >
                <span style={{
                  position: 'absolute', inset: 0, width: myVote ? `${pct}%` : 0,
                  background: 'color-mix(in srgb, var(--brand) 14%, transparent)', transition: 'width .3s'
                }} />
                <span style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span>{chosen ? '✓ ' : ''}{o.label}</span>
                  {myVote && <span className="muted">{pct}%</span>}
                </span>
              </button>
            )
          })}
          <div className="small muted">{t('board.votes', { n: pv.length })}</div>
        </div>
      )}
    </article>
  )
}
