import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase, errorKey } from '../lib/supabase'
import { useI18n } from '../lib/i18n'
import { TopBar, TrashIcon, relTime } from '../ui'

type Mine = { id: string; title: string; description: string; status: string; admin_note: string; created_at: string }

/** Foreslå en funktion – og se svar på sine egne forslag. */
export default function FeatureRequests() {
  const { t, locale } = useI18n()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [mine, setMine] = useState<Mine[] | null>(null)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.from('feature_requests')
      .select('id, title, description, status, admin_note, created_at').order('created_at', { ascending: false })
    setMine((data as Mine[]) ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const { error } = await supabase.from('feature_requests').insert({ title: title.trim(), description: description.trim() })
    if (error) return setError(t(errorKey(error)))
    setTitle(''); setDescription(''); setSent(true); setTimeout(() => setSent(false), 4000)
    load()
  }

  async function remove(id: string) {
    if (!confirm(t('common.confirm'))) return
    await supabase.from('feature_requests').delete().eq('id', id)
    load()
  }

  return (
    <>
      <TopBar title={t('fr.title')} />
      <main className="stack">
        <p className="muted small" style={{ margin: 0 }}>{t('fr.intro')}</p>
        <form className="card stack" onSubmit={submit}>
          <div>
            <label htmlFor="frt">{t('fr.what')}</label>
            <input id="frt" value={title} onChange={(e) => setTitle(e.target.value)} minLength={3} maxLength={120} required placeholder={t('fr.whatPh')} />
          </div>
          <div>
            <label htmlFor="frd">{t('fr.why')}</label>
            <textarea id="frd" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} placeholder={t('fr.whyPh')} />
          </div>
          {error && <div className="error">{error}</div>}
          {sent && <div className="notice">{t('fr.thanks')}</div>}
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button type="submit" disabled={title.trim().length < 3}>{t('fr.send')}</button>
          </div>
        </form>

        {mine && mine.length > 0 && (
          <>
            <div className="section-title">{t('fr.mine')}</div>
            {mine.map((r) => (
              <div className="card stack" key={r.id} style={{ gap: 6 }}>
                <div className="row" style={{ alignItems: 'flex-start' }}>
                  <div className="grow">
                    <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                      <strong>{r.title}</strong>
                      <span className={'badge' + (r.status === 'done' ? ' dorm' : '')}>{t('fr.status.' + r.status)}</span>
                    </div>
                    <div className="small muted">{relTime(r.created_at, locale)}</div>
                  </div>
                  {r.status === 'new' && (
                    <button className="icon" aria-label={t('common.delete')} onClick={() => remove(r.id)}><TrashIcon /></button>
                  )}
                </div>
                {r.description && <div className="post small">{r.description}</div>}
                {r.admin_note && <div className="notice small">💬 {r.admin_note}</div>}
              </div>
            ))}
          </>
        )}
      </main>
    </>
  )
}
