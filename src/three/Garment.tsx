import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { FABRICS, type Fabric } from '../data/fabrics'
import type { Design } from '../types'
import type { Model } from './Avatar'
import { FIT_EASE, jointPosition, type BodyFit } from './body'
import { Part, referencePose, type ReferencePose } from './pose'
import { CloudGrid, computeTubeNormals, skinFromCloud, wrapTube, type Cloud, type TubeSpec } from './wrap'

/** Material de la prenda según la tela y el color elegidos. Se comparte entre todas las piezas. */
function useFabricMaterial(design: Design) {
  const fabric = FABRICS[design.fabric]
  const material = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: design.color,
        roughness: fabric.roughness,
        sheen: fabric.sheen,
        sheenRoughness: fabric.sheenRoughness,
        sheenColor: new THREE.Color(design.color).lerp(new THREE.Color('#ffffff'), 0.25),
        clearcoat: fabric.clearcoat,
        side: THREE.DoubleSide,
      }),
    [fabric, design.color],
  )
  useEffect(() => () => material.dispose(), [material])
  return material
}

interface Props {
  model: Model
  fit: BodyFit
  /** Cuerpo ya ajustado a las medidas (postura en T, unidades del modelo). */
  cloud: Cloud
  design: Design
}

/**
 * Prenda puesta sobre el maniquí. Cada pieza es una tela que envuelve el cuerpo (torso, mangas, perneras)
 * y usa el mismo esqueleto que el maniquí: así se mueve exactamente con la animación.
 */
export function Garment({ model, fit, cloud, design }: Props) {
  const material = useFabricMaterial(design)
  const fabric = FABRICS[design.fabric]
  const pose = useMemo(() => referencePose(model, cloud), [model, cloud])
  const grid = useMemo(() => new CloudGrid(pose.points), [pose])

  const geometries = useMemo(
    () => buildGarment(model, cloud, pose, grid, fit, design, fabric),
    [model, cloud, pose, grid, fit, design.garment, design.fit, fabric], // eslint-disable-line react-hooks/exhaustive-deps
  )
  useEffect(() => () => geometries.forEach((g) => g.dispose()), [geometries])

  useEffect(() => {
    const meshes = geometries.map((g) => {
      const mesh = new THREE.SkinnedMesh(g, material)
      mesh.castShadow = true
      mesh.frustumCulled = false
      mesh.bind(model.body.skeleton, model.body.bindMatrix)
      model.root.add(mesh)
      return mesh
    })
    return () => meshes.forEach((m) => model.root.remove(m))
  }, [geometries, material, model])

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
  fabric: Fabric,
) {
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
  const pieces: { g: THREE.BufferGeometry; allow: (i: number) => boolean; smoothing: number }[] = []
  switch (design.garment) {
    case 'camiseta':
    case 'manga-larga': {
      const coverage = design.garment === 'camiseta' ? 0.26 : 0.97
      const g = torso(hipsY - 2, neckTop, {
        flare: (t) => loose * 0.35 * (1 - t) ** 2,
        folds: { count: 10, amp: loose * 0.08, t0: 0.25, t1: 0 },
      })
      pieces.push({ g, allow: torsoAndLegs, smoothing: 4 })
      pieces.push({ g: sleeve(1, coverage), allow: only(Part.ArmL, Part.Torso), smoothing: 3 })
      pieces.push({ g: sleeve(-1, coverage), allow: only(Part.ArmR, Part.Torso), smoothing: 3 })
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
      pieces.push({ g, allow: torsoAndLegs, smoothing: 12 })
      break
    }
    case 'pantalon':
      pieces.push({ g: torso(crotchY + 1, waistY + 3), allow: torsoAndLegs, smoothing: 4 })
      pieces.push({ g: leg(1), allow: only(Part.LegL, Part.Torso), smoothing: 3 })
      pieces.push({ g: leg(-1), allow: only(Part.LegR, Part.Torso), smoothing: 3 })
      break
  }

  return pieces.map(({ g, allow, smoothing }) => {
    skinFromCloud(g, cloud, grid, allow, smoothing)
    pose.unskin(g)
    computeTubeNormals(g)
    return g
  })
}
