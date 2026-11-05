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

/** Alto / ancho de un detalle (su caja), para moverlo y escalarlo. */
export function detailAspect(d: Pick<Detail, 'kind' | 'style' | 'length' | 'w' | 'art'>) {
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

export function patchPrims(d: Pick<Detail, 'style' | 'w' | 'color' | 'color2' | 'text' | 'art'>, label = false): Prim[] {
  const h = label ? d.w * 0.42 : d.w * detailAspect({ kind: 'parche', style: d.style, w: d.w })
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
      return pocketPrims(d.style, d.w, d.color, d.color2)
    case 'trabilla': {
      const h = d.w * 2.6
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
      return velcroPrims(d.w, d.color, d.color2)
    case 'hebilla':
      return bucklePrims(d.style, d.w, d.color, d.color2)
    case 'costura':
      return stitchPrims(d.style, d.w, d.length ?? 80, d.color)
    case 'pinza':
      return dartPrims(d.w, d.length ?? 40, d.color)
    case 'roto':
      return ripPrims(d.style, d.w, d.color, d.color2)
    case 'deshilachado':
      return frayPrims(d.style, d.w, d.length ?? 120, d.color, d.color2)
    case 'desgaste':
      return wearPrims(d.style, d.w, d.color)
  }
}

// --- Bolsillos, trabillas, cordones, cintas, velcro, hebillas, costuras y pinzas ---

/** Pespunte discontinuo (de `color`) del tamaño del detalle. */
const stitch = (d: string, w: number, color: string): Prim => ({ t: 'path', d, stroke: color, sw: Math.max(0.3, w * 0.018), dash: `${n(Math.max(1, w * 0.05))} ${n(Math.max(0.7, w * 0.035))}` })

function pocketPrims(style: string, w: number, color: string, thread: string): Prim[] {
  const h = w * (POCKET_ASPECT[style] ?? 1.15)
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
    const top = -h / 2 + h * 0.2
    return [
      { t: 'path', d: roundRect(-w / 2, top, w, h * 0.8, w * 0.04), fill: color, stroke: edge, sw },
      // Fuelle: los pliegues a los lados y el del centro
      { t: 'path', d: `M${n(-w / 2 + w * 0.08)} ${n(top)}V${n(h / 2)}M${n(w / 2 - w * 0.08)} ${n(top)}V${n(h / 2)}M0 ${n(top)}V${n(h / 2)}`, stroke: shade(color, -0.3), sw: sw * 0.7 },
      stitch(roundRect(-w / 2 + w * 0.04, top + w * 0.04, w * 0.92, h * 0.8 - w * 0.08, w * 0.03), w, thread),
      { t: 'path', d: roundRect(-w * 0.53, -h / 2, w * 1.06, h * 0.28, w * 0.04), fill: shade(color, -0.06), stroke: edge, sw },
      stitch(`M${n(-w * 0.46)} ${n(-h / 2 + h * 0.22)}H${n(w * 0.46)}`, w, thread),
      { t: 'path', d: circle(0, -h / 2 + h * 0.14, w * 0.05), fill: thread, stroke: shade(thread, -0.4), sw: sw * 0.6 },
    ]
  }
  // De parche, con el dobladillo arriba
  return [
    { t: 'path', d: roundRect(-w / 2, -h / 2, w, h, w * 0.06), fill: color, stroke: edge, sw },
    stitch(roundRect(-w / 2 + w * 0.07, -h / 2 + w * 0.07, w * 0.86, h - w * 0.14, w * 0.04), w, thread),
    stitch(`M${n(-w * 0.43)} ${n(-h / 2 + h * 0.16)}H${n(w * 0.43)}`, w, thread),
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

function velcroPrims(w: number, color: string, thread: string): Prim[] {
  const h = w * 0.55
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

function ripPrims(style: string, w: number, hole: string, thread: string): Prim[] {
  const rand = seeded(w + style.length)
  const h = w * (style === 'agujero' ? 0.8 : style === 'cortes' ? 0.75 : 0.6)
  const sw = Math.max(0.25, w * 0.012)
  const out: Prim[] = []
  if (style === 'cortes') {
    // Varios cortes horizontales uno encima de otro, cada uno con sus hilos
    const rows = 4
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
  out.push({ t: 'path', d: jagged(w / 2, h / 2, rand), fill: hole, opacity: 0.9 })
  if (style === 'rasgado') {
    // Los hilos de la trama cruzan el roto de lado a lado
    const lines = 7
    for (let i = 0; i < lines; i++) {
      const y = -h * 0.38 + (h * 0.76 * i) / (lines - 1) + (rand() - 0.5) * h * 0.05
      const half = (w / 2) * Math.sqrt(Math.max(0, 1 - (y / (h / 2)) ** 2)) * 0.95
      out.push({ t: 'path', d: `M${n(-half)} ${n(y)}Q0 ${n(y + (rand() - 0.5) * h * 0.12)} ${n(half)} ${n(y)}`, stroke: thread, sw: sw * 1.6 })
    }
  }
  // Borde deshilachado: hilos cortos hacia fuera
  const fringe = style === 'agujero' ? 36 : 26
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
function frayPrims(style: string, w: number, L: number, thread: string, edge: string): Prim[] {
  const rand = seeded(L + w)
  const out: Prim[] = []
  const step = style === 'desflecado' ? w * 0.06 : w * 0.1
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
    const len = w * reach * (0.4 + rand() * 0.6)
    const bend = (rand() - 0.5) * w * 0.15
    out.push({ t: 'path', d: `M${n(-w / 2)} ${n(y)}q${n(len / 2)} ${n(bend)} ${n(len)} ${n(bend * 0.6)}`, stroke: thread, sw })
  }
  return out
}

function wearPrims(style: string, w: number, color: string): Prim[] {
  const rand = seeded(w + style.length * 3)
  const h = w * (style === 'bigotes' ? 0.5 : 0.7)
  const out: Prim[] = []
  if (style === 'bigotes') {
    // Pliegues aclarados en abanico (caderas o entrepierna de un vaquero)
    for (let i = 0; i < 6; i++) {
      const y = -h / 2 + (h * i) / 5
      const len = w * (0.45 + rand() * 0.5)
      out.push({ t: 'path', d: `M${n(-w / 2)} ${n(y)}q${n(len / 2)} ${n(h * 0.12)} ${n(len)} ${n(h * 0.2)}`, stroke: color, sw: Math.max(0.6, w * (0.04 + rand() * 0.03)), opacity: 0.45 })
    }
    return out
  }
  if (style === 'roce') {
    for (let i = 0; i < 70; i++) {
      const a = rand() * Math.PI * 2
      const r = Math.sqrt(rand())
      const x = Math.cos(a) * r * (w / 2)
      const y = Math.sin(a) * r * (h / 2)
      out.push({ t: 'path', d: `M${n(x)} ${n(y)}h${n(w * (0.02 + rand() * 0.05))}`, stroke: color, sw: Math.max(0.3, w * 0.015), opacity: 0.35 + rand() * 0.35 })
    }
    return out
  }
  // Zona aclarada: varias elipses superpuestas, más claras hacia el centro (borde suave)
  for (let i = 0; i < 6; i++) {
    const k = 1 - i * 0.15
    out.push({ t: 'path', d: jagged((w / 2) * k, (h / 2) * k, rand, 0.08, 18), fill: color, opacity: 0.12 })
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
