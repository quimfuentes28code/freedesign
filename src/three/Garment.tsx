import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { FABRICS, type FabricLook } from '../data/fabrics'
import { GARMENT_SLOTS, RIB_SLOTS, slotIndex, type Design, type GarmentSlot, type Measurements, type SlotStyle } from '../types'
import type { Model } from './Avatar'
import { FIT_EASE, jointPosition, type BodyFit } from './body'
import { dressInWorker } from './cloth/dressClient'
import { knitNormalMap } from './cloth/textures'
import { Part, referencePose, type ReferencePose } from './pose'
import { CloudGrid, computeTubeNormals, skinFromCloud, wrapTube, type Cloud, type TubeSpec } from './wrap'

/** Color y material de cada zona: el que venga del Diseñador o, si no, la tela y el color de la prenda (canalé en puños, bajo y cuello). */
export function slotStyle(design: Design, slot: GarmentSlot): SlotStyle {
  const own = design.pieces?.[slot]
  if (own) return own
  const fabric = FABRICS[design.fabric]
  const body = design.pieces?.cuerpo ?? { color: design.color, look: fabric }
  return RIB_SLOTS.includes(slot) ? { color: body.color, look: { ...body.look, knit: 'canale', knitDepth: 0.9 } } : body
}

/**
 * Recorta el material del bolsillo canguro a su forma exacta (un trapecio en las UV del delantero, en cm),
 * así su borde sale recto aunque la malla sea de triángulos. La forma se pone en `userData.pocket` al tener la prenda.
 */
function clipToPocket(m: THREE.MeshPhysicalMaterial) {
  const uniforms = { uPocket: { value: new THREE.Vector4(0, 0, 0, 0) } }
  m.userData.pocket = uniforms.uPocket
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vPocketUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvPocketUv = uv;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vPocketUv;\nuniform vec4 uPocket;')
      .replace(
        'void main() {',
        `void main() {
          float pt = (vPocketUv.y - uPocket.x) / max(uPocket.y, 0.001);
          if (pt < 0.0 || pt > 1.0 || abs(vPocketUv.x) > mix(uPocket.z, uPocket.w, pt)) discard;`,
      )
  }
  m.customProgramCacheKey = () => 'bolsillo'
}

/** Un material de Three.js por zona (en el orden de GARMENT_SLOTS), que solo se rehace si cambia algún color o tela. */
function useSlotMaterials(design: Design) {
  const styles = GARMENT_SLOTS.map((s) => slotStyle(design, s))
  const key = JSON.stringify(styles)
  const materials = useMemo(
    () =>
      styles.map(({ color, look }, i) => {
        const m = new THREE.MeshPhysicalMaterial({
          color,
          roughness: look.roughness,
          metalness: look.metalness ?? 0,
          sheen: look.sheen,
          sheenRoughness: look.sheenRoughness,
          sheenColor: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.25),
          clearcoat: look.clearcoat,
          clearcoatRoughness: 0.3,
          normalMap: look.knitDepth > 0 ? knitNormalMap(look.knit) : null,
          normalScale: new THREE.Vector2(look.knitDepth, look.knitDepth),
          side: THREE.DoubleSide,
        })
        const slot = GARMENT_SLOTS[i]
        // En la sisa la manga y el cuerpo se tocan: el cuerpo se dibuja por delante para que no asomen trocitos de manga
        if (slot === 'cuerpo') {
          m.polygonOffset = true
          m.polygonOffsetFactor = -1
          m.polygonOffsetUnits = -2
        }
        if (slot === 'bolsillo') {
          // El bolsillo va cosido encima del delantero: siempre por delante de él
          m.polygonOffset = true
          m.polygonOffsetFactor = -2
          m.polygonOffsetUnits = -6
          clipToPocket(m)
        }
        return m
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  )
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials])
  return materials
}

interface Props {
  model: Model
  fit: BodyFit
  /** Cuerpo ya ajustado a las medidas (postura en T, unidades del modelo). */
  cloud: Cloud
  measurements: Measurements
  design: Design
}

/** Prendas que se construyen con patrón de costura (piezas cosidas y asentadas sobre el cuerpo). */
const PATTERN_GARMENTS = new Set<Design['garment']>(['sudadera'])

/**
 * Prenda puesta sobre el maniquí. Usa el mismo esqueleto que el maniquí, así se mueve con la animación.
 * - Sudadera: patrón de costura real (ver cloth/).
 * - Resto: tubos de tela que envuelven torso, mangas y perneras (versión sencilla, pendiente de pasar a patrón).
 */
export function Garment({ model, fit, cloud, measurements, design }: Props) {
  const materials = useSlotMaterials(design)
  // La caída depende solo de la tela del cuerpo: cambiar otros materiales o colores no recalcula la prenda
  const bodyLook = slotStyle(design, 'cuerpo').look
  const fabric = useMemo<FabricLook>(
    () => bodyLook,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bodyLook.stiffness, bodyLook.sheenRoughness],
  )
  const pose = useMemo(() => referencePose(model, cloud), [model, cloud])
  const pattern = PATTERN_GARMENTS.has(design.garment)

  // Prendas de patrón: se calculan en segundo plano y se muestran al terminar (la anterior sigue visible mientras)
  const [patternGeom, setPatternGeom] = useState<THREE.BufferGeometry | null>(null)
  useEffect(() => {
    if (!pattern) return
    let alive = true
    dressInWorker({
      info: model.info,
      cloud,
      pose: {
        boneMatrices: pose.boneMatrices,
        bindMatrix: pose.bindMatrix,
        bindInverse: pose.bindInverse,
        points: pose.points,
        normals: pose.normals,
        parts: pose.parts,
      },
      scale: fit.scale,
      measurements,
      // Al worker solo le hace falta la forma de la prenda (los colores y materiales se aplican aquí)
      design: { ...design, pieces: undefined },
      fabric,
    })
      .then((g) => {
        if (!alive || !g) return
        setPatternGeom((prev) => {
          prev?.dispose()
          return g
        })
      })
      .catch((err) => console.error('No se ha podido calcular la prenda', err))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, cloud, pose, fit, measurements, pattern, design.garment, design.fit, design.hood, design.pocket, design.bodyLength, design.sleeveLength, fabric])
  useEffect(() => () => patternGeom?.dispose(), [patternGeom])

  // Resto de prendas: tubos que envuelven el cuerpo (cálculo rápido, al momento)
  const wrapGeoms = useMemo(() => {
    if (pattern) return []
    const grid = new CloudGrid(pose.points)
    return buildGarment(model, cloud, pose, grid, fit, design, fabric)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, cloud, pose, fit, pattern, design.garment, design.fit, fabric])
  useEffect(() => () => wrapGeoms.forEach(({ g }) => g.dispose()), [wrapGeoms])

  useEffect(() => {
    const geometries = pattern ? (patternGeom ? [{ g: patternGeom, slot: null }] : []) : wrapGeoms
    // Forma del bolsillo de esta prenda, para recortar su material
    const shape = patternGeom?.userData.pocket as { y0: number; h: number; w0: number; w1: number } | null | undefined
    const pocketUniform = materials[slotIndex('bolsillo')].userData.pocket as { value: THREE.Vector4 } | undefined
    if (shape && pocketUniform) pocketUniform.value.set(shape.y0, shape.h, shape.w0, shape.w1)
    const meshes = geometries.map(({ g, slot }) => {
      const mesh = new THREE.SkinnedMesh(g, slot ? materials[slotIndex(slot)] : materials)
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.frustumCulled = false
      mesh.bind(model.body.skeleton, model.body.bindMatrix)
      model.root.add(mesh)
      return mesh
    })
    return () => meshes.forEach((m) => model.root.remove(m))
  }, [patternGeom, wrapGeoms, materials, model, pattern])

  return null
}


/** Unidades del modelo (cm del modelo original) para una distancia real en metros. */
const toModel = (meters: number, fit: BodyFit) => meters / fit.scale

const UP = new THREE.Vector3(0, 1, 0)
const FRONT = new THREE.Vector3(0, 0, 1)

/** Dirección perpendicular a `axis` lo más parecida posible a `hint`. */
function perpendicular(axis: THREE.Vector3, hint: THREE.Vector3) {
  return hint.clone().addScaledVector(axis, -hint.dot(axis)).normalize()
}

/**
 * Construye las piezas de la prenda sobre el cuerpo en su pose de reposo (brazos abajo),
 * les da los pesos de los huesos del cuerpo que tienen debajo y las pasa a la postura base del esqueleto.
 */
function buildGarment(
  model: Model,
  cloud: Cloud,
  pose: ReferencePose,
  grid: CloudGrid,
  fit: BodyFit,
  design: Design,
  fabric: FabricLook,
): { g: THREE.BufferGeometry; slot: GarmentSlot }[] {
  const I = model.info
  const easeM = FIT_EASE[design.fit]
  // Separación de la tela respecto al cuerpo (con un mínimo para que nunca quede por dentro)
  const ease = toModel(easeM, fit) + 0.4
  const tile = toModel(0.03, fit)
  const loose = toModel(easeM, fit) * (0.4 + fabric.sheenRoughness * 0.6)
  const parts = pose.parts

  // Alturas de referencia en la pose (el cuerpo baja un poco al relajarse)
  const hips = pose.joint('Hips')
  const dy = hips.y - jointPosition(model.body.skeleton, 'Hips').y
  const crotchY = I.crotchY + dy
  const hipsY = I.hipsY + dy
  const waistY = I.waistY + dy
  const kneeY = I.kneeY + dy
  const ankleY = I.ankleY + dy
  const neckTop = pose.joint('Neck').y + 2.5

  const isBody = (i: number) => parts[i] === Part.Torso || parts[i] === Part.Neck
  const isLegs = (i: number) => parts[i] === Part.LegL || parts[i] === Part.LegR

  const torso = (from: number, to: number, extra?: Pick<TubeSpec, 'flare' | 'folds'>) =>
    wrapTube(
      pose.points,
      {
        origin: new THREE.Vector3(hips.x, 0, hips.z),
        axis: UP,
        ref: new THREE.Vector3(1, 0, 0),
        from,
        to,
        ease,
        accept: (i) => isBody(i) || isLegs(i),
        ...extra,
      },
      tile,
    )

  const sleeve = (side: 1 | -1, coverage: number) => {
    const name = side > 0 ? 'Left' : 'Right'
    const sh = pose.joint(`${name}Arm`)
    const axis = pose.joint(`${name}Hand`).sub(sh)
    const length = axis.length()
    axis.normalize()
    const part = side > 0 ? Part.ArmL : Part.ArmR
    return wrapTube(
      pose.points,
      {
        origin: sh,
        axis,
        ref: perpendicular(axis, FRONT),
        from: -3,
        to: length * coverage,
        ease: ease * 0.85,
        flare: (t) => loose * 0.3 * t * t,
        folds: coverage > 0.6 ? { count: 6, amp: loose * 0.12, t0: 0.5, t1: 1 } : undefined,
        accept: (i, r) => parts[i] === part && r < 12,
      },
      tile,
    )
  }

  const leg = (side: 1 | -1) => {
    const name = side > 0 ? 'Left' : 'Right'
    const hip = pose.joint(`${name}UpLeg`)
    const axis = pose.joint(`${name}Foot`).sub(hip).normalize()
    const along = (y: number) => (y - hip.y) / axis.y
    const part = side > 0 ? Part.LegL : Part.LegR
    return wrapTube(
      pose.points,
      {
        origin: hip,
        axis,
        ref: perpendicular(axis, FRONT),
        from: along(crotchY + 1),
        to: along(ankleY + 3),
        ease,
        flare: (t) => loose * 0.35 * t * t,
        folds: { count: 7, amp: loose * 0.1, t0: 0.6, t1: 1 },
        accept: (i, r) => parts[i] === part && r < 18,
      },
      tile,
    )
  }

  // Cada pieza toma el movimiento solo de las zonas que cubre, suavizado a lo largo de la tela
  const only = (...allowed: Part[]) => (i: number) => allowed.includes(parts[i] as Part)
  const torsoAndLegs = only(Part.Torso, Part.Neck, Part.LegL, Part.LegR)
  const pieces: { g: THREE.BufferGeometry; allow: (i: number) => boolean; smoothing: number; slot: GarmentSlot }[] = []
  switch (design.garment) {
    case 'camiseta':
    case 'manga-larga': {
      const coverage = design.garment === 'camiseta' ? 0.26 : 0.97
      const g = torso(hipsY - 2, neckTop, {
        flare: (t) => loose * 0.35 * (1 - t) ** 2,
        folds: { count: 10, amp: loose * 0.08, t0: 0.25, t1: 0 },
      })
      pieces.push({ g, allow: torsoAndLegs, smoothing: 4, slot: 'cuerpo' })
      pieces.push({ g: sleeve(1, coverage), allow: only(Part.ArmL, Part.Torso), smoothing: 3, slot: 'mangas' })
      pieces.push({ g: sleeve(-1, coverage), allow: only(Part.ArmR, Part.Torso), smoothing: 3, slot: 'mangas' })
      break
    }
    case 'vestido': {
      // Vestido sin mangas: de la rodilla al cuello; por debajo de la cadera se abre en falda
      const hem = kneeY - 4
      const tHips = (hipsY - hem) / (neckTop - hem)
      const skirtFlare = toModel(0.07, fit) + loose * 1.5
      const g = torso(hem, neckTop, {
        flare: (t) => (t < tHips ? skirtFlare * (1 - t / tHips) ** 1.4 : 0),
        folds: { count: 9, amp: 1 + loose * 0.3, t0: tHips, t1: 0 },
      })
      pieces.push({ g, allow: torsoAndLegs, smoothing: 12, slot: 'cuerpo' })
      break
    }
    case 'pantalon':
      pieces.push({ g: torso(crotchY + 1, waistY + 3), allow: torsoAndLegs, smoothing: 4, slot: 'cuerpo' })
      pieces.push({ g: leg(1), allow: only(Part.LegL, Part.Torso), smoothing: 3, slot: 'cuerpo' })
      pieces.push({ g: leg(-1), allow: only(Part.LegR, Part.Torso), smoothing: 3, slot: 'cuerpo' })
      break
  }

  return pieces.map(({ g, allow, smoothing, slot }) => {
    skinFromCloud(g, cloud, grid, allow, smoothing)
    pose.unskin(g)
    computeTubeNormals(g)
    return { g, slot }
  })
}
