import { svgToCanvas, type Ink } from './artProduction'

/*
 * Vista previa de bordado: el gráfico pintado con hilo. Cada punto va al hilo más parecido; cada color se rellena con
 * filas de puntadas (relleno tatami: puntadas cortas escalonadas, con su brillo y la marca de la aguja), en un ángulo
 * distinto por color como en un bordado de verdad, y se le da relieve (sombra hacia dentro en los bordes, brillo
 * arriba y sombra del bordado sobre la tela). Sin tela de fondo sale transparente, para ponerlo en una prenda.
 */

export interface EmbroideryOptions {
  /** Ancho de la imagen en píxeles. */
  width: number
  /** Ancho real del gráfico (cm): da el tamaño de las puntadas. */
  widthCm: number
  /** Color de la tela de fondo (null: transparente). */
  fabric: string | null
}

const ANGLES = [45, -45, 0, 90, 22, -68, 67, -22]

const rgbOf = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16)
  return [n >> 16, (n >> 8) & 255, n & 255]
}
const shade = (hex: string, k: number) => {
  const [r, g, b] = rgbOf(hex).map((v) => (k >= 0 ? v + (255 - v) * k : v * (1 + k)))
  return `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)})`
}

export async function embroideryCanvas(svg: Blob, aspect: number, inks: Ink[], o: EmbroideryOptions) {
  const pad = Math.round(o.width * 0.06)
  const W = Math.round(o.width)
  const H = Math.round(o.width * aspect)
  const art = await svgToCanvas(svg, W, H)
  const px = art.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, W, H).data
  const colors = inks.length ? inks.map((k) => rgbOf(k.hex)) : [[40, 40, 40] as [number, number, number]]

  // Cada punto con tinta, al hilo más parecido
  const label = new Int8Array(W * H).fill(-1)
  for (let i = 0; i < W * H; i++) {
    if (px[i * 4 + 3] < 110) continue
    let best = 0
    let bd = Infinity
    for (let k = 0; k < colors.length; k++) {
      const d = (colors[k][0] - px[i * 4]) ** 2 + (colors[k][1] - px[i * 4 + 1]) ** 2 + (colors[k][2] - px[i * 4 + 2]) ** 2
      if (d < bd) (bd = d), (best = k)
    }
    label[i] = best
  }

  const out = document.createElement('canvas')
  out.width = W + 2 * pad
  out.height = H + 2 * pad
  const g = out.getContext('2d')!
  if (o.fabric) paintFabric(g, out.width, out.height, o.fabric)

  // Tamaño de las puntadas: filas cada ~0,45 mm y puntadas de ~3 mm (con un mínimo para que se vean)
  const pxPerCm = W / o.widthCm
  const row = Math.max(2.2, 0.045 * pxPerCm)
  const len = Math.max(row * 3.5, 0.3 * pxPerCm)

  const all = maskCanvas(label, W, H, (l) => l >= 0)
  // Sombra del bordado sobre la tela
  g.save()
  g.filter = `blur(${Math.max(1.5, row)}px)`
  g.globalAlpha = 0.45
  g.drawImage(tint(all, '#000000'), pad + row * 0.6, pad + row * 0.9)
  g.restore()

  for (let k = 0; k < colors.length; k++) {
    const mask = maskCanvas(label, W, H, (l) => l === k)
    const hex = inks[k]?.hex ?? '#282828'
    const tex = stitches(W, H, hex, ANGLES[k % ANGLES.length], row, len)
    const tg = tex.getContext('2d')!
    tg.globalCompositeOperation = 'destination-in'
    tg.drawImage(mask, 0, 0)
    // Relieve: sombra hacia dentro en los bordes (abajo a la derecha) y brillo (arriba a la izquierda)
    tg.globalCompositeOperation = 'source-atop'
    tg.drawImage(innerEdge(mask, row * 1.6, '#000000', row * 0.5), 0, 0)
    tg.globalAlpha = 0.5
    tg.drawImage(innerEdge(mask, row * 1.2, '#ffffff', -row * 0.5), 0, 0)
    g.drawImage(tex, pad, pad)
  }
  return out
}

/** Máscara (blanco opaco donde se cumple) en un canvas. */
function maskCanvas(label: Int8Array, w: number, h: number, test: (l: number) => boolean) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  const img = g.createImageData(w, h)
  for (let i = 0; i < label.length; i++) if (test(label[i])) img.data.set([255, 255, 255, 255], i * 4)
  g.putImageData(img, 0, 0)
  return c
}

/** La máscara pintada de un color. */
function tint(mask: HTMLCanvasElement, color: string) {
  const c = document.createElement('canvas')
  c.width = mask.width
  c.height = mask.height
  const g = c.getContext('2d')!
  g.drawImage(mask, 0, 0)
  g.globalCompositeOperation = 'source-in'
  g.fillStyle = color
  g.fillRect(0, 0, c.width, c.height)
  return c
}

/** Sombra (o luz) hacia dentro junto a los bordes de la máscara, desplazada `shift` en diagonal. */
function innerEdge(mask: HTMLCanvasElement, blur: number, color: string, shift: number) {
  const c = document.createElement('canvas')
  c.width = mask.width
  c.height = mask.height
  const g = c.getContext('2d')!
  // Lo de fuera de la forma, difuminado hacia dentro
  g.fillStyle = color
  g.fillRect(0, 0, c.width, c.height)
  g.globalCompositeOperation = 'destination-out'
  g.drawImage(mask, -shift, -shift)
  const soft = document.createElement('canvas')
  soft.width = c.width
  soft.height = c.height
  const sg = soft.getContext('2d')!
  sg.filter = `blur(${blur}px)`
  sg.globalAlpha = color === '#000000' ? 0.55 : 0.6
  sg.drawImage(c, 0, 0)
  sg.filter = 'none'
  sg.globalAlpha = 1
  sg.globalCompositeOperation = 'destination-in'
  sg.drawImage(mask, 0, 0)
  return soft
}

/** Relleno tatami: filas de puntadas cortas escalonadas, en el ángulo dado, con brillo y la marca de la aguja. */
function stitches(w: number, h: number, hex: string, angle: number, row: number, len: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  g.fillStyle = shade(hex, -0.35)
  g.fillRect(0, 0, w, h)
  g.translate(w / 2, h / 2)
  g.rotate((angle * Math.PI) / 180)
  const R = Math.hypot(w, h) / 2 + len
  const rows = Math.ceil((2 * R) / row)
  // Hilo: cada puntada es un trazo redondeado, más claro en el centro
  const pass = (color: string, width: number, dy: number, inset: number) => {
    g.beginPath()
    for (let r = 0; r < rows; r++) {
      const y = -R + r * row + dy
      // Escalonado: cada fila empieza un tercio de puntada más allá
      const off = ((r % 3) * len) / 3
      for (let x = -R - off; x < R; x += len) {
        g.moveTo(x + inset, y)
        g.lineTo(x + len - inset, y)
      }
    }
    g.strokeStyle = color
    g.lineWidth = width
    g.lineCap = 'round'
    g.stroke()
  }
  pass(shade(hex, -0.08), row * 0.92, 0, row * 0.35)
  pass(shade(hex, 0.12), row * 0.5, -row * 0.12, row * 0.6)
  pass(shade(hex, 0.38), row * 0.18, -row * 0.22, len * 0.3)
  // Sin el giro: lo siguiente (recortar a la forma) va en las coordenadas de la imagen
  g.setTransform(1, 0, 0, 1, 0, 0)
  return c
}

/** Tela de fondo: el color con un tejido muy suave. */
function paintFabric(g: CanvasRenderingContext2D, w: number, h: number, hex: string) {
  g.fillStyle = hex
  g.fillRect(0, 0, w, h)
  g.save()
  g.globalAlpha = 0.07
  g.strokeStyle = shade(hex, rgbOf(hex).reduce((a, b) => a + b, 0) > 380 ? -0.6 : 0.6)
  g.lineWidth = 1
  g.beginPath()
  for (let x = -h; x < w; x += 3) {
    g.moveTo(x, 0)
    g.lineTo(x + h, h)
  }
  g.stroke()
  g.restore()
}
