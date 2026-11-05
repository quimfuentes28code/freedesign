import { CX, curve, line, path, rect, ribLines, symmetric, type Pt } from './geometry'
import type { Shape, View } from './types'

/**
 * Prendas de cabeza: gorro (beanie) y gorra. Se dibujan más grandes que la ropa (ver `HEAD_UNITS_PER_CM`)
 * para que se vean bien en el lienzo; sus estampados y medidas usan esa misma escala.
 */

/** Unidades del lienzo por cm en las prendas de cabeza (la ropa usa 2). */
export const HEAD_UNITS_PER_CM = 8

export const HEAD_PIECES = {
  crown: 'copa',
  cuff: 'vuelta',
  pompom: 'pompon',
  brim: 'visera',
  back: 'trasera',
  button: 'boton',
  closure: 'cierre',
  eyelets: 'ojetes',
} as const

export interface BeanieCfg {
  /** Alto: normal (cubre las orejas) o corto (estilo pescador, por encima de las orejas). */
  height: 'normal' | 'corto'
  cuff: boolean
  pompom: boolean
  /** Punto: canalé (rayas verticales) o liso. */
  knit: 'canale' | 'liso'
}

export interface CapCfg {
  panels: 5 | 6
  brim: 'curva' | 'plana'
  closure: 'snapback' | 'hebilla' | 'velcro' | 'cerrada'
  /** Trasera de malla (gorra trucker). */
  mesh: boolean
  stitch: 'simple' | 'doble'
}

const circle = (c: Pt, r: number) => `M${c[0] - r} ${c[1]}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0Z`

/** Gorro de punto (beanie), de frente, de espaldas (igual) o de lado (un poco más estrecho). */
export function drawBeanie(view: View, c: BeanieCfg): Shape[] {
  const P = HEAD_PIECES
  const out: Shape[] = []
  const w = view === 'side' ? 76 : 88
  const bottom = 300
  const top = c.height === 'corto' ? 150 : 96
  const cuffH = c.cuff ? (c.height === 'corto' ? 46 : 62) : 0
  const shoulder = top + (bottom - top) * 0.36
  // Copa: lados rectos que se cierran en una cúpula
  out.push({
    kind: 'fill',
    piece: P.crown,
    d: symmetric([CX, top], [{ to: [CX + w, shoulder], c: [CX + w, top] }, { to: [CX + w, bottom] }, { to: [CX, bottom] }]),
  })
  if (c.knit === 'canale') out.push({ kind: 'rib', piece: P.crown, d: ribLines([CX - w + 2, shoulder], [CX + w - 2, shoulder], [CX - w + 2, bottom - cuffH], [CX + w - 2, bottom - cuffH], 7) })
  // Menguados de la coronilla
  for (const k of [-1, 1]) out.push({ kind: 'stitch', piece: P.crown, d: curve([CX + k * 4, top + 4], [CX + k * w * 0.45, top + 18], [CX + k * w * 0.62, shoulder - 6]) })
  // Vuelta
  if (c.cuff) {
    out.push({ kind: 'fill', piece: P.cuff, d: rect(CX - w - 3, bottom - cuffH, (w + 3) * 2, cuffH, 6) })
    out.push({ kind: 'rib', piece: P.cuff, d: ribLines([CX - w, bottom - cuffH + 2], [CX + w, bottom - cuffH + 2], [CX - w, bottom - 2], [CX + w, bottom - 2], 7) })
  } else {
    out.push({ kind: 'stitch', piece: P.crown, d: line([CX - w + 3, bottom - 8], [CX + w - 3, bottom - 8]) })
  }
  // Pompón
  if (c.pompom) {
    const r = 34
    out.push({ kind: 'fill', piece: P.pompom, d: circle([CX, top - r + 8], r) })
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2
      out.push({ kind: 'shade', piece: P.pompom, d: line([CX + Math.cos(a) * r * 0.3, top - r + 8 + Math.sin(a) * r * 0.3], [CX + Math.cos(a) * r * 0.85, top - r + 8 + Math.sin(a) * r * 0.85]) })
    }
  }
  return out
}

/** Gorra de visera: de frente, de espaldas (con su cierre) o de lado. */
export function drawCap(view: View, c: CapCfg): Shape[] {
  const P = HEAD_PIECES
  const out: Shape[] = []
  const offs = c.stitch === 'doble' ? [4, 8] : [4]
  const bottom = 250
  const top = 138

  if (view === 'side') {
    // Perfil: la copa de atrás hacia delante y la visera hacia la derecha
    const back = CX - 84
    const front = CX + 64
    out.push({
      kind: 'fill',
      piece: c.mesh ? P.back : P.crown,
      d: path([back, bottom], [{ to: [CX - 20, top], c: [back - 6, top + 6] }, { to: [CX - 4, top] }, { to: [CX - 4, bottom] }]),
    })
    out.push({
      kind: 'fill',
      piece: P.crown,
      d: path([CX - 4, top], [{ to: [front, top + 40], c: [CX + 52, top] }, { to: [front + 4, bottom] }, { to: [CX - 4, bottom] }]),
    })
    out.push({ kind: 'line', piece: P.crown, d: curve([CX - 4, top], [CX - 8, top + 60], [CX - 18, bottom]) })
    for (const o of offs) out.push({ kind: 'stitch', piece: P.crown, d: curve([CX - 4 + o, top + 2], [CX - 8 + o, top + 60], [CX - 18 + o, bottom - 2]) })
    out.push({ kind: 'hardware', piece: P.eyelets, d: circle([CX + 26, top + 26], 3.5) })
    out.push({ kind: 'hardware', piece: P.button, d: rect(CX - 14, top - 7, 20, 8, 4) })
    // Visera
    const drop = c.brim === 'curva' ? 18 : 6
    out.push({
      kind: 'fill',
      piece: P.brim,
      d: path([front - 6, bottom - 8], [{ to: [front + 110, bottom + drop], c: [front + 60, bottom - 10] }, { to: [front + 104, bottom + drop + 10] }, { to: [front - 4, bottom + 6], c: [front + 50, bottom + 8] }]),
    })
    for (const o of offs) out.push({ kind: 'stitch', piece: P.brim, d: curve([front + 4, bottom - 2 + o * 0.6], [front + 60, bottom - 4 + o * 0.6], [front + 100, bottom + drop + o * 0.4]) })
    return out
  }

  // Copa, de frente o de espaldas
  const w = 96
  const crown = symmetric([CX, top], [{ to: [CX + w * 0.72, top + 30], c: [CX + w * 0.5, top] }, { to: [CX + w, bottom], c: [CX + w, top + 64] }, { to: [CX, bottom] }])
  const backView = view === 'back'
  out.push({ kind: 'fill', piece: backView && c.mesh ? P.back : P.crown, d: crown })
  // Paneles delanteros a la vista (de frente): 6 con costura central, 5 con un panel delantero ancho
  if (!backView) {
    if (c.mesh) {
      // Trucker: los laterales son de malla aunque el frontal sea de tela
      out.push({ kind: 'fill', piece: P.back, d: path([CX + w * 0.5, top + 14], [{ to: [CX + w, bottom], c: [CX + w, top + 60] }, { to: [CX + w * 0.62, bottom] }]) })
      out.push({ kind: 'fill', piece: P.back, d: path([CX - w * 0.5, top + 14], [{ to: [CX - w, bottom], c: [CX - w, top + 60] }, { to: [CX - w * 0.62, bottom] }]) })
    }
    const seams: [Pt, Pt, Pt][] =
      c.panels === 6
        ? [
            [[CX, top], [CX, top + 60], [CX, bottom]],
            [[CX + 2, top], [CX + w * 0.5, top + 40], [CX + w * 0.62, bottom]],
            [[CX - 2, top], [CX - w * 0.5, top + 40], [CX - w * 0.62, bottom]],
          ]
        : [
            [[CX + 4, top], [CX + w * 0.46, top + 34], [CX + w * 0.62, bottom]],
            [[CX - 4, top], [CX - w * 0.46, top + 34], [CX - w * 0.62, bottom]],
          ]
    for (const [a, m, b] of seams) {
      out.push({ kind: 'line', piece: P.crown, d: curve(a, m, b) })
      for (const o of offs) out.push({ kind: 'stitch', piece: P.crown, d: curve([a[0] + o, a[1] + 2], [m[0] + o, m[1]], [b[0] + o, b[1] - 2]) })
    }
    for (const x of [CX + w * 0.62, CX - w * 0.62]) out.push({ kind: 'hardware', piece: P.eyelets, d: circle([x, top + 42], 3.5) })
  } else {
    // Espalda: costura central, abertura en arco y el cierre
    out.push({ kind: 'line', piece: P.crown, d: line([CX, top], [CX, bottom - 44]) })
    for (const o of offs) out.push({ kind: 'stitch', piece: P.crown, d: line([CX + o, top + 2], [CX + o, bottom - 46]) })
    if (c.closure !== 'cerrada') {
      out.push({ kind: 'shade', piece: P.crown, d: path([CX - 30, bottom], [{ to: [CX, bottom - 42], c: [CX - 30, bottom - 42] }, { to: [CX + 30, bottom], c: [CX + 30, bottom - 42] }]) })
      const y = bottom - 16
      if (c.closure === 'snapback') {
        out.push({ kind: 'fill', piece: P.closure, d: rect(CX - 40, y, 80, 12, 3) })
        for (const x of [-24, -12, 0, 12, 24]) out.push({ kind: 'hardware', piece: P.closure, d: circle([CX + x, y + 6], 2.5) })
      } else if (c.closure === 'hebilla') {
        out.push({ kind: 'fill', piece: P.closure, d: rect(CX - 40, y + 2, 80, 8, 2) })
        out.push({ kind: 'hardware', piece: P.button, d: rect(CX - 9, y - 2, 18, 16, 2) })
      } else {
        out.push({ kind: 'fill', piece: P.closure, d: rect(CX - 38, y, 76, 12, 2) })
        out.push({ kind: 'stitch', piece: P.closure, d: rect(CX - 34, y + 2, 68, 8, 1) })
      }
    }
  }
  out.push({ kind: 'hardware', piece: P.button, d: circle([CX, top - 2], 7) })

  // Visera (de frente se ve por delante de la copa; de espaldas apenas asoma)
  if (!backView) {
    const drop = c.brim === 'curva' ? 34 : 16
    out.push({
      kind: 'fill',
      piece: P.brim,
      d: symmetric([CX, bottom - 4], [{ to: [CX + w + 14, bottom + 2], c: [CX + w * 0.6, bottom - 6] }, { to: [CX + w + 4, bottom + 14], c: [CX + w + 14, bottom + 10] }, { to: [CX, bottom + drop], c: [CX + w * 0.6, bottom + drop] }]),
    })
    for (let i = 0; i < (c.stitch === 'doble' ? 6 : 4); i++) {
      const t = (i + 1) / ((c.stitch === 'doble' ? 6 : 4) + 1)
      const y = bottom + (drop - 4) * t
      out.push({ kind: 'stitch', piece: P.brim, d: curve([CX - w * (0.95 - t * 0.15), y - 4 + t * 4], [CX, y + drop * 0.25], [CX + w * (0.95 - t * 0.15), y - 4 + t * 4]) })
    }
  }
  return out
}
