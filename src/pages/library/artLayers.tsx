import { embeddedFontCss, toDataUrl } from '../../designer/fonts'
import { measureText } from '../../designer/prints'
import type { ArtLayer } from '../../shared/artworks'
import { fileUrl } from '../../shared/library'
import { FillDefs, fillValue, nodesBox, nodesPath, shapePath } from './artShapes'

/** Lienzo del creador de estampados (cuadrado). */
export const ART_SIZE = 600

type TextLayer = Extract<ArtLayer, { type: 'text' }>

/** Una letra colocada: centro, giro (grados) y escala (ancho y alto). */
interface PlacedGlyph {
  ch: string
  x: number
  y: number
  rot: number
  sx: number
  sy: number
  w: number
}

/** Forma del texto (los antiguos solo tenían `arc`). */
export const warpOf = (l: TextLayer) => l.warp ?? (l.arc ? 'arco' : 'recta')

/**
 * Reparte un texto letra a letra, centrado en (0, 0): varias líneas con su alineación e interlineado y cada forma
 * (arco, círculo, onda, bandera, abombado, perspectiva o vertical). Devuelve las letras y la caja que ocupan.
 */
export function layoutText(l: TextLayer) {
  const warp = warpOf(l)
  const k = (l.warpAmount ?? 50) / 100
  const ls = l.letterSpacing
  const lines = (l.text || ' ').split('\n')
  const lh = l.size * (l.lineHeight ?? 1.15)
  const charW = (ch: string) => measureText(ch, l.font, l.size, l.bold, l.italic)
  const out: PlacedGlyph[] = []

  if (warp === 'vertical') {
    // Una letra debajo de otra; cada línea es una columna
    lines.forEach((line, j) => {
      const chars = [...line]
      chars.forEach((ch, i) => out.push({ ch, x: (j - (lines.length - 1) / 2) * l.size * 1.1, y: (i - (chars.length - 1) / 2) * (l.size * 1.02 + ls), rot: 0, sx: 1, sy: 1, w: charW(ch) }))
    })
  } else {
    const widths = lines.map((line) => [...line].map(charW))
    const lineW = widths.map((ws) => ws.reduce((s, w) => s + w, 0) + Math.max(0, ws.length - 1) * ls)
    const maxW = Math.max(1, ...lineW)
    lines.forEach((line, j) => {
      const chars = [...line]
      const ws = widths[j]
      // Perspectiva: las letras crecen de un lado al otro (y se recolocan con su nuevo ancho)
      const scale = chars.map((_, i) => (warp === 'perspectiva' ? 1 + k * 0.7 * (chars.length > 1 ? i / (chars.length - 1) - 0.5 : 0) : 1))
      const total = ws.reduce((s, w, i) => s + w * scale[i], 0) + Math.max(0, ws.length - 1) * ls
      const align = l.align ?? 'center'
      let x = align === 'left' ? -maxW / 2 : align === 'right' ? maxW / 2 - total : -total / 2
      const y0 = (j - (lines.length - 1) / 2) * lh
      chars.forEach((ch, i) => {
        const w = ws[i] * scale[i]
        const cx = x + w / 2
        x += w + ls
        const t = cx / maxW // −0,5 … 0,5
        let g: PlacedGlyph = { ch, x: cx, y: y0, rot: 0, sx: scale[i], sy: scale[i], w: ws[i] }
        if (warp === 'arco' && l.arc) {
          const theta = Math.max(0.05, (Math.PI * Math.abs(l.arc)) / 100)
          const r = maxW / theta + (l.arc > 0 ? -y0 : y0)
          const phi = cx / r
          const dir = l.arc > 0 ? 1 : -1
          g = { ...g, x: r * Math.sin(phi), y: y0 + dir * r * (1 - Math.cos(phi)), rot: (dir * phi * 180) / Math.PI }
        } else if (warp === 'circulo') {
          // Alrededor de un círculo completo (sello): la intensidad deja más o menos hueco abajo
          const gap = Math.max(0, k) * 0.6
          const r = maxW / (2 * Math.PI * (1 - gap)) + l.size * 0.2 - j * lh
          const phi = cx / Math.max(1, r)
          g = { ...g, x: r * Math.sin(phi), y: -r * Math.cos(phi), rot: (phi * 180) / Math.PI }
        } else if (warp === 'onda' || warp === 'bandera') {
          const amp = l.size * 0.45 * k * (warp === 'bandera' ? t + 0.6 : 1)
          const period = maxW / (warp === 'bandera' ? 1.2 : 1.6)
          const ph = (2 * Math.PI * cx) / period
          const slope = (amp * 2 * Math.PI * Math.cos(ph)) / period
          g = { ...g, y: y0 + amp * Math.sin(ph), rot: (Math.atan(slope) * 180) / Math.PI }
        } else if (warp === 'abombado') {
          // Más alto en el centro que en los extremos (o al revés, con la intensidad negativa)
          const sy = 1 + k * 0.7 * Math.cos(Math.PI * t * 1.6)
          // Las líneas también se separan, para que las letras más altas no se monten
          g = { ...g, sy, y: y0 * sy }
        }
        out.push(g)
      })
    })
  }

  // Caja de las letras, contando su giro y escala; el texto se recoloca para quedar centrado en (0, 0)
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const g of out) {
    const hw = (g.w * g.sx) / 2
    const hh = l.size * 0.6 * g.sy
    const a = (g.rot * Math.PI) / 180
    const ex = Math.abs(hw * Math.cos(a)) + Math.abs(hh * Math.sin(a))
    const ey = Math.abs(hw * Math.sin(a)) + Math.abs(hh * Math.cos(a))
    x0 = Math.min(x0, g.x - ex)
    x1 = Math.max(x1, g.x + ex)
    y0 = Math.min(y0, g.y - ey)
    y1 = Math.max(y1, g.y + ey)
  }
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const pad = (l.stroke ? l.strokeWidth : 0) + (l.stroke2 ? l.stroke2Width ?? 6 : 0)
  return { glyphs: out.map((g) => ({ ...g, x: g.x - cx, y: g.y - cy })), w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 }
}

/** Ancho y alto que ocupa una capa (para su marco de selección). */
export function layerSize(l: ArtLayer) {
  if (l.type === 'image') return { w: l.w, h: l.w * l.aspect }
  if (l.type === 'shape') return { w: l.w, h: l.h }
  if (l.type === 'path') {
    // El trazo está centrado en (x, y): la caja es simétrica alrededor del centro
    const b = [l.nodes, ...(l.subpaths ?? [])].map(nodesBox).reduce((a, c) => ({ x0: Math.min(a.x0, c.x0), y0: Math.min(a.y0, c.y0), x1: Math.max(a.x1, c.x1), y1: Math.max(a.y1, c.y1) }))
    const pad = l.stroke ? l.strokeWidth / 2 : 0
    return { w: Math.max(4, 2 * Math.max(Math.abs(b.x0), Math.abs(b.x1)) + pad * 2), h: Math.max(4, 2 * Math.max(Math.abs(b.y0), Math.abs(b.y1)) + pad * 2) }
  }
  const { w, h } = layoutText(l)
  return { w: Math.max(4, w), h: Math.max(4, h) }
}

/** Texto del creador: letra a letra, con sombra, dos contornos y relleno liso o en degradado. */
function TextView({ l }: { l: TextLayer }) {
  const { glyphs, w, h } = layoutText(l)
  const base = {
    fontFamily: l.font,
    fontSize: l.size,
    fontWeight: l.bold ? 700 : 400,
    fontStyle: l.italic ? 'italic' : 'normal',
    textAnchor: 'middle' as const,
    dominantBaseline: 'central' as const,
    strokeLinejoin: 'round' as const,
    paintOrder: 'stroke' as const,
  }
  const letters = (props: Record<string, unknown>) =>
    glyphs.map((g, i) => (
      <text key={i} transform={`translate(${g.x} ${g.y}) rotate(${g.rot}) scale(${g.sx} ${g.sy})`} {...base} {...props}>
        {g.ch}
      </text>
    ))
  const gid = `grad-${l.id}`
  const iid = `img-${l.id}`
  // Relleno con imagen: la foto cubre toda la caja del texto
  const img = l.fillImage
  const iw = img ? Math.max(w, h / img.aspect) : 0
  const ih = img ? iw * img.aspect : 0
  const fid = `shadow-${l.id}`
  const angle = ((l.gradientAngle ?? 90) * Math.PI) / 180
  const dx = (Math.cos(angle) * w) / 2
  const dy = (Math.sin(angle) * h) / 2
  const outer = l.stroke2 ? (l.stroke ? l.strokeWidth : 0) * 2 + (l.stroke2Width ?? 6) * 2 : 0
  return (
    <>
      <defs>
        {img && (
          <pattern id={iid} patternUnits="userSpaceOnUse" x={-iw / 2} y={-ih / 2} width={iw} height={ih}>
            <image href={fileUrl(img.file)} width={iw} height={ih} preserveAspectRatio="xMidYMid slice" />
          </pattern>
        )}
        {l.gradient && !img && (
          <linearGradient id={gid} gradientUnits="userSpaceOnUse" x1={-dx} y1={-dy} x2={dx} y2={dy}>
            <stop offset="0" stopColor={l.color} />
            <stop offset="1" stopColor={l.gradient} />
          </linearGradient>
        )}
        {l.shadow && !!l.shadowBlur && (
          <filter id={fid} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={l.shadowBlur} />
          </filter>
        )}
      </defs>
      {l.shadow && (
        <g transform={`translate(${l.shadowX ?? 4} ${l.shadowY ?? 4})`} filter={l.shadowBlur ? `url(#${fid})` : undefined}>
          {letters({ fill: l.shadow, stroke: l.shadow, strokeWidth: outer || (l.stroke ? l.strokeWidth * 2 : 0) })}
        </g>
      )}
      {l.stroke2 && letters({ fill: l.stroke2, stroke: l.stroke2, strokeWidth: outer })}
      {letters({ fill: img ? `url(#${iid})` : l.gradient ? `url(#${gid})` : l.color, stroke: l.stroke || undefined, strokeWidth: l.stroke ? l.strokeWidth : undefined })}
    </>
  )
}

/** Dibuja una capa del creador en su sitio. */
export function ArtLayerView({ layer: l }: { layer: ArtLayer }) {
  const t = `translate(${l.x} ${l.y}) rotate(${l.rotation})`
  if (l.type === 'image') {
    const h = l.w * l.aspect
    return (
      <g transform={t}>
        <image href={fileUrl(l.file)} x={-l.w / 2} y={-h / 2} width={l.w} height={h} preserveAspectRatio="none" />
      </g>
    )
  }
  if (l.type === 'shape' || l.type === 'path') {
    const { w, h } = layerSize(l)
    const fid = `fill-${l.id}`
    const d = l.type === 'shape' ? shapePath(l.shape, l.w, l.h, l) : [l.nodes, ...(l.subpaths ?? [])].map((nodes) => nodesPath(nodes, l.closed)).join('')
    return (
      <g transform={t}>
        <defs>
          <FillDefs id={fid} color={l.fill} style={l} w={w} h={h} />
        </defs>
        <path
          d={d}
          fill={l.type === 'path' && !l.closed ? 'none' : fillValue(fid, l.fill, l)}
          fillRule={l.type === 'path' && l.subpaths?.length ? 'evenodd' : undefined}
          stroke={l.stroke || 'none'}
          strokeWidth={l.stroke ? l.strokeWidth : 0}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    )
  }
  return (
    <g transform={t}>
      <TextView l={l} />
    </g>
  )
}

/** Fuentes de Google que usan los textos, dentro del SVG (ver embeddedFontCss). */
async function embeddedFonts(layers: ArtLayer[]) {
  const texts = new Map<string, string>()
  for (const l of layers) if (l.type === 'text') texts.set(l.font, (texts.get(l.font) ?? '') + l.text)
  const css = await embeddedFontCss(texts)
  return css ? `<defs><style>${css}</style></defs>` : ''
}

/**
 * Convierte las capas en un SVG independiente, recortado a su contenido, listo para subirlo como gráfico.
 * Las imágenes y las fuentes se incrustan dentro del SVG para que se vea igual en cualquier sitio.
 */
export async function exportSvg(content: SVGGElement, layers: ArtLayer[] = []) {
  const box = content.getBBox()
  const pad = 4 + Math.max(0, ...layers.map((l) => (l.type === 'text' && l.shadow ? (l.shadowBlur ?? 0) * 3 + Math.max(Math.abs(l.shadowX ?? 4), Math.abs(l.shadowY ?? 4)) : 0)))
  const x = box.x - pad
  const y = box.y - pad
  const w = Math.max(1, box.width + pad * 2)
  const h = Math.max(1, box.height + pad * 2)
  const clone = content.cloneNode(true) as SVGGElement
  for (const img of Array.from(clone.querySelectorAll('image'))) {
    const href = img.getAttribute('href')
    if (href && !href.startsWith('data:')) img.setAttribute('href', await toDataUrl(href))
  }
  const fonts = await embeddedFonts(layers)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w.toFixed(1)}" height="${h.toFixed(1)}" viewBox="${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}">${fonts}${new XMLSerializer().serializeToString(clone)}</svg>`
  return { blob: new Blob([svg], { type: 'image/svg+xml' }), width: w, height: h }
}
