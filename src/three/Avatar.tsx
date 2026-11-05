import { useFrame, useLoader } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { Design, Measurements } from '../types'
import { fitBody, measureModel, morphPositions, type ModelInfo } from './body'
import { Garment } from './Garment'
import type { Cloud } from './wrap'

/**
 * Maniquí de Mixamo con su animación de reposo "Breathing Idle".
 * Se genera desde el .fbx de Mixamo con `npm run model` (ver scripts/convert-model.mjs).
 */
const MODEL_URL = '/models/maniqui.glb'

/** Acabado gris mate, como un maniquí de tienda. */
const MATTE = new THREE.MeshStandardMaterial({ color: '#8f8f8f', roughness: 0.85, metalness: 0 })

export interface Model {
  root: THREE.Group
  /** Malla del cuerpo; su esqueleto es el que mueve la animación y el que usa la ropa. */
  body: THREE.SkinnedMesh
  clip: THREE.AnimationClip | undefined
  info: ModelInfo
  /** Posiciones originales (postura en T) para poder deformar el cuerpo según las medidas. */
  bindPositions: Float32Array
}

function prepare(root: THREE.Group, animations: THREE.AnimationClip[]): Model {
  const body = root.getObjectByProperty('isSkinnedMesh', true) as THREE.SkinnedMesh
  body.material = MATTE
  body.castShadow = true
  body.receiveShadow = true
  body.frustumCulled = false
  const bindPositions = new Float32Array(body.geometry.attributes.position.array)
  return {
    root,
    body,
    clip: animations.find((a) => a.tracks.length > 0),
    info: measureModel(bindPositions, body.skeleton),
    bindPositions,
  }
}

interface Props {
  measurements: Measurements
  design: Design
  /** Otras prendas que lleva a la vez (p. ej. el pantalón bajo la sudadera). */
  outfit?: Design[]
  animate: boolean
}

/** Maniquí animado, ajustado a las medidas, con la prenda puesta. */
export function Mannequin({ measurements, design, outfit = [], animate }: Props) {
  const gltf = useLoader(GLTFLoader, MODEL_URL)
  const model = useMemo(() => prepare(gltf.scene, gltf.animations), [gltf])
  const fit = useMemo(() => fitBody(model.info, measurements), [model, measurements])

  // Forma del cuerpo según las medidas; la ropa se construye sobre ella
  const cloud = useMemo<Cloud>(() => {
    const pos = new Float32Array(model.bindPositions.length)
    morphPositions(model.bindPositions, pos, model.info, fit)
    const attrs = model.body.geometry.attributes
    return {
      pos,
      skinIndex: attrs.skinIndex.array as Uint16Array,
      skinWeight: attrs.skinWeight.array as Float32Array,
    }
  }, [model, fit])

  useLayoutEffect(() => {
    const attr = model.body.geometry.attributes.position as THREE.BufferAttribute
    ;(attr.array as Float32Array).set(cloud.pos)
    attr.needsUpdate = true
  }, [model, cloud])

  // Animación de reposo en bucle
  const mixer = useMemo(() => new THREE.AnimationMixer(model.root), [model])
  useEffect(() => {
    if (!model.clip) return
    const action = mixer.clipAction(model.clip)
    action.play()
    mixer.update(0)
    return () => {
      action.stop()
    }
  }, [mixer, model])
  useFrame((_, dt) => {
    if (animate) mixer.update(Math.min(dt, 0.1))
  })

  return (
    <group scale={fit.scale}>
      <primitive object={model.root} />
      {outfit.map((d, i) => (
        <Garment key={i} model={model} fit={fit} cloud={cloud} measurements={measurements} design={d} />
      ))}
      <Garment model={model} fit={fit} cloud={cloud} measurements={measurements} design={design} />
    </group>
  )
}
