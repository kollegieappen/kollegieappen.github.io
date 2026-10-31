import { useEffect, useState, type FormEvent } from 'react'
import { supabase, errorKey } from '../lib/supabase'
import { useI18n, type Lang } from '../lib/i18n'
import { useSession } from '../lib/session'
import { TopBar } from '../ui'
import { disablePush, enablePush, pushState, signOut, type PushState } from '../lib/push'
import { AboutMe } from './Profile'

export default function Me() {
  const { t, lang, setLang } = useI18n()
  const { profile, membership, session, refresh } = useSession()
  const [name, setName] = useState(profile?.display_name ?? '')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [phone, setPhone] = useState('')
  const [savedPhone, setSavedPhone] = useState('')
  const [push, setPush] = useState<PushState | null>(null)

  useEffect(() => {
    supabase.from('phone_numbers').select('phone').eq('user_id', session!.user.id).maybeSingle()
      .then(({ data }) => { setPhone(data?.phone ?? ''); setSavedPhone(data?.phone ?? '') })
    pushState().then(setPush).catch(() => setPush('unsupported'))
  }, [session])

  async function savePhone(e: FormEvent) {
    e.preventDefault()
    setError('')
    const value = phone.trim()
    const { error } = value
      ? await supabase.from('phone_numbers').upsert({ user_id: session!.user.id, phone: value })
      : await supabase.from('phone_numbers').delete().eq('user_id', session!.user.id)
    if (error) return setError(t(errorKey(error)))
    setSavedPhone(value)
  }

  async function togglePush() {
    setError('')
    try {
      if (push === 'on') { await disablePush(); setPush('off') }
      else setPush(await enablePush())
    } catch (e) { setError(t(errorKey(e))) }
  }

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
    await signOut()
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

        <form className="card stack" onSubmit={savePhone}>
          <div>
            <label htmlFor="ph">{t('me.phone')}</label>
            <input id="ph" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} autoComplete="tel" />
            <div className="muted small" style={{ marginTop: 4 }}>{t('me.phoneHint')}</div>
          </div>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button type="submit" disabled={phone.trim() === savedPhone}>{t('common.save')}</button>
          </div>
        </form>

        {membership && <AboutMe />}

        <div className="card stack">
          <strong>{t('me.notifications')}</strong>
          <div className="small muted">
            {push === 'on' ? t('me.pushOn') : push === 'denied' ? t('me.pushDenied') : push === 'unsupported'
              ? t('me.pushUnsupported') : push === 'install-first' ? t('me.pushInstall') : t('me.pushOff')}
          </div>
          {(push === 'on' || push === 'off') && (
            <button className={push === 'on' ? 'ghost' : ''} onClick={togglePush}>
              {push === 'on' ? t('me.pushDisable') : t('me.pushEnable')}
            </button>
          )}
        </div>

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
          {membership && <button className="link small" style={{ alignSelf: 'flex-start', padding: 0 }} onClick={() => { window.location.hash = '#/velkommen' }}>{t('welcome.again')}</button>}
        </div>

        {error && <div className="error">{error}</div>}

        <button className="ghost" onClick={() => signOut()}>{t('me.logout')}</button>
        {membership && <button className="danger" onClick={leave}>{t('me.leave')}</button>}
        <button className="link small muted" style={{ color: 'var(--danger)' }} onClick={deleteAccount}>{t('me.delete')}</button>
      </main>
    </>
  )
}
