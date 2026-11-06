import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { ShoeStyle } from '../types'
import type { Model } from './Avatar'
import { boneName, jointPosition } from './body'
import type { Cloud } from './wrap'

/**
 * Calzado del maniquí: zapatilla alta de baloncesto, bota de trabajo y zapatilla de skate gruesa. Cada zapato se
 * construye alrededor del pie del maniquí (medido sobre su malla, en cm del modelo) con el perfil de una zapatilla de
 * verdad: suela con su canto, puntera baja y redonda, empeine que sube a la garganta, boca abierta con su forro y
 * cuello acolchado, lengüeta, cordones cruzados con su lazada, ojales, tirador del talón y paneles de color con
 * pespuntes. Va unido a los huesos del pie, de los dedos y (la caña) de la pierna, así sigue la pose. Mira hacia +Z.
 */

type Rgb = [number, number, number]
const rgb = (hex: string): Rgb => {
  const c = new THREE.Color(hex)
  return [c.r, c.g, c.b]
}
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const shade = (a: Rgb, k: number): Rgb => [a[0] * k, a[1] * k, a[2] * k]
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
/** 1 dentro de la franja [a, b] con los bordes suaves (para los paneles de color). */
const inBand = (x: number, a: number, b: number, soft = 0.012) => smoothstep(a - soft, a + soft, x) * (1 - smoothstep(b - soft, b + soft, x))
/** Línea fina (pespunte) en x = at. */
const line = (x: number, at: number, w = 0.006) => 1 - smoothstep(0, w, Math.abs(x - at))

/** Dónde está un punto del corte: a lo largo (s: talón 0 → puntera 1), en altura (v: 0 abajo → 1 arriba) y su distancia
 *  lateral a la línea de los cordones (cm). */
interface Spot {
  s: number
  v: number
  lace: number
}

interface StyleDef {
  /** Suela: alto del canto y lo que sobresale del corte (cm). */
  sole: number
  soleOut: number
  /** Tacos de la suela (botas). */
  lugs: boolean
  /** Cuánto abulta el corte (acolchado) y la altura (sobre el suelo, cm) de la puntera, la garganta y el talón. */
  puff: number
  toeBox: number
  throat: number
  heel: number
  /** Caña (cm sobre el suelo; 0 = zapatilla baja). */
  shaft: number
  /** Cuello acolchado (radio, cm) y lengüeta (grosor y lo que asoma por encima del cuello, cm). */
  collar: number
  tongue: number
  tongueUp: number
  /** Cordones: grosor (cm), filas en el empeine y en la caña. */
  lace: number
  footRows: number
  shaftRows: number
  roughness: number
  colors: {
    upper: (p: Spot) => Rgb
    sole: (v: number, s: number) => Rgb
    lining: string
    collar: string
    tongue: string
    laces: string
    eyelets: string
    tab: string
  }
}

const RED = rgb('#b3202a')
const WHITE = rgb('#f3f0e9')
const BLACK = rgb('#161616')

const STYLES: Record<ShoeStyle, StyleDef> = {
  // Alta de baloncesto: piel blanca con puntera, ojaleras, talón y caña en rojo; cuello negro; suela de taza blanca
  baloncesto: {
    sole: 2.7,
    soleOut: 0.3,
    lugs: false,
    puff: 0.3,
    toeBox: 5.8,
    throat: 9,
    heel: 9,
    shaft: 15.5,
    collar: 0.6,
    tongue: 0.7,
    tongueUp: 2.5,
    lace: 0.24,
    footRows: 5,
    shaftRows: 3,
    roughness: 0.42,
    colors: {
      upper: ({ s, v, lace }) => {
        // Paneles superpuestos (puntera, ojaleras, contrafuerte) con su pespunte al borde
        const toeCap = inBand(s, 0.79, 2)
        const eyestay = inBand(s, 0.38, 0.8) * (1 - smoothstep(2.1, 2.5, lace))
        const heel = inBand(s, -1, 0.24) * (1 - smoothstep(0.75, 0.82, v))
        const red = Math.max(toeCap, eyestay, heel)
        let c = mix(WHITE, RED, red)
        const stitch = Math.max(line(s, 0.785, 0.004), line(s, 0.245, 0.004), line(lace, 2.55, 0.06) * inBand(s, 0.38, 0.8))
        c = mix(c, shade(c, 0.6), stitch * 0.8)
        return c
      },
      sole: (v) => (v < 0.28 ? RED : mix(WHITE, shade(WHITE, 0.8), line(v, 0.62, 0.05))),
      lining: '#262626',
      collar: '#161616',
      tongue: '#f3f0e9',
      laces: '#f3f0e9',
      eyelets: '#d9d6cf',
      tab: '#161616',
    },
  },
  // Bota de trabajo: nobuk color trigo, cuello acolchado marrón, ganchos dorados y suela gruesa de tacos
  bota: {
    sole: 3.3,
    soleOut: 0.5,
    lugs: true,
    puff: 0.7,
    toeBox: 8,
    throat: 10.5,
    heel: 10,
    shaft: 16.5,
    collar: 0.9,
    tongue: 0.8,
    tongueUp: 1.5,
    lace: 0.3,
    footRows: 4,
    shaftRows: 4,
    roughness: 0.95,
    colors: {
      upper: ({ s, v }) => {
        const wheat = rgb('#c68b3e')
        // Costura en U de la puntera y la de atrás, con su pespunte doble
        const seam = Math.max(line(s, 0.71, 0.004), line(s, 0.725, 0.003)) * (1 - smoothstep(0.85, 0.95, v))
        return mix(shade(wheat, 0.97 + 0.06 * Math.sin(s * 40 + v * 9)), rgb('#6b4524'), seam * 0.85)
      },
      sole: (v) => (v > 0.7 ? rgb('#a8733a') : v > 0.62 ? rgb('#5a3d26') : rgb('#33251b')),
      lining: '#3b2a1e',
      collar: '#4a2f1d',
      tongue: '#c68b3e',
      laces: '#7a4f28',
      eyelets: '#b8893a',
      tab: '#4a2f1d',
    },
  },
  // Skate gruesa: corte muy acolchado negro con puntera y talón de ante gris, lengüeta gorda y suela blanca alta
  skate: {
    sole: 3.3,
    soleOut: 0.55,
    lugs: false,
    puff: 1.4,
    toeBox: 7.6,
    throat: 10,
    heel: 10.5,
    shaft: 0,
    collar: 1.05,
    tongue: 1.5,
    tongueUp: 1.8,
    lace: 0.38,
    footRows: 5,
    shaftRows: 0,
    roughness: 0.7,
    colors: {
      upper: ({ s, v }) => {
        const grey = rgb('#6e6e6e')
        const suede = Math.max(inBand(s, 0.8, 2), inBand(s, -1, 0.22) * (1 - smoothstep(0.7, 0.78, v)))
        let c = mix(BLACK, grey, suede)
        c = mix(c, rgb('#3a3a3a'), Math.max(line(s, 0.795, 0.004), line(s, 0.225, 0.004)))
        return c
      },
      sole: (v) => (v < 0.12 ? rgb('#2b2b2b') : inBand(v, 0.48, 0.6, 0.02) > 0.5 ? rgb('#7d7d7d') : rgb('#f2f0eb')),
      lining: '#2a2a2a',
      collar: '#1f1f1f',
      tongue: '#161616',
      laces: '#f2f0eb',
      eyelets: '#2a2a2a',
      tab: '#2a2a2a',
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

  const lo = new Array(BINS).fill(Infinity)
  const hi = new Array(BINS).fill(-Infinity)
  const top = new Array(BINS).fill(0)
  for (const i of foot) {
    const [lx, lz] = local(pos[i * 3], pos[i * 3 + 2])
    const b = Math.min(BINS - 1, Math.max(0, Math.floor((lz / length) * BINS)))
    lo[b] = Math.min(lo[b], lx)
    hi[b] = Math.max(hi[b], lx)
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

// --- Geometría ---

type V3 = [number, number, number]

/** Acumula vértices con color y pesos de hueso, y los convierte en una malla con piel. */
class Builder {
  pos: number[] = []
  col: number[] = []
  skinI: number[] = []
  skinW: number[] = []
  idx: number[] = []
  constructor(private ff: FootFrame) {}
  /** Del sistema del zapato (x lateral, y altura, z del talón a la puntera) al del modelo. */
  world(x: number, y: number, z: number): V3 {
    const { heel, angle } = this.ff
    const c = Math.cos(angle)
    const s = Math.sin(angle)
    return [heel.x + x * c + z * s, y, heel.y - x * s + z * c]
  }
  vertex(p: V3, color: Rgb) {
    const w = this.world(p[0], p[1], p[2])
    this.pos.push(w[0], w[1], w[2])
    this.col.push(color[0], color[1], color[2])
    const { bones, ankle, toeZ } = this.ff
    // Delante de los dedos se dobla con el hueso de los dedos; por encima del tobillo, con la pierna
    const toe = bones.toe >= 0 ? smoothstep(toeZ - 1.5, toeZ + 1.5, p[2]) : 0
    const legW = bones.leg >= 0 ? smoothstep(ankle.y + 1, ankle.y + 9, w[1]) * 0.85 : 0
    this.skinI.push(bones.foot, Math.max(0, bones.toe), Math.max(0, bones.leg), 0)
    this.skinW.push(Math.max(0, 1 - toe - legW), toe, legW, 0)
    return this.pos.length / 3 - 1
  }
  /** Malla de anillos (todos con los mismos puntos), cerrada en cada anillo; tapas opcionales en las puntas. */
  loft(rings: { pts: V3[]; colors: Rgb[] }[], capStart = true, capEnd = true, closedRing = true) {
    const m = rings[0].pts.length
    const base = this.pos.length / 3
    for (const r of rings) r.pts.forEach((p, k) => this.vertex(p, r.colors[k]))
    const segs = closedRing ? m : m - 1
    for (let r = 0; r < rings.length - 1; r++) {
      for (let k = 0; k < segs; k++) {
        const a = base + r * m + k
        const b = base + r * m + ((k + 1) % m)
        this.idx.push(a, b, a + m, b, b + m, a + m)
      }
    }
    const cap = (r: number, flip: boolean) => {
      const ring = rings[r]
      const cen = ring.pts.reduce((acc, p) => [acc[0] + p[0] / m, acc[1] + p[1] / m, acc[2] + p[2] / m] as V3, [0, 0, 0] as V3)
      const ci = this.vertex(cen, ring.colors[0])
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
  /** Tubo redondo a lo largo de un recorrido (cordones, cuello acolchado, ojales, tirador). */
  tube(path: V3[], radius: number | ((t: number) => number), color: Rgb | ((t: number) => Rgb), closed = false, sides = 8) {
    const P = path.map((p) => new THREE.Vector3(...p))
    if (closed) P.push(P[0].clone())
    const rings: { pts: V3[]; colors: Rgb[] }[] = []
    let prevN: THREE.Vector3 | null = null
    for (let i = 0; i < P.length; i++) {
      const t = i / (P.length - 1)
      const tan = P[Math.min(P.length - 1, i + 1)].clone().sub(P[Math.max(0, i - 1)]).normalize()
      // Marco que gira lo justo a lo largo del tubo (sin retorcerse)
      let n: THREE.Vector3 = prevN ? prevN.clone().sub(tan.clone().multiplyScalar(prevN.dot(tan))) : new THREE.Vector3(0, 1, 0).cross(tan)
      if (n.lengthSq() < 1e-6) n = new THREE.Vector3(1, 0, 0).cross(tan)
      n.normalize()
      prevN = n
      const b = tan.clone().cross(n).normalize()
      const r = typeof radius === 'number' ? radius : radius(t)
      const c = typeof color === 'function' ? color(t) : color
      const pts: V3[] = []
      const colors: Rgb[] = []
      for (let k = 0; k < sides; k++) {
        const a = (k / sides) * Math.PI * 2
        const q = P[i].clone().addScaledVector(n, Math.cos(a) * r).addScaledVector(b, Math.sin(a) * r)
        pts.push([q.x, q.y, q.z])
        colors.push(c)
      }
      rings.push({ pts, colors })
    }
    this.loft(rings, !closed, !closed)
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

/** Superelipse: con p alto sale casi un rectángulo (suela), con p ≈ 2 una elipse (corte). */
const se = (phi: number, p: number) => {
  const c = Math.cos(phi)
  const s = Math.sin(phi)
  return [Math.sign(c) * Math.abs(c) ** (2 / p), Math.sign(s) * Math.abs(s) ** (2 / p)] as const
}

const SECTIONS = 56
const AROUND = 40

function buildShoe(ff: FootFrame, st: StyleDef) {
  const upper = new Builder(ff)
  const sole = new Builder(ff)
  const C = st.colors
  const heelPad = 0.8
  // La zapatilla es más larga que el pie (sobre todo por delante): así la puntera queda baja y alargada
  const toePad = 2.6 + st.puff * 0.4
  const L = ff.length + heelPad + toePad
  const zAt = (s: number) => -heelPad + s * L
  const footS = (s: number) => Math.min(1, Math.max(0, zAt(s) / ff.length))
  const cx = (s: number) => lerpBins(ff.center, footS(s))
  // Planta: el talón redondo y la puntera en curva (se estrecha poco a poco, no en pico)
  const plan = (s: number) => {
    const rh = 0.13
    const rt = 0.24
    if (s < rh) return Math.sqrt(Math.max(0, 1 - ((rh - s) / rh) ** 2)) * 0.88 + 0.12 * (s / rh)
    if (s > 1 - rt) return Math.sqrt(Math.max(0, 1 - ((s - (1 - rt)) / rt) ** 2))
    return 1
  }
  const half = (s: number) => (lerpBins(ff.half, footS(s)) + 0.45 + st.puff * 0.45) * Math.max(0.04, plan(s))
  // Perfil del corte (altura sobre el suelo, cm): puntera baja y redonda, empeine que sube a la garganta, talón
  const footTop = (s: number) => lerpBins(ff.top, footS(s)) + 0.9 + st.puff * 0.4
  const profile = (s: number) => {
    // La punta baja hacia la suela (nariz redonda y baja, no una bola)
    const nose = s > 0.82 ? 0.34 + 0.66 * Math.sqrt(Math.max(0, 1 - ((s - 0.82) / 0.18) ** 2)) : 1
    if (s >= 0.8) return st.sole + (st.toeBox - st.sole) * nose
    if (s >= 0.46) return THREE.MathUtils.lerp(st.throat, st.toeBox, smoothstep(0.46, 0.8, s))
    return THREE.MathUtils.lerp(st.heel, st.throat, smoothstep(0.1, 0.46, s))
  }
  // Nunca por debajo del pie (salvo en la punta, que va por delante de los dedos)
  const topAt = (s: number) => Math.max(profile(s), footS(s) >= 0.999 ? st.sole + 1 : s > 0.8 ? Math.min(footTop(s), st.toeBox) : footTop(s))
  const yb = st.sole * 0.55

  // Boca: elipse en la planta, del talón a la garganta, por donde entra la pierna
  const sOpen = 0.44
  const ankleLocal = (() => {
    const c = Math.cos(ff.angle)
    const s = Math.sin(ff.angle)
    const dx = ff.ankle.x - ff.heel.x
    const dz = ff.ankle.z - ff.heel.y
    return { x: dx * c - dz * s, z: dx * s + dz * c }
  })()
  const open = { z0: zAt(0.04), z1: zAt(sOpen), x: ankleLocal.x, rx: ff.legR[0] + 0.9 + st.puff * 0.3 }
  const openAt = (x: number, z: number) => {
    const cz = (open.z0 + open.z1) / 2
    const rz = (open.z1 - open.z0) / 2
    return Math.hypot((x - open.x) / open.rx, (z - cz) / rz)
  }

  // --- Corte ---
  const rings: { pts: V3[]; colors: Rgb[] }[] = []
  for (let i = 0; i <= SECTIONS; i++) {
    const s = i / SECTIONS
    const a = half(s)
    const yt = topAt(s)
    const z = zAt(s)
    const c0 = cx(s)
    const pts: V3[] = []
    const colors: Rgb[] = []
    for (let k = 0; k < AROUND; k++) {
      const phi = (k / AROUND) * Math.PI * 2 - Math.PI / 2
      const [u, w] = se(phi, 2.3)
      const x = c0 + a * u
      let y = yb + (yt - yb) * (0.5 + 0.5 * w)
      const v = (y - yb) / Math.max(0.1, yt - yb)
      let color = C.upper({ s, v, lace: Math.abs(x - c0) })
      // Dentro de la boca, la parte de arriba se hunde hasta el pie y se ve el forro
      const r = openAt(x, z)
      if (r < 1.05 && w > 0) {
        const k2 = (1 - smoothstep(0.82, 1.02, r)) * w
        y = THREE.MathUtils.lerp(y, Math.max(yb + 1, footTop(s) - 1.5), k2)
        color = mix(color, rgb(C.lining), smoothstep(0.1, 0.5, k2))
      }
      pts.push([x, y, z])
      colors.push(color)
    }
    rings.push({ pts, colors })
  }
  upper.loft(rings)

  // --- Suela: canto casi recto, algo más ancha que el corte, puntera que sube un poco y talón biselado ---
  const soleRings: { pts: V3[]; colors: Rgb[] }[] = []
  for (let i = 0; i <= SECTIONS; i++) {
    const s = i / SECTIONS
    const e = plan(s)
    const a = half(s) + st.soleOut * Math.max(0.3, e)
    const spring = smoothstep(0.8, 1, s) * 1.1 + (1 - smoothstep(0, 0.08, s)) * 0.4
    const h = st.sole * (0.55 + 0.45 * Math.min(1, e * 1.6))
    const pts: V3[] = []
    const colors: Rgb[] = []
    for (let k = 0; k < AROUND; k++) {
      const phi = (k / AROUND) * Math.PI * 2 - Math.PI / 2
      const [u, w] = se(phi, 7)
      const y0 = spring - 0.02
      const y = y0 + h * (0.5 + 0.5 * w)
      pts.push([cx(s) + a * u, y, zAt(s)])
      colors.push(C.sole((y - y0) / h, s))
    }
    soleRings.push({ pts, colors })
  }
  sole.loft(soleRings)

  // Tacos de la bota: bloques bajo la suela, en el borde
  if (st.lugs) {
    const lugC = rgb('#2a1d15')
    for (let i = 2; i < 24; i++) {
      const s = i / 25
      for (const sx of [-1, 1]) {
        const a = half(s) + st.soleOut * plan(s) - 0.9
        const x = cx(s) + sx * a
        const z = zAt(s)
        sole.tube([[x - sx * 0.8, -0.35 + smoothstep(0.8, 1, s) * 1.1, z], [x + sx * 0.2, -0.35 + smoothstep(0.8, 1, s) * 1.1, z]], 0.55, lugC, false, 4)
      }
    }
  }

  // --- Cuello: caña (si la lleva) y acolchado alrededor de la boca o de lo alto de la caña ---
  // t = 0 y 1 delante (en la garganta, donde va la lengüeta) y t = 0,5 detrás, en el talón
  const ringAt = (t: number, y: number, rx: number, rz: number, cz: number) => {
    const th = (t + 0.5) * Math.PI * 2
    return [open.x + Math.sin(th) * rx, y, cz - Math.cos(th) * rz] as V3
  }
  const openCz = (open.z0 + open.z1) / 2
  const openRz = (open.z1 - open.z0) / 2
  // Línea de la boca: más alta en el talón, baja por los lados (los tobillos) y sube a la garganta
  const mouthY = (t: number) => {
    const th = (t + 0.5) * Math.PI * 2
    const z = openCz - Math.cos(th) * openRz
    const s = (z + heelPad) / L
    return topAt(Math.min(0.99, Math.max(0, s))) * (0.92 + 0.08 * Math.abs(Math.cos(th))) - 0.6
  }
  const N = 48
  let collarPath: V3[]
  if (st.shaft) {
    // Caña: de la boca a lo alto, ciñéndose al tobillo y con el frente abierto para la lengüeta y los cordones
    const top = { rx: ff.legR[0] + 1.2 + st.puff * 0.4, rz: ff.legR[1] + 1.4 + st.puff * 0.4, cz: ankleLocal.z - 0.4 }
    const shaftRings: { pts: V3[]; colors: Rgb[] }[] = []
    const rows = 14
    for (let j = 0; j <= rows; j++) {
      const f = j / rows
      const pts: V3[] = []
      const colors: Rgb[] = []
      for (let k = 0; k <= N; k++) {
        // Del lado de los cordones (delante) queda abierto: el anillo va de una ojalera a la otra por detrás
        const t = 0.08 + (k / N) * 0.84
        // Empieza un poco por dentro y por debajo de la boca, para que no quede hueco con el corte
        const lo = ringAt(t, mouthY(t) - 1.2, open.rx + 0.4, openRz + 0.4, openCz)
        const hi = ringAt(t, st.shaft, top.rx, top.rz, top.cz)
        const e = smoothstep(0, 1, f)
        const p: V3 = [lo[0] + (hi[0] - lo[0]) * e, lo[1] + (hi[1] - lo[1]) * f, lo[2] + (hi[2] - lo[2]) * e]
        // Abomba un poco a media altura (el acolchado del tobillo)
        const bulge = Math.sin(f * Math.PI) * (0.4 + st.puff * 0.4)
        const dx = p[0] - open.x
        const dz = p[2] - (lo[2] + hi[2]) / 2
        const len = Math.hypot(dx, dz) || 1
        p[0] += (dx / len) * bulge
        p[2] += (dz / len) * bulge * 0.5
        pts.push(p)
        colors.push(C.upper({ s: 0.1 + 0.2 * (1 - Math.abs(Math.cos(t * Math.PI * 2))), v: 0.6 + 0.4 * f, lace: 5 }))
      }
      shaftRings.push({ pts, colors })
    }
    // Colores de la caña: el de la prenda en la parte baja y el del cuello arriba
    shaftRings.forEach((r, j) => {
      const f = j / rows
      if (C.collar && f > 0.62) r.colors = r.colors.map(() => rgb(C.collar))
    })
    upper.loft(shaftRings, false, false, false)
    collarPath = Array.from({ length: N + 1 }, (_, k) => ringAt(0.08 + (k / N) * 0.84, st.shaft, top.rx + 0.2, top.rz + 0.2, top.cz))
  } else {
    collarPath = Array.from({ length: N + 1 }, (_, k) => {
      const t = 0.1 + (k / N) * 0.8
      return ringAt(t, mouthY(t) + 0.3, open.rx + 0.2, openRz + 0.2, openCz)
    })
  }
  // Acolchado del cuello (más gordo detrás, en el tendón)
  upper.tube(collarPath, (t) => st.collar * (0.45 + 0.6 * Math.sin(Math.PI * t)), rgb(C.collar), false, 10)
  // Tirador del talón
  const back = collarPath[Math.floor(collarPath.length / 2)]
  upper.tube(
    Array.from({ length: 9 }, (_, k) => {
      const a = (k / 8) * Math.PI
      return [back[0] + Math.cos(a) * 0.7, back[1] + Math.sin(a) * 1.5 - 0.3, back[2] - st.collar * 0.6] as V3
    }),
    0.22,
    rgb(C.tab),
    false,
    6,
  )

  // --- Lengüeta: sube de la garganta por delante de la pierna y asoma por encima del cuello ---
  const tongueTopY = (st.shaft || st.heel) + st.tongueUp
  const tongueTopZ = ankleLocal.z + ff.legR[1] + 0.6 + st.tongue * 0.5
  const tStart: V3 = [cx(0.58), topAt(0.58) - 0.2, zAt(0.58)]
  const tongue: V3[] = []
  for (let k = 0; k <= 12; k++) {
    const f = k / 12
    const y = tStart[1] + (tongueTopY - tStart[1]) * f
    const z = THREE.MathUtils.lerp(tStart[2], tongueTopZ, smoothstep(0, 0.7, f))
    tongue.push([THREE.MathUtils.lerp(tStart[0], open.x, f), y, z])
  }
  {
    const w = 2.1 + st.puff * 0.4
    const rings2: { pts: V3[]; colors: Rgb[] }[] = tongue.map((p, k) => {
      const f = k / (tongue.length - 1)
      const ww = w * (f > 0.85 ? 0.75 + 0.25 * Math.cos(((f - 0.85) / 0.15) * Math.PI * 0.5) : 1)
      const pts: V3[] = []
      const colors: Rgb[] = []
      for (let j = 0; j < 16; j++) {
        const [u, v] = se((j / 16) * Math.PI * 2, 4)
        pts.push([p[0] + u * ww, p[1], p[2] + v * st.tongue * 0.5])
        colors.push(rgb(C.tongue))
      }
      return { pts, colors }
    })
    upper.loft(rings2)
  }

  // --- Ojales y cordones cruzados en X, con su lazada ---
  const laceC = rgb(C.laces)
  const eyeC = rgb(C.eyelets)
  const gap = 1.25 + st.puff * 0.2
  const lift = 0.25 + st.lace
  const eyes: { l: V3; r: V3 }[] = []
  // En el empeine: de cerca de la puntera a la garganta
  for (let i = 0; i < st.footRows; i++) {
    const s = 0.72 - ((0.72 - 0.47) * i) / Math.max(1, st.footRows - 1)
    const a = half(s)
    const yt = topAt(s)
    const yOn = (dx: number) => {
      const X = Math.min(0.98, Math.abs(dx) / a)
      return yb + (yt - yb) * (0.5 + 0.5 * (1 - X ** 2.3) ** (1 / 2.3))
    }
    const z = zAt(s)
    eyes.push({ l: [cx(s) - gap, yOn(gap) + lift, z], r: [cx(s) + gap, yOn(gap) + lift, z] })
  }
  // Por la caña (o, en la baja, hasta la boca): delante de la pierna
  const shaftRows = st.shaft ? st.shaftRows : 1
  for (let i = 1; i <= shaftRows; i++) {
    const f = i / (shaftRows + (st.shaft ? 0.6 : 1.5))
    const p = tongue[Math.min(tongue.length - 1, Math.round(f * (tongue.length - 1)))]
    eyes.push({ l: [p[0] - gap, p[1], p[2] + 0.2 + st.tongue * 0.4], r: [p[0] + gap, p[1], p[2] + 0.2 + st.tongue * 0.4] })
  }
  for (const e of eyes) {
    for (const p of [e.l, e.r]) upper.tube([[p[0], p[1] - 0.2, p[2]], [p[0], p[1] + 0.05, p[2]]], 0.42, eyeC, false, 10)
  }
  const raise = (p: V3, k: number): V3 => [p[0], p[1] + k, p[2]]
  for (let i = 0; i < eyes.length - 1; i++) {
    const a = eyes[i]
    const b = eyes[i + 1]
    // Dos cordones que se cruzan por encima de la lengüeta (uno encima del otro)
    upper.tube([a.l, raise(mid(a.l, b.r), 0.25), b.r], st.lace, laceC, false, 6)
    upper.tube([a.r, raise(mid(a.r, b.l), 0.45), b.l], st.lace, laceC, false, 6)
  }
  // Primera pasada recta, en la fila de abajo
  upper.tube([eyes[0].l, raise(mid(eyes[0].l, eyes[0].r), 0.2), eyes[0].r], st.lace, laceC, false, 6)
  // Lazada arriba: dos lazos y dos cabos que cuelgan
  const knot = raise(mid(eyes[eyes.length - 1].l, eyes[eyes.length - 1].r), 0.5)
  for (const sx of [-1, 1]) {
    const loop: V3[] = Array.from({ length: 13 }, (_, k) => {
      const a = (k / 12) * Math.PI * 2
      return [knot[0] + sx * (1.6 + Math.cos(a) * 1.5), knot[1] + Math.sin(a) * 0.9 + 0.2, knot[2] + 0.4 + (1 - Math.cos(a)) * 0.3]
    })
    upper.tube(loop, st.lace * 0.9, laceC, true, 6)
    upper.tube(
      [knot, [knot[0] + sx * 0.8, knot[1] - 2, knot[2] + 1], [knot[0] + sx * 1.2, knot[1] - 4.5, knot[2] + 1.6]],
      st.lace * 0.9,
      laceC,
      false,
      6,
    )
  }
  return { upper: upper.geometry(), sole: sole.geometry() }
}

const mid = (a: V3, b: V3): V3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]

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
      sole: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide }),
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
