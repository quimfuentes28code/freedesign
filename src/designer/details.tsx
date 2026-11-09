import type { Detail, DetailArt, HardwareStyle, PullerStyle, ZipStyle } from '../shared/designs'
import { fileUrl } from '../shared/library'

/**
 * Dibujo de los detalles (botones, cremalleras, ojetes, remaches, herretes, etiquetas, parches, bolsillos, trabillas,
 * cordones, cintas, velcro, hebillas, costuras decorativas y pinzas) como una lista de
 * trazos sencillos centrados en (0, 0). La misma lista se pinta en SVG (el plano) y en canvas (la imagen del 3D).
 */

export type Prim =
  | { t: 'path'; d: string; fill?: string; stroke?: string; sw?: number; dash?: string; opacity?: number }
  | { t: 'image'; file: string; x: number; y: number; w: number; h: number }
  | { t: 'text'; text: string; x: number; y: number; size: number; color: string; bold?: boolean }

const n = (v: number) => Math.round(v * 100) / 100
export const circle = (cx: number, cy: number, r: number) => `M${n(cx - r)} ${n(cy)}a${n(r)} ${n(r)} 0 1 0 ${n(2 * r)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-2 * r)} 0Z`
export const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
  r = Math.min(r, w / 2, h / 2)
  return `M${n(x + r)} ${n(y)}H${n(x + w - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + w)} ${n(y + r)}V${n(y + h - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + w - r)} ${n(y + h)}H${n(x + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x)} ${n(y + h - r)}V${n(y + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + r)} ${n(y)}Z`
}

/** Color más claro (f > 0) o más oscuro (f < 0). */
export function shade(hex: string, f: number) {
  const v = parseInt(hex.slice(1), 16)
  const ch = (s: number) => {
    const c = (v >> s) & 255
    return Math.round(f >= 0 ? c + (255 - c) * f : c * (1 + f))
  }
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`
}

/** Un ajuste de forma de un detalle: un número (deslizador) o una de varias opciones. */
export interface ShapeParam {
  id: string
  label: string
  min: number
  max: number
  step: number
  def: number
  /** Si se elige entre opciones, sus nombres (el valor es su posición). */
  choices?: string[]
  /** Cómo se enseña el valor (por defecto, en %). */
  unit?: '%' | ''
}

const ALTO: ShapeParam = { id: 'alto', label: 'Alto', min: 0.4, max: 2.5, step: 0.05, def: 1 }
const POINT: ShapeParam = { id: 'pico', label: 'Profundidad del pico', min: 0.05, max: 1, step: 0.05, def: 0.35 }

const FONDO: ShapeParam = { id: 'fondo', label: 'Fondo', min: 0, max: 4, step: 1, def: 0, choices: ['Recto', 'En pico', 'Redondo', 'Doble pico', 'Esquinas cortadas'] }
/** Ajustes libres de la forma de un bolsillo de parche (además de fondo, pico, esquinas y alto). */
const POCKET_FREE: ShapeParam[] = [
  { id: 'boca', label: 'Ancho de la boca', min: 0.6, max: 1.4, step: 0.05, def: 1 },
  { id: 'abajo', label: 'Ancho del fondo', min: 0.5, max: 1.5, step: 0.05, def: 1 },
  { id: 'inclinada', label: 'Boca inclinada', min: -0.4, max: 0.4, step: 0.02, def: 0 },
  { id: 'curva', label: 'Boca curva', min: -1, max: 1, step: 0.05, def: 0 },
  { id: 'lados', label: 'Lados curvos (− hacia dentro, + hacia fuera)', min: -1, max: 1, step: 0.05, def: 0 },
  { id: 'picoCurva', label: 'Curva del fondo o del pico', min: -1, max: 1, step: 0.05, def: 0 },
  { id: 'solapa', label: 'Solapa', min: 0, max: 3, step: 1, def: 0, choices: ['Sin solapa', 'Recta', 'En pico', 'Redonda'] },
  { id: 'solapaAlto', label: 'Alto de la solapa', min: 0.12, max: 0.5, step: 0.02, def: 0.28 },
  { id: 'boton', label: 'Botón en la solapa', min: 0, max: 1, step: 1, def: 0, choices: ['No', 'Sí'] },
]
/** Forma de los bolsillos que trae la prenda (al elegir la pieza «Bolsillos»). */
export const POCKET_SHAPE_PARAMS: ShapeParam[] = [
  FONDO,
  POINT,
  { id: 'esquinas', label: 'Esquinas redondeadas', min: 0, max: 1, step: 0.05, def: 0.1 },
  ALTO,
  ...POCKET_FREE,
]

/** Forma que se puede ajustar en cada tipo de detalle. */
export const SHAPE_PARAMS: Partial<Record<Detail['kind'], ShapeParam[]>> = {
  bolsillo: [
    ALTO,
    { id: 'esquinas', label: 'Esquinas redondeadas', min: 0, max: 1, step: 0.05, def: 0.2 },
    FONDO,
    POINT,
    { id: 'tapeta', label: 'Alto de la tapeta (cargo)', min: 0.4, max: 2, step: 0.05, def: 1 },
    ...POCKET_FREE,
  ],
  parche: [ALTO],
  etiqueta: [ALTO],
  trabilla: [ALTO],
  velcro: [ALTO],
  roto: [
    ALTO,
    { id: 'hilos', label: 'Hilos que cruzan', min: 0, max: 16, step: 1, def: 7, unit: '' },
    { id: 'irregular', label: 'Borde irregular', min: 0, max: 0.5, step: 0.02, def: 0.18 },
    { id: 'flecos', label: 'Hilos sueltos en el borde', min: 0, max: 3, step: 0.1, def: 1 },
  ],
  deshilachado: [
    { id: 'densidad', label: 'Cuánto se deshilacha (hilos)', min: 0.2, max: 3, step: 0.1, def: 1 },
    { id: 'irregular', label: 'Largo desigual de los hilos', min: 0, max: 1, step: 0.05, def: 0.6 },
    { id: 'curva', label: 'Hilos ondulados', min: 0, max: 1, step: 0.05, def: 0.15 },
  ],
  desgaste: [
    ALTO,
    { id: 'intensidad', label: 'Intensidad', min: 0.2, max: 3, step: 0.1, def: 1 },
  ],
}

/** Valor de un ajuste de forma (el propio o el de partida). */
export function shapeOf(d: Pick<Detail, 'kind' | 'shape'>, id: string) {
  return d.shape?.[id] ?? SHAPE_PARAMS[d.kind]?.find((p) => p.id === id)?.def ?? 1
}

/** Alto / ancho de un detalle (su caja), para moverlo y escalarlo. */
export function detailAspect(d: Pick<Detail, 'kind' | 'style' | 'length' | 'w' | 'art'> & { shape?: Detail['shape'] }) {
  const tall = SHAPE_PARAMS[d.kind]?.some((p) => p.id === 'alto') ? shapeOf(d, 'alto') : 1
  return baseAspect(d) * tall
}

function baseAspect(d: Pick<Detail, 'kind' | 'style' | 'length' | 'w' | 'art'>) {
  switch (d.kind) {
    case 'cremallera':
    case 'cordon':
    case 'cinta':
    case 'costura':
    case 'pinza':
    case 'deshilachado':
      return (d.length ?? 120) / d.w
    case 'roto':
      return d.style === 'agujero' ? 0.8 : d.style === 'cortes' ? 0.75 : 0.6
    case 'desgaste':
      return d.style === 'bigotes' ? 0.5 : 0.7
    case 'bolsillo':
      return POCKET_ASPECT[d.style] ?? 1.15
    case 'trabilla':
      return 2.6
    case 'velcro':
      return 0.55
    case 'hebilla':
      return d.style === 'clip' ? 0.6 : d.style === 'anillas' ? 0.75 : 1
    case 'etiqueta':
      return 0.42
    case 'herrete':
      return 2.8
    case 'parche':
      return d.style === 'redondo' ? 1 : d.style === 'escudo' ? 1.15 : 0.7
    case 'boton':
      return d.style === 'trenca' ? 3.2 : d.style === 'logo' && d.art ? d.art.aspect : 1
    default:
      return 1
  }
}

/** Alto / ancho de cada bolsillo. */
const POCKET_ASPECT: Record<string, number> = { parche: 1.15, vivo: 0.2, cargo: 1.3, cremallera: 0.16 }

// --- Fornituras ---

export function buttonPrims(style: string, w: number, color: string, art?: DetailArt | null): Prim[] {
  const edge = shade(color, -0.4)
  const r = w / 2
  if (style === 'logo' && art) return [{ t: 'image', file: art.file, x: -w / 2, y: (-w * art.aspect) / 2, w, h: w * art.aspect }]
  if (style === 'trenca') {
    const h = w * 3.2
    return [
      { t: 'path', d: roundRect(-w / 2, -h / 2, w, h, w / 2), fill: color, stroke: edge, sw: Math.max(0.4, w * 0.08) },
      { t: 'path', d: `M${n(-w * 0.15)} ${n(-h * 0.32)}L${n(-w * 0.12)} ${n(h * 0.32)}M${n(w * 0.12)} ${n(-h * 0.28)}L${n(w * 0.16)} ${n(h * 0.3)}`, stroke: shade(color, -0.22), sw: Math.max(0.3, w * 0.05) },
    ]
  }
  const base: Prim = { t: 'path', d: circle(0, 0, r), fill: color, stroke: edge, sw: Math.max(0.4, w * 0.07) }
  if (style === 'automatico') {
    return [base, { t: 'path', d: circle(0, 0, r * 0.62), fill: shade(color, 0.18), stroke: shade(color, -0.3), sw: Math.max(0.3, w * 0.05) }, { t: 'path', d: circle(0, 0, r * 0.2), fill: shade(color, -0.45) }]
  }
  if (style === 'pie') {
    return [base, { t: 'path', d: circle(-r * 0.3, -r * 0.3, r * 0.35), fill: '#ffffff', opacity: 0.35 }]
  }
  const holes = style === '2' ? [[-0.24, 0], [0.24, 0]] : [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]]
  return [
    base,
    { t: 'path', d: circle(0, 0, r * 0.74), stroke: shade(color, -0.2), sw: Math.max(0.3, w * 0.045) },
    ...holes.map(([x, y]): Prim => ({ t: 'path', d: circle(x * r, y * r, Math.max(0.35, r * 0.13)), fill: shade(color, -0.55) })),
  ]
}

const metalPrims = (w: number, color: string, hole: number): Prim[] => [
  { t: 'path', d: circle(0, 0, w / 2), fill: color, stroke: shade(color, -0.4), sw: Math.max(0.4, w * 0.08) },
  { t: 'path', d: circle(0, 0, (w / 2) * hole), fill: hole > 0.4 ? '#1d1c1a' : shade(color, -0.2) },
  { t: 'path', d: circle(-w * 0.14, -w * 0.14, w * 0.12), fill: '#ffffff', opacity: 0.45 },
]

/**
 * Cremallera vertical centrada en (0, 0): cinta de ancho `w` y largo `L`, dientes según el tipo y el tirador arriba.
 * `teeth` es el color de los dientes y el tirador; `tape` el de la cinta.
 */
export function zipperPrims(style: ZipStyle | string, puller: PullerStyle | string, w: number, L: number, teeth: string, tape: string, art?: DetailArt | null): Prim[] {
  const top = -L / 2
  const out: Prim[] = [{ t: 'path', d: `M${n(-w / 2)} ${n(top)}h${n(w)}v${n(L)}h${n(-w)}Z`, fill: tape, stroke: shade(tape, -0.35), sw: 0.4 }]
  if (style === 'invisible') {
    out.push({ t: 'path', d: `M0 ${n(top)}V${n(L / 2)}`, stroke: shade(tape, -0.4), sw: 0.5 })
  } else if (style === 'nylon') {
    let d = `M0 ${n(top + 2)}`
    for (let y = top + 2, i = 0; y < L / 2 - 1; y += 1.4, i++) d += `L${n((i % 2 ? 1 : -1) * w * 0.18)} ${n(y + 0.7)}`
    out.push({ t: 'path', d, stroke: teeth, sw: 0.55 })
  } else {
    const big = style === 'vislon'
    const step = big ? 2.6 : 2.1
    const th = big ? 1.5 : 1.1
    let d = ''
    for (let y = top + 2, i = 0; y < L / 2 - 1; y += step, i++) {
      const x = i % 2 ? 0 : -w * 0.26
      d += `M${n(x)} ${n(y)}h${n(w * 0.26)}v${n(th)}h${n(-w * 0.26)}Z`
    }
    out.push({ t: 'path', d, fill: teeth, stroke: shade(teeth, -0.35), sw: 0.15 })
  }
  // Cursor y tirador
  const sw = w * 0.56
  out.push({ t: 'path', d: roundRect(-sw / 2, top + 0.5, sw, w * 0.9, 1), fill: teeth, stroke: shade(teeth, -0.4), sw: 0.35 })
  const py = top + w * 0.9
  if (puller === 'logo' && art) {
    const pw = w * 1.3
    out.push({ t: 'image', file: art.file, x: -pw / 2, y: py, w: pw, h: pw * art.aspect })
  } else if (puller === 'aro') {
    out.push({ t: 'path', d: circle(0, py + w * 0.55, w * 0.42), stroke: teeth, sw: w * 0.16 })
  } else if (puller === 'cordon') {
    out.push({ t: 'path', d: `M0 ${n(py)}L${n(w * 0.12)} ${n(py + w * 2.4)}`, stroke: shade(teeth, -0.2), sw: Math.max(0.6, w * 0.16) })
    out.push({ t: 'path', d: roundRect(-w * 0.15, py + w * 2.3, w * 0.5, w * 0.7, w * 0.2), fill: shade(teeth, -0.3) })
  } else {
    const pw = w * 0.5
    out.push({ t: 'path', d: roundRect(-pw / 2, py, pw, w * 1.4, pw * 0.4), fill: teeth, stroke: shade(teeth, -0.4), sw: 0.35 })
    out.push({ t: 'path', d: roundRect(-pw * 0.2, py + w * 0.85, pw * 0.4, w * 0.35, pw * 0.2), fill: shade(teeth, -0.5) })
  }
  return out
}

// --- Etiquetas y parches ---

function shield(w: number, h: number) {
  const x = w / 2
  const y = h / 2
  return `M${n(-x)} ${n(-y)}H${n(x)}V${n(y * 0.15)}C${n(x)} ${n(y * 0.65)} ${n(x * 0.45)} ${n(y * 0.9)} 0 ${n(y)}C${n(-x * 0.45)} ${n(y * 0.9)} ${n(-x)} ${n(y * 0.65)} ${n(-x)} ${n(y * 0.15)}Z`
}

function patchOutline(style: string, w: number, h: number, inset = 0) {
  const ww = w - inset * 2
  const hh = h - inset * 2
  if (style === 'redondo') return circle(0, 0, ww / 2)
  if (style === 'escudo') return shield(ww, hh)
  return roundRect(-ww / 2, -hh / 2, ww, hh, Math.min(ww, hh) * 0.12)
}

/** Texto en el centro con un tamaño que quepa en `maxW`. */
const centeredText = (text: string, maxW: number, maxH: number, color: string, bold = true): Prim => ({
  t: 'text',
  text,
  x: 0,
  y: 0,
  size: Math.min(maxH, (maxW / Math.max(1, text.length)) * 1.7),
  color,
  bold,
})

export function patchPrims(d: Pick<Detail, 'style' | 'w' | 'color' | 'color2' | 'text' | 'art' | 'shape'>, label = false): Prim[] {
  const h = d.w * detailAspect({ kind: label ? 'etiqueta' : 'parche', style: d.style, w: d.w, shape: d.shape })
  const style = label ? 'rect' : d.style
  const border = Math.max(0.8, d.w * (label ? 0.025 : 0.06))
  const out: Prim[] = [
    { t: 'path', d: patchOutline(style, d.w, h), fill: d.color, stroke: d.color2, sw: border },
    { t: 'path', d: patchOutline(style, d.w, h, border * 1.6), stroke: shade(d.color2, 0.15), sw: Math.max(0.25, border * 0.35), dash: `${n(border)} ${n(border * 0.8)}` },
  ]
  if (d.art) {
    const aw = d.w * 0.68
    const ah = Math.min(h * 0.68, aw * d.art.aspect)
    const aw2 = ah / d.art.aspect
    out.push({ t: 'image', file: d.art.file, x: -aw2 / 2, y: -ah / 2, w: aw2, h: ah })
  } else if (d.text) {
    out.push(centeredText(d.text, d.w * 0.78, h * 0.5, d.color2))
  }
  return out
}

/** Trazos de un detalle colocado a mano. */
export function detailPrims(d: Detail): Prim[] {
  switch (d.kind) {
    case 'boton':
      return buttonPrims(d.style, d.w, d.color, d.art)
    case 'cremallera':
      return zipperPrims(d.style, d.puller ?? 'clasico', d.w, d.length ?? 120, d.color, d.color2, d.art)
    case 'ojal':
      return metalPrims(d.w, d.color, 0.52)
    case 'remache':
      return metalPrims(d.w, d.color, 0.3)
    case 'herrete': {
      const h = d.w * 2.8
      return [
        { t: 'path', d: roundRect(-d.w / 2, -h / 2, d.w, h, d.w * 0.3), fill: d.color, stroke: shade(d.color, -0.4), sw: Math.max(0.3, d.w * 0.08) },
        { t: 'path', d: `M${n(-d.w / 2)} ${n(-h * 0.3)}h${n(d.w)}M${n(-d.w / 2)} ${n(h * 0.3)}h${n(d.w)}`, stroke: shade(d.color, -0.3), sw: Math.max(0.25, d.w * 0.06) },
      ]
    }
    case 'etiqueta':
      return patchPrims(d, true)
    case 'parche':
      return patchPrims(d)
    case 'bolsillo':
      return pocketPrims(d.style, d.w, d.color, d.color2, d.shape)
    case 'trabilla': {
      const h = d.w * 2.6 * shapeOf(d, 'alto')
      return [
        { t: 'path', d: roundRect(-d.w / 2, -h / 2, d.w, h, d.w * 0.15), fill: d.color, stroke: shade(d.color, -0.45), sw: Math.max(0.4, d.w * 0.06) },
        { t: 'path', d: `M${n(-d.w * 0.4)} ${n(-h * 0.38)}H${n(d.w * 0.4)}M${n(-d.w * 0.4)} ${n(h * 0.38)}H${n(d.w * 0.4)}`, stroke: d.color2, sw: Math.max(0.4, d.w * 0.12) },
      ]
    }
    case 'cordon':
      return cordPrims(d.style, d.w, d.length ?? 80, d.color, d.color2)
    case 'cinta':
      return tapePrims(d.style, d.w, d.length ?? 120, d.color, d.color2)
    case 'velcro':
      return velcroPrims(d.w, d.color, d.color2, shapeOf(d, 'alto'))
    case 'hebilla':
      return bucklePrims(d.style, d.w, d.color, d.color2)
    case 'costura':
      return stitchPrims(d.style, d.w, d.length ?? 80, d.color)
    case 'pinza':
      return dartPrims(d.w, d.length ?? 40, d.color)
    case 'roto':
      return ripPrims(d.style, d.w, d.color, d.color2, d.shape)
    case 'deshilachado':
      return frayPrims(d.style, d.w, d.length ?? 120, d.color, d.color2, d.shape)
    case 'desgaste':
      return wearPrims(d.style, d.w, d.color, d.shape)
  }
}

// --- Bolsillos, trabillas, cordones, cintas, velcro, hebillas, costuras y pinzas ---

/** Pespunte discontinuo (de `color`) del tamaño del detalle. */
const stitch = (d: string, w: number, color: string): Prim => ({ t: 'path', d, stroke: color, sw: Math.max(0.3, w * 0.018), dash: `${n(Math.max(1, w * 0.05))} ${n(Math.max(0.7, w * 0.035))}` })

/** Forma libre de un bolsillo: ancho de la boca y del fondo, boca inclinada y curva (relativos; 1, 1, 0, 0 = rectángulo). */
export interface PocketFree {
  boca: number
  abajo: number
  inclinada: number
  curva: number
  /** Curva de los lados y de los tramos del fondo (−1 hacia dentro, 1 hacia fuera). */
  lados?: number
  picoCurva?: number
}
const isPlain = (f?: PocketFree) => !f || (f.boca === 1 && f.abajo === 1 && !f.inclinada && !f.curva && !f.lados && !f.picoCurva)

/** Lee la forma libre de un bolsillo de sus ajustes (o la de por defecto). */
export function pocketFreeOf(get: (id: string) => number): PocketFree {
  return { boca: get('boca'), abajo: get('abajo'), inclinada: get('inclinada'), curva: get('curva'), lados: get('lados'), picoCurva: get('picoCurva') }
}

/**
 * Cuerpo de un bolsillo con su fondo recto, en pico, redondo, doble pico o con las esquinas cortadas (`inset` para el
 * pespunte); `depth`: lo que baja el pico (0–1); `free`: boca y fondo más anchos o estrechos, boca inclinada o curva.
 */
export function pocketBody(x0: number, y0: number, w: number, h: number, r: number, fondo: number, inset = 0, depth = 0.35, free?: PocketFree) {
  const x = x0 + inset
  const y = y0 + inset
  const ww = w - inset * 2
  const hh = h - inset * 2
  const rr = Math.max(0, Math.min(r, ww / 2, hh / 2) - inset * 0.5)
  if (!isPlain(free) || fondo > 2) return freePocket(x, y, ww, hh, rr, fondo, depth, free ?? { boca: 1, abajo: 1, inclinada: 0, curva: 0 })
  if (fondo === 1) {
    // En pico: los lados bajan y se juntan en el centro
    const tip = Math.min(hh * 0.9, ww * depth)
    return `M${n(x + rr)} ${n(y)}H${n(x + ww - rr)}Q${n(x + ww)} ${n(y)} ${n(x + ww)} ${n(y + rr)}V${n(y + hh - tip)}L${n(x + ww / 2)} ${n(y + hh)}L${n(x)} ${n(y + hh - tip)}V${n(y + rr)}Q${n(x)} ${n(y)} ${n(x + rr)} ${n(y)}Z`
  }
  if (fondo === 2) {
    // Redondo: esquinas de abajo muy curvas
    const rb = Math.min(ww / 2, hh * 0.6)
    return `M${n(x + rr)} ${n(y)}H${n(x + ww - rr)}Q${n(x + ww)} ${n(y)} ${n(x + ww)} ${n(y + rr)}V${n(y + hh - rb)}Q${n(x + ww)} ${n(y + hh)} ${n(x + ww / 2)} ${n(y + hh)}Q${n(x)} ${n(y + hh)} ${n(x)} ${n(y + hh - rb)}V${n(y + rr)}Q${n(x)} ${n(y)} ${n(x + rr)} ${n(y)}Z`
  }
  return roundRect(x, y, ww, hh, rr)
}

/** Bolsillo de forma libre: la boca arriba (inclinada o curva) y los lados hasta el fondo elegido. */
function freePocket(x: number, y: number, ww: number, hh: number, rr: number, fondo: number, depth: number, f: PocketFree) {
  const cx = x + ww / 2
  const tw = ww * f.boca
  const bw = ww * f.abajo
  const yl = y + Math.max(0, -f.inclinada) * hh
  const yr = y + Math.max(0, f.inclinada) * hh
  const L = cx - tw / 2
  const R = cx + tw / 2
  const bl = cx - bw / 2
  const br = cx + bw / 2
  const yb = y + hh
  let d = `M${n(L)} ${n(yl)}Q${n(cx)} ${n((yl + yr) / 2 + f.curva * hh * 0.3)} ${n(R)} ${n(yr)}`
  // Tramo de donde va el contorno a (x1, y1), abombado `bulge` (−1…1) hacia fuera
  let px = R
  let py = yr
  const to = (x1: number, y1: number, bulge = 0) => {
    if (bulge) {
      const dx = x1 - px
      const dy = y1 - py
      d += `Q${n((px + x1) / 2 + dy * bulge * 0.3)} ${n((py + y1) / 2 - dx * bulge * 0.3)} ${n(x1)} ${n(y1)}`
    } else d += `L${n(x1)} ${n(y1)}`
    px = x1
    py = y1
  }
  const side = f.lados ?? 0
  const low = f.picoCurva ?? 0
  const tip = Math.min(hh * 0.9, bw * depth)
  switch (fondo) {
    case 1:
      to(br, yb - tip, side)
      to(cx, yb, low)
      to(bl, yb - tip, low)
      to(L, yl, side)
      break
    case 2: {
      const rb = Math.min(bw / 2, hh * 0.6)
      to(br, yb - rb, side)
      d += `Q${n(br)} ${n(yb + low * rb * 0.5)} ${n(cx)} ${n(yb + low * rb * 0.3)}Q${n(bl)} ${n(yb + low * rb * 0.5)} ${n(bl)} ${n(yb - rb)}`
      px = bl
      py = yb - rb
      to(L, yl, side)
      break
    }
    case 3:
      to(br, yb - tip / 2, side)
      to(cx + bw / 4, yb, low)
      to(cx, yb - tip / 2, low)
      to(cx - bw / 4, yb, low)
      to(bl, yb - tip / 2, low)
      to(L, yl, side)
      break
    case 4: {
      const c = Math.min(bw / 2, hh / 2) * Math.max(0.15, depth)
      to(br, yb - c, side)
      to(br - c, yb, low)
      to(bl + c, yb, low)
      to(bl, yb - c, low)
      to(L, yl, side)
      break
    }
    default: {
      const k = Math.min(rr, bw / 2)
      to(br, yb - k, side)
      d += `Q${n(br)} ${n(yb)} ${n(br - k)} ${n(yb)}`
      px = br - k
      py = yb
      to(bl + k, yb, low)
      d += `Q${n(bl)} ${n(yb)} ${n(bl)} ${n(yb - k)}`
      px = bl
      py = yb - k
      to(L, yl, side)
    }
  }
  return d + 'Z'
}

/**
 * Solapa de un bolsillo (recta, en pico o redonda) sobre su boca, con su pespunte y, si lleva, el botón. `x0, y0, w`:
 * boca del bolsillo; `fh`: alto de la solapa.
 */
export function pocketFlap(x0: number, y0: number, w: number, fh: number, kind: number, button: boolean, color: string, thread: string): Prim[] {
  if (!kind) return []
  const x = x0 - w * 0.03
  const ww = w * 1.06
  const edge = shade(color, -0.45)
  const sw = Math.max(0.5, w * 0.02)
  const outline = (inset: number) => {
    const L = x + inset
    const R = x + ww - inset
    const T = y0 + inset * 0.5
    const B = y0 + fh - inset
    if (kind === 2) return `M${n(L)} ${n(T)}H${n(R)}V${n(B - fh * 0.35)}L${n((L + R) / 2)} ${n(B)}L${n(L)} ${n(B - fh * 0.35)}Z`
    if (kind === 3) return `M${n(L)} ${n(T)}H${n(R)}V${n(B - fh * 0.45)}Q${n(R)} ${n(B)} ${n((L + R) / 2)} ${n(B)}Q${n(L)} ${n(B)} ${n(L)} ${n(B - fh * 0.45)}Z`
    return `M${n(L)} ${n(T)}H${n(R)}V${n(B)}H${n(L)}Z`
  }
  const out: Prim[] = [
    { t: 'path', d: outline(0), fill: shade(color, -0.06), stroke: edge, sw },
    stitch(outline(w * 0.05), w, thread),
  ]
  if (button) out.push({ t: 'path', d: circle(x + ww / 2, y0 + fh * (kind === 1 ? 0.55 : 0.6), w * 0.055), fill: thread, stroke: shade(thread, -0.4), sw: sw * 0.6 })
  return out
}

function pocketPrims(style: string, w: number, color: string, thread: string, shape?: Detail['shape']): Prim[] {
  const get = (id: string) => shapeOf({ kind: 'bolsillo', shape }, id)
  const h = w * (POCKET_ASPECT[style] ?? 1.15) * get('alto')
  const r = get('esquinas') * w * 0.3
  const fondo = Math.round(get('fondo'))
  const depth = get('pico')
  const edge = shade(color, -0.45)
  const sw = Math.max(0.5, w * 0.02)
  if (style === 'vivo') {
    return [
      { t: 'path', d: roundRect(-w / 2, -h / 2, w, h / 2, h * 0.2), fill: color, stroke: edge, sw },
      { t: 'path', d: roundRect(-w / 2, 0, w, h / 2, h * 0.2), fill: color, stroke: edge, sw },
      { t: 'path', d: `M${n(-w / 2)} ${n(-h * 0.7)}V${n(h * 0.7)}M${n(w / 2)} ${n(-h * 0.7)}V${n(h * 0.7)}`, stroke: thread, sw: Math.max(0.5, w * 0.03) },
    ]
  }
  if (style === 'cremallera') {
    return [
      { t: 'path', d: roundRect(-w / 2, -h / 2, w, h, h * 0.3), fill: shade(color, -0.2), stroke: edge, sw },
      { t: 'path', d: `M${n(-w / 2 + h * 0.4)} 0H${n(w / 2 - h * 0.4)}`, stroke: thread, sw: h * 0.32, dash: `${n(h * 0.12)} ${n(h * 0.1)}` },
      { t: 'path', d: roundRect(w / 2 - h * 1.2, -h * 0.75, h * 0.7, h * 1.5, h * 0.2), fill: thread, stroke: shade(thread, -0.4), sw: sw * 0.6 },
    ]
  }
  if (style === 'cargo') {
    const flapH = Math.min(h * 0.6, h * 0.28 * get('tapeta'))
    const top = -h / 2 + flapH * 0.72
    const bodyH = h / 2 - top
    return [
      { t: 'path', d: pocketBody(-w / 2, top, w, bodyH, r, fondo, 0, depth), fill: color, stroke: edge, sw },
      // Fuelle: los pliegues a los lados y el del centro
      { t: 'path', d: `M${n(-w / 2 + w * 0.08)} ${n(top)}V${n(h / 2)}M${n(w / 2 - w * 0.08)} ${n(top)}V${n(h / 2)}M0 ${n(top)}V${n(h / 2)}`, stroke: shade(color, -0.3), sw: sw * 0.7 },
      stitch(pocketBody(-w / 2, top, w, bodyH, r, fondo, w * 0.04, depth), w, thread),
      { t: 'path', d: roundRect(-w * 0.53, -h / 2, w * 1.06, flapH, w * 0.04), fill: shade(color, -0.06), stroke: edge, sw },
      stitch(`M${n(-w * 0.46)} ${n(-h / 2 + flapH * 0.78)}H${n(w * 0.46)}`, w, thread),
      { t: 'path', d: circle(0, -h / 2 + flapH * 0.5, w * 0.05), fill: thread, stroke: shade(thread, -0.4), sw: sw * 0.6 },
    ]
  }
  // De parche, con el dobladillo arriba (y, si lleva, la solapa)
  const free = pocketFreeOf(get)
  const flap = Math.round(get('solapa'))
  return [
    { t: 'path', d: pocketBody(-w / 2, -h / 2, w, h, r, fondo, 0, depth, free), fill: color, stroke: edge, sw },
    stitch(pocketBody(-w / 2, -h / 2, w, h, r, fondo, w * 0.07, depth, free), w, thread),
    // Dobladillo de la boca (solo si la boca es recta y sin solapa)
    ...(isPlain(free) && !flap ? [stitch(`M${n(-w * 0.43)} ${n(-h / 2 + h * 0.16)}H${n(w * 0.43)}`, w, thread)] : []),
    ...pocketFlap(-(w * free.boca) / 2, -h / 2 + Math.min(0, free.inclinada) * h, w * free.boca, h * get('solapaAlto'), flap, get('boton') > 0.5, color, thread),
  ]
}

function cordPrims(style: string, w: number, L: number, color: string, trim: string): Prim[] {
  const out: Prim[] = [{ t: 'path', d: `M0 ${n(-L / 2)}V${n(L / 2)}`, stroke: color, sw: Math.max(0.6, w * 0.32) }]
  const end = L / 2
  if (style === 'tope') {
    const y = -L / 2 + L * 0.35
    out.push({ t: 'path', d: roundRect(-w / 2, y - w * 0.6, w, w * 1.2, w * 0.35), fill: trim, stroke: shade(trim, -0.4), sw: Math.max(0.3, w * 0.06) })
    out.push({ t: 'path', d: circle(0, y - w * 0.2, w * 0.12), fill: shade(trim, -0.5) })
  }
  if (style === 'nudo') out.push({ t: 'path', d: circle(0, end - w * 0.4, w * 0.45), fill: color, stroke: shade(color, -0.35), sw: Math.max(0.3, w * 0.06) })
  else out.push({ t: 'path', d: roundRect(-w * 0.2, end - w * 1.1, w * 0.4, w * 1.1, w * 0.12), fill: trim, stroke: shade(trim, -0.4), sw: Math.max(0.25, w * 0.05) })
  return out
}

function tapePrims(style: string, w: number, L: number, color: string, color2: string): Prim[] {
  const base = style === 'reflectante' ? '#c3c7cc' : color
  const out: Prim[] = [{ t: 'path', d: `M${n(-w / 2)} ${n(-L / 2)}H${n(w / 2)}V${n(L / 2)}H${n(-w / 2)}Z`, fill: base, stroke: shade(base, -0.35), sw: Math.max(0.3, w * 0.04) }]
  if (style === 'rayas') {
    for (const x of [-w * 0.28, w * 0.13]) out.push({ t: 'path', d: `M${n(x)} ${n(-L / 2)}H${n(x + w * 0.15)}V${n(L / 2)}H${n(x)}Z`, fill: color2 })
  } else if (style === 'reflectante') {
    out.push({ t: 'path', d: `M${n(-w * 0.18)} ${n(-L / 2)}H${n(w * 0.18)}V${n(L / 2)}H${n(-w * 0.18)}Z`, fill: '#eef1f4', opacity: 0.8 })
  }
  const x = w / 2 - Math.max(0.6, w * 0.1)
  out.push(stitch(`M${n(-x)} ${n(-L / 2)}V${n(L / 2)}M${n(x)} ${n(-L / 2)}V${n(L / 2)}`, w * 3, style === 'lisa' ? color2 : shade(base, -0.4)))
  return out
}

function velcroPrims(w: number, color: string, thread: string, tall = 1): Prim[] {
  const h = w * 0.55 * tall
  const rows = Array.from({ length: 5 }, (_, i) => -h / 2 + (h * (i + 1)) / 6)
  return [
    { t: 'path', d: roundRect(-w / 2, -h / 2, w, h, h * 0.15), fill: color, stroke: shade(color, -0.4), sw: Math.max(0.4, w * 0.02) },
    { t: 'path', d: rows.map((y) => `M${n(-w * 0.4)} ${n(y)}H${n(w * 0.4)}`).join(''), stroke: shade(color, -0.25), sw: Math.max(0.3, w * 0.025), dash: `${n(w * 0.02)} ${n(w * 0.025)}` },
    stitch(roundRect(-w / 2 + w * 0.05, -h / 2 + w * 0.05, w * 0.9, h - w * 0.1, h * 0.1), w, thread),
  ]
}

function bucklePrims(style: string, w: number, color: string, color2: string): Prim[] {
  const h = w * (style === 'clip' ? 0.6 : style === 'anillas' ? 0.75 : 1)
  const edge = shade(color, -0.45)
  if (style === 'clip') {
    return [
      { t: 'path', d: roundRect(-w / 2, -h / 2, w * 0.56, h, h * 0.2), fill: color, stroke: edge, sw: Math.max(0.4, w * 0.03) },
      { t: 'path', d: `M${n(w * 0.06)} ${n(-h * 0.42)}L${n(w / 2)} ${n(-h * 0.2)}V${n(h * 0.2)}L${n(w * 0.06)} ${n(h * 0.42)}Z`, fill: shade(color, 0.1), stroke: edge, sw: Math.max(0.4, w * 0.03) },
      { t: 'path', d: roundRect(-w * 0.36, -h * 0.18, w * 0.2, h * 0.36, h * 0.08), fill: shade(color, -0.3) },
      { t: 'path', d: `M${n(-w * 0.75)} ${n(-h * 0.3)}H${n(-w / 2)}V${n(h * 0.3)}H${n(-w * 0.75)}Z`, fill: color2 },
    ]
  }
  if (style === 'anillas') {
    const ring = (x: number) => `M${n(x)} ${n(-h / 2)}H${n(x + w * 0.12)}A${n(h / 2)} ${n(h / 2)} 0 0 1 ${n(x + w * 0.12)} ${n(h / 2)}H${n(x)}Z`
    return [ring(-w * 0.3), ring(-w * 0.12)].map((d): Prim => ({ t: 'path', d, stroke: color, sw: Math.max(0.6, w * 0.07) }))
  }
  return [
    { t: 'path', d: roundRect(-w / 2, -h / 2, w, h, w * 0.12), stroke: color, sw: Math.max(0.7, w * 0.13) },
    { t: 'path', d: `M0 ${n(-h / 2)}V${n(h / 2)}`, stroke: color, sw: Math.max(0.6, w * 0.1) },
    { t: 'path', d: `M0 0H${n(w * 0.46)}`, stroke: edge, sw: Math.max(0.5, w * 0.07) },
  ]
}

function stitchPrims(style: string, w: number, L: number, color: string): Prim[] {
  const sw = Math.max(0.35, w * 0.22)
  const dash = `${n(w * 0.9)} ${n(w * 0.6)}`
  const v = (x: number) => `M${n(x)} ${n(-L / 2)}V${n(L / 2)}`
  if (style === 'doble') return [{ t: 'path', d: v(-w * 0.5) + v(w * 0.5), stroke: color, sw, dash }]
  if (style === 'zigzag') {
    const steps = Math.max(2, Math.round(L / (w * 0.9)))
    const pts = Array.from({ length: steps + 1 }, (_, i) => `${i ? 'L' : 'M'}${n(i % 2 ? w / 2 : -w / 2)} ${n(-L / 2 + (L * i) / steps)}`)
    return [{ t: 'path', d: pts.join(''), stroke: color, sw: sw * 0.8 }]
  }
  if (style === 'cadeneta') return [{ t: 'path', d: v(0), stroke: color, sw: sw * 1.8, dash: `${n(w * 0.7)} ${n(w * 0.25)}` }, { t: 'path', d: v(0), stroke: shade(color, 0.4), sw: sw * 0.5, dash: `${n(w * 0.7)} ${n(w * 0.25)}` }]
  return [{ t: 'path', d: v(0), stroke: color, sw, dash }]
}

/** Pinza: dos costuras que se juntan en una punta, con el pliegue en el centro. */
function dartPrims(w: number, L: number, color: string): Prim[] {
  return [
    { t: 'path', d: `M${n(-w / 2)} ${n(-L / 2)}L0 ${n(L / 2)}L${n(w / 2)} ${n(-L / 2)}`, stroke: color, sw: Math.max(0.4, w * 0.08) },
    { t: 'path', d: `M0 ${n(-L / 2)}V${n(L / 2 - L * 0.1)}`, stroke: color, sw: Math.max(0.3, w * 0.05), dash: `${n(L * 0.04)} ${n(L * 0.03)}`, opacity: 0.6 },
  ]
}

// --- Rotos, deshilachados y desgastes ---

/** Números «al azar» que siempre salen iguales para el mismo detalle (para que el roto no cambie al repintar). */
function seeded(seed: number) {
  let s = Math.floor(seed * 1000) % 2147483647 || 7
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

/** Contorno irregular (de rotura) dentro de una elipse de semiejes rx, ry. */
function jagged(rx: number, ry: number, rand: () => number, rough = 0.18, points = 22) {
  const pts = Array.from({ length: points }, (_, i) => {
    const a = (i / points) * Math.PI * 2
    const k = 1 - rough + rand() * rough * 2
    return `${n(Math.cos(a) * rx * k)} ${n(Math.sin(a) * ry * k)}`
  })
  return `M${pts.join('L')}Z`
}

function ripPrims(style: string, w: number, hole: string, thread: string, shape?: Detail['shape']): Prim[] {
  const get = (id: string) => shapeOf({ kind: 'roto', shape }, id)
  const rand = seeded(w + style.length)
  const h = w * (style === 'agujero' ? 0.8 : style === 'cortes' ? 0.75 : 0.6) * get('alto')
  const sw = Math.max(0.25, w * 0.012)
  const out: Prim[] = []
  if (style === 'cortes') {
    // Varios cortes horizontales uno encima de otro, cada uno con sus hilos
    const rows = Math.max(1, Math.round(get('hilos') / 2))
    for (let i = 0; i < rows; i++) {
      const y = -h / 2 + (h * (i + 0.5)) / rows
      const len = w * (0.55 + rand() * 0.4)
      const x0 = -len / 2 + (rand() - 0.5) * w * 0.12
      out.push({ t: 'path', d: `M${n(x0)} ${n(y)}Q${n(x0 + len / 2)} ${n(y + h * 0.05)} ${n(x0 + len)} ${n(y)}Q${n(x0 + len / 2)} ${n(y - h * 0.04)} ${n(x0)} ${n(y)}Z`, fill: hole, stroke: hole, sw: Math.max(0.5, w * 0.03) })
      for (let k = 0; k < 4; k++) {
        const x = x0 + len * (0.15 + 0.7 * rand())
        out.push({ t: 'path', d: `M${n(x)} ${n(y - h * 0.05)}l${n((rand() - 0.5) * w * 0.04)} ${n(h * 0.1)}`, stroke: thread, sw })
      }
    }
    return out
  }
  out.push({ t: 'path', d: jagged(w / 2, h / 2, rand, get('irregular')), fill: hole, opacity: 0.9 })
  if (style === 'rasgado') {
    // Los hilos de la trama cruzan el roto de lado a lado
    const lines = Math.round(get('hilos'))
    for (let i = 0; i < lines; i++) {
      const y = -h * 0.38 + (h * 0.76 * i) / (lines - 1) + (rand() - 0.5) * h * 0.05
      const half = (w / 2) * Math.sqrt(Math.max(0, 1 - (y / (h / 2)) ** 2)) * 0.95
      out.push({ t: 'path', d: `M${n(-half)} ${n(y)}Q0 ${n(y + (rand() - 0.5) * h * 0.12)} ${n(half)} ${n(y)}`, stroke: thread, sw: sw * 1.6 })
    }
  }
  // Borde deshilachado: hilos cortos hacia fuera
  const fringe = Math.round((style === 'agujero' ? 36 : 26) * get('flecos'))
  for (let i = 0; i < fringe; i++) {
    const a = (i / fringe) * Math.PI * 2 + rand() * 0.2
    const x = Math.cos(a) * (w / 2) * 0.95
    const y = Math.sin(a) * (h / 2) * 0.95
    const l = w * (0.03 + rand() * 0.06)
    out.push({ t: 'path', d: `M${n(x)} ${n(y)}l${n(Math.cos(a) * l)} ${n(Math.sin(a) * l)}`, stroke: thread, sw })
  }
  return out
}

/** Borde deshilachado a lo largo de `L` (en vertical; se gira para ponerlo en un bajo). Los hilos salen hacia +x. */
function frayPrims(style: string, w: number, L: number, thread: string, edge: string, shape?: Detail['shape']): Prim[] {
  const get = (id: string) => shapeOf({ kind: 'deshilachado', shape }, id)
  const rand = seeded(L + w)
  const out: Prim[] = []
  const step = (style === 'desflecado' ? w * 0.06 : w * 0.1) / get('densidad')
  const count = Math.max(4, Math.floor(L / Math.max(0.4, step)))
  const reach = style === 'sin-coser' ? 0.35 : style === 'desflecado' ? 0.75 : 1
  const sw = Math.max(0.25, w * 0.03)
  if (style === 'sin-coser') {
    // Borde cortado e irregular, sin dobladillo
    const pts = Array.from({ length: 24 }, (_, i) => `${i ? 'L' : 'M'}${n(-w / 2 + rand() * w * 0.12)} ${n(-L / 2 + (L * i) / 23)}`)
    out.push({ t: 'path', d: pts.join(''), stroke: edge, sw: sw * 1.4 })
  }
  for (let i = 0; i < count; i++) {
    const y = -L / 2 + (L * (i + rand() * 0.6)) / count
    const uneven = get('irregular')
    const len = w * reach * (1 - uneven + rand() * uneven)
    const bend = (rand() - 0.5) * w * get('curva')
    out.push({ t: 'path', d: `M${n(-w / 2)} ${n(y)}q${n(len / 2)} ${n(bend)} ${n(len)} ${n(bend * 0.6)}`, stroke: thread, sw })
  }
  return out
}

function wearPrims(style: string, w: number, color: string, shape?: Detail['shape']): Prim[] {
  const get = (id: string) => shapeOf({ kind: 'desgaste', shape }, id)
  const rand = seeded(w + style.length * 3)
  const h = w * (style === 'bigotes' ? 0.5 : 0.7) * get('alto')
  const k = get('intensidad')
  const out: Prim[] = []
  if (style === 'bigotes') {
    // Pliegues aclarados en abanico (caderas o entrepierna de un vaquero)
    for (let i = 0; i < 6; i++) {
      const y = -h / 2 + (h * i) / 5
      const len = w * (0.45 + rand() * 0.5)
      out.push({ t: 'path', d: `M${n(-w / 2)} ${n(y)}q${n(len / 2)} ${n(h * 0.12)} ${n(len)} ${n(h * 0.2)}`, stroke: color, sw: Math.max(0.6, w * (0.04 + rand() * 0.03)), opacity: Math.min(1, 0.45 * k) })
    }
    return out
  }
  if (style === 'roce') {
    for (let i = 0; i < 70; i++) {
      const a = rand() * Math.PI * 2
      const r = Math.sqrt(rand())
      const x = Math.cos(a) * r * (w / 2)
      const y = Math.sin(a) * r * (h / 2)
      out.push({ t: 'path', d: `M${n(x)} ${n(y)}h${n(w * (0.02 + rand() * 0.05))}`, stroke: color, sw: Math.max(0.3, w * 0.015), opacity: Math.min(1, (0.35 + rand() * 0.35) * k) })
    }
    return out
  }
  // Zona aclarada: varias elipses superpuestas, más claras hacia el centro (borde suave)
  for (let i = 0; i < 6; i++) {
    const k = 1 - i * 0.15
    out.push({ t: 'path', d: jagged((w / 2) * k, (h / 2) * k, rand, 0.08, 18), fill: color, opacity: Math.min(0.5, 0.12 * k) })
  }
  return out
}

// --- Pintar en SVG ---

export function PrimsView({ prims }: { prims: Prim[] }) {
  return (
    <>
      {prims.map((p, i) =>
        p.t === 'path' ? (
          <path key={i} d={p.d} fill={p.fill ?? 'none'} stroke={p.stroke} strokeWidth={p.sw} strokeDasharray={p.dash} opacity={p.opacity} strokeLinecap="round" strokeLinejoin="round" />
        ) : p.t === 'image' ? (
          <image key={i} href={fileUrl(p.file)} x={p.x} y={p.y} width={p.w} height={p.h} preserveAspectRatio="xMidYMid meet" />
        ) : (
          <text key={i} x={p.x} y={p.y} fontSize={p.size} fontWeight={p.bold ? 700 : 400} fill={p.color} textAnchor="middle" dominantBaseline="central" fontFamily="Inter, system-ui, sans-serif">
            {p.text}
          </text>
        ),
      )}
    </>
  )
}

/** Un detalle en su sitio (centrado en x, y y girado). */
export function DetailGraphic({ d, filter }: { d: Detail; filter?: string }) {
  return (
    <g transform={`translate(${d.x} ${d.y}) rotate(${d.rotation})`} filter={filter}>
      <PrimsView prims={detailPrims(d)} />
    </g>
  )
}

// --- Pintar en canvas (imagen de estampados del 3D) ---

/** Pinta los trazos en un canvas ya colocado (translate/rotate/scale hechos fuera). `img` da las imágenes ya cargadas. */
export function drawPrims(ctx: CanvasRenderingContext2D, prims: Prim[], img: (file: string) => HTMLImageElement | null, mono?: string) {
  for (const p of prims) {
    if (p.t === 'path') {
      const path = new Path2D(p.d)
      ctx.globalAlpha = p.opacity ?? 1
      if (p.fill) {
        ctx.fillStyle = mono ?? p.fill
        ctx.fill(path)
      }
      if (p.stroke && p.sw) {
        ctx.strokeStyle = mono ?? p.stroke
        ctx.lineWidth = p.sw
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.setLineDash(p.dash ? p.dash.split(' ').map(Number) : [])
        ctx.stroke(path)
        ctx.setLineDash([])
      }
      ctx.globalAlpha = 1
    } else if (p.t === 'image') {
      const im = img(p.file)
      if (!im) continue
      if (mono) {
        // Silueta del gráfico (para el relieve): se pinta y se rellena del color dado conservando su forma
        ctx.save()
        ctx.drawImage(im, p.x, p.y, p.w, p.h)
        ctx.globalCompositeOperation = 'source-atop'
        ctx.fillStyle = mono
        ctx.fillRect(p.x, p.y, p.w, p.h)
        ctx.restore()
      } else ctx.drawImage(im, p.x, p.y, p.w, p.h)
    } else {
      ctx.font = `${p.bold ? 700 : 400} ${p.size}px Inter, system-ui, sans-serif`
      ctx.fillStyle = mono ?? p.color
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(p.text, p.x, p.y)
    }
  }
}

/** Archivos de imagen que usa un conjunto de detalles (para cargarlos antes de pintar). */
export const detailFiles = (details: Detail[], hw?: HardwareStyle) => [
  ...details.flatMap((d) => (d.art ? [d.art.file] : [])),
  ...(hw?.buttonArt ? [hw.buttonArt.file] : []),
  ...(hw?.pullerArt ? [hw.pullerArt.file] : []),
]
