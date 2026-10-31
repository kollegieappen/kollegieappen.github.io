import { useEffect, useState, type FormEvent } from 'react'
import { supabase, errorKey } from '../lib/supabase'
import { useI18n } from '../lib/i18n'
import { useSession } from '../lib/session'

export const DIET_TAGS = ['vegetarian', 'vegan', 'pescetarian', 'gluten', 'lactose', 'nuts', 'shellfish', 'egg', 'halal', 'kosher', 'nopork'] as const

type Details = { birth_month: number | null; birth_day: number | null; birth_year: number | null; about: string }
type Diet = { tags: string[]; note: string }

/** "Om mig" på Mig-siden: fødselsdag, om mig, allergier og madvaner. */
export function AboutMe() {
  const { t, locale } = useI18n()
  const { session } = useSession()
  const uid = session!.user.id
  const [d, setD] = useState<Details>({ birth_month: null, birth_day: null, birth_year: null, about: '' })
  const [diet, setDiet] = useState<Diet>({ tags: [], note: '' })
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('profile_details').select('birth_month, birth_day, birth_year, about').eq('user_id', uid).maybeSingle()
      .then(({ data }) => data && setD(data as Details))
    supabase.from('diet_info').select('tags, note').eq('user_id', uid).maybeSingle()
      .then(({ data }) => data && setDiet(data as Diet))
  }, [uid])

  async function save(e: FormEvent) {
    e.preventDefault()
    setError('')
    const hasBirthday = !!d.birth_month && !!d.birth_day
    const [a, b] = await Promise.all([
      supabase.from('profile_details').upsert({
        user_id: uid,
        birth_month: hasBirthday ? d.birth_month : null,
        birth_day: hasBirthday ? d.birth_day : null,
        birth_year: hasBirthday && d.birth_year ? d.birth_year : null,
        about: d.about.trim()
      }),
      supabase.from('diet_info').upsert({ user_id: uid, tags: diet.tags, note: diet.note.trim() })
    ])
    const err = a.error ?? b.error
    if (err) return setError(t(errorKey(err)))
    setSaved(true); setTimeout(() => setSaved(false), 1500)
  }

  const months = Array.from({ length: 12 }, (_, i) => new Date(2024, i, 1).toLocaleDateString(locale, { month: 'long' }))
  const toggleTag = (tag: string) =>
    setDiet((x) => ({ ...x, tags: x.tags.includes(tag) ? x.tags.filter((y) => y !== tag) : [...x.tags, tag] }))

  return (
    <form className="card stack" onSubmit={save}>
      <strong>{t('prof.title')}</strong>
      <div>
        <label>{t('prof.birthday')}</label>
        <div className="row">
          <select value={d.birth_day ?? ''} onChange={(e) => setD({ ...d, birth_day: Number(e.target.value) || null })} aria-label={t('prof.day')} style={{ width: 'auto' }}>
            <option value="">–</option>
            {Array.from({ length: 31 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
          </select>
          <select className="grow" value={d.birth_month ?? ''} onChange={(e) => setD({ ...d, birth_month: Number(e.target.value) || null })} aria-label={t('prof.month')}>
            <option value="">–</option>
            {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <input
            type="number" inputMode="numeric" min={1900} max={2100} placeholder={t('prof.year')} style={{ width: 92 }}
            value={d.birth_year ?? ''} onChange={(e) => setD({ ...d, birth_year: Number(e.target.value) || null })}
          />
        </div>
        <div className="muted small" style={{ marginTop: 4 }}>{t('prof.birthdayHint')}</div>
      </div>
      <div>
        <label htmlFor="ab">{t('prof.about')}</label>
        <textarea id="ab" value={d.about} onChange={(e) => setD({ ...d, about: e.target.value })} maxLength={500} placeholder={t('prof.aboutPh')} />
      </div>
      <div>
        <label>{t('prof.diet')}</label>
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          {DIET_TAGS.map((tag) => (
            <button
              type="button" key={tag} className="ghost" onClick={() => toggleTag(tag)} aria-pressed={diet.tags.includes(tag)}
              style={{
                padding: '5px 10px', fontSize: 13, color: 'var(--ink)',
                borderColor: diet.tags.includes(tag) ? 'var(--brand)' : 'var(--line)', borderWidth: diet.tags.includes(tag) ? 2 : 1
              }}
            >
              {t('diet.' + tag)}
            </button>
          ))}
        </div>
        <input style={{ marginTop: 8 }} value={diet.note} onChange={(e) => setDiet({ ...diet, note: e.target.value })} maxLength={300} placeholder={t('prof.dietNote')} />
        <div className="muted small" style={{ marginTop: 4 }}>{t('prof.dietHint')}</div>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="submit">{saved ? t('me.saved') : t('common.save')}</button>
      </div>
    </form>
  )
}

export function dietSummary(diet: Diet | undefined, t: (k: string) => string) {
  if (!diet) return ''
  return [...diet.tags.map((x) => t('diet.' + x)), diet.note].filter(Boolean).join(', ')
}

/** Beboerprofil i en dialog. */
export function MemberProfile({ userId, name, hall, onClose }: { userId: string; name: string; hall?: string; onClose: () => void }) {
  const { t, locale } = useI18n()
  const [details, setDetails] = useState<Details | null>(null)
  const [diet, setDiet] = useState<Diet | undefined>()
  const [phone, setPhone] = useState('')

  useEffect(() => {
    supabase.from('profile_details').select('birth_month, birth_day, birth_year, about').eq('user_id', userId).maybeSingle()
      .then(({ data }) => setDetails((data as Details) ?? { birth_month: null, birth_day: null, birth_year: null, about: '' }))
    supabase.from('diet_info').select('tags, note').eq('user_id', userId).maybeSingle().then(({ data }) => setDiet((data as Diet) ?? undefined))
    supabase.from('phone_numbers').select('phone').eq('user_id', userId).maybeSingle().then(({ data }) => setPhone(data?.phone ?? ''))
  }, [userId])

  const birthday = details?.birth_month && details.birth_day
    ? new Date(2024, details.birth_month - 1, details.birth_day).toLocaleDateString(locale, { day: 'numeric', month: 'long' }) +
      (details.birth_year ? ` ${details.birth_year}` : '')
    : ''
  const dietText = dietSummary(diet, t)

  return (
    <div className="stack">
      <div>
        <strong style={{ fontSize: 20 }}>{name}</strong>
        {hall && <div className="muted small">{hall}</div>}
      </div>
      {details === null ? (
        <div className="muted">{t('common.loading')}</div>
      ) : (
        <>
          {birthday && <div>🎂 {birthday}</div>}
          {phone && <div>📞 <a href={`tel:${phone.replace(/\s/g, '')}`} style={{ color: 'var(--brand)' }}>{phone}</a></div>}
          {dietText && <div>🍽 {dietText}</div>}
          {details.about && <div className="post">{details.about}</div>}
          {!birthday && !phone && !dietText && !details.about && <div className="muted">{t('prof.nothing')}</div>}
        </>
      )}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="ghost" onClick={onClose}>{t('prof.close')}</button>
      </div>
    </div>
  )
}
