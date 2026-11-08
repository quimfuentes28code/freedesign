import { useLoader } from '@react-three/fiber'
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { RealShoeId, ShoeStyle } from '../types'
import type { Model } from './Avatar'
import { boneName } from './body'
import type { Cloud } from './wrap'

/**
 * Zapatillas de modelo real (.glb). Cada una se escala al largo del pie medido en el maniquí, se orienta como él, se
 * apoya en el suelo y se une al hueso del pie (sigue las poses); el otro pie es la misma en espejo.
 *
 * Añadir una (p. ej. generada con IA desde una foto, ver docs/zapatillas-ia.md):
 * 1. `node scripts/convert-shoe.mjs <entrada.glb> public/models/<nombre>.glb`
 * 2. su id en `RealShoeId` (src/types.ts) y una entrada aquí con su archivo, nombre y créditos.
 * El modelo puede venir en cualquier orientación horizontal (largo en X o en Z, puntera a un lado u otro); se supone
 * que «arriba» es +Y, como en todos los .glb.
 */
export const REAL_SHOES: Record<
  RealShoeId,
  {
    label: string
    url: string
    credit: string
    /** Su tejido azul se tiñe con el color elegido (este, por defecto). */
    tint?: { color: string }
    /** Cuánto más larga que el pie, en cm (por defecto 2,5; las gruesas abultan más). */
    extra?: number
    /** Aclarado de su color (1 = tal cual): las negras se veían como una mancha sin detalle. */
    light?: number
  }
> = {
  // «Materials Variants Shoe» © 2021 Shopify, CC BY 4.0: su tejido azul se tiñe con el color elegido
  deportiva: { label: 'Deportiva (modelo real)', url: '/models/zapatilla.glb', credit: 'Zapatilla deportiva: © 2021 Shopify, CC BY 4.0', tint: { color: '#1f5f8b' } },
  // Skate gruesa negra, generada con IA (TRELLIS, de Microsoft, licencia MIT) a partir de fotos
  globe: { label: 'Skate gruesa (modelo real)', url: '/models/globe.glb', credit: 'Skate gruesa: modelo generado con IA a partir de fotos', extra: 5, light: 2.4 },
}
export const isRealShoe = (s: ShoeStyle | null | undefined): s is RealShoeId => !!s && s in REAL_SHOES

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
    feet.push({ bone: ids[0], heel: new THREE.Vector3(h.x, floor, z0), dir, length })
  }
  return feet
}

/**
 * Cómo está puesta la zapatilla en su archivo: eje del largo (X o Z, el más largo en horizontal) y hacia dónde
 * apunta la puntera (el talón es el extremo más alto: boca y contrafuerte; la puntera es baja).
 */
function orientationOf(geoms: THREE.BufferGeometry[], box: THREE.Box3) {
  const size = box.getSize(new THREE.Vector3())
  const axis = size.x >= size.z ? 0 : 2
  const lo = axis === 0 ? box.min.x : box.min.z
  const len = axis === 0 ? size.x : size.z
  let topA = -Infinity
  let topB = -Infinity
  for (const g of geoms) {
    const pos = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const t = ((axis === 0 ? pos.getX(i) : pos.getZ(i)) - lo) / len
      if (t < 0.15) topA = Math.max(topA, pos.getY(i))
      else if (t > 0.85) topB = Math.max(topB, pos.getY(i))
    }
  }
  // Puntera hacia +eje si el extremo alto (talón) está en el lado bajo del eje
  return { axis, toward: topA > topB ? 1 : -1, len }
}

/** Piezas de la zapatilla colocadas en un pie (en la postura en T), unidas a su hueso. */
function placeShoe(src: { geometry: THREE.BufferGeometry }[], box: THREE.Box3, foot: Foot, mirror: boolean, extra: number) {
  const { axis, toward, len } = orientationOf(
    src.map((p) => p.geometry),
    box,
  )
  // La zapatilla, algo más larga que el pie (lo que diga el modelo; las gruesas abultan más)
  const s = (foot.length + extra) / len
  const heelAt = toward > 0 ? (axis === 0 ? box.min.x : box.min.z) : axis === 0 ? box.max.x : box.max.z
  const up = new THREE.Vector3(0, 1, 0)
  const across = new THREE.Vector3().crossVectors(foot.dir, up)
  const p = new THREE.Vector3()
  return src.map(({ geometry }) => {
    const g = geometry.clone()
    const pos = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const along = ((axis === 0 ? pos.getX(i) : pos.getZ(i)) - heelAt) * toward
      // Lado: el otro eje horizontal, con el signo que conserva la orientación (en espejo, al revés)
      const sideRaw = axis === 0 ? pos.getZ(i) : -pos.getX(i)
      const side = sideRaw * toward * (mirror ? -1 : 1)
      p.copy(foot.heel)
        .addScaledVector(foot.dir, along * s - 1)
        .addScaledVector(up, (pos.getY(i) - box.min.y) * s)
        .addScaledVector(across, side * s)
      pos.setXYZ(i, p.x, p.y, p.z)
    }
    // Solo el espejo invierte el espacio: en ese pie se da la vuelta a los triángulos para que miren hacia fuera
    if (mirror) {
      if (!g.index) g.setIndex(Array.from({ length: pos.count }, (_, i) => i))
      const idx = g.index!.array as Uint16Array | Uint32Array
      for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]]
      g.index!.needsUpdate = true
    }
    g.computeVertexNormals()
    // Toda la zapatilla sigue al hueso del pie
    const n = pos.count
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(n * 4).map((_, k) => (k % 4 === 0 ? foot.bone : 0)), 4))
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(n * 4).map((_, k) => (k % 4 === 0 ? 1 : 0)), 4))
    return g
  })
}

/** Material del modelo, con el tejido azul teñido del color elegido (solo en los modelos preparados para ello). */
function tinted(base: THREE.Material, color: string | null, light = 1) {
  const m = base.clone() as THREE.MeshStandardMaterial
  m.side = THREE.DoubleSide
  // Una zapatilla no es de metal: los modelos hechos con IA suelen traerlo marcado y, sin reflejos, se veían negros
  m.metalness = 0
  m.metalnessMap = null
  // Las oscuras, algo menos mates: un poco de brillo en la piel marca los paneles y las costuras
  if (light > 1) m.roughness = Math.min(m.roughness, 0.7)
  if (!color && light === 1) return m
  const uniform = { value: new THREE.Color(color ?? '#ffffff') }
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uShoeColor = uniform
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uShoeColor;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        ${
          color
            ? `// El azul del tejido (y sus detalles en azul oscuro) pasa al color elegido, con su misma luz y relieve
        {
          vec3 c = diffuseColor.rgb;
          float blue = smoothstep(0.02, 0.12, c.b - max(c.r, c.g * 0.9));
          float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
          vec3 t = uShoeColor * clamp(lum / 0.15, 0.0, 1.6);
          diffuseColor.rgb = mix(c, t, blue);
        }`
            : ''
        }
        // Aclarado: el negro sigue siendo negro, pero se distinguen sus tonos (paneles, cordones, suela)
        diffuseColor.rgb = min(diffuseColor.rgb * ${light.toFixed(2)} + 0.006, vec3(1.0));`,
      )
  }
  m.customProgramCacheKey = () => `zapatilla-real-${color ? 'tinte' : 'sin'}-${light}`
  return m
}

/** Zapatillas de modelo real en los dos pies. */
export function RealShoes({ model, cloud, shoe, color }: { model: Model; cloud: Cloud; shoe: RealShoeId; color?: string }) {
  const def = REAL_SHOES[shoe]
  const gltf = useLoader(GLTFLoader, def.url)
  // Todas las piezas del archivo, con las transformaciones de sus nodos aplicadas
  const source = useMemo(() => {
    const parts: { geometry: THREE.BufferGeometry; material: THREE.Material }[] = []
    gltf.scene.updateMatrixWorld(true)
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      parts.push({ geometry: mesh.geometry.clone().applyMatrix4(mesh.matrixWorld), material: mats[0] })
    })
    const box = new THREE.Box3()
    for (const p of parts) {
      p.geometry.computeBoundingBox()
      box.union(p.geometry.boundingBox!)
    }
    return { parts, box }
  }, [gltf])
  const feet = useMemo(() => measureFeet(cloud, model.body.skeleton), [cloud, model])
  const geoms = useMemo(() => feet.map((f, i) => placeShoe(source.parts, source.box, f, i === 1, def.extra ?? 2.5)), [source, feet, def])
  const tint = def.tint ? (color ?? def.tint.color) : null
  const materials = useMemo(() => source.parts.map((p) => tinted(p.material, tint, def.light)), [source, tint, def])

  useEffect(() => {
    const meshes = geoms.flatMap((foot) =>
      foot.map((g, k) => {
        const mesh = new THREE.SkinnedMesh(g, materials[k])
        mesh.castShadow = true
        mesh.receiveShadow = true
        mesh.frustumCulled = false
        mesh.bind(model.body.skeleton, model.body.bindMatrix)
        model.root.add(mesh)
        return mesh
      }),
    )
    publish(geoms.flat())
    return () => {
      meshes.forEach((m) => model.root.remove(m))
      publish(null)
    }
  }, [geoms, materials, model])
  useEffect(() => () => geoms.flat().forEach((g) => g.dispose()), [geoms])
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials])
  return null
}
