import * as THREE from 'three'
import type { Design, Measurements } from '../../types'
import type { ModelInfo } from '../body'
import { Part } from '../pose'
import { Cloth, type Panel } from './Cloth'

/** Holgura en el contorno de pecho según el corte, en cm. */
const EASE = { ajustado: 8, normal: 18, holgado: 32 } as const

export interface HoodieResult {
  cloth: Cloth
  /** Zonas del cuerpo cuyo movimiento sigue cada pieza. */
  follows: Part[][]
  /** Bolsillo canguro en coordenadas del patrón del delantero (cm), si lo lleva. */
  pocket: { panel: number; inside: (x: number, y: number) => boolean } | null
}

interface Body {
  info: ModelInfo
  /** Puntos del cuerpo en la postura en T (ya con las medidas aplicadas). */
  points: Float32Array
  /** Unidades del modelo por cm real. */
  unit: number
}

/**
 * Patrón de una sudadera con capucha, como el de un taller: delantero, espalda, mangas, puños y bajo de canalé,
 * capucha de dos piezas (o cuello de canalé) y bolsillo canguro. Las piezas se colocan alrededor del maniquí
 * en su postura en T y se cosen entre sí; luego `relax` las asienta sobre el cuerpo.
 */
export function buildHoodie(body: Body, m: Measurements, design: Design): HoodieResult {
  const { info, points, unit } = body
  const s = m.height / 172
  const cloth = new Cloth(unit)
  const follows: Part[][] = []
  const add = (panel: Panel, parts: Part[]) => {
    follows[panel.id] = parts
    return panel
  }

  // --- Medidas del patrón (cm) ---
  const ease = EASE[design.fit]
  const bodyC = m.chest + ease
  const W = bodyC / 2 // ancho de delantero y espalda
  const L = design.bodyLength - 7 // largo del cuerpo sin el bajo de canalé
  const neckW = 19 * s
  const frontDrop = 8.5 * s
  const backDrop = 2.5 * s
  const slope = 4 * s
  const armhole = 22 * s + ease * 0.25
  const sleeveTop = armhole * 2
  const sleeveEnd = 25 * s + ease * 0.4
  const sleeveLen = design.sleeveLength - 6
  const cuffC = 19 * s
  const ribH = 7 * s
  const bandC = bodyC * 0.9

  // --- Referencias del cuerpo (unidades del modelo, postura en T) ---
  const topY = info.neckY + 1.5 * unit
  const hemY = topY - L * unit
  const chest = sliceCenter(points, info.chestY, info.shoulderX)
  const cx = 0
  const cz = chest.z
  /** Superficie de la espalda (a la altura del pecho). */
  const backZ = chest.z - chest.depth / 2
  // Elipse del cuerpo de la prenda con el contorno del patrón (más ancha que profunda)
  const ratio = 0.72
  const a = (bodyC * unit) / ellipsePerimeter(1, ratio)
  const b = a * ratio
  // Lo más saliente del cuerpo por delante y por detrás en la zona del bajo (entrepierna, glúteos):
  // la parte baja de la prenda empieza por fuera de ahí
  const low = zExtent(points, hemY - 10 * unit, hemY + 14 * unit, a * 0.7)
  const clampLow = (p: THREE.Vector3) => {
    if (p.y > hemY + 16 * unit) return p
    p.z = p.z >= cz ? Math.max(p.z, low.max + 2 * unit) : Math.min(p.z, low.min - 2 * unit)
    return p
  }
  // Eje de cada brazo (se mide una vez)
  const arms = { [1]: armAxis(points, info, 1), [-1]: armAxis(points, info, -1) }
  const arm = (side: 1 | -1) => arms[side]

  const grid = (length: number, step = 2.2) => Math.max(3, Math.round(length / step) + 1) | 1

  // --- Delantero y espalda ---
  const nu = grid(W)
  const nv = grid(L)
  const yTop = (x: number, drop: number) => {
    const ax = Math.abs(x)
    const neck = ax < neckW / 2 ? drop * Math.sqrt(1 - (ax / (neckW / 2)) ** 2) : 0
    const shoulder = slope * THREE.MathUtils.clamp((ax - neckW / 2) / (W / 2 - neckW / 2), 0, 1)
    return L - neck - shoulder
  }
  // La sisa (borde lateral por encima de la axila) rodea el brazo: media vuelta por delante y media por detrás.
  // Su radio es el de la manga, así manga y cuerpo empiezan ya juntos.
  const sideEdge = L - slope
  const armholeStart = sideEdge - armhole
  const armholeR = (armhole * unit) / Math.PI
  const edgePoint = (side: 1 | -1, towards: 1 | -1, s: number, out: THREE.Vector3) => {
    const c = arm(side).at(side * a)
    const armpitY = c.y - armholeR
    if (s <= armholeStart) return out.set(side * a, hemY + (s / armholeStart) * (armpitY - hemY), cz)
    const phi = ((s - armholeStart) / armhole) * Math.PI
    return out.set(side * a, c.y - Math.cos(phi) * armholeR, c.z + towards * Math.sin(phi) * armholeR)
  }
  const edge = new THREE.Vector3()

  const torsoPanel = (front: boolean) => {
    const drop = front ? frontDrop : backDrop
    const towards = front ? 1 : -1
    return cloth.addPanel({
      nu,
      nv,
      flat: (u, v, out) => {
        const x = (u - 0.5) * W
        out.set(x, v * yTop(x, drop))
      },
      place: (u, v, out) => {
        const x = (u - 0.5) * W
        const y = hemY + v * yTop(x, drop) * unit
        const th = (x / W) * Math.PI
        let z = b * Math.cos(th)
        // Cerca de los hombros delantero y espalda se juntan por encima del cuerpo
        z *= 1 - 0.8 * THREE.MathUtils.smoothstep(y, topY - 14 * unit, topY)
        out.set(cx + a * Math.sin(th), y, cz + towards * z)
        // Cerca del costado, la pieza va hacia la línea de costado y la sisa alrededor del brazo
        const side = x >= 0 ? 1 : -1
        const w = 1 - THREE.MathUtils.smoothstep(W / 2 - Math.abs(x), 0, 10)
        if (w > 0) out.lerp(edgePoint(side, towards, v * sideEdge, edge), w)
        pushOutOfArm(out, info, arm(side), 1.5 * unit, towards)
        if (w < 1) clampLow(out)
      },
    })
  }
  const front = add(torsoPanel(true), [Part.Torso, Part.Neck, Part.ArmL, Part.ArmR])
  const back = add(torsoPanel(false), [Part.Torso, Part.Neck, Part.ArmL, Part.ArmR])

  // Costados (solo por debajo de la sisa) y hombros
  const armpitRow = Math.floor(((L - slope - armhole) / (L - slope)) * (nv - 1))
  for (const i of [0, nu - 1]) {
    cloth.sew(front.col(i).slice(0, armpitRow + 1), back.col(i).slice(0, armpitRow + 1))
  }
  const xOf = (i: number) => (i / (nu - 1) - 0.5) * W
  const topF = front.row(nv - 1)
  const topB = back.row(nv - 1)
  const shoulderIdx = (sign: number) =>
    topF.map((_, i) => i).filter((i) => sign * xOf(i) >= neckW / 2 - 0.01)
  for (const sign of [1, -1]) {
    const idx = shoulderIdx(sign)
    cloth.sew(
      idx.map((i) => topF[i]),
      idx.map((i) => topB[i]),
    )
  }

  // --- Mangas y puños ---
  for (const side of [1, -1] as const) {
    const ax = arm(side)
    const edge = side > 0 ? nu - 1 : 0
    const frontEdge = front.col(edge).slice(armpitRow) // de la axila al hombro
    const backEdge = back.col(edge).slice(armpitRow).reverse() // del hombro a la axila
    const start = ax.at(side * a)
    const ns = grid(sleeveTop, 2)
    const nl = grid(sleeveLen)
    const up = new THREE.Vector3(0, 1, 0).addScaledVector(ax.dir, -ax.dir.y).normalize()
    const fwd = new THREE.Vector3().crossVectors(ax.dir, up).multiplyScalar(side)
    const ring = (center: THREE.Vector3, r: number, u: number, out: THREE.Vector3) => {
      const phi = u * Math.PI * 2
      out.copy(center).addScaledVector(up, -Math.cos(phi) * r).addScaledVector(fwd, Math.sin(phi) * r)
    }
    const circ = (v: number) => THREE.MathUtils.lerp(sleeveTop, sleeveEnd, v)
    const sleeve = add(
      cloth.addPanel({
        nu: ns,
        nv: nl,
        flat: (u, v, out) => out.set((u - 0.5) * circ(v), -v * sleeveLen),
        place: (u, v, out) => {
          const c = start.clone().addScaledVector(ax.dir, v * sleeveLen * unit)
          const r = Math.max((circ(v) * unit) / (2 * Math.PI), ax.radius(c.x) + 1.5 * unit)
          ring(c, r, u, out)
        },
      }),
      [side > 0 ? Part.ArmL : Part.ArmR, Part.Torso],
    )
    const top = sleeve.row(0)
    const mid = (ns - 1) / 2
    cloth.sew(frontEdge, top.slice(0, mid + 1))
    cloth.sew(backEdge, top.slice(mid))
    cloth.sew(sleeve.col(0), sleeve.col(ns - 1)) // costura bajo el brazo

    const end = start.clone().addScaledVector(ax.dir, sleeveLen * unit)
    const nc = grid(cuffC, 1.6)
    const cuff = add(
      cloth.addPanel({
        nu: nc,
        nv: 4,
        material: 1,
        bend: 2,
        flat: (u, v, out) => out.set((u - 0.5) * cuffC, -v * ribH),
        place: (u, v, out) => {
          const c = end.clone().addScaledVector(ax.dir, v * ribH * unit)
          ring(c, Math.max((cuffC * unit) / (2 * Math.PI), ax.radius(c.x) + 1 * unit), u, out)
        },
      }),
      [side > 0 ? Part.ArmL : Part.ArmR, side > 0 ? Part.HandL : Part.HandR],
    )
    cloth.sew(sleeve.row(nl - 1), cuff.row(0))
    cloth.sew(cuff.col(0), cuff.col(nc - 1))
  }

  // --- Bajo de canalé ---
  const hemLoop = [...front.row(0), ...back.row(0).reverse()]
  const loopPoint = (u: number, scale: number, out: THREE.Vector3) => {
    // Recorre delantero (izquierda → derecha) y luego espalda (derecha → izquierda)
    const isFront = u <= 0.5
    const th = isFront ? -Math.PI / 2 + u * 2 * Math.PI : Math.PI / 2 - (u * 2 - 1) * Math.PI
    out.set(cx + a * scale * Math.sin(th), 0, cz + (isFront ? 1 : -1) * b * scale * Math.cos(th))
    return out
  }
  const nb = grid(bandC, 2)
  const band = add(
    cloth.addPanel({
      nu: nb,
      nv: 4,
      material: 1,
      bend: 2,
      flat: (u, v, out) => out.set(u * bandC, v * ribH),
      place: (u, v, out) => {
        loopPoint(u, bandC / bodyC, out)
        out.y = hemY - (1 - v) * ribH * unit
        clampLow(out)
      },
    }),
    [Part.Torso],
  )
  cloth.sew(band.row(3), hemLoop)
  cloth.sew(band.col(0), band.col(nb - 1))

  // --- Cuello: capucha o canalé ---
  const neckIdx = topF.map((_, i) => i).filter((i) => Math.abs(xOf(i)) <= neckW / 2 + 0.01)
  const center = (nu - 1) / 2
  const halfNeck = (side: 1 | -1) => {
    const f = neckIdx.filter((i) => side * (i - center) >= 0).sort((p, q) => side * (p - q))
    return [...f.map((i) => topF[i]), ...[...f].reverse().map((i) => topB[i])]
  }
  const neckLen = Math.PI * 0.5 * (neckW / 2 + (frontDrop + backDrop) / 2) * 2

  if (design.hood) {
    const hoodH = 34 * s
    const hoodD = 26 * s
    const nh = grid(neckLen / 2, 2)
    const nt = grid(hoodH)
    const width = (t: number) =>
      THREE.MathUtils.lerp(neckLen / 2, hoodD, THREE.MathUtils.smoothstep(t, 0, 0.35)) *
      (1 - 0.3 * THREE.MathUtils.smoothstep(t, 0.6, 1))
    const hoods = ([1, -1] as const).map((side) => {
      const neck = halfNeck(side)
      const base = (sParam: number) => {
        const k = sParam * (neck.length - 1)
        const i = Math.min(Math.floor(k), neck.length - 2)
        const f = k - i
        const p = (n: number) => new THREE.Vector3(cloth.pos[n * 3], cloth.pos[n * 3 + 1], cloth.pos[n * 3 + 2])
        return p(neck[i]).lerp(p(neck[i + 1]), f)
      }
      const panel = add(
        cloth.addPanel({
          nu: nh,
          nv: nt,
          flat: (u, v, out) => out.set(side * u * width(v), v * hoodH),
          place: (u, v, out) => {
            // Capucha bajada: desde el cuello sube un poco, se va hacia atrás y cae sobre la espalda.
            // La costura central (borde trasero y borde de arriba) queda en el centro de la espalda (x = 0).
            const p = base(u)
            const toCenter = Math.max(THREE.MathUtils.smoothstep(v, 0.2, 1), u ** 3)
            const rise = 4 * s * unit * Math.sin(Math.min(v / 0.3, 1) * Math.PI * 0.5)
            const fall = THREE.MathUtils.smoothstep(v, 0.25, 1) * hoodH * 0.55 * unit
            const z = THREE.MathUtils.lerp(p.z, backZ - (2 + 3 * Math.sin(Math.PI * v)) * unit, THREE.MathUtils.smoothstep(v, 0, 0.4))
            out.set(p.x * (1 + 0.6 * Math.sin(Math.PI * v)) * (1 - toCenter), p.y + rise - fall, z)
          },
        }),
        [Part.Torso, Part.Neck],
      )
      cloth.sew(panel.row(0), neck)
      return panel
    })
    const [left, right] = hoods
    cloth.sew(left.col(nh - 1), right.col(nh - 1)) // costura de la nuca
    cloth.sew(left.row(nt - 1), right.row(nt - 1)) // costura de arriba
  } else {
    const loop = [...halfNeck(1).slice(0, -1), ...halfNeck(-1).reverse().slice(0, -1)]
    const nn = grid(neckLen, 1.6)
    const pts = loop.map((n) => new THREE.Vector3(cloth.pos[n * 3], cloth.pos[n * 3 + 1], cloth.pos[n * 3 + 2]))
    const collar = add(
      cloth.addPanel({
        nu: nn,
        nv: 3,
        material: 1,
        bend: 2,
        flat: (u, v, out) => out.set(u * neckLen * 0.9, v * 3),
        place: (u, v, out) => {
          const k = u * pts.length
          const i = Math.floor(k) % pts.length
          const p = pts[i].clone().lerp(pts[(i + 1) % pts.length], k - Math.floor(k))
          out.set(p.x * 0.95, p.y + v * 3 * unit, cz + (p.z - cz) * 0.95)
        },
      }),
      [Part.Torso, Part.Neck],
    )
    cloth.sew(collar.row(0), [...loop, loop[0]])
    cloth.sew(collar.col(0), collar.col(nn - 1))
  }

  // --- Bolsillo canguro (trapecio en el delantero, con las aberturas inclinadas a los lados) ---
  const pw = Math.min(38 * s, W * 0.62)
  const ph = 21 * s
  const py = 1.5 * s
  const pocket = design.pocket
    ? {
        panel: front.id,
        inside: (x: number, y: number) => {
          if (y < py || y > py + ph) return false
          const t = (y - py) / ph
          return Math.abs(x) < THREE.MathUtils.lerp(pw / 2, pw * 0.34, t)
        },
      }
    : null

  return { cloth, follows, pocket }
}

/** Perímetro aproximado de una elipse (Ramanujan). */
function ellipsePerimeter(a: number, b: number) {
  return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)))
}

/** Z mínima y máxima del cuerpo entre dos alturas (cerca del centro, |x| < maxX). */
function zExtent(points: Float32Array, y0: number, y1: number, maxX: number) {
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < points.length; i += 3) {
    if (points[i + 1] < y0 || points[i + 1] > y1 || Math.abs(points[i]) > maxX) continue
    min = Math.min(min, points[i + 2])
    max = Math.max(max, points[i + 2])
  }
  return { min, max }
}

/** Centro (en Z) del cuerpo a una altura. */
function sliceCenter(points: Float32Array, y: number, maxX: number) {
  let minZ = Infinity
  let maxZ = -Infinity
  for (let i = 0; i < points.length; i += 3) {
    if (Math.abs(points[i + 1] - y) < 1 && Math.abs(points[i]) < maxX) {
      minZ = Math.min(minZ, points[i + 2])
      maxZ = Math.max(maxZ, points[i + 2])
    }
  }
  return { z: (minZ + maxZ) / 2, depth: maxZ - minZ }
}

interface ArmAxis {
  dir: THREE.Vector3
  /** Punto del eje del brazo a una X dada. */
  at: (x: number) => THREE.Vector3
  /** Radio del brazo a una X dada. */
  radius: (x: number) => number
}

/** Eje y grosor del brazo en la postura en T, medidos sobre la malla. */
function armAxis(points: Float32Array, info: ModelInfo, side: 1 | -1): ArmAxis {
  const ring = (x0: number) => {
    let sy = 0
    let sz = 0
    let n = 0
    const pts: [number, number][] = []
    for (let i = 0; i < points.length; i += 3) {
      if (Math.abs(points[i] - x0) < 1 && points[i + 1] > info.chestY - 4) {
        sy += points[i + 1]
        sz += points[i + 2]
        n++
        pts.push([points[i + 1], points[i + 2]])
      }
    }
    const y = sy / n
    const z = sz / n
    return { p: new THREE.Vector3(x0, y, z), r: Math.max(...pts.map(([py, pz]) => Math.hypot(py - y, pz - z))) }
  }
  const near = ring(side * (info.shoulderX + 5))
  const far = ring(side * (info.shoulderX + 35))
  const dir = far.p.clone().sub(near.p).normalize()
  const t = (x: number) => (x - near.p.x) / (far.p.x - near.p.x)
  return {
    dir,
    at: (x) => near.p.clone().lerp(far.p, t(x)),
    radius: (x) => THREE.MathUtils.lerp(near.r, far.r, THREE.MathUtils.clamp(t(x), 0, 1.3)),
  }
}

/**
 * Si un punto inicial cae dentro del brazo (postura en T), lo saca hacia fuera del brazo:
 * hacia delante para el delantero (`towards` = 1) y hacia atrás para la espalda (-1).
 */
function pushOutOfArm(p: THREE.Vector3, info: ModelInfo, ax: ArmAxis, margin: number, towards: 1 | -1) {
  if (Math.abs(p.x) < info.shoulderX * 0.85 || p.y < info.chestY - 6) return
  const c = ax.at(p.x)
  const r = ax.radius(p.x) + margin
  const dy = p.y - c.y
  let dz = p.z - c.z
  if (Math.hypot(dy, dz) >= r) return
  // Lado del brazo que le toca a esta pieza
  if (dz * towards < r * 0.15) dz = towards * r * 0.15
  const d = Math.hypot(dy, dz)
  p.y = c.y + (dy / d) * r
  p.z = c.z + (dz / d) * r
}
