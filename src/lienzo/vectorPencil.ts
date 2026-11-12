/**
 * Lápiz vectorial (como el Lápiz de Illustrator): convierte un trazo a mano alzada en curvas Bézier limpias y editables.
 * Sin React ni dependencias. Tres fases, separadas:
 *
 * 1. Captura en tiempo real (`OneEuro2D`): filtro adaptativo «One Euro». Quita el temblor del ratón o del trackpad
 *    cuando el trazo va despacio y casi no frena cuando va rápido (sin retraso perceptible).
 * 2. Al soltar (`fitPencil`, con los puntos reales: el filtro va un poco por detrás y redondearía las esquinas): quita
 *    puntos repetidos, simplifica con Ramer-Douglas-Peucker (`rdp`) para encontrar las
 *    esquinas de verdad (cambios bruscos de dirección), y entre esquina y esquina ajusta curvas Bézier cúbicas con el
 *    método de Schneider (mínimos cuadrados + Newton-Raphson, partiendo la curva donde el error es mayor). Las esquinas
 *    quedan como puntos de esquina y las uniones dentro de cada tramo como puntos suaves (manejadores alineados).
 * 3. Corrección al terminar (opcional): antes del ajuste, una media móvil por tramos (nunca a través de una esquina) y
 *    más pasadas de reajuste, para un resultado más limpio sin cambiar la forma.
 *
 * Todas las tolerancias van en píxeles de pantalla divididos por el zoom: el lápiz se comporta igual acerque o no.
 */
import type { VNode } from '../shared/designs'

type Pt = [number, number]

export type PencilPrecision = 'baja' | 'media' | 'alta'
export interface PencilSettings {
  /** Suavizado automático (apagado = dibujo libre, como el 0 %). */
  auto: boolean
  /** Nivel de suavizado, 0 a 1. */
  level: number
  /** Baja: prioriza la fluidez; alta: conserva los detalles pequeños. */
  precision: PencilPrecision
  /** Refinamiento adicional al levantar el lápiz. */
  finish: boolean
}
export const DEFAULT_PENCIL: PencilSettings = { auto: true, level: 0.6, precision: 'media', finish: true }

/** Cuánto se permite alejarse del trazo y a partir de qué giro hay esquina, según la precisión. */
const PRECISION: Record<PencilPrecision, { err: number; corner: number }> = {
  baja: { err: 1.6, corner: 78 },
  media: { err: 1, corner: 62 },
  alta: { err: 0.55, corner: 46 },
}

// --- 1. Filtro en tiempo real ---

class LowPass {
  private y: number | null = null
  filter(x: number, a: number) {
    this.y = this.y === null ? x : a * x + (1 - a) * this.y
    return this.y
  }
  get last() {
    return this.y
  }
}

const alpha = (cutoff: number, dt: number) => {
  const tau = 1 / (2 * Math.PI * cutoff)
  return 1 / (1 + tau / dt)
}

/**
 * Filtro «One Euro» en dos dimensiones (Casiez, Roussel y Vogel, 2012): la frecuencia de corte sube con la velocidad,
 * así suaviza mucho despacio (temblor) y poco deprisa (sin arrastrar el trazo detrás del puntero).
 */
export class OneEuro2D {
  private x = new LowPass()
  private y = new LowPass()
  private dx = new LowPass()
  private dy = new LowPass()
  private t: number | null = null
  constructor(
    private minCutoff: number,
    private beta: number,
    private dCutoff = 1,
  ) {}
  filter(px: number, py: number, tMs: number): Pt {
    const prevT = this.t
    this.t = tMs
    if (prevT === null || this.x.last === null || this.y.last === null) {
      this.x.filter(px, 1)
      this.y.filter(py, 1)
      return [px, py]
    }
    const dt = Math.max(1 / 240, (tMs - prevT) / 1000)
    const ad = alpha(this.dCutoff, dt)
    const vx = this.dx.filter((px - this.x.last) / dt, ad)
    const vy = this.dy.filter((py - this.y.last) / dt, ad)
    const speed = Math.hypot(vx, vy)
    const a = alpha(this.minCutoff + this.beta * speed, dt)
    return [this.x.filter(px, a), this.y.filter(py, a)]
  }
}

/** Filtro para un trazo nuevo (o null si se dibuja libre). `scale` es el zoom (px de pantalla por px del lienzo). */
export function liveFilter(s: PencilSettings, scale: number): OneEuro2D | null {
  const level = s.auto ? s.level : 0
  if (level <= 0.001) return null
  // Corte mínimo: de 9 Hz (casi nada) a 0,45 Hz (muy suave); la velocidad va en px de pantalla por segundo
  const minCutoff = 9 * Math.pow(0.05, level)
  return new OneEuro2D(minCutoff, 0.004 * scale)
}

// --- 2. Simplificación (Ramer-Douglas-Peucker, sin recursión para trazos de miles de puntos) ---

function segDist(p: Pt, a: Pt, b: Pt) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l2 = dx * dx + dy * dy
  if (!l2) return Math.hypot(p[0] - a[0], p[1] - a[1])
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2))
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
}

/** Índices de los puntos que quedan tras simplificar con tolerancia `tol`. */
export function rdp(pts: Pt[], tol: number): number[] {
  const n = pts.length
  if (n < 3) return pts.map((_, i) => i)
  const keep = new Uint8Array(n)
  keep[0] = keep[n - 1] = 1
  const stack: [number, number][] = [[0, n - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    let best = -1
    let dmax = tol
    for (let i = a + 1; i < b; i++) {
      const d = segDist(pts[i], pts[a], pts[b])
      if (d > dmax) {
        dmax = d
        best = i
      }
    }
    if (best >= 0) {
      keep[best] = 1
      stack.push([a, best], [best, b])
    }
  }
  const out: number[] = []
  for (let i = 0; i < n; i++) if (keep[i]) out.push(i)
  return out
}

// --- 3. Ajuste a curvas Bézier (Schneider, «An Algorithm for Automatically Fitting Digitized Curves», 1990) ---

type Bez = [Pt, Pt, Pt, Pt]
const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]]
const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]]
const mul = (a: Pt, k: number): Pt => [a[0] * k, a[1] * k]
const dot = (a: Pt, b: Pt) => a[0] * b[0] + a[1] * b[1]
const len = (a: Pt) => Math.hypot(a[0], a[1])
const norm = (a: Pt): Pt => {
  const l = len(a) || 1
  return [a[0] / l, a[1] / l]
}

function bez(b: Bez, t: number): Pt {
  const u = 1 - t
  return [
    u * u * u * b[0][0] + 3 * u * u * t * b[1][0] + 3 * u * t * t * b[2][0] + t * t * t * b[3][0],
    u * u * u * b[0][1] + 3 * u * u * t * b[1][1] + 3 * u * t * t * b[2][1] + t * t * t * b[3][1],
  ]
}
function bezD1(b: Bez, t: number): Pt {
  const u = 1 - t
  return [
    3 * (u * u * (b[1][0] - b[0][0]) + 2 * u * t * (b[2][0] - b[1][0]) + t * t * (b[3][0] - b[2][0])),
    3 * (u * u * (b[1][1] - b[0][1]) + 2 * u * t * (b[2][1] - b[1][1]) + t * t * (b[3][1] - b[2][1])),
  ]
}
function bezD2(b: Bez, t: number): Pt {
  const u = 1 - t
  return [6 * (u * (b[2][0] - 2 * b[1][0] + b[0][0]) + t * (b[3][0] - 2 * b[2][0] + b[1][0])), 6 * (u * (b[2][1] - 2 * b[1][1] + b[0][1]) + t * (b[3][1] - 2 * b[2][1] + b[1][1]))]
}

function chordParams(d: Pt[], first: number, last: number): number[] {
  const u = [0]
  for (let i = first + 1; i <= last; i++) u.push(u[u.length - 1] + len(sub(d[i], d[i - 1])))
  const total = u[u.length - 1] || 1
  return u.map((v) => v / total)
}

function generateBezier(d: Pt[], first: number, last: number, u: number[], t1: Pt, t2: Pt): Bez {
  const p0 = d[first]
  const p3 = d[last]
  const C = [
    [0, 0],
    [0, 0],
  ]
  const X = [0, 0]
  for (let i = 0; i < u.length; i++) {
    const t = u[i]
    const s = 1 - t
    const a1 = mul(t1, 3 * s * s * t)
    const a2 = mul(t2, 3 * s * t * t)
    C[0][0] += dot(a1, a1)
    C[0][1] += dot(a1, a2)
    C[1][1] += dot(a2, a2)
    const tmp = sub(d[first + i], add(mul(p0, s * s * s + 3 * s * s * t), mul(p3, 3 * s * t * t + t * t * t)))
    X[0] += dot(a1, tmp)
    X[1] += dot(a2, tmp)
  }
  C[1][0] = C[0][1]
  const det = C[0][0] * C[1][1] - C[1][0] * C[0][1]
  let alphaL = det ? (X[0] * C[1][1] - X[1] * C[0][1]) / det : 0
  let alphaR = det ? (C[0][0] * X[1] - C[1][0] * X[0]) / det : 0
  const segLen = len(sub(p3, p0))
  const eps = 1e-6 * segLen
  // Si la solución no vale (manejadores hacia atrás o casi nulos), la aproximación de Wu y Barsky: un tercio
  if (alphaL < eps || alphaR < eps) alphaL = alphaR = segLen / 3
  return [p0, add(p0, mul(t1, alphaL)), add(p3, mul(t2, alphaR)), p3]
}

function maxError(d: Pt[], first: number, last: number, b: Bez, u: number[]) {
  let max = 0
  let split = Math.floor((first + last) / 2)
  for (let i = first + 1; i < last; i++) {
    const p = bez(b, u[i - first])
    const e = (p[0] - d[i][0]) ** 2 + (p[1] - d[i][1]) ** 2
    if (e >= max) {
      max = e
      split = i
    }
  }
  return { max, split }
}

function reparameterize(d: Pt[], first: number, b: Bez, u: number[]) {
  return u.map((t, i) => {
    const p = d[first + i]
    const q = sub(bez(b, t), p)
    const q1 = bezD1(b, t)
    const q2 = bezD2(b, t)
    const den = dot(q1, q1) + dot(q, q2)
    const nt = den ? t - dot(q, q1) / den : t
    return Math.max(0, Math.min(1, nt))
  })
}

function fitCubic(d: Pt[], first: number, last: number, t1: Pt, t2: Pt, err: number, iterations: number, out: Bez[], depth = 0) {
  if (last - first === 1) {
    const dist = len(sub(d[last], d[first])) / 3
    out.push([d[first], add(d[first], mul(t1, dist)), add(d[last], mul(t2, dist)), d[last]])
    return
  }
  let u = chordParams(d, first, last)
  let b = generateBezier(d, first, last, u, t1, t2)
  let { max, split } = maxError(d, first, last, b, u)
  const err2 = err * err
  if (max < err2) {
    out.push(b)
    return
  }
  // Cerca: se reajusta el parámetro de cada punto unas cuantas veces antes de partir la curva
  if (max < err2 * 4) {
    for (let i = 0; i < iterations; i++) {
      u = reparameterize(d, first, b, u)
      b = generateBezier(d, first, last, u, t1, t2)
      ;({ max, split } = maxError(d, first, last, b, u))
      if (max < err2) {
        out.push(b)
        return
      }
    }
  }
  if (depth > 40) {
    out.push(b)
    return
  }
  // Se parte por el punto de más error, con la tangente media allí (así la unión queda suave)
  const center = norm(sub(d[split - 1], d[split + 1]))
  fitCubic(d, first, split, t1, center, err, iterations, out, depth + 1)
  fitCubic(d, split, last, mul(center, -1), t2, err, iterations, out, depth + 1)
}

/** Tangente en un extremo, mirando unos cuantos puntos (más estable que solo el vecino). */
function endTangent(d: Pt[], from: number, dir: 1 | -1, reach: number): Pt {
  const p = d[from]
  let i = from + dir
  let q = d[i] ?? p
  while (d[i + dir] !== undefined && len(sub(d[i], p)) < reach) {
    i += dir
    q = d[i]
  }
  const t = sub(q, p)
  return len(t) ? norm(t) : [dir, 0]
}

/** Media móvil (los extremos no se mueven). */
function smoothRun(d: Pt[], window: number): Pt[] {
  if (window < 1 || d.length < 3) return d
  const out: Pt[] = [d[0]]
  for (let i = 1; i < d.length - 1; i++) {
    const w = Math.min(window, i, d.length - 1 - i)
    let x = 0
    let y = 0
    for (let k = -w; k <= w; k++) {
      x += d[i + k][0]
      y += d[i + k][1]
    }
    out.push([x / (2 * w + 1), y / (2 * w + 1)])
  }
  out.push(d[d.length - 1])
  return out
}

/** Reparte los puntos a una distancia parecida (los muy juntos de un trazo lento no pesan más en el ajuste). */
function resample(d: Pt[], step: number): Pt[] {
  if (d.length < 3) return d
  const out: Pt[] = [d[0]]
  let acc = 0
  for (let i = 1; i < d.length; i++) {
    acc += len(sub(d[i], d[i - 1]))
    if (acc >= step || i === d.length - 1) {
      out.push(d[i])
      acc = 0
    }
  }
  return out
}

/** Junta las curvas en puntos del lienzo: los extremos de tramo son esquinas, las uniones de dentro son suaves. */
function toNodes(curves: Bez[], minHandle: number): VNode[] {
  const nodes: VNode[] = []
  const h = (anchor: Pt, c: Pt): [number, number] | undefined => (len(sub(c, anchor)) > minHandle ? [c[0], c[1]] : undefined)
  curves.forEach((c, i) => {
    if (i === 0) nodes.push({ x: c[0][0], y: c[0][1] })
    const prev = nodes[nodes.length - 1]
    const ho = h(c[0], c[1])
    if (ho) prev.ho = ho
    const node: VNode = { x: c[3][0], y: c[3][1] }
    const hi = h(c[3], c[2])
    if (hi) node.hi = hi
    nodes.push(node)
  })
  return nodes
}

/**
 * Convierte los puntos reales de un trazo en un trazado vectorial. `scale`: zoom del lienzo.
 * Si el final cae cerca del principio en un trazo largo, el trazado se cierra.
 */
export function fitPencil(raw: Pt[], s: PencilSettings, scale: number): { nodes: VNode[]; closed: boolean } {
  const px = 1 / scale
  // Puntos repetidos fuera
  const pts: Pt[] = []
  for (const p of raw) if (!pts.length || len(sub(p, pts[pts.length - 1])) > 0.3 * px) pts.push(p)
  if (pts.length < 2) {
    const [x, y] = raw[0] ?? [0, 0]
    return { nodes: [{ x, y }, { x: x + 0.01, y }], closed: false }
  }
  const level = s.auto ? s.level : 0
  const prec = PRECISION[s.precision]
  let total = 0
  for (let i = 1; i < pts.length; i++) total += len(sub(pts[i], pts[i - 1]))
  const closed = total > 60 * px && len(sub(pts[0], pts[pts.length - 1])) < Math.max(12 * px, total * 0.06)

  // Dibujo libre: solo se quitan los puntos que sobran (polilínea casi exacta)
  if (level <= 0.001) {
    const keep = rdp(pts, 0.6 * px)
    const nodes = keep.map((i) => ({ x: pts[i][0], y: pts[i][1] }))
    return { nodes: closed && nodes.length > 2 ? nodes.slice(0, -1) : nodes, closed: closed && nodes.length > 2 }
  }

  // Error permitido del ajuste: de medio px (0 %) a unos 10 px de pantalla (100 %), según la precisión
  const err = (0.5 + 10 * Math.pow(level, 1.6)) * prec.err * px
  // Esquinas: candidatos = los puntos que quedan al simplificar (RDP). El giro se mide con la dirección a una distancia
  // fija antes y después (no con el vecino inmediato): una esquina de verdad gira igual a esa distancia y el temblor no.
  // De dos esquinas más cerca que esa distancia, se queda la de más giro.
  const keep = rdp(pts, Math.max(0.6 * px, err * 0.45))
  const cornerDeg = prec.corner + level * 12
  const arc = [0]
  for (let i = 1; i < pts.length; i++) arc.push(arc[i - 1] + len(sub(pts[i], pts[i - 1])))
  const reachArc = Math.max(12 * px, err * 2.2)
  const at = (i: number, dir: 1 | -1) => {
    let j = i
    while (j + dir >= 0 && j + dir < pts.length && Math.abs(arc[j] - arc[i]) < reachArc) j += dir
    return j
  }
  const found: { i: number; turn: number }[] = []
  for (let k = 1; k < keep.length - 1; k++) {
    const i = keep[k]
    // Muy cerca de los extremos no hay sitio para medir
    if (arc[i] < reachArc * 0.5 || arc[arc.length - 1] - arc[i] < reachArc * 0.5) continue
    const v1 = sub(pts[i], pts[at(i, -1)])
    const v2 = sub(pts[at(i, 1)], pts[i])
    if (!len(v1) || !len(v2)) continue
    const turn = (Math.acos(Math.max(-1, Math.min(1, dot(norm(v1), norm(v2))))) * 180) / Math.PI
    if (turn > cornerDeg) found.push({ i, turn })
  }
  const corners = [0]
  for (const f of found) {
    const prev = corners.length > 1 ? found.find((g) => g.i === corners[corners.length - 1]) : undefined
    if (prev && arc[f.i] - arc[prev.i] < reachArc) {
      if (f.turn > prev.turn) corners[corners.length - 1] = f.i
    } else corners.push(f.i)
  }
  corners.push(pts.length - 1)

  // Cortes suaves: un trazo cerrado no se puede ajustar con una sola curva que empieza y acaba en el mismo sitio, así
  // que se parte también por el punto más lejano del principio (y por la mitad de cada tramo cerrado muy largo)
  const smooth = new Set<number>()
  if (closed) {
    let far = 0
    let dmax = -1
    for (let i = 1; i < pts.length - 1; i++) {
      const d = len(sub(pts[i], pts[0]))
      if (d > dmax) {
        dmax = d
        far = i
      }
    }
    if (!corners.includes(far)) smooth.add(far)
  }
  const breaks = [...new Set([...corners, ...smooth])].sort((a, b) => a - b)
  const reach = Math.max(3 * px, err * 1.5)
  // Tangente común en un corte suave (y en el cierre, si el principio no es una esquina)
  const startIsCorner = closed && (() => {
    const a = sub(pts[1], pts[0])
    const b = sub(pts[0], pts[pts.length - 2])
    return len(a) && len(b) ? (Math.acos(Math.max(-1, Math.min(1, dot(norm(a), norm(b))))) * 180) / Math.PI > cornerDeg : true
  })()
  const sharedAt = (i: number): Pt | null => {
    if (smooth.has(i)) {
      const before = endTangent(pts, i, -1, reach)
      const after = endTangent(pts, i, 1, reach)
      return norm(sub(after, before))
    }
    if (closed && !startIsCorner && (i === 0 || i === pts.length - 1)) {
      const after = endTangent(pts, 0, 1, reach)
      const before = endTangent(pts, pts.length - 1, -1, reach)
      return norm(sub(after, before))
    }
    return null
  }

  // Cada tramo entre cortes: (corrección) media móvil, reparto de puntos y ajuste de curvas
  const curves: Bez[] = []
  const window = s.finish ? Math.round(1 + level * 5) : Math.round(level * 2)
  const iterations = s.finish ? 8 : 3
  for (let c = 0; c < breaks.length - 1; c++) {
    const a = breaks[c]
    const b = breaks[c + 1]
    let run = pts.slice(a, b + 1)
    if (run.length < 2) continue
    run = resample(smoothRun(run, window), Math.max(0.8 * px, err * 0.25))
    if (run.length < 2) continue
    const sa = sharedAt(a)
    const sb = sharedAt(b)
    const t1 = sa ?? endTangent(run, 0, 1, reach)
    const t2 = sb ? mul(sb, -1) : endTangent(run, run.length - 1, -1, reach)
    fitCubic(run, 0, run.length - 1, t1, t2, err, iterations, curves)
  }
  let nodes = toNodes(curves, 0.05 * px)
  // Con dos curvas o más se puede cerrar (dos puntos cerrados ya son dos curvas, p. ej. un círculo muy suavizado)
  const canClose = closed && nodes.length > 2
  if (canClose) {
    // Cerrar: el último punto se junta con el primero (se queda la entrada del último en el primero)
    const last = nodes[nodes.length - 1]
    nodes = nodes.slice(0, -1)
    if (last.hi) nodes[0] = { ...nodes[0], hi: [last.hi[0] + nodes[0].x - last.x, last.hi[1] + nodes[0].y - last.y] }
  }
  return { nodes, closed: canClose }
}
