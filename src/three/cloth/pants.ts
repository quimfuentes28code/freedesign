import * as THREE from 'three'
import type { Design, GarmentSlot, Measurements } from '../../types'
import type { ModelInfo } from '../body'
import { Part } from '../pose'
import { Cloth, type Panel } from './Cloth'
import { rectShape, type Patch, type Tab } from './patches'

/**
 * Patrón de un pantalón, como el de un taller: delantero y trasero de cada pierna (cuatro piezas), cosidos por el
 * costado, la entrepierna y el tiro (delantero y trasero), con su cinturilla arriba y el bajo (recto, vuelto o con puño
 * de canalé). La tela de la pernera es algo más larga que la pierna (en los largos y anchos): al asentarse cae y se
 * apila sobre las zapatillas, como un pantalón de verdad.
 *
 * Todo se arma en la postura en T del maniquí (piernas rectas), en unidades del modelo; el patrón plano va en cm.
 */

/** Holgura (cm) en el muslo y la cadera, y contorno del bajo (cm), según el corte. */
const CUT = {
  slim: { thigh: 6, seat: 4, hem: 36, stack: 1.5 },
  regular: { thigh: 12, seat: 8, hem: 44, stack: 3 },
  ancho: { thigh: 22, seat: 12, hem: 58, stack: 7 },
  baggy: { thigh: 32, seat: 18, hem: 66, stack: 9 },
} as const

export interface PantsResult {
  cloth: Cloth
  follows: Part[][]
  slots: GarmentSlot[]
  /** Puntos de cada pernera (para que no se atraviesen entre sí al caer). */
  legs: [number[], number[]]
  /** Puntos sujetos a su sitio: el borde de arriba cuando va tapado (la cinturilla escondida lo sujetaría). */
  pins: number[]
  rims: { verts: number[]; slot: GarmentSlot; radius: number }[]
  /** Bolsillos, banda lateral y trabillas; ojales del cordón de la cintura y su botón. */
  patches: Patch[]
  tabs: Tab[]
  cordExits: number[]
  cuffButtons: number[]
}

interface Body {
  info: ModelInfo
  points: Float32Array
  unit: number
}

/** Corte de una pierna (o del cuerpo, con side 0) a una altura: centro y semiejes en X y Z. */
function slice(points: Float32Array, y: number, side: 1 | -1 | 0, band = 1.2) {
  let x0 = Infinity
  let x1 = -Infinity
  let z0 = Infinity
  let z1 = -Infinity
  for (let i = 0; i < points.length; i += 3) {
    if (Math.abs(points[i + 1] - y) > band) continue
    const x = points[i]
    if (side !== 0 && side * x < 0.5) continue
    x0 = Math.min(x0, x)
    x1 = Math.max(x1, x)
    z0 = Math.min(z0, points[i + 2])
    z1 = Math.max(z1, points[i + 2])
  }
  if (!Number.isFinite(x0)) return null
  return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, rx: (x1 - x0) / 2, rz: (z1 - z0) / 2 }
}

const ellipsePerimeter = (a: number, b: number) => Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)))

export function buildPants(body: Body, m: Measurements, design: Design): PantsResult {
  const { info, points, unit } = body
  const s = m.height / 172
  const cloth = new Cloth(unit)
  const follows: Part[][] = []
  const slots: GarmentSlot[] = []
  const rims: PantsResult['rims'] = []
  const add = (panel: Panel, parts: Part[], slot: GarmentSlot) => {
    follows[panel.id] = parts
    slots[panel.id] = slot
    return panel
  }
  const shape = design.pants ?? { leg: 'regular', cuff: 'recto', waist: 'elastica' }
  const cut = CUT[shape.leg]
  const jogger = shape.cuff === 'puno'
  const grid = (length: number, step = 2.2) => Math.max(3, Math.round(length / step) + 1) | 1

  // --- Alturas (unidades del modelo, postura en T) ---
  const ground = 0
  const crotchY = info.crotchY - (shape.leg === 'baggy' ? 4 * unit : 0)
  const waistY = info.waistY + 2 * unit
  // Debajo de otra prenda, lo que esta tapa no se construye (su tela se asienta contra el cuerpo, no contra esta):
  // empieza 14 cm por encima de su borde, bien escondido (en 3D la prenda de arriba queda algo más corta que su largo)
  // (Con la prenda de arriba asentada encima de este pantalón, ya no hace falta: se construye entero, con su cinturilla;
  // se deja para cuando la de arriba no es de patrón)
  const covered = design.coveredBy && !design.overPattern ? info.neckY + 1.5 * unit - (design.coveredBy - 14) * unit : Infinity
  const topY = Math.min(waistY, covered)
  const hasBand = topY >= waistY - 0.5 * unit
  // Bajo: casi en el suelo (los largos), en el tobillo (tobillero y jogger) o donde diga el largo (cortos)
  const legFrac = design.legLength ?? 1
  const ankle = info.ankleY
  const hemY =
    legFrac < 0.9
      ? crotchY - (crotchY - ankle) * legFrac
      : jogger
        ? ankle + 1 * unit
        : legFrac < 0.97
          ? ankle + 3 * unit
          : ground + 1.5 * unit
  const long = legFrac >= 0.97 && !jogger
  // Tela de más que se apila sobre la zapatilla (solo en los largos)
  const stack = long ? cut.stack * s : jogger ? 3 * s : 0
  const cuffH = jogger ? 7 * s : 0

  // --- Contornos (cm) ---
  const thigh = slice(points, crotchY - 4 * unit, 1)
  const thighC = thigh ? ellipsePerimeter(thigh.rx, thigh.rz) / unit : 58 * s
  const hips = slice(points, info.hipsY, 0)
  const waist = slice(points, info.waistY, 0)
  const seatC = m.hips + cut.seat
  const waistC = (m.waist ?? m.hips * 0.8) + 4
  const legTop = thighC + cut.thigh
  const kneeC = THREE.MathUtils.lerp(legTop, jogger ? 30 * s : cut.hem * s, 0.45)
  const hemC = jogger ? 30 * s : cut.hem * s
  // Borde de la prenda de arriba (unos 14 cm por debajo de `covered`): por dentro de ella, el pantalón va ceñido
  const edge = covered - 14 * unit
  const tuckAt = (y: number, below: number, above: number) => (Number.isFinite(covered) ? THREE.MathUtils.smoothstep(y, edge - below * unit, edge + above * unit) : 0)
  /** Contorno de la pernera según la altura (y en unidades del modelo). */
  const legC = (y: number) => {
    const t = THREE.MathUtils.clamp((crotchY - y) / Math.max(1, crotchY - hemY), 0, 1)
    // Del muslo a la rodilla y de la rodilla al bajo (el ancho cae casi recto desde la rodilla)
    const c = t < 0.45 ? THREE.MathUtils.lerp(legTop, kneeC, t / 0.45) : THREE.MathUtils.lerp(kneeC, hemC, (t - 0.45) / 0.55)
    // Por dentro de la prenda de arriba, ceñida al muslo (justo por debajo de su borde recupera todo el ancho)
    return THREE.MathUtils.lerp(c, Math.min(c, thighC + 3), tuckAt(y, 2, 4))
  }
  // Por encima de la entrepierna, el pantalón rodea la cadera; arriba del todo, la cintura (y, si va tapado, ceñido)
  const seatAt = (y: number) => {
    const t = THREE.MathUtils.clamp((y - crotchY) / Math.max(1, waistY - crotchY), 0, 1)
    const c = THREE.MathUtils.lerp(seatC, waistC, THREE.MathUtils.smoothstep(t, 0.45, 1))
    // Por dentro de la prenda de arriba, ceñido para no atravesarla
    // (desde un poco por debajo de su borde hacia arriba)
    const tuck = tuckAt(y, 4, 2)
    return THREE.MathUtils.lerp(c, Math.min(c, m.hips + 1), tuck)
  }

  // Centro de cada pierna a una altura (se mide cada pocos cm y se interpola)
  const legCenters = (side: 1 | -1) => {
    const ys: number[] = []
    const cs: { x: number; z: number; r: number }[] = []
    for (let y = crotchY - 2 * unit; y > ankle - 4 * unit; y -= 4 * unit) {
      const c = slice(points, y, side, 1.5)
      if (!c) continue
      ys.push(y)
      cs.push({ x: c.x, z: c.z, r: Math.max(c.rx, c.rz) })
    }
    return (y: number) => {
      if (!ys.length) return { x: side * 10 * unit, z: 0, r: 6 * unit }
      if (y >= ys[0]) return cs[0]
      for (let k = 1; k < ys.length; k++) {
        if (y >= ys[k]) {
          const f = (ys[k - 1] - y) / (ys[k - 1] - ys[k])
          return { x: THREE.MathUtils.lerp(cs[k - 1].x, cs[k].x, f), z: THREE.MathUtils.lerp(cs[k - 1].z, cs[k].z, f), r: THREE.MathUtils.lerp(cs[k - 1].r, cs[k].r, f) }
        }
      }
      return cs[cs.length - 1]
    }
  }
  const centers = { [1]: legCenters(1), [-1]: legCenters(-1) }
  const seatZ = hips ? hips.z : 0
  const seatRatio = hips ? THREE.MathUtils.clamp(hips.rz / hips.rx, 0.55, 0.9) : 0.75
  const waistZ = waist ? waist.z : seatZ

  // --- Patrón: largo de la pieza (cm) y su altura en el cuerpo ---
  // Las filas de la pieza van del bajo (v = 0) a la cintura (v = 1). Los primeros `2 · stack` cm de tela se colocan en
  // `stack` cm de pierna: esa tela de más es la que cae y se arruga sobre la zapatilla
  const placedLen = (topY - hemY) / unit // cm de cuerpo que cubre
  const flatLen = placedLen + stack
  const placeY = (f: number) => {
    const d = stack > 0 && f < 2 * stack ? f * 0.5 : f - stack
    return hemY + d * unit
  }
  const crotchF = (crotchY - hemY) / unit + stack // altura (cm de patrón) de la entrepierna
  // Ancho de cada pieza (cm) a una altura del patrón: media pernera por debajo de la entrepierna; un cuarto de cadera
  // arriba, con la curva del tiro entre las dos
  const widthAt = (f: number) => {
    const y = placeY(f)
    if (f <= crotchF) return legC(y) / 2
    const t = THREE.MathUtils.smoothstep(f, crotchF, crotchF + 10 * s)
    return THREE.MathUtils.lerp(legC(crotchY) / 2, seatAt(y) / 4, t)
  }

  const nv = grid(flatLen, 2)
  const crotchRow = Math.round((crotchF / flatLen) * (nv - 1))
  const patches: Patch[] = []
  const tabs: Tab[] = []
  const cordExits: number[] = []
  const buttons: number[] = []
  const nu = grid(Math.max(legTop / 2, seatC / 4), 2.2)

  /** Punto de una pieza en el cuerpo: alrededor de la pierna (abajo) o de la cadera (arriba). */
  const place = (side: 1 | -1, front: boolean, u: number, f: number, out: THREE.Vector3) => {
    const y = placeY(f)
    const fz = front ? 1 : -1
    // Alrededor de la pierna: del costado (u = 0) a la entrepierna (u = 1), por delante o por detrás
    const c = centers[side](Math.min(y, crotchY - 1 * unit))
    const r = Math.max((legC(y) * unit) / (2 * Math.PI), c.r + 1.2 * unit)
    const phi = u * Math.PI
    // Tela que se apila abajo: unas ondas suaves para que los pliegues empiecen sin dibujar un patrón
    const fold = stack > 0 && f < 2 * stack ? Math.sin(phi * 5 + side + (front ? 0 : 1.7)) * 0.6 * unit * (1 - f / (2 * stack)) : 0
    const legP = new THREE.Vector3(c.x + side * (r + fold) * Math.cos(phi), y, c.z + fz * (r + fold) * Math.sin(phi))
    // Alrededor de la cadera: del costado (u = 0) al centro (u = 1)
    const C = seatAt(y)
    const a = (C * unit) / ellipsePerimeter(1, seatRatio)
    const zc = THREE.MathUtils.lerp(seatZ, waistZ, THREE.MathUtils.clamp((y - info.hipsY) / Math.max(1, info.waistY - info.hipsY), 0, 1))
    const th = u * (Math.PI / 2)
    const seatP = new THREE.Vector3(side * a * Math.cos(th), y, zc + fz * a * seatRatio * Math.sin(th))
    const t = THREE.MathUtils.smoothstep(f, crotchF - 2 * s, crotchF + 9 * s)
    return out.copy(legP).lerp(seatP, t)
  }

  const panels: Record<string, Panel> = {}
  for (const side of [1, -1] as const) {
    for (const front of [true, false]) {
      const legPart = side > 0 ? Part.LegL : Part.LegR
      const p = add(
        cloth.addPanel({
          nu,
          nv,
          // Costado con pespunte; entrepierna y tiro, costura plana (con trabillas, la bragueta en el delantero izquierdo);
          // bajo recubierto (o canalé si lleva puño)
          edges: {
            u0: 'pespunte',
            u1: side > 0 && front && shape.waist === 'trabillas' ? (j) => (j > crotchRow + 1 ? 'bragueta' : 'plana') : 'plana',
            v0: jogger ? 'recubierta' : 'doblez',
            v1: hasBand ? 'recubierta' : 'ninguno',
          },
          flat: (u, v, out) => {
            const f = v * flatLen
            // La pieza de un lado es la imagen en espejo de la del otro (como se cortan en el taller)
            out.set(side * (front ? 1 : -1) * u * widthAt(f), f)
          },
          place: (u, v, out) => place(side, front, u, v * flatLen, out),
        }),
        [legPart, Part.Torso, side > 0 ? Part.FootL : Part.FootR],
        'cuerpo',
      )
      panels[`${side}${front}`] = p
    }
  }
  const FL = panels['1true']
  const BL = panels['1false']
  const FR = panels['-1true']
  const BR = panels['-1false']

  // Costados (de arriba abajo) y entrepiernas (por debajo de la entrepierna)
  cloth.sew(FL.col(0), BL.col(0))
  cloth.sew(FR.col(0), BR.col(0))
  cloth.sew(FL.col(nu - 1).slice(0, crotchRow + 1), BL.col(nu - 1).slice(0, crotchRow + 1))
  cloth.sew(FR.col(nu - 1).slice(0, crotchRow + 1), BR.col(nu - 1).slice(0, crotchRow + 1))
  // Tiro: delantero con delantero y trasero con trasero, de la entrepierna a la cintura
  cloth.sew(FL.col(nu - 1).slice(crotchRow), FR.col(nu - 1).slice(crotchRow))
  cloth.sew(BL.col(nu - 1).slice(crotchRow), BR.col(nu - 1).slice(crotchRow))

  // --- Cinturilla (elástica o de la misma tela, con su pespunte) ---
  const topLoop = [...FL.row(nv - 1), ...FR.row(nv - 1).reverse(), ...BR.row(nv - 1), ...BL.row(nv - 1).reverse()]
  // Sin cinturilla (va tapado por la prenda de arriba), nada lo sujetaría a la cintura y se caería
  const pins = hasBand ? [] : [0, 1, 2].flatMap((d) => [FL, FR, BL, BR].flatMap((P) => P.row(nv - 1 - d)))
  if (hasBand) {
    const bandH = 4 * s
    const elastic = shape.waist === 'elastica'
    const bandC = elastic ? waistC - 2 : waistC
    const nb = grid(bandC, 1.6)
    const nr = 4
    const a = (bandC * unit) / ellipsePerimeter(1, seatRatio)
    const band = add(
      cloth.addPanel({
        nu: nb,
        nv: nr,
        material: elastic ? 1 : 0,
        bend: 4,
        edges: { v0: 'recubierta', v1: 'doblez', u0: 'ninguno', u1: 'ninguno' },
        flat: (u, v, out) => out.set(u * bandC, v * bandH),
        place: (u, v, out) => {
          // Recorre como el borde de arriba: del costado izquierdo, por delante, al derecho, y por detrás de vuelta
          const th = u * 2 * Math.PI
          out.set(a * Math.cos(th), topY + v * bandH * unit, waistZ + a * seatRatio * Math.sin(th))
        },
      }),
      [Part.Torso],
      'bajo',
    )
    // u = 0,25 es el centro de delante y 0,75 el de detrás
    const at = (u: number, row: number) => band.index(Math.round((((u % 1) + 1) % 1) * (nb - 1)), row)
    if (shape.waist === 'trabillas') {
      // Trabillas repartidas por la cintura (dos delante, dos a los lados de detrás y una en el centro) y el botón
      for (const u of [0.25 - 0.13, 0.25 + 0.13, 0.04, 0.46, 0.75 - 0.1, 0.75, 0.75 + 0.1]) tabs.push({ vertex: at(u, 1), size: [1.1, bandH / s + 1.2, 0.3], slot: 'bajo' })
      // El botón, en el centro de delante (el punto de la cinturilla más centrado por delante)
      let best = at(0.25, 2)
      for (let i = 0; i < nb; i++) {
        const v = band.index(i, 2)
        if (cloth.pos[v * 3 + 2] > waistZ && Math.abs(cloth.pos[v * 3]) < Math.abs(cloth.pos[best * 3])) best = v
      }
      buttons.push(best)
    } else if (shape.cord) {
      // Cordón: sale por dos ojales a cada lado del centro de delante
      const d = 1.6 / bandC
      cordExits.push(at(0.25 - d, 1), at(0.25 + d, 1))
    }
    cloth.sew(band.row(0), topLoop)
    cloth.sew(band.col(0), band.col(nb - 1))
    rims.push({ verts: band.row(nr - 1), slot: 'cuerpo', radius: 0.3 * s })
  }

  // --- Bajo: puño de canalé (jogger) o el borde de la pernera, doblado (más grueso si va vuelto) ---
  const legsVerts: [number[], number[]] = [[], []]
  for (const [k, side] of [
    [0, 1],
    [1, -1],
  ] as const) {
    const F = side > 0 ? FL : FR
    const B = side > 0 ? BL : BR
    const hemLoop = [...F.row(0), ...B.row(0).reverse()]
    if (jogger) {
      const cuffC = 24 * s
      const nc = grid(cuffC, 1.6)
      const c = centers[side](ankle)
      const r = Math.max((cuffC * unit) / (2 * Math.PI), c.r + 0.8 * unit)
      const cuff = add(
        cloth.addPanel({
          nu: nc,
          nv: 5,
          material: 1,
          bend: 5,
          edges: { v0: 'doblez', v1: 'ninguno', u0: 'ninguno', u1: 'ninguno' },
          flat: (u, v, out) => out.set(u * cuffC, v * cuffH),
          place: (u, v, out) => {
            // Como el bajo de la pernera: costado → delante → entrepierna → detrás → costado
            const phi = u * 2 * Math.PI
            out.set(c.x + side * r * Math.cos(phi), hemY - (1 - v) * cuffH * unit, c.z + r * Math.sin(phi))
          },
        }),
        [side > 0 ? Part.LegL : Part.LegR, side > 0 ? Part.FootL : Part.FootR],
        'punos',
      )
      cloth.sew(cuff.row(4), hemLoop)
      cloth.sew(cuff.col(0), cuff.col(nc - 1))
      rims.push({ verts: cuff.row(0), slot: 'punos', radius: 0.3 * s })
      legsVerts[k].push(...Array.from({ length: nc * 5 }, (_, q) => cuff.index(q % nc, Math.floor(q / nc))))
    } else {
      rims.push({ verts: hemLoop, slot: 'cuerpo', radius: (shape.cuff === 'vuelto' ? 0.9 : 0.3) * s })
    }
    // Puntos de la pernera por debajo de la entrepierna (para separar una pierna de la otra)
    for (const P of [F, B]) for (let j = 0; j < crotchRow - 1; j++) legsVerts[k].push(...P.row(j))
  }

  // --- Bolsillos y banda (sobre el patrón plano de cada pieza: x desde el costado, y desde el bajo) ---
  // Delanteros: x crece hacia el centro en el izquierdo y decrece en el derecho; traseros al revés
  const T = flatLen
  const sgn = (side: 1 | -1, front: boolean) => side * (front ? 1 : -1)
  for (const side of [1, -1] as const) {
    for (const front of [true, false]) {
      const panel = panels[`${side}${front}`].id
      const k = sgn(side, front)
      if (front && shape.sidePockets && hasBand)
        // Abertura inclinada junto al costado: la vista del bolsillo, rasa, con el pespunte en su canto
        patches.push({ panel, nu: 4, nv: 8, shape: (u, v) => [k * u * THREE.MathUtils.lerp(2.2, 6.5, v), T - 19 * s + v * 18 * s], edges: ['ninguno', 'abertura', 'ninguno', 'ninguno'], lift: 0.06, slot: 'bolsillo' })
      if (!front && shape.backPockets && hasBand) {
        const w = widthAt(T - 12 * s)
        patches.push({
          panel,
          nu: 6,
          nv: 7,
          shape: rectShape(k * w * 0.5, T - 15 * s, 13 * s, 14 * s, 0, shape.waist === 'trabillas' ? 1.5 * s : 0),
          edges: ['pespunte', 'pespunte', 'pespunte', 'jareta'],
          lift: 0.18,
          slot: 'bolsillo',
        })
      }
      // Cargo: en el lado del muslo, con su solapa
      if (front && shape.cargo && crotchF - 26 * s > 2 * stack + 4) {
        const cy = crotchF - 14 * s
        patches.push({ panel, nu: 7, nv: 8, shape: rectShape(k * 11 * s, cy, 15 * s, 17 * s), edges: ['pespunte', 'pespunte', 'pespunte', 'jareta'], lift: 0.3, slot: 'bolsillo' })
        patches.push({ panel, nu: 7, nv: 3, shape: rectShape(k * 11 * s, cy + 9.5 * s, 16 * s, 6 * s), edges: ['pespunte', 'pespunte', 'pespunte', 'ninguno'], lift: 0.6, slot: 'bolsillo' })
      }
      // Banda lateral: una tira a cada lado de la costura del costado, del bajo a la cintura
      if (shape.stripe)
        patches.push({ panel, nu: 2, nv: grid(T, 3), shape: (u, v) => [k * u * 1.7 * s, 0.6 + v * (T - 1.2)], edges: ['ninguno', 'pespunte', 'ninguno', 'ninguno'], lift: 0.14, slot: 'banda' })
    }
  }

  return { cloth, follows, slots, legs: legsVerts, pins, rims, patches, tabs, cordExits, cuffButtons: buttons }
}
