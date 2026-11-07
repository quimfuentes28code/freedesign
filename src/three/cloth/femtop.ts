import * as THREE from 'three'
import type { Design, GarmentSlot, Measurements } from '../../types'
import type { ModelInfo } from '../body'
import { Part } from '../pose'
import { Cloth, type Panel } from './Cloth'

/**
 * Patrón de un top de mujer: delantero y espalda que rodean el cuerpo desde debajo del brazo hasta su largo, con el
 * escote (recto, en pico, redondo o corazón) en el borde de arriba del delantero, y los tirantes según el tipo:
 * de tirantes y cruzado (sobre los hombros), halter (los dos tirantes se atan detrás del cuello) o sin ellos
 * (palabra de honor y corsé, que se sujetan al pecho). Se arma en la postura en T del maniquí (unidades del modelo);
 * el patrón plano va en cm.
 */

/** Holgura (cm de contorno) según el corte. */
const EASE = { ajustado: 2, regular: 7, holgado: 16 } as const

export interface FemTopResult {
  cloth: Cloth
  follows: Part[][]
  slots: GarmentSlot[]
  /** Puntos que se sujetan a su sitio (el borde de arriba: un top sin tirantes no se escurre). */
  pins: number[]
  rims: { verts: number[]; slot: GarmentSlot; radius: number }[]
}

interface Body {
  info: ModelInfo
  points: Float32Array
  unit: number
}

const ellipsePerimeter = (a: number, b: number) => Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)))

/** Corte del tronco a una altura (sin los brazos, que en T salen a los lados): centro en Z y semiejes. */
function torsoSlice(points: Float32Array, y: number, maxX: number) {
  let x0 = Infinity
  let x1 = -Infinity
  let z0 = Infinity
  let z1 = -Infinity
  for (let i = 0; i < points.length; i += 3) {
    if (Math.abs(points[i + 1] - y) > 1.2 || Math.abs(points[i]) > maxX) continue
    x0 = Math.min(x0, points[i])
    x1 = Math.max(x1, points[i])
    z0 = Math.min(z0, points[i + 2])
    z1 = Math.max(z1, points[i + 2])
  }
  if (!Number.isFinite(x0)) return { z: 0, rx: 15, rz: 11 }
  return { z: (z0 + z1) / 2, rx: (x1 - x0) / 2, rz: (z1 - z0) / 2 }
}

export function buildFemTop(body: Body, m: Measurements, design: Design): FemTopResult {
  const { info, points, unit } = body
  const s = m.height / 165
  const cloth = new Cloth(unit)
  const follows: Part[][] = []
  const slots: GarmentSlot[] = []
  const rims: FemTopResult['rims'] = []
  const add = (panel: Panel, parts: Part[], slot: GarmentSlot) => {
    follows[panel.id] = parts
    slots[panel.id] = slot
    return panel
  }
  const shape = design.femTop ?? { kind: 'tirantes', neckline: 'recto', straps: 'finos', fit: 'ajustado' }
  // Calidad alta: malla más fina (los pasos se multiplican por este factor)
  const res = design.quality === 'alta' ? 0.7 : 1
  const grid = (length: number, step = 1.8) => Math.max(3, Math.round(length / (step * res)) + 1) | 1
  const easeR = EASE[shape.fit] / (2 * Math.PI)

  // --- Alturas: el borde de arriba, por encima del pecho y por debajo de la axila; el bajo, según el largo ---
  const topY = info.chestY + (info.armY - info.chestY) * 0.5
  const L = Math.max(10 * s, design.bodyLength) // cm, de arriba al bajo
  const hemY = topY - L * unit
  const maxX = info.shoulderX * 0.92

  // Contorno a cada altura: el del cuerpo con la holgura (así se ajusta al busto, la cintura y la cadera)
  const rows = grid(L, 1.6)
  const ring = Array.from({ length: rows }, (_, j) => {
    const y = hemY + (j / (rows - 1)) * (topY - hemY)
    const sl = torsoSlice(points, y, maxX)
    const a = sl.rx + (easeR + 0.6) * unit
    const b = sl.rz + (easeR + 0.6) * unit
    return { y, z: sl.z, a, b, half: ellipsePerimeter(a, b) / 2 / unit }
  })
  const at = (v: number) => {
    const k = v * (rows - 1)
    const j = Math.min(rows - 2, Math.floor(k))
    const f = k - j
    const A = ring[j]
    const B = ring[j + 1]
    return { y: A.y + (B.y - A.y) * f, z: A.z + (B.z - A.z) * f, a: A.a + (B.a - A.a) * f, b: A.b + (B.b - A.b) * f, half: A.half + (B.half - A.half) * f }
  }

  // Escote: cuánto baja el borde de arriba del delantero (cm) según dónde (u de costado a costado)
  const dip = (u: number) => {
    const c = Math.abs(u - 0.5) * 2 // 0 en el centro, 1 en el costado
    switch (shape.neckline) {
      case 'pico':
        return 9 * s * Math.max(0, 1 - c / 0.55)
      case 'redondo':
        return 6 * s * Math.sqrt(Math.max(0, 1 - (c / 0.6) ** 2))
      case 'corazon':
        // Dos curvas sobre el pecho y un pico pequeño en medio
        return 4 * s * Math.max(0, 1 - c / 0.14) + 1.2 * s * Math.min(1, c / 0.14) * (1 - Math.min(1, c / 0.7))
      default:
        return 0
    }
  }

  const nu = grid(ring[0].half, 1.8)
  const panel = (front: boolean) =>
    add(
      cloth.addPanel({
        nu,
        nv: rows,
        bend: shape.kind === 'corse' ? 6 : 1,
        edges: { u0: 'plana', u1: 'plana', v0: 'recubierta', v1: 'recubierta' },
        flat: (u, v, out) => {
          const r = at(v)
          const top = front ? L - dip(u) : L
          out.set((u - 0.5) * r.half, v * top)
        },
        place: (u, v, out) => {
          const top = front ? L - dip(u) : L
          const y = hemY + v * top * unit
          const r = at(Math.min(1, (y - hemY) / (topY - hemY)))
          // De costado izquierdo (u = 0) por delante (o por detrás) al derecho
          const th = front ? Math.PI / 2 - u * Math.PI : Math.PI / 2 + u * Math.PI
          out.set(r.a * Math.sin(th), y, r.z + r.b * Math.cos(th))
        },
      }),
      [Part.Torso],
      'cuerpo',
    )
  const F = panel(true)
  const B = panel(false)
  cloth.sew(F.col(0), B.col(0))
  cloth.sew(F.col(nu - 1), B.col(nu - 1))

  const topF = F.row(rows - 1)
  const topB = B.row(rows - 1)
  rims.push({ verts: [...topF, ...topB.slice().reverse().slice(1)], slot: 'cuerpo', radius: 0.25 * s })
  rims.push({ verts: [...F.row(0), ...B.row(0).slice().reverse().slice(1)], slot: 'cuerpo', radius: 0.25 * s })
  const pins = [...topF, ...topB, ...F.row(rows - 2), ...B.row(rows - 2)]

  // --- Tirantes ---
  const pos = (v: number) => new THREE.Vector3(cloth.pos[v * 3], cloth.pos[v * 3 + 1], cloth.pos[v * 3 + 2])
  const neckBase = torsoSlice(points, info.neckY - 2 * unit, info.shoulderX * 0.3)
  const strapW = (shape.straps === 'anchos' ? 3 : 1.1) * s
  const strap = (from: THREE.Vector3, to: THREE.Vector3, over: THREE.Vector3) => {
    // Curva de un extremo a otro pasando por encima de `over` (hombro o nuca)
    const curve = new THREE.QuadraticBezierCurve3(from, over.clone().multiplyScalar(2).sub(from.clone().add(to).multiplyScalar(0.5)), to)
    const len = curve.getLength() / unit
    const nl = grid(len, 1.6)
    const side = new THREE.Vector3(1, 0, 0)
    return add(
      cloth.addPanel({
        nu: 3,
        nv: nl,
        bend: 2,
        edges: { u0: 'recubierta', u1: 'recubierta', v0: 'ninguno', v1: 'ninguno' },
        flat: (u, v, out) => out.set((u - 0.5) * strapW, v * len),
        place: (u, v, out) => out.copy(curve.getPoint(v)).addScaledVector(side, (u - 0.5) * strapW * unit),
      }),
      [Part.Torso, Part.Neck],
      'cuerpo',
    )
  }
  const idx = (u: number) => Math.round(u * (nu - 1))
  if (shape.kind === 'tirantes' || shape.kind === 'cruzado') {
    for (const side of [1, -1] as const) {
      // Tirante sobre el hombro, a medio camino entre el cuello y la punta del hombro
      const uF = side > 0 ? 0.3 : 0.7
      const uB = side > 0 ? 0.3 : 0.7
      const f = topF[idx(uF)]
      const b = topB[idx(uB)]
      const shoulder = new THREE.Vector3(side * (info.shoulderX * 0.55), info.neckY - 1 * unit, neckBase.z)
      const st = strap(pos(f), pos(b), shoulder)
      cloth.sew(st.row(0), [f])
      cloth.sew(st.row(st.nv - 1), [b])
    }
  } else if (shape.kind === 'halter') {
    // Halter: salen del delantero junto al centro y se atan detrás del cuello
    const tie = new THREE.Vector3(0, info.neckY + 2 * unit, neckBase.z - neckBase.rz - 1 * unit)
    const ends: Panel[] = []
    for (const side of [1, -1] as const) {
      const f = topF[idx(side > 0 ? 0.38 : 0.62)]
      const over = new THREE.Vector3(side * 6 * unit, info.neckY + 1 * unit, neckBase.z)
      const st = strap(pos(f), tie.clone().add(new THREE.Vector3(side * 1 * unit, 0, 0)), over)
      cloth.sew(st.row(0), [f])
      ends.push(st)
    }
    cloth.sew(ends[0].row(ends[0].nv - 1), ends[1].row(ends[1].nv - 1))
  }

  return { cloth, follows, slots, pins, rims }
}
