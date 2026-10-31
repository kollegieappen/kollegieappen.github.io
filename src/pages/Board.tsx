import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase, errorKey, type Scope } from '../lib/supabase'
import { useI18n } from '../lib/i18n'
import { useSession } from '../lib/session'
import { EditIcon, TopBar, TrashIcon, relTime, useRealtime } from '../ui'

type HallRef = { hall: { name: string } | null }
type Post = {
  id: string; body: string; created_at: string; edited_at?: string | null; created_by: string | null
  hall_id: string | null
  author: { display_name: string; memberships?: HallRef | HallRef[] | null } | null
}

// Afsenderens nuværende gang (PostgREST kan returnere objekt eller liste).
const authorHall = (p: Post) => {
  const m = p.author?.memberships
  return (Array.isArray(m) ? m[0] : m)?.hall?.name ?? null
}

export default function Board() {
  const { t, locale } = useI18n()
  const { membership, session } = useSession()
  const [scope, setScope] = useState<Scope>('hall')
  const [posts, setPosts] = useState<Post[] | null>(null)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editBody, setEditBody] = useState('')

  const load = useCallback(async () => {
    const query = (cols: string) => {
      const q = supabase.from('posts').select(cols).order('created_at', { ascending: false }).limit(100)
      return scope === 'hall' ? q.eq('hall_id', membership!.hall_id) : q.eq('dorm_id', membership!.dorm.id)
    }
    let { data, error } = await query(
      'id, body, created_at, edited_at, created_by, hall_id, author:profiles(display_name, memberships(hall:halls(name)))'
    )
    // Fallback, hvis 0003-opsætningen endnu ikke er kørt i databasen.
    if (error) ({ data } = await query('id, body, created_at, created_by, hall_id, author:profiles(display_name)'))
    setPosts((data as unknown as Post[]) ?? [])
  }, [scope, membership])

  useEffect(() => { setPosts(null); load() }, [load])
  useRealtime(['posts'], load)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setBusy(true); setError('')
    const { error } = await supabase.from('posts').insert({
      body: body.trim(),
      hall_id: scope === 'hall' ? membership!.hall_id : null,
      dorm_id: scope === 'dorm' ? membership!.dorm.id : null
    })
    setBusy(false)
    if (error) return setError(t(errorKey(error)))
    setBody('')
    load()
  }

  async function saveEdit(p: Post) {
    if (!editBody.trim()) return
    const { error } = await supabase.from('posts').update({ body: editBody.trim() }).eq('id', p.id)
    if (error) return setError(t(errorKey(error)))
    setEditId(null)
    load()
  }

  async function remove(p: Post) {
    if (!confirm(t('common.confirm'))) return
    await supabase.from('posts').delete().eq('id', p.id)
    load()
  }

  return (
    <>
      <TopBar title={t('board.title')} />
      <main className="stack">
        <div className="seg">
          <button className={scope === 'hall' ? 'on' : ''} onClick={() => setScope('hall')}>{t('board.hall')}</button>
          <button className={scope === 'dorm' ? 'on' : ''} onClick={() => setScope('dorm')}>{t('board.square')}</button>
        </div>
        {scope === 'dorm' && <div className="muted small">{t('board.squareHint', { dorm: membership!.dorm.name })}</div>}

        <form className="card stack" onSubmit={submit}>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={t('board.placeholder')} maxLength={4000} />
          {error && <div className="error">{error}</div>}
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button type="submit" disabled={busy || !body.trim()}>{t('board.post')}</button>
          </div>
        </form>

        {posts === null ? (
          <div className="empty">{t('common.loading')}</div>
        ) : posts.length === 0 ? (
          <div className="empty">{t(scope === 'hall' ? 'board.emptyHall' : 'board.emptySquare')}</div>
        ) : (
          posts.map((p) => {
            const mine = p.created_by === session?.user.id
            const canDelete = mine || (p.hall_id && membership?.is_moderator)
            return (
              <article className="card" key={p.id}>
                <div className="post-meta">
                  <strong style={{ color: 'var(--ink)' }}>{p.author?.display_name ?? '—'}</strong>
                  {authorHall(p) && <span className="badge">{authorHall(p)}</span>}
                  <span>· {relTime(p.created_at, locale)}{p.edited_at && ` · ${t('board.edited')}`}</span>
                  <span style={{ marginLeft: 'auto' }} />
                  {mine && editId !== p.id && (
                    <button className="icon" onClick={() => { setEditId(p.id); setEditBody(p.body) }} aria-label={t('board.edit')}>
                      <EditIcon />
                    </button>
                  )}
                  {canDelete && (
                    <button className="icon" onClick={() => remove(p)} aria-label={t('common.delete')}>
                      <TrashIcon />
                    </button>
                  )}
                </div>
                {editId === p.id ? (
                  <div className="stack">
                    <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} maxLength={4000} autoFocus />
                    <div className="row" style={{ justifyContent: 'flex-end' }}>
                      <button className="ghost" onClick={() => setEditId(null)}>{t('common.cancel')}</button>
                      <button onClick={() => saveEdit(p)} disabled={!editBody.trim()}>{t('common.save')}</button>
                    </div>
                  </div>
                ) : (
                  <div className="post">{p.body}</div>
                )}
              </article>
            )
          })
        )}
      </main>
    </>
  )
}
