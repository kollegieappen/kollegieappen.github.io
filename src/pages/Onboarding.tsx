import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase, errorKey } from '../lib/supabase'
import { useI18n } from '../lib/i18n'
import { useSession } from '../lib/session'

function storedCode() {
  try {
    const c = localStorage.getItem('ka.joinCode') ?? ''
    localStorage.removeItem('ka.joinCode')
    return c
  } catch { return '' }
}

export default function Onboarding() {
  const { t } = useI18n()
  const { refresh, isSuperadmin, session } = useSession()
  const params = useParams()
  const metaCode = (session?.user.user_metadata?.join_code as string | undefined) ?? ''
  const [code, setCode] = useState(() => (params.code ?? (storedCode() || metaCode)).toUpperCase())
  const [autoJoining, setAutoJoining] = useState(false)
  const tried = useRef(false)

  // Kom man via et invitationslink, bruges koden automatisk – ingen ekstra klik.
  useEffect(() => {
    if (tried.current || code.length !== 6) return
    tried.current = true
    setAutoJoining(true)
    supabase.rpc('join_with_code', { p_code: code }).then(async ({ error }) => {
      if (metaCode) await supabase.auth.updateUser({ data: { join_code: null } })
      if (error) { setAutoJoining(false); setError(t(errorKey(error))); return }
      window.location.hash = '#/'
      await refresh()
    })
  }, [code, metaCode, refresh, t])
  const [showRequest, setShowRequest] = useState(false)
  const [dormName, setDormName] = useState('')
  const [address, setAddress] = useState('')
  const [hallsText, setHallsText] = useState('')
  const [myHall, setMyHall] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const halls = Array.from(new Set(hallsText.split('\n').map((h) => h.trim()).filter(Boolean)))

  async function join(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    const { error } = await supabase.rpc('join_with_code', { p_code: code })
    setBusy(false)
    if (error) return setError(t(errorKey(error)))
    window.location.hash = '#/'
    await refresh()
  }

  async function request(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    const { error } = await supabase.rpc('request_dorm', {
      p_name: dormName, p_address: address, p_halls: halls, p_my_hall: myHall || halls[0]
    })
    setBusy(false)
    if (error) return setError(t(errorKey(error)))
    await refresh()
  }

  if (autoJoining) return <div className="center-screen muted">{t('onb.joining')}</div>

  return (
    <div className="app">
      <header className="topbar"><h1>{t('onb.title')}</h1></header>
      <main className="plain stack">
        <p className="muted" style={{ margin: 0 }}>{t('onb.intro')}</p>

        <form className="card stack" onSubmit={join}>
          <div>
            <label htmlFor="code">{t('onb.code')}</label>
            <input
              id="code" className="code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
              required minLength={6} maxLength={6} autoCapitalize="characters" autoComplete="off" placeholder="ABC123"
            />
          </div>
          <button type="submit" disabled={busy || code.length !== 6}>{t('onb.join')}</button>
        </form>

        {error && <div className="error">{error}</div>}

        <div className="muted small" style={{ textAlign: 'center' }}>{t('onb.or')}</div>

        {!showRequest ? (
          <button className="ghost block" onClick={() => setShowRequest(true)}>{t('onb.request')}</button>
        ) : (
          <form className="card stack" onSubmit={request}>
            <strong>{t('onb.request')}</strong>
            <div>
              <label htmlFor="dn">{t('onb.dormName')}</label>
              <input id="dn" value={dormName} onChange={(e) => setDormName(e.target.value)} required minLength={2} maxLength={80} />
            </div>
            <div>
              <label htmlFor="ad">{t('onb.address')}</label>
              <input id="ad" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={160} />
            </div>
            <div>
              <label htmlFor="hs">{t('onb.halls')}</label>
              <textarea id="hs" value={hallsText} onChange={(e) => setHallsText(e.target.value)} required />
              <div className="muted small" style={{ marginTop: 4 }}>{t('onb.hallsHint')}</div>
            </div>
            {halls.length > 0 && (
              <div>
                <label htmlFor="mh">{t('onb.myHall')}</label>
                <select id="mh" value={myHall || halls[0]} onChange={(e) => setMyHall(e.target.value)}>
                  {halls.map((h) => <option key={h}>{h}</option>)}
                </select>
              </div>
            )}
            <div className="notice">{t('onb.requestNote')}</div>
            <button type="submit" disabled={busy || halls.length === 0}>{t('onb.send')}</button>
          </form>
        )}

        {isSuperadmin && <Link to="/admin" className="small" style={{ textAlign: 'center' }}>{t('nav.admin')}</Link>}
        <button className="link small" onClick={() => supabase.auth.signOut()}>{t('me.logout')}</button>
      </main>
    </div>
  )
}

export function Pending() {
  const { t } = useI18n()
  const { membership, refresh, isSuperadmin } = useSession()
  const [busy, setBusy] = useState(false)

  async function cancel() {
    if (!confirm(t('common.confirm'))) return
    setBusy(true)
    await supabase.rpc('leave_hall')
    await refresh()
    setBusy(false)
  }

  return (
    <div className="center-screen">
      <div className="auth stack">
        <img src="/icon.svg" alt="" className="logo" />
        <h1>{t('pending.title')}</h1>
        <p className="muted" style={{ margin: 0 }}>{t('pending.body', { dorm: membership?.dorm.name ?? '' })}</p>
        <button onClick={() => refresh()}>{t('pending.refresh')}</button>
        {isSuperadmin && <Link to="/admin" className="small">{t('nav.admin')}</Link>}
        <button className="danger" onClick={cancel} disabled={busy}>{t('pending.cancel')}</button>
        <button className="link small" onClick={() => supabase.auth.signOut()}>{t('me.logout')}</button>
      </div>
    </div>
  )
}
