import { useFrame, useLoader } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { Design, Measurements, ShoeStyle } from '../types'
import { boneName, feminize, fitBody, measureModel, morphPositions, smoothNormals, type ModelInfo } from './body'
import { Garment } from './Garment'
import { setPose, type PoseId } from './pose'
import { Headwear } from './Headwear'
import { isRealShoe, RealShoes } from './RealShoes'
import { Shoes } from './Shoes'
import type { Cloud } from './wrap'

/**
 * Maniquí de Mixamo con su animación de reposo "Breathing Idle".
 * Se genera desde el .fbx de Mixamo con `npm run model` (ver scripts/convert-model.mjs).
 */
const MODEL_URL = '/models/maniqui.glb'

/** Acabado blanco mate, como un maniquí de tienda (y como en los programas de patronaje 3D). */
const MATTE = new THREE.MeshStandardMaterial({ color: '#eceae6', roughness: 0.62, metalness: 0 })
/**
 * Con una zapatilla de modelo real puesta, los pies del maniquí no se pintan (como en los programas de patronaje 3D:
 * el pie va dentro del zapato). Se esconde lo que mueven los huesos del pie y los dedos, así vale en cualquier pose.
 */
const FEET = { hide: { value: 0 }, bones: { value: new THREE.Vector4(-1, -1, -1, -1) } }
MATTE.onBeforeCompile = (shader) => {
  shader.uniforms.uHideFeet = FEET.hide
  shader.uniforms.uFootBones = FEET.bones
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nuniform vec4 uFootBones;\nvarying float vFoot;')
    .replace(
      '#include <skinning_vertex>',
      `#include <skinning_vertex>
      vFoot = 0.0;
      for (int k = 0; k < 4; k++) {
        float b = skinIndex[k];
        if (b == uFootBones.x || b == uFootBones.y || b == uFootBones.z || b == uFootBones.w) vFoot += skinWeight[k];
      }`,
    )
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float uHideFeet;\nvarying float vFoot;')
    .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (uHideFeet > 0.5 && vFoot > 0.5) discard;')
}
MATTE.customProgramCacheKey = () => 'maniqui'

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
  // Huesos de los pies (para esconderlos dentro de la zapatilla de modelo real)
  const footIdx = ['LeftFoot', 'LeftToeBase', 'RightFoot', 'RightToeBase'].map((n) => body.skeleton.bones.findIndex((b) => boneName(b.name) === n))
  FEET.bones.value.set(footIdx[0], footIdx[1], footIdx[2], footIdx[3])
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
  /** Pose del maniquí (ver POSES); la ropa cae como en ella. */
  pose?: PoseId
  /** Color de la zapatilla de modelo real que se puede teñir (sin él, el suyo). */
  shoeColor?: string
}

/** Maniquí animado, ajustado a las medidas, con la prenda puesta. */
export function Mannequin({ measurements, design, outfit = [], animate, showBody = true, shoes, hat, pose = 'reposo', shoeColor }: Props) {
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
    // Quieto: en la pose elegida (la animación solo se usa si se pide)
    if (!animate) setPose(model, pose)
    return () => {
      action.stop()
    }
  }, [mixer, model, pose, animate])
  useFrame((_, dt) => {
    if (animate) mixer.update(Math.min(dt, 0.1))
  })

  return (
    <group scale={fit.scale}>
      <primitive object={model.root} />
      {outfit.map((d, i) => (
        <Garment key={d.layer ?? i} model={model} fit={fit} cloud={cloud} measurements={measurements} design={d} pose={pose} shoes={showBody ? shoes : null} />
      ))}
      {/* Un gorro o una gorra va en la cabeza; el resto, en el cuerpo */}
      {design.hat ? (
        <Headwear model={model} cloud={cloud} design={design} height={measurements.height} />
      ) : (
        <Garment model={model} fit={fit} cloud={cloud} measurements={measurements} design={design} pose={pose} shoes={showBody ? shoes : null} />
      )}
      {hat?.hat && <Headwear model={model} cloud={cloud} design={hat} height={measurements.height} />}
      <HideFeet on={!!showBody && isRealShoe(shoes)} />
      {shoes && showBody && (isRealShoe(shoes) ? <RealShoes model={model} cloud={cloud} shoe={shoes} color={shoeColor} /> : <Shoes model={model} cloud={cloud} style={shoes} />)}
    </group>
  )
}

/** Esconde los pies del maniquí mientras lleva la zapatilla de modelo real. */
function HideFeet({ on }: { on: boolean }) {
  useLayoutEffect(() => {
    FEET.hide.value = on ? 1 : 0
    return () => {
      FEET.hide.value = 0
    }
  }, [on])
  return null
}
