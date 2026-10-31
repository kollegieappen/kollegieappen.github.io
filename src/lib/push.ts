import { supabase } from './supabase'

// Offentlig VAPID-nøgle. Den private nøgle ligger kun som secret i Supabase.
export const VAPID_PUBLIC_KEY = 'BI69mNbgRLYjFj2QpBwIPutkF8Jjh6fmQbRwLOP-Cp7A8W-M9TpKab6JncrnBvZb8L-7QdqUHJ2IFbm4ElxYRWA'

export type PushState = 'on' | 'off' | 'denied' | 'unsupported' | 'install-first'

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true

function keyBytes(base64: string) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export async function pushState(): Promise<PushState> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return isIos() && !isStandalone() ? 'install-first' : 'unsupported'
  }
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  return sub && Notification.permission === 'granted' ? 'on' : 'off'
}

export async function enablePush(): Promise<PushState> {
  const state = await pushState()
  if (state === 'unsupported' || state === 'install-first' || state === 'denied') return state
  if ((await Notification.requestPermission()) !== 'granted') return 'denied'
  const reg = await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }))
  const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
  // En enhed kan have været brugt af en anden konto; ryd vores egen række og indsæt på ny.
  await supabase.from('push_subscriptions').delete().eq('endpoint', j.endpoint)
  const { error } = await supabase.from('push_subscriptions').insert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth })
  if (error) throw error
  return 'on'
}

export async function disablePush() {
  if (!('serviceWorker' in navigator)) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (sub) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    await sub.unsubscribe()
  }
}

/** Log ud og stop notifikationer på denne enhed. */
export async function signOut() {
  try { await disablePush() } catch { /* ignore */ }
  await supabase.auth.signOut()
}
