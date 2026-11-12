import { chartColor } from '../../designer/colors'
import type { ArtLayer, Technique } from '../../shared/artworks'
import type { BrandColor } from '../../shared/users'

/**
 * Herramientas de producción del creador: quitar el fondo de una foto, contar tintas o hilos, calcular la
 * superficie (y las puntadas de un bordado) y exportar a tamaño real.
 */

// --- Quitar fondo ---

const hexRgb = (hex: string): [number, number, number] => {
  const v = parseInt(hex.slice(1), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}
const dist = (a: ArrayLike<number>, i: number, c: [number, number, number]) => Math.hypot(a[i] - c[0], a[i + 1] - c[1], a[i + 2] - c[2])

/** Color de fondo: el más repetido en el borde de la imagen (redondeado para agrupar los parecidos). */
function borderColor(d: Uint8ClampedArray, w: number, h: number): [number, number, number] {
  const counts = new Map<number, { n: number; r: number; g: number; b: number }>()
  const take = (x: number, y: number) => {
    const i = (y * w + x) * 4
    if (d[i + 3] < 128) return
    const k = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4)
    const c = counts.get(k) ?? { n: 0, r: 0, g: 0, b: 0 }
    c.n++
    c.r += d[i]
    c.g += d[i + 1]
    c.b += d[i + 2]
    counts.set(k, c)
  }
  for (let x = 0; x < w; x++) {
    take(x, 0)
    take(x, h - 1)
  }
  for (let y = 0; y < h; y++) {
    take(0, y)
    take(w - 1, y)
  }
  let best = { n: 0, r: 255, g: 255, b: 255 }
  for (const c of counts.values()) if (c.n > best.n) best = c
  return best.n ? [best.r / best.n, best.g / best.n, best.b / best.n] : [255, 255, 255]
}

/**
 * Quita el fondo liso de una imagen: borra el color del borde y lo que está unido a él (o, con `everywhere`, ese
 * color en toda la imagen, p. ej. dentro de las letras). `tolerance` va de 0 a 100. Devuelve un PNG con transparencia.
 */
export async function removeBackground(url: string, tolerance: number, everywhere: boolean): Promise<Blob> {
  const res = await fetch(url)
  if (!res.ok) throw new Error('No se ha podido leer la imagen')
  const bitmap = await createImageBitmap(await res.blob())
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bitmap, 0, 0, w, h)
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  const ref = borderColor(d, w, h)
  const tol = 8 + tolerance * 1.6
  const soft = tol * 1.4

  const bg = new Uint8Array(w * h)
  if (everywhere) {
    for (let p = 0; p < w * h; p++) if (dist(d, p * 4, ref) <= tol) bg[p] = 1
  } else {
    // Relleno desde el borde: solo el fondo que toca el borde (los blancos de dentro del dibujo se quedan)
    const stack: number[] = []
    const push = (p: number) => {
      if (!bg[p] && dist(d, p * 4, ref) <= tol) {
        bg[p] = 1
        stack.push(p)
      }
    }
    for (let x = 0; x < w; x++) {
      push(x)
      push((h - 1) * w + x)
    }
    for (let y = 0; y < h; y++) {
      push(y * w)
      push(y * w + w - 1)
    }
    while (stack.length) {
      const p = stack.pop()!
      const x = p % w
      if (x > 0) push(p - 1)
      if (x < w - 1) push(p + 1)
      if (p >= w) push(p - w)
      if (p < w * (h - 1)) push(p + w)
    }
  }
  for (let p = 0; p < w * h; p++) {
    const i = p * 4
    if (bg[p]) d[i + 3] = 0
    else {
      // Borde suave: los píxeles junto al fondo que se le parecen quedan medio transparentes
      const x = p % w
      const near = (x > 0 && bg[p - 1]) || (x < w - 1 && bg[p + 1]) || (p >= w && bg[p - w]) || (p < w * (h - 1) && bg[p + w])
      const dd = dist(d, i, ref)
      if (near && dd < soft) d[i + 3] = Math.round(d[i + 3] * Math.max(0, (dd - tol) / (soft - tol)))
    }
  }
  ctx.putImageData(img, 0, 0)
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
  if (!blob) throw new Error('No se ha podido crear la imagen')
  return blob
}

// --- Tintas e hilos ---

export interface Ink {
  hex: string
  name: string
  code: string
}

export interface InkReport {
  inks: Ink[]
  /** Hay degradados, sombras difuminadas o texturas: en serigrafía necesitan semitonos (o mejor DTF/DTG). */
  blends: boolean
  /** Hay fotos o imágenes: no se pueden contar sus colores. */
  images: boolean
  /** Alto de la letra más pequeña (unidades del lienzo del creador). */
  smallestText: number | null
}

/** Colores que usa el gráfico (los muy parecidos cuentan como uno) y lo que complica imprimirlo. */
export function inkReport(layers: ArtLayer[], brand: BrandColor[]): InkReport {
  const colors: string[] = []
  let blends = false
  let images = false
  let smallestText: number | null = null
  const addColor = (c: string | undefined) => c && /^#[0-9a-f]{6}$/i.test(c) && colors.push(c.toLowerCase())
  for (const l of layers) {
    if (l.hidden) continue
    if (l.type === 'image') {
      images = true
      continue
    }
    if (l.type === 'text') {
      if (l.fillImage) images = true
      else addColor(l.color)
      if (l.stroke) addColor(l.stroke)
      if (l.stroke2) addColor(l.stroke2)
      if (l.gradient && !l.fillImage) {
        addColor(l.gradient)
        blends = true
      }
      if (l.shadow) {
        addColor(l.shadow)
        if ((l.shadowBlur ?? 0) > 0) blends = true
      }
      const hgt = l.size * 0.7
      smallestText = smallestText === null ? hgt : Math.min(smallestText, hgt)
      continue
    }
    if (l.fill && !(l.type === 'path' && !l.closed)) addColor(l.fill)
    if (l.stroke) addColor(l.stroke)
    if (l.fill2) {
      addColor(l.fill2)
      blends = true
    }
    if (l.pattern) addColor(l.patternColor ?? '#ffffff')
  }
  const inks: Ink[] = []
  for (const hex of colors) {
    const rgb = hexRgb(hex)
    if (inks.some((k) => Math.hypot(...hexRgb(k.hex).map((v, i) => v - rgb[i])) < 12)) continue
    const named = brand.find((b) => b.hex === hex) ?? chartColor(hex)
    inks.push({ hex, name: named?.name ?? '', code: named?.code ?? '' })
  }
  return { inks, blends, images, smallestText }
}

/** Puntadas por cm² de un relleno de bordado (unas 1 600 por pulgada cuadrada). */
export const STITCHES_PER_CM2 = 250

/** Consejos de producción según la técnica. */
export function productionNotes(t: Technique, r: InkReport, textMm: number | null): string[] {
  const notes: string[] = []
  if (t === 'serigrafia') {
    if (r.blends || r.images) notes.push('Tiene degradados, sombras difuminadas, texturas o fotos: en serigrafía van con semitonos o cuatricromía. Para pocas unidades sale mejor DTF o DTG.')
    if (r.inks.length > 6) notes.push('Más de 6 tintas: cada tinta es una pantalla. Valora reducir colores.')
  }
  if (t === 'bordado') {
    if (r.blends) notes.push('Los degradados y las sombras difuminadas no se pueden bordar: se hacen con colores lisos.')
    if (r.images) notes.push('Las fotos no se bordan: hay que redibujarlas con colores lisos.')
    if (textMm !== null && textMm < 5) notes.push(`La letra más pequeña mide ${textMm.toFixed(1).replace('.', ',')} mm: por debajo de 5 mm el bordado no se lee bien.`)
    if (r.inks.length > 12) notes.push('Más de 12 hilos: muchas máquinas tienen 12 o 15 agujas.')
  }
  if (t === 'parche' && r.inks.length > 9) notes.push('Más de 9 colores: los parches bordados o tejidos suelen admitir hasta 9.')
  if (t === 'transfer' && r.inks.length > 3) notes.push('El vinilo de corte va color a color: con más de 3 colores sale mejor un transfer impreso (DTF).')
  return notes
}

// --- Superficie y exportación a tamaño real ---

/** Pinta un SVG en un canvas del ancho pedido (en píxeles). */
export async function svgToCanvas(svg: Blob, width: number, height: number, background?: string) {
  const url = URL.createObjectURL(svg)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width))
    canvas.height = Math.max(1, Math.round(height))
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    if (background) {
      ctx.fillStyle = background
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Parte del gráfico que lleva tinta o hilo (0–1): los píxeles no transparentes. */
export async function coverage(svg: Blob, aspect: number) {
  const w = 300
  const canvas = await svgToCanvas(svg, w, w * aspect)
  const d = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
  let n = 0
  for (let i = 3; i < d.length; i += 4) n += d[i] / 255
  return n / (canvas.width * canvas.height)
}

/** SVG con su tamaño real en cm (al abrirlo en un programa de diseño o de corte sale a esa medida). */
export async function realSizeSvg(svg: Blob, widthCm: number, heightCm: number) {
  const text = await svg.text()
  const fixed = text.replace(/^<svg([^>]*?) width="[^"]*" height="[^"]*"/, `<svg$1 width="${widthCm.toFixed(2)}cm" height="${heightCm.toFixed(2)}cm"`)
  return new Blob([fixed], { type: 'image/svg+xml' })
}

/** PNG a tamaño real: ancho en cm × ppp (300 para imprenta). Lleva los ppp en sus datos (pHYs). */
export async function realSizePng(svg: Blob, widthCm: number, heightCm: number, dpi: number) {
  const px = (cm: number) => Math.min(12000, Math.round((cm / 2.54) * dpi))
  const canvas = await svgToCanvas(svg, px(widthCm), px(heightCm))
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
  if (!blob) throw new Error('No se ha podido crear el PNG')
  return withDpi(blob, dpi)
}

/** Añade al PNG el bloque pHYs con su resolución, para que los programas lo abran a su tamaño en cm. */
export async function withDpi(png: Blob, dpi: number) {
  const bytes = new Uint8Array(await png.arrayBuffer())
  const ppm = Math.round(dpi / 0.0254)
  const chunk = new Uint8Array(21)
  const view = new DataView(chunk.buffer)
  view.setUint32(0, 9)
  chunk.set([0x70, 0x48, 0x59, 0x73], 4) // «pHYs»
  view.setUint32(8, ppm)
  view.setUint32(12, ppm)
  chunk[16] = 1 // metros
  view.setUint32(17, crc32(chunk.subarray(4, 17)))
  // Va justo después de la cabecera IHDR (8 bytes de firma + 25 del bloque)
  const at = 33
  return new Blob([bytes.subarray(0, at), chunk, bytes.subarray(at)], { type: 'image/png' })
}

let crcTable: Uint32Array | null = null
export function crc32(data: Uint8Array) {
  if (!crcTable) {
    crcTable = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c >>> 0
    }
  }
  let c = 0xffffffff
  for (const b of data) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Descarga un archivo. */
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
