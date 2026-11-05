import { useEffect, useMemo, useState } from 'react'
import { api, useApi } from '../../api/client'
import { printLayer } from '../../designer/printLayers'
import { getTemplate } from '../../designer/templates'
import { clientBody, type Body } from '../../production/measurements'
import { designTo3D, hasOwn3D, mannequinMeasurements } from '../../designer/to3d'
import { isPants } from '../../designer/types'
import type { Design } from '../../types'
import type { GarmentTemplate } from '../../designer/types'
import type { Client } from '../../shared/clients'
import type { DesignData } from '../../shared/designs'
import type { Material } from '../../shared/library'
import { Scene } from '../../three/Scene'
import './studio.css'

/**
 * Un diseño del Diseñador como prenda 3D, con sus estampados (que se pintan en una imagen por lado cada vez que
 * cambian, o cambia la forma de la prenda). Sin diseño, devuelve null.
 */
export function useDesign3D(template: GarmentTemplate | null | undefined, data: DesignData | null | undefined, materials: Map<string, Material>, body?: Body) {
  const [layers, setLayers] = useState<Design['prints']>()
  const printKey = template && data ? JSON.stringify([data.prints ?? [], data.details ?? [], data.hardware ?? {}, data.blocks ?? [], data.pieces, data.options, data.measures ?? {}, template.id, !!body]) : ''
  useEffect(() => {
    if (!template || !data) return setLayers(undefined)
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
  return useMemo(() => (template && data ? { ...designTo3D(template, data, materials, body), prints: layers } : null), [template, data, materials, body, layers])
}

/** Cuerpo del maniquí: el del cliente si tiene medidas. */
export const bodyOf = (client?: Client) => (client && Object.keys(client.measurements).length ? clientBody(client.measurements).body : undefined)

/** Prenda de arriba y de abajo juntas: la de abajo (pantalón) va debajo y se ciñe a la cintura. */
export function outfitOf(main: Design, other: Design | null, mainIsPants: boolean): { design: Design; outfit: Design[] } {
  if (!other) return { design: main, outfit: [] }
  // Lo de fuera es siempre la prenda de arriba
  return mainIsPants ? { design: other, outfit: [{ ...main, under: true }] } : { design: main, outfit: [{ ...other, under: true }] }
}

interface Props {
  template: GarmentTemplate
  data: DesignData
  materials: Map<string, Material>
  /** Cliente del diseño: si tiene medidas, el maniquí las toma. */
  client?: Client
  /** Id del diseño (para recordar con qué otra prenda se ve). */
  designId?: string
}

const stored = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** Vista 3D del diseño que se está editando: el maniquí con la prenda, sus colores y materiales, al momento. */
export function Design3D({ template, data, materials, client, designId }: Props) {
  // Sin maniquí, la capucha se ve mejor bajada
  const [hoodUp, setHoodUp] = useState(false)
  const body = useMemo(() => bodyOf(client), [client])
  const main = useDesign3D(template, data, materials, body)!
  const pants = isPants(template)

  // «Llevar con…»: otra prenda ya diseñada (de abajo si esta es de arriba, y al revés), recordada en este navegador
  const memoKey = designId ? `fd:outfit:${designId}` : ''
  const [withId, setWithId] = useState<string | null>(() => (memoKey ? stored(memoKey) : null))
  const designs = useApi(() => api.listDesigns(), [])
  const partners = (designs.data ?? []).filter((d) => {
    const t = d.id !== designId ? getTemplate(d.template) : undefined
    return t && t.family !== 'head' && isPants(t) !== pants
  })
  const partner = partners.find((d) => d.id === withId)
  const partnerTemplate = partner ? getTemplate(partner.template) : null
  const other = useDesign3D(partnerTemplate, partner?.data, materials, body)
  const choose = (id: string) => {
    setWithId(id || null)
    try {
      if (memoKey) {
        if (id) localStorage.setItem(memoKey, id)
        else localStorage.removeItem(memoKey)
      }
    } catch {
      // Sin almacenamiento: se recuerda solo mientras la página está abierta
    }
  }

  const { design, outfit } = useMemo(() => outfitOf(main, other, pants), [main, other, pants])
  const shown = useMemo(() => ({ ...design, hoodUp }), [design, hoodUp])
  const measurements = useMemo(() => mannequinMeasurements(client?.measurements), [client])
  const [autoRotate, setAutoRotate] = useState(false)
  const sidePrints = (data.prints ?? []).filter((p) => p.view === 'side').length

  // Gorros y gorras aún no tienen forma 3D
  if (template.family === 'head')
    return (
      <div className="design-3d studio">
        <div className="probador-empty">
          <p>
            {template.name}: las prendas de cabeza aún no se ven en 3D.
            <br />
            El dibujo, la ficha técnica y la exportación sí funcionan.
          </p>
        </div>
      </div>
    )

  return (
    <div className="design-3d studio">
      <div className="viewport">
        {/* En el editor se ve solo la ropa, quieta en la postura de reposo (el maniquí y la animación salen en el Probador) */}
        <Scene measurements={measurements} design={shown} outfit={outfit} autoRotate={autoRotate} animate={false} showBody={false} focus={outfit.length ? 0.5 : pants ? 0.3 : 0.66} />
        <div className="design-3d-bar">
          <label className="outfit-pick" title={pants ? 'Ver el pantalón con una prenda de arriba ya diseñada' : 'Ver la prenda con un pantalón ya diseñado'}>
            <span>Llevar con</span>
            <select value={partner ? partner.id : ''} onChange={(e) => choose(e.target.value)}>
              <option value="">{pants ? 'Sin prenda de arriba' : 'Sin pantalón'}</option>
              {partners.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          {shown.hood && (
            <label className="toggle">
              <input type="checkbox" checked={hoodUp} onChange={(e) => setHoodUp(e.target.checked)} />
              Capucha puesta
            </label>
          )}
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
