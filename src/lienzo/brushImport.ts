/**
 * Importar pinceles de Procreate. Un `.brush` es un zip con `Shape.png` (la punta), `Grain.png` (el grano) y
 * `Brush.archive` (los ajustes); un `.brushset` lleva varios, uno por carpeta. De cada uno se cogen la punta y el grano
 * (los ajustes de Procreate no tienen todos equivalente aquí: se ponen unos razonables y se pueden cambiar después).
 */

export interface ImportedBrush {
  name: string
  tip: HTMLCanvasElement
  grain: HTMLCanvasElement | null
}

/** Lee los archivos de un zip (sin librerías: el navegador descomprime con DecompressionStream). */
export async function readZip(buf: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const v = new DataView(buf)
  const bytes = new Uint8Array(buf)
  // Final del directorio central: se busca desde el final
  let eocd = -1
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 70000); i--)
    if (v.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  if (eocd < 0) throw new Error('No es un archivo de pinceles válido (no es un zip)')
  const count = v.getUint16(eocd + 10, true)
  let p = v.getUint32(eocd + 16, true)
  const out = new Map<string, Uint8Array>()
  const decoder = new TextDecoder()
  for (let n = 0; n < count; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) break
    const method = v.getUint16(p + 10, true)
    const size = v.getUint32(p + 20, true)
    const nameLen = v.getUint16(p + 28, true)
    const extraLen = v.getUint16(p + 30, true)
    const commentLen = v.getUint16(p + 32, true)
    const local = v.getUint32(p + 42, true)
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen))
    p += 46 + nameLen + extraLen + commentLen
    if (name.endsWith('/')) continue
    // Cabecera local: sus propios largos de nombre y extra
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true)
    const data = bytes.subarray(start, start + size)
    if (method === 0) out.set(name, data)
    else if (method === 8) {
      const stream = new Blob([data.slice()]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
      out.set(name, new Uint8Array(await new Response(stream).arrayBuffer()))
    }
  }
  return out
}

/** Pinceles de un archivo `.brushset` o `.brush` de Procreate. */
export async function importProcreate(file: File): Promise<ImportedBrush[]> {
  const files = await readZip(await file.arrayBuffer())
  // Carpetas con su Shape.png (en un .brush suelto, la raíz)
  const folders = new Map<string, { shape?: Uint8Array; grain?: Uint8Array }>()
  for (const [path, data] of files) {
    const m = /^(.*?)(Shape|Grain)\.png$/i.exec(path)
    if (!m) continue
    const f = folders.get(m[1]) ?? {}
    if (m[2].toLowerCase() === 'shape') f.shape = data
    else f.grain = data
    folders.set(m[1], f)
  }
  const base = file.name.replace(/\.(brushset|brush)$/i, '')
  const out: ImportedBrush[] = []
  let n = 1
  for (const [, f] of folders) {
    if (!f.shape) continue
    const shape = await toImage(f.shape)
    const grain = f.grain ? await toImage(f.grain) : null
    out.push({ name: folders.size > 1 ? `${base} ${n++}` : base, tip: tipFromImage(shape), grain: grain ? grainFromImage(grain) : null })
  }
  if (!out.length) throw new Error('No se han encontrado pinceles en el archivo')
  return out
}

async function toImage(data: Uint8Array): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(new Blob([data.slice()], { type: 'image/png' }))
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Imagen del pincel no válida'))
      img.src = url
    })
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

/** Luminancia (0–1) de cada píxel de una imagen, reducida a como mucho `max` px. */
function luminance(img: CanvasImageSource & { width: number; height: number }, max: number) {
  const k = Math.min(1, max / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * k))
  const h = Math.max(1, Math.round(img.height * k))
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.fillStyle = '#000'
  g.fillRect(0, 0, w, h)
  g.drawImage(img, 0, 0, w, h)
  const data = g.getImageData(0, 0, w, h)
  return { c, g, data }
}

/**
 * Punta de pincel a partir de una imagen: lo claro pinta (como en Procreate). Si la imagen es oscura sobre fondo
 * claro (un dibujo normal), se invierte. Queda blanca sobre transparente (se tiñe al pintar).
 */
export function tipFromImage(img: CanvasImageSource & { width: number; height: number }) {
  const { c, g, data } = luminance(img, 256)
  const d = data.data
  const w = c.width
  const h = c.height
  const lum = (i: number) => (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255
  // Fondo: el borde de la imagen
  let border = 0
  let count = 0
  for (let x = 0; x < w; x++)
    for (const y of [0, h - 1]) {
      border += lum((y * w + x) * 4)
      count++
    }
  const invert = border / count > 0.5
  for (let i = 0; i < d.length; i += 4) {
    const l = lum(i)
    d[i] = d[i + 1] = d[i + 2] = 255
    d[i + 3] = Math.round((invert ? 1 - l : l) * 255)
  }
  g.putImageData(data, 0, 0)
  return c
}

/** Grano de pincel a partir de una imagen: lo claro deja pintar y lo oscuro quita pintura. */
export function grainFromImage(img: CanvasImageSource & { width: number; height: number }) {
  const { c, g, data } = luminance(img, 512)
  const d = data.data
  for (let i = 0; i < d.length; i += 4) {
    const l = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255
    d[i] = d[i + 1] = d[i + 2] = 0
    d[i + 3] = Math.round((1 - l) * 255)
  }
  g.putImageData(data, 0, 0)
  return c
}

/** PNG de un canvas, para subirlo. */
export function pngOf(c: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('No se ha podido guardar la imagen'))), 'image/png'))
}
