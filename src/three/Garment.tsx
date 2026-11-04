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

/** Prepara un material de tela con el detalle de confección (ver SEAM_GLSL). */
function withSeams(m: THREE.MeshPhysicalMaterial, pocket: boolean) {
  const uniforms = { uSeams: { value: 0 }, uPocket: { value: new THREE.Vector4(0, 0, 0, 0) } }
  m.userData.seams = uniforms.uSeams
  if (pocket) m.userData.pocket = uniforms.uPocket
  m.defines = { ...m.defines, ...(pocket ? { POCKET: '' } : {}) }
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\nattribute vec3 edge;\nvarying vec2 vEdge;\nflat varying float vEdgeKind;${pocket ? '\nvarying vec2 vPocketUv;' : ''}`,
      )
      .replace('#include <uv_vertex>', `#include <uv_vertex>\nvEdge = edge.xy;\nvEdgeKind = edge.z;${pocket ? '\nvPocketUv = uv;' : ''}`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${SEAM_GLSL}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
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
        if (uSeams > 0.5 && dot(seamDh, seamDh) > 1e-14) normal = perturbSeamNormal(-vViewPosition, normal, seamDh, faceDirection);`,
      )
      // El interior de la prenda, algo más apagado (no mucho: en los pliegues del cuello salía a manchas)
      .replace('#include <opaque_fragment>', `outgoingLight *= gl_FrontFacing ? 1.0 : 0.84;\n#include <opaque_fragment>`)
  }
  m.customProgramCacheKey = () => (pocket ? 'tela-bolsillo' : 'tela')
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
        }
        if (slot !== 'cordones' && slot !== 'ojales') withSeams(m, slot === 'bolsillo')
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
  }, [model, cloud, pose, fit, measurements, pattern, design.garment, design.fit, design.hood, design.hoodUp, design.pocket, design.cords, design.bodyLength, design.sleeveLength, fabric])
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
    // Costuras y rebordes solo en las prendas de patrón (las demás no saben dónde están sus bordes)
    for (const m of materials) if (m.userData.seams) (m.userData.seams as { value: number }).value = pattern ? 1 : 0
    // En la sudadera, el interior del cuerpo y de las mangas nunca se ve (lo tapan capucha, puños y bajo): se dibujan
    // solo por fuera. Si no, en los pliegues de la sisa asomaba su cara interior como una cuña oscura.
    // Capucha, bolsillo y canalés siguen por las dos caras (su interior sí se ve, p. ej. dentro de la capucha).
    for (const slot of ['cuerpo', 'mangas'] as const) {
      const m = materials[slotIndex(slot)]
      const side = pattern ? THREE.FrontSide : THREE.DoubleSide
      if (m.side !== side) {
        m.side = side
        m.needsUpdate = true
      }
    }
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
