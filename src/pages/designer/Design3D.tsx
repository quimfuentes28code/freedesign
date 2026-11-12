import { useEffect, useMemo, useState } from 'react'
import { api, useApi } from '../../api/client'
import { printLayer } from '../../designer/printLayers'
import { defaultDesign, getTemplate } from '../../designer/templates'
import { clientBody, type Body, type BodyKind } from '../../production/measurements'
import { designTo3D, hasOwn3D, mannequinMeasurements } from '../../designer/to3d'
import { isPants } from '../../designer/types'
import { isPatternDesign, type Design } from '../../types'
import type { GarmentTemplate } from '../../designer/types'
import type { Client } from '../../shared/clients'
import { bodyKind, type DesignData } from '../../shared/designs'
import type { Material } from '../../shared/library'
import { Scene } from '../../three/Scene'
import { garmentArt, garmentArtPending, peekRuntime, type GarmentArtViews } from '../../lienzo/engine'
import { savedGarmentArt } from '../../lienzo/savedArt'
import { standardBody } from '../../production/measurements'
import './studio.css'

/**
 * Un diseño del Diseñador como prenda 3D, con sus estampados (que se pintan en una imagen por lado cada vez que
 * cambian, o cambia la forma de la prenda). Sin diseño, devuelve null.
 */
export function useDesign3D(template: GarmentTemplate | null | undefined, data: DesignData | null | undefined, materials: Map<string, Material>, body?: Body, art?: { views: GarmentArtViews; key: string }) {
  const [layers, setLayers] = useState<Design['prints']>()
  const printKey = template && data ? JSON.stringify([data.prints ?? [], data.details ?? [], data.drawings ?? [], data.hardware ?? {}, data.blocks ?? [], data.pieces, data.options, data.measures ?? {}, template.id, !!body, art?.key ?? '']) : ''
  useEffect(() => {
    if (!template || !data) return setLayers(undefined)
    let alive = true
    const v = art?.views ?? {}
    Promise.all([printLayer(template, data, 'front', body, v.front), printLayer(template, data, 'back', body, v.back), printLayer(template, data, 'side', body, v.side)]).then(([front, back, side]) => {
      if (alive)
        setLayers(
          front || back || side
            ? { front: front?.color ?? null, back: back?.color ?? null, frontRelief: front?.relief ?? null, backRelief: back?.relief ?? null, side: side?.color ?? null }
            : undefined,
        )
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printKey])
  return useMemo(() => (template && data ? { ...designTo3D(template, data, materials, body), prints: layers } : null), [template, data, materials, body, layers])
}

/**
 * Lo pintado en el lienzo de un diseño guardado (para el Probador, sin el lienzo abierto): colores, texturas, logos…
 * Mientras se prepara, o si no hay nada pintado, undefined.
 */
export function useSavedArt(id: string | undefined, template: GarmentTemplate | null | undefined, data: DesignData | null | undefined, materials: Map<string, Material>, body?: Body) {
  const [art, setArt] = useState<{ views: GarmentArtViews; key: string }>()
  useEffect(() => {
    if (!id || !template || !data?.canvas) return setArt(undefined)
    let alive = true
    savedGarmentArt(id, template, data, materials, body ?? standardBody('M', bodyKind(data))).then((views) => {
      if (alive) setArt(Object.keys(views).length ? { views, key: `${id}|${JSON.stringify(data.canvas)}` } : undefined)
    })
    return () => {
      alive = false
    }
  }, [id, template, data, materials, body])
  return art
}

/** Cuerpo del maniquí: el del cliente si tiene medidas. */
export const bodyOf = (client?: Client, kind: BodyKind = 'hombre') => (client && Object.keys(client.measurements).length ? clientBody(client.measurements, kind).body : undefined)

/**
 * Prenda de arriba y de abajo juntas (y, si se pide, una camiseta básica debajo de la de arriba). Van por capas: el
 * pantalón (que se ciñe a la cintura), la camiseta y la prenda de arriba; cada prenda de patrón se asienta sobre la
 * tela de las de debajo.
 */
export function outfitOf(main: Design, other: Design | null, mainIsPants: boolean, tee?: Design | null): { design: Design; outfit: Design[] } {
  const [outer, pants] = other ? (mainIsPants ? [other, main] : [main, other]) : mainIsPants ? [null, main] : [main, null]
  if (!outer) return { design: main, outfit: [] }
  // Lo que abulta el pantalón en la cadera según su corte (lo de arriba se apoya encima)
  const bulk = pants ? (pants.pants ? { slim: 4, regular: 8, ancho: 16, baggy: 24 }[pants.pants.leg] : 6) : undefined
  const layers: Design[] = []
  const patternBelow = () => layers.filter(isPatternDesign).map((d) => d.layer!)
  if (pants)
    layers.push({
      ...pants,
      layer: 0,
      under: true,
      coveredBy: (tee ?? outer).bodyLength,
      overPattern: isPatternDesign(outer),
    })
  if (tee) layers.push({ ...tee, layer: layers.length, below: patternBelow(), overBulk: bulk })
  const top: Design = { ...outer, layer: layers.length, below: patternBelow(), overBulk: bulk === undefined ? undefined : bulk + (tee ? 3 : 0) }
  return { design: top, outfit: layers }
}

/** Camiseta básica (blanca o negra) para llevar debajo de una prenda abierta, con el cuerpo del maniquí. */
export function basicTee(color: 'blanca' | 'negra', female: boolean): Design {
  // Hombre: camiseta básica de manga corta, ajustada (bajo una chaqueta no abulta). Mujer: top básico de tirantes
  const t = getTemplate(female ? 'top' : 'camiseta')!
  const data = (
    female
      ? defaultDesign(t, { tipo: 'tirantes', corte: 'ajustado', largo: 'cintura', escote: 'recto', tirantes: 'finos', genero: 'mujer' })
      : defaultDesign(t, { corte: 'ajustado', manga: 'corta', largo: 'normal' })
  ) as DesignData
  const hex = color === 'blanca' ? '#f3f1ec' : '#1b1b1d'
  for (const p of Object.values(data.pieces)) p.color = hex
  return designTo3D(t, data)
}

/** Selector «Debajo» de una prenda que se puede llevar abierta. */
export type TeeChoice = '' | 'blanca' | 'negra'

/** Opciones de «Debajo» según el cuerpo: camiseta básica (hombre) o top básico (mujer). */
export function underChoices(female: boolean): { id: TeeChoice; label: string }[] {
  const what = female ? 'Top básico' : 'Camiseta básica'
  return [
    { id: '', label: 'Nada' },
    { id: 'blanca', label: `${what} blanc${female ? 'o' : 'a'}` },
    { id: 'negra', label: `${what} negr${female ? 'o' : 'a'}` },
  ]
}

interface Props {
  template: GarmentTemplate
  data: DesignData
  materials: Map<string, Material>
  /** Cliente del diseño: si tiene medidas, el maniquí las toma. */
  client?: Client
  /** Id del diseño (para recordar con qué otra prenda se ve). */
  designId?: string
  /** Lienzo abierto del diseño: lo pintado encima de la prenda se lleva al 3D. */
  runtimeId?: string
}

const stored = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** Vista 3D del diseño que se está editando: el maniquí con la prenda, sus colores y materiales, al momento. */
export function Design3D({ template, data, materials, client, designId, runtimeId }: Props) {
  // Sin maniquí, la capucha se ve mejor bajada
  const [hoodUp, setHoodUp] = useState(false)
  const kind = bodyKind(data)
  const body = useMemo(() => bodyOf(client, kind), [client, kind])
  // Lo pintado en el lienzo (colores, texturas, logos…) va encima de la prenda; si el lienzo aún está dibujando sus
  // prendas, se vuelve a mirar en un momento
  const [tick, setTick] = useState(0)
  const art = useMemo(() => {
    const r = runtimeId ? peekRuntime(runtimeId) : null
    if (!r || !data.canvas) return undefined
    const color = (piece: string) => data.pieces[piece]?.color ?? template.pieces.find((p) => p.id === piece)?.defaultColor ?? '#cccccc'
    return { views: garmentArt(r, data.canvas, color), key: `${tick}|${JSON.stringify(data.canvas)}`, pending: garmentArtPending(r, data.canvas) }
  }, [runtimeId, data.canvas, data.pieces, template, tick])
  useEffect(() => {
    if (!art?.pending) return
    const t = setTimeout(() => setTick((n) => n + 1), 700)
    return () => clearTimeout(t)
  }, [art])
  const main = useDesign3D(template, data, materials, body, art)!
  const pants = isPants(template)

  // «Llevar con…»: otra prenda ya diseñada (de abajo si esta es de arriba, y al revés), recordada en este navegador
  const memoKey = designId ? `fd:outfit:${designId}` : ''
  const [withId, setWithId] = useState<string | null>(() => (memoKey ? stored(memoKey) : null))
  const designs = useApi(() => api.listDesigns(), [])
  const partners = (designs.data ?? []).filter((d) => {
    const t = d.id !== designId ? getTemplate(d.template) : undefined
    return t && template.family !== 'head' && t.family !== 'head' && isPants(t) !== pants
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

  // Prendas abiertas por delante (chaquetas, camisa): se pueden ver abiertas y con una camiseta básica debajo
  const canOpen = !pants && !!main.top?.closure?.full
  const [open, setOpen] = useState(false)
  const [teeColor, setTeeColor] = useState<TeeChoice>('')
  const tee = useMemo(() => (canOpen && teeColor ? basicTee(teeColor, kind === 'mujer') : null), [canOpen, teeColor, kind])
  const { design, outfit } = useMemo(() => outfitOf(main, other, pants, tee), [main, other, pants, tee])
  // En el editor la prenda se ve sola y recta («fantasma»): sin maniquí y sin pliegues de caída (el Probador es el que
  // la viste en el maniquí)
  const shown = useMemo(() => ({ ...design, hoodUp, open: canOpen && open, ghost: true }), [design, hoodUp, canOpen, open])
  const ghostOutfit = useMemo(() => outfit.map((d) => ({ ...d, ghost: true })), [outfit])
  const measurements = useMemo(() => mannequinMeasurements(client?.measurements, kind), [client, kind])
  const [autoRotate, setAutoRotate] = useState(false)

  return (
    <div className="design-3d studio">
      <div className="viewport">
        {/* En el editor se ve solo la ropa, quieta en la postura de reposo (el maniquí y la animación salen en el Probador) */}
        <Scene measurements={measurements} design={shown} outfit={ghostOutfit} autoRotate={autoRotate} animate={false} showBody={false} pose="fantasma" stage="product" focus={template.family === 'head' ? 0.92 : outfit.length ? 0.5 : pants ? 0.3 : 0.66} />
        <div className="design-3d-bar">
          {/* Un gorro o una gorra se ve solo (en el Probador, con la ropa) */}
          {template.family !== 'head' && (
            <>
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
            </>
          )}
          {shown.hood && (
            <label className="toggle">
              <input type="checkbox" checked={hoodUp} onChange={(e) => setHoodUp(e.target.checked)} />
              Capucha puesta
            </label>
          )}
          {canOpen && (
            <>
              <label className="toggle">
                <input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} />
                Abierta
              </label>
              <label className="outfit-pick" title="Camiseta básica debajo de la prenda">
                <span>Debajo</span>
                <select value={teeColor} onChange={(e) => setTeeColor(e.target.value as TeeChoice)}>
                  {underChoices(kind === 'mujer').map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          <label className="toggle">
            <input type="checkbox" checked={autoRotate} onChange={(e) => setAutoRotate(e.target.checked)} />
            Girar 360°
          </label>
        </div>
        <p className="design-3d-note">
          {client && Object.keys(client.measurements).length ? `Medidas de ${client.name}` : kind === 'mujer' ? 'Medidas estándar de mujer' : 'Medidas estándar'}
          {!hasOwn3D(template) && ` · ${template.name}: forma 3D aproximada (algunos detalles solo se ven en 2D)`}
          {' · Arrastra para girar'}
        </p>
      </div>
    </div>
  )
}
