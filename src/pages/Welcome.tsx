import { useEffect, useState } from 'react'
import { useI18n } from '../lib/i18n'
import { useSession } from '../lib/session'
import { enablePush, pushState, type PushState } from '../lib/push'

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true

const key = (uid: string) => 'ka.welcomed.' + uid

export function hasSeenWelcome(uid: string) {
  try { return localStorage.getItem(key(uid)) === '1' } catch { return true }
}

export function resetWelcome(uid: string) {
  try { localStorage.removeItem(key(uid)) } catch { /* ignore */ }
}

/** Rolig velkomstskærm efter tilmelding: installér appen, slå notifikationer til, udfyld "Om mig". */
export default function Welcome({ onDone }: { onDone: () => void }) {
  const { t } = useI18n()
  const { membership, session } = useSession()
  const [push, setPush] = useState<PushState | null>(null)
  const installed = isStandalone()
  const ios = isIos()

  useEffect(() => { pushState().then(setPush).catch(() => setPush('unsupported')) }, [])

  function done(target = '#/') {
    try { localStorage.setItem(key(session!.user.id), '1') } catch { /* ignore */ }
    window.location.hash = target
    onDone()
  }

  const step = (n: number, title: string, children: React.ReactNode, ok = false) => (
    <div className="card stack" style={{ gap: 8 }}>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <span className="welcome-num" aria-hidden="true">{ok ? '✓' : n}</span>
        <strong className="grow" style={{ fontSize: 17, paddingTop: 3 }}>{title}</strong>
      </div>
      <div className="small" style={{ color: 'var(--ink-2)', paddingLeft: 40 }}>{children}</div>
    </div>
  )

  return (
    <div className="app">
      <main className="plain stack" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 32px)' }}>
        <div>
          <img src="/icon.svg" alt="" className="logo" />
          <h1 style={{ margin: '0 0 4px', fontSize: 28, letterSpacing: '-0.02em' }}>
            {t('welcome.title', { hall: membership?.hall.name ?? '' })}
          </h1>
          <p className="muted" style={{ margin: 0 }}>{t('welcome.intro', { dorm: membership?.dorm.name ?? '' })}</p>
        </div>

        {step(1, t('welcome.installTitle'), installed ? t('welcome.installDone') : (
          <div className="stack" style={{ gap: 6 }}>
            <span>{ios ? t('me.installIos') : t('me.installAndroid')}</span>
            {ios && <span>{t('welcome.installIosLogin')}</span>}
          </div>
        ), installed)}

        {step(2, t('welcome.pushTitle'), (
          <div className="stack" style={{ gap: 8 }}>
            <span>{t('welcome.pushBody')}</span>
            {push === 'on' ? (
              <span style={{ color: 'var(--ok)', fontWeight: 600 }}>{t('me.pushOn')}</span>
            ) : push === 'off' ? (
              <button className="ghost" style={{ alignSelf: 'flex-start' }} onClick={async () => setPush(await enablePush().catch(() => 'off' as PushState))}>
                {t('me.pushEnable')}
              </button>
            ) : push === 'install-first' ? (
              <span>{t('me.pushInstall')}</span>
            ) : push === 'denied' ? (
              <span>{t('me.pushDenied')}</span>
            ) : null}
            <span>{t('welcome.pushWhere')}</span>
          </div>
        ), push === 'on')}

        {step(3, t('welcome.aboutTitle'), (
          <div className="stack" style={{ gap: 8 }}>
            <span>{t('welcome.aboutBody')}</span>
            <button className="link" style={{ alignSelf: 'flex-start', padding: 0 }} onClick={() => done('#/mig')}>{t('welcome.aboutGo')} →</button>
          </div>
        ))}

        <button onClick={() => done()} style={{ marginTop: 8 }}>{t('welcome.start')}</button>
      </main>
    </div>
  )
}
