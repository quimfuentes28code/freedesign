/**
 * Luces y sombras automáticas del lienzo. Se buscan las piezas de las prendas (las zonas cerradas entre las líneas de
 * los mockups) y en cada una se calcula, como en un dibujo de moda con volumen:
 * - sombra en los bordes que se va aclarando hacia el centro (y algo más en el lado contrario a la luz),
 * - un brillo ancho en el centro,
 * - pliegues blandos en las piezas alargadas (mangas, perneras), hacia el codo y el puño,
 * - sombra bajo las costuras y los bordes (capucha, bolsillos, cuello).
 * El color de la sombra y de la luz sale del color de cada pieza. El resultado son dos imágenes (sombras y luces) que
 * van en capas aparte, editables.
 */

export type ShadeStyle = 'suave' | 'marcado' | 'comic'
export type LightFrom = 'izquierda' | 'arriba' | 'derecha'

export interface ShadeOptions {
  style: ShadeStyle
  light: LightFrom
}

/** Píxeles de las prendas (sus colores, con las líneas) y de todo lo pintado (para el color de cada pieza). */
export function autoShade(garment: HTMLCanvasElement, colors: HTMLCanvasElement, o: ShadeOptions) {
  const w = garment.width
  const h = garment.height
  const n = w * h
  const G = garment.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data
  const C = colors.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data

  // 1. Relleno (dentro de la prenda y sin ser línea) y líneas
  const fill = new Uint8Array(n)
  const line = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const k = i * 4
    if (G[k + 3] < 100) continue
    const lum = (G[k] * 0.3 + G[k + 1] * 0.59 + G[k + 2] * 0.11) / 255
    if (lum < 0.22) line[i] = 1
    else fill[i] = 1
  }

  // 2. Piezas: zonas de relleno conectadas (las líneas las separan)
  const label = new Int32Array(n).fill(-1)
  const regions: Region[] = []
  const stack = new Int32Array(n)
  for (let i = 0; i < n; i++) {
    if (!fill[i] || label[i] >= 0) continue
    const id = regions.length
    const r: Region = { count: 0, sx: 0, sy: 0, sxx: 0, syy: 0, sxy: 0, x0: w, y0: h, x1: 0, y1: 0, maxD: 1, cr: 0, cg: 0, cb: 0, major: [0, 1], minor: [1, 0], len: 1, wid: 1, cx: 0, cy: 0 }
    let top = 0
    stack[top++] = i
    label[i] = id
    while (top) {
      const p = stack[--top]
      const x = p % w
      const y = (p - x) / w
      r.count++
      r.sx += x
      r.sy += y
      r.sxx += x * x
      r.syy += y * y
      r.sxy += x * y
      if (x < r.x0) r.x0 = x
      if (x > r.x1) r.x1 = x
      if (y < r.y0) r.y0 = y
      if (y > r.y1) r.y1 = y
      const k = p * 4
      r.cr += C[k]
      r.cg += C[k + 1]
      r.cb += C[k + 2]
      if (x > 0 && fill[p - 1] && label[p - 1] < 0) (label[p - 1] = id), (stack[top++] = p - 1)
      if (x < w - 1 && fill[p + 1] && label[p + 1] < 0) (label[p + 1] = id), (stack[top++] = p + 1)
      if (y > 0 && fill[p - w] && label[p - w] < 0) (label[p - w] = id), (stack[top++] = p - w)
      if (y < h - 1 && fill[p + w] && label[p + w] < 0) (label[p + w] = id), (stack[top++] = p + w)
    }
    regions.push(r)
  }
  // Forma de cada pieza: centro, eje largo y corto (para los pliegues de mangas y perneras)
  for (const r of regions) {
    r.cx = r.sx / r.count
    r.cy = r.sy / r.count
    const vxx = r.sxx / r.count - r.cx * r.cx
    const vyy = r.syy / r.count - r.cy * r.cy
    const vxy = r.sxy / r.count - r.cx * r.cy
    const tr = vxx + vyy
    const det = vxx * vyy - vxy * vxy
    const l1 = tr / 2 + Math.sqrt(Math.max(0, (tr * tr) / 4 - det))
    const l2 = Math.max(1e-6, tr - l1)
    let mx = vxy
    let my = l1 - vxx
    if (Math.abs(mx) + Math.abs(my) < 1e-6) [mx, my] = vxx >= vyy ? [1, 0] : [0, 1]
    const ml = Math.hypot(mx, my)
    r.major = [mx / ml, my / ml]
    // El eje largo siempre hacia abajo (los pliegues van hacia el puño)
    if (r.major[1] < 0) r.major = [-r.major[0], -r.major[1]]
    r.minor = [-r.major[1], r.major[0]]
    r.len = Math.sqrt(l1) * 2
    r.wid = Math.sqrt(l2) * 2
    r.cr /= r.count
    r.cg /= r.count
    r.cb /= r.count
  }

  // 3. Distancia de cada píxel al borde de su pieza (dos pasadas)
  const dist = new Float32Array(n)
  const BIG = 1e9
  for (let i = 0; i < n; i++) dist[i] = fill[i] ? BIG : 0
  const D = Math.SQRT2
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (!fill[i]) continue
      let v = dist[i]
      if (x > 0) v = Math.min(v, dist[i - 1] + 1)
      if (y > 0) {
        v = Math.min(v, dist[i - w] + 1)
        if (x > 0) v = Math.min(v, dist[i - w - 1] + D)
        if (x < w - 1) v = Math.min(v, dist[i - w + 1] + D)
      }
      dist[i] = v
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x
      if (!fill[i]) continue
      let v = dist[i]
      if (x < w - 1) v = Math.min(v, dist[i + 1] + 1)
      if (y < h - 1) {
        v = Math.min(v, dist[i + w] + 1)
        if (x < w - 1) v = Math.min(v, dist[i + w + 1] + D)
        if (x > 0) v = Math.min(v, dist[i + w - 1] + D)
      }
      dist[i] = v
      const l = label[i]
      if (l >= 0 && v > regions[l].maxD) regions[l].maxD = v
    }

  // 4. Sombra que dejan las líneas (bajo costuras, capucha, bolsillos): las líneas difuminadas y desplazadas lejos de la luz
  const ld = LIGHT[o.light]
  const lineCanvas = document.createElement('canvas')
  lineCanvas.width = w
  lineCanvas.height = h
  const lg = lineCanvas.getContext('2d', { willReadFrequently: true })!
  const lineImg = lg.createImageData(w, h)
  for (let i = 0; i < n; i++) lineImg.data[i * 4 + 3] = line[i] ? 255 : 0
  lg.putImageData(lineImg, 0, 0)
  const cast = document.createElement('canvas')
  cast.width = w
  cast.height = h
  const cg = cast.getContext('2d', { willReadFrequently: true })!
  cg.filter = `blur(${o.style === 'comic' ? 2 : 6}px)`
  cg.drawImage(lineCanvas, -ld[0] * 5, -ld[1] * 5)
  const castA = cg.getImageData(0, 0, w, h).data

  // 5. Sombras y luces de cada píxel
  const shadow = new ImageData(w, h)
  const light = new ImageData(w, h)
  const S = shadow.data
  const L = light.data
  const edgeW = o.style === 'suave' ? 0.8 : o.style === 'marcado' ? 0.5 : 0.42
  const tones = regions.map((r) => ({ dark: shadeOf([r.cr, r.cg, r.cb]), lite: lightOf([r.cr, r.cg, r.cb]) }))
  for (let i = 0; i < n; i++) {
    const l = label[i]
    if (l < 0) continue
    const r = regions[l]
    if (r.count < 400) continue
    const x = i % w
    const y = (i - x) / w
    const t = Math.min(1, dist[i] / r.maxD)
    // Borde oscuro que se aclara hacia el centro
    let s = 1 - smooth(0, edgeW, t)
    // Lado contrario a la luz, más oscuro
    const size = Math.max(r.x1 - r.x0, r.y1 - r.y0) / 2 || 1
    const side = ((x - r.cx) * -ld[0] + (y - r.cy) * -ld[1]) / size
    s = s * 0.75 + Math.max(0, side) * 0.25
    // Pliegues blandos en las piezas alargadas (mangas, perneras): hacia el codo y cerca del puño
    if (r.len > r.wid * 2.6) {
      const a = ((x - r.cx) * r.major[0] + (y - r.cy) * r.major[1]) / r.len + 0.5
      const b = ((x - r.cx) * r.minor[0] + (y - r.cy) * r.minor[1]) / r.wid
      for (const [pos, k] of FOLDS) {
        const f = Math.exp(-(((a - pos - b * 0.06) / 0.022) ** 2)) * k
        s += f * (1 - Math.abs(b) * 0.6)
      }
    }
    // Sombra de las líneas cercanas
    s += (castA[i * 4 + 3] / 255) * 0.45
    // Brillo: banda ancha en el centro, del lado de la luz
    let hl = smooth(0.35, 0.95, t) * (1 - Math.max(0, side) * 1.4)
    if (r.len > r.wid * 2.6) {
      const b = ((x - r.cx) * r.minor[0] + (y - r.cy) * r.minor[1]) / r.wid
      hl = Math.max(hl, Math.exp(-((b + 0.12) ** 2) / 0.02) * smooth(0.25, 0.7, t) * 0.8)
    }
    s = Math.min(1, Math.max(0, s))
    hl = Math.min(1, Math.max(0, hl))
    if (o.style === 'comic') {
      s = s > 0.5 ? 0.8 : s > 0.25 ? 0.4 : 0
      hl = hl > 0.55 ? 0.8 : 0
    } else if (o.style === 'marcado') {
      s = Math.pow(s, 0.8)
      hl = Math.pow(hl, 1.4)
    } else hl *= 0.75
    const k = i * 4
    const tone = tones[l]
    S[k] = tone.dark[0]
    S[k + 1] = tone.dark[1]
    S[k + 2] = tone.dark[2]
    S[k + 3] = Math.round(s * 255)
    L[k] = tone.lite[0]
    L[k + 1] = tone.lite[1]
    L[k + 2] = tone.lite[2]
    L[k + 3] = Math.round(hl * 200)
  }
  const out = (img: ImageData) => {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    c.getContext('2d')!.putImageData(img, 0, 0)
    return c
  }
  return { shadow: out(shadow), light: out(light), pieces: regions.filter((r) => r.count >= 400).length }
}

interface Region {
  count: number
  sx: number
  sy: number
  sxx: number
  syy: number
  sxy: number
  x0: number
  y0: number
  x1: number
  y1: number
  maxD: number
  cr: number
  cg: number
  cb: number
  cx: number
  cy: number
  major: [number, number]
  minor: [number, number]
  len: number
  wid: number
}

/** Dirección hacia la que va la luz (de dónde viene a dónde va). */
const LIGHT: Record<LightFrom, [number, number]> = {
  izquierda: [0.6, 0.8],
  arriba: [0, 1],
  derecha: [-0.6, 0.8],
}
/** Pliegues a lo largo de una manga (posición de 0, arriba, a 1, abajo; y fuerza). */
const FOLDS: [number, number][] = [
  [0.5, 0.35],
  [0.57, 0.25],
  [0.82, 0.3],
  [0.9, 0.22],
]

function smooth(a: number, b: number, t: number) {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)))
  return x * x * (3 - 2 * x)
}

/** De rgb a hsl (0–1) y vuelta. */
function hsl([r, g, b]: number[]) {
  r /= 255
  g /= 255
  b /= 255
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  const l = (mx + mn) / 2
  if (mx === mn) return [0, 0, l]
  const d = mx - mn
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
  const hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [hh / 6, s, l]
}
function rgb([hh, s, l]: number[]): [number, number, number] {
  if (!s) return [l * 255, l * 255, l * 255].map(Math.round) as [number, number, number]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const f = (t: number) => {
    t = (t + 1) % 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return [f(hh + 1 / 3), f(hh), f(hh - 1 / 3)].map((v) => Math.round(v * 255)) as [number, number, number]
}
/** Color de la sombra de un color: más oscuro y algo más saturado (va en Multiplicar). */
export function shadeOf(c: number[]): [number, number, number] {
  const [hh, s, l] = hsl(c)
  return rgb([hh, Math.min(1, s * 1.2 + 0.05), Math.max(0.12, l * 0.55)])
}
/** Color de la luz: más claro y un poco menos saturado (va en Trama). */
export function lightOf(c: number[]): [number, number, number] {
  const [hh, s, l] = hsl(c)
  return rgb([hh, s * 0.7, Math.min(0.92, l + (1 - l) * 0.6)])
}
