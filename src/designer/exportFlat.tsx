import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import type { Body } from '../production/measurements'
import type { DesignData } from '../shared/designs'
import type { Material } from '../shared/library'
import { Callouts, Dimensions } from './annotations'
import { DrawingsView } from './drawings'
import { FlatView } from './FlatView'
import { embeddedFontCss, loadFont, toDataUrl } from './fonts'
import { defaultMeasures } from './measures'
import { imagePdf } from './pdf'
import { VIEWS, type GarmentTemplate, type View } from './types'

/**
 * Exportar el dibujo técnico: SVG (vectorial, con imágenes y fuentes dentro), PNG (alta resolución) o PDF (A4 apaisado).
 * Se pinta aparte, fuera de la pantalla, sin selecciones ni ayudas del editor, y luego se junta en una sola imagen.
 */

export type ExportFormat = 'png' | 'svg' | 'pdf'

export interface ExportOptions {
  format: ExportFormat
  views: View[]
  mode: 'color' | 'linea'
  /** Cotas (en el delantero) y notas con flecha. */
  dims: boolean
  notes: boolean
  /** Nombre del diseño (título y nombre del archivo). */
  name: string
  /** Debajo del título en el PDF: prenda, medidas… */
  subtitle: string
}

const GAP = 24
const LABEL = 22
const FONT = 'Inter, system-ui, sans-serif'

/** Pinta las vistas fuera de la pantalla y devuelve el SVG que las junta (con su ancho y alto en unidades del lienzo). */
async function composeSvg(t: GarmentTemplate, data: DesignData, materials: Map<string, Material>, body: Body, o: ExportOptions) {
  // Las fuentes de los textos tienen que estar cargadas para medirlos y pintarlos bien
  await Promise.all((data.prints ?? []).filter((p) => p.kind === 'text').map((p) => loadFont(p.font)))
  const measures = { ...Object.fromEntries(defaultMeasures(t, data, body)), ...data.measures }
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-20000px;top:0;width:1200px;pointer-events:none'
  document.body.appendChild(host)
  const root = createRoot(host)
  try {
    flushSync(() =>
      root.render(
        <>
          {o.views.map((v) => (
            <div key={v} data-view={v} style={{ width: 600 }}>
              <FlatView
                template={t}
                data={data}
                view={v}
                materials={materials}
                frame="ajustado"
                pad={o.dims || o.notes ? 40 : 12}
                body={body}
                mode={o.mode}
                overlay={(ctx) => (
                  <>
                    <DrawingsView drawings={data.drawings ?? []} view={v} />
                    {o.dims && v === 'front' && <Dimensions ctx={ctx} template={t} options={data.options} body={body} measures={measures} />}
                    {o.notes && <Callouts ctx={ctx} callouts={(data.callouts ?? []).filter((c) => !c.hidden)} view={v} />}
                  </>
                )}
              />
            </div>
          ))}
        </>,
      ),
    )
    // Encuadre, cotas y texturas se calculan después del primer pintado
    await document.fonts.ready
    for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(() => r(null)))
    await new Promise((r) => setTimeout(r, 150))

    let x = 0
    let height = 0
    const parts: string[] = []
    const labels: { x: number; text: string }[] = []
    for (const v of o.views) {
      const svg = host.querySelector<SVGSVGElement>(`[data-view="${v}"] svg`)
      if (!svg) continue
      const vb = svg.viewBox.baseVal
      const clone = svg.cloneNode(true) as SVGSVGElement
      // Las imágenes (gráficos, fotos de materiales) van dentro para que el archivo se vea solo
      for (const img of Array.from(clone.querySelectorAll('image'))) {
        const href = img.getAttribute('href') ?? img.getAttribute('xlink:href')
        if (href && !href.startsWith('data:')) img.setAttribute('href', await toDataUrl(href).catch(() => href))
      }
      clone.removeAttribute('class')
      clone.removeAttribute('style')
      clone.setAttribute('x', String(x))
      clone.setAttribute('y', '0')
      clone.setAttribute('width', String(vb.width))
      clone.setAttribute('height', String(vb.height))
      parts.push(new XMLSerializer().serializeToString(clone))
      labels.push({ x: x + vb.width / 2, text: VIEWS.find((w) => w.id === v)?.label ?? v })
      x += vb.width + GAP
      height = Math.max(height, vb.height)
    }
    const width = Math.max(1, x - GAP)
    // Rótulo de cada vista, todos a la misma altura
    if (o.views.length > 1)
      for (const l of labels) parts.push(`<text x="${l.x}" y="${height + LABEL - 6}" text-anchor="middle" font-size="11" fill="#57534e">${l.text}</text>`)
    const total = height + (o.views.length > 1 ? LABEL : 0)

    // Fuentes de Google de los textos, solo con sus letras
    const texts = new Map<string, string>()
    for (const p of data.prints ?? []) if (p.kind === 'text' && !p.hidden) texts.set(p.font, (texts.get(p.font) ?? '') + p.text)
    const css = await embeddedFontCss(texts)

    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${Math.round(width * 2)}" height="${Math.round(total * 2)}" viewBox="0 0 ${width.toFixed(2)} ${total.toFixed(2)}" font-family="${FONT}">` +
      (css ? `<defs><style>${css}</style></defs>` : '') +
      `<rect width="100%" height="100%" fill="#ffffff"/>${parts.join('')}</svg>`
    return { svg, width, height: total }
  } finally {
    root.unmount()
    host.remove()
  }
}

/** Dibuja el SVG en un canvas a `scale` píxeles por unidad. */
async function rasterize(svg: string, width: number, height: number, scale: number) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}

const toBlob = (c: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('No se ha podido crear la imagen'))), type, quality))

/** Genera el archivo pedido (sin descargarlo). */
export async function exportFlat(t: GarmentTemplate, data: DesignData, materials: Map<string, Material>, body: Body, o: ExportOptions) {
  const { svg, width, height } = await composeSvg(t, data, materials, body, o)
  const base = fileName(o.name)
  if (o.format === 'svg') return { blob: new Blob([svg], { type: 'image/svg+xml' }), file: `${base}.svg` }
  // Unos 3.600 píxeles por el lado largo: sobra para imprimir en A4 a 300 ppp
  const scale = Math.min(8, Math.max(2, 3600 / Math.max(width, height)))
  const canvas = await rasterize(svg, width, height, scale)
  if (o.format === 'png') return { blob: await toBlob(canvas, 'image/png'), file: `${base}.png` }
  const jpeg = new Uint8Array(await (await toBlob(canvas, 'image/jpeg', 0.92)).arrayBuffer())
  return { blob: imagePdf(jpeg, canvas.width, canvas.height, o.name, o.subtitle), file: `${base}.pdf` }
}

/** Nombre de archivo a partir del nombre del diseño. */
function fileName(name: string) {
  const s = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
  return s || 'diseno'
}

/** Descarga un archivo generado en el navegador. */
export function download(blob: Blob, file: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = file
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
