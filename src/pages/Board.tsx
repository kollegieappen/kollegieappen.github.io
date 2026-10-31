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

function Feed({ tab }: { tab: Exclude<Tab, 'mail'> }) {
  const { t } = useI18n()
  const { membership, hasFriends } = useSession()
  const [posts, setPosts] = useState<Post[] | null>(null)
  const [options, setOptions] = useState<Option[]>([])
  const [votes, setVotes] = useState<Vote[]>([])
  const [filter, setFilter] = useState<'all' | 'sublet'>('all')

  const load = useCallback(async () => {
    let q = supabase
      .from('posts')
      .select('id, body, created_at, edited_at, created_by, hall_id, dorm_id, kind, is_friends, dorm:dorms(name), author:profiles!posts_created_by_fkey(display_name, memberships(hall:halls(name)))')
      .order('created_at', { ascending: false })
      .limit(100)
    if (tab === 'hall') q = q.eq('hall_id', membership!.hall_id)
    else if (tab === 'dorm') q = q.eq('dorm_id', membership!.dorm.id).eq('is_friends', false)
    else q = q.eq('is_friends', true)
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
  }, [tab, membership])

  useEffect(() => { load() }, [load])
  useRealtime(['posts', 'poll_votes'], load)

  if (tab === 'friends' && !hasFriends) return <div className="empty">{t('board.noFriends')}</div>

  const announcements = tab === 'dorm' ? (posts ?? []).filter((p) => p.kind === 'announcement').slice(0, 3) : []
  const rest = (posts ?? [])
    .filter((p) => !announcements.includes(p))
    .filter((p) => filter === 'all' || p.kind === 'sublet')

  return (
    <>
      {tab === 'dorm' && <div className="muted small">{t('board.squareHint', { dorm: membership!.dorm.name })}</div>}
      {tab === 'friends' && <div className="muted small">{t('board.friendsHint')}</div>}

      {announcements.map((p) => (
        <PostCard key={p.id} post={p} options={options} votes={votes} onChange={load} tab={tab} />
      ))}

      <Composer tab={tab} onPosted={load} />

      {tab === 'dorm' && (
        <div className="seg">
          <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>{t('board.filterAll')}</button>
          <button className={filter === 'sublet' ? 'on' : ''} onClick={() => setFilter('sublet')}>{t('board.kindSublet')}</button>
        </div>
      )}

      {posts === null ? (
        <div className="empty">{t('common.loading')}</div>
      ) : rest.length === 0 ? (
        <div className="empty">{t(tab === 'hall' ? 'board.emptyHall' : tab === 'dorm' ? 'board.emptySquare' : 'board.emptyFriends')}</div>
      ) : (
        rest.map((p) => <PostCard key={p.id} post={p} options={options} votes={votes} onChange={load} tab={tab} />)
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
      kind: tab === 'dorm' ? kind : 'post',
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

  const kinds: Kind[] = canAnnounce ? ['post', 'sublet', 'announcement'] : ['post', 'sublet']
  const kindLabel: Record<Kind, string> = { post: 'board.kindPost', sublet: 'board.kindSublet', announcement: 'board.kindAnnouncement' }

  return (
    <form className="card stack" onSubmit={submit}>
      {tab === 'dorm' && (
        <div className="seg">
          {kinds.map((k) => (
            <button type="button" key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)} style={{ fontSize: 13 }}>{t(kindLabel[k])}</button>
          ))}
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
