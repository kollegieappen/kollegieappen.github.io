import { createClient } from '@supabase/supabase-js'

// Begge værdier er offentlige og må gerne ligge i appen.
// Adgangen styres af Row Level Security i databasen.
export const SUPABASE_URL = 'https://repwwjwbgcmthgaojcym.supabase.co'
export const SUPABASE_KEY = 'sb_publishable_jwhq6YNolQOitu5ouv7idg_zqle1ag-'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
})

export const APP_URL = window.location.origin

export type Scope = 'hall' | 'dorm'

export type Dorm = { id: string; name: string; status: 'pending' | 'approved' | 'rejected' }
export type Hall = { id: string; name: string; dorm_id: string }
export type Profile = { id: string; display_name: string; language: 'da' | 'en' }
export type Membership = { hall_id: string; is_moderator: boolean; hall: Hall; dorm: Dorm }

/** Supabase-fejl → nøgle, som i18n kan oversætte. */
export function errorKey(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e)
  const known = [
    'already_member', 'invalid_code', 'forbidden', 'last_moderator', 'my_hall_not_in_list',
    'invalid_halls', 'user_not_found', 'invalid_dorm', 'Invalid login credentials', 'User already registered', 'Email not confirmed'
  ]
  const hit = known.find((k) => msg.includes(k))
  if (hit) return 'err.' + hit
  if (msg.includes('duplicate key')) return 'err.duplicate'
  return msg
}
