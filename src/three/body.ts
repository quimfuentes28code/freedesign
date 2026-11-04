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

export function fitBody(info: ModelInfo, m: Measurements): BodyFit {
  const k = m.height / info.height
  const f = (target: number, base: number) => THREE.MathUtils.clamp(target / (base * k), 0.6, 1.8)
  return {
    scale: k / 100,
    hips: f(m.hips, info.base.hips),
    waist: f(m.waist, info.base.waist),
    chest: f(m.chest, info.base.chest),
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
    [info.waistY, fit.waist],
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
  for (let i = 0; i < src.length; i += 3) {
    const x = src[i]
    const y = src[i + 1]
    const z = src[i + 2]
    const f = widthFactor(info, fit, y)
    const ax = Math.abs(x)
    // 0 en el torso, 1 en el brazo (solo cuenta a la altura de los brazos en la postura en T)
    const arm = y > info.chestY ? THREE.MathUtils.smoothstep(ax, xs, xs + armBlend) : 0
    const xArm = Math.sign(x) * (xs * f + (ax - xs))
    out[i] = THREE.MathUtils.lerp(x * f, xArm, arm)
    out[i + 1] = y
    out[i + 2] = z * THREE.MathUtils.lerp(f, 1, arm)
  }
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
