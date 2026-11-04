import { useEffect, useMemo, useState } from 'react'
import { printLayer } from '../../designer/printLayers'
import { clientBody } from '../../production/measurements'
import { designTo3D, hasOwn3D, mannequinMeasurements } from '../../designer/to3d'
import type { Design } from '../../types'
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
  // Estampados: se pintan en una imagen por lado cada vez que cambian (o cambia la forma de la prenda)
  const [layers, setLayers] = useState<Design['prints']>()
  const body = useMemo(() => (client && Object.keys(client.measurements).length ? clientBody(client.measurements).body : undefined), [client])
  const printKey = JSON.stringify([data.prints ?? [], data.details ?? [], data.hardware ?? {}, data.pieces, data.options, data.measures ?? {}, template.id, !!body])
  useEffect(() => {
    let alive = true
    Promise.all([printLayer(template, data, 'front', body), printLayer(template, data, 'back', body)]).then(([front, back]) => {
      if (alive)
        setLayers(front || back ? { front: front?.color ?? null, back: back?.color ?? null, frontRelief: front?.relief ?? null, backRelief: back?.relief ?? null } : undefined)
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printKey])
  const design = useMemo(() => ({ ...designTo3D(template, data, materials, body), hoodUp, prints: layers }), [template, data, materials, hoodUp, layers, body])
  const measurements = useMemo(() => mannequinMeasurements(client?.measurements), [client])
  const [autoRotate, setAutoRotate] = useState(false)
  const [animate, setAnimate] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const sidePrints = (data.prints ?? []).filter((p) => p.view === 'side').length

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
          {!hasOwn3D(template) && ` · ${template.name}: forma 3D aproximada (algunos detalles solo se ven en 2D)`}
          {sidePrints > 0 && ' · Los estampados del lateral aún no se ven en 3D'}
          {' · Arrastra para girar'}
        </p>
      </div>
    </div>
  )
}
