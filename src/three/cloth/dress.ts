import * as THREE from 'three'
import type { FabricLook } from '../../data/fabrics'
import { GARMENT_SLOTS, slotIndex, type Design, type GarmentSlot, type Measurements } from '../../types'
import type { ModelInfo } from '../body'
import { Part, skinPoints, unskinPoints, type PoseData } from '../pose'
import { CloudGrid } from '../wrap'
import { EDGE_CODES } from './Cloth'
import { buildHoodie, type PocketShape } from './hoodie'
import { buildPants } from './pants'
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
  const garment = pants ?? buildHoodie({ info, points: cloud.pos, unit }, measurements, design)
  const { cloth, follows, slots, pocket, layers, cordExits, rims } = garment

  // La rigidez a la flexión depende de la tela
  for (const l of cloth.links) if (l.k < 0.5) l.k = Math.min(1, l.k * fabric.stiffness)

  lap('patron')
  const { skinIndex, skinWeight } = skinCloth(cloth, cloud, new CloudGrid(cloud.pos), pose.parts, follows)
  lap('pesos')
  cloth.pos = Array.from(skinPoints(pose, cloth.pos, skinIndex, skinWeight))
  const relaxed = isPants
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

/** El pantalón con el mismo formato que la sudadera (sin capucha, bolsillo ni cordones). */
function pantsGarment(body: Parameters<typeof buildPants>[0], m: Measurements, design: Design) {
  const p = buildPants(body, m, design)
  const none: number[] = []
  return {
    ...p,
    pocket: null,
    cordExits: none,
    layers: { hood: none, hoodAll: none, torso: none, sleevesLow: none, torsoLow: none, sleeveCap: none, torsoArmhole: none, bodyOnly: none, collarPins: none },
  }
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
  const skip = new Set([slotIndex('cordones'), slotIndex('ojales')])
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
      const a = keepOutside(p, 0.6 * cm)
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
