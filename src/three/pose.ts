import * as THREE from 'three'
import type { Model } from './Avatar'
import { boneName } from './body'
import type { Cloud } from './wrap'

/** Zona del cuerpo de cada punto, según el hueso que más lo mueve. */
export const Part = {
  Torso: 0,
  Neck: 1,
  Head: 2,
  ArmL: 3,
  ArmR: 4,
  HandL: 5,
  HandR: 6,
  LegL: 7,
  LegR: 8,
  FootL: 9,
  FootR: 10,
} as const
export type Part = (typeof Part)[keyof typeof Part]

function partOfBone(name: string): Part {
  const n = boneName(name)
  const left = n.startsWith('Left')
  if (n.includes('Hand')) return left ? Part.HandL : Part.HandR
  if (n.includes('Arm')) return left ? Part.ArmL : Part.ArmR
  if (n.includes('Foot') || n.includes('Toe')) return left ? Part.FootL : Part.FootR
  if (n.includes('Leg')) return left ? Part.LegL : Part.LegR
  if (n.startsWith('Head')) return Part.Head
  if (n === 'Neck') return Part.Neck
  return Part.Torso
}

/**
 * Datos de la pose de reposo que se pueden enviar a otro hilo (Web Worker): matrices de los huesos y el cuerpo en esa pose.
 */
export interface PoseData {
  /** Matriz de cada hueso (16 números por hueso), ya multiplicada por su inversa de reposo. */
  boneMatrices: Float32Array
  bindMatrix: number[]
  bindInverse: number[]
  /** Posiciones y normales de la piel en esta pose, y zona del cuerpo de cada punto. */
  points: Float32Array
  normals: Float32Array
  parts: Uint8Array
}

/** Calcula la matriz de piel de un vértice (mezcla de las de sus huesos), en coordenadas de la malla. */
function skinMatrixFn(data: PoseData) {
  const bind = new THREE.Matrix4().fromArray(data.bindMatrix)
  const inverse = new THREE.Matrix4().fromArray(data.bindInverse)
  const m = new THREE.Matrix4()
  const out = new THREE.Matrix4()
  const bm = data.boneMatrices
  return (idx: ArrayLike<number>, wts: ArrayLike<number>, o: number) => {
    m.elements.fill(0)
    for (let j = 0; j < 4; j++) {
      const w = wts[o + j]
      if (w <= 0) continue
      const base = idx[o + j] * 16
      for (let k = 0; k < 16; k++) m.elements[k] += bm[base + k] * w
    }
    return out.multiplyMatrices(inverse, m).multiply(bind)
  }
}

/** Lleva puntos de la postura base a la pose de reposo, con sus pesos de huesos. */
export function skinPoints(data: PoseData, pos: ArrayLike<number>, idx: ArrayLike<number>, wts: ArrayLike<number>) {
  const skin = skinMatrixFn(data)
  const v = new THREE.Vector3()
  const out = new Float32Array(pos.length)
  for (let i = 0; i < pos.length / 3; i++) {
    v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).applyMatrix4(skin(idx, wts, i * 4))
    out[i * 3] = v.x
    out[i * 3 + 1] = v.y
    out[i * 3 + 2] = v.z
  }
  return out
}

/** Lo contrario: pasa puntos de la pose de reposo a la postura base del esqueleto (modifica `pos`). */
export function unskinPoints(data: PoseData, pos: Float32Array, idx: ArrayLike<number>, wts: ArrayLike<number>) {
  const skin = skinMatrixFn(data)
  const v = new THREE.Vector3()
  const inv = new THREE.Matrix4()
  for (let i = 0; i < pos.length / 3; i++) {
    inv.copy(skin(idx, wts, i * 4)).invert()
    v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).applyMatrix4(inv)
    pos[i * 3] = v.x
    pos[i * 3 + 1] = v.y
    pos[i * 3 + 2] = v.z
  }
}

/**
 * Poses del maniquí: giros de algunos huesos sobre la pose de reposo (primer fotograma de la animación), alrededor de
 * los ejes del mundo (así no dependen de cómo esté orientado cada hueso). El maniquí mira hacia +Z; su izquierda es +X.
 * - z: de lado (positivo sube el brazo izquierdo hacia fuera)  · x: adelante y atrás (negativo adelanta la pierna o el brazo)
 * - y: girar sobre sí mismo
 * Se aplican en orden (de la cadera hacia fuera). La ropa se calcula en la pose elegida, así cae como en ella.
 */
export const POSES = [
  { id: 'reposo', label: 'De pie', bones: [] },
  {
    // Brazos separados del cuerpo (como en los programas de patronaje 3D): se ven bien los costados y las mangas
    id: 'brazos',
    label: 'Brazos abiertos',
    bones: [
      ['LeftArm', 'z', 24],
      ['RightArm', 'z', -24],
      ['LeftForeArm', 'z', 6],
      ['RightForeArm', 'z', -6],
    ],
  },
  {
    id: 'paso',
    label: 'Caminando',
    bones: [
      ['LeftUpLeg', 'x', -17],
      ['LeftLeg', 'x', 10],
      ['LeftFoot', 'x', -6],
      ['RightUpLeg', 'x', 12],
      ['RightLeg', 'x', 16],
      ['RightFoot', 'x', 10],
      ['Spine', 'y', 4],
      ['LeftArm', 'x', 14],
      ['RightArm', 'x', -16],
      ['RightForeArm', 'x', -14],
      ['LeftForeArm', 'x', -6],
    ],
  },
  {
    // Contraposto: el peso en la pierna derecha, la izquierda relajada y algo adelantada
    id: 'apoyado',
    label: 'Apoyado en una pierna',
    bones: [
      ['Hips', 'z', 4],
      ['Spine', 'z', -3],
      ['Spine1', 'z', -2],
      ['RightUpLeg', 'z', -4],
      ['LeftUpLeg', 'z', -3],
      ['LeftUpLeg', 'x', -7],
      ['LeftLeg', 'x', 14],
      ['LeftFoot', 'x', -6],
      ['Neck', 'y', 8],
      ['Head', 'z', 3],
      ['LeftArm', 'z', 4],
      ['RightArm', 'z', -6],
      ['RightForeArm', 'x', -10],
    ],
  },
] as const satisfies readonly { id: string; label: string; bones: readonly (readonly [string, 'x' | 'y' | 'z', number])[] }[]
export type PoseId = (typeof POSES)[number]['id']

const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) }

/**
 * Deja el esqueleto en una pose: el primer fotograma de la animación más los giros de la pose. Después baja o sube la
 * cadera para que el pie más bajo siga apoyado en el suelo (al adelantar una pierna, el pie se levanta).
 */
export function setPose(model: Model, id: PoseId | string = 'reposo') {
  for (const track of model.clip?.tracks ?? []) {
    const [nodeName, prop] = track.name.split('.')
    const node = model.root.getObjectByName(nodeName)
    if (!node) continue
    const value = Array.from(track.values.subarray(0, track.getValueSize()))
    if (prop === 'quaternion') node.quaternion.fromArray(value)
    else if (prop === 'position') node.position.fromArray(value)
  }
  model.root.updateMatrixWorld(true)
  const bones = model.body.skeleton.bones
  const bone = (n: string) => bones.find((b) => boneName(b.name) === n)
  const feet = ['LeftToeBase', 'RightToeBase', 'LeftFoot', 'RightFoot'].map(bone).filter((b): b is THREE.Bone => !!b)
  const lowest = () => Math.min(...feet.map((b) => new THREE.Vector3().setFromMatrixPosition(b.matrixWorld).y))
  const floor = lowest()
  const pose = POSES.find((p) => p.id === id) ?? POSES[0]
  const parentQ = new THREE.Quaternion()
  const delta = new THREE.Quaternion()
  for (const [name, axis, deg] of pose.bones) {
    const b = bone(name)
    if (!b?.parent) continue
    // Giro en el mundo pasado al espacio del padre: local' = padre⁻¹ · giro · padre · local
    b.parent.getWorldQuaternion(parentQ)
    delta.setFromAxisAngle(AXES[axis], THREE.MathUtils.degToRad(deg))
    b.quaternion.premultiply(parentQ.clone().invert().multiply(delta).multiply(parentQ))
    b.updateMatrixWorld(true)
  }
  // Pies en el suelo
  const hips = bone('Hips')
  if (hips?.parent && pose.bones.length) {
    const dy = floor - lowest()
    const world = new THREE.Vector3().setFromMatrixPosition(hips.matrixWorld)
    const target = hips.parent.worldToLocal(world.clone().add(new THREE.Vector3(0, dy, 0)))
    hips.position.copy(target)
  }
  model.root.updateMatrixWorld(true)
  model.body.skeleton.update()
}

/**
 * El cuerpo en la pose de reposo de la animación (primer fotograma): la ropa se construye aquí,
 * con los brazos abajo, para que caiga de forma natural. Luego `unskin` la devuelve a la postura en T
 * del esqueleto, que es donde la animación la vuelve a colocar.
 */
export interface ReferencePose extends PoseData {
  /** Posición de una articulación en esta pose (nombre sin prefijo, p. ej. "LeftArm"). */
  joint: (name: string) => THREE.Vector3
  /** Pasa una prenda construida en esta pose (ya con pesos de huesos) a la postura base del esqueleto. */
  unskin: (geom: THREE.BufferGeometry) => void
}

export function referencePose(model: Model, cloud: Cloud, poseId: PoseId | string = 'reposo'): ReferencePose {
  const mesh = model.body
  const skeleton = mesh.skeleton
  const bones = skeleton.bones

  // Ponemos el esqueleto en la pose (guardando la actual) y calculamos las matrices
  const animated = bones.map((node) => ({ node }))
  const saved = animated.map(({ node }) => [node.position.clone(), node.quaternion.clone()] as const)
  setPose(model, poseId)

  const data: PoseData = {
    boneMatrices: new Float32Array(skeleton.boneMatrices!),
    bindMatrix: mesh.bindMatrix.toArray(),
    bindInverse: mesh.bindMatrixInverse.toArray(),
    points: new Float32Array(cloud.pos.length),
    normals: new Float32Array(cloud.pos.length),
    parts: new Uint8Array(cloud.pos.length / 3),
  }
  const bindInverse = new THREE.Matrix4().fromArray(data.bindInverse)
  const jointPos = new Map<string, THREE.Vector3>()
  for (const b of bones) jointPos.set(boneName(b.name), new THREE.Vector3().setFromMatrixPosition(b.matrixWorld).applyMatrix4(bindInverse))

  // Volvemos a dejar el esqueleto como estaba
  animated.forEach(({ node }, i) => {
    node.position.copy(saved[i][0])
    node.quaternion.copy(saved[i][1])
  })
  model.root.updateMatrixWorld(true)
  skeleton.update()

  // Piel en la pose: posiciones, normales y zona del cuerpo de cada punto
  const skin = skinMatrixFn(data)
  const src = cloud.pos
  const srcNormals = mesh.geometry.attributes.normal.array
  const v = new THREE.Vector3()
  const nm = new THREE.Matrix3()
  const boneParts = bones.map((b) => partOfBone(b.name))
  for (let i = 0; i < src.length / 3; i++) {
    const skinM = skin(cloud.skinIndex, cloud.skinWeight, i * 4)
    v.set(srcNormals[i * 3], srcNormals[i * 3 + 1], srcNormals[i * 3 + 2]).applyMatrix3(nm.setFromMatrix4(skinM)).normalize()
    data.normals.set([v.x, v.y, v.z], i * 3)
    v.set(src[i * 3], src[i * 3 + 1], src[i * 3 + 2]).applyMatrix4(skinM)
    data.points.set([v.x, v.y, v.z], i * 3)
    let best = 0
    for (let j = 1; j < 4; j++) if (cloud.skinWeight[i * 4 + j] > cloud.skinWeight[i * 4 + best]) best = j
    data.parts[i] = boneParts[cloud.skinIndex[i * 4 + best]]
  }

  return {
    ...data,
    joint: (name) => jointPos.get(name)!.clone(),
    unskin: (geom) => {
      const pos = geom.attributes.position as THREE.BufferAttribute
      unskinPoints(data, pos.array as Float32Array, geom.attributes.skinIndex.array, geom.attributes.skinWeight.array)
      pos.needsUpdate = true
    },
  }
}
