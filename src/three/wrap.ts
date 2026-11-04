import * as THREE from 'three'
import { convexHull } from './body'

/** Nube de puntos del cuerpo con los pesos de sus huesos. La ropa se construye a partir de ella. */
export interface Cloud {
  pos: Float32Array
  skinIndex: Uint16Array
  skinWeight: Float32Array
}

export interface TubeSpec {
  /** Punto del eje donde s = 0. */
  origin: THREE.Vector3
  /** Dirección del eje (unitaria). */
  axis: THREE.Vector3
  /** Dirección perpendicular al eje que marca el ángulo 0. */
  ref: THREE.Vector3
  /** Tramo del eje que cubre la pieza. */
  from: number
  to: number
  /** Qué puntos del cuerpo cuentan para esta pieza (por su índice en la nube y su distancia `r` al eje). */
  accept: (index: number, r: number) => boolean
  /** Separación de la tela respecto al cuerpo. */
  ease: number
  /** Radio extra a lo largo de la pieza (t = 0 en `from`, 1 en `to`), p. ej. para ensanchar el bajo. */
  flare?: (t: number) => number
  /** Pliegues: crecen de 0 en `t0` a `amp` en `t1` (t0 puede ser mayor que t1). */
  folds?: { count: number; amp: number; t0: number; t1: number }
}

const STEP = 1.2
const SEGMENTS = 64

/**
 * Tela que envuelve una parte del cuerpo como lo haría una cinta métrica: en cada anillo a lo largo del eje
 * toma el contorno convexo del cuerpo, lo suaviza y lo separa con la holgura.
 */
export function wrapTube(points: Float32Array, spec: TubeSpec, tile: number) {
  const { origin, axis, ref, from, to } = spec
  const side = new THREE.Vector3().crossVectors(axis, ref).normalize()
  const nS = Math.max(2, Math.ceil(Math.abs(to - from) / STEP) + 1)
  const dir = Math.sign(to - from) || 1
  const step = Math.abs(to - from) / (nS - 1)
  const nT = SEGMENTS
  const radius = new Float32Array(nS * nT).fill(-1)

  // 1. Radio máximo del cuerpo en cada celda (anillo × ángulo)
  const q = new THREE.Vector3()
  for (let i = 0; i < points.length; i += 3) {
    q.set(points[i] - origin.x, points[i + 1] - origin.y, points[i + 2] - origin.z)
    const s = q.dot(axis)
    const ring = Math.round(((s - from) * dir) / step)
    if (ring < 0 || ring >= nS) continue
    const a = q.dot(ref)
    const b = q.dot(side)
    const r = Math.hypot(a, b)
    if (!spec.accept(i / 3, r)) continue
    const t = Math.floor(((Math.atan2(b, a) + Math.PI) / (2 * Math.PI)) * nT) % nT
    const k = ring * nT + t
    if (r > radius[k]) radius[k] = r
  }

  fillGaps(radius, nS, nT)
  for (let ring = 0; ring < nS; ring++) convexRing(radius, ring, nT)
  smooth(radius, nS, nT)

  // 2. Malla: anillos de vértices alrededor del eje (la última columna repite la primera para cerrar las UV)
  const columns = nT + 1
  const pos = new Float32Array(columns * nS * 3)
  const uv = new Float32Array(columns * nS * 2)
  const v = new THREE.Vector3()
  let avgR = 0
  for (let k = 0; k < radius.length; k++) avgR += radius[k]
  avgR /= radius.length
  for (let ring = 0; ring < nS; ring++) {
    const s = from + dir * ring * step
    const tAlong = ring / (nS - 1)
    for (let j = 0; j < columns; j++) {
      const theta = ((j + 0.5) / nT) * 2 * Math.PI - Math.PI
      let r = radius[ring * nT + (j % nT)] + spec.ease + (spec.flare?.(tAlong) ?? 0)
      if (spec.folds) {
        const { t0, t1, count, amp } = spec.folds
        const w = t0 < t1 ? THREE.MathUtils.smoothstep(tAlong, t0, t1) : 1 - THREE.MathUtils.smoothstep(tAlong, t1, t0)
        r += amp * w * (Math.sin(count * theta) * 0.7 + Math.sin(count * 1.7 * theta + 1.3) * 0.3)
      }
      v.copy(origin)
        .addScaledVector(axis, s)
        .addScaledVector(ref, Math.cos(theta) * r)
        .addScaledVector(side, Math.sin(theta) * r)
      const k = ring * columns + j
      pos.set([v.x, v.y, v.z], k * 3)
      uv.set([((j / nT) * 2 * Math.PI * avgR) / tile, (ring * step) / tile], k * 2)
    }
  }
  const index: number[] = []
  for (let ring = 0; ring < nS - 1; ring++) {
    for (let j = 0; j < nT; j++) {
      const a = ring * columns + j
      const b = a + 1
      const c = a + columns
      const d = c + 1
      if (dir > 0) index.push(a, b, c, b, d, c)
      else index.push(a, c, b, b, c, d)
    }
  }

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  g.setIndex(index)
  g.userData = { rings: nS, columns }
  computeTubeNormals(g)
  return g
}

/** Normales suaves de un tubo. La primera y la última columna son el mismo sitio: igualamos sus normales para que no se vea la costura. */
export function computeTubeNormals(g: THREE.BufferGeometry) {
  g.computeVertexNormals()
  const { rings, columns } = g.userData as { rings: number; columns: number }
  const n = g.attributes.normal as THREE.BufferAttribute
  const v = new THREE.Vector3()
  for (let ring = 0; ring < rings; ring++) {
    const a = ring * columns
    const b = a + columns - 1
    v.set(n.getX(a) + n.getX(b), n.getY(a) + n.getY(b), n.getZ(a) + n.getZ(b)).normalize()
    n.setXYZ(a, v.x, v.y, v.z)
    n.setXYZ(b, v.x, v.y, v.z)
  }
}

/** Rellena celdas vacías interpolando entre vecinas (primero alrededor del anillo, luego entre anillos). */
function fillGaps(radius: Float32Array, nS: number, nT: number) {
  const filledRing = new Array(nS).fill(false)
  for (let ring = 0; ring < nS; ring++) {
    const row = radius.subarray(ring * nT, ring * nT + nT)
    let known = 0
    for (let j = 0; j < nT; j++) if (row[j] >= 0) known++
    if (known < 3) continue
    filledRing[ring] = true
    for (let j = 0; j < nT; j++) {
      if (row[j] >= 0) continue
      let l = j
      let r = j
      let dl = 0
      let dr = 0
      while (row[l] < 0) {
        l = (l - 1 + nT) % nT
        dl++
      }
      while (row[r] < 0) {
        r = (r + 1) % nT
        dr++
      }
      row[j] = (row[l] * dr + row[r] * dl) / (dl + dr)
    }
  }
  for (let ring = 0; ring < nS; ring++) {
    if (filledRing[ring]) continue
    let below = ring - 1
    while (below >= 0 && !filledRing[below]) below--
    let above = ring + 1
    while (above < nS && !filledRing[above]) above++
    for (let j = 0; j < nT; j++) {
      const a = below >= 0 ? radius[below * nT + j] : -1
      const b = above < nS ? radius[above * nT + j] : -1
      radius[ring * nT + j] =
        a >= 0 && b >= 0 ? (a * (above - ring) + b * (ring - below)) / (above - below) : Math.max(a, b, 0.5)
    }
  }
}

/** Convierte el contorno de un anillo en su envolvente convexa: la tela no se mete en los huecos del cuerpo. */
function convexRing(radius: Float32Array, ring: number, nT: number) {
  const pts: [number, number][] = []
  for (let j = 0; j < nT; j++) {
    const th = ((j + 0.5) / nT) * 2 * Math.PI - Math.PI
    const r = radius[ring * nT + j]
    pts.push([Math.cos(th) * r, Math.sin(th) * r])
  }
  const hull = convexHull(pts)
  for (let j = 0; j < nT; j++) {
    const th = ((j + 0.5) / nT) * 2 * Math.PI - Math.PI
    const dx = Math.cos(th)
    const dy = Math.sin(th)
    let best = radius[ring * nT + j]
    for (let e = 0; e < hull.length; e++) {
      const [ax, ay] = hull[e]
      const [bx, by] = hull[(e + 1) % hull.length]
      // Intersección del rayo (dx, dy)·t con el segmento a-b
      const ex = bx - ax
      const ey = by - ay
      const den = dx * ey - dy * ex
      if (Math.abs(den) < 1e-9) continue
      const t = (ax * ey - ay * ex) / den
      const u = (ax * dy - ay * dx) / den
      if (t > 0 && u >= -1e-6 && u <= 1 + 1e-6) best = Math.max(best, t)
    }
    radius[ring * nT + j] = best
  }
}

/** Suaviza el radio a lo largo de la pieza sin dejar que la tela se meta en el cuerpo (primero máximo local, luego media). */
function smooth(radius: Float32Array, nS: number, nT: number) {
  const tmp = new Float32Array(radius.length)
  for (let ring = 0; ring < nS; ring++) {
    for (let j = 0; j < nT; j++) {
      let m = radius[ring * nT + j]
      for (let d = -1; d <= 1; d++) {
        const rr = ring + d
        if (rr >= 0 && rr < nS) m = Math.max(m, radius[rr * nT + j])
      }
      tmp[ring * nT + j] = m
    }
  }
  const R = 2
  for (let ring = 0; ring < nS; ring++) {
    for (let j = 0; j < nT; j++) {
      let sum = 0
      let wsum = 0
      for (let d = -R; d <= R; d++) {
        const rr = ring + d
        if (rr < 0 || rr >= nS) continue
        for (let e = -1; e <= 1; e++) {
          const w = (R + 1 - Math.abs(d)) * (2 - Math.abs(e))
          sum += tmp[rr * nT + ((j + e + nT) % nT)] * w
          wsum += w
        }
      }
      radius[ring * nT + j] = sum / wsum
    }
  }
}

/**
 * Pesos de huesos para cada vértice de la prenda: mezcla los de los puntos del cuerpo más cercanos
 * (solo de las zonas que `allow` deja, p. ej. sin las manos para una falda) y luego los suaviza a lo largo
 * de la tela, para que dos vértices vecinos no sigan a huesos muy distintos y la tela no se rasgue.
 */
export function skinFromCloud(
  geom: THREE.BufferGeometry,
  cloud: Cloud,
  grid: CloudGrid,
  allow: (index: number) => boolean,
  smoothing: number,
) {
  const pos = geom.attributes.position
  const n = pos.count
  const bones = new Map<number, Float32Array>()
  const weightsOf = (b: number) => {
    let w = bones.get(b)
    if (!w) bones.set(b, (w = new Float32Array(n)))
    return w
  }

  for (let i = 0; i < n; i++) {
    for (const [pi, dist] of grid.nearest(pos.getX(i), pos.getY(i), pos.getZ(i), 8, allow)) {
      const w = 1 / (dist + 0.5)
      for (let j = 0; j < 4; j++) {
        const bw = cloud.skinWeight[pi * 4 + j]
        if (bw > 0) weightsOf(cloud.skinIndex[pi * 4 + j])[i] += bw * w
      }
    }
  }

  // Normalizamos y suavizamos sobre la rejilla del tubo (anillos × columnas)
  const total = new Float32Array(n)
  for (const w of bones.values()) for (let i = 0; i < n; i++) total[i] += w[i]
  for (const w of bones.values()) for (let i = 0; i < n; i++) w[i] = total[i] > 0 ? w[i] / total[i] : 0
  const { rings, columns } = geom.userData as { rings: number; columns: number }
  const cols = columns - 1
  const tmp = new Float32Array(n)
  for (let it = 0; it < smoothing; it++) {
    for (const w of bones.values()) {
      for (let r = 0; r < rings; r++) {
        for (let c = 0; c < columns; c++) {
          const i = r * columns + c
          const left = r * columns + ((c - 1 + cols) % cols)
          const right = r * columns + ((c + 1) % cols)
          let sum = w[i] * 2 + w[left] + w[right]
          let cnt = 4
          if (r > 0) {
            sum += w[i - columns]
            cnt++
          }
          if (r < rings - 1) {
            sum += w[i + columns]
            cnt++
          }
          tmp[i] = sum / cnt
        }
      }
      w.set(tmp)
    }
  }

  const idx = new Uint16Array(n * 4)
  const wts = new Float32Array(n * 4)
  const entries = [...bones.entries()]
  for (let i = 0; i < n; i++) {
    const top = entries
      .map(([b, w]) => [b, w[i]] as const)
      .filter(([, w]) => w > 1e-4)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
    const sum = top.reduce((s, [, w]) => s + w, 0)
    if (sum <= 0) {
      wts[i * 4] = 1
      continue
    }
    top.forEach(([b, w], j) => {
      idx[i * 4 + j] = b
      wts[i * 4 + j] = w / sum
    })
  }
  geom.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4))
  geom.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wts, 4))
  return geom
}

/** Rejilla espacial para encontrar rápido los puntos del cuerpo cercanos a un vértice. */
export class CloudGrid {
  private cells = new Map<string, number[]>()

  constructor(
    private pos: Float32Array,
    private size = 3,
  ) {
    for (let i = 0; i < pos.length / 3; i++) {
      const key = this.key(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2])
      const cell = this.cells.get(key)
      if (cell) cell.push(i)
      else this.cells.set(key, [i])
    }
  }

  private key(x: number, y: number, z: number) {
    return `${Math.floor(x / this.size)},${Math.floor(y / this.size)},${Math.floor(z / this.size)}`
  }

  /** Los `k` puntos más cercanos que cumplen `allow`, buscando cada vez más lejos si hace falta. */
  nearest(x: number, y: number, z: number, k: number, allow: (index: number) => boolean): [number, number][] {
    const cx = Math.floor(x / this.size)
    const cy = Math.floor(y / this.size)
    const cz = Math.floor(z / this.size)
    const p = this.pos
    const found: [number, number][] = []
    // Buscamos por capas: cada vuelta solo mira las celdas nuevas del borde
    for (let reach = 0; reach <= 8; reach++) {
      for (let i = -reach; i <= reach; i++)
        for (let j = -reach; j <= reach; j++)
          for (let l = -reach; l <= reach; l++) {
            if (Math.max(Math.abs(i), Math.abs(j), Math.abs(l)) !== reach) continue
            const cell = this.cells.get(`${cx + i},${cy + j},${cz + l}`)
            if (!cell) continue
            for (const pi of cell) {
              if (allow(pi)) found.push([pi, Math.hypot(p[pi * 3] - x, p[pi * 3 + 1] - y, p[pi * 3 + 2] - z)])
            }
          }
      // Con una capa más de margen nos aseguramos de que los k encontrados son de verdad los más cercanos
      if (found.length >= k && reach >= 1) return found.sort((a, b) => a[1] - b[1]).slice(0, k)
    }
    return found.sort((a, b) => a[1] - b[1]).slice(0, k)
  }
}
