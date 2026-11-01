import { useEffect, useRef, useState, type ReactNode } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { geocode } from '../lib/geo'
import { useI18n } from '../lib/i18n'

export type MapDorm = {
  id: string; name: string; address: string | null
  lat?: number | null; lng?: number | null
  kind: 'me' | 'friend' | 'pending' | 'candidate'
}

const COLORS: Record<MapDorm['kind'], string> = {
  me: '#1f4d3a', friend: '#e8a33d', pending: '#8a8f8b', candidate: '#3b6fb6'
}

/** Kort over kollegier. Kollegier uden gemte koordinater slås op ud fra adressen. */
export default function DormMap({ dorms, renderSelected }: {
  dorms: MapDorm[]
  renderSelected?: (d: MapDorm) => ReactNode
}) {
  const { t } = useI18n()
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const [coords, setCoords] = useState<Record<string, { lat: number; lng: number } | null>>({})
  const [selected, setSelected] = useState<MapDorm | null>(null)

  // Opret kortet én gang.
  useEffect(() => {
    if (!el.current || map.current) return
    map.current = L.map(el.current, { scrollWheelZoom: false, attributionControl: true }).setView([56.0, 10.5], 6)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18, attribution: '© OpenStreetMap'
    }).addTo(map.current)
    layer.current = L.layerGroup().addTo(map.current)
    return () => { map.current?.remove(); map.current = null }
  }, [])

  // Find koordinater for kollegier, der mangler dem.
  useEffect(() => {
    let alive = true
    for (const d of dorms) {
      if (d.lat != null && d.lng != null) continue
      if (!d.address || d.id in coords) continue
      geocode(d.address).then((c) => { if (alive) setCoords((x) => ({ ...x, [d.id]: c })) })
    }
    return () => { alive = false }
  }, [dorms]) // eslint-disable-line react-hooks/exhaustive-deps

  // Tegn markører.
  const placed = dorms
    .map((d) => {
      const c = d.lat != null && d.lng != null ? { lat: d.lat, lng: d.lng } : coords[d.id]
      return c ? { d, c } : null
    })
    .filter((x): x is { d: MapDorm; c: { lat: number; lng: number } } => !!x)
  const key = placed.map((p) => `${p.d.id}:${p.c.lat},${p.c.lng}:${p.d.kind}`).join('|')

  useEffect(() => {
    if (!map.current || !layer.current) return
    layer.current.clearLayers()
    for (const { d, c } of placed) {
      L.circleMarker([c.lat, c.lng], {
        radius: d.kind === 'me' ? 10 : 8, color: '#fff', weight: 2, fillColor: COLORS[d.kind], fillOpacity: 1
      })
        .bindTooltip(d.name)
        .on('click', () => setSelected(d))
        .addTo(layer.current)
    }
    if (placed.length === 1) map.current.setView([placed[0].c.lat, placed[0].c.lng], 12)
    else if (placed.length > 1) map.current.fitBounds(L.latLngBounds(placed.map((p) => [p.c.lat, p.c.lng])), { padding: [30, 30], maxZoom: 13 })
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  const missing = dorms.filter((d) => (d.lat == null || d.lng == null) && (!d.address || coords[d.id] === null))
  const kinds = [...new Set(dorms.map((d) => d.kind))]

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div ref={el} className="dorm-map" />
      <div className="row small muted" style={{ flexWrap: 'wrap', gap: 12 }}>
        {kinds.map((k) => (
          <span key={k} className="row" style={{ gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: COLORS[k], display: 'inline-block' }} />
            {t('map.' + k)}
          </span>
        ))}
      </div>
      {selected && (
        <div className="card stack" style={{ gap: 6 }}>
          <div className="row">
            <strong className="grow">{selected.name}</strong>
            <button className="link small" onClick={() => setSelected(null)}>{t('prof.close')}</button>
          </div>
          {selected.address && <div className="small muted">📍 {selected.address}</div>}
          {renderSelected?.(selected)}
        </div>
      )}
      {missing.length > 0 && (
        <div className="small muted">{t('map.missing', { names: missing.map((d) => d.name).join(', ') })}</div>
      )}
    </div>
  )
}
