import * as THREE from 'three'
import type { FabricLook } from '../../data/fabrics'
import { GARMENT_SLOTS, slotIndex, type Design, type GarmentSlot, type Measurements } from '../../types'
import type { ModelInfo } from '../body'
import { Part, skinPoints, unskinPoints, type PoseData } from '../pose'
import { CloudGrid } from '../wrap'
import { EDGE_CODES } from './Cloth'
import { buildHoodie, type HoodieResult, type PocketShape } from './hoodie'
import { buildPants } from './pants'
import type { Patch, Tab } from './patches'
import { buildFemTop } from './femtop'
import { relax, SpatialHash } from './relax'
import { skinCloth } from './skinCloth'

/** Todo lo necesario para vestir el maniquí, en datos simples (se puede enviar a un Web Worker). */
export interface DressInput {
  info: ModelInfo
  /** Cuerpo en la postura en T (con las medidas aplicadas) y sus pesos de huesos. */
  cloud: { pos: Float32Array; skinIndex: Uint16Array; skinWeight: Float32Array }
  pose: PoseData
  /** Metros reales por unidad del modelo. */
  scale: number
  measurements: Measurements
  design: Design
  /** Tela del cuerpo de la prenda (su rigidez decide cómo cae). */
  fabric: FabricLook
  /** Solo para depurar: segundos de simulación (0 = ver la prenda sin asentar). */
  seconds?: number
  /**
   * Prenda que va debajo, ya asentada (puntos y normales hacia fuera, en la pose de reposo): esta se asienta encima de
   * ella como si fuera parte del cuerpo (la sudadera sobre el pantalón, sin atravesarlo).
   */
  underlay?: Underlay
}

/** Superficie de una prenda asentada, para que otra se asiente encima. */
export interface Underlay {
  points: Float32Array
  normals: Float32Array
}

/** Malla de la prenda lista para crear una BufferGeometry (en la postura base del esqueleto). */
export interface DressOutput {
  position: Float32Array
  normal: Float32Array
  uv: Float32Array
  /** Por punto: distancia al borde de su pieza (cm), posición a lo largo del borde (cm) y acabado (EDGE_CODES). */
  edge: Float32Array
  skinIndex: Uint16Array
  skinWeight: Float32Array
  index: Uint32Array
  /** Grupos de material: [inicio, cantidad, material]; el material es el índice de la zona en GARMENT_SLOTS. */
  groups: [number, number, number][]
  /** Forma del bolsillo canguro en las UV del delantero (cm), para recortarlo exacto; null si no lleva. */
  pocket: PocketShape | null
  /** Tiempo de cada fase, en ms (para vigilar el rendimiento). */
  timings: Record<string, number>
  /** Su superficie asentada, para que la prenda de encima se apoye en ella. */
  surface: Underlay
}

/**
 * Viste el maniquí con una prenda de patrón (de momento, la sudadera):
 * 1. arma las piezas alrededor del cuerpo en la postura en T y les da los pesos de los huesos,
 * 2. las lleva a la pose de reposo de la animación y deja que la tela se asiente (costuras, gravedad, choques),
 * 3. añade el bolsillo y devuelve la malla a la postura base para que la animación la mueva.
 */
export function dressPatternGarment(input: DressInput): DressOutput {
  const { info, cloud, pose, measurements, design, fabric } = input
  const unit = 1 / (input.scale * 100)
  const timings: Record<string, number> = {}
  let t0 = performance.now()
  const lap = (name: string) => {
    const now = performance.now()
    timings[name] = Math.round(now - t0)
    t0 = now
  }
  const isPants = design.garment === 'pantalon'
  const pants = isPants ? pantsGarment({ info, points: cloud.pos, unit }, measurements, design) : null
  const femTop = !isPants && design.garment === 'top' ? femTopGarment({ info, points: cloud.pos, unit }, measurements, design) : null
  const garment = pants ?? femTop ?? buildHoodie({ info, points: cloud.pos, unit }, measurements, design)
  const { cloth, follows, slots, pocket, layers, cordExits, rims, closure, cuffButtons, patches, tabs } = garment

  // La rigidez a la flexión depende de la tela
  for (const l of cloth.links) if (l.k < 0.5) l.k = Math.min(1, l.k * fabric.stiffness)

  lap('patron')
  const { skinIndex, skinWeight } = skinCloth(cloth, cloud, new CloudGrid(cloud.pos), pose.parts, follows)
  lap('pesos')
  cloth.pos = Array.from(skinPoints(pose, cloth.pos, skinIndex, skinWeight))
  const relaxed = femTop
    ? relax(cloth, pose, {
        seconds: input.seconds ?? 1.2,
        thickness: 0.6 * unit,
        gravity: 980 * unit,
        cell: 2.2 * unit,
        // El borde de arriba se sujeta (un top sin tirantes no se escurre)
        pins: femTop.pins,
      })
    : isPants
    ? relax(cloth, withShoes(pose, unit), {
        // Un poco más de tiempo: la tela de más del bajo tiene que caer y apilarse sobre las zapatillas
        seconds: input.seconds ?? 1.6,
        thickness: 0.9 * unit,
        gravity: 980 * unit,
        cell: 2.2 * unit,
        // Una pernera no atraviesa la otra
        layers: pants ? [{ mode: 'apart', outer: pants.legs[0], inner: pants.legs[1], gap: 1.4 * unit }] : [],
        floor: 0.3 * unit,
        pins: pants?.pins,
      })
    : relax(cloth, input.underlay ? withUnderlay(pose, input.underlay) : pose, {
    seconds: input.seconds ?? 1.2,
    thickness: 0.9 * unit,
    gravity: 980 * unit,
    cell: 2.2 * unit,
    // La tela no se atraviesa a sí misma: la capucha queda encima de la espalda y las mangas no se meten en el cuerpo
    layers: [
      { mode: 'outside', outer: layers.hood, inner: layers.torso, gap: 0.9 * unit },
      // Separación algo mayor que la malla (2,2 cm): con menos, los triángulos se cruzaban entre punto y punto
      { mode: 'apart', outer: layers.sleevesLow, inner: layers.torsoLow, gap: 3 * unit },
      // Junto a la sisa están más cerca (a un lado y otro de la costura): separación más corta
      { mode: 'apart', outer: layers.sleeveCap, inner: layers.torsoArmhole, gap: 1.5 * unit },
    ],
    bodyOnly: layers.bodyOnly,
    pins: layers.collarPins,
    bodyParts: [Part.Torso, Part.Neck, Part.LegL, Part.LegR],
  })
  weldSeams(relaxed, cloth.seams)
  // Quita el "ruido" de arrugas diminutas (picos de un solo punto) sin encoger la prenda ni borrar los pliegues
  // Los bordes libres (abertura de la capucha, final de puños y bajo) no se tocan: sin vecinos por fuera, encogerían
  const sewn = new Set(cloth.seams.flat())
  const border = cloth.edgeInfo()
  const fixed = (v: number) => border[v * 3] < 1e-3 && !sewn.has(v)
  taubinSmooth(relaxed, cloth.neighbours(), 4, fixed)
  // Los bordes libres se alisan a lo largo del propio borde (sin encogerlos hacia dentro): si no, salen dentados
  for (const rim of rims) smoothChain(relaxed, rim.verts, 6)
  weldSeams(relaxed, cloth.seams)
  lap('asentar')

  // Malla de la prenda (en la pose de reposo)
  const positions = Array.from(relaxed)
  const uvs = [...cloth.flat]
  const idx = Array.from(skinIndex)
  const wts = Array.from(skinWeight)
  // Distancia de cada punto al borde de su pieza y acabado del borde (costuras, pespuntes y rebordes, ver Garment.tsx)
  const edges = Array.from(cloth.edgeInfo())
  // Triángulos agrupados por zona de la prenda (cada zona lleva su color y material)
  const bySlot: number[][] = GARMENT_SLOTS.map(() => [])
  for (const tris of cloth.tris) {
    for (let t = 0; t < tris.length; t += 3) {
      const slot = slotIndex(slots[cloth.panelOf[tris[t]]])
      bySlot[slot].push(tris[t], tris[t + 1], tris[t + 2])
    }
  }
  const pocketTris = bySlot[slotIndex('bolsillo' satisfies GarmentSlot)]

  // Bolsillo canguro: una capa de tela por encima del delantero, en la zona del bolsillo
  if (pocket) {
    const normals = vertexNormals(relaxed, [...cloth.tris[0], ...cloth.tris[1]])
    const copy = new Map<number, number>()
    const lift = 0.35 * unit
    const tris = cloth.tris[0]
    for (let t = 0; t < tris.length; t += 3) {
      const tri = [tris[t], tris[t + 1], tris[t + 2]]
      // Se copian también los triángulos del borde: el material del bolsillo recorta la forma exacta (ver Garment.tsx)
      const touches =
        tri.every((v) => cloth.panelOf[v] === pocket.panel) && tri.some((v) => pocket.inside(cloth.flat[v * 2], cloth.flat[v * 2 + 1]))
      if (!touches) continue
      for (const v of tri) {
        if (!copy.has(v)) {
          copy.set(v, positions.length / 3)
          for (let c = 0; c < 3; c++) positions.push(relaxed[v * 3 + c] + normals[v * 3 + c] * lift)
          uvs.push(cloth.flat[v * 2], cloth.flat[v * 2 + 1])
          // El bolsillo dibuja sus propios bordes a partir de su forma
          edges.push(99, 0, EDGE_CODES.ninguno)
          for (let j = 0; j < 4; j++) {
            idx.push(skinIndex[v * 4 + j])
            wts.push(skinWeight[v * 4 + j])
          }
        }
        pocketTris.push(copy.get(v)!)
      }
    }
  }

  // Cordones de la capucha, con ojales metálicos donde salen
  if (cordExits.length) {
    addCords(
      { positions, uvs, edges, idx, wts, bySlot },
      relaxed,
      [...layers.torso, ...layers.hoodAll],
      [...cloth.tris[0], ...cloth.tris[1]],
      cordExits,
      skinIndex,
      skinWeight,
      pose,
      unit,
    )
  }

  // Todas las caras de la tela miran hacia fuera del cuerpo (así la luz y el interior oscuro de la prenda salen bien)
  // (los puntos copiados del bolsillo van todos en un grupo propio)
  const baseCount = cloth.panelOf.length
  orientOutwards(bySlot, new Float32Array(positions), pose, unit, (v) => (v < baseCount ? cloth.panelOf[v] : -1))

  // Rebordes con grosor (después de orientar: son tubos y ya tienen sus caras hacia fuera)
  const normalOf = fabricNormals(relaxed, [...cloth.tris[0], ...cloth.tris[1]], pose, unit)
  // Superficie de esta prenda (para la que vaya encima): sus puntos asentados, un poco hacia fuera, con su normal
  const surfaceNormals = new Float32Array(relaxed.length)
  for (let v = 0; v < relaxed.length / 3; v++) surfaceNormals.set(normalOf(v).toArray(), v * 3)
  const surface: Underlay = { points: Float32Array.from(relaxed), normals: surfaceNormals }
  for (const rim of rims) {
    const path = rim.verts.map((v) => new THREE.Vector3().fromArray(relaxed, v * 3))
    const ups = rim.verts.map((v) => normalOf(v))
    tube(
      { positions, uvs, edges, idx, wts, bySlot },
      path,
      ups,
      rim.verts,
      { w: rim.radius * unit, h: rim.radius * unit, twist: 0 },
      unit,
      rim.slot,
      skinIndex,
      skinWeight,
    )
  }

  // Bolsillos de parche, solapas, vivos y trabillas, pegados a la tela ya asentada
  if (patches.length || tabs.length) addPatches({ positions, uvs, edges, idx, wts, bySlot }, relaxed, cloth, patches, tabs, normalOf, unit, skinIndex, skinWeight)

  // Botones y cremallera de verdad (con volumen), sobre la tela ya asentada
  if (closure || cuffButtons.length)
    addClosure({ positions, uvs, edges, idx, wts, bySlot }, relaxed, closure, cuffButtons, normalOf, unit, skinIndex, skinWeight)

  const position = new Float32Array(positions)
  const skinIdx = new Uint16Array(idx)
  const skinWts = new Float32Array(wts)
  unskinPoints(pose, position, skinIdx, skinWts)
  const index = new Uint32Array(bySlot.flat())
  const groups: [number, number, number][] = []
  let start = 0
  bySlot.forEach((tris, material) => {
    if (tris.length) groups.push([start, tris.length, material])
    start += tris.length
  })
  const normal = vertexNormals(position, Array.from(index))
  lap('malla')

  // Normales iguales a ambos lados de cada costura, para que la prenda se vea de una pieza
  const v = new THREE.Vector3()
  for (const [a, b] of cloth.seams) {
    v.set(normal[a * 3] + normal[b * 3], normal[a * 3 + 1] + normal[b * 3 + 1], normal[a * 3 + 2] + normal[b * 3 + 2]).normalize()
    normal.set([v.x, v.y, v.z], a * 3)
    normal.set([v.x, v.y, v.z], b * 3)
  }

  return {
    position,
    normal,
    uv: new Float32Array(uvs),
    edge: new Float32Array(edges),
    skinIndex: skinIdx,
    skinWeight: skinWts,
    index,
    groups,
    pocket: pocket?.shape ?? null,
    timings,
    surface,
  }
}

/** El top de mujer con el mismo formato que la sudadera. */
function femTopGarment(body: Parameters<typeof buildFemTop>[0], m: Measurements, design: Design) {
  const p = buildFemTop(body, m, design)
  const none: number[] = []
  return {
    ...p,
    pocket: null,
    cordExits: none,
    closure: null,
    cuffButtons: none,
    patches: [] as Patch[],
    tabs: [] as Tab[],
    layers: { hood: none, hoodAll: none, torso: none, sleevesLow: none, torsoLow: none, sleeveCap: none, torsoArmhole: none, bodyOnly: none, collarPins: none },
  }
}

/** El pantalón con el mismo formato que la sudadera (sin capucha, bolsillo ni cordones). */
function pantsGarment(body: Parameters<typeof buildPants>[0], m: Measurements, design: Design) {
  const p = buildPants(body, m, design)
  const none: number[] = []
  return {
    ...p,
    pocket: null,
    closure: null,
    // Los cordones de la cintura se apoyan en toda la tela del pantalón
    layers: { hood: none, hoodAll: none, torso: Array.from({ length: p.cloth.panelOf.length }, (_, v) => v), sleevesLow: none, torsoLow: none, sleeveCap: none, torsoArmhole: none, bodyOnly: none, collarPins: none },
  }
}

/**
 * Parches (bolsillos, solapas, vivos) pegados a la tela asentada: cada punto del parche se busca en el patrón plano de
 * su pieza (en qué triángulo cae) y toma la posición, la normal y los huesos de ese trozo de tela, un poco por fuera.
 * Lleva sus propios bordes (pespuntes, dobleces) y la textura de la tela continúa (UV = patrón en cm).
 */
function addPatches(
  out: MeshBuffers,
  relaxed: Float32Array,
  cloth: { flat: number[]; panelOf: number[]; tris: [number[], number[]] },
  patches: Patch[],
  tabs: Tab[],
  normalOf: (v: number) => THREE.Vector3,
  cm: number,
  skinIndex: Uint16Array,
  skinWeight: Float32Array,
) {
  const trisOf = new Map<number, number[]>()
  for (const tris of cloth.tris)
    for (let t = 0; t < tris.length; t += 3) {
      const p = cloth.panelOf[tris[t]]
      if (!trisOf.has(p)) trisOf.set(p, [])
      trisOf.get(p)!.push(tris[t], tris[t + 1], tris[t + 2])
    }
  const F = cloth.flat
  /** Punto de la tela en (x, y) del patrón de una pieza: posición, normal y el punto de tela más cercano. */
  const onCloth = (panel: number, x: number, y: number) => {
    const tris = trisOf.get(panel) ?? []
    let best = { score: Infinity, t: 0, w: [1, 0, 0] }
    for (let t = 0; t < tris.length; t += 3) {
      const [a, b, c] = [tris[t], tris[t + 1], tris[t + 2]]
      const ax = F[a * 2], ay = F[a * 2 + 1]
      const v0x = F[b * 2] - ax, v0y = F[b * 2 + 1] - ay
      const v1x = F[c * 2] - ax, v1y = F[c * 2 + 1] - ay
      const v2x = x - ax, v2y = y - ay
      const den = v0x * v1y - v1x * v0y
      if (Math.abs(den) < 1e-9) continue
      const wb = (v2x * v1y - v1x * v2y) / den
      const wc = (v0x * v2y - v2x * v0y) / den
      const wa = 1 - wb - wc
      // Fuera del triángulo: cuánto se sale (el de menos, si el punto cae fuera de la pieza)
      const score = Math.max(0, -wa) + Math.max(0, -wb) + Math.max(0, -wc)
      if (score < best.score) best = { score, t, w: [wa, wb, wc] }
      if (score === 0) break
    }
    const ids = [tris[best.t], tris[best.t + 1], tris[best.t + 2]]
    const w = best.w.map((k) => THREE.MathUtils.clamp(k, -0.2, 1.2))
    const p = new THREE.Vector3()
    const n = new THREE.Vector3()
    ids.forEach((v, k) => {
      p.addScaledVector(new THREE.Vector3().fromArray(relaxed, v * 3), w[k])
      n.addScaledVector(normalOf(v), w[k])
    })
    const anchor = ids[w.indexOf(Math.max(...w))]
    return { p, n: n.normalize(), anchor }
  }

  for (const patch of patches) {
    const { nu, nv } = patch
    const base = out.positions.length / 3
    const flat: [number, number][] = []
    const normals: THREE.Vector3[] = []
    for (let j = 0; j < nv; j++)
      for (let i = 0; i < nu; i++) {
        const [x, y] = patch.shape(i / (nu - 1), j / (nv - 1))
        const q = onCloth(patch.panel, x, y)
        q.p.addScaledVector(q.n, patch.lift * cm)
        out.positions.push(q.p.x, q.p.y, q.p.z)
        out.uvs.push(x, y)
        pushSkin(out, q.anchor, skinIndex, skinWeight)
        flat.push([x, y])
        normals.push(q.n)
      }
    const at = (i: number, j: number) => j * nu + i
    const dist = (a: number, b: number) => Math.hypot(flat[a][0] - flat[b][0], flat[a][1] - flat[b][1])
    for (let j = 0; j < nv; j++)
      for (let i = 0; i < nu; i++) {
        const v = at(i, j)
        const cands: [number, number, number][] = [
          [dist(v, at(0, j)), flat[at(0, j)][1], EDGE_CODES[patch.edges[0]]],
          [dist(v, at(nu - 1, j)), flat[at(nu - 1, j)][1], EDGE_CODES[patch.edges[1]]],
          [dist(v, at(i, 0)), flat[at(i, 0)][0], EDGE_CODES[patch.edges[2]]],
          [dist(v, at(i, nv - 1)), flat[at(i, nv - 1)][0], EDGE_CODES[patch.edges[3]]],
        ]
        let best: [number, number, number] = [99, 0, EDGE_CODES.ninguno]
        for (const c of cands) if (c[2] !== EDGE_CODES.ninguno && c[0] < best[0]) best = c
        out.edges.push(...best)
      }
    const tris = out.bySlot[slotIndex(patch.slot)]
    const P = (k: number) => new THREE.Vector3().fromArray(out.positions, (base + k) * 3)
    for (let j = 0; j < nv - 1; j++)
      for (let i = 0; i < nu - 1; i++) {
        const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1)
        // Cara hacia fuera de la tela
        const nrm = P(b).sub(P(a)).cross(P(c).sub(P(a)))
        if (nrm.dot(normals[a]) >= 0) tris.push(base + a, base + b, base + c, base + b, base + d, base + c)
        else tris.push(base + a, base + c, base + b, base + b, base + c, base + d)
      }
    // Canto del parche: una tira corta hacia la tela, para que tenga grosor y no se vea de papel
    const ring = [...Array.from({ length: nu }, (_, i) => at(i, 0)), ...Array.from({ length: nv - 1 }, (_, j) => at(nu - 1, j + 1)), ...Array.from({ length: nu - 1 }, (_, i) => at(nu - 2 - i, nv - 1)), ...Array.from({ length: nv - 2 }, (_, j) => at(0, nv - 2 - j))]
    const rimBase = out.positions.length / 3
    ring.forEach((k) => {
      const p = P(k).addScaledVector(normals[k], -patch.lift * cm)
      out.positions.push(p.x, p.y, p.z)
      out.uvs.push(flat[k][0], flat[k][1])
      out.edges.push(0.05, 0, EDGE_CODES.doblez)
      for (let q = 0; q < 4; q++) {
        out.idx.push(out.idx[(base + k) * 4 + q])
        out.wts.push(out.wts[(base + k) * 4 + q])
      }
    })
    for (let r = 0; r < ring.length; r++) {
      const a = base + ring[r], b = base + ring[(r + 1) % ring.length]
      const c = rimBase + r, d = rimBase + ((r + 1) % ring.length)
      tris.push(a, c, b, b, c, d, a, b, c, b, d, c)
    }
    if (patch.button) {
      const [x, y] = patch.shape(patch.button.u, patch.button.v)
      const q = onCloth(patch.panel, x, y)
      const t = new THREE.Vector3(0, 1, 0).addScaledVector(q.n, -q.n.y).normalize()
      button(out, q.p.addScaledVector(q.n, (patch.lift + 0.08) * cm), q.n, t, (patch.button.size / 2) * cm, patch.button.size >= 1.4, q.anchor, skinIndex, skinWeight)
    }
  }

  for (const tab of tabs) {
    const p = new THREE.Vector3().fromArray(relaxed, tab.vertex * 3)
    const n = normalOf(tab.vertex)
    const t = new THREE.Vector3(0, 1, 0).addScaledVector(n, -n.y).normalize()
    const b = t.clone().cross(n).normalize()
    box(out, p.addScaledVector(n, (tab.size[2] / 2 + 0.05) * cm), t, b, n, [tab.size[0] * cm, tab.size[1] * cm, tab.size[2] * cm], tab.slot, tab.vertex, skinIndex, skinWeight)
  }
}

/** Recorrido de un borde de tela: posición, normal de la tela y punto de tela más cercano a cada distancia (cm). */
function edgePath(relaxed: Float32Array, verts: number[], normalOf: (v: number) => THREE.Vector3, cm: number) {
  const pts = verts.map((v) => new THREE.Vector3().fromArray(relaxed, v * 3))
  const acc = [0]
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + pts[i].distanceTo(pts[i - 1]) / cm)
  const length = acc[acc.length - 1]
  const at = (d: number) => {
    const dd = THREE.MathUtils.clamp(d, 0, length)
    let i = 1
    while (i < pts.length - 1 && acc[i] < dd) i++
    const f = (dd - acc[i - 1]) / Math.max(1e-6, acc[i] - acc[i - 1])
    const p = pts[i - 1].clone().lerp(pts[i], f)
    const t = pts[i].clone().sub(pts[i - 1]).normalize()
    const near = f < 0.5 ? verts[i - 1] : verts[i]
    const n = normalOf(verts[i - 1]).lerp(normalOf(verts[i]), f).normalize()
    // Tangente perpendicular a la normal
    t.addScaledVector(n, -t.dot(n)).normalize()
    return { p, t, n, b: t.clone().cross(n).normalize(), anchor: near }
  }
  return { length, at }
}

/** Caja orientada (dientes de la cremallera, cursor, tirador). `size` = ancho (b), largo (t) y grueso (n). */
function box(
  out: MeshBuffers,
  center: THREE.Vector3,
  t: THREE.Vector3,
  b: THREE.Vector3,
  n: THREE.Vector3,
  size: [number, number, number],
  slot: GarmentSlot,
  anchor: number,
  skinIndex: Uint16Array,
  skinWeight: Float32Array,
) {
  const base = out.positions.length / 3
  const tris = out.bySlot[slotIndex(slot)]
  // Seis caras con sus propios vértices (aristas vivas)
  // Ejes de la caja con su medio tamaño: 0 = b (ancho), 1 = t (largo), 2 = n (grueso)
  const ax = [b, t, n]
  const hs = size.map((x) => x / 2)
  const faces: [number, number, number, number][] = [
    [2, 1, 0, 1],
    [2, -1, 1, 0],
    [0, 1, 1, 2],
    [0, -1, 2, 1],
    [1, 1, 2, 0],
    [1, -1, 0, 2],
  ]
  faces.forEach(([ai, sign, ui, vi], f) => {
    const axis = ax[ai].clone().multiplyScalar(sign)
    const u = ax[ui]
    const v = ax[vi]
    const c = center.clone().addScaledVector(axis, hs[ai])
    const hu = hs[ui]
    const hv = hs[vi]
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const q = c.clone().addScaledVector(u, su * hu).addScaledVector(v, sv * hv)
      out.positions.push(q.x, q.y, q.z)
      out.uvs.push(0, 0)
      out.edges.push(99, 0, EDGE_CODES.ninguno)
      pushSkin(out, anchor, skinIndex, skinWeight)
    }
    const k = base + f * 4
    // Cara hacia fuera según el eje
    const nrm = u.clone().cross(v)
    if (nrm.dot(axis) > 0) tris.push(k, k + 1, k + 2, k, k + 2, k + 3)
    else tris.push(k, k + 2, k + 1, k, k + 3, k + 2)
  })
}

/**
 * Botón de cuatro agujeros (o abombado, el de metal de las cazadoras) apoyado en la tela: un perfil que gira alrededor
 * de la normal. `r` = radio (unidades del modelo).
 */
function button(
  out: MeshBuffers,
  center: THREE.Vector3,
  n: THREE.Vector3,
  t: THREE.Vector3,
  r: number,
  domed: boolean,
  anchor: number,
  skinIndex: Uint16Array,
  skinWeight: Float32Array,
) {
  const h = r * (domed ? 0.55 : 0.32)
  // Perfil (radio, alto) del centro al canto y de vuelta por debajo
  const profile: [number, number][] = domed
    ? [[0, h], [0.4, h * 0.95], [0.7, h * 0.78], [0.9, h * 0.5], [1, h * 0.2], [0.96, 0], [0, 0]]
    : [[0, h * 0.6], [0.5, h * 0.62], [0.68, h * 0.95], [0.86, h], [1, h * 0.7], [1, h * 0.2], [0.94, 0], [0, 0]]
  const seg = 22
  const base = out.positions.length / 3
  const tris = out.bySlot[slotIndex('botones')]
  const b = t.clone().cross(n).normalize()
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2
    const dir = t.clone().multiplyScalar(Math.cos(a)).addScaledVector(b, Math.sin(a))
    for (const [pr, ph] of profile) {
      const q = center.clone().addScaledVector(dir, pr * r).addScaledVector(n, ph)
      out.positions.push(q.x, q.y, q.z)
      out.uvs.push(0, 0)
      out.edges.push(99, 0, EDGE_CODES.ninguno)
      pushSkin(out, anchor, skinIndex, skinWeight)
    }
  }
  const m = profile.length
  for (let i = 0; i < seg; i++) {
    for (let k = 0; k < m - 1; k++) {
      const a0 = base + i * m + k
      const a1 = base + ((i + 1) % seg) * m + k
      tris.push(a0, a0 + 1, a1, a1, a0 + 1, a1 + 1)
    }
  }
  if (!domed) {
    // Cuatro agujeros con el hilo cruzado: dos pasadas de hilo (del color de los botones, más finas)
    const hole = r * 0.22
    for (const [u0, v0, u1, v1] of [[-1, -1, 1, 1], [-1, 1, 1, -1]]) {
      const p0 = center.clone().addScaledVector(t, u0 * hole).addScaledVector(b, v0 * hole).addScaledVector(n, h * 0.66)
      const p1 = center.clone().addScaledVector(t, u1 * hole).addScaledVector(b, v1 * hole).addScaledVector(n, h * 0.66)
      const mid = p0.clone().add(p1).multiplyScalar(0.5)
      const dir = p1.clone().sub(p0)
      const len = dir.length()
      dir.normalize()
      box(out, mid, dir, dir.clone().cross(n).normalize(), n, [r * 0.09, len, r * 0.08], 'cordones', anchor, skinIndex, skinWeight)
    }
  }
}

/**
 * Cierre delantero: botones repartidos por la tapeta (o el borde del delantero izquierdo si va abierta) o cremallera
 * de dientes finos con su cursor y tirador; y el botón de cada puño de camisa.
 */
function addClosure(
  out: MeshBuffers,
  relaxed: Float32Array,
  closure: HoodieResult['closure'],
  cuffButtons: number[],
  normalOf: (v: number) => THREE.Vector3,
  cm: number,
  skinIndex: Uint16Array,
  skinWeight: Float32Array,
) {
  for (const v of cuffButtons) {
    const p = new THREE.Vector3().fromArray(relaxed, v * 3)
    const n = normalOf(v)
    const t = new THREE.Vector3(0, 1, 0).addScaledVector(n, -n.y).normalize()
    button(out, p.addScaledVector(n, 0.08 * cm), n, t, 0.5 * cm, false, v, skinIndex, skinWeight)
  }
  if (!closure) return
  const left = edgePath(relaxed, closure.left, normalOf, cm)
  if (closure.kind === 'botones') {
    const r = (closure.size / 2) * cm
    const domed = closure.size >= 1.4
    const n = Math.max(1, closure.buttons)
    // Del escote hacia abajo: el primero a 1,8 cm del escote; el último, a unos 12 cm del bajo (o en medio del placket del polo)
    const top = left.length - (closure.full ? 1.8 : 1.6)
    const bottom = closure.full ? Math.min(12, left.length * 0.2) : 2
    for (let k = 0; k < n; k++) {
      const d = n === 1 ? top : top - ((top - bottom) * k) / (n - 1)
      const q = left.at(d)
      // Abierta, el botón va en el delantero izquierdo, a 1,4 cm de su canto
      const side = q.b.x > 0 ? q.b.clone().negate() : q.b
      const c = q.p.clone().addScaledVector(q.n, 0.1 * cm)
      if (closure.open) c.addScaledVector(side, 1.4 * cm)
      button(out, c, q.n, q.t, r, domed, q.anchor, skinIndex, skinWeight)
    }
    return
  }
  // Cremallera: dientes cada 3 mm, alternos de un lado y otro (cerrada, engranados en el centro)
  const pitch = 0.3
  const toothW = 0.5 * cm
  const sides = closure.open ? [left, edgePath(relaxed, closure.right, normalOf, cm)] : [left]
  sides.forEach((path, s) => {
    for (let d = 0.4, k = 0; d < path.length - 0.4; d += pitch, k++) {
      const q = path.at(d)
      const off = closure.open ? (s === 0 ? -1 : 1) * 0.25 : k % 2 ? 0.12 : -0.12
      // El lado se mide hacia fuera del cuerpo en x (izquierdo hacia -x)
      const bx = q.b.x < 0 ? q.b.clone().negate() : q.b
      const c = q.p.clone().addScaledVector(q.n, 0.12 * cm).addScaledVector(bx, off * cm)
      box(out, c, q.t, bx, q.n, [toothW, 0.2 * cm, 0.2 * cm], 'ojales', q.anchor, skinIndex, skinWeight)
    }
  })
  // Cursor y tirador: arriba si va cerrada; abierta, abajo en el lado izquierdo
  const q = closure.open ? left.at(1.2) : left.at(left.length - 1.4)
  const bx = q.b.x < 0 ? q.b.clone().negate() : q.b
  const slider = q.p.clone().addScaledVector(q.n, 0.32 * cm)
  box(out, slider, q.t, bx, q.n, [0.9 * cm, 1.5 * cm, 0.42 * cm], 'ojales', q.anchor, skinIndex, skinWeight)
  // Tirador: una lengüeta plana que cuelga del cursor
  const down = q.t.clone().negate()
  const pull = slider.clone().addScaledVector(q.n, 0.3 * cm).addScaledVector(down, 1.7 * cm)
  box(out, pull, q.t, bx, q.n, [0.62 * cm, 2.6 * cm, 0.12 * cm], 'ojales', q.anchor, skinIndex, skinWeight)
}

/** El cuerpo con la prenda de debajo encima (sus puntos cuentan como piel del tronco). */
function withUnderlay(pose: PoseData, under: Underlay): PoseData {
  const n = pose.points.length / 3
  const m = under.points.length / 3
  const points = new Float32Array(pose.points.length + under.points.length)
  points.set(pose.points)
  points.set(under.points, pose.points.length)
  const normals = new Float32Array(points.length)
  normals.set(pose.normals)
  normals.set(under.normals, pose.normals.length)
  const parts = new Uint8Array(n + m)
  parts.set(pose.parts)
  parts.fill(Part.Torso, n)
  return { ...pose, points, normals, parts }
}

/**
 * El cuerpo con zapatillas: los pies, hinchados 3 cm hacia fuera (lo que abulta una zapatilla, con su lengüeta y cordones), para que el bajo
 * del pantalón caiga y se apile encima de ellas en vez de pegarse al pie.
 */
function withShoes(pose: PoseData, unit: number): PoseData {
  const extra: number[] = []
  const extraN: number[] = []
  const extraP: number[] = []
  const n = pose.points.length / 3
  for (let i = 0; i < n; i++) {
    const part = pose.parts[i]
    if (part !== Part.FootL && part !== Part.FootR) continue
    for (let c = 0; c < 3; c++) {
      extra.push(pose.points[i * 3 + c] + pose.normals[i * 3 + c] * 3 * unit)
      extraN.push(pose.normals[i * 3 + c])
    }
    extraP.push(part)
  }
  const points = new Float32Array(pose.points.length + extra.length)
  points.set(pose.points)
  points.set(extra, pose.points.length)
  const normals = new Float32Array(points.length)
  normals.set(pose.normals)
  normals.set(extraN, pose.normals.length)
  const parts = new Uint8Array(n + extraP.length)
  parts.set(pose.parts)
  parts.set(extraP, n)
  return { ...pose, points, normals, parts }
}

/**
 * Da la vuelta a los triángulos que miran hacia el cuerpo, para que la cara de fuera de la tela sea siempre la «delantera».
 * (Las piezas simétricas, como las dos mitades de la capucha, salen del patrón con el giro contrario.)
 */
function orientOutwards(bySlot: number[][], pos: Float32Array, pose: PoseData, unit: number, groupOf: (v: number) => number) {
  // Celda grande: en los cortes amplios la tela queda a varios cm de la piel
  const skin = new SpatialHash(pose.points, 10 * unit)
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const n = new THREE.Vector3()
  const skip = new Set([slotIndex('cordones'), slotIndex('ojales'), slotIndex('botones')])
  // Se decide por pieza entera (por mayoría): en una pieza todos los triángulos tienen el mismo giro,
  // y triángulo a triángulo fallaría donde la piel más cercana es la de otra zona (p. ej. el brazo junto al costado)
  const votes = new Map<number, number>()
  const each = (fn: (tris: number[], t: number) => void) =>
    bySlot.forEach((tris, s) => {
      if (!skip.has(s)) for (let t = 0; t < tris.length; t += 3) fn(tris, t)
    })
  each((tris, t) => {
    a.fromArray(pos, tris[t] * 3)
    b.fromArray(pos, tris[t + 1] * 3)
    c.fromArray(pos, tris[t + 2] * 3)
    const k = skin.nearest((a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3, (a.z + b.z + c.z) / 3)
    if (k < 0) return
    n.subVectors(b, a).cross(c.sub(a)).normalize()
    const out = n.x * pose.normals[k * 3] + n.y * pose.normals[k * 3 + 1] + n.z * pose.normals[k * 3 + 2]
    const g = groupOf(tris[t])
    votes.set(g, (votes.get(g) ?? 0) + Math.sign(out))
  })
  each((tris, t) => {
    if ((votes.get(groupOf(tris[t])) ?? 0) >= 0) return
    const tmp = tris[t + 1]
    tris[t + 1] = tris[t + 2]
    tris[t + 2] = tmp
  })
}

interface MeshBuffers {
  positions: number[]
  uvs: number[]
  edges: number[]
  idx: number[]
  wts: number[]
  bySlot: number[][]
}

/**
 * Cordones de la capucha: salen de un ojal metálico clavado en el canal de la capucha (a cada lado de la cara)
 * y cuelgan por fuera de la capucha y del delantero, con su herrete al final. Cada tramo se mueve con la tela
 * que tiene detrás (toma sus pesos de huesos).
 */
function addCords(
  out: MeshBuffers,
  relaxed: Float32Array,
  /** Puntos de tela sobre los que puede apoyarse el cordón (delantero, espalda y capucha). */
  surface: number[],
  /** Triángulos de la tela (para la normal en el ojal). */
  fabricTris: number[],
  exits: number[],
  skinIndex: Uint16Array,
  skinWeight: Float32Array,
  pose: PoseData,
  unit: number,
) {
  const surfPos = new Float32Array(surface.length * 3)
  surface.forEach((v, k) => surfPos.set(relaxed.subarray(v * 3, v * 3 + 3), k * 3))
  const surfHash = new SpatialHash(surfPos, 3 * unit)
  const skinHash = new SpatialHash(pose.points, 10 * unit)
  const cm = unit
  const outward = (p: THREE.Vector3) => {
    const k = skinHash.nearest(p.x, p.y, p.z)
    return k < 0 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3().fromArray(pose.normals, k * 3)
  }
  const fabricNormal = fabricNormals(relaxed, fabricTris, pose, unit)
  /** Saca un punto por fuera de la tela (a `gap` de ella) y devuelve el punto de tela que tiene detrás. */
  const keepOutside = (p: THREE.Vector3, gap: number) => {
    const k = surfHash.nearest(p.x, p.y, p.z)
    if (k < 0) return -1
    const v = surface[k]
    const q = new THREE.Vector3().fromArray(surfPos, k * 3)
    const n = fabricNormal(v)
    const d = p.clone().sub(q).dot(n)
    if (d < gap) p.addScaledVector(n, gap - d)
    return v
  }

  exits.forEach((exit, side) => {
    const dir = side === 0 ? 1 : -1
    // El ojal va sobre la tela de la capucha, y el cordón sale de su centro
    const eyelet = new THREE.Vector3().fromArray(relaxed, exit * 3)
    const normal0 = fabricNormal(exit)
    eyelet.addScaledVector(normal0, 0.12 * cm)
    const start = eyelet.clone().addScaledVector(normal0, 0.2 * cm)

    // Recorrido del cordón: cae pegado a la tela con una curva suave (no recto como una varilla);
    // los dos cordones no son iguales para que no se vean de copia
    const step = 1 * cm
    const length = (side === 0 ? 33 : 35) * cm
    const path = [start.clone()]
    const ups = [normal0.clone()]
    const anchors = [exit]
    for (let s = step; s <= length; s += step) {
      const t = s / length
      const p = path[path.length - 1].clone()
      p.y -= step
      // Cae casi recto (un cordón de verdad no se abre hacia los lados), con un vaivén muy suave
      p.x += dir * cm * (-0.04 + 0.04 * Math.sin(7 * t + side * 2))
      // Separado de la tela lo bastante para que no se vea incrustado entre dos puntos de la malla
      const a = keepOutside(p, 0.95 * cm)
      // Mantiene el largo de cada tramo tras el empujón
      const prev = path[path.length - 1]
      p.sub(prev).setLength(step).add(prev)
      path.push(p)
      ups.push(a >= 0 ? fabricNormal(a) : outward(p))
      anchors.push(a)
    }

    // Cordón de ~8 mm, algo aplanado (como los tubulares de las sudaderas), con un ligero giro; herrete redondo al final
    const aglet = Math.round((2.8 * cm) / step)
    const cordEnd = path.length - aglet + 1
    tube(out, path.slice(0, cordEnd), ups, anchors, { w: 0.42 * cm, h: 0.3 * cm, twist: 0.2 + side * 0.15 }, cm, 'cordones', skinIndex, skinWeight)
    const tip = path.slice(path.length - aglet)
    tube(out, tip, ups.slice(path.length - aglet), anchors.slice(path.length - aglet), { w: 0.36 * cm, h: 0.36 * cm, twist: 0 }, cm, 'ojales', skinIndex, skinWeight)
    // Ojal metálico alrededor de la salida, apoyado en la tela
    ring(out, eyelet, normal0, 0.55 * cm, 0.14 * cm, exit, skinIndex, skinWeight)
  })
}

/** Normal de la tela en cada punto, orientada hacia fuera del cuerpo (las piezas no tienen todas el mismo giro). */
function fabricNormals(relaxed: Float32Array, tris: number[], pose: PoseData, unit: number) {
  const normals = vertexNormals(relaxed, tris)
  const skinHash = new SpatialHash(pose.points, 10 * unit)
  return (v: number) => {
    const n = new THREE.Vector3().fromArray(normals, v * 3)
    const k = skinHash.nearest(relaxed[v * 3], relaxed[v * 3 + 1], relaxed[v * 3 + 2])
    if (k >= 0 && n.x * pose.normals[k * 3] + n.y * pose.normals[k * 3 + 1] + n.z * pose.normals[k * 3 + 2] < 0) n.negate()
    return n.lengthSq() > 0 ? n.normalize() : new THREE.Vector3(0, 0, 1)
  }
}

/** Alisa una línea de puntos (un borde) a lo largo de sí misma, sin encogerla (Taubin en una dimensión). */
function smoothChain(pos: Float32Array, verts: number[], iterations: number) {
  const tmp = new Float32Array(verts.length * 3)
  const pass = (factor: number) => {
    for (let k = 0; k < verts.length; k++) {
      const v = verts[k] * 3
      if (k === 0 || k === verts.length - 1) {
        tmp.set(pos.subarray(v, v + 3), k * 3)
        continue
      }
      const a = verts[k - 1] * 3
      const b = verts[k + 1] * 3
      for (let c = 0; c < 3; c++) tmp[k * 3 + c] = pos[v + c] + factor * ((pos[a + c] + pos[b + c]) / 2 - pos[v + c])
    }
    verts.forEach((v, k) => pos.set(tmp.subarray(k * 3, k * 3 + 3), v * 3))
  }
  for (let it = 0; it < iterations; it++) {
    pass(0.5)
    pass(-0.53)
  }
}

/** Copia a un punto nuevo los pesos de huesos del punto de tela `anchor`. */
function pushSkin(out: MeshBuffers, anchor: number, skinIndex: Uint16Array, skinWeight: Float32Array) {
  for (let j = 0; j < 4; j++) {
    out.idx.push(anchor >= 0 ? skinIndex[anchor * 4 + j] : 0)
    out.wts.push(anchor >= 0 ? skinWeight[anchor * 4 + j] : j === 0 ? 1 : 0)
  }
}

/**
 * Tubo a lo largo de un recorrido, con las puntas cerradas. La sección es una elipse de semiejes `w` (de lado)
 * y `h` (hacia fuera, según `ups`): con `h` pequeño sale un cordón plano. `twist` gira la sección (vueltas en total).
 */
function tube(
  out: MeshBuffers,
  path: THREE.Vector3[],
  ups: THREE.Vector3[],
  anchors: number[],
  section: { w: number; h: number; twist: number },
  /** Unidades del modelo por cm (las UV van en cm, como el resto de la prenda). */
  cm: number,
  slot: GarmentSlot,
  skinIndex: Uint16Array,
  skinWeight: Float32Array,
) {
  const sides = 12
  const base = out.positions.length / 3
  const tris = out.bySlot[slotIndex(slot)]
  const perimeter = Math.PI * (3 * (section.w + section.h) - Math.sqrt((3 * section.w + section.h) * (section.w + 3 * section.h)))
  let along = 0
  path.forEach((p, i) => {
    const t = (path[Math.min(i + 1, path.length - 1)].clone().sub(path[Math.max(i - 1, 0)])).normalize()
    // La cara plana del cordón mira hacia fuera del pecho, con un giro suave a lo largo
    const up = ups[Math.min(i, ups.length - 1)]
    const nrm0 = up.clone().sub(t.clone().multiplyScalar(up.dot(t))).normalize()
    const bin0 = t.clone().cross(nrm0)
    const turn = Math.sin((i / Math.max(1, path.length - 1)) * Math.PI) * section.twist
    const nrm = nrm0.clone().multiplyScalar(Math.cos(turn)).addScaledVector(bin0, Math.sin(turn))
    const bin = t.clone().cross(nrm)
    if (i > 0) along += p.distanceTo(path[i - 1])
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2
      const q = p.clone().addScaledVector(nrm, Math.cos(a) * section.h).addScaledVector(bin, Math.sin(a) * section.w)
      out.positions.push(q.x, q.y, q.z)
      out.uvs.push(((k / sides) * perimeter) / cm, along / cm)
      out.edges.push(99, 0, EDGE_CODES.ninguno)
      pushSkin(out, anchors[Math.min(i, anchors.length - 1)], skinIndex, skinWeight)
    }
  })
  for (let i = 0; i < path.length - 1; i++) {
    for (let k = 0; k < sides; k++) {
      const a = base + i * sides + k
      const b = base + i * sides + ((k + 1) % sides)
      const c = a + sides
      const d = b + sides
      // Caras hacia fuera del tubo
      tris.push(a, b, c, b, d, c)
    }
  }
  // Tapas en las dos puntas
  for (const [i, flip] of [[0, true], [path.length - 1, false]] as const) {
    const center = out.positions.length / 3
    out.positions.push(path[i].x, path[i].y, path[i].z)
    out.uvs.push(0, 0)
    out.edges.push(99, 0, EDGE_CODES.ninguno)
    pushSkin(out, anchors[Math.min(i, anchors.length - 1)], skinIndex, skinWeight)
    for (let k = 0; k < sides; k++) {
      const a = base + i * sides + k
      const b = base + i * sides + ((k + 1) % sides)
      if (flip) tris.push(center, b, a)
      else tris.push(center, a, b)
    }
  }
}

/** Anillo (ojal) alrededor de un punto, en el plano perpendicular a `axis`. */
function ring(
  out: MeshBuffers,
  center: THREE.Vector3,
  axis: THREE.Vector3,
  radius: number,
  thickness: number,
  anchor: number,
  skinIndex: Uint16Array,
  skinWeight: Float32Array,
) {
  const seg = 16
  const sides = 6
  const base = out.positions.length / 3
  const tris = out.bySlot[slotIndex('ojales')]
  const u = new THREE.Vector3(0, 1, 0).cross(axis).normalize()
  const v = axis.clone().cross(u).normalize()
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2
    const dirR = u.clone().multiplyScalar(Math.cos(a)).addScaledVector(v, Math.sin(a))
    const c = center.clone().addScaledVector(dirR, radius)
    for (let k = 0; k < sides; k++) {
      const b = (k / sides) * Math.PI * 2
      const q = c.clone().addScaledVector(dirR, Math.cos(b) * thickness).addScaledVector(axis, Math.sin(b) * thickness)
      out.positions.push(q.x, q.y, q.z)
      out.uvs.push(0, 0)
      out.edges.push(99, 0, EDGE_CODES.ninguno)
      pushSkin(out, anchor, skinIndex, skinWeight)
    }
  }
  for (let i = 0; i < seg; i++) {
    for (let k = 0; k < sides; k++) {
      const a = base + i * sides + k
      const b = base + i * sides + ((k + 1) % sides)
      const c = base + ((i + 1) % seg) * sides + k
      const d = base + ((i + 1) % seg) * sides + ((k + 1) % sides)
      // Caras hacia fuera del anillo
      tris.push(a, c, b, b, c, d)
    }
  }
}

/**
 * Alisado de Taubin: cada punto se acerca a la media de sus vecinos (λ) y luego se aleja un poco (μ).
 * Elimina los picos y arrugas de un solo punto pero, a diferencia de un alisado normal, no encoge la malla.
 */
function taubinSmooth(pos: Float32Array, adj: number[][], iterations: number, fixed: (v: number) => boolean) {
  const n = pos.length / 3
  const tmp = new Float32Array(pos.length)
  const pass = (factor: number) => {
    for (let i = 0; i < n; i++) {
      const nb = adj[i]
      if (!nb.length || fixed(i)) {
        tmp.set(pos.subarray(i * 3, i * 3 + 3), i * 3)
        continue
      }
      for (let c = 0; c < 3; c++) {
        let m = 0
        for (const j of nb) m += pos[j * 3 + c]
        m /= nb.length
        tmp[i * 3 + c] = pos[i * 3 + c] + factor * (m - pos[i * 3 + c])
      }
    }
    pos.set(tmp)
  }
  for (let it = 0; it < iterations; it++) {
    pass(0.5)
    pass(-0.53)
  }
}

/** Cierra del todo las costuras: los puntos cosidos van a su posición media (sin rendijas entre piezas). */
function weldSeams(pos: Float32Array, seams: [number, number][]) {
  for (let it = 0; it < 4; it++) {
    for (const [a, b] of seams) {
      for (let c = 0; c < 3; c++) {
        const m = (pos[a * 3 + c] + pos[b * 3 + c]) / 2
        pos[a * 3 + c] = m
        pos[b * 3 + c] = m
      }
    }
  }
}

/** Normales por vértice de una malla dada por posiciones e índices. */
function vertexNormals(pos: Float32Array, index: number[]) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setIndex(index)
  g.computeVertexNormals()
  return g.attributes.normal.array as Float32Array
}
