import { useMemo, useState } from 'react'
import { designTo3D, mannequinMeasurements } from '../../designer/to3d'
import type { GarmentTemplate } from '../../designer/types'
import type { Client } from '../../shared/clients'
import type { DesignData } from '../../shared/designs'
import type { Material } from '../../shared/library'
import { Scene } from '../../three/Scene'
import './studio.css'

interface Props {
  template: GarmentTemplate
  data: DesignData
  materials: Map<string, Material>
  /** Cliente del diseño: si tiene medidas, el maniquí las toma. */
  client?: Client
}

/** Vista 3D del diseño que se está editando: el maniquí con la prenda, sus colores y materiales, al momento. */
export function Design3D({ template, data, materials, client }: Props) {
  const [hoodUp, setHoodUp] = useState(true)
  const design = useMemo(() => ({ ...designTo3D(template, data, materials), hoodUp }), [template, data, materials, hoodUp])
  const measurements = useMemo(() => mannequinMeasurements(client?.measurements), [client])
  const [autoRotate, setAutoRotate] = useState(false)
  const [animate, setAnimate] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const prints = (data.prints ?? []).length

  return (
    <div className="design-3d studio">
      <div className="viewport">
        <Scene measurements={measurements} design={design} autoRotate={autoRotate} animate={animate} />
        <div className="design-3d-bar">
          {design.hood && (
            <label className="toggle">
              <input type="checkbox" checked={hoodUp} onChange={(e) => setHoodUp(e.target.checked)} />
              Capucha puesta
            </label>
          )}
          <label className="toggle">
            <input type="checkbox" checked={animate} onChange={(e) => setAnimate(e.target.checked)} />
            Animación
          </label>
          <label className="toggle">
            <input type="checkbox" checked={autoRotate} onChange={(e) => setAutoRotate(e.target.checked)} />
            Girar 360°
          </label>
        </div>
        <p className="design-3d-note">
          {client && Object.keys(client.measurements).length ? `Medidas de ${client.name}` : 'Medidas estándar'}
          {template.id === 'bomber' && ' · La bomber se ve de momento como una prenda de manga larga'}
          {prints > 0 && ' · Los estampados solo se ven en 2D por ahora'}
          {' · Arrastra para girar'}
        </p>
      </div>
    </div>
  )
}
