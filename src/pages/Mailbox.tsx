import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { supabase, errorKey } from '../lib/supabase'
import { useI18n } from '../lib/i18n'
import { useSession } from '../lib/session'
import { TrashIcon, relTime } from '../ui'

type Message = { id: string; body: string; created_at: string }
type Report = { id: string; message_id: string; reason: string; to_admin: boolean; status: string; created_at: string }

export default function Mailbox() {
  const { t, locale } = useI18n()
  const { membership } = useSession()
  const isMod = membership!.is_moderator
  const [messages, setMessages] = useState<Message[] | null>(null)
  const [reports, setReports] = useState<Report[]>([])
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [reporting, setReporting] = useState<Message | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('anon_messages').select('id, body, created_at')
      .eq('hall_id', membership!.hall_id).order('created_at', { ascending: false }).limit(100)
    setMessages((data as Message[]) ?? [])
    if (isMod) {
      const r = await supabase.from('reports').select('id, message_id, reason, to_admin, status, created_at')
        .eq('hall_id', membership!.hall_id).eq('to_admin', false).eq('status', 'open').order('created_at')
      setReports((r.data as Report[]) ?? [])
    }
  }, [membership, isMod])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  async function send(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    const { error } = await supabase.rpc('send_anon_message', { p_body: body.trim() })
    setBusy(false)
    if (error) return setError(t(errorKey(error)))
    setBody('')
    load()
  }

  async function removeMessage(id: string) {
    if (!confirm(t('common.confirm'))) return
    await supabase.from('anon_messages').delete().eq('id', id)
    load()
  }

  async function resolve(id: string) {
    await supabase.from('reports').update({ status: 'resolved' }).eq('id', id)
    load()
  }

  const msgById = (id: string) => messages?.find((m) => m.id === id)

  return (
    <div className="stack">
      <form className="card stack" onSubmit={send}>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={t('mail.compose')} maxLength={2000} />
        <div className="small muted">🤫 {t('mail.note')}</div>
        {error && <div className="error">{error}</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="submit" disabled={busy || !body.trim()}>{t('mail.send')}</button>
        </div>
      </form>

      {note && <div className="notice">{note}</div>}

      {isMod && reports.length > 0 && (
        <>
          <div className="section-title">{t('mail.reports')} · {reports.length}</div>
          {reports.map((r) => (
            <div className="card stack" key={r.id} style={{ borderColor: 'var(--danger)' }}>
              <div className="small muted">{relTime(r.created_at, locale)}{r.reason && ` · ${r.reason}`}</div>
              <div className="post">{msgById(r.message_id)?.body ?? '—'}</div>
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <button className="danger" onClick={() => removeMessage(r.message_id)}>{t('mail.deleteMsg')}</button>
                <button className="ghost" onClick={() => resolve(r.id)}>{t('mail.resolve')}</button>
              </div>
            </div>
          ))}
        </>
      )}

      {messages === null ? (
        <div className="empty">{t('common.loading')}</div>
      ) : messages.length === 0 ? (
        <div className="empty">{t('mail.empty')}</div>
      ) : (
        messages.map((m) => (
          <article className="card" key={m.id}>
            <div className="post-meta">
              <strong style={{ color: 'var(--ink)' }}>🤫 {t('mail.anonymous')}</strong>
              <span>· {relTime(m.created_at, locale)}</span>
              <span style={{ marginLeft: 'auto' }} />
              <button className="link small" onClick={() => { setReporting(m); dialog.current?.showModal() }}>{t('mail.report')}</button>
              {isMod && <button className="icon" onClick={() => removeMessage(m.id)} aria-label={t('common.delete')}><TrashIcon /></button>}
            </div>
            <div className="post">{m.body}</div>
          </article>
        ))
      )}

      <dialog ref={dialog}>
        {reporting && (
          <ReportForm
            key={reporting.id}
            message={reporting}
            onDone={(ok) => {
              dialog.current?.close(); setReporting(null)
              if (ok) { setNote(t('mail.reported')); setTimeout(() => setNote(''), 4000); load() }
            }}
          />
        )}
      </dialog>
    </div>
  )
}

function ReportForm({ message, onDone }: { message: Message; onDone: (ok: boolean) => void }) {
  const { t } = useI18n()
  const [reason, setReason] = useState('')
  const [toAdmin, setToAdmin] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    const { error } = await supabase.rpc('report_message', { p_message: message.id, p_reason: reason, p_to_admin: toAdmin })
    if (error) return setError(t(errorKey(error)))
    onDone(true)
  }

  return (
    <form className="stack" onSubmit={submit}>
      <strong style={{ fontSize: 18 }}>{t('mail.reportTitle')}</strong>
      <div className="post small muted" style={{ maxHeight: 120, overflow: 'auto' }}>{message.body}</div>
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('mail.reason')} maxLength={500} />
      <div>
        <label>{t('mail.to')}</label>
        <div className="seg">
          <button type="button" className={!toAdmin ? 'on' : ''} onClick={() => setToAdmin(false)}>{t('mail.toMod')}</button>
          <button type="button" className={toAdmin ? 'on' : ''} onClick={() => setToAdmin(true)}>{t('mail.toAdmin')}</button>
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="ghost" onClick={() => onDone(false)}>{t('common.cancel')}</button>
        <button type="submit" className="danger">{t('mail.report')}</button>
      </div>
    </form>
  )
}
