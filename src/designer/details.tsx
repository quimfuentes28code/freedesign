import type { Detail, DetailArt, HardwareStyle, PullerStyle, ZipStyle } from '../shared/designs'
import { fileUrl } from '../shared/library'

/**
 * Dibujo de los detalles (botones, cremalleras, ojales, remaches, herretes, etiquetas y parches) como una lista de
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
      return (d.length ?? 120) / d.w
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
  }
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
