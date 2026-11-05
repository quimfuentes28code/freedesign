import type { DesignData } from '../shared/designs'
import { pocketBody, POCKET_SHAPE_PARAMS } from './details'
import type { Shape } from './types'

/**
 * Forma de los bolsillos de parche que trae la prenda base (traseros, de pecho, cargo…): la pieza de bolsillo guarda
 * su forma (`PieceStyle.shape`: fondo recto, en pico o redondo, profundidad del pico, esquinas y alto) y el cuerpo
 * de cada bolsillo marcado (`Shape.pocket`) se vuelve a dibujar en su mismo hueco, con su pespunte.
 */

const nums = (d: string) => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)

function box(d: string) {
  const v = nums(d)
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
  for (let i = 0; i + 1 < v.length; i += 2) {
    x0 = Math.min(x0, v[i])
    x1 = Math.max(x1, v[i])
    y0 = Math.min(y0, v[i + 1])
    y1 = Math.max(y1, v[i + 1])
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

const param = (shape: Record<string, number>, id: string) => shape[id] ?? POCKET_SHAPE_PARAMS.find((p) => p.id === id)!.def

export function reshapePockets(shapes: Shape[], data: Pick<DesignData, 'pieces'>): Shape[] {
  if (!shapes.some((s) => s.pocket && s.piece && data.pieces[s.piece]?.shape)) return shapes
  const out: Shape[] = []
  for (const s of shapes) {
    const shape = s.pocket && s.piece ? data.pieces[s.piece]?.shape : undefined
    if (!shape) {
      out.push(s)
      continue
    }
    const b = box(s.d)
    const h = b.h * param(shape, 'alto')
    const r = param(shape, 'esquinas') * b.w * 0.3
    const fondo = Math.round(param(shape, 'fondo'))
    const depth = param(shape, 'pico')
    out.push({ ...s, d: pocketBody(b.x, b.y, b.w, h, r, fondo, 0, depth) })
    out.push({ kind: 'stitch', piece: s.piece, d: pocketBody(b.x, b.y, b.w, h, r, fondo, 2.5, depth) })
  }
  return out
}
