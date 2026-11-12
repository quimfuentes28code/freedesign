import type { ArtLayer, PathNode } from '../../shared/artworks'

/*
 * Vectorizar una imagen (logo en foto, PNG, boceto escaneado) en el navegador, sin librerías:
 * 1. Se reduce a pocos colores (k-medias) y se limpian los bordes con un filtro de moda.
 * 2. Cada color es una máscara: se quitan las motas y se rellenan los huecos diminutos.
 * 3. Se siguen sus contornos por los bordes de los píxeles (cada vuelta es un contorno; huecos e islas también).
 * 4. Se simplifican (Douglas–Peucker) y se pasan a curvas suaves, dejando picos donde la esquina es marcada.
 * Sale una capa de trazo por color (`subpaths` con relleno par-impar), de la más grande (abajo) a la más pequeña.
 */

export type Detail = 'suave' | 'medio' | 'fino'

export interface VectorizeOptions {
  /** Número de colores (2–8). */
  colors: number
  detail: Detail
  /** Quitar el color del borde de la imagen (fondo liso). */
  removeBackground: boolean
  /** Ancho de lo que sale, en unidades del creador (600 × 600). */
  size?: number
}

const SETTINGS: Record<Detail, { px: number; tol: number; speck: number }> = {
  // Lado mayor de la imagen de trabajo, tolerancia de simplificado (px) y tamaño mínimo de una forma (fracción del área)
  suave: { px: 360, tol: 1.6, speck: 0.0012 },
  medio: { px: 520, tol: 1.1, speck: 0.0005 },
  fino: { px: 720, tol: 0.7, speck: 0.0002 },
}

type Pt = [number, number]

export async function vectorize(url: string, o: VectorizeOptions): Promise<ArtLayer[]> {
  const s = SETTINGS[o.detail]
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = url
  await img.decode()
  const k = Math.min(s.px / img.naturalWidth, s.px / img.naturalHeight, 1.5)
  const w = Math.max(8, Math.round(img.naturalWidth * k))
  const h = Math.max(8, Math.round(img.naturalHeight * k))
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.drawImage(img, 0, 0, w, h)
  const px = g.getImageData(0, 0, w, h).data

  // 1. Pocos colores
  const centers = kmeans(px, Math.max(2, Math.min(8, o.colors)))
  let labels = new Int16Array(w * h)
  for (let i = 0; i < w * h; i++) labels[i] = px[i * 4 + 3] < 128 ? -1 : nearest(centers, px[i * 4], px[i * 4 + 1], px[i * 4 + 2])
  labels = modeFilter(modeFilter(labels, w, h), w, h)

  // Fondo: el color más repetido en el borde de la imagen
  if (o.removeBackground) {
    const count = new Map<number, number>()
    const edge = (i: number) => labels[i] >= 0 && count.set(labels[i], (count.get(labels[i]) ?? 0) + 1)
    for (let x = 0; x < w; x++) edge(x), edge((h - 1) * w + x)
    for (let y = 0; y < h; y++) edge(y * w), edge(y * w + w - 1)
    const bg = [...count].sort((a, b) => b[1] - a[1])[0]?.[0]
    if (bg !== undefined) for (let i = 0; i < labels.length; i++) if (labels[i] === bg) labels[i] = -1
  }

  // 2–4. Contornos de cada color
  const minArea = Math.max(4, s.speck * w * h)
  const scale = (o.size ?? 420) / Math.max(w, h)
  const group = crypto.randomUUID()
  const out: { layer: ArtLayer; area: number }[] = []
  for (let label = 0; label < centers.length; label++) {
    const mask = new Uint8Array(w * h)
    let any = 0
    for (let i = 0; i < mask.length; i++) if (labels[i] === label) (mask[i] = 1), any++
    if (any < minArea) continue
    cleanMask(mask, w, h, minArea)
    const loops = traceLoops(mask, w, h)
      .map((l) => simplifyClosed(l, s.tol))
      .filter((l) => l.length >= 3 && Math.abs(polyArea(l)) >= minArea)
      .sort((a, b) => Math.abs(polyArea(b)) - Math.abs(polyArea(a)))
    if (!loops.length) continue
    const toNodes = (l: Pt[]) => smoothCorners(l.map(([x, y]) => [(x - w / 2) * scale, (y - h / 2) * scale] as Pt))
    const [first, ...rest] = loops
    const [r, gg, b] = centers[label]
    out.push({
      area: any,
      layer: {
        id: crypto.randomUUID(),
        type: 'path',
        nodes: toNodes(first),
        subpaths: rest.map(toNodes),
        closed: true,
        fill: hex(r, gg, b),
        stroke: '',
        strokeWidth: 4,
        x: 300,
        y: 300,
        rotation: 0,
        group,
      },
    })
  }
  if (!out.length) throw new Error('No se ha encontrado ninguna forma. Prueba con más colores o sin quitar el fondo.')
  return out.sort((a, b) => b.area - a.area).map((x) => x.layer)
}

const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`

/** k-medias sobre una muestra de los píxeles opacos (empieza con k-medias++). */
function kmeans(px: Uint8ClampedArray, k: number): [number, number, number][] {
  const n = px.length / 4
  const step = Math.max(1, Math.floor(n / 20000))
  const pts: [number, number, number][] = []
  for (let i = 0; i < n; i += step) if (px[i * 4 + 3] >= 128) pts.push([px[i * 4], px[i * 4 + 1], px[i * 4 + 2]])
  if (!pts.length) return [[0, 0, 0]]
  const d2 = (a: number[], b: number[]) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
  const centers: [number, number, number][] = [pts[Math.floor(pts.length / 2)]]
  while (centers.length < k) {
    const dist = pts.map((p) => Math.min(...centers.map((c) => d2(p, c))))
    const total = dist.reduce((a, b) => a + b, 0)
    if (!total) break
    let r = Math.random() * total
    let i = 0
    while ((r -= dist[i]) > 0 && i < pts.length - 1) i++
    centers.push([...pts[i]])
  }
  for (let it = 0; it < 12; it++) {
    const sum = centers.map(() => [0, 0, 0, 0])
    for (const p of pts) {
      const c = nearest(centers, p[0], p[1], p[2])
      sum[c][0] += p[0]
      sum[c][1] += p[1]
      sum[c][2] += p[2]
      sum[c][3]++
    }
    for (let c = 0; c < centers.length; c++) if (sum[c][3]) centers[c] = [sum[c][0] / sum[c][3], sum[c][1] / sum[c][3], sum[c][2] / sum[c][3]]
  }
  return centers
}

function nearest(centers: number[][], r: number, g: number, b: number) {
  let best = 0
  let bd = Infinity
  for (let i = 0; i < centers.length; i++) {
    const c = centers[i]
    // Distancia con el peso del ojo (el verde se nota más)
    const d = 0.3 * (c[0] - r) ** 2 + 0.59 * (c[1] - g) ** 2 + 0.11 * (c[2] - b) ** 2
    if (d < bd) (bd = d), (best = i)
  }
  return best
}

/** Cada píxel pasa al color que más se repite a su alrededor (3 × 3): quita el borde suavizado y el ruido. */
function modeFilter(src: Int16Array, w: number, h: number) {
  const out = new Int16Array(src)
  const votes = new Map<number, number>()
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      votes.clear()
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const v = src[(y + dy) * w + x + dx]
        votes.set(v, (votes.get(v) ?? 0) + 1)
      }
      let best = src[y * w + x]
      let bn = 0
      for (const [v, nn] of votes) if (nn > bn) (bn = nn), (best = v)
      if (bn >= 5) out[y * w + x] = best
    }
  return out
}

/** Quita las motas sueltas y rellena los huecos diminutos de una máscara. */
function cleanMask(mask: Uint8Array, w: number, h: number, minArea: number) {
  for (const value of [1, 0]) {
    const seen = new Uint8Array(w * h)
    const stack: number[] = []
    for (let i = 0; i < mask.length; i++) {
      if (seen[i] || mask[i] !== value) continue
      const comp: number[] = []
      let touchesEdge = false
      stack.push(i)
      seen[i] = 1
      while (stack.length) {
        const p = stack.pop()!
        comp.push(p)
        const x = p % w
        const y = (p / w) | 0
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touchesEdge = true
        for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1])
          if (q >= 0 && !seen[q] && mask[q] === value) (seen[q] = 1), stack.push(q)
      }
      // Motas (de la forma) fuera; huecos pequeños (del fondo, sin tocar el borde) dentro
      if (comp.length < minArea && (value === 1 || !touchesEdge)) for (const p of comp) mask[p] = value ? 0 : 1
    }
  }
}

/**
 * Contornos de una máscara por los bordes de los píxeles. Cada borde va con la forma a su izquierda, así las vueltas
 * de fuera y las de los huecos salen en sentidos contrarios (con relleno par-impar da igual).
 */
function traceLoops(mask: Uint8Array, w: number, h: number): Pt[][] {
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1
  const W = w + 1
  const next = new Map<number, number[]>()
  const addEdge = (ax: number, ay: number, bx: number, by: number) => {
    const a = ay * W + ax
    const list = next.get(a)
    if (list) list.push(by * W + bx)
    else next.set(a, [by * W + bx])
  }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!inside(x, y)) continue
      if (!inside(x, y - 1)) addEdge(x + 1, y, x, y)
      if (!inside(x, y + 1)) addEdge(x, y + 1, x + 1, y + 1)
      if (!inside(x - 1, y)) addEdge(x, y, x, y + 1)
      if (!inside(x + 1, y)) addEdge(x + 1, y + 1, x + 1, y)
    }
  const loops: Pt[][] = []
  for (const [start, outs] of next) {
    while (outs.length) {
      const loop: Pt[] = []
      let prev = start
      let cur = outs.pop()!
      loop.push([start % W, (start / W) | 0])
      let guard = 0
      while (cur !== start && guard++ < 4 * w * h) {
        loop.push([cur % W, (cur / W) | 0])
        const list = next.get(cur)
        if (!list?.length) break
        // En un cruce (dos píxeles que solo se tocan por la esquina) se gira a la derecha: quedan separados
        let pick = 0
        if (list.length > 1) {
          const dx = (cur % W) - (prev % W)
          const dy = ((cur / W) | 0) - ((prev / W) | 0)
          pick = list.findIndex((n) => {
            const ex = (n % W) - (cur % W)
            const ey = ((n / W) | 0) - ((cur / W) | 0)
            return dx * ey - dy * ex > 0
          })
          if (pick < 0) pick = 0
        }
        prev = cur
        cur = list.splice(pick, 1)[0]
      }
      if (loop.length >= 4) loops.push(removeCollinear(loop))
    }
  }
  return loops
}

function removeCollinear(l: Pt[]): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i < l.length; i++) {
    const a = l[(i - 1 + l.length) % l.length]
    const b = l[i]
    const c = l[(i + 1) % l.length]
    if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) !== 0) out.push(b)
  }
  return out
}

function polyArea(l: Pt[]) {
  let a = 0
  for (let i = 0; i < l.length; i++) {
    const p = l[i]
    const q = l[(i + 1) % l.length]
    a += p[0] * q[1] - q[0] * p[1]
  }
  return a / 2
}

/** Douglas–Peucker en una vuelta cerrada (se parte por los dos puntos más alejados). */
function simplifyClosed(l: Pt[], tol: number): Pt[] {
  if (l.length < 5) return l
  // Primero se suaviza la escalera de píxeles: cada punto hacia la media de sus vecinos
  const soft = l.map((p, i) => {
    const a = l[(i - 1 + l.length) % l.length]
    const c = l[(i + 1) % l.length]
    return [(a[0] + 2 * p[0] + c[0]) / 4, (a[1] + 2 * p[1] + c[1]) / 4] as Pt
  })
  let far = 0
  let fd = -1
  for (let i = 1; i < soft.length; i++) {
    const d = (soft[i][0] - soft[0][0]) ** 2 + (soft[i][1] - soft[0][1]) ** 2
    if (d > fd) (fd = d), (far = i)
  }
  const a = dp(soft.slice(0, far + 1), tol)
  const b = dp([...soft.slice(far), soft[0]], tol)
  return [...a.slice(0, -1), ...b.slice(0, -1)]
}

function dp(pts: Pt[], tol: number): Pt[] {
  if (pts.length < 3) return pts
  const [a, b] = [pts[0], pts[pts.length - 1]]
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

/** Curvas suaves por los puntos (asas de Catmull-Rom), sin asas donde la esquina es marcada (picos de letras). */
function smoothCorners(l: Pt[]): PathNode[] {
  const n = l.length
  return l.map((p, i) => {
    const a = l[(i - 1 + n) % n]
    const c = l[(i + 1) % n]
    const v1 = [p[0] - a[0], p[1] - a[1]]
    const v2 = [c[0] - p[0], c[1] - p[1]]
    const cos = (v1[0] * v2[0] + v1[1] * v2[1]) / ((Math.hypot(v1[0], v1[1]) || 1) * (Math.hypot(v2[0], v2[1]) || 1))
    const r = (v: number) => Math.round(v * 10) / 10
    if (cos < 0.45) return { x: r(p[0]), y: r(p[1]) }
    return { x: r(p[0]), y: r(p[1]), hx: r((c[0] - a[0]) / 6), hy: r((c[1] - a[1]) / 6) }
  })
}
