import { CX, curve, line, path, rect, symmetric, type Pt, type Seg } from './geometry'
import { NO_SCALE, type DrawScale } from './measures'
import { mirrorPath } from './top'
import type { Shape, View } from './types'

/**
 * Tops de mujer: de tirantes, palabra de honor (bandeau), halter (atado al cuello), cruzado y corsé.
 * Comparten el cuerpo (del pecho al bajo, entallado en la cintura) y cambian el escote, los tirantes y los cierres.
 */

export interface FemTopCfg {
  kind: 'tirantes' | 'bandeau' | 'halter' | 'cruzado' | 'corse'
  fit: 'ajustado' | 'regular' | 'holgado'
  length: 'crop' | 'cintura' | 'cadera'
  /** Escote del top de tirantes y del corsé. */
  neckline: 'recto' | 'pico' | 'redondo' | 'corazon'
  straps: 'finos' | 'anchos'
  /** Fruncido en el escote (bandeau) o en el centro (corsé). */
  gathers: boolean
  /** Corsé: cierre a la espalda y ballenas. */
  closure: 'cordones' | 'cremallera' | 'corchetes'
  boning: boolean
  stitch: 'simple' | 'doble'
  scale?: DrawScale
}

export const FEMTOP_PIECES = {
  body: 'cuerpo',
  straps: 'tirantes',
  tie: 'lazo',
  binding: 'ribete',
  cords: 'cordones',
  hardware: 'fornituras',
} as const

const HALF = { ajustado: 58, regular: 64, holgado: 74 }
const HEM = { crop: 232, cintura: 262, cadera: 316 }
const BUST_Y = 168
const SIDE_TOP = 186

function frame(c: FemTopCfg) {
  const k = c.scale ?? NO_SCALE
  const half = HALF[c.fit] * k.width
  const hemY = BUST_Y + (HEM[c.length] - BUST_Y) * k.length
  const waistY = Math.min(250, hemY - 6)
  const waistK = c.fit === 'holgado' ? 0.97 : c.fit === 'regular' ? 0.9 : 0.85
  const hemHalf = hemY > waistY + 20 ? half * (c.fit === 'holgado' ? 1 : 0.98) : half * waistK
  // Altura del borde de arriba en el centro y en el costado (según el escote)
  const topY = c.kind === 'bandeau' || (c.kind === 'corse' && c.neckline === 'recto') ? 156 : 150
  return { half, hemY, waistY, waistK, hemHalf, topY }
}

/** Escote (de centro a costado, mitad derecha), desde el centro delantero. */
function neckline(c: FemTopCfg, f: ReturnType<typeof frame>, front: boolean): { start: Pt; segs: Seg[] } {
  const side: Pt = [CX + 30, f.topY]
  if (!front) {
    // Espalda: más baja en el centro (salvo el bandeau y el corsé, rectos)
    return c.kind === 'bandeau' || c.kind === 'corse' ? { start: [CX, f.topY + 4], segs: [{ to: [CX + 30, f.topY + 4] }] } : { start: [CX, 182], segs: [{ to: side, c: [CX + 24, 182] }] }
  }
  if (c.kind === 'bandeau') return { start: [CX, f.topY + 2], segs: [{ to: [CX + 30, f.topY] }] }
  if (c.kind === 'cruzado') return { start: [CX, 214], segs: [{ to: side, c: [CX + 10, 178] }] }
  if (c.kind === 'halter') return { start: [CX, 176], segs: [{ to: [CX + 14, f.topY], c: [CX + 6, 160] }] }
  switch (c.neckline) {
    case 'pico':
      return { start: [CX, 190], segs: [{ to: side }] }
    case 'redondo':
      return { start: [CX, 176], segs: [{ to: side, c: [CX + 26, 176] }] }
    case 'corazon':
      return { start: [CX, 170], segs: [{ to: [CX + 24, 150], c: [CX + 6, 148] }, { to: [CX + 34, f.topY + 6], c: [CX + 34, 150] }] }
    default:
      return { start: [CX, f.topY], segs: [{ to: side }] }
  }
}

export function drawFemTop(view: View, c: FemTopCfg): Shape[] {
  const f = frame(c)
  if (view === 'side') return drawSide(c, f)
  const front = view === 'front'
  const P = FEMTOP_PIECES
  const offs = c.stitch === 'doble' ? [3, 6] : [3]
  const out: Shape[] = []
  const pair = (shapes: Shape[]) => shapes.forEach((s) => out.push(s, { ...s, d: mirrorPath(s.d) }))
  const n = neckline(c, f, front)
  const noStraps = c.kind === 'bandeau' || (c.kind === 'corse' && !front && c.neckline === 'recto')

  // --- Cuerpo ---
  const armTop: Pt = noStraps || c.kind === 'corse' ? [CX + f.half, f.topY + (c.kind === 'bandeau' ? 0 : 6)] : [CX + f.half, SIDE_TOP]
  const centerHem = c.kind === 'corse' && front ? f.hemY + 12 : f.hemY
  out.push({
    kind: 'fill',
    piece: P.body,
    d: symmetric(n.start, [
      ...n.segs,
      // Sisa: del tirante al costado (el bandeau y el corsé suben rectos)
      noStraps || c.kind === 'corse' ? { to: armTop } : { to: armTop, c: [CX + f.half - 4, f.topY + 8] },
      { to: [CX + f.half * f.waistK, f.waistY], c: [CX + f.half * (0.5 + f.waistK / 2), (armTop[1] + f.waistY) / 2] },
      { to: [CX + f.hemHalf, f.hemY], c: [CX + f.half * f.waistK, (f.waistY + f.hemY) / 2] },
      { to: [CX, centerHem] },
    ]),
  })
  // Ribete del escote y la sisa (o pespunte del borde)
  const edge = (d: number) => {
    const segs = n.segs.map((s) => ({ ...s, to: [s.to[0], s.to[1] + d] as Pt, ...(s.c ? { c: [s.c[0], s.c[1] + d] as Pt } : {}) }))
    let p = `M${n.start[0]} ${n.start[1] + d}`
    for (const s of segs) p += s.c ? ` Q${s.c[0]} ${s.c[1]} ${s.to[0]} ${s.to[1]}` : ` L${s.to[0]} ${s.to[1]}`
    return p
  }
  for (const d of offs) pair([{ kind: 'stitch', piece: P.body, d: edge(d) }])
  for (const d of offs) out.push({ kind: 'stitch', piece: P.body, d: line([CX - f.hemHalf + 2, f.hemY - d - 1], [CX + f.hemHalf - 2, f.hemY - d - 1]) })

  // --- Tirantes ---
  if (!noStraps && c.kind !== 'corse') {
    const w = c.straps === 'anchos' ? 12 : 4
    if (c.kind === 'halter') {
      // Los dos tirantes suben hasta la nuca; detrás se atan con un lazo
      pair([{ kind: 'fill', piece: P.straps, d: path([CX + 14, f.topY + 1], [{ to: [CX + 14 + w, f.topY + 2] }, { to: [CX + 8 + w * 0.6, 98] }, { to: [CX + 6, 98] }]) }])
      if (!front) {
        out.push({ kind: 'fill', piece: P.tie, d: path([CX, 100], [{ to: [CX + 16, 92], c: [CX + 8, 86] }, { to: [CX + 16, 108] }, { to: [CX, 100] }]) })
        out.push({ kind: 'fill', piece: P.tie, d: path([CX, 100], [{ to: [CX - 16, 92], c: [CX - 8, 86] }, { to: [CX - 16, 108] }, { to: [CX, 100] }]) })
        out.push({ kind: 'fill', piece: P.tie, d: path([CX - 3, 100], [{ to: [CX - 8, 132] }, { to: [CX - 3, 132] }, { to: [CX + 1, 102] }]) })
        out.push({ kind: 'fill', piece: P.tie, d: path([CX + 3, 100], [{ to: [CX + 9, 128] }, { to: [CX + 4, 129] }, { to: [CX - 1, 102] }]) })
      }
    } else {
      const x = c.kind === 'cruzado' ? CX + 22 : CX + 22
      pair([{ kind: 'fill', piece: P.straps, d: path([x, f.topY + 1], [{ to: [x + w, f.topY + 1] }, { to: [x + w + 4, 102] }, { to: [x + 4, 102] }]) }])
    }
  }

  // --- Cruzado: el delantero de un lado pasa por encima del otro y se ata en el costado ---
  if (c.kind === 'cruzado' && front) {
    out.push({ kind: 'line', piece: P.body, d: curve([CX - 30, f.topY + 1], [CX - 6, 200], [CX + f.half * f.waistK - 4, f.waistY - 4]) })
    for (const d of offs) out.push({ kind: 'stitch', piece: P.body, d: curve([CX - 30 + d, f.topY + 3], [CX - 6 + d, 200], [CX + f.half * f.waistK - 6, f.waistY - 6 + d * 0.3]) })
    const knot: Pt = [CX + f.half * f.waistK - 4, f.waistY - 2]
    out.push({ kind: 'fill', piece: P.tie, d: rect(knot[0] - 5, knot[1] - 4, 10, 8, 3) })
    out.push({ kind: 'fill', piece: P.tie, d: path([knot[0] - 2, knot[1] + 3], [{ to: [knot[0] + 4, knot[1] + 40] }, { to: [knot[0] + 10, knot[1] + 38] }, { to: [knot[0] + 3, knot[1] + 2] }]) })
  }

  // --- Bandeau: fruncido en el escote ---
  if (c.kind === 'bandeau' && c.gathers) {
    for (let i = -5; i <= 5; i++) out.push({ kind: 'line', piece: P.body, d: line([CX + i * f.half * 0.16, f.topY + 3], [CX + i * f.half * 0.15, f.topY + 14]) })
  }

  // --- Corsé: costuras de los paneles, ballenas y cierres ---
  if (c.kind === 'corse') {
    const seams = [0.32, 0.66]
    for (const t of seams) {
      for (const k of [1, -1]) {
        const top: Pt = [CX + k * f.half * t * 0.95, f.topY + 4]
        const mid: Pt = [CX + k * f.half * f.waistK * t, f.waistY]
        const bot: Pt = [CX + k * f.hemHalf * t, (front ? centerHem : f.hemY) - (front ? 12 * (1 - t) : 0) - 1]
        out.push({ kind: 'line', piece: P.body, d: `${line(top, mid)} ${line(mid, bot)}` })
        if (c.boning) out.push({ kind: 'stitch', piece: P.binding, d: `${line([top[0] + k * 3, top[1] + 3], [mid[0] + k * 3, mid[1]])} ${line([mid[0] + k * 3, mid[1]], [bot[0] + k * 3, bot[1] - 2])}` })
      }
    }
    if (front && c.gathers) for (let i = 0; i < 5; i++) out.push({ kind: 'line', piece: P.body, d: curve([CX - 8 + i * 4, f.topY + 14], [CX - 2 + i * 1, f.topY + 30], [CX - 4 + i * 2, f.topY + 46]) })
    if (front) out.push({ kind: 'line', piece: P.body, d: line([CX, n.start[1]], [CX, centerHem]) })
    if (front && c.closure === 'corchetes') for (let y = f.topY + 14; y < f.hemY - 6; y += 16) out.push({ kind: 'hardware', piece: P.hardware, d: rect(CX - 3, y, 6, 4, 1.5) })
    if (!front) {
      if (c.closure === 'cordones') {
        // Ojetes a los dos lados del centro y el cordón cruzado
        const ys: number[] = []
        for (let y = f.topY + 12; y < f.hemY - 8; y += 14) ys.push(y)
        for (const y of ys) for (const k of [1, -1]) out.push({ kind: 'hardware', piece: P.hardware, d: rect(CX + k * 9 - 2, y - 2, 4, 4, 2) })
        const pts: Pt[] = ys.flatMap((y, i) => (i % 2 ? [[CX + 9, y], [CX - 9, y]] : [[CX - 9, y], [CX + 9, y]]) as Pt[])
        out.push({ kind: 'line', piece: P.cords, d: line(...pts) })
        out.push({ kind: 'line', piece: P.cords, d: line([CX - 2, ys[ys.length - 1]], [CX - 10, ys[ys.length - 1] + 34]) })
        out.push({ kind: 'line', piece: P.cords, d: line([CX + 2, ys[ys.length - 1]], [CX + 10, ys[ys.length - 1] + 30]) })
      } else if (c.closure === 'cremallera') {
        out.push({ kind: 'hardware', piece: P.hardware, role: 'zip', d: rect(CX - 2, f.topY + 6, 4, f.hemY - f.topY - 8) })
      } else {
        out.push({ kind: 'line', piece: P.body, d: line([CX, f.topY + 4], [CX, f.hemY]) })
      }
    }
  }
  return out
}

function drawSide(c: FemTopCfg, f: ReturnType<typeof frame>): Shape[] {
  const P = FEMTOP_PIECES
  const d = f.half * 0.55
  const top = c.kind === 'bandeau' || c.kind === 'corse' ? f.topY : SIDE_TOP
  const out: Shape[] = [
    {
      kind: 'fill',
      piece: P.body,
      d: path([CX - d, top], [{ to: [CX + d + 6, top - 4], c: [CX + d * 0.4, top - 4] }, { to: [CX + d * f.waistK, f.waistY], c: [CX + d + 10, BUST_Y + 10] }, { to: [CX + d, f.hemY] }, { to: [CX - d, f.hemY] }, { to: [CX - d * f.waistK, f.waistY] }]),
    },
  ]
  if (c.kind !== 'bandeau' && c.kind !== 'corse') {
    const w = c.straps === 'anchos' ? 10 : 4
    out.push({ kind: 'fill', piece: P.straps, d: path([CX + 6, top - 4], [{ to: [CX + 6 + w, top - 4] }, { to: [CX + 2 + w, 100] }, { to: [CX + 2, 100] }]) })
  }
  return out
}

