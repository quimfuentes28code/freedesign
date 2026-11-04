import * as THREE from 'three'
import type { FabricLook } from '../../data/fabrics'
import { GARMENT_SLOTS, slotIndex, type Design, type GarmentSlot, type Measurements } from '../../types'
import type { ModelInfo } from '../body'
import { skinPoints, unskinPoints, type PoseData } from '../pose'
import { CloudGrid } from '../wrap'
import { EDGE_CODES } from './Cloth'
import { buildHoodie, type PocketShape } from './hoodie'
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
  const { cloth, follows, slots, pocket, layers, cordExits } = buildHoodie({ info, points: cloud.pos, unit }, measurements, design)

  // La rigidez a la flexión depende de la tela
  for (const l of cloth.links) if (l.k < 0.5) l.k = Math.min(1, l.k * fabric.stiffness)

  lap('patron')
  const { skinIndex, skinWeight } = skinCloth(cloth, cloud, new CloudGrid(cloud.pos), pose.parts, follows)
  lap('pesos')
  cloth.pos = Array.from(skinPoints(pose, cloth.pos, skinIndex, skinWeight))
  const relaxed = relax(cloth, pose, {
    seconds: input.seconds ?? 1.2,
    thickness: 0.9 * unit,
    gravity: 980 * unit,
    cell: 2.2 * unit,
    // La tela no se atraviesa a sí misma: la capucha queda encima de la espalda y las mangas no se meten en el cuerpo
    layers: [
      { mode: 'outside', outer: layers.hood, inner: layers.torso, gap: 0.9 * unit },
      { mode: 'apart', outer: layers.sleevesLow, inner: layers.torsoLow, gap: 2 * unit },
    ],
  })
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
    addCords({ positions, uvs, edges, idx, wts, bySlot }, relaxed, layers.torso, cordExits, skinIndex, skinWeight, pose, unit)
  }

  // Todas las caras de la tela miran hacia fuera del cuerpo (así la luz y el interior oscuro de la prenda salen bien)
  // (los puntos copiados del bolsillo van todos en un grupo propio)
  const baseCount = cloth.panelOf.length
  orientOutwards(bySlot, new Float32Array(positions), pose, unit, (v) => (v < baseCount ? cloth.panelOf[v] : -1))

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
  }
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
 * Cordones de la capucha: salen de un ojal a cada lado del cuello y cuelgan sobre el pecho, por fuera de la tela,
 * con su herrete al final. Se mueven con el delantero (toman los pesos de los huesos de la tela que tienen detrás).
 */
function addCords(
  out: MeshBuffers,
  relaxed: Float32Array,
  torso: number[],
  exits: number[],
  skinIndex: Uint16Array,
  skinWeight: Float32Array,
  pose: PoseData,
  unit: number,
) {
  const torsoPos = new Float32Array(torso.length * 3)
  torso.forEach((v, k) => torsoPos.set(relaxed.subarray(v * 3, v * 3 + 3), k * 3))
  const torsoHash = new SpatialHash(torsoPos, 3 * unit)
  const skinHash = new SpatialHash(pose.points, 8 * unit)
  const cm = unit
  const outward = (p: THREE.Vector3) => {
    const k = skinHash.nearest(p.x, p.y, p.z)
    return k < 0 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3().fromArray(pose.normals, k * 3)
  }
  /** Saca un punto por fuera de la tela del cuerpo (a `gap` de ella) y devuelve el punto de tela que tiene detrás. */
  const keepOutside = (p: THREE.Vector3, gap: number) => {
    const k = torsoHash.nearest(p.x, p.y, p.z)
    if (k < 0) return -1
    const q = new THREE.Vector3().fromArray(torsoPos, k * 3)
    const n = outward(q)
    const d = p.clone().sub(q).dot(n)
    if (d < gap) p.addScaledVector(n, gap - d)
    return torso[k]
  }

  exits.forEach((exit, side) => {
    const dir = side === 0 ? 1 : -1
    const start = new THREE.Vector3().fromArray(relaxed, exit * 3)
    start.x += dir * 3.2 * cm
    start.y -= 1 * cm
    keepOutside(start, 0.5 * cm)
    const normal0 = outward(start)

    // Recorrido del cordón: cae hacia abajo pegado al pecho
    const step = 1.5 * cm
    const length = 32 * cm
    const path = [start.clone()]
    const anchors = [keepOutside(start.clone(), 0.5 * cm)]
    for (let s = step; s <= length; s += step) {
      const p = path[path.length - 1].clone()
      p.y -= step
      p.x += dir * 0.05 * cm // se abren muy poco hacia los lados
      const a = keepOutside(p, 0.45 * cm)
      // Mantiene el largo de cada tramo tras el empujón
      const prev = path[path.length - 1]
      p.sub(prev).setLength(step).add(prev)
      path.push(p)
      anchors.push(a)
    }

    // Tubo del cordón (y el herrete, más grueso, al final)
    const aglet = Math.round((3 * cm) / step)
    tube(out, path.slice(0, path.length - aglet + 1), anchors, 0.32 * cm, cm, 'cordones', skinIndex, skinWeight)
    tube(out, path.slice(path.length - aglet), anchors.slice(path.length - aglet), 0.42 * cm, cm, 'ojales', skinIndex, skinWeight)
    // Ojal metálico alrededor de la salida
    ring(out, start, normal0, 0.6 * cm, 0.16 * cm, anchors[0], skinIndex, skinWeight)
  })
}

/** Copia a un punto nuevo los pesos de huesos del punto de tela `anchor`. */
function pushSkin(out: MeshBuffers, anchor: number, skinIndex: Uint16Array, skinWeight: Float32Array) {
  for (let j = 0; j < 4; j++) {
    out.idx.push(anchor >= 0 ? skinIndex[anchor * 4 + j] : 0)
    out.wts.push(anchor >= 0 ? skinWeight[anchor * 4 + j] : j === 0 ? 1 : 0)
  }
}

/** Tubo redondo a lo largo de un recorrido, con las puntas cerradas. */
function tube(
  out: MeshBuffers,
  path: THREE.Vector3[],
  anchors: number[],
  radius: number,
  /** Unidades del modelo por cm (las UV van en cm, como el resto de la prenda). */
  cm: number,
  slot: GarmentSlot,
  skinIndex: Uint16Array,
  skinWeight: Float32Array,
) {
  const sides = 10
  const base = out.positions.length / 3
  const tris = out.bySlot[slotIndex(slot)]
  const ref = new THREE.Vector3(0, 0, 1)
  let along = 0
  path.forEach((p, i) => {
    const t = (path[Math.min(i + 1, path.length - 1)].clone().sub(path[Math.max(i - 1, 0)])).normalize()
    const nrm = ref.clone().sub(t.clone().multiplyScalar(ref.dot(t))).normalize()
    const bin = t.clone().cross(nrm)
    if (i > 0) along += p.distanceTo(path[i - 1])
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2
      const q = p.clone().addScaledVector(nrm, Math.cos(a) * radius).addScaledVector(bin, Math.sin(a) * radius)
      out.positions.push(q.x, q.y, q.z)
      out.uvs.push(((k / sides) * Math.PI * 2 * radius) / cm, along / cm)
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
      tris.push(a, c, b, b, c, d)
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
      tris.push(a, b, c, b, d, c)
    }
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
