import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useI18n } from '../lib/i18n'
import { useSession } from '../lib/session'
import { TopBar, useRealtime } from '../ui'

type Item = { id: string; text: string; done: boolean; created_at: string }

export default function Shopping() {
  const { t } = useI18n()
  const { membership } = useSession()
  const hallId = membership!.hall_id
  const [items, setItems] = useState<Item[] | null>(null)
  const [text, setText] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('shopping_items').select('id, text, done, created_at')
      .eq('hall_id', hallId).order('created_at')
    setItems((data as Item[]) ?? [])
  }, [hallId])

  useEffect(() => { load() }, [load])
  useRealtime(['shopping_items'], load)

  async function add(e: FormEvent) {
    e.preventDefault()
    const value = text.trim()
    if (!value) return
    setText('')
    const temp: Item = { id: 'tmp-' + Date.now(), text: value, done: false, created_at: new Date().toISOString() }
    setItems((prev) => [...(prev ?? []), temp])
    await supabase.from('shopping_items').insert({ hall_id: hallId, text: value })
    load()
  }

  async function toggle(item: Item) {
    setItems((prev) => prev?.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)) ?? null)
    await supabase.from('shopping_items').update({ done: !item.done }).eq('id', item.id)
  }

  async function clearDone() {
    const ids = items?.filter((i) => i.done).map((i) => i.id) ?? []
    setItems((prev) => prev?.filter((i) => !i.done) ?? null)
    if (ids.length) await supabase.from('shopping_items').delete().in('id', ids)
  }

  const open = items?.filter((i) => !i.done) ?? []
  const done = items?.filter((i) => i.done) ?? []

  return (
    <>
      <TopBar title={t('shop.title')} />
      <main className="stack">
        <form className="row" onSubmit={add}>
          <input className="grow" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('shop.placeholder')} maxLength={200} enterKeyHint="done" />
          <button type="submit" disabled={!text.trim()}>{t('common.add')}</button>
        </form>

        {items === null ? (
          <div className="empty">{t('common.loading')}</div>
        ) : open.length === 0 && done.length === 0 ? (
          <div className="empty">{t('shop.empty')}</div>
        ) : (
          <>
            {open.length > 0 && (
              <div className="list">
                {open.map((i) => <Row key={i.id} item={i} onToggle={toggle} />)}
              </div>
            )}
            {done.length > 0 && (
              <>
                <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
                  <span className="section-title" style={{ margin: '0 4px' }}>{t('shop.bought')}</span>
                  <button className="link small" onClick={clearDone}>{t('shop.clearDone', { n: done.length })}</button>
                </div>
                <div className="list">
                  {done.map((i) => <Row key={i.id} item={i} onToggle={toggle} />)}
                </div>
              </>
            )}
          </>
        )}
      </main>
    </>
  )
}

function Row({ item, onToggle }: { item: Item; onToggle: (i: Item) => void }) {
  return (
    <div className="item" onClick={() => onToggle(item)} style={{ cursor: 'pointer' }}>
      <button className={'check' + (item.done ? ' on' : '')} aria-label={item.text} aria-pressed={item.done}>
        {item.done && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
        )}
      </button>
      <span className={'grow' + (item.done ? ' done-text' : '')}>{item.text}</span>
    </div>
  )
}
