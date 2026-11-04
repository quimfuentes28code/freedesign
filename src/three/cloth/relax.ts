import type { Cloth } from './Cloth'

/** El cuerpo como obstáculo: puntos de su superficie con sus normales, en la pose de reposo. */
export interface Collider {
  points: Float32Array
  normals: Float32Array
}

/** Rejilla espacial rápida (tabla hash numérica) para encontrar el punto de la piel más cercano. */
export class SpatialHash {
  private size: number
  private start: Int32Array
  private items: Int32Array
  private readonly buckets = 1 << 16

  constructor(
    private points: Float32Array,
    cell: number,
  ) {
    this.size = cell
    const n = points.length / 3
    const count = new Int32Array(this.buckets + 1)
    const keys = new Int32Array(n)
    for (let i = 0; i < n; i++) {
      keys[i] = this.bucket(
        Math.floor(points[i * 3] / cell),
        Math.floor(points[i * 3 + 1] / cell),
        Math.floor(points[i * 3 + 2] / cell),
      )
      count[keys[i] + 1]++
    }
    for (let b = 0; b < this.buckets; b++) count[b + 1] += count[b]
    this.start = count
    this.items = new Int32Array(n)
    const fill = count.slice(0, this.buckets)
    for (let i = 0; i < n; i++) this.items[fill[keys[i]]++] = i
  }

  private bucket(x: number, y: number, z: number) {
    return ((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) & (this.buckets - 1)
  }

  /** Índice del punto más cercano en las celdas vecinas, o -1 si no hay ninguno cerca. */
  nearest(x: number, y: number, z: number) {
    const cx = Math.floor(x / this.size)
    const cy = Math.floor(y / this.size)
    const cz = Math.floor(z / this.size)
    let best = -1
    let bestD = Infinity
    const p = this.points
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (let k = -1; k <= 1; k++) {
          const b = this.bucket(cx + i, cy + j, cz + k)
          for (let s = this.start[b]; s < this.start[b + 1]; s++) {
            const q = this.items[s] * 3
            const ex = p[q] - x
            const ey = p[q + 1] - y
            const ez = p[q + 2] - z
            const d = ex * ex + ey * ey + ez * ez
            if (d < bestD) {
              bestD = d
              best = this.items[s]
            }
          }
        }
    return best
  }
}

export interface RelaxOptions {
  /** Segundos simulados. */
  seconds: number
  /** Separación mínima entre la tela y la piel (unidades del modelo). */
  thickness: number
  /** Gravedad (unidades del modelo / s²). */
  gravity: number
  /** Tamaño de celda para buscar la piel más cercana (unidades del modelo). */
  cell: number
  /**
   * Choques entre piezas de la propia prenda (la tela no se atraviesa a sí misma):
   * - outside: los puntos de `outer` quedan por fuera de los de `inner` (la capucha encima de la espalda)
   * - apart: los dos grupos se separan entre sí (mangas y costados del cuerpo)
   */
  layers?: Layer[]
}

export interface Layer {
  mode: 'outside' | 'apart'
  outer: number[]
  inner: number[]
  /** Separación mínima (unidades del modelo). */
  gap: number
}

/**
 * Separa las capas de tela: para cada punto de `outer` busca el punto de `inner` más cercano y, si está demasiado
 * cerca (o por dentro, en modo «outside»), lo empuja. En «outside» la dirección es la de la piel bajo ese punto.
 */
function separateLayers(
  pos: Float32Array,
  prev: Float32Array,
  layers: Layer[],
  skinNormal: (i: number) => [number, number, number] | null,
  cell: number,
) {
  // Mueve un punto sin darle velocidad (se mueve también su posición anterior)
  const move = (p: number, x: number, y: number, z: number) => {
    pos[p] += x
    pos[p + 1] += y
    pos[p + 2] += z
    prev[p] += x
    prev[p + 1] += y
    prev[p + 2] += z
  }
  for (const layer of layers) {
    const inner = new Float32Array(layer.inner.length * 3)
    layer.inner.forEach((v, k) => inner.set([pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]], k * 3))
    const hash = new SpatialHash(inner, cell)
    const gap = layer.gap
    for (const v of layer.outer) {
      const p = v * 3
      const k = hash.nearest(pos[p], pos[p + 1], pos[p + 2])
      if (k < 0) continue
      const q = layer.inner[k] * 3
      const ex = pos[p] - pos[q]
      const ey = pos[p + 1] - pos[q + 1]
      const ez = pos[p + 2] - pos[q + 2]
      if (layer.mode === 'outside') {
        const n = skinNormal(layer.inner[k])
        if (!n) continue
        const d = ex * n[0] + ey * n[1] + ez * n[2]
        // Solo si de verdad está encima (cerca en horizontal): si no, son zonas distintas de la prenda
        const lateral2 = ex * ex + ey * ey + ez * ez - d * d
        if (d >= gap || lateral2 > (cell * 1.2) ** 2 || d < -cell * 2) continue
        // Poco a poco (como mucho, la separación por paso): si no, la tela salta
        const push = Math.min(gap - d, gap) * 0.7
        move(p, n[0] * push, n[1] * push, n[2] * push)
      } else {
        const len = Math.sqrt(ex * ex + ey * ey + ez * ez)
        if (len >= gap || len < 1e-6) continue
        const push = ((gap - len) / len) * 0.35
        move(p, ex * push, ey * push, ez * push)
        move(q, -ex * push, -ey * push, -ez * push)
      }
    }
  }
}

/**
 * Asienta la prenda sobre el cuerpo: cose las piezas, deja caer la tela con la gravedad y evita que atraviese
 * la piel. No es una simulación física exacta, solo lo justo para que la prenda tenga una caída bonita.
 * Método: dinámica basada en posiciones con pasos pequeños (cada paso: mover, coser, mantener distancias, chocar).
 */
export function relax(cloth: Cloth, body: Collider, opts: RelaxOptions) {
  const pos = Float32Array.from(cloth.pos)
  const prev = Float32Array.from(pos)
  const n = pos.length / 3
  const fps = 60
  const substeps = 10
  const h = 1 / (fps * substeps)
  const steps = Math.round(opts.seconds * fps * substeps)
  const g = opts.gravity * h * h

  // Restricciones en arrays planos (más rápido)
  const links = cloth.links
  const la = new Int32Array(links.length)
  const lb = new Int32Array(links.length)
  const lr = new Float32Array(links.length)
  const lk = new Float32Array(links.length)
  links.forEach((l, i) => {
    la[i] = l.a
    lb[i] = l.b
    lr[i] = l.rest
    lk[i] = l.k
  })
  const sa = new Int32Array(cloth.seams.map((s) => s[0]))
  const sb = new Int32Array(cloth.seams.map((s) => s[1]))

  const hash = new SpatialHash(body.points, opts.cell)
  const maxDepth = opts.cell * 1.5
  const reach2 = (opts.cell * 1.5) ** 2
  const maxPush = opts.thickness
  const nearest = new Int32Array(n).fill(-1)
  const refresh = () => {
    for (let i = 0; i < n; i++) nearest[i] = hash.nearest(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2])
  }

  // 0. Antes de empezar, sacamos del cuerpo de una vez la tela que haya quedado dentro
  // (si se hiciera poco a poco, la tela "treparía" por la piel)
  refresh()
  for (let i = 0; i < n; i++) {
    const k = nearest[i]
    if (k < 0) continue
    const p = i * 3
    const nx = body.normals[k * 3]
    const ny = body.normals[k * 3 + 1]
    const nz = body.normals[k * 3 + 2]
    const d = (pos[p] - body.points[k * 3]) * nx + (pos[p + 1] - body.points[k * 3 + 1]) * ny + (pos[p + 2] - body.points[k * 3 + 2]) * nz
    if (d < -maxDepth || d >= opts.thickness) continue
    const push = opts.thickness - d
    for (let c = 0; c < 3; c++) {
      pos[p + c] += body.normals[k * 3 + c] * push
      prev[p + c] = pos[p + c]
    }
  }

  for (let step = 0; step < steps; step++) {
    // Las costuras tiran fuerte al principio y la gravedad entra poco a poco: así las piezas se juntan antes de caer
    const t = step / steps
    const gravity = g * Math.min(1, t * 3)

    // 1. Mover (Verlet con amortiguación)
    for (let i = 0; i < n * 3; i += 3) {
      for (let c = 0; c < 3; c++) {
        const v = (pos[i + c] - prev[i + c]) * 0.985
        prev[i + c] = pos[i + c]
        pos[i + c] += v
      }
      pos[i + 1] -= gravity
    }

    // 2. Costuras (los dos puntos van a su punto medio)
    for (let s = 0; s < sa.length; s++) {
      const a = sa[s] * 3
      const b = sb[s] * 3
      for (let c = 0; c < 3; c++) {
        const m = (pos[a + c] + pos[b + c]) * 0.5
        pos[a + c] += (m - pos[a + c]) * 0.8
        pos[b + c] += (m - pos[b + c]) * 0.8
      }
    }

    // 3. Distancias del patrón
    satisfyLinks()

    // 4. Choque con el cuerpo (con rozamiento para que la tela se quede apoyada en hombros y pecho)
    // La piel más cercana cambia poco de un paso a otro: se recalcula de vez en cuando
    if (step % 20 === 0) refresh()
    collideBody()

    // 5. Capas de la propia prenda (cada pocos pasos: es más caro y cambia poco)
    if (opts.layers && step % 2 === 0 && t > 0.15) separateLayers(pos, prev, opts.layers, skinNormal, opts.cell)
  }

  // Al terminar, varias pasadas sin movimiento para que ninguna capa quede atravesada. Tras cada empujón,
  // las distancias del patrón y el choque con el cuerpo reparten el movimiento por la tela (si no, salen picos)
  if (opts.layers) {
    refresh()
    for (let it = 0; it < 10; it++) {
      separateLayers(pos, prev, opts.layers, skinNormal, opts.cell)
      for (let k = 0; k < 3; k++) {
        satisfyLinks()
        collideBody()
      }
    }
  }
  return pos

  /** Normal de la piel bajo un punto de la tela (hacia fuera del cuerpo). */
  function skinNormal(i: number): [number, number, number] | null {
    const k = nearest[i]
    if (k < 0) return null
    return [body.normals[k * 3], body.normals[k * 3 + 1], body.normals[k * 3 + 2]]
  }

  /** Cada par de puntos unidos intenta recuperar su distancia del patrón. */
  function satisfyLinks() {
    for (let l = 0; l < la.length; l++) {
      const a = la[l] * 3
      const b = lb[l] * 3
      const dx = pos[b] - pos[a]
      const dy = pos[b + 1] - pos[a + 1]
      const dz = pos[b + 2] - pos[a + 2]
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (len < 1e-6) continue
      let diff = (len - lr[l]) / len
      // La tela se estira poco pero se comprime (arruga) con facilidad
      if (diff < 0) diff *= 0.3
      const corr = diff * 0.5 * lk[l]
      pos[a] += dx * corr
      pos[a + 1] += dy * corr
      pos[a + 2] += dz * corr
      pos[b] -= dx * corr
      pos[b + 1] -= dy * corr
      pos[b + 2] -= dz * corr
    }
  }

  /** Saca la tela de la piel (con rozamiento, para que se quede apoyada en hombros y pecho). */
  function collideBody() {
    for (let i = 0; i < n; i++) {
      const k = nearest[i]
      if (k < 0) continue
      const p = i * 3
      const nx = body.normals[k * 3]
      const ny = body.normals[k * 3 + 1]
      const nz = body.normals[k * 3 + 2]
      const ex = pos[p] - body.points[k * 3]
      const ey = pos[p + 1] - body.points[k * 3 + 1]
      const ez = pos[p + 2] - body.points[k * 3 + 2]
      const d = ex * nx + ey * ny + ez * nz
      // Solo cuenta si la tela está de verdad junto a esa zona de piel (no al otro lado de un brazo, p. ej.)
      if (d < -maxDepth || ex * ex + ey * ey + ez * ez > reach2) continue
      // Empujón limitado por paso: así la tela sale del cuerpo poco a poco y no "salta"
      const push = Math.min(opts.thickness - d, maxPush)
      if (push <= 0) continue
      pos[p] += nx * push
      pos[p + 1] += ny * push
      pos[p + 2] += nz * push
      for (let c = 0; c < 3; c++) prev[p + c] += (pos[p + c] - prev[p + c]) * 0.6
    }
  }
}
