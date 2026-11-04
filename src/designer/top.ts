import {
  add,
  CX,
  curve,
  len,
  lerp,
  line,
  mirror,
  mirrorSegs,
  mul,
  offsetLine,
  path,
  quad,
  rect,
  ribLines,
  sub,
  symmetric,
  type Pt,
  type Seg,
} from './geometry'
import { NO_SCALE, type DrawScale } from './measures'
import type { Shape, View } from './types'

/**
 * Prendas de torso (sudadera, camiseta, bomber…): un único dibujante con opciones.
 * Las medidas están en unidades del lienzo (≈ 0,5 cm reales en una talla M).
 */
export interface TopCfg {
  fit: 'ajustado' | 'regular' | 'boxy' | 'oversize'
  length: 'crop' | 'normal' | 'largo'
  sleeve: 'corta' | 'larga'
  neck: Neck
  /** `curvo`: bajo de camisa, más largo por delante y por detrás que en los costados. */
  hem: 'canale' | 'recto' | 'curvo'
  /** `camisero`: puño de camisa con su botón. */
  cuff: 'canale' | 'recto' | 'camisero'
  zip: 'ninguna' | 'media' | 'completa'
  pocket: 'canguro' | 'ninguno' | 'ojal' | 'solapa' | 'pecho'
  cords: boolean
  sleevePocket: boolean
  stitch: 'simple' | 'doble'
  /** Tapeta con botones: corta (polo, henley) o hasta el bajo (camisa); `buttons` en la corta. */
  placket?: 'ninguna' | 'corta' | 'completa'
  buttons?: number
  /** Canesú en la espalda (camisas). */
  yoke?: boolean
  /** Acolchado (puffer): separación entre canales, en unidades del lienzo (0 = sin acolchar). */
  quilt?: number
  /** Escala de las bandas de canalé (la bomber las lleva más anchas). */
  ribScale?: number
  /** Medidas propias del diseño (ver measures.ts). */
  scale?: DrawScale
}

/**
 * Cuellos: redondo y pico de canalé, capucha, bomber (canalé alto), polo (de punto, con tapeta), camisero,
 * mao (tira recta), alto (cisne o cuello de chaqueta acolchada), solapa (chaqueta, en pico hasta el pecho)
 * y cubano (camisa de cuello abierto).
 */
export type Neck = 'capucha' | 'redondo' | 'pico' | 'bomber' | 'polo' | 'camisero' | 'mao' | 'alto' | 'solapa' | 'cubano'

/** Altura del escote en el centro delantero para cada cuello (donde empieza la tapeta o la cremallera). */
const NECK_Y: Record<Neck, number> = { capucha: 122, redondo: 122, pico: 150, bomber: 116, polo: 118, camisero: 116, mao: 116, alto: 106, solapa: 190, cubano: 150 }
/** Cuellos con escote en pico (el delantero baja en línea recta). */
const V_NECKS: Neck[] = ['pico', 'solapa', 'cubano']

/** Ids de las piezas, para colores y materiales. */
export const TOP_PIECES = {
  body: 'cuerpo',
  sleeves: 'mangas',
  hood: 'capucha',
  collar: 'cuello',
  pocket: 'bolsillo',
  cuffs: 'punos',
  hem: 'bajo',
  hardware: 'fornituras',
  cords: 'cordones',
  placket: 'tapeta',
  buttons: 'botones',
} as const

const FIT = {
  ajustado: { half: 62, drop: 0, arm: 62, cuffW: 40 },
  regular: { half: 70, drop: 8, arm: 70, cuffW: 44 },
  boxy: { half: 80, drop: 14, arm: 76, cuffW: 50 },
  oversize: { half: 86, drop: 24, arm: 84, cuffW: 54 },
}
const LENGTH = { crop: 160, normal: 214, largo: 256 }

/** Medidas derivadas de las opciones, comunes a las tres vistas. */
function frame(c: TopCfg) {
  const k = c.scale ?? NO_SCALE
  const base = FIT[c.fit]
  // Las medidas propias estiran el ancho (y con él los hombros), la sisa (ancho de manga) y el puño
  const F = { ...base, half: base.half * k.width, drop: (58 + base.drop) * k.width - 58, arm: base.arm * k.sleeveWidth, cuffW: base.cuffW * k.cuff }
  const rib = c.ribScale ?? 1
  const nw = c.neck === 'bomber' ? 30 : 26
  const neckPt: Pt = [CX + nw, 100]
  const S: Pt = [CX + 58 + F.drop, 110 + base.drop * 0.35]
  const U: Pt = [CX + F.half, 106 + F.arm]
  const hemY = 106 + LENGTH[c.length] * k.length
  const ribH = c.hem === 'canale' ? 16 * rib : 0
  const hemTop = hemY - ribH
  const long = c.sleeve === 'larga'
  const sleeveLen = (long ? 226 - base.drop * 0.7 : 64 + (c.fit === 'oversize' ? 20 : c.fit === 'boxy' ? 10 : 0)) * k.sleeve
  const a = ((long ? 14 : 32) * Math.PI) / 180
  const dir: Pt = [Math.sin(a), Math.cos(a)]
  const inward: Pt = [-Math.cos(a), Math.sin(a)]
  // Puño de canalé (también en manga corta, como en los polos) o puño camisero
  const cuffH = c.cuff === 'canale' ? (long ? 16 : 10) * rib : long && c.cuff === 'camisero' ? 18 : 0
  const endW = long ? F.cuffW + (c.cuff === 'recto' ? 6 : 0) : len(sub(S, U)) * 0.82 * k.cuff
  return { F, rib, nw, neckPt, S, U, hemY, ribH, hemTop, long, sleeveLen, dir, inward, cuffH, endW }
}

type Frame = ReturnType<typeof frame>

export function drawTop(view: View, c: TopCfg): Shape[] {
  const f = frame(c)
  if (view === 'side') return drawSide(c, f)
  const front = view === 'front'
  const out: Shape[] = []
  const P = TOP_PIECES
  const stitchOffsets = c.stitch === 'doble' ? [4, 8] : [4]

  // --- Cuerpo ---
  const neckY = front ? NECK_Y[c.neck] : 104
  const neckSeg: Seg = front && V_NECKS.includes(c.neck) ? { to: f.neckPt } : { to: f.neckPt, c: [CX + f.nw * 0.95, neckY - 2] }
  const curved = c.hem === 'curvo'
  out.push({
    kind: 'fill',
    piece: P.body,
    d: symmetric([CX, neckY], [
      neckSeg,
      { to: f.S },
      { to: f.U, c: [f.S[0] - 3, (f.S[1] + f.U[1]) / 2] },
      ...(curved
        ? [{ to: [CX + f.F.half, f.hemTop - 18] as Pt }, { to: [CX, f.hemTop + 6] as Pt, c: [CX + f.F.half * 0.8, f.hemTop + 6] as Pt }]
        : [{ to: [CX + f.F.half - (f.ribH ? 1 : 0), f.hemTop] as Pt }, { to: [CX, f.hemTop] as Pt }]),
    ]),
  })
  // Acolchado (puffer): canales horizontales en el cuerpo
  if (c.quilt) out.push(...quilting(f, c.quilt))
  // Canesú de camisa en la espalda
  if (!front && c.yoke) out.push({ kind: 'line', piece: P.body, d: `${line(mirror(lerp(f.S, f.U, 0.3)), lerp(f.S, f.U, 0.3))}` })
  // Pespunte de la sisa (hacia el cuerpo)
  for (const d of stitchOffsets) {
    out.push({ kind: 'stitch', piece: P.body, d: offsetLine(f.S, f.U, d) })
    out.push({ kind: 'stitch', piece: P.body, d: offsetLine(mirror(f.U), mirror(f.S), d) })
  }

  // --- Bajo ---
  const half = f.F.half
  if (f.ribH) {
    out.push({
      kind: 'fill',
      piece: P.hem,
      d: symmetric([CX, f.hemTop], [{ to: [CX + half - 1, f.hemTop] }, { to: [CX + half - 5, f.hemY] }, { to: [CX, f.hemY] }]),
    })
    out.push({
      kind: 'rib',
      piece: P.hem,
      d: ribLines([CX - half + 1, f.hemTop], [CX + half - 1, f.hemTop], [CX - half + 5, f.hemY], [CX + half - 5, f.hemY]),
    })
    for (const d of stitchOffsets) out.push({ kind: 'stitch', piece: P.body, d: line([CX - half + 2, f.hemTop - d + 1], [CX + half - 2, f.hemTop - d + 1]) })
  } else if (curved) {
    for (const d of stitchOffsets) {
      const y = f.hemTop - d
      out.push({ kind: 'stitch', piece: P.body, d: `${curve([CX - half + 2, y - 18], [CX - half * 0.8, y + 6], [CX, y + 6])} ${curve([CX, y + 6], [CX + half * 0.8, y + 6], [CX + half - 2, y - 18])}` })
    }
  } else {
    for (const d of stitchOffsets) out.push({ kind: 'stitch', piece: P.body, d: line([CX - half + 2, f.hemY - d - 2], [CX + half - 2, f.hemY - d - 2]) })
  }

  // --- Bolsillos (solo delante) ---
  if (front) out.push(...pockets(c, f, stitchOffsets))

  // --- Mangas ---
  out.push(...sleeves(c, f, front, stitchOffsets))

  // --- Cuello / capucha ---
  out.push(...neck(c, f, front, stitchOffsets))

  // --- Tapeta con botones (delante) ---
  if (front && c.placket && c.placket !== 'ninguna') out.push(...placket(c, f, neckY, stitchOffsets))

  // --- Cremallera y cordones (delante) ---
  if (front && c.zip !== 'ninguna') {
    const top = c.neck === 'capucha' ? 130 : c.neck === 'alto' ? 70 : neckY
    const bottom = c.zip === 'completa' ? f.hemY : top + 86
    out.push(...zipper(top, bottom, P.hardware, stitchOffsets))
  }
  if (front && c.cords && c.neck === 'capucha') {
    for (const s of [1, -1]) {
      const x = CX + s * 10
      out.push({ kind: 'hardware', piece: P.cords, d: rect(x - 2.5, 121, 5, 5, 2.5) })
      out.push({ kind: 'line', piece: P.cords, d: line([x, 125], [x + s * 3, 196]) })
      out.push({ kind: 'hardware', piece: P.cords, d: rect(x + s * 3 - 2.5, 196, 5, 12, 2) })
    }
  }
  return out
}

function pockets(c: TopCfg, f: Frame, offs: number[]): Shape[] {
  const out: Shape[] = []
  const P = TOP_PIECES
  if (c.pocket === 'canguro') {
    const pTop = f.hemTop - 96
    const w = Math.min(74, f.F.half - 10)
    out.push({
      kind: 'fill',
      piece: P.pocket,
      d: symmetric([CX, pTop], [
        { to: [CX + 48, pTop] },
        { to: [CX + w, f.hemTop - 30], c: [CX + 52, f.hemTop - 58] },
        { to: [CX + w, f.hemTop] },
        { to: [CX, f.hemTop] },
      ]),
    })
    for (const d of offs) {
      out.push({ kind: 'stitch', piece: P.pocket, d: line([CX - 46, pTop + d], [CX + 46, pTop + d]) })
      for (const s of [1, -1]) {
        out.push({
          kind: 'stitch',
          piece: P.pocket,
          d: curve([CX + s * (48 - d), pTop + 2], [CX + s * (52 - d), f.hemTop - 58], [CX + s * (w - d), f.hemTop - 28]),
        })
      }
    }
  } else if (c.pocket === 'ojal') {
    const a: Pt = [CX + 30, f.hemTop - 74]
    const b: Pt = [CX + 48, f.hemTop - 24]
    for (const [start, segs] of both([a, [{ to: [a[0] + 7, a[1] - 2] }, { to: [b[0] + 7, b[1] - 2] }, { to: b }]])) {
      out.push({ kind: 'fill', piece: P.pocket, d: path(start, segs) })
    }
    out.push({ kind: 'stitch', piece: P.pocket, d: line(add(a, [3, 1]), add(b, [3, 1])) })
    out.push({ kind: 'stitch', piece: P.pocket, d: line(mirror(add(a, [3, 1])), mirror(add(b, [3, 1]))) })
  } else if (c.pocket === 'solapa') {
    for (const s of [1, -1]) {
      const x0 = s > 0 ? CX + 24 : CX - 64
      out.push({ kind: 'fill', piece: P.pocket, d: rect(x0, f.hemTop - 66, 40, 54, 3) })
      out.push({ kind: 'fill', piece: P.pocket, d: rect(x0 - 1, f.hemTop - 72, 42, 18, 3) })
      out.push({ kind: 'stitch', piece: P.pocket, d: rect(x0 + 3, f.hemTop - 50, 34, 35, 2) })
      out.push({ kind: 'hardware', piece: P.hardware, role: 'button', d: rect(x0 + 17, f.hemTop - 64, 6, 6, 3) })
    }
  } else if (c.pocket === 'pecho') {
    out.push({ kind: 'fill', piece: P.pocket, d: rect(CX + 24, 140, 30, 34, 3) })
    for (const d of offs) out.push({ kind: 'stitch', piece: P.pocket, d: line([CX + 24, 140 + d], [CX + 54, 140 + d]) })
  }
  return out
}

function sleeves(c: TopCfg, f: Frame, front: boolean, offs: number[]): Shape[] {
  const out: Shape[] = []
  const P = TOP_PIECES
  const Cout = add(f.S, mul(f.dir, f.sleeveLen))
  const Cin = add(Cout, mul(f.inward, f.endW))
  const t = f.cuffH ? (f.sleeveLen - f.cuffH) / f.sleeveLen : 1
  const Aout = lerp(f.S, Cout, t)
  const Ain = lerp(f.U, Cin, t)

  const sleeve: [Pt, Seg[]] = [f.S, [{ to: Aout }, { to: Ain }, { to: f.U }]]
  for (const [start, segs] of both(sleeve)) out.push({ kind: 'fill', piece: P.sleeves, d: path(start, segs) })

  const side = (shapes: Shape[]) => shapes.forEach((s) => out.push(s, { ...s, d: mirrorPath(s.d) }))

  if (f.cuffH) {
    const shirt = c.cuff === 'camisero'
    const cOut = shirt ? Cout : add(Cout, mul(f.inward, 3))
    const cIn = shirt ? Cin : sub(Cin, mul(f.inward, 3))
    const mid = lerp(lerp(Aout, Ain, 0.5), lerp(cOut, cIn, 0.5), 0.5)
    side([
      { kind: 'fill', piece: P.cuffs, d: quad(Aout, cOut, cIn, Ain) },
      shirt
        ? { kind: 'hardware', piece: P.buttons, role: 'button', d: rect(mid[0] - 3, mid[1] - 3, 6, 6, 3) }
        : { kind: 'rib', piece: P.cuffs, d: ribLines(Aout, Ain, cOut, cIn) },
      ...offs.map((d): Shape => ({ kind: 'stitch', piece: P.sleeves, d: line(sub(Aout, mul(f.dir, d - 1)), sub(Ain, mul(f.dir, d - 1))) })),
    ])
  } else {
    side(offs.map((d): Shape => ({ kind: 'stitch', piece: P.sleeves, d: line(sub(Cout, mul(f.dir, d + 2)), sub(Cin, mul(f.dir, d + 2))) })))
  }

  // Acolchado: canales a lo ancho de la manga
  if (c.quilt) {
    const n = Math.floor((f.sleeveLen - f.cuffH) / c.quilt)
    side(
      Array.from({ length: n }, (_, i): Shape => {
        const t = ((i + 1) * c.quilt!) / f.sleeveLen
        return { kind: 'stitch', piece: P.sleeves, d: line(lerp(f.S, Cout, t), lerp(f.U, Cin, t)) }
      }),
    )
  }

  // Bolsillo de manga (tipo MA-1), en la manga izquierda de quien la lleva (a la derecha del dibujo delantero)
  if (front && c.sleevePocket && f.long) {
    const o = add(add(f.S, mul(f.dir, 40)), mul(f.inward, 12))
    const corner = (u: number, v: number): Pt => add(add(o, mul(f.inward, u)), mul(f.dir, v))
    out.push({ kind: 'fill', piece: P.pocket, d: quad(corner(0, 0), corner(26, 0), corner(26, 36), corner(0, 36)) })
    out.push({ kind: 'hardware', piece: P.hardware, d: quad(corner(3, 4), corner(23, 4), corner(23, 7), corner(3, 7)) })
    out.push({ kind: 'stitch', piece: P.pocket, d: line(corner(2, 33), corner(24, 33)) })
  }
  return out
}

function neck(c: TopCfg, f: Frame, front: boolean, offs: number[]): Shape[] {
  const out: Shape[] = []
  const P = TOP_PIECES
  const nw = f.nw
  if (c.neck === 'capucha') {
    if (front) {
      out.push({
        kind: 'fill',
        piece: P.hood,
        d: symmetric([CX, 8], [
          { to: [CX + 46, 20], c: [CX + 30, 6] },
          { to: [CX + 60, 66], c: [CX + 60, 34] },
          { to: [CX + nw + 8, 104], c: [CX + 62, 92] },
          { to: [CX + 14, 128], c: [CX + nw + 2, 118] },
          { to: [CX, 134] },
        ]),
      })
      out.push({
        kind: 'shade',
        piece: P.hood,
        d: symmetric([CX, 26], [
          { to: [CX + 30, 40], c: [CX + 24, 26] },
          { to: [CX + 36, 84], c: [CX + 40, 58] },
          { to: [CX + 6, 128], c: [CX + 32, 112] },
          { to: [CX, 130] },
        ]),
      })
      for (const s of [1, -1]) {
        const k = (p: Pt): Pt => (s > 0 ? p : mirror(p))
        out.push({
          kind: 'stitch',
          piece: P.hood,
          d: `${curve(k([CX + 1, 20]), k([CX + 28, 20]), k([CX + 35, 36]))} ${curve(k([CX + 35, 36]), k([CX + 46, 58]), k([CX + 42, 86]))} ${curve(k([CX + 42, 86]), k([CX + 38, 116]), k([CX + 10, 130]))}`,
        })
      }
    } else {
      out.push({
        kind: 'fill',
        piece: P.hood,
        d: symmetric([CX, 10], [
          { to: [CX + 44, 16], c: [CX + 28, 6] },
          { to: [CX + 60, 64], c: [CX + 60, 32] },
          { to: [CX + nw + 8, 106], c: [CX + 62, 94] },
          { to: [CX, 112], c: [CX + nw - 4, 112] },
        ]),
      })
      out.push({ kind: 'line', piece: P.hood, d: line([CX, 10], [CX, 112]) })
      for (const d of offs) {
        out.push({ kind: 'stitch', piece: P.hood, d: line([CX + d - 1, 12], [CX + d - 1, 110]) })
        out.push({ kind: 'stitch', piece: P.hood, d: line([CX - d + 1, 12], [CX - d + 1, 110]) })
      }
    }
    return out
  }

  if (c.neck === 'bomber') {
    if (front) {
      const collar: [Pt, Seg[]] = [
        [CX + 3, 116],
        [{ to: [CX + nw + 2, 100], c: [CX + nw * 0.8, 114] }, { to: [CX + nw - 2, 84] }, { to: [CX + 4, 98], c: [CX + nw * 0.6, 94] }],
      ]
      for (const [start, segs] of both(collar)) out.push({ kind: 'fill', piece: P.collar, d: path(start, segs) })
      out.push({ kind: 'shade', piece: P.collar, d: symmetric([CX, 86], [{ to: [CX + nw - 3, 84] }, { to: [CX + 4, 98], c: [CX + nw * 0.6, 94] }, { to: [CX, 98] }]) })
      out.push({ kind: 'rib', piece: P.collar, d: ribLines([CX + 4, 98], [CX + nw - 2, 84], [CX + 4, 115], [CX + nw + 2, 100]) })
      out.push({ kind: 'rib', piece: P.collar, d: ribLines(mirror([CX + 4, 98]), mirror([CX + nw - 2, 84]), mirror([CX + 4, 115]), mirror([CX + nw + 2, 100])) })
    } else {
      out.push({
        kind: 'fill',
        piece: P.collar,
        d: symmetric([CX, 84], [{ to: [CX + nw - 2, 84] }, { to: [CX + nw + 2, 100] }, { to: [CX, 104], c: [CX + nw * 0.7, 104] }]),
      })
      out.push({ kind: 'rib', piece: P.collar, d: ribLines([CX - nw + 2, 84], [CX + nw - 2, 84], [CX - nw - 2, 101], [CX + nw + 2, 101]) })
    }
    return out
  }

  if (c.neck !== 'redondo' && c.neck !== 'pico') return [...out, ...collar(c.neck, nw, front, offs)]

  // Cuello de canalé redondo o de pico
  if (front) {
    const v = c.neck === 'pico'
    const innerY = v ? 140 : 114
    const outerY = v ? 150 : 122
    const band: [Pt, Seg[]] = [
      [CX, innerY],
      [
        v ? { to: [CX + nw - 6, 98] } : { to: [CX + nw - 6, 98], c: [CX + nw * 0.8, innerY - 1] },
        { to: f.neckPt },
        v ? { to: [CX, outerY] } : { to: [CX, outerY], c: [CX + nw * 0.95, outerY - 2] },
      ],
    ]
    out.push({ kind: 'shade', piece: P.collar, d: symmetric([CX, 100], [{ to: [CX + nw - 6, 98], c: [CX + nw * 0.6, 103] }, { to: [CX + nw - 5, 101] }, { to: [CX, 106], c: [CX + nw * 0.6, 108] }]) })
    out.push({ kind: 'fill', piece: P.collar, d: symmetric(band[0], band[1]) })
    for (const d of offs) {
      const o = d - 1
      out.push({
        kind: 'stitch',
        piece: P.body,
        d: v
          ? line([CX - nw, 100 + o], [CX, outerY + o], [CX + nw, 100 + o])
          : `${curve([CX - nw, 100 + o], [CX - nw * 0.95, outerY - 2 + o], [CX, outerY + o])} ${curve([CX, outerY + o], [CX + nw * 0.95, outerY - 2 + o], [CX + nw, 100 + o])}`,
      })
    }
  } else {
    out.push({
      kind: 'fill',
      piece: P.collar,
      d: symmetric([CX, 100], [{ to: [CX + nw - 6, 97], c: [CX + nw * 0.6, 100] }, { to: f.neckPt }, { to: [CX, 106], c: [CX + nw * 0.7, 106] }]),
    })
  }
  return out
}

/** Cuellos con forma propia: polo, camisero, mao, alto, solapa y cubano (de frente y de espalda). */
function collar(neck: Neck, nw: number, front: boolean, offs: number[]): Shape[] {
  const P = TOP_PIECES
  const out: Shape[] = []
  const both2 = (shape: [Pt, Seg[]], kind: Shape['kind'] = 'fill') => {
    for (const [start, segs] of both(shape)) out.push({ kind, piece: P.collar, d: path(start, segs) })
  }

  if (!front) {
    // Por detrás todos se ven como una tira alrededor del cuello, más alta en el cuello alto
    const top = neck === 'alto' ? 66 : 84
    const wide = neck === 'solapa' ? 8 : neck === 'alto' ? 5 : 5
    out.push({
      kind: 'fill',
      piece: P.collar,
      d: symmetric([CX, top], [{ to: [CX + nw - (neck === 'alto' ? -2 : 2), top] }, { to: [CX + nw + wide, 102], c: [CX + nw + wide, top + 8] }, { to: [CX, 108], c: [CX + nw * 0.8, 108] }]),
    })
    // Pliegue del cuello vuelto (polo, camisero, solapa, cubano)
    if (neck !== 'mao' && neck !== 'alto') out.push({ kind: 'line', piece: P.collar, d: curve([CX - nw - 2, 94], [CX, 98], [CX + nw + 2, 94]) })
    for (const d of offs) out.push({ kind: 'stitch', piece: P.collar, d: curve([CX - nw - 2, 104 - d], [CX, 106 - d], [CX + nw + 2, 104 - d]) })
    return out
  }

  if (neck === 'polo' || neck === 'camisero') {
    // Cuello vuelto: dos alas que salen de la nuca y acaban en punta sobre el pecho
    const tip: Pt = neck === 'polo' ? [CX + nw + 10, 138] : [CX + nw + 6, 136]
    // Interior del cuello por detrás, hasta donde se juntan las alas (si no, entre ellas se ve el fondo)
    out.push({ kind: 'shade', piece: P.collar, d: symmetric([CX, 90], [{ to: [CX + nw - 5, 90] }, { to: [CX + 4, 108], c: [CX + nw * 0.55, 96] }, { to: [CX + 2, 119] }, { to: [CX, 119] }]) })
    both2([
      [CX + 2, 118],
      [
        { to: tip, c: [CX + nw * 0.6, 128] },
        { to: [CX + nw + 3, 100], c: [CX + nw + 9, 114] },
        { to: [CX + nw - 5, 90] },
        { to: [CX + 4, 108], c: [CX + nw * 0.55, 96] },
      ],
    ])
    // Pespunte junto al borde del ala, en las dos
    for (const d of offs) {
      const a: Pt = [CX + 4, 118 - d * 0.3]
      const b: Pt = [CX + nw * 0.6 + d * 0.3, 128 - d]
      const t: Pt = [tip[0] - d * 0.8, tip[1] - d]
      out.push({ kind: 'stitch', piece: P.collar, d: curve(a, b, t) })
      out.push({ kind: 'stitch', piece: P.collar, d: curve(mirror(a), mirror(b), mirror(t)) })
    }
    return out
  }

  if (neck === 'mao') {
    // Tira recta alrededor del cuello, abierta en el centro
    both2([
      [CX + 1, 116],
      [{ to: [CX + 1, 100] }, { to: [CX + nw - 4, 86], c: [CX + nw * 0.5, 98] }, { to: [CX + nw + 2, 98] }, { to: [CX + 1, 116], c: [CX + nw * 0.6, 114] }],
    ])
    for (const d of offs) out.push({ kind: 'stitch', piece: P.collar, d: curve([CX - nw + 2, 98 + d * 0.3], [CX, 114 - d], [CX + nw - 2, 98 + d * 0.3]) })
    return out
  }

  if (neck === 'alto') {
    // Cuello alto (cisne o de chaqueta acolchada): un tubo que sube por encima del escote
    out.push({
      kind: 'fill',
      piece: P.collar,
      d: symmetric([CX, 70], [{ to: [CX + nw + 2, 66], c: [CX + nw * 0.6, 72] }, { to: [CX + nw + 5, 102], c: [CX + nw + 6, 84] }, { to: [CX, 110], c: [CX + nw * 0.8, 110] }]),
    })
    out.push({ kind: 'shade', piece: P.collar, d: symmetric([CX, 66], [{ to: [CX + nw - 1, 65], c: [CX + nw * 0.5, 62] }, { to: [CX, 74], c: [CX + nw * 0.6, 74] }]) })
    for (const d of offs) out.push({ kind: 'stitch', piece: P.collar, d: curve([CX - nw - 4, 102 - d], [CX, 108 - d], [CX + nw + 4, 102 - d]) })
    return out
  }

  // Solapa (chaqueta, con muesca) y cubano (cuello abierto de camisa): solapas en pico hasta `by`
  const notch = neck === 'solapa'
  const by = NECK_Y[neck]
  const s = notch ? 1 : 0.62
  out.push({
    kind: 'shade',
    piece: P.collar,
    d: symmetric([CX, 92], [{ to: [CX + nw - 4, 90] }, { to: [CX + 8, 110], c: [CX + nw * 0.6, 96] }, { to: [CX + 2, by] }, { to: [CX, by] }]),
  })
  both2([
    [CX + 2, by],
    [
      { to: [CX + nw + 22 * s, by - 52 * s], c: [CX + nw + 14 * s, by - 20 * s] },
      { to: [CX + nw + 24 * s, by - 72 * s] },
      ...(notch ? [{ to: [CX + nw + 12, by - 70] as Pt }, { to: [CX + nw + 14, by - 82] as Pt }] : []),
      { to: [CX + nw + 6, 96] },
      { to: [CX + nw - 4, 90] },
      { to: [CX + 8, 110], c: [CX + nw * 0.6, 96] },
      { to: [CX + 2, by] },
    ],
  ])
  // Línea del pliegue de la solapa
  out.push({ kind: 'line', piece: P.collar, d: line([CX + 4, by - 6], [CX + nw + 4, 100]) })
  out.push({ kind: 'line', piece: P.collar, d: line(mirror([CX + 4, by - 6]), mirror([CX + nw + 4, 100])) })
  return out
}

/** Canales del acolchado en el cuerpo: líneas horizontales recortadas al contorno (sisa incluida). */
function quilting(f: Frame, step: number): Shape[] {
  const xAt = (y: number) => {
    if (y >= f.U[1]) return f.F.half
    if (y <= f.S[1]) return f.S[0] - CX
    return f.S[0] - CX + ((f.U[0] - f.S[0]) * (y - f.S[1])) / (f.U[1] - f.S[1])
  }
  const out: Shape[] = []
  for (let y = 128; y < f.hemTop - step * 0.5; y += step) {
    const x = xAt(y) - 2
    out.push({ kind: 'stitch', piece: TOP_PIECES.body, d: line([CX - x, y], [CX + x, y]) })
  }
  return out
}

/** Tapeta delantera con sus botones: corta (polo, henley) o hasta el bajo (camisa). */
function placket(c: TopCfg, f: Frame, top: number, offs: number[]): Shape[] {
  const P = TOP_PIECES
  const full = c.placket === 'completa'
  const bottom = full ? f.hemTop + (c.hem === 'curvo' ? 6 : 0) : top + 26 + (c.buttons ?? 3) * 18
  const w = 7
  const out: Shape[] = [
    { kind: 'fill', piece: P.placket, d: rect(CX - w, top, w * 2, bottom - top) },
    ...offs.map((d): Shape => ({ kind: 'stitch', piece: P.placket, d: line([CX + w - d + 2, top + 2], [CX + w - d + 2, bottom - (full ? 2 : 4)]) })),
  ]
  if (!full) out.push({ kind: 'stitch', piece: P.placket, d: line([CX - w + 1, bottom - 3], [CX + w - 1, bottom - 3]) })
  // Botones: repartidos por la tapeta (en la camisa, uno cada ~10 cm)
  const n = full ? Math.max(3, Math.round((bottom - top) / 44)) : (c.buttons ?? 3)
  const gap = (bottom - top - (full ? 24 : 18)) / Math.max(1, n - (full ? 1 : 0))
  for (let i = 0; i < n; i++) {
    const y = top + 12 + i * gap
    out.push({ kind: 'hardware', piece: P.buttons, role: 'button', d: rect(CX - 3.2, y - 3.2, 6.4, 6.4, 3.2) })
  }
  return out
}

function zipper(top: number, bottom: number, piece: string, offs: number[]): Shape[] {
  return [
    { kind: 'hardware', piece, role: 'zip', d: rect(CX - 3, top, 6, bottom - top) },
    ...offs.flatMap((d): Shape[] => [
      { kind: 'stitch', piece, d: line([CX - 3 - d, top + 2], [CX - 3 - d, bottom - 2]) },
      { kind: 'stitch', piece, d: line([CX + 3 + d, top + 2], [CX + 3 + d, bottom - 2]) },
    ]),
  ]
}

function drawSide(c: TopCfg, f: Frame): Shape[] {
  const out: Shape[] = []
  const P = TOP_PIECES
  const d = f.F.half * 0.6
  const offs = c.stitch === 'doble' ? [4, 8] : [4]

  // Capucha por detrás del cuerpo
  if (c.neck === 'capucha') {
    out.push({
      kind: 'fill',
      piece: P.hood,
      d: path([CX + 18, 114], [{ to: [CX + 8, 36], c: [CX + 30, 70] }, { to: [CX - 36, 42], c: [CX - 14, 16] }, { to: [CX - 30, 116], c: [CX - 56, 78] }]),
    })
    out.push({ kind: 'shade', piece: P.hood, d: path([CX + 18, 114], [{ to: [CX + 8, 36], c: [CX + 30, 70] }, { to: [CX + 10, 112], c: [CX + 19, 66] }]) })
    out.push({ kind: 'stitch', piece: P.hood, d: curve([CX + 14, 110], [CX + 25, 68], [CX + 6, 40]) })
  }

  // Cuerpo
  out.push({
    kind: 'fill',
    piece: P.body,
    d: path([CX - d + 4, 108], [
      { to: [CX + d - 6, 110], c: [CX, 98] },
      { to: [CX + d, 168], c: [CX + d + 4, 128] },
      { to: [CX + d - 1, f.hemTop] },
      { to: [CX - d + 1, f.hemTop] },
      { to: [CX - d, 168] },
      { to: [CX - d + 4, 108], c: [CX - d - 3, 130] },
    ]),
  })
  if (f.ribH) {
    out.push({ kind: 'fill', piece: P.hem, d: quad([CX - d + 1, f.hemTop], [CX + d - 1, f.hemTop], [CX + d - 3, f.hemY], [CX - d + 3, f.hemY]) })
    out.push({ kind: 'rib', piece: P.hem, d: ribLines([CX - d + 1, f.hemTop], [CX + d - 1, f.hemTop], [CX - d + 3, f.hemY], [CX + d - 3, f.hemY]) })
  } else {
    for (const o of offs) out.push({ kind: 'stitch', piece: P.body, d: line([CX - d + 2, f.hemY - o - 2], [CX + d - 2, f.hemY - o - 2]) })
  }

  // Bolsillos vistos de lado
  if (c.pocket === 'canguro') {
    out.push({ kind: 'line', piece: P.pocket, d: curve([CX + d - 1, f.hemTop - 96], [CX + d - 20, f.hemTop - 50], [CX + d - 8, f.hemTop]) })
  } else if (c.pocket === 'solapa') {
    out.push({ kind: 'fill', piece: P.pocket, d: rect(CX + d - 20, f.hemTop - 70, 17, 58, 3) })
  }

  // Cremallera en el borde delantero
  if (c.zip !== 'ninguna') {
    const end = c.zip === 'completa' ? f.hemY : 200
    out.push({ kind: 'hardware', piece: P.hardware, d: quad([CX + d - 7, 112], [CX + d - 3, 112], [CX + d - 1, end], [CX + d - 5, end]) })
  }

  // Cuello
  if (c.neck === 'redondo' || c.neck === 'pico') {
    out.push({ kind: 'fill', piece: P.collar, d: path([CX - 16, 102], [{ to: [CX + 14, 112], c: [CX, 108] }, { to: [CX + 16, 104] }, { to: [CX - 14, 96], c: [CX, 100] }]) })
  } else if (c.neck === 'bomber') {
    out.push({ kind: 'fill', piece: P.collar, d: path([CX - 18, 100], [{ to: [CX + 18, 112], c: [CX, 110] }, { to: [CX + 18, 96] }, { to: [CX - 16, 84], c: [CX, 88] }]) })
    out.push({ kind: 'rib', piece: P.collar, d: ribLines([CX - 16, 85], [CX + 18, 96], [CX - 18, 100], [CX + 18, 112]) })
  } else if (c.neck === 'alto') {
    out.push({ kind: 'fill', piece: P.collar, d: path([CX - 20, 104], [{ to: [CX + 20, 112], c: [CX, 112] }, { to: [CX + 18, 70] }, { to: [CX - 18, 64], c: [CX, 64] }]) })
  } else if (c.neck !== 'capucha') {
    // Cuellos vueltos y mao vistos de lado
    out.push({ kind: 'fill', piece: P.collar, d: path([CX - 18, 98], [{ to: [CX + 20, 112], c: [CX + 2, 110] }, { to: [CX + 16, 96] }, { to: [CX - 16, 88], c: [CX, 90] }]) })
  }
  if (c.cords && c.neck === 'capucha') {
    out.push({ kind: 'line', piece: P.cords, d: line([CX + 16, 116], [CX + 20, 190]) })
    out.push({ kind: 'hardware', piece: P.cords, d: rect(CX + 17.5, 190, 5, 12, 2) })
  }

  // Manga, por delante del cuerpo
  const y0 = 112 + f.F.drop * 0.5
  const capW = 54 + f.F.drop * 0.3
  const endY = y0 + f.sleeveLen * 0.96
  const endW = f.long ? f.endW * 0.85 : capW * 0.92
  const sleeveBottom = endY - f.cuffH
  const lean = f.long ? 8 : 3
  const k = f.cuffH ? f.cuffH / (endY - y0) : 0
  const wAt = (t: number) => capW + (endW - capW) * t
  const bw = wAt(1 - k)
  out.push({
    kind: 'fill',
    piece: P.sleeves,
    d: path([CX - capW / 2, y0 + 16], [
      { to: [CX + capW / 2, y0 + 16], c: [CX, y0 - 14] },
      { to: [CX + bw / 2 + lean * (1 - k), sleeveBottom] },
      { to: [CX - bw / 2 + lean * (1 - k), sleeveBottom] },
    ]),
  })
  out.push({ kind: 'stitch', piece: P.sleeves, d: curve([CX - capW / 2 + 4, y0 + 20], [CX, y0 - 8], [CX + capW / 2 - 4, y0 + 20]) })
  if (f.cuffH) {
    const a: Pt = [CX - bw / 2 + lean * (1 - k), sleeveBottom]
    const b: Pt = [CX + bw / 2 + lean * (1 - k), sleeveBottom]
    const cc: Pt = [CX + endW / 2 + lean - 2, endY]
    const dd: Pt = [CX - endW / 2 + lean + 2, endY]
    out.push({ kind: 'fill', piece: P.cuffs, d: quad(a, b, cc, dd) })
    out.push({ kind: 'rib', piece: P.cuffs, d: ribLines(a, b, dd, cc) })
  } else {
    for (const o of offs) {
      out.push({
        kind: 'stitch',
        piece: P.sleeves,
        d: line([CX - bw / 2 + lean + 2, sleeveBottom - o - 2], [CX + bw / 2 + lean - 2, sleeveBottom - o - 2]),
      })
    }
  }
  return out
}

/** Una forma y su reflejo (para piezas que van a los dos lados). */
function both([start, segs]: [Pt, Seg[]]): [Pt, Seg[]][] {
  return [[start, segs], mirrorSegs(start, segs)]
}

/** Refleja los números de un trazo SVG ya construido (solo comandos M, L, Q con coordenadas absolutas). */
export function mirrorPath(d: string) {
  return d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x: string, y: string) => `${Math.round((2 * CX - Number(x)) * 10) / 10} ${y}`)
}
