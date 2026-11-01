// Adresse → koordinater via OpenStreetMap (Nominatim). Gratis, men max ca. 1 opslag pr. sekund,
// så resultater gemmes i browseren, og opslag køres efter hinanden.

export type LatLng = { lat: number; lng: number }

const cacheKey = (address: string) => 'ka.geo.' + address.trim().toLowerCase()

function cached(address: string): LatLng | null | undefined {
  try {
    const raw = localStorage.getItem(cacheKey(address))
    return raw === null ? undefined : (JSON.parse(raw) as LatLng | null)
  } catch { return undefined }
}

let queue: Promise<unknown> = Promise.resolve()

/** Slår en adresse op. Giver null, hvis den ikke findes. */
export function geocode(address: string): Promise<LatLng | null> {
  const a = address.trim()
  if (!a) return Promise.resolve(null)
  const hit = cached(a)
  if (hit !== undefined) return Promise.resolve(hit)
  const job = queue.then(async () => {
    const again = cached(a)
    if (again !== undefined) return again
    let result: LatLng | null = null
    try {
      const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=dk&q=' + encodeURIComponent(a)
      const res = await fetch(url, { headers: { 'Accept-Language': 'da' } })
      const data = (await res.json()) as { lat: string; lon: string }[]
      if (data[0]) result = { lat: Number(data[0].lat), lng: Number(data[0].lon) }
    } catch { /* netværksfejl: prøv igen næste gang */ return null }
    try { localStorage.setItem(cacheKey(a), JSON.stringify(result)) } catch { /* ignore */ }
    await new Promise((r) => setTimeout(r, 1100))
    return result
  })
  queue = job.catch(() => undefined)
  return job
}
