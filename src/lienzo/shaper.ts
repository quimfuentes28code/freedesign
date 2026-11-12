/*
 * Asistente de dibujo del lienzo, como el de Illustrator:
 * - Shaper: un trazo a mano alzada se convierte en la forma perfecta (línea, triángulo, rectángulo, cuadrado, círculo
 *   o elipse); un garabato encima borra lo que tapa.
 * - Guías inteligentes: los puntos de la forma se enganchan a los de otras formas, al centro del papel y al eje de las
 *   prendas (alineados en horizontal o vertical), las líneas a ángulos de 45° y los rectángulos y elipses casi
 *   iguales de lado a cuadrados y círculos. Devuelven las guías que hay que enseñar.
 * - Curvatura: curva suave (Catmull-Rom) que pasa por los puntos que se van poniendo.
 * Todo en coordenadas del papel (px del lienzo).
 */

export type P = [number, number]

/** Guía que se enseña un momento: una línea de (x1, y1) a (x2, y2). */
export type Guide = [number, number, number, number]

export interface Shaped {
  /** La forma como polilínea densa (x, y, x, y…), para pasarla con el pincel. */
  shape: number[]
  label: string
  /** Puntos de la forma para engancharse después (esquinas, extremos, centro). */
  keys: P[]
  guides: Guide[]
}

export interface SnapContext {
  /** Puntos a los que engancharse (de otras formas, centro del papel, ejes de prendas). */
  keys: P[]
  /** Distancia de enganche (px del papel). */
  near: number
  w: number
  h: number
}

/** Engancha un punto a otro cercano o a su misma horizontal o vertical; devuelve las guías que lo explican. */
export function snapPoint(p: P, c: SnapContext): { p: P; guides: Guide[] } {
  let [x, y] = p
  const guides: Guide[] = []
  let bx: P | null = null
  let by: P | null = null
  for (const k of c.keys) {
    if (Math.abs(k[0] - x) < c.near && (!bx || Math.abs(k[0] - p[0]) < Math.abs(bx[0] - p[0]))) bx = k
    if (Math.abs(k[1] - y) < c.near && (!by || Math.abs(k[1] - p[1]) < Math.abs(by[1] - p[1]))) by = k
  }
  if (bx) {
    x = bx[0]
    guides.push([x, Math.min(bx[1], y) - 40, x, Math.max(bx[1], y) + 40])
  }
  if (by) {
    y = by[1]
    guides.push([Math.min(by[0], x) - 40, y, Math.max(by[0], x) + 40, y])
  }
  return { p: [x, y], guides }
}

const line = (out: number[], a: P, b: P) => {
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 3))
  for (let i = out.length ? 1 : 0; i <= n; i++) out.push(a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n)
}

const polygon = (corners: P[]) => {
  const out: number[] = []
  for (let i = 0; i < corners.length; i++) line(out, corners[i], corners[(i + 1) % corners.length])
  return out
}

/** Reconoce la forma de un trazo (x, y, x, y…) y la devuelve perfecta y enganchada; null si es muy pequeño. */
export function recognize(pts: number[], c: SnapContext): Shaped | null {
  const P: P[] = []
  for (let i = 0; i < pts.length; i += 2) P.push([pts[i], pts[i + 1]])
  if (P.length < 4) return null
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const [x, y] of P) (x0 = Math.min(x0, x)), (x1 = Math.max(x1, x)), (y0 = Math.min(y0, y)), (y1 = Math.max(y1, y))
  const diag = Math.hypot(x1 - x0, y1 - y0)
  if (diag < 12) return null
  const first = P[0]
  const last = P[P.length - 1]
  const closed = Math.hypot(last[0] - first[0], last[1] - first[1]) < Math.max(20, diag * 0.25)

  // Línea: extremos enganchados y ángulo a múltiplos de 45° si está cerca
  if (!closed) {
    const a = snapPoint(first, c)
    let b = snapPoint(last, c)
    const ang = Math.atan2(b.p[1] - a.p[1], b.p[0] - a.p[0])
    const step = Math.PI / 4
    const near = Math.round(ang / step) * step
    const guides = [...a.guides]
    if (Math.abs(ang - near) < (5 * Math.PI) / 180) {
      const len = Math.hypot(b.p[0] - a.p[0], b.p[1] - a.p[1])
      b = { p: [a.p[0] + Math.cos(near) * len, a.p[1] + Math.sin(near) * len], guides: [] }
      const deg = Math.round(((((near * 180) / Math.PI) % 360) + 360) % 360)
      guides.push([a.p[0], a.p[1], b.p[0], b.p[1]])
      const out: number[] = []
      line(out, a.p, b.p)
      return { shape: out, label: `Línea · ${deg % 180}°`, keys: [a.p, b.p, [(a.p[0] + b.p[0]) / 2, (a.p[1] + b.p[1]) / 2]], guides }
    }
    guides.push(...b.guides)
    const out: number[] = []
    line(out, a.p, b.p)
    return { shape: out, label: 'Línea recta', keys: [a.p, b.p, [(a.p[0] + b.p[0]) / 2, (a.p[1] + b.p[1]) / 2]], guides }
  }

  // Cerrada: esquinas (Douglas–Peucker sobre la vuelta) para saber si es un triángulo
  const corners = cornersOf(P, diag * 0.09)
  if (corners.length === 3) {
    const snapped = corners.map((k) => snapPoint(k, c))
    const tri = snapped.map((s) => s.p)
    const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3
    const cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3
    return { shape: polygon(tri), label: 'Triángulo', keys: [...tri, [cx, cy]], guides: snapped.flatMap((s) => s.guides) }
  }

  // Rectángulo o elipse: el que mejor se ajusta al trazo
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const rx = Math.max(1, (x1 - x0) / 2)
  const ry = Math.max(1, (y1 - y0) / 2)
  let eErr = 0
  let rErr = 0
  for (const [x, y] of P) {
    const nx = (x - cx) / rx
    const ny = (y - cy) / ry
    eErr += Math.abs(Math.hypot(nx, ny) - 1)
    rErr += Math.min(Math.abs(Math.abs(nx) - 1), Math.abs(Math.abs(ny) - 1))
  }
  const square = Math.abs(rx - ry) / Math.max(rx, ry) < 0.12
  if (rErr < eErr * 0.8) {
    // Esquinas enganchadas (arriba a la izquierda y abajo a la derecha)
    const a = snapPoint([x0, y0], c)
    const b = snapPoint([x1, y1], c)
    let [ax, ay] = a.p
    let [bx, by] = b.p
    if (square) {
      const s = (Math.abs(bx - ax) + Math.abs(by - ay)) / 2
      bx = ax + s
      by = ay + s
    }
    const rect: P[] = [
      [ax, ay],
      [bx, ay],
      [bx, by],
      [ax, by],
    ]
    return { shape: polygon(rect), label: square ? 'Cuadrado' : 'Rectángulo', keys: [...rect, [(ax + bx) / 2, (ay + by) / 2]], guides: [...a.guides, ...b.guides] }
  }
  const center = snapPoint([cx, cy], c)
  const [ox, oy] = center.p
  const r = square ? (rx + ry) / 2 : 0
  const ex = square ? r : rx
  const ey = square ? r : ry
  const out: number[] = []
  const n = Math.max(48, Math.ceil((Math.PI * (ex + ey)) / 3))
  for (let i = 0; i <= n; i++) {
    const t = -Math.PI / 2 + (i / n) * Math.PI * 2
    out.push(ox + Math.cos(t) * ex, oy + Math.sin(t) * ey)
  }
  return {
    shape: out,
    label: square ? 'Círculo' : 'Elipse',
    keys: [
      [ox, oy],
      [ox, oy - ey],
      [ox, oy + ey],
      [ox - ex, oy],
      [ox + ex, oy],
    ],
    guides: center.guides,
  }
}

/** Esquinas de una vuelta cerrada (Douglas–Peucker partiendo por los dos puntos más alejados). */
function cornersOf(P: P[], tol: number): P[] {
  let far = 0
  let fd = -1
  for (let i = 1; i < P.length; i++) {
    const d = (P[i][0] - P[0][0]) ** 2 + (P[i][1] - P[0][1]) ** 2
    if (d > fd) (fd = d), (far = i)
  }
  const a = dp(P.slice(0, far + 1), tol)
  const b = dp([...P.slice(far), P[0]], tol)
  const out = [...a.slice(0, -1), ...b.slice(0, -1)]
  // Quita las esquinas casi rectas (un lado partido en dos)
  return out.filter((p, i) => {
    const q = out[(i - 1 + out.length) % out.length]
    const r = out[(i + 1) % out.length]
    const v1 = [p[0] - q[0], p[1] - q[1]]
    const v2 = [r[0] - p[0], r[1] - p[1]]
    const cos = (v1[0] * v2[0] + v1[1] * v2[1]) / ((Math.hypot(v1[0], v1[1]) || 1) * (Math.hypot(v2[0], v2[1]) || 1))
    return cos < 0.9
  })
}

function dp(pts: P[], tol: number): P[] {
  if (pts.length < 3) return pts
  const a = pts[0]
  const b = pts[pts.length - 1]
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
  let idx = 0
  let max = 0
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((b[0] - a[0]) * (a[1] - pts[i][1]) - (a[0] - pts[i][0]) * (b[1] - a[1])) / len
    if (d > max) (max = d), (idx = i)
  }
  if (max <= tol) return [a, b]
  return [...dp(pts.slice(0, idx + 1), tol).slice(0, -1), ...dp(pts.slice(idx), tol)]
}

/** ¿El trazo es un garabato (un zigzag de ida y vuelta)? Entonces borra en vez de dibujar. */
export function isScribble(pts: number[]) {
  if (pts.length < 24) return false
  let travel = 0
  let turns = 0
  let prev: P | null = null
  let x0 = Infinity
  let x1 = -Infinity
  let y0 = Infinity
  let y1 = -Infinity
  for (let i = 2; i < pts.length; i += 2) {
    const d: P = [pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]]
    const l = Math.hypot(d[0], d[1])
    travel += l
    x0 = Math.min(x0, pts[i])
    x1 = Math.max(x1, pts[i])
    y0 = Math.min(y0, pts[i + 1])
    y1 = Math.max(y1, pts[i + 1])
    if (l < 2) continue
    if (prev && (prev[0] * d[0] + prev[1] * d[1]) / (Math.hypot(prev[0], prev[1]) * l) < -0.5) turns++
    prev = d
  }
  const diag = Math.hypot(x1 - x0, y1 - y0)
  return turns >= 4 && travel > diag * 3
}

/** Envolvente convexa de los puntos (la zona que tapa un garabato). */
export function hull(pts: number[]): P[] {
  const P: P[] = []
  for (let i = 0; i < pts.length; i += 2) P.push([pts[i], pts[i + 1]])
  P.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (o: P, a: P, b: P) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: P[] = []
  for (const p of P) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: P[] = []
  for (const p of [...P].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

/** Curva suave que pasa por los puntos (Catmull-Rom), como polilínea densa; cerrada si se pide. */
export function curveThrough(points: P[], closed: boolean): number[] {
  const out: number[] = []
  const n = points.length
  if (n < 2) return out
  const at = (i: number) => (closed ? points[(i + n) % n] : points[Math.max(0, Math.min(n - 1, i))])
  const segs = closed ? n : n - 1
  for (let i = 0; i < segs; i++) {
    const p0 = at(i - 1)
    const p1 = at(i)
    const p2 = at(i + 1)
    const p3 = at(i + 2)
    const steps = Math.max(4, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 3))
    for (let s = i === 0 ? 0 : 1; s <= steps; s++) {
      const t = s / steps
      const t2 = t * t
      const t3 = t2 * t
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
      out.push(f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1]))
    }
  }
  return out
}

/** Camino SVG de la curva (para la vista previa). */
export function curvePath(points: P[], closed: boolean) {
  const pts = curveThrough(points, closed)
  if (pts.length < 4) return ''
  let d = `M${pts[0]} ${pts[1]}`
  for (let i = 2; i < pts.length; i += 2) d += `L${pts[i]} ${pts[i + 1]}`
  return closed ? d + 'Z' : d
}
