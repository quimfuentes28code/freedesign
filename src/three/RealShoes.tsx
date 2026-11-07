import { useLoader } from '@react-three/fiber'
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { Model } from './Avatar'
import { boneName } from './body'
import type { Cloud } from './wrap'

/**
 * Zapatilla deportiva de modelo real: «Materials Variants Shoe» © 2021 Shopify, licencia CC-BY 4.0
 * (https://creativecommons.org/licenses/by/4.0/). Preparada con `scripts/convert-shoe.mjs`.
 *
 * El modelo es una sola zapatilla; se escala al largo del pie medido en el maniquí, se orienta como él, se apoya en
 * el suelo y se une al hueso del pie (así sigue las poses). El otro pie es la misma en espejo. Su tejido azul se tiñe
 * en el shader con el color elegido (conserva la luz y el relieve de la malla); la suela y los cordones no cambian.
 */
const MODEL_URL = '/models/zapatilla.glb'
export const REAL_SHOE_CREDIT = 'Zapatilla deportiva: © 2021 Shopify, CC BY 4.0'

// Zapatillas puestas (geometría en la postura en T, con sus huesos): el pantalón las usa para caer encima de ellas
let placed: THREE.BufferGeometry[] | null = null
const listeners = new Set<() => void>()
function publish(g: THREE.BufferGeometry[] | null) {
  placed = g
  listeners.forEach((l) => l())
}
/** Las zapatillas reales puestas (o null mientras no están). */
export function useRealShoes() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => placed,
  )
}

interface Foot {
  bone: number
  heel: THREE.Vector3
  dir: THREE.Vector3
  length: number
  /** Desplazamiento lateral del centro del pie respecto al talón. */
  side: number
}

/** Talón, dirección y largo de cada pie, en la postura en T (unidades del modelo). */
function measureFeet(cloud: Cloud, skeleton: THREE.Skeleton): Foot[] {
  const { pos, skinIndex, skinWeight } = cloud
  let floor = Infinity
  for (let i = 1; i < pos.length; i += 3) floor = Math.min(floor, pos[i])
  const feet: Foot[] = []
  for (const side of ['Left', 'Right'] as const) {
    const ids = [`${side}Foot`, `${side}ToeBase`].map((n) => skeleton.bones.findIndex((b) => boneName(b.name) === n))
    if (ids[0] < 0) continue
    const pts: THREE.Vector3[] = []
    for (let i = 0; i < pos.length / 3; i++) {
      let best = 0
      for (let k = 1; k < 4; k++) if (skinWeight[i * 4 + k] > skinWeight[i * 4 + best]) best = k
      if (ids.includes(skinIndex[i * 4 + best])) pts.push(new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]))
    }
    if (pts.length < 20) continue
    // Dirección: del centro del talón al de la puntera (lo más atrás y lo más adelante, cerca del suelo)
    const z0 = Math.min(...pts.map((p) => p.z))
    const z1 = Math.max(...pts.map((p) => p.z))
    const avg = (from: number, to: number) => {
      const sel = pts.filter((p) => p.z >= from && p.z <= to && p.y < floor + 4)
      return sel.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, sel.length))
    }
    const h = avg(z0, z0 + 4)
    const t = avg(z1 - 4, z1)
    const dir = new THREE.Vector3(t.x - h.x, 0, t.z - h.z).normalize()
    const length = Math.max(...pts.map((p) => p.clone().sub(h).dot(dir)))
    feet.push({ bone: ids[0], heel: new THREE.Vector3(h.x, floor, z0), dir, length, side: 0 })
  }
  return feet
}

/** Geometría de la zapatilla colocada en un pie (en la postura en T), unida a su hueso. */
function placeShoe(src: THREE.BufferGeometry, foot: Foot, mirror: boolean) {
  const g = src.clone()
  g.computeBoundingBox()
  const box = g.boundingBox!
  const pos = g.attributes.position as THREE.BufferAttribute
  // Lado del talón: el extremo más alto (la boca y el contrafuerte); la puntera es baja
  const topAt = (sign: number) => {
    let top = -Infinity
    for (let i = 0; i < pos.count; i++) if (sign * pos.getX(i) > 0.7) top = Math.max(top, pos.getY(i))
    return top
  }
  const toeSign = topAt(1) > topAt(-1) ? -1 : 1
  // La zapatilla, algo más larga que el pie (unos 2,5 cm)
  const shoeLen = box.max.x - box.min.x
  const s = (foot.length + 2.5) / shoeLen
  const heelX = toeSign > 0 ? box.min.x : box.max.x
  const up = new THREE.Vector3(0, 1, 0)
  const across = new THREE.Vector3().crossVectors(foot.dir, up)
  const m = new THREE.Matrix4().makeBasis(foot.dir.clone().multiplyScalar(toeSign), up, across.multiplyScalar(toeSign * (mirror ? -1 : 1)))
  const p = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    p.set((pos.getX(i) - heelX) * s, (pos.getY(i) - box.min.y) * s, pos.getZ(i) * s).applyMatrix4(m)
    // El talón de la zapatilla, 1 cm por detrás del pie; la suela, en el suelo
    p.add(foot.heel).addScaledVector(foot.dir, -1)
    pos.setXYZ(i, p.x, p.y, p.z)
  }
  // En espejo las caras quedan del revés: se da la vuelta a los triángulos
  if (mirror && g.index) {
    const idx = g.index.array as Uint16Array | Uint32Array
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]]
    g.index.needsUpdate = true
  }
  g.computeVertexNormals()
  // Toda la zapatilla sigue al hueso del pie
  const n = pos.count
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(n * 4).map((_, k) => (k % 4 === 0 ? foot.bone : 0)), 4))
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(n * 4).map((_, k) => (k % 4 === 0 ? 1 : 0)), 4))
  return g
}

/** Material del modelo con el tejido teñido del color elegido. */
function tinted(base: THREE.MeshStandardMaterial, color: string) {
  const m = base.clone()
  m.side = THREE.DoubleSide
  const uniform = { value: new THREE.Color(color) }
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uShoeColor = uniform
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uShoeColor;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        // El azul del tejido (y sus detalles en azul oscuro) pasa al color elegido, con su misma luz y relieve
        {
          vec3 c = diffuseColor.rgb;
          float blue = smoothstep(0.02, 0.12, c.b - max(c.r, c.g * 0.9));
          float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
          vec3 t = uShoeColor * clamp(lum / 0.15, 0.0, 1.6);
          diffuseColor.rgb = mix(c, t, blue);
        }`,
      )
  }
  m.customProgramCacheKey = () => 'zapatilla-real'
  return { material: m, uniform }
}

/** Zapatillas deportivas de modelo real en los dos pies. */
export function RealShoes({ model, cloud, color }: { model: Model; cloud: Cloud; color: string }) {
  const gltf = useLoader(GLTFLoader, MODEL_URL)
  const source = useMemo(() => {
    let mesh: THREE.Mesh | null = null
    gltf.scene.traverse((o) => {
      if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh
    })
    if (!mesh) return null
    const found = mesh as THREE.Mesh
    found.updateWorldMatrix(true, false)
    // La geometría con las transformaciones de su nodo aplicadas
    const g = found.geometry.clone().applyMatrix4(found.matrixWorld)
    return { geometry: g, material: found.material as THREE.MeshStandardMaterial }
  }, [gltf])
  const feet = useMemo(() => measureFeet(cloud, model.body.skeleton), [cloud, model])
  const geoms = useMemo(() => (source ? feet.map((f, i) => placeShoe(source.geometry, f, i === 1)) : []), [source, feet])
  const look = useMemo(() => (source ? tinted(source.material, color) : null), [source, color])

  useEffect(() => {
    if (!look) return
    const meshes = geoms.map((g) => {
      const mesh = new THREE.SkinnedMesh(g, look.material)
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.frustumCulled = false
      mesh.bind(model.body.skeleton, model.body.bindMatrix)
      model.root.add(mesh)
      return mesh
    })
    publish(geoms)
    return () => {
      meshes.forEach((m) => model.root.remove(m))
      publish(null)
    }
  }, [geoms, look, model])
  useEffect(() => () => geoms.forEach((g) => g.dispose()), [geoms])
  useEffect(() => () => look?.material.dispose(), [look])
  return null
}
