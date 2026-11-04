import { CX, curve, lerp, line, mirrorSegs, path, quad, rect, ribLines, type Pt, type Seg } from './geometry'
import { mirrorPath } from './top'
import { NO_SCALE, type DrawScale } from './measures'
import type { Shape, View } from './types'

/** Pantalón jogger / cargo. */
export interface PantsCfg {
  fit: 'slim' | 'regular' | 'ancho' | 'baggy'
  length: 'tobillero' | 'largo'
  hem: 'puno' | 'recto'
  sidePockets: boolean
  cargo: boolean
  backPockets: boolean
  cord: boolean
  stitch: 'simple' | 'doble'
  /** Medidas propias del diseño (ver measures.ts). */
  scale?: DrawScale
}

export const PANTS_PIECES = {
  legs: 'perneras',
  waistband: 'cinturilla',
  pockets: 'bolsillos',
  cuffs: 'punos',
  cord: 'cordon',
} as const

const FIT = {
  slim: { hip: 82, knee: 34, hem: 26 },
  regular: { hip: 88, knee: 42, hem: 34 },
  ancho: { hip: 94, knee: 50, hem: 46 },
  baggy: { hip: 100, knee: 58, hem: 56 },
}

const WAIST_Y = 40
const WB_H = 26
const TOP = WAIST_Y + WB_H
const CROTCH_Y = 186
const KNEE_Y = 310

function frame(c: PantsCfg) {
  const k = c.scale ?? NO_SCALE
  const base = FIT[c.fit]
  const F = { hip: base.hip * k.hip, knee: base.knee * k.knee, hem: base.hem * k.hem }
  const jogger = c.hem === 'puno'
  // El puño recoge el bajo: la pernera se estrecha más
  const hemW = jogger ? Math.min(F.hem, base.knee * 0.72 * k.hem) : F.hem
  const hemY = TOP + ((c.length === 'largo' ? 462 : 440) - TOP) * k.length
  const kneeY = TOP + (KNEE_Y - TOP) * k.length
  const cuffH = jogger ? 22 : 0
  const hemTop = hemY - cuffH
  const kneeC = CX + F.hip * 0.5
  const hemC = CX + F.hip * 0.52
  const outerAt = (y: number) => {
    if (y <= kneeY) return CX + F.hip + ((kneeC + F.knee / 2 - (CX + F.hip)) * (y - TOP)) / (kneeY - TOP)
    return kneeC + F.knee / 2 + ((hemC + hemW / 2 - (kneeC + F.knee / 2)) * (y - kneeY)) / (hemTop - kneeY)
  }
  return { F, hemW, hemY, cuffH, hemTop, kneeC, hemC, outerAt, kneeY }
}

export function drawPants(view: View, c: PantsCfg): Shape[] {
  const f = frame(c)
  if (view === 'side') return drawSide(c, f)
  const front = view === 'front'
  const P = PANTS_PIECES
  const offs = c.stitch === 'doble' ? [4, 8] : [4]
  const out: Shape[] = []
  const pair = (shapes: Shape[]) => shapes.forEach((s) => out.push(s, { ...s, d: mirrorPath(s.d) }))

  // --- Perneras ---
  const leg: [Pt, Seg[]] = [
    [CX + 1, TOP],
    [
      { to: [CX + f.F.hip, TOP] },
      { to: [f.kneeC + f.F.knee / 2, f.kneeY], c: [CX + f.F.hip + 4, 170] },
      { to: [f.hemC + f.hemW / 2, f.hemTop] },
      { to: [f.hemC - f.hemW / 2, f.hemTop] },
      { to: [f.kneeC - f.F.knee / 2, f.kneeY] },
      { to: [CX + 3, CROTCH_Y], c: [CX + 8, 230] },
      { to: [CX + 1, TOP], c: [CX + 2, 120] },
    ],
  ]
  for (const [start, segs] of [leg, mirrorSegs(...leg)]) out.push({ kind: 'fill', piece: P.legs, d: path(start, segs) })

  // Puño o bajo recto
  pair(
    f.cuffH
      ? [
          {
            kind: 'fill',
            piece: P.cuffs,
            d: quad([f.hemC - f.hemW / 2, f.hemTop], [f.hemC + f.hemW / 2, f.hemTop], [f.hemC + f.hemW / 2 - 3, f.hemY], [f.hemC - f.hemW / 2 + 3, f.hemY]),
          },
          {
            kind: 'rib',
            piece: P.cuffs,
            d: ribLines([f.hemC - f.hemW / 2, f.hemTop], [f.hemC + f.hemW / 2, f.hemTop], [f.hemC - f.hemW / 2 + 3, f.hemY], [f.hemC + f.hemW / 2 - 3, f.hemY]),
          },
        ]
      : offs.map((o): Shape => ({ kind: 'stitch', piece: P.legs, d: line([f.hemC - f.hemW / 2 + 2, f.hemTop - o - 2], [f.hemC + f.hemW / 2 - 2, f.hemTop - o - 2]) })),
  )

  if (front) {
    // Bragueta falsa (pespunte en J)
    for (const o of offs) out.push({ kind: 'stitch', piece: P.legs, d: `${line([CX + 10 + o, TOP + 2], [CX + 10 + o, 138])} ${curve([CX + 10 + o, 138], [CX + 10 + o, 156], [CX + 2, 160])}` })
    out.push({ kind: 'line', piece: P.legs, d: line([CX, TOP], [CX, 160]) })
    // Bolsillos laterales: abertura inclinada
    if (c.sidePockets) {
      pair([
        { kind: 'line', piece: P.legs, d: curve([CX + f.F.hip - 24, TOP], [CX + f.F.hip - 18, 104], [CX + f.F.hip + 1, 132]) },
        ...offs.map((o): Shape => ({ kind: 'stitch', piece: P.legs, d: curve([CX + f.F.hip - 24 - o, TOP + 1], [CX + f.F.hip - 18 - o, 104 + o], [CX + f.F.hip + 1, 132 + o]) })),
      ])
    }
  } else {
    // Canesú, costura central y bolsillos traseros
    pair([{ kind: 'line', piece: P.legs, d: curve([CX + 1, 100], [CX + f.F.hip * 0.5, 86], [CX + f.F.hip + 1, 82]) }])
    out.push({ kind: 'line', piece: P.legs, d: line([CX, TOP], [CX, CROTCH_Y - 10]) })
    if (c.backPockets) {
      pair([
        { kind: 'fill', piece: P.pockets, d: path([CX + 22, 108], [{ to: [CX + 68, 104] }, { to: [CX + 70, 152] }, { to: [CX + 47, 162] }, { to: [CX + 24, 154] }]) },
        { kind: 'fill', piece: P.pockets, d: path([CX + 20, 104], [{ to: [CX + 70, 100] }, { to: [CX + 71, 120] }, { to: [CX + 21, 124] }]) },
        ...offs.map((o): Shape => ({ kind: 'stitch', piece: P.pockets, d: line([CX + 24, 124 + o], [CX + 69, 120 + o]) })),
      ])
    }
  }

  // Bolsillos cargo en el lateral del muslo
  if (c.cargo) {
    const y0 = 226
    const y1 = 296
    const x1 = f.outerAt(y0) - 3
    const x2 = f.outerAt(y1) - 3
    const w = 42
    pair([
      { kind: 'fill', piece: P.pockets, d: quad([x1 - w, y0 + 4], [x1, y0 + 4], [x2, y1], [x2 - w, y1]) },
      { kind: 'fill', piece: P.pockets, d: quad([x1 - w - 2, y0 - 2], [x1 + 1, y0 - 2], [x1 + 1, y0 + 18], [x1 - w - 2, y0 + 18]) },
      { kind: 'line', piece: P.pockets, d: line([(x1 + x2) / 2 - w / 2, y0 + 18], [(x1 + x2) / 2 - w / 2, y1]) },
      ...offs.map((o): Shape => ({ kind: 'stitch', piece: P.pockets, d: line([x1 - w + 2, y0 + 18 - o], [x1 - 1, y0 + 18 - o]) })),
    ])
  }

  // Cinturilla elástica y cordón
  out.push(...waistband(c, offs, front))
  return out
}

function waistband(c: PantsCfg, offs: number[], front: boolean): Shape[] {
  const P = PANTS_PIECES
  const hip = FIT[c.fit].hip
  const out: Shape[] = [
    { kind: 'fill', piece: P.waistband, d: rect(CX - hip + 2, WAIST_Y, (hip - 2) * 2, WB_H, 2) },
    { kind: 'rib', piece: P.waistband, d: ribLines([CX - hip + 2, WAIST_Y], [CX + hip - 2, WAIST_Y], [CX - hip + 2, TOP], [CX + hip - 2, TOP], 5) },
    ...offs.map((o): Shape => ({ kind: 'stitch', piece: P.waistband, d: line([CX - hip + 4, TOP - o + 1], [CX + hip - 4, TOP - o + 1]) })),
  ]
  if (front && c.cord) {
    for (const s of [1, -1]) {
      const x = CX + s * 7
      out.push({ kind: 'hardware', piece: P.cord, d: rect(x - 2.5, WAIST_Y + 9, 5, 5, 2.5) })
      out.push({ kind: 'line', piece: P.cord, d: curve([x, WAIST_Y + 13], [x + s * 2, 90], [x + s * 6, 118]) })
      out.push({ kind: 'hardware', piece: P.cord, d: rect(x + s * 6 - 2.5, 118, 5, 12, 2) })
    }
  }
  return out
}

function drawSide(c: PantsCfg, f: ReturnType<typeof frame>): Shape[] {
  const P = PANTS_PIECES
  const offs = c.stitch === 'doble' ? [4, 8] : [4]
  const depth = f.F.hip * 0.42
  const out: Shape[] = []
  const frontHem = CX + f.hemW * 0.5
  const backHem = CX - f.hemW * 0.5
  out.push({
    kind: 'fill',
    piece: P.legs,
    d: path([CX + depth, TOP], [
      { to: [CX + f.F.knee * 0.55, f.kneeY], c: [CX + depth + 6, 200] },
      { to: [frontHem, f.hemTop] },
      { to: [backHem, f.hemTop] },
      { to: [CX - f.F.knee * 0.5, f.kneeY] },
      { to: [CX - depth - 4, 150], c: [CX - f.F.knee * 0.6, 220] },
      { to: [CX - depth, TOP], c: [CX - depth - 8, 100] },
    ]),
  })
  // Costura lateral
  const seamTop: Pt = [CX, TOP]
  const seamKnee: Pt = [CX + f.F.knee * 0.03, f.kneeY]
  const seamHem: Pt = [(frontHem + backHem) / 2, f.hemTop]
  out.push({ kind: 'line', piece: P.legs, d: `${line(seamTop, seamKnee)} ${line(seamKnee, seamHem)}` })
  if (c.sidePockets) out.push({ kind: 'line', piece: P.legs, d: curve([CX + depth - 14, TOP], [CX + depth - 6, 110], [CX + 2, 132]) })
  if (c.cargo) {
    const top: Pt = lerp(seamTop, seamKnee, (226 - TOP) / (f.kneeY - TOP))
    out.push({ kind: 'fill', piece: P.pockets, d: rect(top[0] - 24, 230, 48, 66, 3) })
    out.push({ kind: 'fill', piece: P.pockets, d: rect(top[0] - 26, 224, 52, 20, 3) })
    for (const o of offs) out.push({ kind: 'stitch', piece: P.pockets, d: line([top[0] - 22, 244 - o], [top[0] + 22, 244 - o]) })
  }
  if (f.cuffH) {
    const a: Pt = [backHem, f.hemTop]
    const b: Pt = [frontHem, f.hemTop]
    out.push({ kind: 'fill', piece: P.cuffs, d: quad(a, b, [frontHem - 3, f.hemY], [backHem + 3, f.hemY]) })
    out.push({ kind: 'rib', piece: P.cuffs, d: ribLines(a, b, [backHem + 3, f.hemY], [frontHem - 3, f.hemY]) })
  } else {
    for (const o of offs) out.push({ kind: 'stitch', piece: P.legs, d: line([backHem + 2, f.hemTop - o - 2], [frontHem - 2, f.hemTop - o - 2]) })
  }
  out.push({ kind: 'fill', piece: P.waistband, d: rect(CX - depth - 2, WAIST_Y, depth * 2 + 4, WB_H, 2) })
  out.push({ kind: 'rib', piece: P.waistband, d: ribLines([CX - depth - 2, WAIST_Y], [CX + depth + 2, WAIST_Y], [CX - depth - 2, TOP], [CX + depth + 2, TOP], 5) })
  return out
}
