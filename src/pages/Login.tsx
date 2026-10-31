import { useState, type FormEvent } from 'react'
import { supabase, errorKey, APP_URL } from '../lib/supabase'
import { useI18n } from '../lib/i18n'
import { useSession } from '../lib/session'

export default function Login() {
  const { t, lang, setLang } = useI18n()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  // Gem en invitationskode fra et delt link, så den kan bruges efter login.
  const joinMatch = window.location.hash.match(/#\/join\/([A-Za-z0-9]+)/)
  if (joinMatch) try { localStorage.setItem('ka.joinCode', joinMatch[1]) } catch { /* ignore */ }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError(''); setInfo('')
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(t(errorKey(error)))
    } else {
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: { emailRedirectTo: APP_URL, data: { display_name: name.trim(), language: lang } }
      })
      if (error) setError(t(errorKey(error)))
      else if (!data.session) { setInfo(t('auth.checkMail')); setMode('login') }
    }
    setBusy(false)
  }

  async function forgot() {
    if (!email) return setError(t('auth.email') + '?')
    setBusy(true); setError('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: APP_URL })
    setBusy(false)
    if (error) setError(t(errorKey(error)))
    else setInfo(t('auth.resetSent'))
  }

  return (
    <div className="center-screen">
      <form className="auth stack" onSubmit={submit}>
        <div>
          <img src="/icon.svg" alt="" className="logo" />
          <h1>{t('app.name')}</h1>
          <p className="muted" style={{ margin: 0 }}>{t('auth.tagline')}</p>
        </div>
        {info && <div className="notice">{info}</div>}
        {mode === 'signup' && (
          <div>
            <label htmlFor="name">{t('auth.name')}</label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} autoComplete="name" />
          </div>
        )}
        <div>
          <label htmlFor="email">{t('auth.email')}</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </div>
        <div>
          <label htmlFor="pw">{t('auth.password')}</label>
          <input
            id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
        </div>
        {error && <div className="error">{error}</div>}
        <button type="submit" disabled={busy}>{t(mode === 'login' ? 'auth.login' : 'auth.signup')}</button>
        <div className="row small" style={{ justifyContent: 'space-between' }}>
          <span className="muted">
            {t(mode === 'login' ? 'auth.noAccount' : 'auth.haveAccount')}{' '}
            <button type="button" className="link" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError('') }}>
              {t(mode === 'login' ? 'auth.signup' : 'auth.login')}
            </button>
          </span>
          {mode === 'login' && <button type="button" className="link" onClick={forgot}>{t('auth.forgot')}</button>}
        </div>
        <div className="row small" style={{ justifyContent: 'center' }}>
          <button type="button" className="link" onClick={() => setLang(lang === 'da' ? 'en' : 'da')}>
            {lang === 'da' ? 'English' : 'Dansk'}
          </button>
        </div>
      </form>
    </div>
  )
}

export function NewPassword() {
  const { t } = useI18n()
  const { setRecovering } = useSession()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) return setError(t(errorKey(error)))
    alert(t('auth.passwordUpdated'))
    setRecovering(false)
  }

  return (
    <div className="center-screen">
      <form className="auth stack" onSubmit={submit}>
        <h1>{t('auth.newPassword')}</h1>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete="new-password" />
        {error && <div className="error">{error}</div>}
        <button type="submit" disabled={busy}>{t('common.save')}</button>
      </form>
    </div>
  )
}
