import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { slotIndex, type Design, type GarmentSlot, type HatShape } from '../types'
import type { Model } from './Avatar'
import { boneName } from './body'
import { EDGE_CODES } from './cloth/Cloth'
import { useSlotMaterials } from './Garment'
import type { Cloud } from './wrap'

/**
 * Gorros y gorras del maniquí. Se construyen alrededor de su cabeza, medida sobre la malla (en cada dirección desde el
 * centro de la cabeza, lo que mide hasta la piel), y van unidos al hueso de la cabeza, así siguen la pose:
 * - gorro de punto: copa que se ciñe a la cabeza (un poco más alta en el normal), vuelta doblada y pompón;
 * - gorra: copa de 5 o 6 paneles con sus costuras, ojetes y botón arriba, visera curva o plana con pespuntes,
 *   trasera de malla (trucker) y abertura de atrás con su cierre (snapback, hebilla o velcro).
 * Las zonas de la prenda (copa, vuelta, visera…) usan los materiales de la ropa (ver `designTo3D`, piezas de cabeza).
 */

/** Cabeza medida: centro, radio en cada dirección (unidades del modelo) y unidades del modelo por cm. */
interface HeadFrame {
  center: THREE.Vector3
  radius: (theta: number, phi: number) => number
  cm: number
  bone: number
}

const NT = 48
const NP = 36
const PHI0 = -50

function measureHead(cloud: Cloud, skeleton: THREE.Skeleton, heightCm: number): HeadFrame | null {
  const index = (n: string) => skeleton.bones.findIndex((b) => boneName(b.name) === n)
  const head = index('Head')
  const top = index('HeadTop_End')
  if (head < 0) return null
  const { pos, skinIndex, skinWeight } = cloud
  const dominant = (i: number) => {
    let best = 0
    for (let k = 1; k < 4; k++) if (skinWeight[i * 4 + k] > skinWeight[i * 4 + best]) best = k
    return skinIndex[i * 4 + best]
  }
  let maxY = -Infinity
  for (let i = 1; i < pos.length; i += 3) maxY = Math.max(maxY, pos[i])
  const cm = maxY / heightCm
  const verts: number[] = []
  let headTop = -Infinity
  for (let i = 0; i < pos.length / 3; i++) {
    const d = dominant(i)
    if (d === head || d === top) {
      verts.push(i)
      headTop = Math.max(headTop, pos[i * 3 + 1])
    }
  }
  if (verts.length < 50) return null
  // Centro: a la altura de las orejas (unos 13 cm bajo la coronilla en un adulto de 180 cm), en medio de cara y nuca
  const cy = headTop - 0.072 * heightCm * cm
  let z0 = Infinity
  let z1 = -Infinity
  for (const i of verts) {
    if (Math.abs(pos[i * 3 + 1] - cy) > 2 * cm || Math.abs(pos[i * 3]) > 5 * cm) continue
    z0 = Math.min(z0, pos[i * 3 + 2])
    z1 = Math.max(z1, pos[i * 3 + 2])
  }
  const center = new THREE.Vector3(0, cy, Number.isFinite(z0) ? (z0 + z1) / 2 : 0)

  // Radio máximo en cada casilla de dirección (azimut desde delante, elevación de -50° a 90°)
  let R = new Float32Array(NT * NP)
  const v = new THREE.Vector3()
  for (const i of verts) {
    v.fromArray(pos, i * 3).sub(center)
    const r = v.length()
    const theta = Math.atan2(v.x, v.z)
    const phi = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(v.y / r, -1, 1)))
    if (phi < PHI0) continue
    const a = Math.floor((((theta / (2 * Math.PI)) % 1) + 1) % 1 * NT) % NT
    const b = Math.min(NP - 1, Math.floor(((phi - PHI0) / (90 - PHI0)) * NP))
    R[b * NT + a] = Math.max(R[b * NT + a], r)
  }
  // Casillas vacías: la media de las vecinas (varias pasadas)
  for (let pass = 0; pass < 30; pass++) {
    let empty = 0
    const next = R.slice()
    for (let b = 0; b < NP; b++)
      for (let a = 0; a < NT; a++) {
        if (R[b * NT + a] > 0) continue
        let s = 0
        let n = 0
        for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const bb = b + db
          if (bb < 0 || bb >= NP) continue
          const val = R[bb * NT + ((a + da + NT) % NT)]
          if (val > 0) {
            s += val
            n++
          }
        }
        if (n) next[b * NT + a] = s / n
        else empty++
      }
    R = next
    if (!empty) break
  }
  // Máximo de las vecinas y después suavizado: la prenda pasa por encima de orejas y bultos sin marcarlos
  const filter = (src: Float32Array, fn: (vals: number[]) => number) => {
    const out = new Float32Array(src.length)
    for (let b = 0; b < NP; b++)
      for (let a = 0; a < NT; a++) {
        const vals: number[] = []
        for (let db = -1; db <= 1; db++)
          for (let da = -1; da <= 1; da++) {
            const bb = THREE.MathUtils.clamp(b + db, 0, NP - 1)
            vals.push(src[bb * NT + ((a + da + NT) % NT)])
          }
        out[b * NT + a] = fn(vals)
      }
    return out
  }
  R = filter(R, (x) => Math.max(...x))
  for (let k = 0; k < 2; k++) R = filter(R, (x) => x.reduce((s, y) => s + y, 0) / x.length)
  const radius = (theta: number, phi: number) => {
    const fa = (((theta / (2 * Math.PI)) % 1) + 1) % 1 * NT - 0.5
    const fb = THREE.MathUtils.clamp(((THREE.MathUtils.radToDeg(phi) - PHI0) / (90 - PHI0)) * NP - 0.5, 0, NP - 1)
    const a0 = Math.floor(fa)
    const b0 = Math.min(NP - 2, Math.floor(fb))
    const ta = fa - a0
    const tb = fb - b0
    const at = (a: number, b: number) => R[b * NT + ((a % NT) + NT) % NT]
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(at(a0, b0), at(a0 + 1, b0), ta), THREE.MathUtils.lerp(at(a0, b0 + 1), at(a0 + 1, b0 + 1), ta), tb)
  }
  return { center, radius, cm, bone: head }
}

/** Acumula las piezas de la prenda: posiciones, UV (cm), bordes y triángulos por zona. */
class HatMesh {
  pos: number[] = []
  uv: number[] = []
  edge: number[] = []
  tris: number[][] = []
  vert(p: THREE.Vector3, u: number, v: number, edge: [number, number, number] = [99, 0, EDGE_CODES.ninguno]) {
    this.pos.push(p.x, p.y, p.z)
    this.uv.push(u, v)
    this.edge.push(...edge)
    return this.pos.length / 3 - 1
  }
  tri(slot: GarmentSlot, a: number, b: number, c: number) {
    const s = slotIndex(slot)
    ;(this.tris[s] ??= []).push(a, b, c)
  }
  /** Rejilla de nu × nv puntos; `skip` deja huecos (la abertura de atrás de la gorra). */
  grid(nu: number, nv: number, at: (i: number, j: number) => { p: THREE.Vector3; u: number; v: number; edge?: [number, number, number] }, slot: GarmentSlot | ((i: number, j: number) => GarmentSlot), skip?: (i: number, j: number) => boolean, wrap = false) {
    const ids: number[] = []
    for (let j = 0; j < nv; j++)
      for (let i = 0; i < nu; i++) {
        const q = at(i, j)
        ids.push(this.vert(q.p, q.u, q.v, q.edge))
      }
    const id = (i: number, j: number) => ids[j * nu + (wrap ? i % nu : i)]
    for (let j = 0; j < nv - 1; j++)
      for (let i = 0; i < (wrap ? nu : nu - 1); i++) {
        if (skip?.(i, j)) continue
        const s = typeof slot === 'function' ? slot(i, j) : slot
        this.tri(s, id(i, j), id(i + 1, j), id(i, j + 1))
        this.tri(s, id(i + 1, j), id(i + 1, j + 1), id(i, j + 1))
      }
    return id
  }
  /** Tubo a lo largo de un recorrido cerrado o abierto (canto doblado de la vuelta, borde de la visera). */
  tube(path: THREE.Vector3[], r: number, slot: GarmentSlot, closed: boolean) {
    const sides = 8
    const n = path.length
    const ring: number[][] = []
    for (let k = 0; k < n; k++) {
      const prev = path[closed ? (k - 1 + n) % n : Math.max(0, k - 1)]
      const next = path[closed ? (k + 1) % n : Math.min(n - 1, k + 1)]
      const t = next.clone().sub(prev).normalize()
      const a = new THREE.Vector3(0, 1, 0).cross(t)
      if (a.lengthSq() < 1e-6) a.set(1, 0, 0)
      a.normalize()
      const b = t.clone().cross(a).normalize()
      ring.push(Array.from({ length: sides }, (_, s) => {
        const ang = (s / sides) * Math.PI * 2
        return this.vert(path[k].clone().addScaledVector(a, Math.cos(ang) * r).addScaledVector(b, Math.sin(ang) * r), 0, 0)
      }))
    }
    for (let k = 0; k < (closed ? n : n - 1); k++)
      for (let s = 0; s < sides; s++) {
        const a = ring[k][s], b = ring[k][(s + 1) % sides], c = ring[(k + 1) % n][s], d = ring[(k + 1) % n][(s + 1) % sides]
        this.tri(slot, a, b, c)
        this.tri(slot, b, d, c)
      }
  }
  /** Esfera (pompón, botón de la gorra), con un poco de ruido para el pompón. */
  sphere(c: THREE.Vector3, r: [number, number, number], slot: GarmentSlot, fuzz = 0) {
    const nu = 18
    const nv = 12
    this.grid(nu, nv, (i, j) => {
      const th = (i / nu) * Math.PI * 2
      const ph = (j / (nv - 1)) * Math.PI - Math.PI / 2
      const n = Math.sin(th * 7 + ph * 5) * Math.sin(th * 3 - ph * 9)
      const k = 1 + fuzz * n
      return { p: new THREE.Vector3(c.x + Math.cos(ph) * Math.sin(th) * r[0] * k, c.y + Math.sin(ph) * r[1] * k, c.z + Math.cos(ph) * Math.cos(th) * r[2] * k), u: i, v: j }
    }, slot, undefined, true)
  }
  /** Anillo (ojete) alrededor de un punto, perpendicular a `n`. */
  ring(c: THREE.Vector3, n: THREE.Vector3, r: number, w: number, slot: GarmentSlot) {
    const a = new THREE.Vector3(0, 1, 0).cross(n)
    if (a.lengthSq() < 1e-6) a.set(1, 0, 0)
    a.normalize()
    const b = n.clone().cross(a).normalize()
    const path = Array.from({ length: 14 }, (_, k) => {
      const ang = (k / 14) * Math.PI * 2
      return c.clone().addScaledVector(a, Math.cos(ang) * r).addScaledVector(b, Math.sin(ang) * r)
    })
    this.tube(path, w, slot, true)
  }
  geometry(bone: number) {
    const g = new THREE.BufferGeometry()
    const n = this.pos.length / 3
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2))
    g.setAttribute('edge', new THREE.Float32BufferAttribute(this.edge, 3))
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(n * 4).fill(0).map((_, k) => (k % 4 === 0 ? bone : 0)), 4))
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Array(n * 4).fill(0).map((_, k) => (k % 4 === 0 ? 1 : 0)), 4))
    const index: number[] = []
    this.tris.forEach((t, s) => {
      if (!t?.length) return
      g.addGroup(index.length, t.length, s)
      index.push(...t)
    })
    g.setIndex(index)
    g.computeVertexNormals()
    return g
  }
}

const deg = THREE.MathUtils.degToRad
const sm = THREE.MathUtils.smoothstep

/** Dirección desde el centro de la cabeza: azimut desde delante (+Z) y elevación. */
const dir = (theta: number, phi: number) => new THREE.Vector3(Math.cos(phi) * Math.sin(theta), Math.sin(phi), Math.cos(phi) * Math.cos(theta))

/** Línea de abajo de la prenda (elevación según el azimut): delante, detrás y bajada a los lados (orejas). */
const rimLine = (front: number, back: number, sides: number) => (theta: number) => {
  const frontness = (1 + Math.cos(theta)) / 2
  return deg(back + (front - back) * frontness + sides * Math.sin(theta) ** 2)
}

function buildBeanie(h: HeadFrame, hat: HatShape) {
  const m = new HatMesh()
  const { center, radius, cm } = h
  const tall = hat.tall !== false
  const rim = tall ? rimLine(30, -4, -6) : rimLine(42, 30, 0)
  const nu = 64
  const nv = 22
  // Copa: del borde a lo alto, ceñida (el normal sube unos cm por encima de la cabeza, un poco caído)
  const point = (theta: number, t: number, extra = 0) => {
    const phi = THREE.MathUtils.lerp(rim(theta), deg(89.5), t)
    const r = radius(theta, phi) + (0.45 + extra + (tall ? 3 * sm(t, 0.55, 1) : 0.3 * t)) * cm
    return center.clone().addScaledVector(dir(theta, phi), r)
  }
  const circ = 2 * Math.PI * radius(0, rim(0)) / cm
  // UV: columnas fijas (las costillas del punto suben rectas y se juntan arriba), alto en cm a lo largo
  const crownH = (Math.PI / 2 + 0.3) * radius(0, 0) / cm
  m.grid(nu + 1, nv, (i, j) => {
    const theta = (i / nu) * Math.PI * 2
    return { p: point(theta, j / (nv - 1)), u: (i / nu) * circ, v: (j / (nv - 1)) * crownH }
  }, 'cuerpo')
  if (hat.cuff !== false) {
    // Vuelta: la misma tela doblada hacia arriba (unos cm), por fuera, con el canto redondeado abajo
    const cuffH = (tall ? 6 : 4.5) * cm
    const tOf = (theta: number) => {
      const r = radius(theta, rim(theta))
      return THREE.MathUtils.clamp(cuffH / (r * (deg(89.5) - rim(theta))), 0, 0.6)
    }
    m.grid(nu + 1, 4, (i, j) => {
      const theta = (i / nu) * Math.PI * 2
      return { p: point(theta, (j / 3) * tOf(theta), 0.65), u: (i / nu) * circ, v: (j / 3) * (cuffH / cm), edge: [((3 - j) / 3) * (cuffH / cm), (i / nu) * circ, EDGE_CODES.doblez] }
    }, 'bajo')
    m.tube(Array.from({ length: nu }, (_, i) => point((i / nu) * Math.PI * 2, 0, 0.32)), 0.38 * cm, 'bajo', true)
    m.tube(Array.from({ length: nu }, (_, i) => { const th = (i / nu) * Math.PI * 2; return point(th, tOf(th), 0.5) }), 0.22 * cm, 'bajo', true)
  } else {
    m.tube(Array.from({ length: nu }, (_, i) => point((i / nu) * Math.PI * 2, 0, 0)), 0.3 * cm, 'cuerpo', true)
  }
  if (hat.pompom) {
    const top = point(0, 1)
    m.sphere(top.add(new THREE.Vector3(0, 3.6 * cm, 0)), [4.6 * cm, 4.2 * cm, 4.6 * cm], 'cordones', 0.06)
  }
  return m
}

function buildCap(h: HeadFrame, hat: HatShape) {
  const m = new HatMesh()
  const { center, radius, cm } = h
  const rim = rimLine(30, 4, -4)
  const nu = 72
  const nv = 18
  const six = hat.panels !== 5
  // Costuras de los paneles (azimut): seis iguales o cinco con un panel delantero ancho
  const seams = six ? [0, 60, 120, 180, 240, 300].map(deg) : [-36, 36, 108, 180, 252].map(deg)
  const angDist = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)))
  const point = (theta: number, t: number, extra = 0) => {
    const phi = THREE.MathUtils.lerp(rim(theta), deg(89.5), t)
    // Copa estructurada: el frente se mantiene alto y la copa algo más amplia que la cabeza
    const frontness = Math.max(0, Math.cos(theta))
    const r = radius(theta, phi) + (1.1 + extra + 1.4 * frontness * Math.sin(Math.PI * Math.min(1, t * 1.15))) * cm
    return center.clone().addScaledVector(dir(theta, phi), r)
  }
  // Abertura de atrás (menos en la cerrada): un arco de unos 9 cm de ancho y 6 de alto sobre el borde
  const open = hat.closure !== 'cerrada'
  const arcH = 6.5
  const hAt = (theta: number, t: number) => t * radius(theta, 0) * (deg(89.5) - rim(theta)) / cm
  const inOpening = (theta: number, t: number) => {
    if (!open) return false
    const h = hAt(theta, t)
    const half = h < arcH ? 4.8 * Math.sqrt(1 - (h / arcH) ** 2) : 0
    return angDist(theta, Math.PI) * (radius(theta, 0) / cm) < half
  }
  const mesh = (theta: number) => hat.mesh && angDist(theta, 0) > (six ? deg(62) : deg(38))
  m.grid(nu + 1, nv, (i, j) => {
    const theta = (i / nu) * Math.PI * 2
    const t = j / (nv - 1)
    const hr = radius(theta, rim(theta)) / cm
    // Distancia a la costura de panel más cercana (cm, sobre la copa) para los pespuntes
    const d = Math.min(...seams.map((s) => angDist(theta, s))) * hr * Math.cos(THREE.MathUtils.lerp(rim(theta), deg(89.5), t))
    return { p: point(theta, t), u: theta * hr, v: hAt(theta, t), edge: [d, hAt(theta, t), EDGE_CODES.pespunte] }
  }, (i) => (mesh(((i + 0.5) / nu) * Math.PI * 2) ? 'mangas' : 'cuerpo'), (i, j) => inOpening(((i + 0.5) / nu) * Math.PI * 2, (j + 0.5) / (nv - 1)))
  // Canto de abajo de la copa (cinta interior) y de la abertura
  const band = Array.from({ length: nu }, (_, i) => (i / nu) * Math.PI * 2).filter((th) => !inOpening(th, 0.02))
  m.tube(band.map((th) => point(th, 0)), 0.22 * cm, 'cuerpo', !open)
  if (open) {
    const arc: THREE.Vector3[] = []
    for (let k = 0; k <= 16; k++) {
      // Recorre el arco (media elipse): de un pie al otro pasando por arriba
      const ang = (k / 16 - 0.5) * Math.PI
      const h = arcH * Math.cos(ang)
      const theta = Math.PI + (4.8 * Math.sin(ang)) / (radius(Math.PI, 0) / cm)
      arc.push(point(theta, h / (radius(theta, 0) * (deg(89.5) - rim(theta)) / cm)))
    }
    m.tube(arc, 0.25 * cm, 'cuerpo', false)
    // Cierre: una tira sobre la abertura, a la altura del borde (snapback con sus botones, hebilla o velcro)
    const w = 2.2
    const strap: THREE.Vector3[][] = []
    for (let k = 0; k <= 10; k++) {
      const theta = Math.PI + (k / 10 - 0.5) * 2 * 6.5 / (radius(Math.PI, 0) / cm)
      strap.push([0, 1].map((r) => point(theta, (r * w + 0.4) / (radius(theta, 0) * (deg(89.5) - rim(theta)) / cm), 0.15)))
    }
    m.grid(11, 2, (i, j) => ({ p: strap[i][j], u: i * 1.3, v: j * w }), 'ojales')
    if (hat.closure === 'snapback')
      for (let k = 0; k < 4; k++) {
        const theta = Math.PI + (k / 3 - 0.5) * 2 * 3 / (radius(Math.PI, 0) / cm)
        const p = point(theta, (w / 2 + 0.4) / (radius(theta, 0) * (deg(89.5) - rim(theta)) / cm), 0.4)
        m.sphere(p, [0.42 * cm, 0.42 * cm, 0.25 * cm], 'ojales')
      }
    if (hat.closure === 'hebilla') {
      const theta = Math.PI + 2.5 / (radius(Math.PI, 0) / cm)
      const p = point(theta, (w / 2 + 0.4) / (radius(theta, 0) * (deg(89.5) - rim(theta)) / cm), 0.35)
      m.ring(p, p.clone().sub(center).normalize(), 1.1 * cm, 0.18 * cm, 'ojales')
    }
  }
  // Ojetes en cada panel y botón arriba
  for (let k = 0; k < seams.length; k++) {
    const a = seams[k]
    const b = seams[(k + 1) % seams.length] + (k + 1 === seams.length ? Math.PI * 2 : 0)
    const theta = (a + b) / 2
    if (angDist(theta, 0) < deg(20)) continue
    const p = point(theta, 0.72, 0.05)
    m.ring(p, p.clone().sub(center).normalize(), 0.3 * cm, 0.1 * cm, 'cuello')
  }
  const top = point(0, 1)
  m.sphere(top.add(new THREE.Vector3(0, 0.2 * cm, 0)), [1 * cm, 0.45 * cm, 1 * cm], 'botones')

  // Visera: de un lado al otro de la frente, en forma de D, algo inclinada hacia abajo; la curva cae a los lados
  const span = deg(68)
  const nb = 25
  const nr = 8
  const depth = 7.2
  const flat = hat.brim === 'plana'
  const brim = (s: number, r: number, below: number) => {
    const theta = (s - 0.5) * 2 * span
    const base = point(theta, 0, -0.6)
    const out = new THREE.Vector3(Math.sin(theta), 0, Math.cos(theta))
    const len = depth * Math.pow(Math.max(0, Math.cos((theta / span) * (Math.PI / 2))), 0.55) * r
    const p = base.addScaledVector(out, len * cm)
    const drop = len * Math.tan(deg(flat ? 6 : 12)) + (flat ? 0 : 2.2 * (theta / span) ** 2 * (len / depth))
    p.y -= (drop + below) * cm
    return { p, len }
  }
  for (const below of [0, 0.32]) {
    m.grid(nb, nr, (i, j) => {
      const s = i / (nb - 1)
      const r = j / (nr - 1)
      const q = brim(s, r, below)
      const full = depth * Math.pow(Math.max(0, Math.cos(((s - 0.5) * 2 * span / span) * (Math.PI / 2))), 0.55)
      return { p: q.p, u: s * 30, v: q.len, edge: below ? undefined : [Math.max(0, full - q.len), s * 30, EDGE_CODES.recubierta] }
    }, 'capucha')
  }
  // Canto de la visera
  m.tube(Array.from({ length: nb }, (_, i) => brim(i / (nb - 1), 1, 0.16).p), 0.17 * cm, 'capucha', false)
  return m
}

/** Gorro o gorra puesto en la cabeza del maniquí, con los materiales de cada zona. */
export function Headwear({ model, cloud, design, height }: { model: Model; cloud: Cloud; design: Design; height: number }) {
  const materials = useSlotMaterials(design)
  const hat = design.hat
  const key = JSON.stringify(hat)
  const geometry = useMemo(() => {
    if (!hat) return null
    const frame = measureHead(cloud, model.body.skeleton, height)
    if (!frame) return null
    return (hat.kind === 'gorra' ? buildCap(frame, hat) : buildBeanie(frame, hat)).geometry(frame.bone)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloud, model, height, key])
  useEffect(() => {
    if (!geometry) return
    // Costuras y pespuntes dibujados en la tela (como en la ropa de patrón)
    for (const m of materials) if (m.userData.seams) (m.userData.seams as { value: number }).value = 1
    const mesh = new THREE.SkinnedMesh(geometry, materials)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.frustumCulled = false
    mesh.bind(model.body.skeleton, model.body.bindMatrix)
    model.root.add(mesh)
    return () => {
      model.root.remove(mesh)
    }
  }, [geometry, materials, model])
  useEffect(() => () => geometry?.dispose(), [geometry])
  return null
}

