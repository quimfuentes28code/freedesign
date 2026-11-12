/**
 * Trazados vectoriales del lienzo (capas `vector`, como en Illustrator): dibujo con curvas Bézier, detección de qué hay
 * bajo el puntero y formas (rectángulo, elipse, polígono, estrella, línea). Sin React: lo usan el motor (`drawLayer`,
 * para componer y exportar) y las herramientas (`VectorTools.tsx`).
 */
import type { VectorLayer, VNode, VPath } from '../shared/designs'

export type Pt = [number, number]

/** Manejador de salida de un punto (o el propio ancla si no tiene). */
const outOf = (n: VNode): Pt => n.ho ?? [n.x, n.y]
const inOf = (n: VNode): Pt => n.hi ?? [n.x, n.y]

/** Recorre los segmentos del trazado (de a hacia b) llamando a `seg` con los cuatro puntos de la curva. */
function eachSegment(p: VPath, seg: (a: VNode, c1: Pt, c2: Pt, b: VNode) => void) {
  const n = p.nodes.length
  const count = p.closed ? n : n - 1
  for (let i = 0; i < count; i++) {
    const a = p.nodes[i]
    const b = p.nodes[(i + 1) % n]
    seg(a, outOf(a), inOf(b), b)
  }
}

export function pathD(p: VPath): string {
  if (!p.nodes.length) return ''
  const f = (v: number) => Math.round(v * 100) / 100
  let d = `M${f(p.nodes[0].x)} ${f(p.nodes[0].y)}`
  eachSegment(p, (_a, c1, c2, b) => {
    d += ` C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(b.x)} ${f(b.y)}`
  })
  return p.closed ? d + ' Z' : d
}

export function pathOf(p: VPath): Path2D {
  return new Path2D(pathD(p))
}

/** Pespunte: rayas de 3 grosores con huecos de 2 (mínimo visible a cualquier grosor). */
export function dashOf(p: VPath): number[] {
  const w = Math.max(1, p.width)
  return [w * 3, w * 2]
}

/** Pinta los trazados de una capa (la capa ya trae su opacidad y fusión desde quien llama). */
export function drawVector(g: CanvasRenderingContext2D, l: VectorLayer) {
  for (const p of l.paths) {
    if (p.nodes.length < 2) continue
    const path = pathOf(p)
    g.save()
    g.globalAlpha *= p.opacity ?? 1
    if (p.fill && p.closed) {
      g.fillStyle = p.fill
      g.fill(path)
    }
    if (p.stroke && p.width > 0) {
      g.strokeStyle = p.stroke
      g.lineWidth = p.width
      g.lineCap = p.round ? 'round' : 'butt'
      g.lineJoin = p.round ? 'round' : 'miter'
      if (p.dash) g.setLineDash(dashOf(p))
      g.stroke(path)
    }
    g.restore()
  }
}

let probe: CanvasRenderingContext2D | null = null
const probeCtx = () => (probe ??= document.createElement('canvas').getContext('2d')!)

/** ¿El punto toca el trazado (su relleno o su trazo, con una tolerancia en px del lienzo)? */
export function hitPath(p: VPath, x: number, y: number, tol: number): boolean {
  if (p.nodes.length < 2) return false
  const g = probeCtx()
  const path = pathOf(p)
  if (p.closed && p.fill && g.isPointInPath(path, x, y)) return true
  g.lineWidth = Math.max(p.width, tol * 2)
  g.lineCap = 'round'
  g.lineJoin = 'round'
  return g.isPointInStroke(path, x, y)
}

/** Caja que ocupa el trazado (con sus manejadores). */
export function boundsOf(paths: VPath[]) {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const p of paths)
    for (const n of p.nodes)
      for (const [x, y] of [[n.x, n.y], n.hi, n.ho].filter(Boolean) as Pt[]) {
        x0 = Math.min(x0, x)
        y0 = Math.min(y0, y)
        x1 = Math.max(x1, x)
        y1 = Math.max(y1, y)
      }
  return { x0, y0, x1, y1 }
}

/** Mueve todos los puntos (con sus manejadores). */
export function translatePath(p: VPath, dx: number, dy: number): VPath {
  const m = (h?: Pt): Pt | undefined => (h ? [h[0] + dx, h[1] + dy] : undefined)
  return { ...p, nodes: p.nodes.map((n) => clean({ x: n.x + dx, y: n.y + dy, hi: m(n.hi), ho: m(n.ho) })) }
}

/** Aplica una transformación (x, y) → (x', y') a todos los puntos y manejadores (voltear, girar, escalar). */
export function mapPath(p: VPath, f: (x: number, y: number) => Pt): VPath {
  const m = (h?: Pt) => (h ? f(h[0], h[1]) : undefined)
  return {
    ...p,
    nodes: p.nodes.map((n) => {
      const [x, y] = f(n.x, n.y)
      return clean({ x, y, hi: m(n.hi), ho: m(n.ho) })
    }),
  }
}

/** Quita los manejadores vacíos (para no guardar `undefined`). */
export function clean(n: VNode): VNode {
  const out: VNode = { x: n.x, y: n.y }
  if (n.hi) out.hi = n.hi
  if (n.ho) out.ho = n.ho
  return out
}

/** Punto suave ↔ de esquina (doble toque en un ancla con la Selección directa). */
export function toggleSmooth(p: VPath, i: number): VPath {
  const n = p.nodes[i]
  const nodes = [...p.nodes]
  if (n.hi || n.ho) nodes[i] = { x: n.x, y: n.y }
  else {
    // Manejadores paralelos a la línea entre los puntos vecinos, a un tercio de cada distancia
    const len = p.nodes.length
    const prev = p.nodes[(i - 1 + len) % len]
    const next = p.nodes[(i + 1) % len]
    const hasPrev = p.closed || i > 0
    const hasNext = p.closed || i < len - 1
    const a = hasPrev ? prev : n
    const b = hasNext ? next : n
    let dx = b.x - a.x
    let dy = b.y - a.y
    const d = Math.hypot(dx, dy) || 1
    dx /= d
    dy /= d
    const lp = hasPrev ? Math.hypot(n.x - prev.x, n.y - prev.y) / 3 : 0
    const ln = hasNext ? Math.hypot(next.x - n.x, next.y - n.y) / 3 : 0
    nodes[i] = clean({ x: n.x, y: n.y, hi: lp ? [n.x - dx * lp, n.y - dy * lp] : undefined, ho: ln ? [n.x + dx * ln, n.y + dy * ln] : undefined })
  }
  return { ...p, nodes }
}

export type ShapeKind = 'rect' | 'ellipse' | 'polygon' | 'star' | 'line'
export const SHAPE_KINDS: { id: ShapeKind; label: string }[] = [
  { id: 'rect', label: 'Rectángulo' },
  { id: 'ellipse', label: 'Elipse' },
  { id: 'polygon', label: 'Polígono' },
  { id: 'star', label: 'Estrella' },
  { id: 'line', label: 'Línea' },
]

/** Kappa: largo de los manejadores para que cuatro curvas formen un círculo. */
const K = 0.5522847

/**
 * Puntos de una forma arrastrada de `a` a `b`. Con `square` (Mayús): cuadrado, círculo o regular; en la línea, cada
 * 45°. Polígono de 6 lados y estrella de 5 puntas, inscritos en la caja.
 */
export function shapeNodes(kind: ShapeKind, a: Pt, b: Pt, square: boolean, sides = 6): { nodes: VNode[]; closed: boolean } {
  if (kind === 'line') {
    let [x, y] = b
    if (square) {
      const ang = Math.round(Math.atan2(y - a[1], x - a[0]) / (Math.PI / 4)) * (Math.PI / 4)
      const d = Math.hypot(x - a[0], y - a[1])
      x = a[0] + Math.cos(ang) * d
      y = a[1] + Math.sin(ang) * d
    }
    return { nodes: [{ x: a[0], y: a[1] }, { x, y }], closed: false }
  }
  let w = b[0] - a[0]
  let h = b[1] - a[1]
  if (square) {
    const m = Math.max(Math.abs(w), Math.abs(h))
    w = Math.sign(w || 1) * m
    h = Math.sign(h || 1) * m
  }
  const x0 = Math.min(a[0], a[0] + w)
  const y0 = Math.min(a[1], a[1] + h)
  const W = Math.abs(w)
  const H = Math.abs(h)
  const cx = x0 + W / 2
  const cy = y0 + H / 2
  if (kind === 'rect')
    return { nodes: [{ x: x0, y: y0 }, { x: x0 + W, y: y0 }, { x: x0 + W, y: y0 + H }, { x: x0, y: y0 + H }], closed: true }
  if (kind === 'ellipse') {
    const rx = W / 2
    const ry = H / 2
    return {
      closed: true,
      nodes: [
        { x: cx, y: y0, hi: [cx - rx * K, y0], ho: [cx + rx * K, y0] },
        { x: x0 + W, y: cy, hi: [x0 + W, cy - ry * K], ho: [x0 + W, cy + ry * K] },
        { x: cx, y: y0 + H, hi: [cx + rx * K, y0 + H], ho: [cx - rx * K, y0 + H] },
        { x: x0, y: cy, hi: [x0, cy + ry * K], ho: [x0, cy - ry * K] },
      ],
    }
  }
  const points = kind === 'star' ? 5 : sides
  const count = kind === 'star' ? points * 2 : points
  const nodes: VNode[] = []
  for (let i = 0; i < count; i++) {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / count
    const k = kind === 'star' && i % 2 ? 0.45 : 1
    nodes.push({ x: cx + (Math.cos(ang) * W * k) / 2, y: cy + (Math.sin(ang) * H * k) / 2 })
  }
  return { nodes, closed: true }
}
