import { useState, type FormEvent } from 'react'
import { supabase, errorKey } from '../lib/supabase'
import { useI18n, type Lang } from '../lib/i18n'
import { useSession } from '../lib/session'
import { TopBar } from '../ui'

export default function Me() {
  const { t, lang, setLang } = useI18n()
  const { profile, membership, session, refresh } = useSession()
  const [name, setName] = useState(profile?.display_name ?? '')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  async function saveName(e: FormEvent) {
    e.preventDefault()
    const { error } = await supabase.from('profiles').update({ display_name: name.trim() }).eq('id', session!.user.id)
    if (error) return setError(t(errorKey(error)))
    setSaved(true); setTimeout(() => setSaved(false), 1500)
    refresh()
  }

  async function changeLang(l: Lang) {
    setLang(l)
    await supabase.from('profiles').update({ language: l }).eq('id', session!.user.id)
  }

  async function leave() {
    if (!confirm(t('me.leaveConfirm', { hall: membership?.hall.name ?? '' }))) return
    const { error } = await supabase.rpc('leave_hall')
    if (error) return setError(t(errorKey(error)))
    window.location.hash = '#/'
    refresh()
  }

  async function deleteAccount() {
    if (!confirm(t('me.deleteConfirm'))) return
    const { error } = await supabase.rpc('delete_my_account')
    if (error) return setError(t(errorKey(error)))
    await supabase.auth.signOut()
  }

  return (
    <>
      <TopBar title={t('me.title')} />
      <main className="stack">
        <form className="card stack" onSubmit={saveName}>
          <div>
            <label htmlFor="nm">{t('me.name')}</label>
            <input id="nm" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} />
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="muted small">{session?.user.email}</span>
            <button type="submit" disabled={!name.trim() || name.trim() === profile?.display_name}>
              {saved ? t('me.saved') : t('common.save')}
            </button>
          </div>
        </form>

        <div className="card stack">
          <label>{t('me.language')}</label>
          <div className="seg">
            <button className={lang === 'da' ? 'on' : ''} onClick={() => changeLang('da')}>Dansk</button>
            <button className={lang === 'en' ? 'on' : ''} onClick={() => changeLang('en')}>English</button>
          </div>
        </div>

        <div className="card stack">
          <strong>{t('me.install')}</strong>
          <div className="small muted">{t('me.installIos')}</div>
          <div className="small muted">{t('me.installAndroid')}</div>
        </div>

        {error && <div className="error">{error}</div>}

        <button className="ghost" onClick={() => supabase.auth.signOut()}>{t('me.logout')}</button>
        <button className="danger" onClick={leave}>{t('me.leave')}</button>
        <button className="link small muted" style={{ color: 'var(--danger)' }} onClick={deleteAccount}>{t('me.delete')}</button>
      </main>
    </>
  )
}
