import * as THREE from 'three'
import type { Design, GarmentSlot, Measurements } from '../../types'
import type { ModelInfo } from '../body'
import { Part } from '../pose'
import { Cloth, type EdgeKind, type Panel } from './Cloth'

/**
 * Canalé de puños y bajo: filas de puntos (cada ~1,4 cm) y rigidez a la flexión. Es un tejido elástico y firme que queda
 * liso; con pocas filas y poca rigidez se arrugaba en medio y se veían rayas.
 */
const RIB_ROWS = 6
const RIB_BEND = 5

/** Holgura en el contorno de pecho según el corte, en cm. */
const EASE = { ajustado: 8, normal: 18, holgado: 32 } as const

export interface HoodieResult {
  cloth: Cloth
  /** Zonas del cuerpo cuyo movimiento sigue cada pieza. */
  follows: Part[][]
  /** Zona de la prenda de cada pieza (para darle su color y material). */
  slots: GarmentSlot[]
  /** Bolsillo canguro en coordenadas del patrón del delantero (cm), si lo lleva. */
  pocket: { panel: number; inside: (x: number, y: number) => boolean; shape: PocketShape } | null
  /** Puntos de cada capa, para que la tela no se atraviese a sí misma (ver relax). */
  layers: {
    /** Capucha lejos del escote (va por encima del cuerpo). */
    hood: number[]
    /** Toda la capucha. */
    hoodAll: number[]
    /** Delantero y espalda. */
    torso: number[]
    /** Mangas lejos de la sisa y cuerpo por debajo de la axila (se tocan con los brazos bajados). */
    sleevesLow: number[]
    torsoLow: number[]
    /** Franjas junto a la sisa (manga y cuerpo, sin los puntos cosidos). */
    sleeveCap: number[]
    torsoArmhole: number[]
    /** Bajo y parte baja del cuerpo: solo chocan con el tronco y las piernas, no con brazos ni manos. */
    bodyOnly: number[]
    /** Capucha bajada: puntos del cuello vuelto que se sujetan a su sitio. */
    collarPins: number[]
  }
  /** Puntos de la capucha donde van los ojales de los cordones (uno a cada lado). */
  cordExits: number[]
  /**
   * Rebordes: bordes libres de tela doblada (abertura de la capucha, final de los puños, bajo) que en una prenda real
   * tienen grosor. Puntos en orden a lo largo del borde, zona de la prenda y radio del reborde (cm).
   */
  rims: { verts: number[]; slot: GarmentSlot; radius: number }[]
}

/** Trapecio del bolsillo canguro en el patrón del delantero (cm): de `y0` a `y0 + h`, semiancho de `w0` abajo a `w1` arriba. */
export interface PocketShape {
  y0: number
  h: number
  w0: number
  w1: number
}

interface Body {
  info: ModelInfo
  /** Puntos del cuerpo en la postura en T (ya con las medidas aplicadas). */
  points: Float32Array
  /** Unidades del modelo por cm real. */
  unit: number
}

/**
 * Patrón de una sudadera con capucha, como el de un taller: delantero, espalda, mangas, puños y bajo de canalé,
 * capucha de dos piezas (o cuello de canalé) y bolsillo canguro. Las piezas se colocan alrededor del maniquí
 * en su postura en T y se cosen entre sí; luego `relax` las asienta sobre el cuerpo.
 */
export function buildHoodie(body: Body, m: Measurements, design: Design): HoodieResult {
  const { info, points, unit } = body
  const s = m.height / 172
  const cloth = new Cloth(unit)
  const follows: Part[][] = []
  const slots: GarmentSlot[] = []
  const add = (panel: Panel, parts: Part[], slot: GarmentSlot) => {
    follows[panel.id] = parts
    slots[panel.id] = slot
    return panel
  }

  // --- Medidas del patrón (cm) ---
  const ease = EASE[design.fit]
  const bodyC = m.chest + ease
  const W = bodyC / 2 // ancho de delantero y espalda
  const L = design.bodyLength - 7 // largo del cuerpo sin el bajo de canalé
  const neckW = 19 * s
  const frontDrop = 8.5 * s
  const backDrop = 2.5 * s
  const slope = 4 * s
  const armhole = 22 * s + ease * 0.25
  const sleeveTop = armhole * 2
  const sleeveEnd = 25 * s + ease * 0.4
  const sleeveLen = design.sleeveLength - 6
  const cuffC = 19 * s
  const ribH = 7 * s
  // El bajo de canalé recoge el cuerpo y se ajusta a la cadera (como mucho la cadera más 10 cm); el cuerpo se
  // ahueca encima. Si fuera casi tan ancho como el cuerpo, colgaría abierto como una falda
  const bandC = Math.min(bodyC * 0.88, m.hips + 10)

  // --- Referencias del cuerpo (unidades del modelo, postura en T) ---
  const topY = info.neckY + 1.5 * unit
  const hemY = topY - L * unit
  const chest = sliceCenter(points, info.chestY, info.shoulderX)
  const cx = 0
  const cz = chest.z
  /** Superficie de la espalda (a la altura del pecho). */
  const backZ = chest.z - chest.depth / 2
  // Elipse del cuerpo de la prenda con el contorno del patrón (más ancha que profunda)
  const ratio = 0.72
  const a = (bodyC * unit) / ellipsePerimeter(1, ratio)
  const b = a * ratio
  // Lo más saliente del cuerpo por delante y por detrás en la zona del bajo (entrepierna, glúteos):
  // la parte baja de la prenda empieza por fuera de ahí
  const low = zExtent(points, hemY - 10 * unit, hemY + 14 * unit, a * 0.7)
  const clampLow = (p: THREE.Vector3) => {
    if (p.y > hemY + 16 * unit) return p
    p.z = p.z >= cz ? Math.max(p.z, low.max + 2 * unit) : Math.min(p.z, low.min - 2 * unit)
    return p
  }
  // Eje de cada brazo (se mide una vez)
  const arms = { [1]: armAxis(points, info, 1), [-1]: armAxis(points, info, -1) }
  const arm = (side: 1 | -1) => arms[side]

  const grid = (length: number, step = 2.2) => Math.max(3, Math.round(length / step) + 1) | 1

  // --- Delantero y espalda ---
  const nu = grid(W)
  const nv = grid(L)
  const yTop = (x: number, drop: number) => {
    const ax = Math.abs(x)
    const neck = ax < neckW / 2 ? drop * Math.sqrt(1 - (ax / (neckW / 2)) ** 2) : 0
    const shoulder = slope * THREE.MathUtils.clamp((ax - neckW / 2) / (W / 2 - neckW / 2), 0, 1)
    return L - neck - shoulder
  }
  // La sisa (borde lateral por encima de la axila) rodea el brazo: media vuelta por delante y media por detrás.
  // Su radio es el de la manga, así manga y cuerpo empiezan ya juntos.
  const sideEdge = L - slope
  const armholeStart = sideEdge - armhole
  const armholeR = (armhole * unit) / Math.PI
  const edgePoint = (side: 1 | -1, towards: 1 | -1, s: number, out: THREE.Vector3) => {
    const c = arm(side).at(side * a)
    const armpitY = c.y - armholeR
    if (s <= armholeStart) return out.set(side * a, hemY + (s / armholeStart) * (armpitY - hemY), cz)
    const phi = ((s - armholeStart) / armhole) * Math.PI
    return out.set(side * a, c.y - Math.cos(phi) * armholeR, c.z + towards * Math.sin(phi) * armholeR)
  }
  const edge = new THREE.Vector3()

  // Fila de la axila: por encima, el borde lateral es la sisa (pespunteada); por debajo, la costura del costado
  const armpitRow = Math.floor(((L - slope - armhole) / (L - slope)) * (nv - 1))
  const torsoPanel = (front: boolean) => {
    const drop = front ? frontDrop : backDrop
    const towards = front ? 1 : -1
    const side = (j: number): EdgeKind => (j > armpitRow ? 'pespunte' : 'plana')
    return cloth.addPanel({
      nu,
      nv,
      edges: { u0: side, u1: side, v0: 'recubierta', v1: 'pespunte' },
      flat: (u, v, out) => {
        const x = (u - 0.5) * W
        out.set(x, v * yTop(x, drop))
      },
      place: (u, v, out) => {
        const x = (u - 0.5) * W
        const y = hemY + v * yTop(x, drop) * unit
        const th = (x / W) * Math.PI
        let z = b * Math.cos(th)
        // Cerca de los hombros delantero y espalda se juntan por encima del cuerpo
        z *= 1 - 0.8 * THREE.MathUtils.smoothstep(y, topY - 14 * unit, topY)
        out.set(cx + a * Math.sin(th), y, cz + towards * z)
        // Cerca del costado, la pieza va hacia la línea de costado y la sisa alrededor del brazo
        const side = x >= 0 ? 1 : -1
        const w = 1 - THREE.MathUtils.smoothstep(W / 2 - Math.abs(x), 0, 10)
        if (w > 0) out.lerp(edgePoint(side, towards, v * sideEdge, edge), w)
        pushOutOfArm(out, info, arm(side), 1.5 * unit, towards)
        if (w < 1) clampLow(out)
      },
    })
  }
  const front = add(torsoPanel(true), [Part.Torso, Part.Neck, Part.ArmL, Part.ArmR], 'cuerpo')
  const back = add(torsoPanel(false), [Part.Torso, Part.Neck, Part.ArmL, Part.ArmR], 'cuerpo')

  // Costados (solo por debajo de la sisa) y hombros
  for (const i of [0, nu - 1]) {
    cloth.sew(front.col(i).slice(0, armpitRow + 1), back.col(i).slice(0, armpitRow + 1))
  }
  const xOf = (i: number) => (i / (nu - 1) - 0.5) * W
  const topF = front.row(nv - 1)
  const topB = back.row(nv - 1)
  // La costura del hombro empieza en el último punto del escote: si empezara en el siguiente, entre los dos quedaría
  // un triangulito de delantero y espalda sin coser a nada (se veía el maniquí por encima del hombro)
  const neckEdgeX = Math.max(...topF.map((_, i) => Math.abs(xOf(i))).filter((x) => x <= neckW / 2 + 0.01))
  const shoulderIdx = (sign: number) => topF.map((_, i) => i).filter((i) => sign * xOf(i) >= neckEdgeX - 0.01)
  for (const sign of [1, -1]) {
    const idx = shoulderIdx(sign)
    cloth.sew(
      idx.map((i) => topF[i]),
      idx.map((i) => topB[i]),
    )
  }

  // --- Mangas y puños ---
  const sleevePanels: { panel: Panel; len: number }[] = []
  const rims: HoodieResult['rims'] = []
  for (const side of [1, -1] as const) {
    const ax = arm(side)
    const edge = side > 0 ? nu - 1 : 0
    const frontEdge = front.col(edge).slice(armpitRow) // de la axila al hombro
    const backEdge = back.col(edge).slice(armpitRow).reverse() // del hombro a la axila
    const start = ax.at(side * a)
    const ns = grid(sleeveTop, 2)
    const nl = grid(sleeveLen)
    const up = new THREE.Vector3(0, 1, 0).addScaledVector(ax.dir, -ax.dir.y).normalize()
    const fwd = new THREE.Vector3().crossVectors(ax.dir, up).multiplyScalar(side)
    const ring = (center: THREE.Vector3, r: number, u: number, out: THREE.Vector3) => {
      const phi = u * Math.PI * 2
      out.copy(center).addScaledVector(up, -Math.cos(phi) * r).addScaledVector(fwd, Math.sin(phi) * r)
    }
    const circ = (v: number) => THREE.MathUtils.lerp(sleeveTop, sleeveEnd, v)
    const sleeve = add(
      cloth.addPanel({
        nu: ns,
        nv: nl,
        flat: (u, v, out) => out.set((u - 0.5) * circ(v), -v * sleeveLen),
        place: (u, v, out) => {
          const c = start.clone().addScaledVector(ax.dir, v * sleeveLen * unit)
          const r = Math.max((circ(v) * unit) / (2 * Math.PI), ax.radius(c.x) + 1.5 * unit)
          ring(c, r, u, out)
        },
      }),
      [side > 0 ? Part.ArmL : Part.ArmR, Part.Torso],
      'mangas',
    )
    sleevePanels.push({ panel: sleeve, len: sleeveLen })
    const top = sleeve.row(0)
    const mid = (ns - 1) / 2
    cloth.sew(frontEdge, top.slice(0, mid + 1))
    cloth.sew(backEdge, top.slice(mid))
    cloth.sew(sleeve.col(0), sleeve.col(ns - 1)) // costura bajo el brazo

    const end = start.clone().addScaledVector(ax.dir, sleeveLen * unit)
    const nc = grid(cuffC, 1.6)
    const cuff = add(
      cloth.addPanel({
        nu: nc,
        nv: RIB_ROWS,
        material: 1,
        bend: RIB_BEND,
        // La costura se marca del lado de la manga; el canalé arranca limpio (si no, sus costillas salían como rayas)
        edges: { v0: 'ninguno', v1: 'doblez', u0: 'ninguno', u1: 'ninguno' },
        flat: (u, v, out) => out.set((u - 0.5) * cuffC, -v * ribH),
        place: (u, v, out) => {
          const c = end.clone().addScaledVector(ax.dir, v * ribH * unit)
          ring(c, Math.max((cuffC * unit) / (2 * Math.PI), ax.radius(c.x) + 1 * unit), u, out)
        },
      }),
      [side > 0 ? Part.ArmL : Part.ArmR, side > 0 ? Part.HandL : Part.HandR],
      'punos',
    )
    cloth.sew(sleeve.row(nl - 1), cuff.row(0))
    cloth.sew(cuff.col(0), cuff.col(nc - 1))
    // Final del puño: canalé doblado (la fila ya da la vuelta entera: su primer y último punto están cosidos)
    rims.push({ verts: cuff.row(RIB_ROWS - 1), slot: 'punos', radius: 0.3 * s })
  }

  // --- Bajo de canalé ---
  const hemLoop = [...front.row(0), ...back.row(0).reverse()]
  // El bajo nace alrededor de la cadera real (centrado en ella y con su forma, más ancho que ella), no en una elipse
  // centrada en el pecho: así, al ser más estrecho que el cuerpo, no empieza metido en los glúteos
  const bandY = hemY - (ribH / 2) * unit
  const hip = zExtent(points, bandY - 3 * unit, bandY + 3 * unit, info.shoulderX * 0.55)
  const hipZ = (hip.min + hip.max) / 2
  const hipRatio = 0.8
  const bandA = (bandC * unit) / ellipsePerimeter(1, hipRatio)
  const bandPoint = (u: number, out: THREE.Vector3) => {
    // Recorre delantero (izquierda → derecha) y luego espalda (derecha → izquierda), como el bajo del cuerpo
    const isFront = u <= 0.5
    const th = isFront ? -Math.PI / 2 + u * 2 * Math.PI : Math.PI / 2 - (u * 2 - 1) * Math.PI
    return out.set(cx + bandA * Math.sin(th), 0, hipZ + (isFront ? 1 : -1) * bandA * hipRatio * Math.cos(th))
  }
  const nb = grid(bandC, 1.6)
  const band = add(
    cloth.addPanel({
      nu: nb,
      nv: RIB_ROWS,
      material: 1,
      bend: RIB_BEND,
      // La costura se marca del lado del cuerpo (con su doble pespunte); el canalé arranca limpio
      edges: { v0: 'doblez', v1: 'ninguno', u0: 'ninguno', u1: 'ninguno' },
      flat: (u, v, out) => out.set(u * bandC, v * ribH),
      place: (u, v, out) => {
        bandPoint(u, out)
        out.y = hemY - (1 - v) * ribH * unit
      },
    }),
    [Part.Torso],
    'bajo',
  )
  cloth.sew(band.row(RIB_ROWS - 1), hemLoop)
  cloth.sew(band.col(0), band.col(nb - 1))
  rims.push({ verts: band.row(0), slot: 'bajo', radius: 0.3 * s })

  // --- Cuello: capucha o canalé ---
  const neckIdx = topF.map((_, i) => i).filter((i) => Math.abs(xOf(i)) <= neckW / 2 + 0.01)
  const center = (nu - 1) / 2
  const halfNeck = (side: 1 | -1) => {
    const f = neckIdx.filter((i) => side * (i - center) >= 0).sort((p, q) => side * (p - q))
    return [...f.map((i) => topF[i]), ...[...f].reverse().map((i) => topB[i])]
  }
  const neckLen = Math.PI * 0.5 * (neckW / 2 + (frontDrop + backDrop) / 2) * 2

  const hoodPanels: Panel[] = []
  const cordExits: number[] = []
  // Cabeza (para la capucha puesta): centro y radio con la holgura de la capucha
  const headY = info.neckY + (info.height - info.neckY) * 0.52
  const headSlice = sliceCenter(points, headY, info.shoulderX * 0.5)
  // Holgura de una capucha de sudadera: suelta a los lados y detrás, pero apoyada en lo alto de la cabeza
  // (el centro baja lo mismo que crece el radio; si no, la capucha no tiene dónde apoyarse y se cae hacia atrás)
  const hoodEase = 4.5 * s * unit
  const head = { y: headY - (hoodEase - 1.5 * s * unit), z: headSlice.z, r: (info.height - info.neckY) * 0.42 + hoodEase }
  if (design.hood) {
    const hoodH = 36 * s
    const hoodD = 29 * s
    // Malla más fina que la del cuerpo: la capucha se dobla mucho (junto a la cara) y con puntos cada 2 cm se veía facetada
    const nh = grid(neckLen / 2, 1.4)
    const nt = grid(hoodH, 1.6)
    const width = (t: number) =>
      THREE.MathUtils.lerp(neckLen / 2, hoodD, THREE.MathUtils.smoothstep(t, 0, 0.35)) *
      (1 - 0.3 * THREE.MathUtils.smoothstep(t, 0.6, 1))
    const hoods = ([1, -1] as const).map((side) => {
      const neck = halfNeck(side)
      const base = (sParam: number) => {
        const k = sParam * (neck.length - 1)
        const i = Math.min(Math.floor(k), neck.length - 2)
        const f = k - i
        const p = (n: number) => new THREE.Vector3(cloth.pos[n * 3], cloth.pos[n * 3 + 1], cloth.pos[n * 3 + 2])
        return p(neck[i]).lerp(p(neck[i + 1]), f)
      }
      const panel = add(
        cloth.addPanel({
          nu: nh,
          nv: nt,
          // Abertura con el canal del cordón; costura central y de arriba pespunteadas
          edges: { u0: 'jareta', u1: 'pespunte', v1: 'pespunte' },
          // Esquina de la coronilla (donde se juntan la costura de la nuca y la de arriba) redondeada, como en un patrón
          // de verdad: si fuera en ángulo recto, la capucha acabaría en pico
          flat: (u, v, out) => {
            const c = THREE.MathUtils.smoothstep(u, 0.55, 1) * THREE.MathUtils.smoothstep(v, 0.55, 1)
            out.set(side * (u * width(v) - c * 5 * s), v * hoodH - c * 5 * s)
          },
          place: (u, v, out) => {
            const p = base(u)
            if (design.hoodUp) {
              // Capucha puesta: cada mitad es un gajo alrededor de la cabeza. La costura central y la de arriba
              // van por el centro (x = 0) de la nuca a la frente; la abertura enmarca la cara.
              // Ángulo en el plano de perfil (0 = delante, 90° = arriba, 180° = detrás) de las cuatro esquinas del gajo
              const g = THREE.MathUtils.degToRad(
                (1 - u) * (1 - v) * -40 + u * (1 - v) * 215 + (1 - u) * v * 60 + u * v * 100,
              )
              // Separación del centro: 0 en las costuras; en el cuello y la abertura sale hacia los lados
              const lat = (Math.PI / 2) * Math.min(1, (1 - v) * Math.sin(Math.PI * u) + (1 - u) * 0.72 * Math.sin(Math.PI * v))
              const r = head.r
              const onHead = new THREE.Vector3(
                side * r * Math.sin(lat),
                head.y + r * Math.cos(lat) * Math.sin(g),
                head.z + r * Math.cos(lat) * Math.cos(g),
              )
              // Junto al cuello parte de la línea del escote
              return out.copy(p).lerp(onHead, THREE.MathUtils.smoothstep(v, 0, 0.3))
            }
            // Capucha bajada, como cae de verdad: la abertura queda alrededor del cuello como un cuello vuelto
            // (por eso los ojales y los cordones siguen delante) y el resto de la capucha cae sobre la parte alta
            // de la espalda y se cierra hacia el centro, donde están la costura central y la de arriba (x = 0).
            const backward = THREE.MathUtils.smoothstep(u, 0.1, 0.9) // 0 junto a la abertura, 1 en la costura central
            // Separación del centro: la del escote, y junto a la abertura rodea el cuello por los lados
            const lateral = Math.abs(p.x) * (1 - v) + (1 - u) * Math.sin(Math.PI * v) * (neckW / 2 + 4 * s) * unit
            // La parte de la abertura sube un poco (cuello vuelto); la de atrás cae por la espalda
            const rise = (1 - backward) * 3 * s * unit * Math.sin(Math.min(v / 0.4, 1) * Math.PI * 0.5)
            const drop = v * hoodH * (0.1 + 0.6 * backward) * unit
            // De delante hacia atrás: todo acaba sobre la espalda, un poco separado de ella
            const z = THREE.MathUtils.lerp(p.z, backZ - 3.5 * s * unit, THREE.MathUtils.smoothstep(v, 0, 0.7))
            out.set(side * lateral, p.y + rise - drop, z)
          },
        }),
        // Puesta, la capucha se mueve con la cabeza
        design.hoodUp ? [Part.Neck, Part.Head] : [Part.Torso, Part.Neck],
        'capucha',
      )
      cloth.sew(panel.row(0), neck)
      hoodPanels.push(panel)
      // Abertura: tela doblada sobre el canal del cordón, con más cuerpo que un simple borde
      rims.push({ verts: panel.col(0), slot: 'capucha', radius: 0.45 * s })
      // Ojal del cordón: en el canal (a 2,4 cm del borde de la abertura) y a unos 7 cm del escote,
      // a cada lado de la barbilla
      if (design.cords !== false) {
        const j = Math.min(nt - 1, Math.max(1, Math.round((7 * s) / (hoodH / (nt - 1)))))
        const i = Math.min(nh - 2, Math.max(1, Math.round(((2.4 * s) / width(j / (nt - 1))) * (nh - 1))))
        cordExits.push(panel.index(i, j))
      }
      return panel
    })
    const [left, right] = hoods
    cloth.sew(left.col(nh - 1), right.col(nh - 1)) // costura de la nuca
    cloth.sew(left.row(nt - 1), right.row(nt - 1)) // costura de arriba
  } else {
    const loop = [...halfNeck(1).slice(0, -1), ...halfNeck(-1).reverse().slice(0, -1)]
    const nn = grid(neckLen, 1.6)
    const pts = loop.map((n) => new THREE.Vector3(cloth.pos[n * 3], cloth.pos[n * 3 + 1], cloth.pos[n * 3 + 2]))
    const collar = add(
      cloth.addPanel({
        nu: nn,
        nv: 3,
        material: 1,
        bend: 2,
        edges: { v1: 'doblez' },
        flat: (u, v, out) => out.set(u * neckLen * 0.9, v * 3),
        place: (u, v, out) => {
          const k = u * pts.length
          const i = Math.floor(k) % pts.length
          const p = pts[i].clone().lerp(pts[(i + 1) % pts.length], k - Math.floor(k))
          out.set(p.x * 0.95, p.y + v * 3 * unit, cz + (p.z - cz) * 0.95)
        },
      }),
      [Part.Torso, Part.Neck],
      'cuello',
    )
    cloth.sew(collar.row(0), [...loop, loop[0]])
    cloth.sew(collar.col(0), collar.col(nn - 1))
    rims.push({ verts: collar.row(2), slot: 'cuello', radius: 0.3 * s })
  }

  // --- Bolsillo canguro (trapecio en el delantero, con las aberturas inclinadas a los lados) ---
  const pw = Math.min(38 * s, W * 0.62)
  const ph = 21 * s
  // Empieza unos cm por encima del bajo: justo encima del canalé la tela se frunce y el bolsillo se levantaría
  const py = 3.5 * s
  const pocket = design.pocket
    ? {
        panel: front.id,
        inside: (x: number, y: number) => {
          if (y < py || y > py + ph) return false
          const t = (y - py) / ph
          return Math.abs(x) < THREE.MathUtils.lerp(pw / 2, pw * 0.34, t)
        },
        shape: { y0: py, h: ph, w0: pw / 2, w1: pw * 0.34 },
      }
    : null

  // --- Capas: qué piezas no se pueden atravesar entre sí ---
  const all = (p: Panel) => Array.from({ length: p.nu * p.nv }, (_, k) => p.index(k % p.nu, Math.floor(k / p.nu)))
  const torsoAll = [...all(front), ...all(back)]
  // Por debajo de la axila (con un margen) el cuerpo roza con las mangas de los brazos bajados
  const torsoLow = torsoAll.filter((_, k) => Math.floor((k % (nu * nv)) / nu) < armpitRow - 1)
  // De la manga, lo que queda lejos de la sisa (cerca de ella están cosidas al cuerpo)
  const sleevesLow = sleevePanels.flatMap(({ panel, len }) =>
    all(panel).filter((_, k) => (Math.floor(k / panel.nu) / (panel.nv - 1)) * len > 5 * s),
  )
  // Junto a la sisa: la franja de la manga (sin la fila cosida) y la del cuerpo (sin la columna cosida), que si no
  // se montaban una sobre otra formando una cuña en la parte delantera del brazo
  const sleeveCap = sleevePanels.flatMap(({ panel, len }) =>
    all(panel).filter((_, k) => {
      const row = Math.floor(k / panel.nu)
      return row >= 1 && (row / (panel.nv - 1)) * len <= 6 * s
    }),
  )
  const torsoArmhole = torsoAll.filter((_, k) => {
    const kk = k % (nu * nv)
    const i = kk % nu
    const j = Math.floor(kk / nu)
    const fromSide = Math.min(i, nu - 1 - i)
    return j >= armpitRow - 1 && fromSide >= 1 && fromSide <= 3
  })
  // De la capucha, lo que queda lejos del escote (junto a él está cosida al cuerpo y no se puede separar)
  const hoodH = 36 * s
  const hoodFree = hoodPanels.flatMap((p) => all(p).filter((_, k) => (Math.floor(k / p.nu) / (p.nv - 1)) * hoodH > 8 * s))
  // El bajo y la parte baja del cuerpo están a la altura de las manos: solo chocan con el tronco y las piernas
  // (si chocaran con la mano que cuelga al lado, el canalé se retorcería)
  const hemRows = Math.ceil((10 * s) / (L / (nv - 1)))
  const bodyOnly = [...all(band), ...torsoAll.filter((_, k) => Math.floor((k % (nu * nv)) / nu) < hemRows)]
  // Capucha bajada: la zona de la abertura junto al cuello (cuello vuelto) se sujeta con suavidad a su sitio
  const collarPins = design.hoodUp
    ? []
    : hoodPanels.flatMap((p) => all(p).filter((_, k) => (k % p.nu) / (p.nu - 1) < 0.35 && Math.floor(k / p.nu) / (p.nv - 1) < 0.45))
  const layers = { hood: hoodFree, hoodAll: hoodPanels.flatMap(all), torso: torsoAll, sleevesLow, torsoLow, sleeveCap, torsoArmhole, bodyOnly, collarPins }

  return { cloth, follows, slots, pocket, layers, cordExits, rims }
}

/** Perímetro aproximado de una elipse (Ramanujan). */
function ellipsePerimeter(a: number, b: number) {
  return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)))
}

/** Z mínima y máxima del cuerpo entre dos alturas (cerca del centro, |x| < maxX). */
function zExtent(points: Float32Array, y0: number, y1: number, maxX: number) {
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < points.length; i += 3) {
    if (points[i + 1] < y0 || points[i + 1] > y1 || Math.abs(points[i]) > maxX) continue
    min = Math.min(min, points[i + 2])
    max = Math.max(max, points[i + 2])
  }
  return { min, max }
}

/** Centro (en Z) del cuerpo a una altura. */
function sliceCenter(points: Float32Array, y: number, maxX: number) {
  let minZ = Infinity
  let maxZ = -Infinity
  for (let i = 0; i < points.length; i += 3) {
    if (Math.abs(points[i + 1] - y) < 1 && Math.abs(points[i]) < maxX) {
      minZ = Math.min(minZ, points[i + 2])
      maxZ = Math.max(maxZ, points[i + 2])
    }
  }
  return { z: (minZ + maxZ) / 2, depth: maxZ - minZ }
}

interface ArmAxis {
  dir: THREE.Vector3
  /** Punto del eje del brazo a una X dada. */
  at: (x: number) => THREE.Vector3
  /** Radio del brazo a una X dada. */
  radius: (x: number) => number
}

/** Eje y grosor del brazo en la postura en T, medidos sobre la malla. */
function armAxis(points: Float32Array, info: ModelInfo, side: 1 | -1): ArmAxis {
  const ring = (x0: number) => {
    let sy = 0
    let sz = 0
    let n = 0
    const pts: [number, number][] = []
    for (let i = 0; i < points.length; i += 3) {
      if (Math.abs(points[i] - x0) < 1 && points[i + 1] > info.chestY - 4) {
        sy += points[i + 1]
        sz += points[i + 2]
        n++
        pts.push([points[i + 1], points[i + 2]])
      }
    }
    const y = sy / n
    const z = sz / n
    return { p: new THREE.Vector3(x0, y, z), r: Math.max(...pts.map(([py, pz]) => Math.hypot(py - y, pz - z))) }
  }
  const near = ring(side * (info.shoulderX + 5))
  const far = ring(side * (info.shoulderX + 35))
  const dir = far.p.clone().sub(near.p).normalize()
  const t = (x: number) => (x - near.p.x) / (far.p.x - near.p.x)
  return {
    dir,
    at: (x) => near.p.clone().lerp(far.p, t(x)),
    radius: (x) => THREE.MathUtils.lerp(near.r, far.r, THREE.MathUtils.clamp(t(x), 0, 1.3)),
  }
}

/**
 * Si un punto inicial cae dentro del brazo (postura en T), lo saca hacia fuera del brazo:
 * hacia delante para el delantero (`towards` = 1) y hacia atrás para la espalda (-1).
 */
function pushOutOfArm(p: THREE.Vector3, info: ModelInfo, ax: ArmAxis, margin: number, towards: 1 | -1) {
  if (Math.abs(p.x) < info.shoulderX * 0.85 || p.y < info.chestY - 6) return
  const c = ax.at(p.x)
  const r = ax.radius(p.x) + margin
  const dy = p.y - c.y
  let dz = p.z - c.z
  if (Math.hypot(dy, dz) >= r) return
  // Lado del brazo que le toca a esta pieza
  if (dz * towards < r * 0.15) dz = towards * r * 0.15
  const d = Math.hypot(dy, dz)
  p.y = c.y + (dy / d) * r
  p.z = c.z + (dz / d) * r
}
