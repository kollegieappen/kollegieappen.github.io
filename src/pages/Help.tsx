import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../lib/i18n'
import { help, type HelpPage as Page } from '../lib/help'
import { TopBar } from '../ui'

/** Lille ⓘ-knap. Ved tryk vises en rolig forklaring nederst på skærmen. */
export function Tip({ k }: { k: string }) {
  const { lang } = useI18n()
  const [open, setOpen] = useState(false)
  const text = help[lang].tips[k]
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const id = setTimeout(() => document.addEventListener('click', close, { once: true }), 0)
    return () => { clearTimeout(id); document.removeEventListener('click', close) }
  }, [open])
  if (!text) return null
  return (
    <>
      <button
        type="button" className="tip-btn" aria-label="Info" aria-expanded={open}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v) }}
      >
        i
      </button>
      {open && <span className="tip-box" role="note">{text}</span>}
    </>
  )
}

function PageView({ page }: { page: Page }) {
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div>
        <strong style={{ fontSize: 18 }}>{page.title}</strong>
        <div className="muted small" style={{ marginTop: 2 }}>{page.intro}</div>
      </div>
      {page.sections.map((s) => (
        <div key={s.title}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{s.title}</div>
          <ul className="help-list">{s.items.map((i) => <li key={i}>{i}</li>)}</ul>
        </div>
      ))}
    </div>
  )
}

/** Indhold i hjælp-dialogen for en skærm. */
export function HelpDialogContent({ pages, onClose }: { pages: string[]; onClose: () => void }) {
  const { t, lang } = useI18n()
  const content = help[lang]
  return (
    <div className="stack">
      {pages.map((p) => content.pages[p] && <PageView key={p} page={content.pages[p]} />)}
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <Link to="/hjaelp" className="small" onClick={onClose} style={{ color: 'var(--brand)', fontWeight: 600 }}>{t('help.all')} →</Link>
        <button className="ghost" onClick={onClose}>{t('prof.close')}</button>
      </div>
    </div>
  )
}

/** Hjælp og FAQ med søgning, roller og alle skærme. */
export default function HelpCenter() {
  const { t, lang } = useI18n()
  const content = help[lang]
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const needle = q.trim().toLowerCase()
  const has = (...s: string[]) => !needle || s.join(' ').toLowerCase().includes(needle)

  const faq = content.faq.filter((f) => has(f.q, f.a))
  const roles = Object.entries(content.roles).filter(([, r]) => has(r.title, r.who, r.how, ...r.can))
  const pages = Object.entries(content.pages).filter(([, p]) => has(p.title, p.intro, ...p.sections.flatMap((s) => [s.title, ...s.items])))

  return (
    <>
      <TopBar title={t('help.title')} />
      <main className="stack">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('help.search')} autoFocus />

        {faq.length > 0 && <div className="section-title">{t('help.faq')}</div>}
        {faq.length > 0 && (
          <div className="list">
            {faq.map((f) => (
              <div className="item" key={f.q} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6, cursor: 'pointer' }}
                onClick={() => setOpen(open === f.q ? null : f.q)}>
                <div className="row"><strong className="grow" style={{ fontWeight: 600 }}>{f.q}</strong><span className="muted">{open === f.q || needle ? '▴' : '▾'}</span></div>
                {(open === f.q || needle) && <div className="small" style={{ color: 'var(--ink-2)' }}>{f.a}</div>}
              </div>
            ))}
          </div>
        )}

        {roles.length > 0 && <div className="section-title">{t('help.roles')}</div>}
        {roles.map(([k, r]) => (
          <details className="card" key={k} open={!!needle}>
            <summary style={{ fontWeight: 600, cursor: 'pointer' }}>{r.title}</summary>
            <div className="small stack" style={{ gap: 6, marginTop: 8, color: 'var(--ink-2)' }}>
              <div>{r.who}</div>
              <ul className="help-list">{r.can.map((c) => <li key={c}>{c}</li>)}</ul>
              <div><strong style={{ color: 'var(--ink)' }}>{t('help.howRole')}</strong> {r.how}</div>
            </div>
          </details>
        ))}

        {pages.length > 0 && <div className="section-title">{t('help.screens')}</div>}
        {pages.map(([k, p]) => (
          <details className="card" key={k} open={!!needle}>
            <summary style={{ fontWeight: 600, cursor: 'pointer' }}>{p.title}</summary>
            <div style={{ marginTop: 8 }}><PageView page={{ ...p, title: '' }} /></div>
          </details>
        ))}

        {!faq.length && !roles.length && !pages.length && <div className="empty">{t('help.noResults')}</div>}
      </main>
    </>
  )
}
