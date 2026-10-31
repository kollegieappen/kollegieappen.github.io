import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase, errorKey } from '../lib/supabase'
import { useI18n } from '../lib/i18n'
import { useSession } from '../lib/session'
import { EditIcon, TrashIcon } from '../ui'
import { Tip } from './Help'

type Item = { id: string; hall_id: string | null; dorm_id: string | null; question: string; answer: string; updated_by: string | null }

export default function Info() {
  const { t } = useI18n()
  const { membership, isBoard, adminDorms, session } = useSession()
  const canDorm = isBoard || adminDorms.some((d) => d.id === membership!.dorm.id)
  const [items, setItems] = useState<Item[] | null>(null)
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState<'hall' | 'dorm' | null>(null)
  const [editing, setEditing] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('info_items').select('id, hall_id, dorm_id, question, answer, updated_by')
      .or(`hall_id.eq.${membership!.hall_id},dorm_id.eq.${membership!.dorm.id}`)
      .order('question')
    setItems((data as Item[]) ?? [])
  }, [membership])

  useEffect(() => { load() }, [load])

  async function remove(item: Item) {
    if (!confirm(t('common.confirm'))) return
    await supabase.from('info_items').delete().eq('id', item.id)
    load()
  }

  const q = search.trim().toLowerCase()
  const match = (i: Item) => !q || i.question.toLowerCase().includes(q) || i.answer.toLowerCase().includes(q)
  const section = (scope: 'hall' | 'dorm') => {
    const list = (items ?? []).filter((i) => (scope === 'hall' ? i.hall_id : i.dorm_id) && match(i))
    const canEdit = (i: Item) => (scope === 'hall' ? true : canDorm)
    const canDelete = (i: Item) => (scope === 'hall' ? i.updated_by === session!.user.id || membership!.is_moderator : canDorm)
    return (
      <>
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
          <span className="section-title" style={{ margin: '0 4px' }}>{t(scope === 'hall' ? 'info.hall' : 'info.dorm')} <Tip k="infoScope" /></span>
          {(scope === 'hall' || canDorm) && adding !== scope && (
            <button className="link small" onClick={() => setAdding(scope)}>+ {t('info.add')}</button>
          )}
        </div>
        {adding === scope && <InfoForm scope={scope} onDone={() => { setAdding(null); load() }} />}
        {list.length === 0 && adding !== scope ? (
          <div className="muted small" style={{ padding: '0 4px' }}>
            {t('info.empty')}{scope === 'dorm' && !canDorm && <> {t('info.dormOnlyBoard')}</>}
          </div>
        ) : (
          list.map((i) =>
            editing === i.id ? (
              <InfoForm key={i.id} scope={scope} item={i} onDone={() => { setEditing(null); load() }} />
            ) : (
              <div className="card" key={i.id}>
                <div className="row" style={{ alignItems: 'flex-start' }}>
                  <strong className="grow">{i.question}</strong>
                  {canEdit(i) && <button className="icon" onClick={() => setEditing(i.id)} aria-label={t('cal.edit')}><EditIcon /></button>}
                  {canDelete(i) && <button className="icon" onClick={() => remove(i)} aria-label={t('common.delete')}><TrashIcon /></button>}
                </div>
                {i.answer && <div className="post" style={{ marginTop: 4 }}>{i.answer}</div>}
              </div>
            )
          )
        )}
      </>
    )
  }

  return (
    <div className="stack">
      <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('info.search')} />
      {items === null ? <div className="empty">{t('common.loading')}</div> : <>{section('hall')}{section('dorm')}</>}
    </div>
  )
}

function InfoForm({ scope, item, onDone }: { scope: 'hall' | 'dorm'; item?: Item; onDone: () => void }) {
  const { t } = useI18n()
  const { membership } = useSession()
  const [question, setQuestion] = useState(item?.question ?? '')
  const [answer, setAnswer] = useState(item?.answer ?? '')
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    const fields = { question: question.trim(), answer: answer.trim() }
    const { error } = item
      ? await supabase.from('info_items').update(fields).eq('id', item.id)
      : await supabase.from('info_items').insert({
          ...fields,
          hall_id: scope === 'hall' ? membership!.hall_id : null,
          dorm_id: scope === 'dorm' ? membership!.dorm.id : null
        })
    if (error) return setError(t(errorKey(error)))
    onDone()
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={t('info.question')} maxLength={200} required autoFocus />
      <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder={t('info.answer')} maxLength={2000} />
      {error && <div className="error">{error}</div>}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="ghost" onClick={onDone}>{t('common.cancel')}</button>
        <button type="submit" disabled={!question.trim()}>{t('common.save')}</button>
      </div>
    </form>
  )
}
