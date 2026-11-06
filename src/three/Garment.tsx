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

/** Cordones (algodón crudo) y ojales (metal plateado) si el diseño no dice otra cosa. */
const TRIM_DEFAULTS: Partial<Record<GarmentSlot, SlotStyle>> = {
  cordones: { color: '#ece7dc', look: { roughness: 0.95, sheen: 0.4, sheenRoughness: 0.9, clearcoat: 0, knit: 'sarga', knitDepth: 0.9, stiffness: 1 } },
  // Metal satinado (un metal pulido del todo refleja el estudio oscuro y se ve negro)
  ojales: { color: '#c9c9c9', look: { roughness: 0.38, sheen: 0, sheenRoughness: 1, clearcoat: 0.3, metalness: 0.6, knit: 'liso', knitDepth: 0, stiffness: 1 } },
}

/** Color y material de cada zona: el que venga del Diseñador o, si no, la tela y el color de la prenda (canalé en puños, bajo y cuello). */
export function slotStyle(design: Design, slot: GarmentSlot): SlotStyle {
  const own = design.pieces?.[slot]
  if (own) return own
  if (TRIM_DEFAULTS[slot]) return TRIM_DEFAULTS[slot]
  const fabric = FABRICS[design.fabric]
  const body = design.pieces?.cuerpo ?? { color: design.color, look: fabric }
  return RIB_SLOTS.includes(slot) ? { color: body.color, look: { ...body.look, knit: 'canale', knitDepth: 0.9 } } : body
}

/**
 * Detalle de confección en el material de la tela (solo prendas de patrón, que traen el atributo `edge`):
 * - costuras: hendidura en la unión y el relieve del margen de costura planchado debajo
 * - pespuntes: puntadas sueltas del color de la tela un poco más claro u oscuro (simples o dobles)
 * - rebordes: bordes doblados y redondeados (canalé de puños y bajo) y el canal del cordón en la capucha
 * - el interior de la prenda (las caras de dentro) un poco más oscuro, como en una prenda de verdad
 * El bolsillo canguro además se recorta a su forma exacta y dibuja sus propios bordes.
 */
const SEAM_GLSL = /* glsl */ `
varying vec2 vEdge;
// El acabado no se interpola entre puntos (si no, a medio camino entre dos bordes salen acabados que no existen)
flat varying float vEdgeKind;
uniform float uSeams;
#ifdef POCKET
varying vec2 vPocketUv;
uniform vec4 uPocket;
#endif

// Tamaño de un píxel en cm del patrón (se calcula una vez, fuera de cualquier "if")
float seamPxD;
float seamPxA;

// Puntadas a la distancia "at" del borde: trazos de unos 2 mm cada 3,2 mm.
// Si en pantalla son más pequeñas que un píxel (de lejos o en tela fruncida) se funden en una línea suave
float stitchLine(float d, float at, float along) {
  float line = 1.0 - smoothstep(0.035, 0.085 + seamPxD, abs(d - at));
  line *= clamp(0.14 / max(seamPxD, 1e-4), 0.0, 1.0);
  float ph = fract(along / 0.32);
  float dash = smoothstep(0.03, 0.08, ph) * (1.0 - smoothstep(0.6, 0.66, ph));
  dash = mix(dash, 0.55, smoothstep(0.06, 0.18, seamPxA));
  return line * dash;
}

// Relieve (cm), hilo (0-1) y sombra (0-1) según la distancia al borde y su acabado
void seamDetail(vec3 e, out float h, out float thread, out float shade) {
  float d = e.x;
  float al = e.y;
  int k = int(e.z + 0.5);
  h = 0.0; thread = 0.0; shade = 0.0;
  if (k == 9 || d > 3.2) return;
  if (k <= 2) {
    float groove = 1.0 - smoothstep(0.0, 0.25, d);
    h += -0.3 * groove + 0.12 * exp(-pow((d - 0.75) / 0.45, 2.0));
    shade += 0.35 * groove;
    if (k == 1) thread += stitchLine(d, 0.6, al);
    if (k == 2) thread += stitchLine(d, 0.55, al) + stitchLine(d, 1.2, al + 0.16);
  } else {
    // Doblez: borde redondeado (el canto queda un poco en sombra). Curva suave: con una esquina en la curva
    // salía una línea de rayitas donde el relieve dejaba de subir de golpe
    // Solo sombra, sin relieve: en la primera fila (puntos cada ~1,5 cm sobre tela curva) el relieve salía distinto
    // en cada triángulo y se veían rayitas alternas
    shade += 0.3 * (1.0 - smoothstep(0.0, 0.45, d));
    // Jareta: pespunte del canal del cordón; 5: abertura del bolsillo con su pespunte
    if (k == 4) { thread += stitchLine(d, 2.4, al); h -= 0.1 * (1.0 - smoothstep(0.0, 0.18, abs(d - 2.4))); }
    if (k == 5) thread += stitchLine(d, 0.9, al);
  }
  h += 0.04 * thread;
}

vec3 perturbSeamNormal(vec3 surfPos, vec3 surfNorm, vec2 dHdxy, float faceDir) {
  vec3 sx = dFdx(surfPos);
  vec3 sy = dFdy(surfPos);
  vec3 r1 = cross(sy, surfNorm);
  vec3 r2 = cross(surfNorm, sx);
  float det = dot(sx, r1) * faceDir;
  if (abs(det) < 1e-12) return surfNorm;
  vec3 grad = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
  return normalize(abs(det) * surfNorm - grad);
}
`

/**
 * Estampados: la imagen de cada lado (delantero y espalda) se proyecta de frente sobre el cuerpo de la prenda.
 * Se usa la posición de la tela en reposo (antes de moverla con el esqueleto), así el estampado va pegado a la tela
 * y la acompaña al respirar y al moverse. `uPrintFrame` = centro x, semiancho, alto del hombro y del bajo; `uPrintZ`
 * separa delante de detrás. Encima siguen el relieve del tejido y las costuras, como en un estampado de verdad.
 */
const PRINT_GLSL = /* glsl */ `
varying vec3 vRestPos;
varying vec2 vPrintUv;
uniform sampler2D uPrintFront;
uniform sampler2D uPrintBack;
uniform vec4 uPrintFrame;
uniform float uPrintZ;
uniform float uPrintOn;
// Prendas de patrón: se estampa sobre la pieza plana (UV en cm del patrón: x de uPrintUv.x a .y, alto de .z a .w)
uniform float uPrintFlat;
uniform vec4 uPrintUv;
// Relieve (bordados, parches, fornituras): blanco donde sobresale
uniform sampler2D uPrintReliefFront;
uniform sampler2D uPrintReliefBack;
uniform float uPrintRelief;
`

const PRINT_APPLY = /* glsl */ `
float printH = 0.0;
if (uPrintOn > 0.5 && gl_FrontFacing) {
  float ps = (vRestPos.x - uPrintFrame.x) / (2.0 * uPrintFrame.y) + 0.5;
  float pt = (uPrintFrame.z - vRestPos.y) / max(uPrintFrame.z - uPrintFrame.w, 1e-4);
  if (uPrintFlat > 0.5) {
    ps = (vPrintUv.x - uPrintUv.x) / max(uPrintUv.y - uPrintUv.x, 1e-4);
    pt = (uPrintUv.w - vPrintUv.y) / max(uPrintUv.w - uPrintUv.z, 1e-4);
  }
  if (ps > 0.0 && ps < 1.0 && pt > 0.0 && pt < 1.0) {
    bool printFront = vRestPos.z >= uPrintZ;
    vec2 puv = printFront ? vec2(ps, 1.0 - pt) : vec2(1.0 - ps, 1.0 - pt);
    vec4 pc = printFront ? texture2D(uPrintFront, puv) : texture2D(uPrintBack, puv);
    diffuseColor.rgb = mix(diffuseColor.rgb, pc.rgb, pc.a);
    if (uPrintRelief > 0.5) printH = printFront ? texture2D(uPrintReliefFront, puv).a : texture2D(uPrintReliefBack, puv).a;
  }
}
`

/** Inclinación de la luz en los bordes del relieve (después de las normales del tejido). */
const PRINT_RELIEF_NORMAL = /* glsl */ `
vec2 printDh = vec2(dFdx(printH), dFdy(printH)) * 0.006;
if (uPrintRelief > 0.5 && dot(printDh, printDh) > 1e-14) normal = perturbSeamNormal(-vViewPosition, normal, printDh, faceDirection);
`

/** Textura vacía (sin estampados en ese lado). */
const NO_PRINT = (() => {
  const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1)
  t.needsUpdate = true
  return t
})()

/** Prepara un material de tela con el detalle de confección (ver SEAM_GLSL) y, si `prints`, con los estampados (PRINT_GLSL). */
function withSeams(m: THREE.MeshPhysicalMaterial, pocket: boolean, prints = false) {
  const uniforms = {
    uSeams: { value: 0 },
    uPocket: { value: new THREE.Vector4(0, 0, 0, 0) },
    uPrintFront: { value: NO_PRINT as THREE.Texture },
    uPrintBack: { value: NO_PRINT as THREE.Texture },
    uPrintFrame: { value: new THREE.Vector4(0, 1, 1, 0) },
    uPrintZ: { value: 0 },
    uPrintOn: { value: 0 },
    uPrintFlat: { value: 0 },
    uPrintUv: { value: new THREE.Vector4(0, 1, 0, 1) },
    uPrintReliefFront: { value: NO_PRINT as THREE.Texture },
    uPrintReliefBack: { value: NO_PRINT as THREE.Texture },
    uPrintRelief: { value: 0 },
  }
  m.userData.seams = uniforms.uSeams
  if (pocket) m.userData.pocket = uniforms.uPocket
  if (prints) m.userData.prints = uniforms
  m.defines = { ...m.defines, ...(pocket ? { POCKET: '' } : {}) }
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\nattribute vec3 edge;\nvarying vec2 vEdge;\nflat varying float vEdgeKind;${pocket ? '\nvarying vec2 vPocketUv;' : ''}${prints ? '\nvarying vec3 vRestPos;\nvarying vec2 vPrintUv;' : ''}`,
      )
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>\nvEdge = edge.xy;\nvEdgeKind = edge.z;${pocket ? '\nvPocketUv = uv;' : ''}${prints ? '\nvRestPos = position;\nvPrintUv = uv;' : ''}`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${SEAM_GLSL}${prints ? PRINT_GLSL : ''}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        ${prints ? PRINT_APPLY : ''}
        vec3 seamEdge = vec3(vEdge, vEdgeKind);
        seamPxD = fwidth(vEdge.x);
        seamPxA = fwidth(vEdge.y);
        #ifdef POCKET
          // Bolsillo: fuera del trapecio no hay tela; sus bordes salen de la forma
          seamPxD = fwidth(vPocketUv.y);
          seamPxA = fwidth(vPocketUv.x);
          float pt = (vPocketUv.y - uPocket.x) / max(uPocket.y, 0.001);
          float halfW = mix(uPocket.z, uPocket.w, clamp(pt, 0.0, 1.0));
          if (pt < 0.0 || pt > 1.0 || abs(vPocketUv.x) > halfW) discard;
          float slope = uPocket.y / length(vec2(uPocket.y, uPocket.z - uPocket.w));
          float dSide = (halfW - abs(vPocketUv.x)) * slope;
          float dBottom = vPocketUv.y - uPocket.x;
          float dTop = uPocket.x + uPocket.y - vPocketUv.y;
          if (dSide < min(dBottom, dTop)) seamEdge = vec3(dSide, vPocketUv.y, 5.0);
          else if (dBottom < dTop) seamEdge = vec3(dBottom, vPocketUv.x, 2.0);
          else seamEdge = vec3(dTop, vPocketUv.x, 2.0);
        #endif
        float seamH, seamThread, seamShade;
        seamDetail(seamEdge, seamH, seamThread, seamShade);
        seamH *= uSeams; seamThread *= uSeams; seamShade *= uSeams;
        float seamLum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        // Hilo del mismo tono que la tela, un poco más claro (telas oscuras) o más oscuro (claras)
        vec3 threadColor = seamLum < 0.35 ? mix(diffuseColor.rgb, vec3(1.0), 0.2) : diffuseColor.rgb * 0.8;
        diffuseColor.rgb *= 1.0 - seamShade * 0.35;
        diffuseColor.rgb = mix(diffuseColor.rgb, threadColor, clamp(seamThread, 0.0, 1.0));`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        // Solo donde hay relieve: si no, la fórmula puede dar una normal inválida en algunos píxeles (rayitas)
        vec2 seamDh = vec2(dFdx(seamH), dFdy(seamH)) * 0.01;
        if (uSeams > 0.5 && dot(seamDh, seamDh) > 1e-14) normal = perturbSeamNormal(-vViewPosition, normal, seamDh, faceDirection);
        ${prints ? PRINT_RELIEF_NORMAL : ''}`,
      )
      // El interior de la prenda, algo más apagado (no mucho: en los pliegues del cuello salía a manchas)
      .replace('#include <opaque_fragment>', `outgoingLight *= gl_FrontFacing ? 1.0 : 0.84;\n#include <opaque_fragment>`)
  }
  m.customProgramCacheKey = () => (pocket ? 'tela-bolsillo' : 'tela') + (prints ? '-estampados' : '')
}

/** Un material de Three.js por zona (en el orden de GARMENT_SLOTS), que solo se rehace si cambia algún color o tela. */
function useSlotMaterials(design: Design) {
  const styles = GARMENT_SLOTS.map((s) => slotStyle(design, s))
  const key = JSON.stringify([styles, isPattern(design)])
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
        // Superficie y lavado del Diseñador: el azulejo, que ya lleva el color, se repite sobre la tela.
        // Las UV van en cm del patrón (sudadera) o en tramos de 3 cm (prendas de tubo)
        const tile = styles[i].tile
        if (tile) {
          const t = new THREE.CanvasTexture(tile.canvas)
          t.colorSpace = THREE.SRGBColorSpace
          t.anisotropy = 8
          t.wrapS = THREE.RepeatWrapping
          t.wrapT = tile.stretch ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping
          const perUv = isPattern(design) ? 1 : 3
          t.repeat.set(tile.stretch ? 0 : perUv / tile.cm, perUv / tile.cm)
          t.center.set(0.5, 0.5)
          t.rotation = (-tile.angle * Math.PI) / 180
          m.map = t
          m.color.set('#ffffff')
        }
        // En la sisa la manga y el cuerpo se tocan: el cuerpo se dibuja por delante para que no asomen trocitos de manga
        if (slot === 'cuerpo') {
          m.polygonOffset = true
          m.polygonOffsetFactor = -1.5
          m.polygonOffsetUnits = -6
        }
        if (slot === 'bolsillo') {
          // El bolsillo va cosido encima del delantero: siempre por delante de él
          m.polygonOffset = true
          m.polygonOffsetFactor = -2
          m.polygonOffsetUnits = -6
        }
        if (slot !== 'cordones' && slot !== 'ojales') withSeams(m, slot === 'bolsillo', slot === 'cuerpo' || slot === 'bolsillo')
        return m
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  )
  useEffect(() => () => materials.forEach((m) => {
    m.map?.dispose()
    m.dispose()
  }), [materials])
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

/**
 * Prendas que se construyen con patrón de costura (piezas cosidas y asentadas sobre el cuerpo): la sudadera y todas
 * las de arriba con mangas que traen sus acabados (`design.top`: camiseta, polo, camisa, chaquetas).
 */
const PATTERN_GARMENTS = new Set<Design['garment']>(['sudadera'])
const isPattern = (d: Design) => PATTERN_GARMENTS.has(d.garment) || (!!d.top && (d.garment === 'camiseta' || d.garment === 'manga-larga'))

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
  const pattern = isPattern(design)
  const topKey = JSON.stringify(design.top ?? null)

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
      design: { ...design, pieces: undefined, prints: undefined },
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
  }, [model, cloud, pose, fit, measurements, pattern, design.garment, design.fit, design.hood, design.hoodUp, design.pocket, design.cords, design.bodyLength, design.sleeveLength, design.chestScale, topKey, fabric])
  useEffect(() => () => patternGeom?.dispose(), [patternGeom])

  // Resto de prendas: tubos que envuelven el cuerpo (cálculo rápido, al momento)
  const wrapGeoms = useMemo(() => {
    if (pattern) return []
    const grid = new CloudGrid(pose.points)
    return buildGarment(model, cloud, pose, grid, fit, design, fabric)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, cloud, pose, fit, pattern, design.garment, design.fit, design.legLength, design.under, design.coveredBy, design.bodyLength, fabric])
  useEffect(() => () => wrapGeoms.forEach(({ g }) => g.dispose()), [wrapGeoms])

  // Estampados: una textura por lado, que se proyecta sobre el cuerpo de la prenda (ver PRINT_GLSL)
  const printTextures = useMemo(() => {
    const make = (c: HTMLCanvasElement | null | undefined) => {
      if (!c) return null
      const t = new THREE.CanvasTexture(c)
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = 8
      return t
    }
    const relief = (c: HTMLCanvasElement | null | undefined) => {
      if (!c) return null
      const t = new THREE.CanvasTexture(c)
      t.anisotropy = 8
      return t
    }
    return {
      front: make(design.prints?.front),
      back: make(design.prints?.back),
      frontRelief: relief(design.prints?.frontRelief),
      backRelief: relief(design.prints?.backRelief),
    }
  }, [design.prints])
  useEffect(
    () => () => Object.values(printTextures).forEach((t) => t?.dispose()),
    [printTextures],
  )
  useEffect(() => {
    const geometries = pattern ? (patternGeom ? [{ g: patternGeom, slot: null }] : []) : wrapGeoms
    const frame = printFrame(geometries, design.garment !== 'pantalon')
    const on = !!frame && !!(printTextures.front || printTextures.back)
    for (const slot of ['cuerpo', 'bolsillo'] as const) {
      const u = materials[slotIndex(slot)].userData.prints as PrintUniforms | undefined
      if (!u) continue
      u.uPrintOn.value = on ? 1 : 0
      u.uPrintFront.value = printTextures.front ?? NO_PRINT
      u.uPrintBack.value = printTextures.back ?? NO_PRINT
      u.uPrintReliefFront.value = printTextures.frontRelief ?? NO_PRINT
      u.uPrintReliefBack.value = printTextures.backRelief ?? NO_PRINT
      u.uPrintRelief.value = printTextures.frontRelief || printTextures.backRelief ? 1 : 0
      if (frame) {
        u.uPrintFrame.value.set(frame.cx, frame.half, frame.top, frame.bottom)
        u.uPrintZ.value = frame.cz
        u.uPrintFlat.value = frame.uv ? 1 : 0
        if (frame.uv) u.uPrintUv.value.set(...frame.uv)
      }
    }
  }, [patternGeom, wrapGeoms, materials, pattern, printTextures, design.garment])

  useEffect(() => {
    const geometries = pattern ? (patternGeom ? [{ g: patternGeom, slot: null }] : []) : wrapGeoms
    // Forma del bolsillo de esta prenda, para recortar su material
    const shape = patternGeom?.userData.pocket as { y0: number; h: number; w0: number; w1: number } | null | undefined
    const pocketUniform = materials[slotIndex('bolsillo')].userData.pocket as { value: THREE.Vector4 } | undefined
    if (shape && pocketUniform) pocketUniform.value.set(shape.y0, shape.h, shape.w0, shape.w1)
    // Costuras y rebordes solo en las prendas de patrón (las demás no saben dónde están sus bordes)
    for (const m of materials) if (m.userData.seams) (m.userData.seams as { value: number }).value = pattern ? 1 : 0
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


interface PrintUniforms {
  uPrintFront: { value: THREE.Texture }
  uPrintBack: { value: THREE.Texture }
  uPrintFrame: { value: THREE.Vector4 }
  uPrintZ: { value: number }
  uPrintOn: { value: number }
  uPrintFlat: { value: number }
  uPrintUv: { value: THREE.Vector4 }
  uPrintReliefFront: { value: THREE.Texture }
  uPrintReliefBack: { value: THREE.Texture }
  uPrintRelief: { value: number }
}

/**
 * Encuadre del cuerpo de la prenda en reposo, el mismo que el de la imagen de estampados del dibujo:
 * de costado a costado (medido a la altura del pecho en prendas de torso, para no contar las sisas) y del punto
 * más alto (hombro junto al cuello, o cintura) al bajo. `cz` separa delante de detrás.
 */
function printFrame(list: { g: THREE.BufferGeometry; slot: GarmentSlot | null }[], top: boolean) {
  const body = slotIndex('cuerpo')
  const pts: number[] = []
  // Prenda de patrón: medidas de la pieza plana (UV en cm) de delantero y espalda
  let uv: [number, number, number, number] | null = null
  for (const { g, slot } of list) {
    const pos = g.getAttribute('position')
    if (!pos) continue
    if (slot === 'cuerpo') {
      for (let i = 0; i < pos.count; i++) pts.push(pos.getX(i), pos.getY(i), pos.getZ(i))
    } else if (slot === null) {
      // Una sola malla con un grupo de triángulos por zona
      const index = g.getIndex()
      const uvs = g.getAttribute('uv')
      for (const grp of g.groups) {
        if (grp.materialIndex !== body) continue
        for (let k = grp.start; k < grp.start + grp.count; k++) {
          const i = index ? index.getX(k) : k
          pts.push(pos.getX(i), pos.getY(i), pos.getZ(i))
          if (uvs) {
            const [x, y] = [uvs.getX(i), uvs.getY(i)]
            uv = uv ? [Math.min(uv[0], x), Math.max(uv[1], x), Math.min(uv[2], y), Math.max(uv[3], y)] : [x, x, y, y]
          }
        }
      }
    }
  }
  if (!pts.length) return null
  let minY = Infinity
  let maxY = -Infinity
  for (let i = 1; i < pts.length; i += 3) {
    minY = Math.min(minY, pts[i])
    maxY = Math.max(maxY, pts[i])
  }
  const h = maxY - minY
  // Franja donde medir el ancho y el fondo: la del pecho (prendas de torso) o toda la pieza (pantalón)
  const [lo, hi] = top ? [maxY - h * 0.6, maxY - h * 0.25] : [minY, maxY]
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (let i = 0; i < pts.length; i += 3) {
    if (pts[i + 1] < lo || pts[i + 1] > hi) continue
    minX = Math.min(minX, pts[i])
    maxX = Math.max(maxX, pts[i])
    minZ = Math.min(minZ, pts[i + 2])
    maxZ = Math.max(maxZ, pts[i + 2])
  }
  if (!Number.isFinite(minX)) return null
  return { cx: (minX + maxX) / 2, half: (maxX - minX) / 2, top: maxY, bottom: minY, cz: (minZ + maxZ) / 2, uv }
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

  const torso = (from: number, to: number, extra?: Pick<TubeSpec, 'flare' | 'folds'> & { ease?: number }) =>
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

  // Altura hasta la que tapa la prenda de encima (con 7 cm de margen: en 3D la prenda queda algo más corta que su largo; lo de más arriba no se construye, ver Design.coveredBy)
  const covered = design.coveredBy ? neckTop - 1 - toModel((design.coveredBy - 7) / 100, fit) : Infinity
  // Las perneras empiezan en la entrepierna o, si la prenda de encima baja más, justo por debajo de su borde
  const legTop = Math.min(crotchY + 1, covered)
  // Holgura de lo que va por dentro de otra prenda (cintura, cadera y arranque de las perneras)
  const underEase = Math.min(ease, toModel(0.004, fit) + 0.3)
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
        from: along(legTop),
        to: along(crotchY + 1) + (along(ankleY + 3) - along(crotchY + 1)) * Math.min(1, Math.max(0.2, design.legLength ?? 1)),
        // Debajo de otra prenda, la pernera arranca ceñida (si no, el muslo de un pantalón ancho atravesaba el bajo de
        // la sudadera) y se abre hasta su holgura más abajo
        ease: design.under ? underEase : ease,
        flare: (t) => (design.under ? (ease - underEase) * THREE.MathUtils.smoothstep(t, 0.22, 0.5) : 0) + loose * 0.35 * t * t,
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
    case 'chaleco': {
      // Chaleco: solo el cuerpo, sin mangas
      const g = torso(hipsY - 2, neckTop, {
        flare: (t) => loose * 0.35 * (1 - t) ** 2,
        folds: { count: 10, amp: loose * 0.08, t0: 0.25, t1: 0 },
      })
      pieces.push({ g, allow: torsoAndLegs, smoothing: 4, slot: 'cuerpo' })
      break
    }
    case 'top': {
      // Top de mujer: de debajo de las axilas (por encima del pecho) a su largo; sin mangas ni hombros
      const top = I.chestY + (I.armY - I.chestY) * 0.55 + dy
      const hem = Math.max(crotchY + 4, top - toModel(design.bodyLength / 100, fit))
      const g = torso(hem, top, { flare: (t) => loose * 0.2 * (1 - t) ** 2 })
      pieces.push({ g, allow: torsoAndLegs, smoothing: 4, slot: 'cuerpo' })
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
    case 'pantalon': {
      // Debajo de otra prenda, la cintura y la cadera se ciñen al cuerpo para quedar por dentro, y lo que tapa la prenda
      // de arriba no se construye
      const waistTop = Math.min(waistY + 3, covered)
      if (waistTop > crotchY + 2) pieces.push({ g: torso(crotchY + 1, waistTop, design.under ? { ease: underEase } : undefined), allow: torsoAndLegs, smoothing: 4, slot: 'cuerpo' })
      pieces.push({ g: leg(1), allow: only(Part.LegL, Part.Torso), smoothing: 3, slot: 'cuerpo' })
      pieces.push({ g: leg(-1), allow: only(Part.LegR, Part.Torso), smoothing: 3, slot: 'cuerpo' })
      break
    }
  }

  return pieces.map(({ g, allow, smoothing, slot }) => {
    skinFromCloud(g, cloud, grid, allow, smoothing)
    pose.unskin(g)
    computeTubeNormals(g)
    return { g, slot }
  })
}
