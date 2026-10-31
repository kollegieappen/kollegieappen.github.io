import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase, errorKey, type Scope } from '../lib/supabase'
import { useI18n } from '../lib/i18n'
import { useSession } from '../lib/session'
import { TopBar, TrashIcon, relTime, useRealtime } from '../ui'

type Post = {
  id: string; body: string; created_at: string; created_by: string | null
  hall_id: string | null; author: { display_name: string } | null
}

export default function Board() {
  const { t, locale } = useI18n()
  const { membership, session } = useSession()
  const [scope, setScope] = useState<Scope>('hall')
  const [posts, setPosts] = useState<Post[] | null>(null)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    let q = supabase
      .from('posts')
      .select('id, body, created_at, created_by, hall_id, author:profiles(display_name)')
      .order('created_at', { ascending: false })
      .limit(100)
    q = scope === 'hall' ? q.eq('hall_id', membership!.hall_id) : q.eq('dorm_id', membership!.dorm.id)
    const { data } = await q
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
                  <span>· {relTime(p.created_at, locale)}</span>
                  {canDelete && (
                    <button className="icon" style={{ marginLeft: 'auto' }} onClick={() => remove(p)} aria-label={t('common.delete')}>
                      <TrashIcon />
                    </button>
                  )}
                </div>
                <div className="post">{p.body}</div>
              </article>
            )
          })
        )}
      </main>
    </>
  )
}
