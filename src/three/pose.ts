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
 * El cuerpo en la pose de reposo de la animación (primer fotograma): la ropa se construye aquí,
 * con los brazos abajo, para que caiga de forma natural. Luego `unskin` la devuelve a la postura en T
 * del esqueleto, que es donde la animación la vuelve a colocar.
 */
export interface ReferencePose {
  /** Posiciones de la nube del cuerpo en esta pose. */
  points: Float32Array
  /** Zona del cuerpo de cada punto. */
  parts: Uint8Array
  /** Posición de una articulación en esta pose (nombre sin prefijo, p. ej. "LeftArm"). */
  joint: (name: string) => THREE.Vector3
  /** Pasa una prenda construida en esta pose (ya con pesos de huesos) a la postura base del esqueleto. */
  unskin: (geom: THREE.BufferGeometry) => void
}

export function referencePose(model: Model, cloud: Cloud): ReferencePose {
  const mesh = model.body
  const skeleton = mesh.skeleton
  const bones = skeleton.bones

  // Aplicamos el primer fotograma de la animación (guardando la pose actual) y calculamos las matrices.
  // Buscamos cada nodo por nombre igual que hace el AnimationMixer.
  const animated = (model.clip?.tracks ?? [])
    .map((track) => {
      const [nodeName, prop] = track.name.split('.')
      return { node: model.root.getObjectByName(nodeName), prop, value: Array.from(track.values.subarray(0, track.getValueSize())) }
    })
    .filter((a): a is { node: THREE.Object3D; prop: string; value: number[] } => !!a.node)
  const saved = animated.map(({ node }) => [node.position.clone(), node.quaternion.clone()] as const)
  for (const { node, prop, value } of animated) {
    if (prop === 'quaternion') node.quaternion.fromArray(value)
    else if (prop === 'position') node.position.fromArray(value)
  }
  model.root.updateMatrixWorld(true)
  skeleton.update()

  const boneMatrices = bones.map((_, i) => new THREE.Matrix4().fromArray(skeleton.boneMatrices!, i * 16))
  const bindMatrix = mesh.bindMatrix.clone()
  const bindInverse = mesh.bindMatrixInverse.clone()
  const jointPos = new Map<string, THREE.Vector3>()
  for (const b of bones) jointPos.set(boneName(b.name), new THREE.Vector3().setFromMatrixPosition(b.matrixWorld).applyMatrix4(bindInverse))

  // Volvemos a dejar el esqueleto como estaba
  animated.forEach(({ node }, i) => {
    node.position.copy(saved[i][0])
    node.quaternion.copy(saved[i][1])
  })
  model.root.updateMatrixWorld(true)
  skeleton.update()

  /** Matriz de piel de un vértice: mezcla de las matrices de sus huesos, en coordenadas de la malla. */
  const m = new THREE.Matrix4()
  const tmp = new THREE.Matrix4()
  const blended = (idx: ArrayLike<number>, wts: ArrayLike<number>, o: number) => {
    m.elements.fill(0)
    for (let j = 0; j < 4; j++) {
      const w = wts[o + j]
      if (w <= 0) continue
      const e = boneMatrices[idx[o + j]].elements
      for (let k = 0; k < 16; k++) m.elements[k] += e[k] * w
    }
    return tmp.multiplyMatrices(bindInverse, m).multiply(bindMatrix)
  }

  const src = cloud.pos
  const points = new Float32Array(src.length)
  const parts = new Uint8Array(src.length / 3)
  const v = new THREE.Vector3()
  const boneParts = bones.map((b) => partOfBone(b.name))
  for (let i = 0; i < src.length / 3; i++) {
    v.set(src[i * 3], src[i * 3 + 1], src[i * 3 + 2]).applyMatrix4(blended(cloud.skinIndex, cloud.skinWeight, i * 4))
    points[i * 3] = v.x
    points[i * 3 + 1] = v.y
    points[i * 3 + 2] = v.z
    // Zona: la del hueso con más peso
    let best = 0
    for (let j = 1; j < 4; j++) if (cloud.skinWeight[i * 4 + j] > cloud.skinWeight[i * 4 + best]) best = j
    parts[i] = boneParts[cloud.skinIndex[i * 4 + best]]
  }

  return {
    points,
    parts,
    joint: (name) => jointPos.get(name)!.clone(),
    unskin: (geom) => {
      const pos = geom.attributes.position as THREE.BufferAttribute
      const idx = geom.attributes.skinIndex.array
      const wts = geom.attributes.skinWeight.array
      const inv = new THREE.Matrix4()
      for (let i = 0; i < pos.count; i++) {
        inv.copy(blended(idx, wts, i * 4)).invert()
        v.fromBufferAttribute(pos, i).applyMatrix4(inv)
        pos.setXYZ(i, v.x, v.y, v.z)
      }
      pos.needsUpdate = true
    },
  }
}
