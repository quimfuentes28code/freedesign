import { mockupCanvas } from '../designer/exportFlat'
import { loadFont } from '../designer/fonts'
import { reshapePockets } from '../designer/pocketShape'
import { drawScale } from '../designer/measures'
import { garmentArt, Runtime, type GarmentArtViews } from './engine'
import type { DesignData } from '../shared/designs'
import type { Material } from '../shared/library'
import type { Body } from '../production/measurements'
import type { GarmentTemplate } from '../designer/types'

/**
 * Lo pintado en el lienzo de un diseño guardado (sin tenerlo abierto), para llevarlo al 3D del Probador: se cargan sus
 * capas, se dibuja fuera de pantalla cada vista de la prenda para saber dónde cae en el papel y se compone igual que
 * en el editor. Se guarda en memoria mientras el lienzo no cambie.
 */
const cache = new Map<string, Promise<GarmentArtViews>>()

export function savedGarmentArt(id: string, t: GarmentTemplate, data: DesignData, materials: Map<string, Material>, body: Body): Promise<GarmentArtViews> {
  const doc = data.canvas
  if (!doc) return Promise.resolve({})
  const key = `${id}|${JSON.stringify(doc)}|${JSON.stringify(data.pieces)}|${JSON.stringify(data.options)}`
  let p = cache.get(key)
  if (!p) {
    p = build(t, data, materials, body).catch(() => ({}))
    cache.set(key, p)
  }
  return p
}

async function build(t: GarmentTemplate, data: DesignData, materials: Map<string, Material>, body: Body): Promise<GarmentArtViews> {
  const doc = data.canvas!
  const painted = doc.layers.some((l) => l.visible && !l.role && l.kind !== 'mockup' && !(l.kind === 'image' && l.asset))
  if (!painted) return {}
  const r = new Runtime(doc.w, doc.h)
  await r.load(doc)
  await Promise.all(doc.layers.map((l) => (l.kind === 'text' ? loadFont(l.font) : null)))
  for (const l of doc.layers) {
    if (l.kind !== 'mockup' || l.template || !l.visible) continue
    const { box } = await mockupCanvas(t, data, materials, body, l.view, 'linea', 240)
    r.mockupInfo.set(l.id, { box, shapes: reshapePockets(t.draw(l.view, data.options, drawScale(t, data, body)), data) })
  }
  const color = (piece: string) => data.pieces[piece]?.color ?? t.pieces.find((p) => p.id === piece)?.defaultColor ?? '#cccccc'
  return garmentArt(r, doc, color)
}
