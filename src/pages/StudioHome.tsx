import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { loadFont } from '../designer/fonts'
import { randomOutfit } from '../designer/randomOutfit'
import { mannequinMeasurements } from '../designer/to3d'
import type { Material } from '../shared/library'
import { displayName } from '../shared/users'
import { Scene } from '../three/Scene'
import { outfitOf, useDesign3D } from './designer/Design3D'
import './designer/studio.css'
import './home.css'

const NO_MATERIALS = new Map<string, Material>()

/**
 * Inicio: el probador 3D en un plató de fotos a oscuras (fondo blanco y focos de luz cálida) con un outfit al azar.
 * El menú flota encima (ver `.app.home` en styles.css).
 */
export function StudioHome() {
  const { user } = useAuth()
  const [outfit, setOutfit] = useState(randomOutfit)
  const measurements = useMemo(() => mannequinMeasurements(undefined, outfit.kind), [outfit.kind])
  const top3d = useDesign3D(outfit.top.template, outfit.top.data, NO_MATERIALS)
  const bottom3d = useDesign3D(outfit.bottom.template, outfit.bottom.data, NO_MATERIALS)
  const worn = useMemo(() => (top3d ? outfitOf(top3d, bottom3d, false) : null), [top3d, bottom3d])
  // Letra del título (la del menú de la portada también)
  useEffect(() => {
    loadFont("'Cormorant Garamond', serif")
  }, [])
  const animate = useMemo(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])

  return (
    <div className="studio home-stage">
      <main className="viewport">
        {worn && <Scene stage="studio" measurements={measurements} design={worn.design} outfit={worn.outfit} autoRotate={false} animate={animate} />}
      </main>
      <div className="home-card">
        <span className="home-kicker">{user ? `Hola, ${displayName(user)}` : 'FreeDesign'}</span>
        <strong className="home-title">
          {outfit.top.template.name} · {outfit.bottom.template.name}
        </strong>
        <span className="home-sub">Outfit al azar · {outfit.kind === 'mujer' ? 'Mujer' : 'Hombre'}</span>
        <div className="home-actions">
          <button className="home-button primary" onClick={() => setOutfit(randomOutfit())}>
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
      <p className="home-hint">Arrastra para girar · Rueda para acercar</p>
    </div>
  )
}
