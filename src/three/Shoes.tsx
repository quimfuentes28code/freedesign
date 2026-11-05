import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { ShoeStyle } from '../types'
import type { Model } from './Avatar'
import { boneName, jointPosition } from './body'
import type { Cloud } from './wrap'

/**
 * Calzado del maniquí: zapatilla alta de baloncesto, bota de trabajo y zapatilla de skate gruesa. Cada zapato se
 * construye alrededor del pie del maniquí (medido sobre su malla, en cm del modelo) y va unido a los huesos del pie,
 * de los dedos y, la caña, al de la pierna, así sigue la pose y la animación. El modelo mira hacia +Z.
 */

type Rgb = [number, number, number]
const rgb = (hex: string): Rgb => {
  const c = new THREE.Color(hex)
  return [c.r, c.g, c.b]
}

interface Palette {
  /** Color del corte según dónde está: s (talón 0 → puntera 1), v (abajo 0 → arriba 1). */
  upper: (s: number, v: number) => Rgb
  /** Suela según la altura (0 abajo → 1 arriba). */
  sole: (v: number) => Rgb
  shaft: (v: number) => Rgb
  collar: string
  laces: string
  eyelets: string | null
  tongue: string
}

interface StyleDef {
  /** Grosor de la suela y cuánto sobresale del corte. */
  sole: number
  soleOut: number
  /** Anchura y altura extra del corte (las de skate son muy acolchadas). */
  puff: number
  lift: number
  /** Altura de la caña (0 = zapatilla baja). */
  shaft: number
  /** Puntera redondeada y alta (bota). */
  toeHeight: number
  laceRows: number
  palette: Palette
  roughness: number
}

const band = (v: number, a: number, b: number) => v >= a && v < b

const STYLES: Record<ShoeStyle, StyleDef> = {
  // Alta de baloncesto: piel blanca con puntera, talón y caña en rojo y el cuello negro, suela de taza blanca
  baloncesto: {
    sole: 2.6,
    soleOut: 0.35,
    puff: 0.5,
    lift: 0.6,
    shaft: 15,
    toeHeight: 4.6,
    laceRows: 9,
    roughness: 0.5,
    palette: {
      upper: (s, v) => (s > 0.8 || s < 0.22 || (band(s, 0.42, 0.76) && v > 0.78) ? rgb('#b3202a') : rgb('#f4f1ea')),
      sole: (v) => (v < 0.3 ? rgb('#b3202a') : rgb('#f6f3ec')),
      shaft: (v) => (v > 0.55 ? rgb('#141414') : rgb('#b3202a')),
      collar: '#141414',
      laces: '#f4f1ea',
      eyelets: null,
      tongue: '#f4f1ea',
    },
  },
  // Bota de trabajo: nobuk color trigo, cuello acolchado marrón, ojales dorados y suela gruesa de tacos
  bota: {
    sole: 3.4,
    soleOut: 0.55,
    puff: 0.8,
    lift: 1,
    shaft: 16,
    toeHeight: 6.2,
    laceRows: 8,
    roughness: 0.92,
    palette: {
      upper: (s, v) => (band(s, 0.7, 0.72) && v < 0.85 ? rgb('#6b4524') : rgb('#c68c3f')),
      sole: (v) => (v > 0.72 ? rgb('#a8733a') : rgb('#3a2a1f')),
      shaft: (v) => (band(v, 0.48, 0.5) ? rgb('#6b4524') : rgb('#c68c3f')),
      collar: '#4a2f1d',
      laces: '#7a4f28',
      eyelets: '#b8893a',
      tongue: '#c68c3f',
    },
  },
  // Skate gruesa: corte muy acolchado negro con paneles grises, lengüeta gorda y suela blanca alta con una franja gris
  skate: {
    sole: 3.2,
    soleOut: 0.6,
    puff: 1.5,
    lift: 1.6,
    shaft: 0,
    toeHeight: 5.6,
    laceRows: 6,
    roughness: 0.65,
    palette: {
      upper: (s, v) => (s > 0.82 || (s < 0.24 && v > 0.25) ? rgb('#6f6f6f') : band(v, 0.0, 0.12) ? rgb('#2a2a2a') : rgb('#1b1b1b')),
      sole: (v) => (band(v, 0.45, 0.6) ? rgb('#7d7d7d') : v < 0.12 ? rgb('#2b2b2b') : rgb('#f2f0eb')),
      shaft: () => rgb('#1b1b1b'),
      collar: '#2a2a2a',
      laces: '#f2f0eb',
      eyelets: null,
      tongue: '#1b1b1b',
    },
  },
}

export const SHOE_STYLES: { id: ShoeStyle; label: string }[] = [
  { id: 'baloncesto', label: 'Alta de baloncesto' },
  { id: 'bota', label: 'Bota de trabajo' },
  { id: 'skate', label: 'Skate gruesa' },
]

// --- Medir el pie ---

interface FootFrame {
  /** Talón (centro, en el suelo) y dirección del pie (ángulo sobre Y). */
  heel: THREE.Vector2
  angle: number
  length: number
  /** Por tramos del talón a la puntera: centro lateral, media anchura y altura del pie. */
  center: number[]
  half: number[]
  top: number[]
  /** Tobillo: centro y radios de la pierna justo encima. */
  ankle: THREE.Vector3
  legR: [number, number]
  bones: { foot: number; toe: number; leg: number }
  toeZ: number
}

const BINS = 24

function measureFoot(cloud: Cloud, skeleton: THREE.Skeleton, side: 'Left' | 'Right'): FootFrame | null {
  const index = (n: string) => skeleton.bones.findIndex((b) => boneName(b.name) === n)
  const bones = { foot: index(`${side}Foot`), toe: index(`${side}ToeBase`), leg: index(`${side}Leg`) }
  if (bones.foot < 0) return null
  const { pos, skinIndex, skinWeight } = cloud
  const dominant = (i: number) => {
    let best = 0
    for (let k = 1; k < 4; k++) if (skinWeight[i * 4 + k] > skinWeight[i * 4 + best]) best = k
    return skinIndex[i * 4 + best]
  }
  const ankle = jointPosition(skeleton, `${side}Foot`)
  const foot: number[] = []
  const leg: number[] = []
  for (let i = 0; i < pos.length / 3; i++) {
    const d = dominant(i)
    if (d === bones.foot || d === bones.toe) foot.push(i)
    else if (d === bones.leg) leg.push(i)
  }
  if (foot.length < 20) return null

  // Talón y puntera: los extremos en Z, y la dirección entre sus centros
  let z0 = Infinity
  let z1 = -Infinity
  for (const i of foot) {
    z0 = Math.min(z0, pos[i * 3 + 2])
    z1 = Math.max(z1, pos[i * 3 + 2])
  }
  const avgX = (from: number, to: number) => {
    let s = 0
    let n = 0
    for (const i of foot) {
      const z = pos[i * 3 + 2]
      if (z >= from && z <= to && pos[i * 3 + 1] < 4) {
        s += pos[i * 3]
        n++
      }
    }
    return n ? s / n : ankle.x
  }
  const hx = avgX(z0, z0 + 4)
  const tx = avgX(z1 - 4, z1)
  const angle = Math.atan2(tx - hx, z1 - z0)
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const heel = new THREE.Vector2(hx, z0)
  const local = (x: number, z: number) => [(x - hx) * cos - (z - z0) * sin, (x - hx) * sin + (z - z0) * cos] as const
  let length = 0
  for (const i of foot) length = Math.max(length, local(pos[i * 3], pos[i * 3 + 2])[1])

  // Perfil por tramos
  const lo = new Array(BINS).fill(Infinity)
  const hi = new Array(BINS).fill(-Infinity)
  const top = new Array(BINS).fill(0)
  for (const i of foot) {
    const [lx, lz] = local(pos[i * 3], pos[i * 3 + 2])
    const b = Math.min(BINS - 1, Math.max(0, Math.floor((lz / length) * BINS)))
    lo[b] = Math.min(lo[b], lx)
    hi[b] = Math.max(hi[b], lx)
    // La altura del pie cuenta hasta el tobillo (lo de encima ya es pierna)
    top[b] = Math.max(top[b], Math.min(pos[i * 3 + 1], ankle.y + 3))
  }
  for (let b = 0; b < BINS; b++) {
    if (lo[b] === Infinity) {
      const p = b > 0 ? b - 1 : b + 1
      lo[b] = lo[p] === Infinity ? -3 : lo[p]
      hi[b] = hi[p] === -Infinity ? 3 : hi[p]
      top[b] = top[p] || 5
    }
  }
  const smooth = (a: number[]) => a.map((_, i) => (a[Math.max(0, i - 1)] + a[i] * 2 + a[Math.min(BINS - 1, i + 1)]) / 4)
  const center = smooth(lo.map((l, i) => (l + hi[i]) / 2))
  const half = smooth(lo.map((l, i) => (hi[i] - l) / 2))

  // Pierna encima del tobillo: radios en X y Z
  let rx = 4
  let rz = 4
  for (const i of leg) {
    const y = pos[i * 3 + 1]
    if (y < ankle.y + 2 || y > ankle.y + 14) continue
    rx = Math.max(rx, Math.abs(pos[i * 3] - ankle.x))
    rz = Math.max(rz, Math.abs(pos[i * 3 + 2] - ankle.z))
  }
  const toeJ = jointPosition(skeleton, `${side}ToeBase`)
  return { heel, angle, length, center, half, top: smooth(top), ankle, legR: [rx, rz], bones, toeZ: local(toeJ.x, toeJ.z)[1] }
}

const lerpBins = (a: number[], s: number) => {
  const f = Math.min(BINS - 1.001, Math.max(0, s * BINS - 0.5))
  const i = Math.floor(f)
  return a[i] + (a[Math.min(BINS - 1, i + 1)] - a[i]) * (f - i)
}
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

// --- Construir la geometría ---

/** Acumula vértices con color y pesos de hueso, y los convierte en una malla con piel. */
class Builder {
  pos: number[] = []
  col: number[] = []
  skinI: number[] = []
  skinW: number[] = []
  idx: number[] = []
  constructor(private ff: FootFrame) {}
  /** Del sistema del zapato (x lateral, y altura, z del talón a la puntera) al del modelo. */
  world(x: number, y: number, z: number): [number, number, number] {
    const { heel, angle } = this.ff
    const c = Math.cos(angle)
    const s = Math.sin(angle)
    return [heel.x + x * c + z * s, y, heel.y - x * s + z * c]
  }
  vertex(x: number, y: number, z: number, color: Rgb, local = true) {
    const p = local ? this.world(x, y, z) : [x, y, z]
    this.pos.push(p[0], p[1], p[2])
    this.col.push(...color)
    const { bones, ankle, toeZ } = this.ff
    // Delante de los dedos se dobla con el hueso de los dedos; por encima del tobillo, con la pierna
    const toe = bones.toe >= 0 && local ? smoothstep(toeZ - 1.5, toeZ + 1.5, z) : 0
    const legW = bones.leg >= 0 ? smoothstep(ankle.y + 1, ankle.y + 9, p[1]) * 0.85 : 0
    const footW = Math.max(0, 1 - toe - legW)
    this.skinI.push(bones.foot, Math.max(0, bones.toe), Math.max(0, bones.leg), 0)
    this.skinW.push(footW, toe, legW, 0)
    return this.pos.length / 3 - 1
  }
  /** Tubo de anillos (cada anillo con el mismo número de puntos), con las dos puntas cerradas. */
  loft(rings: { pts: [number, number, number][]; colors: Rgb[] }[], local = true, capStart = true, capEnd = true) {
    const m = rings[0].pts.length
    const base = this.pos.length / 3
    for (const r of rings) r.pts.forEach((p, k) => this.vertex(p[0], p[1], p[2], r.colors[k], local))
    for (let r = 0; r < rings.length - 1; r++) {
      for (let k = 0; k < m; k++) {
        const a = base + r * m + k
        const b = base + r * m + ((k + 1) % m)
        const c = a + m
        const d = b + m
        // Caras hacia fuera en los tubos a lo largo del pie (los de la caña se ven por los dos lados)
        this.idx.push(a, b, c, b, d, c)
      }
    }
    const cap = (r: number, flip: boolean) => {
      const ring = rings[r]
      const cen = ring.pts.reduce((acc, p) => [acc[0] + p[0] / m, acc[1] + p[1] / m, acc[2] + p[2] / m], [0, 0, 0])
      const ci = this.vertex(cen[0], cen[1], cen[2], ring.colors[0], local)
      for (let k = 0; k < m; k++) {
        const a = base + r * m + k
        const b = base + r * m + ((k + 1) % m)
        if (flip) this.idx.push(ci, b, a)
        else this.idx.push(ci, a, b)
      }
    }
    if (capStart) cap(0, true)
    if (capEnd) cap(rings.length - 1, false)
  }
  /** Caja pequeña (cordones, ojales) en el sistema del zapato, centrada y girada sobre X. */
  box(cx: number, cy: number, cz: number, w: number, h: number, d: number, tilt: number, color: Rgb) {
    const corners: [number, number, number][] = []
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      const y = (sy * h) / 2
      const z = (sz * d) / 2
      corners.push([cx + (sx * w) / 2, cy + y * Math.cos(tilt) - z * Math.sin(tilt), cz + y * Math.sin(tilt) + z * Math.cos(tilt)])
    }
    const base = this.pos.length / 3
    for (const c of corners) this.vertex(c[0], c[1], c[2], color)
    const f = [
      [0, 1, 3, 2],
      [4, 6, 7, 5],
      [0, 4, 5, 1],
      [2, 3, 7, 6],
      [0, 2, 6, 4],
      [1, 5, 7, 3],
    ]
    for (const [a, b, c, d] of f) this.idx.push(base + a, base + b, base + c, base + a, base + c, base + d)
  }
  geometry() {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3))
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.skinI, 4))
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.skinW, 4))
    g.setIndex(this.idx)
    g.computeVertexNormals()
    return g
  }
}

/** Punto de un anillo «superelipse»: plano abajo y redondeado arriba (p mayor = más cuadrado). */
const ring = (cx: number, z: number, a: number, yb: number, yt: number, phi: number, p: number): [number, number, number] => {
  const c = Math.cos(phi)
  const s = Math.sin(phi)
  const x = cx + a * Math.sign(c) * Math.abs(c) ** (2 / p)
  const y = yb + (yt - yb) * (0.5 + 0.5 * Math.sign(s) * Math.abs(s) ** (2 / p))
  return [x, y, z]
}

const SECTIONS = 44
const AROUND = 36

function buildShoe(ff: FootFrame, st: StyleDef): { upper: THREE.BufferGeometry; sole: THREE.BufferGeometry } {
  const upperB = new Builder(ff)
  const soleB = new Builder(ff)
  const heelPad = 0.7
  const toePad = 1.6 + st.puff * 0.4
  const L = ff.length + heelPad + toePad
  const zAt = (s: number) => -heelPad + s * L
  const footS = (s: number) => Math.min(1, Math.max(0, zAt(s) / ff.length))
  // Puntas redondeadas: la sección se estrecha al llegar al talón y a la puntera
  const ends = (s: number) => {
    const rh = 0.09
    const rt = 0.17
    if (s < rh) return Math.sqrt(Math.max(0, 1 - ((rh - s) / rh) ** 2))
    if (s > 1 - rt) return Math.sqrt(Math.max(0, 1 - ((s - (1 - rt)) / rt) ** 2))
    return 1
  }
  const half = (s: number) => lerpBins(ff.half, footS(s)) + 0.45 + st.puff * 0.5
  const top = (s: number) => {
    const foot = lerpBins(ff.top, footS(s)) + 0.9 + st.lift * 0.6
    // Puntera: al menos la altura del estilo (las botas la llevan alta y redonda)
    const toe = s > 0.6 ? st.sole + st.toeHeight * (0.75 + 0.25 * ends(s)) : 0
    return Math.max(foot, toe)
  }

  // Corte
  const upperRings: { pts: [number, number, number][]; colors: Rgb[] }[] = []
  for (let i = 0; i <= SECTIONS; i++) {
    const s = i / SECTIONS
    const e = Math.max(0.02, ends(s))
    const a = half(s) * e
    const cx = lerpBins(ff.center, footS(s))
    const yb = 0.4
    const yt = yb + (top(s) - yb) * (0.45 + 0.55 * e)
    const pts: [number, number, number][] = []
    const colors: Rgb[] = []
    for (let k = 0; k < AROUND; k++) {
      const phi = (k / AROUND) * Math.PI * 2 - Math.PI / 2
      const p = ring(cx, zAt(s), a, yb, yt, phi, 2.4)
      pts.push(p)
      colors.push(st.palette.upper(s, (p[1] - yb) / Math.max(0.1, yt - yb)))
    }
    upperRings.push({ pts, colors })
  }
  upperB.loft(upperRings)

  // Suela: más ancha que el corte, casi cuadrada de sección
  const soleRings: { pts: [number, number, number][]; colors: Rgb[] }[] = []
  for (let i = 0; i <= SECTIONS; i++) {
    const s = i / SECTIONS
    const e = Math.max(0.02, ends(s))
    const a = (half(s) + st.soleOut) * e
    const cx = lerpBins(ff.center, footS(s))
    // La puntera se levanta un poco (como al andar)
    const spring = smoothstep(0.82, 1, s) * 0.8
    const pts: [number, number, number][] = []
    const colors: Rgb[] = []
    for (let k = 0; k < AROUND; k++) {
      const phi = (k / AROUND) * Math.PI * 2 - Math.PI / 2
      const p = ring(cx, zAt(s) + (s > 0.5 ? 0.25 : -0.25) * (1 - e), a, -0.05 + spring, st.sole + spring * 0.6, phi, 7)
      pts.push(p)
      colors.push(st.palette.sole((p[1] + 0.05 - spring) / st.sole))
    }
    soleRings.push({ pts, colors })
  }
  soleB.loft(soleRings)

  // Caña (botas y zapatillas altas): un tubo alrededor del tobillo, abierto arriba
  const [rx, rz] = ff.legR
  const ankleLocal = (() => {
    const c = Math.cos(ff.angle)
    const s = Math.sin(ff.angle)
    const dx = ff.ankle.x - ff.heel.x
    const dz = ff.ankle.z - ff.heel.y
    return { x: dx * c - dz * s, z: dx * s + dz * c }
  })()
  const collarY = st.shaft ? st.shaft : top(0.12) + 0.4
  const shaftR: [number, number] = [rx + 1 + st.puff * 0.4, rz + 1.2 + st.puff * 0.4]
  if (st.shaft) {
    const rings: { pts: [number, number, number][]; colors: Rgb[] }[] = []
    // Empieza dentro del corte, a media altura del empeine, para que no tape el pie
    const y0 = Math.max(4, top(0.15) * 0.7)
    const steps = 10
    for (let j = 0; j <= steps; j++) {
      const v = j / steps
      const y = y0 + (collarY - y0) * v
      // Se estrecha un poco hacia arriba y se abre en la base para unirse al corte
      const k = 1 + 0.08 * (1 - smoothstep(0, 0.3, v)) - 0.05 * v
      const pts: [number, number, number][] = []
      const colors: Rgb[] = []
      for (let i = 0; i < AROUND; i++) {
        const phi = (i / AROUND) * Math.PI * 2
        pts.push([ankleLocal.x + Math.cos(phi) * shaftR[0] * k, y, ankleLocal.z - 0.6 + Math.sin(phi) * shaftR[1] * k * (phi > 0 && phi < Math.PI ? 1.15 : 1)])
        colors.push(st.palette.shaft(v))
      }
      rings.push({ pts, colors })
    }
    upperB.loft(rings, true, false, false)
  }

  // Cuello acolchado alrededor de la pierna
  {
    const tube = st.shaft ? 0.9 : 1.1 + st.puff * 0.3
    const rings: { pts: [number, number, number][]; colors: Rgb[] }[] = []
    const cr: [number, number] = st.shaft ? [shaftR[0] * 0.95, shaftR[1] * 0.95] : [rx + 0.9, rz + 1]
    const col = rgb(st.palette.collar)
    const around = 28
    for (let j = 0; j <= around; j++) {
      const theta = (j / around) * Math.PI * 2
      const pts: [number, number, number][] = []
      const colors: Rgb[] = []
      for (let i = 0; i < 10; i++) {
        const phi = (i / 10) * Math.PI * 2
        const rr = 1 + (Math.cos(phi) * tube) / Math.max(cr[0], cr[1])
        pts.push([ankleLocal.x + Math.cos(theta) * cr[0] * rr, collarY + Math.sin(phi) * tube, ankleLocal.z - 0.6 + Math.sin(theta) * cr[1] * rr])
        colors.push(col)
      }
      rings.push({ pts, colors })
    }
    upperB.loft(rings, true, false, false)
  }

  // Lengüeta y cordones por el empeine (y por delante de la caña)
  const tongueCol = rgb(st.palette.tongue)
  const laceCol = rgb(st.palette.laces)
  const eyeCol = st.palette.eyelets ? rgb(st.palette.eyelets) : null
  const sA = 0.38
  const sB = 0.74
  const footRows = Math.max(3, Math.round(st.laceRows * (st.shaft ? 0.55 : 1)))
  for (let r = 0; r < footRows; r++) {
    const s = sB - ((sB - sA) * r) / Math.max(1, footRows - 1)
    const cx = lerpBins(ff.center, footS(s))
    const y = top(s) * (0.45 + 0.55 * ends(s)) + 0.2
    const w = half(s) * 1.1
    const slope = Math.atan2(top(s + 0.02) - top(s - 0.02), L * 0.04)
    upperB.box(cx, y + 0.15, zAt(s), w * 0.5, 0.35, 1.6, -slope, tongueCol)
    upperB.box(cx, y + 0.45, zAt(s), w, 0.22, 0.45, -slope, laceCol)
    if (eyeCol) {
      upperB.box(cx - w / 2, y + 0.3, zAt(s), 0.5, 0.5, 0.5, -slope, eyeCol)
      upperB.box(cx + w / 2, y + 0.3, zAt(s), 0.5, 0.5, 0.5, -slope, eyeCol)
    }
  }
  if (st.shaft) {
    const rows = st.laceRows - footRows
    for (let r = 0; r < rows; r++) {
      const y = 7 + ((collarY - 8) * (r + 1)) / Math.max(1, rows)
      const z = ankleLocal.z - 0.6 + shaftR[1] * 1.12 + 0.15
      upperB.box(ankleLocal.x, y, z, shaftR[0] * 0.9, 0.22, 0.45, 0, laceCol)
      upperB.box(ankleLocal.x, y - 0.3, z - 0.15, shaftR[0] * 0.55, 0.7, 0.3, 0, tongueCol)
      if (eyeCol) {
        upperB.box(ankleLocal.x - shaftR[0] * 0.45, y, z - 0.1, 0.5, 0.5, 0.5, 0, eyeCol)
        upperB.box(ankleLocal.x + shaftR[0] * 0.45, y, z - 0.1, 0.5, 0.5, 0.5, 0, eyeCol)
      }
    }
    // La lengüeta asoma por encima del cuello
    upperB.box(ankleLocal.x, collarY + 0.9, ankleLocal.z - 0.6 + shaftR[1] * 1.05, shaftR[0] * 0.7, 2.4, 0.6, 0.12, tongueCol)
  } else {
    // Zapatilla baja: lengüeta gorda que sale por delante del tobillo
    const s = sA - 0.04
    upperB.box(lerpBins(ff.center, footS(s)), top(s) + 1.2, zAt(s) - 0.6, half(s) * 0.9, 3.2 + st.puff, 1.4 + st.puff * 0.5, 0.35, tongueCol)
  }

  return { upper: upperB.geometry(), sole: soleB.geometry() }
}

/** Zapatos puestos en el maniquí (se añaden a su esqueleto como la ropa). */
export function Shoes({ model, cloud, style }: { model: Model; cloud: Cloud; style: ShoeStyle }) {
  const st = STYLES[style]
  const parts = useMemo(() => {
    const skeleton = model.body.skeleton
    return (['Left', 'Right'] as const).flatMap((side) => {
      const ff = measureFoot(cloud, skeleton, side)
      return ff ? [buildShoe(ff, st)] : []
    })
  }, [model, cloud, st])
  const materials = useMemo(
    () => ({
      upper: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: st.roughness, side: THREE.DoubleSide }),
      sole: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }),
    }),
    [st],
  )
  useEffect(() => {
    const meshes = parts.flatMap(({ upper, sole }) =>
      [
        [upper, materials.upper],
        [sole, materials.sole],
      ].map(([g, m]) => {
        const mesh = new THREE.SkinnedMesh(g as THREE.BufferGeometry, m as THREE.Material)
        mesh.castShadow = true
        mesh.receiveShadow = true
        mesh.frustumCulled = false
        mesh.bind(model.body.skeleton, model.body.bindMatrix)
        model.root.add(mesh)
        return mesh
      }),
    )
    return () => meshes.forEach((m) => model.root.remove(m))
  }, [parts, materials, model])
  useEffect(() => () => parts.forEach((p) => (p.upper.dispose(), p.sole.dispose())), [parts])
  return null
}
