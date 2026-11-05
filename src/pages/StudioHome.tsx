import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { api, useApi } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { randomOutfit } from '../designer/randomOutfit'
import { getTemplate } from '../designer/templates'
import { mannequinMeasurements } from '../designer/to3d'
import { isPants, type GarmentTemplate } from '../designer/types'
import { bodyKind, type DesignData } from '../shared/designs'
import { displayName } from '../shared/users'
import { Scene } from '../three/Scene'
import { SHOE_STYLES } from '../three/Shoes'
import type { ShoeStyle } from '../types'
import { outfitOf, useDesign3D } from './designer/Design3D'
import './designer/studio.css'
import './home.css'

interface Worn {
  id: string
  name: string
  template: GarmentTemplate
  data: DesignData
}

interface Look {
  top: Worn
  bottom: Worn | null
  kind: 'hombre' | 'mujer'
  shoes: ShoeStyle
  /** Son diseños de la cuenta (si aún no hay, se viste con prendas base al azar). */
  own: boolean
}

const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)]

/**
 * Inicio: el probador 3D en el plató de fotos con un outfit al azar hecho con tus diseños (una prenda de arriba, un
 * pantalón y unas zapatillas). Si aún no hay diseños, se viste con prendas base. El menú flota encima.
 */
export function StudioHome() {
  const { user } = useAuth()
  const designs = useApi(() => api.listDesigns(), [])
  const library = useApi(() => api.listMaterials(), [])
  const materials = useMemo(() => new Map((library.data ?? []).map((m) => [m.id, m])), [library.data])
  const own = useMemo(() => {
    const list = (designs.data ?? []).filter((d) => getTemplate(d.template)).map((d) => ({ id: d.id, name: d.name, template: getTemplate(d.template)!, data: d.data }))
    return { tops: list.filter((d) => d.template.family === 'top'), bottoms: list.filter((d) => isPants(d.template)) }
  }, [designs.data])

  const shuffle = (prev?: Look | null): Look => {
    // Zapatillas distintas de las de antes
    const shoes = pick(SHOE_STYLES.filter((s) => s.id !== prev?.shoes)).id
    if (own.tops.length) {
      // Otra combinación distinta de la que hay (si se puede)
      const combos: [Worn, Worn | null][] = own.tops.flatMap((t) => (own.bottoms.length ? own.bottoms.map((b): [Worn, Worn | null] => [t, b]) : [[t, null] as [Worn, Worn | null]]))
      const fresh = combos.filter(([t, b]) => t.id !== prev?.top.id || (b?.id ?? null) !== (prev?.bottom?.id ?? null))
      const [top, bottom] = pick(fresh.length ? fresh : combos)
      const kind = [top, bottom].some((d) => d && bodyKind(d.data) === 'mujer') ? 'mujer' : 'hombre'
      return { top, bottom, kind, shoes, own: true }
    }
    const r = randomOutfit()
    return {
      top: { id: 'base-top', name: r.top.template.name, ...r.top },
      bottom: { id: 'base-bottom', name: r.bottom.template.name, ...r.bottom },
      kind: r.kind,
      shoes,
      own: false,
    }
  }

  const [look, setLook] = useState<Look | null>(null)
  // Se elige al llegar los diseños
  useEffect(() => {
    if (designs.data || designs.error) setLook((l) => l ?? shuffle())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designs.data, designs.error])

  const measurements = useMemo(() => mannequinMeasurements(undefined, look?.kind ?? 'hombre'), [look?.kind])
  const top3d = useDesign3D(look?.top.template, look?.top.data, materials)
  const bottom3d = useDesign3D(look?.bottom?.template, look?.bottom?.data, materials)
  const worn = useMemo(() => (top3d ? outfitOf(top3d, bottom3d, false) : null), [top3d, bottom3d])
  const animate = useMemo(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const shoeLabel = SHOE_STYLES.find((s) => s.id === look?.shoes)?.label

  return (
    <div className="studio home-stage">
      <main className="viewport">
        {worn && <Scene stage="studio" measurements={measurements} design={worn.design} outfit={worn.outfit} autoRotate={false} animate={animate} shoes={look?.shoes} />}
      </main>
      {look && (
        <div className="home-card">
          <span className="home-kicker">{user ? `Hola, ${displayName(user)}` : 'FreeDesign'}</span>
          <strong className="home-title">{[look.top.name, look.bottom?.name].filter(Boolean).join(' · ')}</strong>
          <span className="home-sub">
            {look.own ? 'Tus diseños' : 'Prendas base (aún no tienes diseños)'} · {shoeLabel}
          </span>
          <div className="home-actions">
            <button className="home-button primary" onClick={() => setLook((l) => shuffle(l))}>
              Otro outfit
            </button>
            <Link to="/disenador/probador" className="home-button">
              Probador
            </Link>
            <Link to="/disenador/nuevo" className="home-button">
              Nuevo diseño
            </Link>
          </div>
        </div>
      )}
      <p className="home-hint">Arrastra para girar · Rueda para acercar</p>
    </div>
  )
}
