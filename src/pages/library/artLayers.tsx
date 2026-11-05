import { fontDef, googleCss } from '../../designer/fonts'
import { measureText } from '../../designer/prints'
import type { ArtLayer } from '../../shared/artworks'
import { fileUrl } from '../../shared/library'

/** Lienzo del creador de estampados (cuadrado). */
export const ART_SIZE = 600

/** Ancho y alto que ocupa una capa (para su marco de selección). */
export function layerSize(l: ArtLayer) {
  if (l.type === 'image') return { w: l.w, h: l.w * l.aspect }
  if (l.type === 'shape') return { w: l.w, h: l.h }
  const w = measureText(l.text, l.font, l.size, l.bold, l.italic, l.letterSpacing)
  if (!l.arc) return { w, h: l.size * 1.2 }
  // En arco ocupa más alto: la flecha del arco más la altura de la letra
  const theta = (Math.PI * Math.abs(l.arc)) / 100
  const r = w / theta
  return { w: theta > Math.PI / 2 ? r * 2 : 2 * r * Math.sin(theta / 2) + l.size, h: r * (1 - Math.cos(theta / 2)) + l.size * 1.2 }
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
  if (l.type === 'shape') {
    const common = { fill: l.fill, stroke: l.stroke || 'none', strokeWidth: l.stroke ? l.strokeWidth : 0 }
    return (
      <g transform={t}>
        {l.shape === 'rect' && <rect x={-l.w / 2} y={-l.h / 2} width={l.w} height={l.h} {...common} />}
        {l.shape === 'circle' && <ellipse rx={l.w / 2} ry={l.h / 2} {...common} />}
        {l.shape === 'star' && <path d={starPath(l.w / 2, l.h / 2)} {...common} />}
      </g>
    )
  }
  const textProps = {
    fontFamily: l.font,
    fontSize: l.size,
    fontWeight: l.bold ? 700 : 400,
    fontStyle: l.italic ? 'italic' : 'normal',
    letterSpacing: l.letterSpacing,
    fill: l.color,
    stroke: l.stroke || undefined,
    strokeWidth: l.stroke ? l.strokeWidth : undefined,
    paintOrder: 'stroke' as const,
    strokeLinejoin: 'round' as const,
  }
  if (!l.arc) {
    return (
      <g transform={t}>
        <text textAnchor="middle" dominantBaseline="central" {...textProps}>
          {l.text}
        </text>
      </g>
    )
  }
  // Texto en arco: va sobre un trozo de circunferencia cuyo radio depende de la curvatura
  const w = measureText(l.text, l.font, l.size, l.bold, l.italic, l.letterSpacing)
  const theta = Math.max(0.05, (Math.PI * Math.abs(l.arc)) / 100)
  const r = w / theta
  const up = l.arc > 0
  const d = up ? `M ${-r} ${r} A ${r} ${r} 0 0 1 ${r} ${r}` : `M ${-r} ${-r} A ${r} ${r} 0 0 0 ${r} ${-r}`
  const pathId = `arc-${l.id}`
  return (
    <g transform={t}>
      <defs>
        <path id={pathId} d={d} />
      </defs>
      {/* Desplazamos el texto para que el centro del arco quede en (x, y) */}
      <g transform={`translate(0 ${up ? l.size * 0.35 : -l.size * 0.35})`}>
        <text textAnchor="middle" dominantBaseline={up ? 'auto' : 'hanging'} {...textProps}>
          <textPath href={`#${pathId}`} startOffset="50%">
            {l.text}
          </textPath>
        </text>
      </g>
    </g>
  )
}

/** Estrella de cinco puntas inscrita en una elipse de radios rx, ry. */
function starPath(rx: number, ry: number) {
  const pts: string[] = []
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const k = i % 2 === 0 ? 1 : 0.45
    pts.push(`${(Math.cos(a) * rx * k).toFixed(1)} ${(Math.sin(a) * ry * k).toFixed(1)}`)
  }
  return `M ${pts.join(' L ')} Z`
}

/**
 * Fuentes de Google que usan los textos, listas para ir dentro del SVG: solo las letras que aparecen
 * (muy ligeras) y en base64, porque un SVG usado como imagen no puede descargar nada de fuera.
 */
async function embeddedFonts(layers: ArtLayer[]) {
  const texts = new Map<string, string>()
  for (const l of layers) if (l.type === 'text') texts.set(l.font, (texts.get(l.font) ?? '') + l.text)
  const css: string[] = []
  for (const [font, text] of texts) {
    const def = fontDef(font)
    if (!def?.family) continue
    try {
      let sheet = await (await fetch(googleCss([def], [...new Set(text)].join('') || 'A')!)).text()
      for (const url of new Set(sheet.match(/https:\/\/[^)'"]+/g) ?? [])) sheet = sheet.replaceAll(url, await toDataUrl(url))
      css.push(sheet)
    } catch {
      // Sin conexión: se guarda igual, con la fuente de reserva
    }
  }
  return css.length ? `<defs><style>${css.join('\n')}</style></defs>` : ''
}

/**
 * Convierte las capas en un SVG independiente, recortado a su contenido, listo para subirlo como gráfico.
 * Las imágenes y las fuentes se incrustan dentro del SVG para que se vea igual en cualquier sitio.
 */
export async function exportSvg(content: SVGGElement, layers: ArtLayer[] = []) {
  const box = content.getBBox()
  const pad = 4
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

async function toDataUrl(url: string) {
  const blob = await (await fetch(url)).blob()
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = reject
    r.readAsDataURL(blob)
  })
}
