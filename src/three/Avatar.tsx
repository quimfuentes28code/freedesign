import { useFrame, useLoader } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { Design, Measurements, ShoeStyle } from '../types'
import { feminize, fitBody, measureModel, morphPositions, smoothNormals, type ModelInfo } from './body'
import { Garment } from './Garment'
import { Headwear } from './Headwear'
import { Shoes } from './Shoes'
import type { Cloud } from './wrap'

/**
 * Maniquí de Mixamo con su animación de reposo "Breathing Idle".
 * Se genera desde el .fbx de Mixamo con `npm run model` (ver scripts/convert-model.mjs).
 */
const MODEL_URL = '/models/maniqui.glb'

/** Acabado blanco mate, como un maniquí de tienda (y como en los programas de patronaje 3D). */
const MATTE = new THREE.MeshStandardMaterial({ color: '#eceae6', roughness: 0.62, metalness: 0 })

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
  /** Ver el maniquí (en el Probador) o solo la ropa (en el editor del Diseñador). */
  showBody?: boolean
  /** Calzado (solo con el maniquí a la vista). */
  shoes?: ShoeStyle | null
  /** Gorro o gorra que lleva además de la ropa. */
  hat?: Design | null
}

/** Maniquí animado, ajustado a las medidas, con la prenda puesta. */
export function Mannequin({ measurements, design, outfit = [], animate, showBody = true, shoes, hat }: Props) {
  const gltf = useLoader(GLTFLoader, MODEL_URL)
  const base = useMemo(() => prepare(gltf.scene, gltf.animations), [gltf])
  const female = !!measurements.female
  // Cuerpo de mujer: la malla de partida se deforma (pecho, cintura, cadera, hombros) y se vuelve a medir
  const cup = female ? Math.max(4, measurements.chest - (measurements.underbust ?? measurements.chest - 16)) : 0
  const model = useMemo<Model>(() => {
    if (!female) return base
    const shaped = feminize(base.bindPositions, base.info, 16, base.body.geometry.index?.array)
    return { ...base, bindPositions: shaped, info: measureModel(shaped, base.body.skeleton) }
  }, [base, female])
  // El volumen del pecho de la clienta (busto − bajo pecho) se aplica sobre esa malla medida
  const shapedPositions = useMemo(() => (female && Math.abs(cup - 16) > 0.5 ? feminize(base.bindPositions, base.info, cup, base.body.geometry.index?.array) : model.bindPositions), [female, cup, base, model])
  const fit = useMemo(() => fitBody(model.info, measurements), [model, measurements])

  // Forma del cuerpo según las medidas; la ropa se construye sobre ella
  const cloud = useMemo<Cloud>(() => {
    const pos = new Float32Array(shapedPositions.length)
    morphPositions(shapedPositions, pos, model.info, fit)
    const attrs = model.body.geometry.attributes
    return {
      pos,
      skinIndex: attrs.skinIndex.array as Uint16Array,
      skinWeight: attrs.skinWeight.array as Float32Array,
    }
  }, [model, fit, shapedPositions])

  useLayoutEffect(() => {
    const attr = model.body.geometry.attributes.position as THREE.BufferAttribute
    ;(attr.array as Float32Array).set(cloud.pos)
    attr.needsUpdate = true
    // La luz tiene que seguir la forma nueva (pecho, cadera…)
    smoothNormals(model.body.geometry)
  }, [model, cloud])

  // Sin maniquí, la ropa se sigue construyendo sobre su cuerpo, pero el cuerpo no se pinta. Se oculta su material
  // (no la malla): una malla oculta deja de mover su esqueleto, y la ropa lo necesita
  useLayoutEffect(() => {
    const list = Array.isArray(model.body.material) ? model.body.material : [model.body.material]
    for (const m of list) m.visible = showBody
    model.body.castShadow = showBody
  }, [model, showBody])

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
        <Garment key={d.layer ?? i} model={model} fit={fit} cloud={cloud} measurements={measurements} design={d} />
      ))}
      {/* Un gorro o una gorra va en la cabeza; el resto, en el cuerpo */}
      {design.hat ? (
        <Headwear model={model} cloud={cloud} design={design} height={measurements.height} />
      ) : (
        <Garment model={model} fit={fit} cloud={cloud} measurements={measurements} design={design} />
      )}
      {hat?.hat && <Headwear model={model} cloud={cloud} design={hat} height={measurements.height} />}
      {shoes && showBody && <Shoes model={model} cloud={cloud} style={shoes} />}
    </group>
  )
}
