import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase, errorKey } from '../lib/supabase'
import { useI18n } from '../lib/i18n'
import { useSession } from '../lib/session'
import { TrashIcon, relTime, useRealtime } from '../ui'
import { Tip } from './Help'

type Item = {
  id: string; title: string; description: string | null; owner_id: string | null; created_by: string | null
  created_at: string; owner: { display_name: string } | null
}

export default function SharedItems() {
  const { t, locale } = useI18n()
  const { membership, session } = useSession()
  const hallId = membership!.hall_id
  const me = session!.user.id
  const [items, setItems] = useState<Item[] | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [mine, setMine] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('shared_items')
      .select('id, title, description, owner_id, created_by, created_at, owner:profiles!shared_items_owner_id_fkey(display_name)')
      .eq('hall_id', hallId)
      .order('created_at', { ascending: false })
    setItems((data as unknown as Item[]) ?? [])
  }, [hallId])

  useEffect(() => { load() }, [load])
  useRealtime(['shared_items'], load)

  async function add(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    const { error } = await supabase.from('shared_items').insert({
      hall_id: hallId, title: title.trim(), description: description.trim() || null, owner_id: mine ? me : null
    })
    setBusy(false)
    if (error) return setError(t(errorKey(error)))
    setTitle(''); setDescription('')
    load()
  }

  async function remove(item: Item) {
    if (!confirm(t('common.confirm'))) return
    await supabase.from('shared_items').delete().eq('id', item.id)
    load()
  }

  return (
    <div className="stack">
      <form className="card stack" onSubmit={add}>
        <strong>{t('shared.new')}</strong>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('shared.title')} maxLength={120} required />
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('shared.desc')} maxLength={1000} />
        <div className="row">
          <span className="small muted" style={{ whiteSpace: 'nowrap' }}>{t('shared.owner')}</span>
          <Tip k="sharedOwner" />
          <div className="seg grow">
            <button type="button" className={!mine ? 'on' : ''} onClick={() => setMine(false)}>{t('shared.common')}</button>
            <button type="button" className={mine ? 'on' : ''} onClick={() => setMine(true)}>{t('shared.mine')}</button>
          </div>
        </div>
        {error && <div className="error">{error}</div>}
        <button type="submit" disabled={busy || !title.trim()}>{t('common.add')}</button>
      </form>

      {items === null ? (
        <div className="empty">{t('common.loading')}</div>
      ) : items.length === 0 ? (
        <div className="empty">{t('shared.empty')}</div>
      ) : (
        <div className="list">
          {items.map((i) => (
            <div className="item" key={i.id} style={{ alignItems: 'flex-start' }}>
              <div className="grow">
                <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <strong>{i.title}</strong>
                  <span className={'badge' + (i.owner_id ? '' : ' dorm')}>
                    {i.owner_id ? t('shared.ownedBy', { name: i.owner_id === me ? t('common.you') : i.owner?.display_name ?? '—' }) : t('shared.common')}
                  </span>
                </div>
                {i.description && <div className="small post" style={{ marginTop: 4 }}>{i.description}</div>}
                <div className="small muted" style={{ marginTop: 2 }}>{relTime(i.created_at, locale)}</div>
              </div>
              {(i.created_by === me || membership!.is_moderator) && (
                <button className="icon" onClick={() => remove(i)} aria-label={t('common.delete')}><TrashIcon /></button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
