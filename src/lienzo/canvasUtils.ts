// Utilidades de dibujo del lienzo (sin React): mockups en línea, presión, deformar, estampados…

import { patternDefaults } from '../designer/morePatterns'
import { DEFAULT_SIZE, pieceTile } from '../designer/surfaces'
import { type CanvasDoc, type SurfaceKind, type LienzoAsset } from '../shared/designs'
import { BRUSHES, type BrushPreset } from './brushes'
import { defaultDoc } from './lienzoSettings'

/** Mockup en línea: la prenda en gris muy claro con su contorno negro (como un plano técnico listo para pintar). */
export function tintLine(c: HTMLCanvasElement) {
  const shape = document.createElement('canvas')
  shape.width = c.width
  shape.height = c.height
  shape.getContext('2d')!.drawImage(c, 0, 0)
  const g = c.getContext('2d')!
  g.globalCompositeOperation = 'multiply'
  g.fillStyle = '#ebebea'
  g.fillRect(0, 0, c.width, c.height)
  g.globalCompositeOperation = 'destination-in'
  g.drawImage(shape, 0, 0)
  g.globalCompositeOperation = 'source-over'
}

/** Lienzo de reserva mientras el diseño no tiene uno guardado (el mismo para el mismo diseño). */
export const fallbacks = new Map<string, CanvasDoc>()
export function fallback(id: string) {
  let d = fallbacks.get(id)
  if (!d) {
    d = defaultDoc()
    fallbacks.set(id, d)
  }
  return d
}

/** Presión del puntero: el ratón no tiene (0,5 al pulsar) y entonces se usa la del pincel al máximo. */
export function pressureOf(e: { pointerType: string; pressure: number }) {
  if (e.pointerType === 'mouse') return 1
  return e.pressure || 0.5
}

/** Caja de lo que hay pintado en un canvas (en px), o null si está vacío. Se mira en pequeño, rápido. */
export function paintedBox(c: HTMLCanvasElement): [number, number, number, number] | null {
  const k = 0.125
  const s = document.createElement('canvas')
  s.width = Math.ceil(c.width * k)
  s.height = Math.ceil(c.height * k)
  const g = s.getContext('2d', { willReadFrequently: true })!
  g.drawImage(c, 0, 0, s.width, s.height)
  const d = g.getImageData(0, 0, s.width, s.height).data
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
  for (let y = 0; y < s.height; y++)
    for (let x = 0; x < s.width; x++)
      if (d[(y * s.width + x) * 4 + 3]) {
        x0 = Math.min(x0, x)
        x1 = Math.max(x1, x)
        y0 = Math.min(y0, y)
        y1 = Math.max(y1, y)
      }
  if (!Number.isFinite(x0)) return null
  return [(x0 - 1) / k, (y0 - 1) / k, (x1 + 2) / k, (y1 + 2) / k]
}

/** Cuadrícula isométrica: líneas a 30° hacia los dos lados y verticales. */
export function isoGrid(size: number): React.CSSProperties {
  const c = 'rgba(61, 139, 253, 0.25)'
  const lines = (deg: number) => `repeating-linear-gradient(${deg}deg, ${c} 0 1px, transparent 1px ${size}px)`
  return { backgroundImage: [lines(150), lines(210), lines(90)].join(', ') }
}

/**
 * Pinta `img` deformado a las cuatro esquinas `c` (arriba izq., arriba der., abajo der., abajo izq.): se parte en una
 * rejilla de n × n trozos y cada uno se pinta como dos triángulos (cada triángulo con su transformación).
 */
export function warpDraw(g: CanvasRenderingContext2D, img: HTMLCanvasElement, c: [number, number][], n: number) {
  const W = img.width
  const H = img.height
  const at = (u: number, v: number): [number, number] => {
    const tx = c[0][0] + (c[1][0] - c[0][0]) * u
    const ty = c[0][1] + (c[1][1] - c[0][1]) * u
    const bx = c[3][0] + (c[2][0] - c[3][0]) * u
    const by = c[3][1] + (c[2][1] - c[3][1]) * u
    return [tx + (bx - tx) * v, ty + (by - ty) * v]
  }
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const u0 = i / n
      const u1 = (i + 1) / n
      const v0 = j / n
      const v1 = (j + 1) / n
      const s = [
        [u0 * W, v0 * H],
        [u1 * W, v0 * H],
        [u1 * W, v1 * H],
        [u0 * W, v1 * H],
      ] as [number, number][]
      const d = [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)]
      triangle(g, img, s[0], s[1], s[2], d[0], d[1], d[2])
      triangle(g, img, s[0], s[2], s[3], d[0], d[2], d[3])
    }
}
/** Un triángulo de la imagen (s0, s1, s2) pintado en (d0, d1, d2), un poco agrandado para que no se vean las juntas. */
export function triangle(g: CanvasRenderingContext2D, img: HTMLCanvasElement, s0: [number, number], s1: [number, number], s2: [number, number], d0: [number, number], d1: [number, number], d2: [number, number]) {
  const [x0, y0] = s0
  const [x1, y1] = s1
  const [x2, y2] = s2
  const [u0, v0] = d0
  const [u1, v1] = d1
  const [u2, v2] = d2
  const dx1 = x1 - x0
  const dy1 = y1 - y0
  const dx2 = x2 - x0
  const dy2 = y2 - y0
  const det = dx1 * dy2 - dx2 * dy1
  if (!det) return
  const du1 = u1 - u0
  const du2 = u2 - u0
  const dv1 = v1 - v0
  const dv2 = v2 - v0
  const a = (du1 * dy2 - du2 * dy1) / det
  const cc = (du2 * dx1 - du1 * dx2) / det
  const b = (dv1 * dy2 - dv2 * dy1) / det
  const d = (dv2 * dx1 - dv1 * dx2) / det
  const e = u0 - a * x0 - cc * y0
  const f = v0 - b * x0 - d * y0
  // Recorte del triángulo de destino, agrandado medio píxel desde su centro
  const mx = (u0 + u1 + u2) / 3
  const my = (v0 + v1 + v2) / 3
  const grow = (x: number, y: number): [number, number] => {
    const l = Math.hypot(x - mx, y - my) || 1
    return [x + ((x - mx) / l) * 0.6, y + ((y - my) / l) * 0.6]
  }
  g.save()
  g.beginPath()
  g.moveTo(...grow(u0, v0))
  g.lineTo(...grow(u1, v1))
  g.lineTo(...grow(u2, v2))
  g.closePath()
  g.clip()
  g.transform(a, b, cc, d, e, f)
  g.drawImage(img, 0, 0)
  g.restore()
}

/** Ajustes de partida de un pincel importado o hecho con una imagen. */
export const IMPORTED: LienzoAsset['settings'] = { size: 40, opacity: 1, flow: 0.85, spacing: 0.08, hardness: 1, grain: 0.8, pressureSize: 0.5, pressureOpacity: 0.3, taper: 0, streamline: 0.2, scatter: 0, orient: false }

/** Pincel propio (de la cuenta) como pincel del lienzo: parte de uno de la app y cambia lo que tiene guardado. */
export function assetBrush(a: LienzoAsset): BrushPreset {
  const s = a.settings
  const base = BRUSHES.find((b) => b.id === s.base) ?? BRUSHES.find((b) => b.id === 'redondo')!
  const n = (k: string, d: number) => (typeof s[k] === 'number' ? (s[k] as number) : d)
  return {
    ...base,
    id: `u:${a.id}`,
    name: a.name,
    group: 'Mis pinceles',
    size: n('size', base.size),
    opacity: n('opacity', base.opacity),
    flow: n('flow', base.flow),
    spacing: n('spacing', base.spacing),
    hardness: n('hardness', base.hardness),
    grain: n('grain', base.grain),
    pressureSize: n('pressureSize', base.pressureSize),
    pressureOpacity: n('pressureOpacity', base.pressureOpacity),
    taper: n('taper', base.taper),
    streamline: n('streamline', base.streamline),
    scatter: n('scatter', base.scatter),
    tip: a.file ? 'image' : base.tip,
    orient: s.orient === true,
    tipFile: a.file || undefined,
    grainFile: a.grain || undefined,
  }
}

/** Una imagen cargada como canvas (para la punta y el grano de los pinceles). */
export function canvasOf(img: HTMLImageElement) {
  const c = document.createElement('canvas')
  c.width = img.naturalWidth || img.width
  c.height = img.naturalHeight || img.height
  c.getContext('2d')!.drawImage(img, 0, 0)
  return c
}

/** Rellena lo pintado en el rectángulo con un estampado (el azulejo del Diseñador, a unos 10 px por cm del papel). */
export function fillWithPattern(g: CanvasRenderingContext2D, f: { x0: number; y0: number; x1: number; y1: number }, kind: string, base: string, colors?: [string, string], size?: number, pxPerCm = 10) {
  const d = patternDefaults(kind)
  const tile = pieceTile({ color: base, surface: { kind: kind as SurfaceKind, color2: colors?.[0] ?? d.c2, color3: colors?.[1] ?? d.c3, size: size || DEFAULT_SIZE[kind] || 4, angle: 0 } })
  if (!tile) return
  const pattern = g.createPattern(tile.canvas, 'repeat')
  if (!pattern) return
  pattern.setTransform(new DOMMatrix().scale((tile.cm * pxPerCm) / tile.canvas.width))
  g.save()
  g.globalCompositeOperation = 'source-in'
  g.fillStyle = pattern
  g.fillRect(f.x0, f.y0, f.x1 - f.x0, f.y1 - f.y0)
  g.restore()
}
