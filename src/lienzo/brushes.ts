/**
 * Pinceles del lienzo. Cada trazo se pinta estampando la punta del pincel a lo largo del recorrido (como Procreate):
 * su tamaño y opacidad siguen la presión del lápiz, el estabilizador quita el temblor y el grano del papel da textura.
 * El trazo se pinta en un canvas aparte y se funde con la capa al soltar (así un rotulador no se acumula en sí mismo).
 */

export interface BrushPreset {
  id: string
  name: string
  group: 'Bocetar' | 'Entintar' | 'Pintar' | 'Aerógrafo' | 'Texturas'
  /** Tamaño por defecto (px del lienzo) y opacidad por defecto. */
  size: number
  opacity: number
  /** Lo que pinta cada estampado (0–1): bajo = se va acumulando (aerógrafo). */
  flow: number
  /** Distancia entre estampados, en fracción del tamaño. */
  spacing: number
  /** Dureza del borde: 1 nítido, 0 muy difuminado. */
  hardness: number
  /** Grano del papel (0–1): la textura que se queda fija en el papel, como el lápiz sobre papel con grano. */
  grain: number
  /** Cuánto cambia el tamaño con la presión (0 nada, 1 de 0 al tamaño). */
  pressureSize: number
  /** Cuánto cambia la opacidad con la presión. */
  pressureOpacity: number
  /** Afinado al empezar y al acabar el trazo (en px de recorrido). */
  taper: number
  /** Estabilizador por defecto (0–1). */
  streamline: number
  /** Punta: redonda o plana (de pincel o rotulador biselado, girada según la dirección). */
  tip: 'round' | 'flat'
  /** Dispersión de los estampados (para tizas y salpicados), en fracción del tamaño. */
  scatter: number
}

export const BRUSHES: BrushPreset[] = [
  { id: 'hb', name: 'Lápiz HB', group: 'Bocetar', size: 3, opacity: 0.85, flow: 0.7, spacing: 0.12, hardness: 0.7, grain: 0.55, pressureSize: 0.5, pressureOpacity: 0.8, taper: 0, streamline: 0.15, tip: 'round', scatter: 0 },
  { id: '6b', name: 'Lápiz 6B', group: 'Bocetar', size: 9, opacity: 0.9, flow: 0.6, spacing: 0.1, hardness: 0.55, grain: 0.75, pressureSize: 0.45, pressureOpacity: 0.85, taper: 0, streamline: 0.1, tip: 'round', scatter: 0 },
  { id: 'tecnica', name: 'Plumilla técnica', group: 'Entintar', size: 3, opacity: 1, flow: 1, spacing: 0.05, hardness: 1, grain: 0, pressureSize: 0, pressureOpacity: 0, taper: 0, streamline: 0.55, tip: 'round', scatter: 0 },
  { id: 'tinta', name: 'Tinta de estudio', group: 'Entintar', size: 8, opacity: 1, flow: 1, spacing: 0.04, hardness: 0.95, grain: 0, pressureSize: 0.9, pressureOpacity: 0, taper: 40, streamline: 0.5, tip: 'round', scatter: 0 },
  { id: 'gel', name: 'Bolígrafo de gel', group: 'Entintar', size: 4, opacity: 1, flow: 1, spacing: 0.05, hardness: 0.9, grain: 0.1, pressureSize: 0.3, pressureOpacity: 0, taper: 12, streamline: 0.4, tip: 'round', scatter: 0 },
  { id: 'rotulador', name: 'Rotulador', group: 'Pintar', size: 18, opacity: 0.75, flow: 1, spacing: 0.06, hardness: 0.92, grain: 0, pressureSize: 0.15, pressureOpacity: 0, taper: 0, streamline: 0.3, tip: 'flat', scatter: 0 },
  { id: 'gouache', name: 'Gouache', group: 'Pintar', size: 30, opacity: 1, flow: 0.9, spacing: 0.06, hardness: 0.8, grain: 0.3, pressureSize: 0.5, pressureOpacity: 0.3, taper: 0, streamline: 0.2, tip: 'flat', scatter: 0 },
  { id: 'redondo', name: 'Pincel redondo', group: 'Pintar', size: 22, opacity: 1, flow: 0.85, spacing: 0.05, hardness: 0.75, grain: 0.15, pressureSize: 0.75, pressureOpacity: 0.2, taper: 20, streamline: 0.25, tip: 'round', scatter: 0 },
  { id: 'aero', name: 'Aerógrafo suave', group: 'Aerógrafo', size: 90, opacity: 1, flow: 0.06, spacing: 0.08, hardness: 0, grain: 0, pressureSize: 0, pressureOpacity: 1, taper: 0, streamline: 0.1, tip: 'round', scatter: 0 },
  { id: 'aeroduro', name: 'Aerógrafo medio', group: 'Aerógrafo', size: 40, opacity: 1, flow: 0.15, spacing: 0.08, hardness: 0.45, grain: 0, pressureSize: 0, pressureOpacity: 1, taper: 0, streamline: 0.1, tip: 'round', scatter: 0 },
  { id: 'sombra', name: 'Sombra de tela', group: 'Aerógrafo', size: 60, opacity: 0.5, flow: 0.08, spacing: 0.08, hardness: 0.1, grain: 0.2, pressureSize: 0.3, pressureOpacity: 1, taper: 0, streamline: 0.3, tip: 'round', scatter: 0 },
  { id: 'carbon', name: 'Carboncillo', group: 'Texturas', size: 22, opacity: 0.9, flow: 0.5, spacing: 0.1, hardness: 0.5, grain: 0.85, pressureSize: 0.4, pressureOpacity: 0.6, taper: 0, streamline: 0.1, tip: 'flat', scatter: 0.05 },
  { id: 'desgaste', name: 'Desgaste', group: 'Texturas', size: 50, opacity: 0.8, flow: 0.35, spacing: 0.15, hardness: 0.6, grain: 0.95, pressureSize: 0.2, pressureOpacity: 0.7, taper: 0, streamline: 0, tip: 'round', scatter: 0.35 },
  { id: 'salpicado', name: 'Salpicado', group: 'Texturas', size: 40, opacity: 1, flow: 0.9, spacing: 0.6, hardness: 0.9, grain: 0, pressureSize: 0.3, pressureOpacity: 0, taper: 0, streamline: 0, tip: 'round', scatter: 1.2 },
]

/** Puntas ya dibujadas (por dureza y forma), en blanco sobre transparente: se tiñen al estampar. */
const tips = new Map<string, HTMLCanvasElement>()
const TIP = 128
function tipCanvas(hardness: number, tip: 'round' | 'flat', speck: boolean) {
  const key = `${Math.round(hardness * 20)}-${tip}-${speck}`
  let c = tips.get(key)
  if (c) return c
  c = document.createElement('canvas')
  c.width = c.height = TIP
  const g = c.getContext('2d')!
  const r = TIP / 2
  if (speck) {
    // Punta de salpicado: un puñado de gotitas
    g.fillStyle = '#fff'
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2
      const d = Math.random() ** 0.6 * r * 0.9
      g.beginPath()
      g.arc(r + Math.cos(a) * d, r + Math.sin(a) * d, 2 + Math.random() * 7, 0, Math.PI * 2)
      g.fill()
    }
  } else {
    const grad = g.createRadialGradient(r, r, 0, r, r, r)
    const solid = Math.min(0.98, Math.max(0, hardness))
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(solid, 'rgba(255,255,255,1)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    if (tip === 'flat') {
      g.save()
      g.translate(r, r)
      g.scale(1, 0.32)
      g.translate(-r, -r)
      g.beginPath()
      g.arc(r, r, r, 0, Math.PI * 2)
      g.fill()
      g.restore()
    } else {
      g.beginPath()
      g.arc(r, r, r, 0, Math.PI * 2)
      g.fill()
    }
  }
  tips.set(key, c)
  return c
}

/** Punta teñida de un color (se rehace al cambiar de color o de pincel). */
let tinted: { key: string; canvas: HTMLCanvasElement } | null = null
function tintedTip(b: BrushPreset, color: string) {
  const key = `${b.id}-${b.hardness}-${b.tip}-${color}`
  if (tinted?.key === key) return tinted.canvas
  const src = tipCanvas(b.hardness, b.tip, b.id === 'salpicado')
  const c = document.createElement('canvas')
  c.width = c.height = TIP
  const g = c.getContext('2d')!
  g.drawImage(src, 0, 0)
  g.globalCompositeOperation = 'source-in'
  g.fillStyle = color
  g.fillRect(0, 0, TIP, TIP)
  tinted = { key, canvas: c }
  return c
}

/** Grano del papel: ruido que se repite, fijo al lienzo (no se mueve con el trazo). */
let grainPattern: HTMLCanvasElement | null = null
export function paperGrain() {
  if (grainPattern) return grainPattern
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  const img = g.createImageData(256, 256)
  // Ruido suave a dos escalas (grano de papel, no píxeles sueltos)
  const coarse = new Float32Array(32 * 32).map(() => Math.random())
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++) {
      const cx = (x / 8) | 0
      const cy = (y / 8) | 0
      const fx = (x % 8) / 8
      const fy = (y % 8) / 8
      const at = (i: number, j: number) => coarse[((j & 31) * 32 + (i & 31)) | 0]
      const v = (at(cx, cy) * (1 - fx) + at(cx + 1, cy) * fx) * (1 - fy) + (at(cx, cy + 1) * (1 - fx) + at(cx + 1, cy + 1) * fx) * fy
      const n = v * 0.6 + Math.random() * 0.4
      const k = (y * 256 + x) * 4
      img.data[k] = img.data[k + 1] = img.data[k + 2] = 0
      img.data[k + 3] = Math.round(n * 255)
    }
  g.putImageData(img, 0, 0)
  grainPattern = c
  return c
}

/**
 * Simetría del trazo: reflejo vertical u horizontal, cuatro lados, radial (como un caleidoscopio: giros y reflejos) o
 * giratoria (solo giros, como una flor).
 */
export type Symmetry = 'none' | 'vertical' | 'horizontal' | 'cuadrante' | 'radial' | 'giratoria'

/** Las copias de cada punto: matrices 2×2 [a, b, c, d] alrededor del eje (x' = a·x + b·y, y' = c·x + d·y). */
export function symmetryMatrices(symmetry: Symmetry, count = 6): [number, number, number, number][] {
  const I: [number, number, number, number] = [1, 0, 0, 1]
  if (symmetry === 'vertical') return [I, [-1, 0, 0, 1]]
  if (symmetry === 'horizontal') return [I, [1, 0, 0, -1]]
  if (symmetry === 'cuadrante') return [I, [-1, 0, 0, 1], [1, 0, 0, -1], [-1, 0, 0, -1]]
  if (symmetry === 'radial' || symmetry === 'giratoria') {
    const n = Math.max(2, Math.min(16, Math.round(count)))
    const out: [number, number, number, number][] = []
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2
      const c = Math.cos(a)
      const s = Math.sin(a)
      out.push([c, -s, s, c])
      // Radial: además, cada giro reflejado (como un caleidoscopio)
      if (symmetry === 'radial') out.push([-c, -s, -s, c])
    }
    return out
  }
  return [I]
}

export interface StrokeOptions {
  brush: BrushPreset
  color: string
  /** Tamaño y opacidad elegidos (los del pincel cambian con el deslizador). */
  size: number
  opacity: number
  streamline: number
  symmetry: Symmetry
  /** Copias en la simetría radial y giratoria. */
  symmetryCount?: number
  /** Centro de la simetría (se puede mover). */
  axis: { x: number; y: number }
}

export interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

/**
 * Un trazo en curso. Recibe los puntos del puntero (con su presión) y estampa en `target`. Lleva la cuenta de la zona
 * pintada (`dirty`) para fundir y deshacer solo esa parte.
 */
export class Stroke {
  private last: { x: number; y: number; p: number } | null = null
  private smooth: { x: number; y: number } | null = null
  private travelled = 0
  private leftover = 0
  dirty: Rect | null = null
  /** Zona pintada desde la última vez que se miró (para repintar solo eso en cada fotograma). */
  frame: Rect | null = null
  private readonly ctx: CanvasRenderingContext2D
  private readonly mats: [number, number, number, number][]
  constructor(
    private readonly target: HTMLCanvasElement,
    private readonly o: StrokeOptions,
  ) {
    this.ctx = target.getContext('2d')!
    this.mats = symmetryMatrices(o.symmetry, o.symmetryCount)
  }

  /** Añade un punto del puntero (x, y en px del lienzo; presión 0–1). */
  add(x: number, y: number, pressure: number) {
    // Estabilizador: el punto pintado persigue al puntero con algo de retraso (quita el temblor)
    const k = 1 - Math.min(0.92, this.o.streamline * 0.92)
    if (!this.smooth) this.smooth = { x, y }
    else {
      this.smooth.x += (x - this.smooth.x) * k
      this.smooth.y += (y - this.smooth.y) * k
    }
    const p = { x: this.smooth.x, y: this.smooth.y, p: pressure }
    if (!this.last) {
      this.last = p
      this.stamp(p.x, p.y, p.p, 0)
      return
    }
    this.segment(this.last, p)
    this.last = p
  }

  /** Remata el trazo (el estabilizador deja el final un poco por detrás del puntero: se completa hasta él). */
  finish(x: number, y: number, pressure: number) {
    if (this.last && this.o.streamline > 0) this.segment(this.last, { x, y, p: pressure * 0.6 })
  }

  private segment(a: { x: number; y: number; p: number }, b: { x: number; y: number; p: number }) {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy)
    if (len < 0.01) return
    const angle = Math.atan2(dy, dx)
    const step = Math.max(0.5, this.o.size * this.o.brush.spacing)
    let t = this.leftover
    while (t <= len) {
      const f = t / len
      this.stamp(a.x + dx * f, a.y + dy * f, a.p + (b.p - a.p) * f, angle)
      t += step
    }
    this.leftover = t - len
    this.travelled += len
  }

  private stamp(x: number, y: number, pressure: number, angle: number) {
    const b = this.o.brush
    const pr = Math.min(1, Math.max(0.02, pressure))
    // Afinado al empezar: el trazo crece en los primeros px
    const taper = b.taper ? Math.min(1, 0.25 + (this.travelled / b.taper) * 0.75) : 1
    const size = Math.max(0.6, this.o.size * (1 - b.pressureSize + b.pressureSize * pr) * taper)
    const alpha = b.flow * (1 - b.pressureOpacity + b.pressureOpacity * pr)
    const tip = tintedTip(b, this.o.color)
    const { axis } = this.o
    const dx0 = x - axis.x
    const dy0 = y - axis.y
    const ca = Math.cos(angle)
    const sa = Math.sin(angle)
    const g = this.ctx
    g.globalAlpha = Math.min(1, alpha)
    for (const [a, b2, c, d] of this.mats) {
      let px = axis.x + a * dx0 + b2 * dy0
      let py = axis.y + c * dx0 + d * dy0
      if (b.scatter) {
        px += (Math.random() - 0.5) * size * b.scatter * 2
        py += (Math.random() - 0.5) * size * b.scatter * 2
      }
      g.save()
      g.translate(px, py)
      // La punta plana sigue al trazo copiado (girado o reflejado)
      if (b.tip === 'flat') g.rotate(Math.atan2(c * ca + d * sa, a * ca + b2 * sa) + Math.PI / 2 - 0.35)
      else if (b.id === 'salpicado') g.rotate(Math.random() * Math.PI * 2)
      g.drawImage(tip, -size / 2, -size / 2, size, size)
      g.restore()
      this.grow(px - size, py - size, px + size, py + size)
    }
    g.globalAlpha = 1
  }

  private grow(x0: number, y0: number, x1: number, y1: number) {
    const d = this.dirty
    const w = this.target.width
    const h = this.target.height
    const r = { x0: Math.max(0, Math.floor(x0)), y0: Math.max(0, Math.floor(y0)), x1: Math.min(w, Math.ceil(x1)), y1: Math.min(h, Math.ceil(y1)) }
    this.dirty = d ? union(d, r) : r
    this.frame = this.frame ? union(this.frame, r) : r
  }

  /** Zona pintada desde la última llamada (y la olvida). */
  takeFrame() {
    const f = this.frame
    this.frame = null
    return f
  }
}

/** Rectángulo que abarca los dos. */
export function union(a: Rect, b: Rect): Rect {
  return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }
}
