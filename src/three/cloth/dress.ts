import * as THREE from 'three'
import type { FabricLook } from '../../data/fabrics'
import { GARMENT_SLOTS, slotIndex, type Design, type GarmentSlot, type Measurements } from '../../types'
import type { ModelInfo } from '../body'
import { skinPoints, unskinPoints, type PoseData } from '../pose'
import { CloudGrid } from '../wrap'
import { buildHoodie, type PocketShape } from './hoodie'
import { relax } from './relax'
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
  const { cloth, follows, slots, pocket } = buildHoodie({ info, points: cloud.pos, unit }, measurements, design)

  // La rigidez a la flexión depende de la tela
  for (const l of cloth.links) if (l.k < 0.5) l.k = Math.min(1, l.k * fabric.stiffness)

  lap('patron')
  const { skinIndex, skinWeight } = skinCloth(cloth, cloud, new CloudGrid(cloud.pos), pose.parts, follows)
  lap('pesos')
  cloth.pos = Array.from(skinPoints(pose, cloth.pos, skinIndex, skinWeight))
  const relaxed = relax(cloth, pose, { seconds: input.seconds ?? 1.2, thickness: 0.9 * unit, gravity: 980 * unit, cell: 2.2 * unit })
  weldSeams(relaxed, cloth.seams)
  lap('asentar')

  // Malla de la prenda (en la pose de reposo)
  const positions = Array.from(relaxed)
  const uvs = [...cloth.flat]
  const idx = Array.from(skinIndex)
  const wts = Array.from(skinWeight)
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
          for (let j = 0; j < 4; j++) {
            idx.push(skinIndex[v * 4 + j])
            wts.push(skinWeight[v * 4 + j])
          }
        }
        pocketTris.push(copy.get(v)!)
      }
    }
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
    skinIndex: skinIdx,
    skinWeight: skinWts,
    index,
    groups,
    pocket: pocket?.shape ?? null,
    timings,
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
