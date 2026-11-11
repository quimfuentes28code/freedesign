/**
 * Patronaje: piezas del patrón de una prenda, trazadas a partir de sus medidas acabadas (las de la ficha técnica,
 * `garmentPoms`) con los métodos básicos de patronaje. Todo en cm, con el origen arriba a la izquierda de cada pieza.
 *
 * Es un patrón base para empezar a cortar y probar (la toile): las curvas de sisa, escote, copa de manga y tiro salen
 * de proporciones estándar y conviene revisarlas en la primera muestra.
 */
import type { GarmentTemplate, Options } from '../designer/types'

export interface PatternPiece {
  id: string
  name: string
  /** Cuántas se cortan y cómo (p. ej. «Cortar 1 al doblez», «Cortar 2 (pareja)»). */
  cut: string
  /** Contorno de la pieza (línea de costura), en cm. */
  path: string
  w: number
  h: number
  /** Línea de hilo (dirección del tejido): de (x1, y1) a (x2, y2). */
  grain: [number, number, number, number]
  /** Lado que va al doblez de la tela. */
  fold?: [number, number, number, number]
  /** Piquetes (marcas de casado) en el borde. */
  notches?: [number, number][]
  /** Texto pequeño dentro de la pieza (p. ej. «Tejido de canalé»). */
  note?: string
}

/** Medidas acabadas por id (las de la tabla de la ficha). */
export type Measures = Record<string, number>

const r1 = (n: number) => Math.round(n * 10) / 10
const P = (x: number, y: number) => `${r1(x)} ${r1(y)}`

/** Prendas con patrón trazado. */
export function hasPattern(t: GarmentTemplate) {
  return t.family === 'pants' || (t.family === 'top' && t.id !== 'top')
}

export function draftPattern(t: GarmentTemplate, o: Options, m: Measures): PatternPiece[] {
  if (t.family === 'pants') return pantsPattern(t, o, m)
  if (t.family === 'top' && t.id !== 'top') return topPattern(t, o, m)
  return []
}

// --- Prendas de arriba ---

function topPattern(t: GarmentTemplate, o: Options, m: Measures): PatternPiece[] {
  const get = (id: string) => o[id]
  const chest = m.pecho ?? 106
  const length = m.largo ?? 70
  const shoulders = m.hombros ?? 48
  // Camisas y polos: el escote sale del contorno de cuello (+2 cm de holgura), como en camisería
  const shirtCollar = t.id === 'camisa' || o.cuello === 'camisero' || o.cuello === 'polo'
  const neckCirc = (m.escote ?? 18) / 0.46 + 2
  const neckW = shirtCollar ? neckCirc / 5 * 2 + 1 : m.escote ?? 18
  const frontDrop = shirtCollar ? neckCirc / 5 + 1.5 : m['caida-escote'] ?? 9
  const W = chest / 4
  // Alto de sisa: del pecho (o el medido, en los sin mangas); más baja cuanto más holgada
  const armhole = m.sisa ?? chest / 8 + 7
  const S = Math.max(shoulders / 2, neckW / 2 + 6)
  const n = neckW / 2
  const slope = 4
  const openFront = ['camisa', 'bomber', 'puffer', 'cazadora', 'cortavientos', 'chaleco'].includes(t.id) || get('cremallera') === 'completa'
  // Cruce de la tapeta (botones) o nada (cremallera, a tope)
  const ext = openFront && (t.id === 'camisa' || get('cierre') === 'botones') ? 2 : 0

  /** Delantero o espalda (media pieza: el centro a la izquierda). */
  const body = (drop: number) => {
    const d =
      `M${P(n, 0)} L${P(S, slope)} ` +
      `C${P(S - 0.4, slope + armhole * 0.35)} ${P(W - 2.6, armhole - 0.6)} ${P(W, armhole)} ` +
      `L${P(W, length)} L${P(-ext, length)} L${P(-ext, drop)} L${P(0, drop)} ` +
      `C${P(n * 0.55, drop)} ${P(n, drop * 0.55)} ${P(n, 0)} Z`
    return d
  }
  const pieces: PatternPiece[] = []
  const frontCut = openFront ? 'Cortar 2 (pareja)' : 'Cortar 1 al doblez'
  pieces.push({
    id: 'delantero',
    name: 'Delantero',
    cut: frontCut,
    path: body(frontDrop),
    w: W + ext,
    h: length,
    grain: [W * 0.45, length * 0.2, W * 0.45, length * 0.8],
    ...(openFront ? {} : { fold: [0, frontDrop, 0, length] as [number, number, number, number] }),
    notches: [[W, armhole + 4]],
    ...(ext ? { note: 'Tapeta de 2 cm desde el centro' } : {}),
  })
  pieces.push({
    id: 'espalda',
    name: 'Espalda',
    cut: 'Cortar 1 al doblez',
    path: body(2).replace(new RegExp(`L${P(-ext, length)} L${P(-ext, 2)} L${P(0, 2)}`), `L${P(0, length)} L${P(0, 2)}`),
    w: W,
    h: length,
    grain: [W * 0.45, length * 0.2, W * 0.45, length * 0.8],
    fold: [0, 2, 0, length],
    notches: [
      [W, armhole + 4],
      [W, armhole + 5.5],
    ],
  })

  // Manga (no en el chaleco)
  if (m.manga && m.biceps) {
    const ribCuff = t.id === 'bomber' || get('punos') === 'canale' || t.id === 'sudadera'
    const shirtCuff = t.id === 'camisa' && get('manga') !== 'corta'
    const short = get('manga') === 'corta'
    const cuffH = ribCuff && !short ? 6 : shirtCuff ? 6 : 0
    const L = m.manga - cuffH - (S - shoulders / 2 > 0 ? 0 : 0)
    const bw = m.biceps / 2
    // Copa más baja en las prendas holgadas (hombro caído)
    const cap = Math.max(6, armhole * (chest > 112 ? 0.42 : 0.55))
    const open = short ? (m['boca-manga'] ?? m.biceps - 4) / 2 : Math.max((m.puno ?? 24) * (ribCuff ? 1.3 : shirtCuff ? 1.15 : 1) / 2, 8)
    const x = (v: number) => v + bw
    const d =
      `M${P(x(-bw), cap)} C${P(x(-bw * 0.62), cap * 0.92)} ${P(x(-bw * 0.42), 0)} ${P(x(0), 0)} ` +
      `C${P(x(bw * 0.42), 0)} ${P(x(bw * 0.62), cap * 0.92)} ${P(x(bw), cap)} ` +
      `L${P(x(open), L)} L${P(x(-open), L)} Z`
    pieces.push({
      id: 'manga',
      name: 'Manga',
      cut: 'Cortar 2 (pareja)',
      path: d,
      w: bw * 2,
      h: L,
      grain: [bw, cap + 4, bw, L - 6],
      notches: [
        [bw, 0],
        [x(-bw * 0.55), cap * 0.6],
        [x(bw * 0.55), cap * 0.6],
        [x(bw * 0.6), cap * 0.66],
      ],
    })
    if (cuffH && ribCuff)
      pieces.push(rect('puno', 'Puño de canalé', 'Cortar 2', (m.puno ?? 22) + 0.0, cuffH * 2, 'Canalé: se dobla por la mitad a lo largo', true))
    if (shirtCuff) pieces.push(rect('puno', 'Puño de camisa', 'Cortar 4 (2 con entretela)', (m.puno ?? 24) + 3, cuffH, 'Cruce de 3 cm para el botón'))
  }

  // Bajo de canalé o pretina
  const ribHem = t.id === 'sudadera' || t.id === 'bomber' || get('bajo') === 'canale'
  if (ribHem && m.bajo) pieces.push(rect('bajo', 'Bajo de canalé', 'Cortar 1', m.bajo, 12, 'Canalé: se dobla por la mitad a lo largo', true))

  // Escote: tira de canalé (camiseta, sudadera sin capucha), capucha o cuello de camisa
  const neckLen = shirtCollar ? neckCirc : neckLength(n, frontDrop) * 2
  const hood = (t.id === 'sudadera' && o.capucha !== false) || get('cuello') === 'capucha'
  if (hood) {
    const H = m['capucha-alto'] ?? 36
    const D = m['capucha-ancho'] ?? 25
    pieces.push({
      id: 'capucha',
      name: 'Capucha',
      cut: 'Cortar 2 (pareja) + 2 de forro',
      path: `M${P(0, H)} L${P(0, 4)} Q${P(0, 0)} ${P(6, 0)} L${P(D * 0.55, 0)} Q${P(D, 0)} ${P(D, H * 0.42)} Q${P(D, H * 0.85)} ${P(D * 0.72, H)} Z`,
      w: D,
      h: H,
      grain: [D * 0.5, H * 0.2, D * 0.5, H * 0.8],
      notches: [[D * 0.36, H]],
      note: `Escote de la capucha: ${r1(neckLen / 2)} cm`,
    })
  } else if (shirtCollar) {
    pieces.push(rect('pie-cuello', 'Pie de cuello', 'Cortar 2 (1 con entretela)', neckLen + 3, 3.5, 'Cruce de 1,5 cm a cada lado'))
    const tip = m['punta-cuello'] ?? 7.5
    pieces.push({
      id: 'cuello',
      name: 'Cuello (pala)',
      cut: 'Cortar 2 (1 con entretela)',
      path: `M${P(0, tip)} L${P(1.5, 0)} L${P(neckLen - 1.5, 0)} L${P(neckLen, tip)} Q${P(neckLen / 2, tip - 1.2)} ${P(0, tip)} Z`,
      w: neckLen,
      h: tip,
      grain: [neckLen * 0.2, tip / 2, neckLen * 0.8, tip / 2],
      fold: [neckLen / 2, 0, neckLen / 2, tip],
    })
  } else if (m['cuello-alto']) {
    pieces.push(rect('cuello', 'Cuello alto', 'Cortar 1', neckLen * 0.92, m['cuello-alto'] * 2, 'Se dobla por la mitad a lo largo', true))
  } else {
    pieces.push(rect('tira-cuello', 'Tira del escote (canalé)', 'Cortar 1', r1(neckLen * 0.85), 5, 'Un 15 % más corta que el escote: se estira al coserla', true))
  }

  // Bolsillo canguro de la sudadera
  if (t.id === 'sudadera' && o.bolsillo !== false) {
    const w = W * 2 * 0.62
    const top = w * 0.66
    const h = 20
    pieces.push({
      id: 'bolsillo',
      name: 'Bolsillo canguro',
      cut: 'Cortar 1 al doblez',
      path: `M${P(0, h)} L${P(0, 0)} L${P(top / 2, 0)} L${P(w / 2, h * 0.45)} L${P(w / 2, h)} Z`,
      w: w / 2,
      h,
      grain: [w * 0.2, 4, w * 0.2, h - 4],
      fold: [0, 0, 0, h],
      note: 'Las aberturas inclinadas llevan vivo o dobladillo',
    })
  }
  return pieces
}

/** Largo aproximado de medio escote (delantero + espalda) por sus curvas. */
function neckLength(n: number, frontDrop: number) {
  const front = Math.hypot(n, frontDrop) * 1.08
  const back = Math.hypot(n, 2) * 1.02
  return front + back
}

/** Pieza rectangular (puños, bajos, tiras, cinturillas). */
function rect(id: string, name: string, cut: string, w: number, h: number, note?: string, foldLong = false): PatternPiece {
  return {
    id,
    name,
    cut,
    path: `M0 0 L${P(w, 0)} L${P(w, h)} L${P(0, h)} Z`,
    w,
    h,
    grain: [w * 0.5, 1, w * 0.5, h - 1],
    ...(foldLong ? { fold: [0, h / 2, w, h / 2] as [number, number, number, number] } : {}),
    ...(note ? { note } : {}),
  }
}

// --- Pantalones ---

function pantsPattern(t: GarmentTemplate, o: Options, m: Measures): PatternPiece[] {
  const hip = m.cadera ?? 110
  const riseF = m['tiro-del'] ?? 27
  const riseB = m['tiro-tra'] ?? riseF + 9
  const L = m.largo ?? (m.entrepierna ?? 76) + riseF + 4
  const thigh = m.muslo ?? 64
  const knee = m.rodilla ?? hip * 0.45
  const hem = m.bajo ?? knee - 5
  const cuff = o.bajo === 'puno'
  const shortLeg = !m.rodilla
  const crotchY = riseF - 4 // la cinturilla (4 cm) va aparte
  const legL = L - 4
  const kneeY = shortLeg ? legL : crotchY + (legL - crotchY) * 0.45
  const parts: PatternPiece[] = []

  const leg = (front: boolean) => {
    const Hq = hip / 4 + (front ? -1 : 1)
    const ext = front ? hip / 16 : hip / 8 - 1
    const thighHalf = thigh / 4 + (front ? -1 : 1)
    const kneeHalf = knee / 4 + (front ? -1 : 1)
    const hemHalf = (cuff ? hem * 1.35 : hem) / 4 + (front ? -1 : 1)
    // El trasero sube por el centro (para sentarse) y se inclina
    const cbX = front ? 0 : 2.5
    const cbY = front ? 0 : -3 - (riseB - riseF - 9) * 0.3
    const crease = (Hq - ext) / 2
    const d =
      `M${P(cbX, cbY)} L${P(Hq + 0.5, 0)} ` +
      `Q${P(Hq + 1, 9)} ${P(Hq, 18)} ` +
      `L${P(crease + thighHalf, crotchY + 3)} ` +
      (shortLeg ? '' : `L${P(crease + kneeHalf, kneeY)} `) +
      `L${P(crease + hemHalf, legL)} L${P(crease - hemHalf, legL)} ` +
      (shortLeg ? '' : `L${P(crease - kneeHalf, kneeY)} `) +
      `Q${P(-ext * 0.2, crotchY + 3)} ${P(-ext, crotchY)} ` +
      `C${P(-ext * 0.35, crotchY - 0.4)} ${P(front ? 0 : cbX * 0.3, crotchY - 3)} ${P(front ? 0 : cbX * 0.4, crotchY - 7)} ` +
      `L${P(cbX, cbY)} Z`
    const minX = -ext
    return {
      d,
      minX,
      w: Math.max(Hq + 1, crease + Math.max(thighHalf, hemHalf)) - minX,
      top: cbY,
      crease,
    }
  }
  for (const front of [true, false]) {
    const g = leg(front)
    // Se mueve para que empiece en (0, 0)
    const dx = -g.minX
    const dy = -Math.min(0, g.top)
    const moved = g.d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x, y) => P(+x + dx, +y + dy))
    parts.push({
      id: front ? 'delantero' : 'trasero',
      name: front ? 'Delantero' : 'Trasero',
      cut: 'Cortar 2 (pareja)',
      path: moved,
      w: g.w,
      h: legL + dy,
      grain: [g.crease + dx, crotchY + dy + 4, g.crease + dx, legL + dy - 6],
      notches: front ? [[dx, dy + crotchY - 7]] : [
        [dx, dy + crotchY - 7],
        [dx + 0.6, dy + crotchY - 8.5],
      ],
      note: front ? 'Raya: la línea de hilo' : undefined,
    })
  }
  const fixedWaist = o.cintura === 'trabillas'
  const waist = fixedWaist ? (m.cintura ?? 82) + 4 : (m['cintura-max'] ?? hip)
  parts.push(rect('cinturilla', 'Cinturilla', 'Cortar 1', waist, 8, fixedWaist ? 'Cruce de 4 cm para el botón; con entretela' : 'Lleva goma de 3,5 cm por dentro', true))
  if (cuff) parts.push(rect('puno', 'Puño (canalé)', 'Cortar 2', hem, 14, 'Canalé: se dobla por la mitad a lo largo', true))
  if (o.traseros !== false) parts.push(rect('bolsillo-trasero', 'Bolsillo trasero', 'Cortar 2', 14, 16, 'Dobladillo de 3 cm arriba'))
  if (o.cargo === true) parts.push(rect('bolsillo-cargo', 'Bolsillo cargo', 'Cortar 2 (+ 2 tapetas de 18 × 6)', 18, 22, 'Fuelle de 3 cm a cada lado'))
  void t
  return parts
}
