import * as THREE from 'three'
import type { Fit, Measurements } from '../types'

/** Holgura que añade cada ajuste sobre el cuerpo, en metros reales. */
export const FIT_EASE: Record<Fit, number> = {
  ajustado: 0.006,
  normal: 0.016,
  holgado: 0.04,
}

/** Nombre del hueso sin el prefijo de Mixamo ("mixamorig", "mixamorig1:"…), p. ej. "LeftArm". */
export function boneName(name: string) {
  return name.replace(/^mixamorig\d*:?/, '')
}

/** Posición de una articulación en la postura de referencia (en T), en unidades del modelo. */
export function jointPosition(skeleton: THREE.Skeleton, name: string) {
  const i = skeleton.bones.findIndex((b) => boneName(b.name) === name)
  return new THREE.Vector3().setFromMatrixPosition(skeleton.boneInverses[i].clone().invert())
}

/**
 * Datos del maniquí medidos sobre su malla en la postura de referencia (en T), en las unidades del modelo (cm).
 * El modelo mira hacia +Z; su izquierda está en +X.
 */
export interface ModelInfo {
  height: number
  /** Contornos del modelo original. */
  base: { chest: number; waist: number; hips: number }
  chestY: number
  waistY: number
  hipsY: number
  crotchY: number
  neckY: number
  kneeY: number
  ankleY: number
  /** Articulación del hombro (distancia al centro en X) y altura de los brazos en la postura en T. */
  shoulderX: number
  armY: number
}

/** Escala del cuerpo para ajustarlo a las medidas elegidas. */
export interface BodyFit {
  /** Metros reales por unidad del modelo. */
  scale: number
  /** Factor de anchura en cadera, cintura y pecho. */
  hips: number
  waist: number
  chest: number
  /** Cuello y espalda (anchura de la parte de atrás, entre el pecho y los hombros). */
  neck: number
  back: number
  /** Cuánto baja (+) o sube la cintura por el talle, en unidades del modelo. */
  waistShift: number
}

/** Mide el maniquí una vez al cargarlo: alturas de referencia, articulaciones y contornos. */
export function measureModel(pos: Float32Array, skeleton: THREE.Skeleton): ModelInfo {
  const joint = (name: string) => jointPosition(skeleton, name)
  const box = new THREE.Box3().setFromArray(pos)
  const height = box.max.y
  const hipsBone = joint('Hips')
  const shoulder = joint('LeftArm')
  const knee = joint('LeftLeg')
  const torsoX = Math.abs(shoulder.x) * 0.9

  // Entrepierna: primera altura (bajando desde la cadera) en la que ya no hay malla en el centro
  let crotchY = hipsBone.y - 10
  for (let y = hipsBone.y; y > knee.y; y -= 0.5) {
    if (!sliceHasCenter(pos, y)) {
      crotchY = y
      break
    }
  }

  const scan = (from: number, to: number, pick: 'max' | 'min') => {
    let best = { y: from, perimeter: pick === 'max' ? 0 : Infinity }
    for (let y = from; y <= to; y += 0.5) {
      const p = slicePerimeter(pos, y, torsoX)
      if (p === null) continue
      if (pick === 'max' ? p > best.perimeter : p < best.perimeter) best = { y, perimeter: p }
    }
    return best
  }

  const waist = scan(height * 0.56, height * 0.66, 'min')
  const chest = scan(height * 0.66, Math.min(height * 0.76, shoulder.y - 8), 'max')
  const hips = scan(crotchY + 3, waist.y - 4, 'max')

  return {
    height,
    base: { chest: chest.perimeter, waist: waist.perimeter, hips: hips.perimeter },
    chestY: chest.y,
    waistY: waist.y,
    hipsY: hips.y,
    crotchY,
    neckY: joint('Neck').y,
    kneeY: knee.y,
    ankleY: joint('LeftFoot').y,
    shoulderX: Math.abs(shoulder.x),
    armY: shoulder.y,
  }
}

/** Medidas de partida del maniquí (con las que se compara el cliente) para el cuello, la espalda y el talle. */
const REF = { hombre: { neck: 39, backWidth: 40, backLength: 42 }, mujer: { neck: 34, backWidth: 35, backLength: 40 } }

export function fitBody(info: ModelInfo, m: Measurements): BodyFit {
  const k = m.height / info.height
  const f = (target: number, base: number) => THREE.MathUtils.clamp(target / (base * k), 0.6, 1.8)
  const ref = REF[m.female ? 'mujer' : 'hombre']
  const ratio = (v: number | undefined, base: number, min: number, max: number) => THREE.MathUtils.clamp((v ?? base) / base, min, max)
  return {
    scale: k / 100,
    hips: f(m.hips, info.base.hips),
    waist: f(m.waist, info.base.waist),
    chest: f(m.chest, info.base.chest),
    neck: ratio(m.neck, ref.neck, 0.8, 1.3),
    back: ratio(m.backWidth, ref.backWidth, 0.85, 1.2),
    // El talle de espalda mueve la cintura (en cm reales → unidades del modelo)
    waistShift: THREE.MathUtils.clamp(((m.backLength ?? ref.backLength) - ref.backLength) / k, -8, 8),
  }
}

/**
 * Factor de anchura a cada altura: 1 en rodillas y cuello, y los factores de cadera, cintura y pecho en medio.
 * Se interpola suavemente para que no queden escalones.
 */
function widthFactor(info: ModelInfo, fit: BodyFit, y: number) {
  const keys: [number, number][] = [
    [info.kneeY, 1],
    [info.crotchY, THREE.MathUtils.lerp(1, fit.hips, 0.7)],
    [info.hipsY, fit.hips],
    [info.waistY - fit.waistShift, fit.waist],
    [info.chestY, fit.chest],
    [info.armY - 4, THREE.MathUtils.lerp(fit.chest, 1, 0.4)],
    [info.neckY, 1],
  ]
  if (y <= keys[0][0]) return 1
  for (let i = 1; i < keys.length; i++) {
    const [y1, f1] = keys[i]
    const [y0, f0] = keys[i - 1]
    if (y <= y1) return THREE.MathUtils.lerp(f0, f1, THREE.MathUtils.smoothstep(y, y0, y1))
  }
  return 1
}

/**
 * Deforma la malla del maniquí (en su postura de referencia) para que tenga los contornos elegidos.
 * No se tocan los huesos, así la animación sigue funcionando igual.
 * El torso se ensancha alrededor de su eje; los brazos solo se desplazan con el hombro para no estirarse.
 */
export function morphPositions(src: Float32Array, out: Float32Array, info: ModelInfo, fit: BodyFit) {
  const xs = info.shoulderX * 0.8
  const armBlend = info.shoulderX * 0.3
  const H = info.height
  for (let i = 0; i < src.length; i += 3) {
    const x = src[i]
    const y = src[i + 1]
    const z = src[i + 2]
    // Cuello (entre los hombros y la cabeza) y espalda (por detrás, entre el pecho y los hombros)
    const neckW = 1 + (fit.neck - 1) * bump(y, info.neckY - H * 0.012, H * 0.025)
    const backW = z < 0 ? 1 + (fit.back - 1) * bump(y, (info.chestY + info.armY) / 2, H * 0.05) : 1
    const f = widthFactor(info, fit, y) * neckW * backW
    const ax = Math.abs(x)
    // 0 en el torso, 1 en el brazo (solo cuenta a la altura de los brazos en la postura en T)
    const arm = y > info.chestY ? THREE.MathUtils.smoothstep(ax, xs, xs + armBlend) : 0
    const xArm = Math.sign(x) * (xs * f + (ax - xs))
    out[i] = THREE.MathUtils.lerp(x * f, xArm, arm)
    out[i + 1] = y
    out[i + 2] = z * THREE.MathUtils.lerp(f, 1, arm)
  }
}

/** Campana suave (1 en el centro, 0 lejos), de ancho `w`. */
function bump(v: number, center: number, w: number) {
  const t = (v - center) / w
  return Math.exp(-t * t)
}

/**
 * Cuerpo de mujer sobre el maniquí: pecho con forma de senos, cintura más estrecha, más cadera y glúteos, hombros
 * y cuello más estrechos. Se aplica a la malla en su postura de referencia (en T) antes de ajustarla a las medidas;
 * los huesos no se tocan, así la animación y la ropa siguen funcionando. `cup`: diferencia entre busto y bajo
 * pecho, en cm (16 ≈ copa B-C), que da el volumen del pecho.
 */
export function feminize(src0: Float32Array, info: ModelInfo, cup = 16, index?: ArrayLike<number>): Float32Array {
  const out = new Float32Array(src0.length)
  const H = info.height
  const torsoX = info.shoulderX * 0.85
  // Primero se suaviza la musculatura marcada del torso (pectorales, abdominales) del maniquí de hombre
  const src = index ? smoothTorso(src0, index, info) : src0

  // Profundidad del torso a la altura del pecho y de la cadera (dónde está «delante» y «detrás»)
  const depthAt = (y: number) => {
    let zMin = Infinity
    let zMax = -Infinity
    for (let i = 0; i < src.length; i += 3) {
      if (Math.abs(src[i + 1] - y) < 1 && Math.abs(src[i]) < torsoX * 0.7) {
        zMin = Math.min(zMin, src[i + 2])
        zMax = Math.max(zMax, src[i + 2])
      }
    }
    return { zMin, zMax, zc: (zMin + zMax) / 2 }
  }
  const chest = depthAt(info.chestY)
  const hip = depthAt(info.hipsY)

  // Senos: centro un poco por debajo del pecho medido y separados del centro; caen más de lo que suben
  const bustY = info.chestY - H * 0.012
  const bustX = H * 0.052
  const amount = THREE.MathUtils.clamp(cup / 16, 0.35, 2.2) * H * 0.04
  const sx = H * 0.037
  const syUp = H * 0.052
  const syDown = H * 0.03

  // Siluetas: factor de anchura (x) a cada altura
  const keys: [number, number][] = [
    [info.kneeY, 1],
    [info.crotchY, 1.05],
    [info.hipsY - H * 0.01, 1.1],
    [info.waistY, 0.86],
    [info.chestY, 0.95],
    [info.armY - H * 0.01, 0.86],
    [info.neckY - H * 0.005, 0.86],
    [info.neckY + H * 0.03, 1],
  ]
  const widthAt = (y: number) => {
    if (y <= keys[0][0]) return 1
    for (let i = 1; i < keys.length; i++) {
      if (y <= keys[i][0]) return THREE.MathUtils.lerp(keys[i - 1][1], keys[i][1], THREE.MathUtils.smoothstep(y, keys[i - 1][0], keys[i][0]))
    }
    return 1
  }
  const xs = info.shoulderX * 0.8
  const armBlend = info.shoulderX * 0.3

  for (let i = 0; i < src.length; i += 3) {
    let x = src[i]
    let y = src[i + 1]
    let z = src[i + 2]
    const ax = Math.abs(x)
    // Brazos (en T): se acercan con el hombro, sin cambiar de forma
    const arm = y > info.chestY ? THREE.MathUtils.smoothstep(ax, xs, xs + armBlend) : 0
    const w = widthAt(y)
    const zw = 1 + (w - 1) * 0.45
    const torsoX2 = x * w
    const armX = Math.sign(x) * (xs * widthAt(info.armY - H * 0.01) + (ax - xs))
    x = THREE.MathUtils.lerp(torsoX2, armX, arm)
    z = z * THREE.MathUtils.lerp(zw, 1, arm)

    if (arm < 0.5 && ax < torsoX) {
      // Pecho: volumen hacia delante en la parte delantera del torso
      const front = THREE.MathUtils.smoothstep(src[i + 2], chest.zc, chest.zMax - (chest.zMax - chest.zc) * 0.25)
      if (front > 0) {
        const dx = ax - bustX
        const dy = src[i + 1] - bustY
        const g = Math.exp(-(dx * dx) / (2 * sx * sx) - (dy * dy) / (2 * (dy > 0 ? syUp : syDown) ** 2))
        // Perfil redondeado (lleno en el centro en vez de en punta)
        const dome = 1 - (1 - g) ** 2.2
        const push = amount * dome * front
        z += push
        // Un poco hacia fuera y hacia abajo, para que no queden como dos conos
        x += Math.sign(x) * push * 0.18
        y -= push * 0.22
      }
      // Glúteos: volumen hacia atrás a la altura de la cadera
      const back = 1 - THREE.MathUtils.smoothstep(src[i + 2], hip.zMin + (hip.zc - hip.zMin) * 0.3, hip.zc)
      if (back > 0) {
        const dx = ax - H * 0.045
        const dy = src[i + 1] - (info.hipsY - H * 0.015)
        const g = Math.exp(-(dx * dx) / (2 * (H * 0.04) ** 2) - (dy * dy) / (2 * (H * 0.045) ** 2))
        z -= H * 0.022 * g * back
      }
    }
    out[i] = x
    out[i + 1] = y
    out[i + 2] = z
  }
  return out
}

/** Suaviza el torso (como lijarlo): cada punto se acerca a la media de sus vecinos, más en el pecho y el vientre. */
function smoothTorso(src: Float32Array, index: ArrayLike<number>, info: ModelInfo): Float32Array {
  const H = info.height
  const count = src.length / 3
  // Los vértices repetidos (costuras de la textura) se tratan como uno
  const group = new Int32Array(count)
  const ids = new Map<string, number>()
  for (let i = 0; i < count; i++) {
    const k = `${Math.round(src[i * 3] * 100)},${Math.round(src[i * 3 + 1] * 100)},${Math.round(src[i * 3 + 2] * 100)}`
    let g = ids.get(k)
    if (g === undefined) {
      g = ids.size
      ids.set(k, g)
    }
    group[i] = g
  }
  const n = ids.size
  const pos = new Float32Array(n * 3)
  for (let i = 0; i < count; i++) pos.set(src.subarray(i * 3, i * 3 + 3), group[i] * 3)
  const neighbors: Set<number>[] = Array.from({ length: n }, () => new Set())
  for (let t = 0; t + 2 < index.length; t += 3) {
    const a = group[index[t]]
    const b = group[index[t + 1]]
    const c = group[index[t + 2]]
    neighbors[a].add(b).add(c)
    neighbors[b].add(a).add(c)
    neighbors[c].add(a).add(b)
  }
  // Cuánto se suaviza cada punto: el torso entre la cintura y las axilas, sobre todo por delante
  const weight = new Float32Array(n)
  for (let g = 0; g < n; g++) {
    const x = Math.abs(pos[g * 3])
    const y = pos[g * 3 + 1]
    const z = pos[g * 3 + 2]
    if (x > info.shoulderX * 0.75 || y < info.waistY - H * 0.06 || y > info.armY - H * 0.005) continue
    const band = Math.min(THREE.MathUtils.smoothstep(y, info.waistY - H * 0.06, info.waistY), 1 - THREE.MathUtils.smoothstep(y, info.armY - H * 0.03, info.armY - H * 0.005))
    weight[g] = band * (z > 0 ? 0.6 : 0.25)
  }
  let cur = pos
  for (let it = 0; it < 10; it++) {
    const next = new Float32Array(cur)
    for (let g = 0; g < n; g++) {
      const w = weight[g]
      if (!w || !neighbors[g].size) continue
      let ax = 0
      let ay = 0
      let az = 0
      for (const m of neighbors[g]) {
        ax += cur[m * 3]
        ay += cur[m * 3 + 1]
        az += cur[m * 3 + 2]
      }
      const k = neighbors[g].size
      next[g * 3] += (ax / k - cur[g * 3]) * w
      next[g * 3 + 1] += (ay / k - cur[g * 3 + 1]) * w
      next[g * 3 + 2] += (az / k - cur[g * 3 + 2]) * w
    }
    cur = next
  }
  const out = new Float32Array(src.length)
  for (let i = 0; i < count; i++) out.set(cur.subarray(group[i] * 3, group[i] * 3 + 3), i * 3)
  return out
}

/**
 * Normales suaves de una malla deformada, sumando las caras de todos los vértices que están en el mismo sitio
 * (las mallas de Mixamo repiten vértices en las costuras de la textura; así no se ven cortes en la luz).
 */
export function smoothNormals(geometry: THREE.BufferGeometry) {
  const pos = geometry.attributes.position as THREE.BufferAttribute
  const index = geometry.index
  const count = pos.count
  const key = new Int32Array(count)
  const map = new Map<string, number>()
  const bind = geometry.userData.bindKey as Int32Array | undefined
  if (bind && bind.length === count) key.set(bind)
  else {
    for (let i = 0; i < count; i++) {
      const k = `${Math.round(pos.getX(i) * 100)},${Math.round(pos.getY(i) * 100)},${Math.round(pos.getZ(i) * 100)}`
      let id = map.get(k)
      if (id === undefined) {
        id = map.size
        map.set(k, id)
      }
      key[i] = id
    }
    geometry.userData.bindKey = key
  }
  const groups = (bind ?? key).reduce((m, v) => Math.max(m, v), 0) + 1
  const acc = new Float32Array(groups * 3)
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const tris = index ? index.count / 3 : count / 3
  for (let t = 0; t < tris; t++) {
    const i0 = index ? index.getX(t * 3) : t * 3
    const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1
    const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2
    a.fromBufferAttribute(pos, i0)
    b.fromBufferAttribute(pos, i1)
    c.fromBufferAttribute(pos, i2)
    const n = c.sub(b).cross(a.sub(b))
    for (const i of [i0, i1, i2]) {
      const g = key[i] * 3
      acc[g] += n.x
      acc[g + 1] += n.y
      acc[g + 2] += n.z
    }
  }
  const normal = geometry.attributes.normal as THREE.BufferAttribute
  for (let i = 0; i < count; i++) {
    const g = key[i] * 3
    const l = Math.hypot(acc[g], acc[g + 1], acc[g + 2]) || 1
    normal.setXYZ(i, acc[g] / l, acc[g + 1] / l, acc[g + 2] / l)
  }
  normal.needsUpdate = true
}

function sliceHasCenter(pos: Float32Array, y: number) {
  for (let i = 0; i < pos.length; i += 3) {
    if (Math.abs(pos[i + 1] - y) < 0.6 && Math.abs(pos[i]) < 1.2) return true
  }
  return false
}

/** Contorno de una franja horizontal fina: perímetro de su envolvente convexa, como una cinta métrica. */
function slicePerimeter(pos: Float32Array, y: number, maxAbsX: number) {
  const pts: [number, number][] = []
  for (let i = 0; i < pos.length; i += 3) {
    if (Math.abs(pos[i + 1] - y) < 0.8 && Math.abs(pos[i]) < maxAbsX) pts.push([pos[i], pos[i + 2]])
  }
  if (pts.length < 8) return null
  const hull = convexHull(pts)
  let perimeter = 0
  for (let i = 0; i < hull.length; i++) {
    const [ax, az] = hull[i]
    const [bx, bz] = hull[(i + 1) % hull.length]
    perimeter += Math.hypot(bx - ax, bz - az)
  }
  return perimeter
}

export function convexHull(points: [number, number][]) {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: [number, number][] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: [number, number][] = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1))
}
