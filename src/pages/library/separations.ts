import { crc32, svgToCanvas, withDpi, type Ink } from './artProduction'

/*
 * Separación de colores para serigrafía: una película por tinta (negro donde va esa tinta, blanco donde no), todas del
 * mismo tamaño y con las mismas marcas de registro para que encajen en el taller. Cada punto del gráfico va a la tinta
 * más parecida (con «reserva»: debajo de una tinta no se imprime otra). Con «Base blanca» sale primero la película de
 * la base para prendas oscuras, un poco más pequeña que el dibujo (estrangulada) para que no asome por los bordes.
 * Las películas van de la tinta más clara a la más oscura, que es el orden habitual de impresión.
 */

export interface SeparationOptions {
  widthCm: number
  heightCm: number
  dpi: number
  /** Película de base blanca (prendas oscuras). */
  underbase: boolean
  /** Cuánto se estrecha la base blanca (mm). */
  chokeMm: number
  /** Nombre del gráfico (va en la etiqueta de cada película). */
  title: string
}

export interface Film {
  /** Nombre de la tinta («Base blanca» para la base). */
  name: string
  code: string
  hex: string
  /** Orden de impresión (1, 2, 3…). */
  order: number
  total: number
  canvas: HTMLCanvasElement
}

const MARGIN_CM = 1.6
const LABEL_CM = 0.9

const lum = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return 0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255)
}

/** Las películas una a una (así a tamaño real no se juntan todas en memoria). */
export async function* films(svg: Blob, inks: Ink[], o: SeparationOptions): AsyncGenerator<Film> {
  const px = (cm: number) => Math.max(1, Math.round((cm / 2.54) * o.dpi))
  const w = Math.min(12000, px(o.widthCm))
  const h = Math.min(12000, px(o.heightCm))
  const art = await svgToCanvas(svg, w, h)
  const data = art.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data

  // Cada punto con tinta, a la tinta más parecida
  const sorted = [...inks].sort((a, b) => lum(b.hex) - lum(a.hex))
  const rgb = sorted.map((k) => {
    const n = parseInt(k.hex.slice(1), 16)
    return [n >> 16, (n >> 8) & 255, n & 255]
  })
  const label = new Int8Array(w * h).fill(-1)
  for (let i = 0; i < w * h; i++) {
    if (data[i * 4 + 3] < 128) continue
    let best = 0
    let bd = Infinity
    for (let k = 0; k < rgb.length; k++) {
      const d = (rgb[k][0] - data[i * 4]) ** 2 + (rgb[k][1] - data[i * 4 + 1]) ** 2 + (rgb[k][2] - data[i * 4 + 2]) ** 2
      if (d < bd) (bd = d), (best = k)
    }
    label[i] = best
  }

  const total = sorted.length + (o.underbase ? 1 : 0)
  let order = 0
  if (o.underbase) {
    const mask = new Uint8Array(w * h)
    for (let i = 0; i < mask.length; i++) mask[i] = label[i] >= 0 ? 1 : 0
    erode(mask, w, h, Math.round((o.chokeMm / 25.4) * o.dpi))
    yield { name: 'Base blanca', code: '', hex: '#ffffff', order: ++order, total, canvas: filmCanvas(mask, w, h, o, `Base blanca (estrangulada ${o.chokeMm.toString().replace('.', ',')} mm)`, order, total) }
  }
  for (let k = 0; k < sorted.length; k++) {
    const mask = new Uint8Array(w * h)
    for (let i = 0; i < mask.length; i++) mask[i] = label[i] === k ? 1 : 0
    const ink = sorted[k]
    const name = ink.name || ink.hex.toUpperCase()
    yield { name, code: ink.code, hex: ink.hex, order: ++order, total, canvas: filmCanvas(mask, w, h, o, [name, ink.code].filter(Boolean).join(' · '), order, total) }
  }
}

/** Una película: el dibujo de la tinta en negro, con margen, marcas de registro y etiqueta. */
function filmCanvas(mask: Uint8Array, w: number, h: number, o: SeparationOptions, inkLabel: string, order: number, total: number) {
  const cm = o.dpi / 2.54
  const m = Math.round(MARGIN_CM * cm)
  const lab = Math.round(LABEL_CM * cm)
  const c = document.createElement('canvas')
  c.width = w + 2 * m
  c.height = h + 2 * m + lab
  const g = c.getContext('2d')!
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, c.width, c.height)
  const img = g.createImageData(w, h)
  for (let i = 0; i < mask.length; i++) {
    const v = mask[i] ? 0 : 255
    img.data[i * 4] = v
    img.data[i * 4 + 1] = v
    img.data[i * 4 + 2] = v
    img.data[i * 4 + 3] = 255
  }
  g.putImageData(img, m, m)

  // Marcas de registro (iguales en todas las películas): arriba, abajo, izquierda y derecha
  g.strokeStyle = '#000000'
  g.lineWidth = Math.max(1, 0.03 * cm)
  const mark = (x: number, y: number) => {
    const r = 0.35 * cm
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.moveTo(x - r * 1.6, y)
    g.lineTo(x + r * 1.6, y)
    g.moveTo(x, y - r * 1.6)
    g.lineTo(x, y + r * 1.6)
    g.stroke()
  }
  mark(m + w / 2, m / 2)
  mark(m + w / 2, m + h + m / 2)
  mark(m / 2, m + h / 2)
  mark(m + w + m / 2, m + h / 2)

  // Etiqueta: orden, tinta, gráfico y medida
  g.fillStyle = '#000000'
  g.font = `${Math.round(0.32 * cm)}px "IBM Plex Mono", ui-monospace, monospace`
  g.textBaseline = 'middle'
  const size = `${o.widthCm.toFixed(1).replace('.', ',')} × ${o.heightCm.toFixed(1).replace('.', ',')} cm`
  g.fillText(`${order}/${total} · ${inkLabel} · ${o.title} · ${size}`, m, c.height - lab / 2 - 0.2 * cm)
  return c
}

/** Estrecha una máscara `r` píxeles (cada punto se queda solo si tiene la forma a su alrededor). */
function erode(mask: Uint8Array, w: number, h: number, r: number) {
  if (r <= 0) return
  // Distancia al borde por pasadas (aproximación en tablero): rápida también a tamaño real
  const INF = 1 << 20
  const d = new Int32Array(w * h)
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? INF : 0
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (!d[i]) continue
      const up = y ? d[i - w] : 0
      const left = x ? d[i - 1] : 0
      d[i] = Math.min(d[i], up + 1, left + 1)
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x
      if (!d[i]) continue
      const down = y < h - 1 ? d[i + w] : 0
      const right = x < w - 1 ? d[i + 1] : 0
      d[i] = Math.min(d[i], down + 1, right + 1)
    }
  for (let i = 0; i < mask.length; i++) mask[i] = d[i] > r ? 1 : 0
}

/** PNG de una película con sus ppp (para que se imprima a su tamaño). */
export async function filmPng(f: Film, dpi: number) {
  const blob = await new Promise<Blob | null>((r) => f.canvas.toBlob(r, 'image/png'))
  if (!blob) throw new Error('No se ha podido crear la película')
  return withDpi(blob, dpi)
}

/** ZIP sin comprimir (los PNG ya van comprimidos) con varios archivos. */
export async function zip(files: { name: string; blob: Blob }[]) {
  const enc = new TextEncoder()
  const parts: BlobPart[] = []
  const central: Uint8Array<ArrayBuffer>[] = []
  let offset = 0
  for (const f of files) {
    const data = new Uint8Array(await f.blob.arrayBuffer())
    const name = enc.encode(f.name)
    const crc = crc32(data)
    const local = new Uint8Array(30 + name.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)
    lv.setUint16(6, 0x0800, true) // nombres en UTF-8
    lv.setUint32(14, crc, true)
    lv.setUint32(18, data.length, true)
    lv.setUint32(22, data.length, true)
    lv.setUint16(26, name.length, true)
    local.set(name, 30)
    const cen = new Uint8Array(46 + name.length)
    const cv = new DataView(cen.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, 0x0800, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, data.length, true)
    cv.setUint32(24, data.length, true)
    cv.setUint16(28, name.length, true)
    cv.setUint32(42, offset, true)
    cen.set(name, 46)
    parts.push(local, data)
    central.push(cen)
    offset += local.length + data.length
  }
  const size = central.reduce((n, c) => n + c.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, files.length, true)
  ev.setUint16(10, files.length, true)
  ev.setUint32(12, size, true)
  ev.setUint32(16, offset, true)
  return new Blob([...parts, ...central, end], { type: 'application/zip' })
}
